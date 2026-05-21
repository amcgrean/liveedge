// GET /api/hubbell/docs?since=YYYY-MM-DD&cursor=<opaque>&limit=200
//
// Phase 3d read endpoint for the PC monthly recon (hubbell_reconciliation_v1.py
// --mode liveedge). Returns Hubbell PO/WO documents with their attached SOs
// and current payment rollup state.
//
// Auth: Authorization: Bearer $HUBBELL_UPLOAD_TOKEN (reuses the upload token —
// same audience: PC + Pi service-to-service)
//
// Pagination: cursor-based. Cursor encodes (updated_at, id). Default limit
// 200, max 1000. Data is mostly append-only so cursors are stable; the
// REPLACE path on /checks/upload bumps updated_at but doesn't change row
// ordering, so the consumer can safely resume from a saved cursor.
//
// since=YYYY-MM-DD filters on hubbell_documents.updated_at (every rollup
// recompute bumps it; that's the right "has this changed" signal). Required.

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../src/lib/service-auth';
import { getDb } from '../../../../db/index';
import { clampLimit, decodeCursor, encodeCursor } from '../../../../src/lib/hubbell/cursor';

export const runtime = 'nodejs';
export const maxDuration = 30;

type DocRow = {
  id: string;
  doc_type: string;
  doc_number: string;
  extracted_address: string | null;
  extracted_city: string | null;
  extracted_state: string | null;
  extracted_zip: string | null;
  extracted_total: string | null;
  dev_code: string | null;
  scrape_cust_code: string | null;
  scrape_seq_num: string | null;
  match_status: string;
  paid_amount_total: string | null;
  last_payment_date: string | null;
  last_check_number: string | null;
  payment_status: string | null;
  attached_so_ids: number[] | null;
  received_at: string;
  updated_at: string;
};

export async function GET(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const since = url.searchParams.get('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json(
      { error: '`since` is required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  const limit = clampLimit(url.searchParams.get('limit'));
  const rawCursor = url.searchParams.get('cursor');
  let cursorDate: string | null = null;
  let cursorId: string | null = null;
  if (rawCursor) {
    const c = decodeCursor(rawCursor);
    if (!c) {
      return NextResponse.json({ error: 'invalid cursor' }, { status: 400 });
    }
    cursorDate = c.d;
    cursorId = c.id;
  }

  const db = getDb();

  // Pull one extra row to determine whether next_cursor should be set.
  const fetchLimit = limit + 1;

  // Use a single query that returns docs + array-aggregated attached_so_ids
  // from hubbell_document_sos. Pagination is `(updated_at, id) > cursor`
  // ordered ASC so the consumer can resume.
  const rows = (await db.execute(dsql`
    SELECT
      d.id,
      d.doc_type,
      d.doc_number,
      d.extracted_address,
      d.extracted_city,
      d.extracted_state,
      d.extracted_zip,
      d.extracted_total::text     AS extracted_total,
      d.dev_code,
      d.scrape_cust_code,
      d.scrape_seq_num,
      d.match_status,
      d.paid_amount_total::text   AS paid_amount_total,
      d.last_payment_date::text   AS last_payment_date,
      d.last_check_number,
      d.payment_status,
      d.received_at::text         AS received_at,
      d.updated_at::text          AS updated_at,
      (
        SELECT COALESCE(ARRAY_AGG(s.so_id ORDER BY s.so_id), ARRAY[]::int[])
          FROM bids.hubbell_document_sos s
         WHERE s.document_id = d.id
      ) AS attached_so_ids
    FROM bids.hubbell_documents d
    WHERE d.updated_at >= ${since}::date
      ${cursorDate && cursorId
        ? dsql`AND (d.updated_at, d.id) > (${cursorDate}::timestamptz, ${cursorId}::uuid)`
        : dsql``}
    ORDER BY d.updated_at ASC, d.id ASC
    LIMIT ${fetchLimit}
  `)) as unknown as DocRow[];

  // Drizzle's postgres-js driver returns rows as an iterable; some shapes
  // expose them on `.rows`, others directly. Normalize.
  const docs: DocRow[] = Array.isArray(rows)
    ? rows
    : (rows as { rows?: DocRow[] }).rows ?? [];

  let nextCursor: string | null = null;
  if (docs.length > limit) {
    const last = docs[limit - 1];
    nextCursor = encodeCursor({ d: last.updated_at, id: last.id });
    docs.length = limit;
  }

  return NextResponse.json({
    docs: docs.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      doc_number: d.doc_number,
      extracted_address: d.extracted_address,
      extracted_city: d.extracted_city,
      extracted_state: d.extracted_state,
      extracted_zip: d.extracted_zip,
      extracted_total: d.extracted_total != null ? Number(d.extracted_total) : null,
      dev_code: d.dev_code,
      scrape_cust_code: d.scrape_cust_code,
      scrape_seq_num: d.scrape_seq_num,
      match_status: d.match_status,
      paid_amount_total:
        d.paid_amount_total != null ? Number(d.paid_amount_total) : null,
      last_payment_date: d.last_payment_date,
      last_check_number: d.last_check_number,
      payment_status: d.payment_status,
      attached_so_ids: d.attached_so_ids ?? [],
      received_at: d.received_at,
      updated_at: d.updated_at,
    })),
    next_cursor: nextCursor,
    count: docs.length,
  });
}
