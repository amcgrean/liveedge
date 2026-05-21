// GET /api/hubbell/checks?since=YYYY-MM-DD&cursor=<opaque>&limit=200
//
// Phase 3d read endpoint for the PC monthly recon. Returns Hubbell checks
// with their lines and each line's resolved SO references.
//
// Two-path SO resolver per the design addendum (§5):
//   - doc_type 'po' | 'wo': lookup hubbell_documents on (doc_type, doc_number),
//     then hubbell_document_sos on document_id → attached_so_ids.
//     resolution_path = 'document'.
//   - doc_type 'inv': doc_number IS the Agility SO# directly. Verify against
//     agility_so_header.so_id; if found, attached_so_ids = [so_id].
//     resolution_path = 'ar_invoice'.
//   - No match in either path: attached_so_ids = [], resolution_path = 'unmatched'.
//
// Consumer doesn't have to branch on doc_type — same shape for both paths.
//
// Auth: Authorization: Bearer $HUBBELL_UPLOAD_TOKEN
// Pagination: cursor on (last_seen_at, id). Default limit 200, max 1000.

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../src/lib/service-auth';
import { getDb } from '../../../../db/index';
import { clampLimit, decodeCursor, encodeCursor } from '../../../../src/lib/hubbell/cursor';

export const runtime = 'nodejs';
export const maxDuration = 30;

