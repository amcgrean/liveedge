// GET /api/admin/hubbell/checks
//
// Session-auth (hubbell.review) counterpart to /api/hubbell/checks. Returns
// every check with its lines, the description for each line's underlying
// Hubbell document (po/wo), the line's match status, and the first attached
// Agility SO (id + reference) so the Checks tab can render the master/detail
// table without further round trips.
//
// Query: ?limit=N (default 200, max 500). Newest first by check_date desc.

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { getErpSql } from '../../../../../db/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

type CheckRow = {
  id: string;
  check_number: string;
  check_date: string | null;
  total_amount: string | null;
  line_count: number;
  line_sum: string;
};

type LineRow = {
  check_id: string;
  doc_type: string;
  doc_number: string;
  line_seq: number;
  payment_amount: string;
  doc_id: string | null;
  doc_desc: string | null;
  doc_match_status: string | null;
  attached_so_id: number | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireCapability('hubbell.review');
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(
    500,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10) || 200),
  );

  const db = getDb();

  const checkRowsRaw = await db.execute(dsql`
    SELECT
      c.id::text                                    AS id,
      c.check_number                                AS check_number,
      c.check_date::text                            AS check_date,
      c.total_amount::text                          AS total_amount,
      (SELECT COUNT(*)::int FROM bids.hubbell_check_lines l WHERE l.check_id = c.id) AS line_count,
      COALESCE((SELECT SUM(l.payment_amount)::text FROM bids.hubbell_check_lines l WHERE l.check_id = c.id), '0') AS line_sum
    FROM bids.hubbell_checks c
    ORDER BY c.check_date DESC NULLS LAST, c.check_number DESC
    LIMIT ${limit}
  `);
  const checks: CheckRow[] = Array.isArray(checkRowsRaw)
    ? (checkRowsRaw as unknown as CheckRow[])
    : ((checkRowsRaw as { rows?: CheckRow[] }).rows ?? []);

  if (checks.length === 0) {
    return NextResponse.json({ checks: [], total: 0 });
  }

  // Page 2: all lines for this batch of checks. For po/wo lines we resolve
  // the latest matching hubbell_documents row (same pattern as the public
  // /api/hubbell/checks route) and pick its first attached SO. For 'inv'
  // lines the doc_number IS the Agility SO# — no document row exists.
  const checkIds = checks.map((c) => c.id);
  const idList = dsql.join(
    checkIds.map((id) => dsql`${id}::uuid`),
    dsql`, `,
  );

  const linesRaw = await db.execute(dsql`
    SELECT
      l.check_id::text                AS check_id,
      l.doc_type                      AS doc_type,
      l.doc_number                    AS doc_number,
      l.line_seq                      AS line_seq,
      l.payment_amount::text          AS payment_amount,
      resolver.doc_id::text           AS doc_id,
      resolver.desc                   AS doc_desc,
      resolver.match_status           AS doc_match_status,
      resolver.first_so_id            AS attached_so_id
    FROM bids.hubbell_check_lines l
    LEFT JOIN LATERAL (
      SELECT
        d.id                                                       AS doc_id,
        d.match_status                                             AS match_status,
        (d.line_items->0->>'desc')                                 AS desc,
        (SELECT s.so_id FROM bids.hubbell_document_sos s
          WHERE s.document_id = d.id ORDER BY s.confidence DESC, s.so_id ASC LIMIT 1) AS first_so_id
      FROM bids.hubbell_documents d
      WHERE d.doc_type = l.doc_type AND d.doc_number = l.doc_number
        AND l.doc_type IN ('po','wo')
      ORDER BY d.received_at DESC NULLS LAST, d.id ASC
      LIMIT 1
    ) resolver ON true
    WHERE l.check_id IN (${idList})
    ORDER BY l.check_id, l.line_seq, l.id
  `);
  const lines: LineRow[] = Array.isArray(linesRaw)
    ? (linesRaw as unknown as LineRow[])
    : ((linesRaw as { rows?: LineRow[] }).rows ?? []);

  // Hydrate attached SO references from agility_so_header (needed for the
  // "SO {soId} — {reference}" cell). Skip when no lines reference an SO.
  const soIds = Array.from(
    new Set(lines.map((l) => l.attached_so_id).filter((v): v is number => v != null)),
  );
  const soRefs = new Map<number, string | null>();
  if (soIds.length > 0) {
    const erp = getErpSql();
    const headers = await erp<Array<{ so_id: number; reference: string | null }>>`
      SELECT soh.so_id::int AS so_id, soh.reference
      FROM agility_so_header soh
      WHERE soh.so_id = ANY(${soIds})
    `;
    for (const h of headers) soRefs.set(h.so_id, h.reference);
  }

  // Group lines under their check + compute reconciliation health.
  const linesByCheck = new Map<string, LineRow[]>();
  for (const l of lines) {
    const arr = linesByCheck.get(l.check_id) ?? [];
    arr.push(l);
    linesByCheck.set(l.check_id, arr);
  }

  const out = checks.map((c) => {
    const myLines = linesByCheck.get(c.id) ?? [];
    const matched = myLines.filter((l) => l.attached_so_id != null).length;
    const health: 'ok' | 'partial' | 'none' =
      myLines.length === 0
        ? 'none'
        : matched === myLines.length
        ? 'ok'
        : matched === 0
        ? 'none'
        : 'partial';
    return {
      id: c.id,
      checkNumber: c.check_number,
      checkDate: c.check_date,
      totalAmount: c.total_amount,
      lineCount: c.line_count ?? 0,
      lineSum: Number(c.line_sum ?? '0'),
      health,
      lines: myLines.map((l) => ({
        docId: l.doc_id,
        docNumber: l.doc_number,
        docType: l.doc_type as 'po' | 'wo' | 'inv',
        description: l.doc_desc,
        paymentAmount: l.payment_amount,
        matchStatus: l.doc_match_status,
        attachedSo:
          l.attached_so_id != null
            ? { soId: l.attached_so_id, reference: soRefs.get(l.attached_so_id) ?? null }
            : null,
      })),
    };
  });

  return NextResponse.json({ checks: out, total: out.length });
}
