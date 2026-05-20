// POST /api/admin/hubbell/documents/rematch
//
// Re-runs the SO matcher across a batch of Hubbell documents and
// auto-attaches any new po_number_split (confidence 100) matches that
// weren't already attached. Use after a metadata backfill, when
// extracted_address values may have improved enough to surface matches
// that didn't exist at upload time.
//
// Auth: HUBBELL_UPLOAD_TOKEN bearer (same as /upload + /metadata-bulk).
//
// Body (optional):
//   {
//     limit?: number   // default 100, max 500
//     offset?: number  // default 0
//     only_unmatched?: boolean   // default true — skip already auto_matched/confirmed
//     doc_ids?: string[]         // optional explicit list (overrides limit/offset/only_unmatched)
//   }
//
// Response:
//   {
//     processed: number,
//     newly_attached: number,         // docs that got a new junction row
//     attached_sos_total: number,     // total SO attachments inserted
//     errors: [{ document_id, error }]
//   }

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql } from 'drizzle-orm';
import { getDb, schema } from '../../../../../../db/index';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { matchDocumentToSos } from '../../../../../../src/lib/hubbell/document-matcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_LIMIT = 500;

type DocRow = {
  id: string;
  doc_number: string;
  extracted_address: string | null;
  extracted_city: string | null;
  extracted_state: string | null;
  extracted_zip: string | null;
  scrape_cust_code: string | null;
  scrape_seq_num: string | null;
  scrape_match_ratio: string | null;
  match_status: string;
};

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let body: { limit?: unknown; offset?: unknown; only_unmatched?: unknown; doc_ids?: unknown } = {};
  try {
    if (req.headers.get('content-length') && Number(req.headers.get('content-length')) > 0) {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const onlyUnmatched = body.only_unmatched === undefined ? true : Boolean(body.only_unmatched);
  const limitRaw = typeof body.limit === 'number' ? body.limit : Number(body.limit ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT) : 100;
  const offsetRaw = typeof body.offset === 'number' ? body.offset : Number(body.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;

  const docIds = Array.isArray(body.doc_ids)
    ? (body.doc_ids as unknown[]).filter((v) => typeof v === 'string' && v.length > 0).map((v) => v as string)
    : null;

  const db = getDb();

  // Pull the candidate docs. When `doc_ids` is supplied we use it verbatim;
  // otherwise paginate over (only_unmatched ? match_status = 'unmatched' : all).
  // Don't filter on extracted_address — matchDocumentToSos still produces
  // exact po_number_split matches using doc_number alone (Signal A), so docs
  // without an extracted address still benefit from a rematch when SO
  // po_number values change.
  const rowsResult = docIds && docIds.length > 0
    ? await db.execute<DocRow>(dsql`
        SELECT id::text AS id, doc_number, extracted_address, extracted_city,
               extracted_state, extracted_zip, scrape_cust_code, scrape_seq_num,
               scrape_match_ratio::text AS scrape_match_ratio, match_status
        FROM bids.hubbell_documents
        WHERE id::text = ANY(${docIds})
      `)
    : await db.execute<DocRow>(dsql`
        SELECT id::text AS id, doc_number, extracted_address, extracted_city,
               extracted_state, extracted_zip, scrape_cust_code, scrape_seq_num,
               scrape_match_ratio::text AS scrape_match_ratio, match_status
        FROM bids.hubbell_documents
        WHERE ${onlyUnmatched ? dsql`match_status = 'unmatched'` : dsql`TRUE`}
        ORDER BY received_at DESC, id
        LIMIT ${limit} OFFSET ${offset}
      `);
  const rows = (rowsResult as unknown as { rows: DocRow[] }).rows ?? [];

  let processed = 0;
  let newlyAttached = 0;
  let attachedSosTotal = 0;
  const errors: { document_id: string; error: string }[] = [];

  for (const r of rows) {
    processed++;
    try {
      const matches = await matchDocumentToSos({
        docNumber: r.doc_number,
        address: {
          address: r.extracted_address,
          city: r.extracted_city,
          state: r.extracted_state,
          zip: r.extracted_zip,
        },
        scrapeHint: {
          custCode: r.scrape_cust_code,
          seqNum: r.scrape_seq_num,
          matchRatio: r.scrape_match_ratio !== null ? Number(r.scrape_match_ratio) : null,
        },
      });

      // Only auto-attach po_number_split — same threshold /upload uses.
      const autoMatches = matches.filter((m) => m.matchSource === 'po_number_split');
      if (autoMatches.length === 0) continue;

      // Skip junction rows already present for this doc — idempotent re-runs.
      const existing = await db
        .select({ soId: schema.hubbellDocumentSos.soId })
        .from(schema.hubbellDocumentSos)
        .where(eq(schema.hubbellDocumentSos.documentId, r.id));
      const existingIds = new Set(existing.map((e) => e.soId));
      const newRows = autoMatches.filter((m) => !existingIds.has(m.soId));
      if (newRows.length === 0) continue;

      await db.insert(schema.hubbellDocumentSos).values(
        newRows.map((m) => ({
          documentId: r.id,
          soId: m.soId,
          custCode: m.custCode,
          matchSource: 'po_number_split' as const,
          confidence: m.confidence,
          matchReasons: m.matchReasons,
        }))
      );
      newlyAttached++;
      attachedSosTotal += newRows.length;

      // Promote match_status if it was still 'unmatched'.
      if (r.match_status === 'unmatched') {
        await db
          .update(schema.hubbellDocuments)
          .set({ matchStatus: 'auto_matched', updatedAt: new Date() })
          .where(eq(schema.hubbellDocuments.id, r.id));
      }
    } catch (e) {
      errors.push({
        document_id: r.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    processed,
    newly_attached: newlyAttached,
    attached_sos_total: attachedSosTotal,
    errors,
  });
}
