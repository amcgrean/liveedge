// POST /api/admin/hubbell/documents/suggest-matches
//
// Batch-suggester: walks bids.hubbell_documents (default: only unmatched ones
// with no rows in hubbell_document_sos), runs the same matcher used by the
// upload route, and persists every returned candidate into
// bids.hubbell_document_suggestions for human review.
//
// Reviewers then accept/reject from /admin/hubbell/suggestions. On accept, a
// row is copied into hubbell_document_sos (the authoritative attach table).
//
// Auth: Bearer $HUBBELL_UPLOAD_TOKEN (service-token, runs from CLI or cron)
// Body:
//   {
//     "limit": 200,             // docs to process this call (default 200, max 500)
//     "offset": 0,              // for paging through the unmatched set
//     "only_unmatched": true,   // skip docs that already have any hubbell_document_sos row
//     "min_confidence": 30,     // drop candidates below this (default 30)
//     "doc_ids": ["uuid",...]   // optional: process only these doc ids (overrides paging)
//   }
//
// Response: { processed, candidates_inserted, candidates_skipped_existing, run_id }
//
// Note: this populates SUGGESTIONS only. It does not call the existing
// matcher's auto-attach side-effect (po_number_split). To auto-attach
// confidence-100 PO# splits, use /api/admin/hubbell/documents/rematch instead.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql, and } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../db/index';
import { matchDocumentToSos } from '../../../../../../src/lib/hubbell/document-matcher';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Doc = {
  id: string;
  doc_type: string;
  doc_number: string;
  extracted_address: string | null;
  extracted_city: string | null;
  extracted_state: string | null;
  extracted_zip: string | null;
  scrape_cust_code: string | null;
  scrape_seq_num: string | null;
  scrape_match_ratio: string | null;
};

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let body: {
    limit?: unknown;
    offset?: unknown;
    only_unmatched?: unknown;
    min_confidence?: unknown;
    doc_ids?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = Math.min(
    Math.max(1, Number(body.limit ?? 200) || 200),
    500,
  );
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);
  const onlyUnmatched = body.only_unmatched !== false;
  const minConfidence = Math.max(0, Number(body.min_confidence ?? 30) || 0);
  const docIds = Array.isArray(body.doc_ids)
    ? body.doc_ids.filter((x): x is string => typeof x === 'string')
    : null;

  const runId = `suggest_${new Date().toISOString().replace(/[:.]/g, '_')}`;
  const db = getDb();

  // Fetch the doc batch.
  let docs: Doc[];
  if (docIds && docIds.length > 0) {
    const docIdList = dsql.join(
      docIds.map((id) => dsql`${id}::uuid`),
      dsql`, `,
    );
    const raw = await db.execute(dsql`
      SELECT
        id::text                   AS id,
        doc_type,
        doc_number,
        extracted_address,
        extracted_city,
        extracted_state,
        extracted_zip,
        scrape_cust_code,
        scrape_seq_num,
        scrape_match_ratio::text   AS scrape_match_ratio
      FROM bids.hubbell_documents
      WHERE id IN (${docIdList})
    `);
    docs = Array.isArray(raw) ? (raw as unknown as Doc[]) : ((raw as { rows?: Doc[] }).rows ?? []);
  } else {
    const raw = await db.execute(dsql`
      SELECT
        d.id::text                   AS id,
        d.doc_type,
        d.doc_number,
        d.extracted_address,
        d.extracted_city,
        d.extracted_state,
        d.extracted_zip,
        d.scrape_cust_code,
        d.scrape_seq_num,
        d.scrape_match_ratio::text   AS scrape_match_ratio
      FROM bids.hubbell_documents d
      ${onlyUnmatched
        ? dsql`WHERE NOT EXISTS (
            SELECT 1 FROM bids.hubbell_document_sos s WHERE s.document_id = d.id
          )`
        : dsql``}
      ORDER BY d.received_at DESC NULLS LAST, d.id
      LIMIT ${limit} OFFSET ${offset}
    `);
    docs = Array.isArray(raw) ? (raw as unknown as Doc[]) : ((raw as { rows?: Doc[] }).rows ?? []);
  }

  let candidatesInserted = 0;
  let candidatesSkippedExisting = 0;
  const errors: Array<{ doc_id: string; error: string }> = [];

  for (const doc of docs) {
    try {
      const candidates = await matchDocumentToSos({
        docNumber: doc.doc_number,
        address: {
          address: doc.extracted_address,
          city: doc.extracted_city,
          state: doc.extracted_state,
          zip: doc.extracted_zip,
        },
        scrapeHint: {
          custCode: doc.scrape_cust_code,
          seqNum: doc.scrape_seq_num,
          matchRatio: doc.scrape_match_ratio != null
            ? Number(doc.scrape_match_ratio)
            : null,
        },
      });

      const keep = candidates.filter((c) => c.confidence >= minConfidence);
      if (keep.length === 0) continue;

      // Bulk insert with ON CONFLICT DO NOTHING — preserves any existing
      // accept/reject decisions on (document_id, so_id) pairs we'd otherwise
      // re-suggest.
      const result = await db
        .insert(schema.hubbellDocumentSuggestions)
        .values(
          keep.map((c) => ({
            documentId: doc.id,
            soId: c.soId,
            custCode: c.custCode,
            matchSource: c.matchSource,
            confidence: c.confidence,
            matchReasons: c.matchReasons,
            sourceRunId: runId,
          })),
        )
        .onConflictDoNothing({
          target: [
            schema.hubbellDocumentSuggestions.documentId,
            schema.hubbellDocumentSuggestions.soId,
          ],
        })
        .returning({ id: schema.hubbellDocumentSuggestions.id });

      candidatesInserted += result.length;
      candidatesSkippedExisting += keep.length - result.length;
    } catch (err) {
      errors.push({
        doc_id: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    run_id: runId,
    processed: docs.length,
    candidates_inserted: candidatesInserted,
    candidates_skipped_existing: candidatesSkippedExisting,
    errors,
  });
}
