// GET /api/admin/hubbell/suggestions
//
// Reviewer-facing list of pending Hubbell-doc → Agility-SO match candidates.
// Joined with the doc and the SO header so the table view has everything it
// needs for an accept/reject decision in one row.
//
// Auth: user session with `hubbell.review` capability.
//
// Query params:
//   ?status=pending|accepted|rejected|all     (default 'pending')
//   ?min_confidence=30                        (default 30)
//   ?limit=50                                 (default 50, max 200)
//   ?offset=0
//   ?doc_type=po|wo                           (optional filter)
//
// Response:
//   {
//     suggestions: [
//       {
//         id, document_id, so_id, cust_code, match_source,
//         confidence, match_reasons, status, suggested_at,
//         doc: { doc_type, doc_number, extracted_address, extracted_city,
//                extracted_state, extracted_zip, extracted_total, dev_code,
//                house_number, scrape_cust_code, scrape_seq_num },
//         so: { cust_code, cust_name, reference, po_number, shipto_address,
//               shipto_city, shipto_state, shipto_zip, so_status,
//               expect_date, order_total }
//       }
//     ],
//     total, count
//   }

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../src/lib/access-control';
import { verifyHubbellUploadToken } from '../../../../../src/lib/service-auth';
import { getDb } from '../../../../../db/index';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Row = {
  id: string;
  document_id: string;
  so_id: number;
  cust_code: string | null;
  match_source: string;
  confidence: number;
  match_reasons: string[];
  status: string;
  suggested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  // doc fields
  doc_type: string;
  doc_number: string;
  extracted_address: string | null;
  extracted_city: string | null;
  extracted_state: string | null;
  extracted_zip: string | null;
  extracted_total: string | null;
  dev_code: string | null;
  house_number: string | null;
  scrape_cust_code: string | null;
  scrape_seq_num: string | null;
  match_status: string;
  // so fields (nullable since SOs can disappear)
  so_cust_code: string | null;
  so_cust_name: string | null;
  so_reference: string | null;
  so_po_number: string | null;
  so_shipto_address: string | null;
  so_shipto_city: string | null;
  so_shipto_state: string | null;
  so_shipto_zip: string | null;
  so_status: string | null;
  so_expect_date: string | null;
  so_order_total: string | null;
};

export async function GET(req: NextRequest) {
  // Dual auth: bearer for local review CLI / scripts, user session for UI.
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'pending';
  const minConfidence = Math.max(0, Number(url.searchParams.get('min_confidence') ?? 30) || 0);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50), 200);
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const docTypeFilter = url.searchParams.get('doc_type');

  const validStatus = ['pending', 'accepted', 'rejected', 'all'].includes(status)
    ? status
    : 'pending';

  const db = getDb();

  const statusPred = validStatus === 'all'
    ? dsql``
    : dsql`AND s.status = ${validStatus}`;
  const docTypePred = (docTypeFilter === 'po' || docTypeFilter === 'wo')
    ? dsql`AND d.doc_type = ${docTypeFilter}`
    : dsql``;

  // Total count for the same filter (no limit/offset).
  const countResultRaw = await db.execute(dsql`
    SELECT COUNT(*)::int AS total
    FROM bids.hubbell_document_suggestions s
    JOIN bids.hubbell_documents d ON d.id = s.document_id
    WHERE s.confidence >= ${minConfidence}
    ${statusPred}
    ${docTypePred}
  `);
  const totalRow = Array.isArray(countResultRaw)
    ? (countResultRaw[0] as { total?: number } | undefined)
    : ((countResultRaw as { rows?: Array<{ total?: number }> }).rows?.[0]);
  const total = Number(totalRow?.total ?? 0);

  const rowsRaw = await db.execute(dsql`
    SELECT
      s.id::text                       AS id,
      s.document_id::text              AS document_id,
      s.so_id,
      s.cust_code,
      s.match_source,
      s.confidence,
      s.match_reasons,
      s.status,
      s.suggested_at::text             AS suggested_at,
      s.reviewed_by,
      s.reviewed_at::text              AS reviewed_at,
      d.doc_type,
      d.doc_number,
      d.extracted_address,
      d.extracted_city,
      d.extracted_state,
      d.extracted_zip,
      d.extracted_total::text          AS extracted_total,
      d.dev_code,
      d.house_number,
      d.scrape_cust_code,
      d.scrape_seq_num,
      d.match_status,
      TRIM(soh.cust_code)              AS so_cust_code,
      soh.cust_name                    AS so_cust_name,
      soh.reference                    AS so_reference,
      soh.po_number                    AS so_po_number,
      soh.shipto_address_1             AS so_shipto_address,
      soh.shipto_city                  AS so_shipto_city,
      soh.shipto_state                 AS so_shipto_state,
      soh.shipto_zip                   AS so_shipto_zip,
      soh.so_status                    AS so_status,
      soh.expect_date::text            AS so_expect_date,
      ot.order_total::text             AS so_order_total
    FROM bids.hubbell_document_suggestions s
    JOIN bids.hubbell_documents d ON d.id = s.document_id
    LEFT JOIN public.agility_so_header soh
      ON soh.so_id = s.so_id AND soh.is_deleted = false
    LEFT JOIN LATERAL (
      SELECT SUM(extended_price) AS order_total
      FROM public.agility_so_lines
      WHERE so_id = soh.so_id AND system_id = soh.system_id AND is_deleted = false
    ) ot ON true
    WHERE s.confidence >= ${minConfidence}
    ${statusPred}
    ${docTypePred}
    ORDER BY s.confidence DESC, s.suggested_at DESC, s.id
    LIMIT ${limit} OFFSET ${offset}
  `);
  const rows: Row[] = Array.isArray(rowsRaw)
    ? (rowsRaw as unknown as Row[])
    : ((rowsRaw as { rows?: Row[] }).rows ?? []);

  return NextResponse.json({
    suggestions: rows.map((r) => ({
      id: r.id,
      document_id: r.document_id,
      so_id: r.so_id,
      cust_code: r.cust_code,
      match_source: r.match_source,
      confidence: r.confidence,
      match_reasons: r.match_reasons,
      status: r.status,
      suggested_at: r.suggested_at,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      doc: {
        doc_type: r.doc_type,
        doc_number: r.doc_number,
        extracted_address: r.extracted_address,
        extracted_city: r.extracted_city,
        extracted_state: r.extracted_state,
        extracted_zip: r.extracted_zip,
        extracted_total: r.extracted_total != null ? Number(r.extracted_total) : null,
        dev_code: r.dev_code,
        house_number: r.house_number,
        scrape_cust_code: r.scrape_cust_code,
        scrape_seq_num: r.scrape_seq_num,
        match_status: r.match_status,
      },
      so: {
        cust_code: r.so_cust_code,
        cust_name: r.so_cust_name,
        reference: r.so_reference,
        po_number: r.so_po_number,
        shipto_address: r.so_shipto_address,
        shipto_city: r.so_shipto_city,
        shipto_state: r.so_shipto_state,
        shipto_zip: r.so_shipto_zip,
        so_status: r.so_status,
        expect_date: r.so_expect_date,
        order_total: r.so_order_total != null ? Number(r.so_order_total) : null,
      },
    })),
    total,
    count: rows.length,
  });
}
