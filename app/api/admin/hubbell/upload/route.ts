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
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../../../db/index';
import { verifyHubbellUploadToken } from '../../../../../src/lib/service-auth';
import { buildHubbellKey, putHubbellPdf } from '../../../../../src/lib/hubbell/r2';
import { matchDocumentToSos } from '../../../../../src/lib/hubbell/document-matcher';
import { normalizeDocNumber } from '../../../../../src/lib/hubbell/po-number-parser';

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
};

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseNumber(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

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
  const r2Key = buildHubbellKey({ docType, docNumber });
  try {
    await putHubbellPdf(r2Key, bytes);
  } catch (err) {
    console.error('[hubbell upload] R2 put failed', err);
    return NextResponse.json({ error: 'PDF storage failed' }, { status: 502 });
  }

  // Insert document row.
  const [doc] = await db
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
      extractedTotal: parseNumber(metadata.total),
      extractedNeedBy: parseDate(metadata.need_by ?? null) as unknown as string | null,
      lineItems: (metadata.line_items as object) ?? null,
      matchStatus: 'unmatched',
    })
    .returning({ id: schema.hubbellDocuments.id });

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
    console.error('[hubbell upload] matcher failed', err);
  }

  return NextResponse.json({
    status: 'inserted',
    id: doc.id,
    match_status: matchStatus,
    attached_sos: attachedSos,
  });
}