type CheckRow = {
  id: string;
  check_number: string;
  check_date: string | null;
  total_amount: string | null;
  payment_count: number | null;
  source_run_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type LineRow = {
  id: string;
  check_id: string;
  doc_type: string;
  doc_number: string;
  invoice_date: string | null;
  payment_amount: string;
  gross_amount: string | null;
  memo: string | null;
  line_seq: number;
  // Two-path resolver outputs (from joins, nullable when unresolved)
  document_id: string | null;
  doc_attached_so_ids: number[] | null;
  inv_so_id: number | null;
};

export async function GET(req: NextRequest) {
  try {
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
    const fetchLimit = limit + 1;

    // Page 1: fetch checks ordered by (last_seen_at, id). The legacy backfill
    // synthesized last_seen_at from the old payments table; new daily ingests
    // bump it on every observed scrape, which is the desired "has this
    // changed" signal.
    const checksResultRaw = await db.execute(dsql`
      SELECT
        c.id,
        c.check_number,
        c.check_date::text       AS check_date,
        c.total_amount::text     AS total_amount,
        c.payment_count,
        c.source_run_id,
        c.first_seen_at::text    AS first_seen_at,
        c.last_seen_at::text     AS last_seen_at
      FROM bids.hubbell_checks c
      WHERE c.last_seen_at >= ${since}::date
        ${cursorDate && cursorId
          ? dsql`AND (c.last_seen_at, c.id) > (${cursorDate}::timestamptz, ${cursorId}::uuid)`
          : dsql``}
      ORDER BY c.last_seen_at ASC, c.id ASC
      LIMIT ${fetchLimit}
    `);
    const checks: CheckRow[] = Array.isArray(checksResultRaw)
      ? (checksResultRaw as unknown as CheckRow[])
      : ((checksResultRaw as { rows?: CheckRow[] }).rows ?? []);

    let nextCursor: string | null = null;
    if (checks.length > limit) {
      const last = checks[limit - 1];
      nextCursor = encodeCursor({ d: last.last_seen_at, id: last.id });
      checks.length = limit;
    }

    if (checks.length === 0) {
      return NextResponse.json({ checks: [], next_cursor: null, count: 0 });
    }

    // Page 2: fetch all lines for this page of checks, with resolver joins
    // baked into the query so we don't N+1. Use parameterized IN with explicit
    // uuid casts (postgres.js doesn't always handle ANY(array) bindings cleanly
    // when the cast target is uuid).
    const checkIds = checks.map((c) => c.id);
    const idList = dsql.join(
      checkIds.map((id) => dsql`${id}::uuid`),
      dsql`, `,
    );
    const linesResultRaw = await db.execute(dsql`
      SELECT
        l.id,
        l.check_id::text           AS check_id,
        l.doc_type,
        l.doc_number,
        l.invoice_date::text       AS invoice_date,
        l.payment_amount::text     AS payment_amount,
        l.gross_amount::text       AS gross_amount,
        l.memo,
        l.line_seq,
        d.id                       AS document_id,
        (
          SELECT COALESCE(ARRAY_AGG(s.so_id ORDER BY s.so_id), ARRAY[]::int[])
            FROM bids.hubbell_document_sos s
           WHERE s.document_id = d.id
        )                          AS doc_attached_so_ids,
        CASE
          WHEN l.doc_type = 'inv'
               AND l.doc_number ~ '^[0-9]+$'
          THEN (
            -- agility_so_header.so_id is varchar in the source table even
            -- though it's aliased as ::int elsewhere in the codebase. Compare
            -- via leading-zero-stripped strings (same pattern as the AR-open
            -- join in /api/admin/hubbell/job/route.ts).
            SELECT so_id::int
              FROM public.agility_so_header
             WHERE TRIM(LEADING '0' FROM so_id) = TRIM(LEADING '0' FROM l.doc_number)
             LIMIT 1
          )
          ELSE NULL
        END                        AS inv_so_id
      FROM bids.hubbell_check_lines l
      LEFT JOIN bids.hubbell_documents d
        ON l.doc_type IN ('po','wo')
       AND d.doc_type   = l.doc_type
       AND d.doc_number = l.doc_number
      WHERE l.check_id IN (${idList})
      ORDER BY l.check_id, l.line_seq
    `);
    const lines: LineRow[] = Array.isArray(linesResultRaw)
      ? (linesResultRaw as unknown as LineRow[])
      : ((linesResultRaw as { rows?: LineRow[] }).rows ?? []);

    // Group lines under their check.
    const linesByCheck = new Map<string, LineRow[]>();
    for (const l of lines) {
      const arr = linesByCheck.get(l.check_id) ?? [];
      arr.push(l);
      linesByCheck.set(l.check_id, arr);
    }

    const out = checks.map((c) => ({
      id: c.id,
      check_number: c.check_number,
      check_date: c.check_date,
      total_amount: c.total_amount != null ? Number(c.total_amount) : null,
      payment_count: c.payment_count,
      source_run_id: c.source_run_id,
      first_seen_at: c.first_seen_at,
      last_seen_at: c.last_seen_at,
      lines: (linesByCheck.get(c.id) ?? []).map((l) => {
        let attachedSoIds: number[] = [];
        let resolutionPath: 'document' | 'ar_invoice' | 'unmatched' = 'unmatched';
        if (l.doc_type === 'po' || l.doc_type === 'wo') {
          if (l.document_id && l.doc_attached_so_ids && l.doc_attached_so_ids.length > 0) {
            attachedSoIds = l.doc_attached_so_ids;
            resolutionPath = 'document';
          }
        } else if (l.doc_type === 'inv' && l.inv_so_id != null) {
          attachedSoIds = [l.inv_so_id];
          resolutionPath = 'ar_invoice';
        }
        return {
          doc_type: l.doc_type,
          doc_number: l.doc_number,
          line_seq: l.line_seq,
          payment_amount: Number(l.payment_amount),
          gross_amount: l.gross_amount != null ? Number(l.gross_amount) : null,
          memo: l.memo,
          invoice_date: l.invoice_date,
          document_id: l.document_id,
          attached_so_ids: attachedSoIds,
          resolution_path: resolutionPath,
        };
      }),
    }));

    return NextResponse.json({
      checks: out,
      next_cursor: nextCursor,
      count: out.length,
    });
  } catch (err) {
    // Surface the actual error message during the debug window — Next.js
    // otherwise swallows route handler exceptions into an empty 500 body.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[hubbell checks GET] error', err);
    return NextResponse.json(
      { error: 'internal error', detail: message },
      { status: 500 },
    );
  }
}
