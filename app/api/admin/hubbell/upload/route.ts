// POST /api/admin/hubbell/upload
// Service-token endpoint called by the local Python scraper for every PO/WO
// PDF it pulls from the Hubbell portal. Idempotent via sha256(source_hash).
//
// Auth: Authorization: Bearer $HUBBELL_UPLOAD_TOKEN — NOT a user session.
// Body: multipart/form-data with fields:
//   doc_type      — 'po' | 'wo'
//   doc_number    — string (canonical Hubbell PO# / WO#)
//   check_number  — string | '' (present for paid docs)
//   source_run_id — string (run tag from local scraper, e.g. 'run_2026_05_18_06_00')
//   metadata      — JSON string with extracted fields + line_items
//   pdf           — file (application/pdf)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { eq, sql as dsql } from 'drizzle-orm';
import { getDb, schema } from '../../../../../db/index';
import { verifyHubbellUploadToken } from '../../../../../src/lib/service-auth';
import { buildHubbellKey, putHubbellPdf } from '../../../../../src/lib/hubbell/r2';
import { matchDocumentToSos } from '../../../../../src/lib/hubbell/document-matcher';
import { normalizeDocNumber } from '../../../../../src/lib/hubbell/po-number-parser';
import { refreshPaymentRollupForDoc } from '../../../../../src/lib/hubbell/payment-rollup';
import { normalizeLineItems, parseNumberToString, parseDateOrNull } from '../../../../../src/lib/hubbell/metadata-normalize';
import { log } from '../../../../../src/lib/log';

export const runtime = 'nodejs';
// 10 MB cap — large Hubbell PDFs would be exceptional
export const maxDuration = 30;

type Metadata = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  total?: number | string | null;
  need_by?: string | null;
  line_items?: unknown;
  // Scrape hints from hubbell_daily_fetch.py best_job_match() — when present
  // and ratio is high enough, the matcher uses these instead of fuzzing again.
  erp_cust_code?: string | null;
  erp_seq_num?: string | number | null;
  match_ratio?: number | string | null;
  // Job context from the Hubbell portal scrape (development + house + lot +
  // model). Optional; persisted to the document row for inbox display.
  dev_code?: string | null;
  dev_name?: string | null;
  house_number?: string | null;
  block_lot?: string | null;
  model_elevation?: string | null;
};


export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const rawDocType = String(form.get('doc_type') ?? '').toLowerCase().trim();
  const docType = rawDocType === 'po' || rawDocType === 'wo' ? rawDocType : null;
  const rawDocNumber = String(form.get('doc_number') ?? '').trim();
  const sourceRunId = String(form.get('source_run_id') ?? '').trim();
  const checkNumberRaw = String(form.get('check_number') ?? '').trim();
  const checkNumber = checkNumberRaw.length > 0 ? checkNumberRaw : null;
  const metadataRaw = form.get('metadata');
  const pdf = form.get('pdf');

  if (!docType) {
    return NextResponse.json({ error: 'doc_type must be "po" or "wo"' }, { status: 400 });
  }
  if (!rawDocNumber) {
    return NextResponse.json({ error: 'doc_number is required' }, { status: 400 });
  }
  if (!sourceRunId) {
    return NextResponse.json({ error: 'source_run_id is required' }, { status: 400 });
  }
  if (!(pdf instanceof File)) {
    return NextResponse.json({ error: 'pdf file part is required' }, { status: 400 });
  }

  let metadata: Metadata = {};
  if (typeof metadataRaw === 'string' && metadataRaw.length > 0) {
    try {
      metadata = JSON.parse(metadataRaw) as Metadata;
    } catch {
      return NextResponse.json({ error: 'metadata must be valid JSON' }, { status: 400 });
    }
  }

  const docNumber = normalizeDocNumber(rawDocNumber);
  const arrayBuf = await pdf.arrayBuffer();
  const bytes = Buffer.from(arrayBuf);
  const sourceHash = crypto.createHash('sha256').update(bytes).digest('hex');

  const db = getDb();

  // Idempotent: if we've seen these exact bytes before, return the existing row.
  const existing = await db
    .select({
      id: schema.hubbellDocuments.id,
      matchStatus: schema.hubbellDocuments.matchStatus,
    })
    .from(schema.hubbellDocuments)
    .where(eq(schema.hubbellDocuments.sourceHash, sourceHash))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({
      status: 'duplicate',
      id: existing[0].id,
      match_status: existing[0].matchStatus,
    });
  }

  // Upload PDF to R2 first — if this fails we want to bail before writing the row.
  const r2Key = buildHubbellKey({ docType, docNumber, sourceHash });
  try {
    await putHubbellPdf(r2Key, bytes);
  } catch (err) {
    log.error('hubbell.upload.r2_put_failed', err, { r2Key, docType, docNumber });
    return NextResponse.json({ error: 'PDF storage failed' }, { status: 502 });
  }

  // Normalize scrape hints from the local agent (uploader.py).
  const scrapeCustCode =
    typeof metadata.erp_cust_code === 'string' && metadata.erp_cust_code.trim()
      ? metadata.erp_cust_code.trim().toUpperCase()
      : null;
  const scrapeSeqNum =
    metadata.erp_seq_num !== null && metadata.erp_seq_num !== undefined && String(metadata.erp_seq_num).trim() !== ''
      ? String(metadata.erp_seq_num).trim()
      : null;
  const scrapeMatchRatioNum =
    metadata.match_ratio !== null && metadata.match_ratio !== undefined && metadata.match_ratio !== ''
      ? Number(metadata.match_ratio)
      : null;
  const scrapeMatchRatio =
    scrapeMatchRatioNum !== null && Number.isFinite(scrapeMatchRatioNum)
      ? scrapeMatchRatioNum.toFixed(3)
      : null;

  // Insert document row. Race-safe: ON CONFLICT (source_hash) DO NOTHING means
  // a concurrent uploader for the same bytes returns an empty `inserted` set,
  // and we then SELECT the row that won the race and return as duplicate.
  const inserted = await db
    .insert(schema.hubbellDocuments)
    .values({
      docType,
      docNumber,
      checkNumber,
      r2Key,
      sourceRunId,
      sourceHash,
      extractedAddress: metadata.address ?? null,
      extractedCity: metadata.city ?? null,
      extractedState: metadata.state ?? null,
      extractedZip: metadata.zip ?? null,
      extractedTotal: parseNumberToString(metadata.total),
      extractedNeedBy: parseDateOrNull(metadata.need_by ?? null),
      lineItems: normalizeLineItems(metadata.line_items) as unknown as object | null,
      scrapeCustCode,
      scrapeSeqNum,
      scrapeMatchRatio,
      devCode:        metadata.dev_code        ?? null,
      devName:        metadata.dev_name        ?? null,
      houseNumber:    metadata.house_number    ?? null,
      blockLot:       metadata.block_lot       ?? null,
      modelElevation: metadata.model_elevation ?? null,
      matchStatus: 'unmatched',
    })
    .onConflictDoNothing({ target: schema.hubbellDocuments.sourceHash })
    .returning({ id: schema.hubbellDocuments.id });

  if (inserted.length === 0) {
    // Lost the race — another concurrent upload already wrote this hash.
    const winner = await db
      .select({
        id: schema.hubbellDocuments.id,
        matchStatus: schema.hubbellDocuments.matchStatus,
      })
      .from(schema.hubbellDocuments)
      .where(eq(schema.hubbellDocuments.sourceHash, sourceHash))
      .limit(1);
    if (winner.length > 0) {
      return NextResponse.json({
        status: 'duplicate',
        id: winner[0].id,
        match_status: winner[0].matchStatus,
      });
    }
    // Should never happen — conflict fired but no row exists. Surface clearly.
    return NextResponse.json({ error: 'Insert race resolved unexpectedly' }, { status: 500 });
  }
  const doc = inserted[0];

  // Refresh this doc's payment rollups from any existing check_lines that
  // match (doc_type, doc_number). Check lines can land before the PDF (via
  // the daily check ingest) and just sit until the doc arrives. No explicit
  // link step needed — the rollup query joins on (doc_type, doc_number).
  try {
    await refreshPaymentRollupForDoc(db, doc.id);
  } catch (err) {
    log.error('hubbell.upload.payment_rollup_failed', err, { docType, docNumber });
  }

  // Run the matcher.
  let attachedSos: Array<{ so_id: number; cust_code: string | null; match_source: string; confidence: number }> = [];
  let matchStatus: 'unmatched' | 'auto_matched' = 'unmatched';
  try {
    const matches = await matchDocumentToSos({
      docNumber,
      address: {
        address: metadata.address ?? null,
        city: metadata.city ?? null,
        state: metadata.state ?? null,
        zip: metadata.zip ?? null,
      },
      scrapeHint: {
        custCode: scrapeCustCode,
        seqNum: scrapeSeqNum,
        matchRatio: scrapeMatchRatioNum,
      },
    });
    const autoMatches = matches.filter((m) => m.matchSource === 'po_number_split');
    if (autoMatches.length > 0) {
      await db.insert(schema.hubbellDocumentSos).values(
        autoMatches.map((m) => ({
          documentId: doc.id,
          soId: m.soId,
          custCode: m.custCode,
          matchSource: 'po_number_split' as const,
          confidence: m.confidence,
          matchReasons: m.matchReasons,
        }))
      );
      matchStatus = 'auto_matched';
      await db
        .update(schema.hubbellDocuments)
        .set({ matchStatus, updatedAt: new Date() })
        .where(eq(schema.hubbellDocuments.id, doc.id));
      attachedSos = autoMatches.map((m) => ({
        so_id: m.soId,
        cust_code: m.custCode,
        match_source: 'po_number_split',
        confidence: m.confidence,
      }));
    }
  } catch (err) {
    // Matcher failure must not block ingest — the document is already stored.
    log.error('hubbell.upload.matcher_failed', err, { docType, docNumber });
  }

  return NextResponse.json({
    status: 'inserted',
    id: doc.id,
    match_status: matchStatus,
    attached_sos: attachedSos,
  });
}
