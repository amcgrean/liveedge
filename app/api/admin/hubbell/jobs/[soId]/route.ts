// GET /api/admin/hubbell/jobs/[soId]
// Per-SO view: SO header, Hubbell docs attached, sibling SOs that share a doc
// with this one, and other Hubbell docs at the same address but not attached.

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../db/supabase';

export const runtime = 'nodejs';

type SoHeader = {
  so_id: number;
  system_id: string | null;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  so_status: string | null;
  sale_type: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  created_date: string | null;
  expect_date: string | null;
};

type AttachedDoc = {
  document_id: string;
  doc_type: string;
  doc_number: string;
  match_source: string;
  confidence: number;
  extracted_total: string | null;
  extracted_need_by: string | null;
  match_status: string;
  received_at: string;
};

type SiblingSo = {
  so_id: number;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  so_status: string | null;
  shipto_address_1: string | null;
  shared_doc_count: number;
};

type UnattachedDoc = {
  document_id: string;
  doc_type: string;
  doc_number: string;
  extracted_address: string | null;
  extracted_total: string | null;
  match_status: string;
  received_at: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ soId: string }> }
) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { soId: soIdRaw } = await params;
  const soId = parseInt(soIdRaw, 10);
  if (!Number.isFinite(soId)) {
    return NextResponse.json({ error: 'Invalid soId' }, { status: 400 });
  }

  const sql = getErpSql();

  const headers = await sql<SoHeader[]>`
    SELECT
      soh.so_id::int             AS so_id,
      soh.system_id,
      TRIM(soh.cust_code)        AS cust_code,
      soh.cust_name,
      soh.reference,
      soh.po_number,
      soh.so_status,
      soh.sale_type,
      soh.shipto_address_1,
      soh.shipto_city,
      soh.shipto_state,
      soh.shipto_zip,
      soh.created_date::text     AS created_date,
      soh.expect_date::text      AS expect_date
    FROM agility_so_header soh
    WHERE soh.so_id = ${soId}
      AND soh.is_deleted = false
    LIMIT 1
  `;
  if (headers.length === 0) {
    return NextResponse.json({ error: 'SO not found' }, { status: 404 });
  }
  const so = headers[0];

  const attached = await sql<AttachedDoc[]>`
    SELECT
      d.id::text              AS document_id,
      d.doc_type,
      d.doc_number,
      j.match_source,
      j.confidence,
      d.extracted_total::text AS extracted_total,
      d.extracted_need_by::text AS extracted_need_by,
      d.match_status,
      d.received_at::text     AS received_at
    FROM bids.hubbell_document_sos j
    JOIN bids.hubbell_documents d ON d.id = j.document_id
    WHERE j.so_id = ${soId}
    ORDER BY d.received_at DESC
  `;

  // Sibling SOs: SOs that share at least one document with this one.
  const siblings = attached.length === 0
    ? []
    : await sql<SiblingSo[]>`
        SELECT
          soh.so_id::int             AS so_id,
          TRIM(soh.cust_code)        AS cust_code,
          soh.cust_name,
          soh.reference,
          soh.so_status,
          soh.shipto_address_1,
          COUNT(*)::int              AS shared_doc_count
        FROM bids.hubbell_document_sos j
        JOIN agility_so_header soh ON soh.so_id = j.so_id
        WHERE j.document_id = ANY(${attached.map((a) => a.document_id)})
          AND j.so_id <> ${soId}
          AND soh.is_deleted = false
          AND UPPER(TRIM(soh.cust_code)) LIKE 'HUBB%'
        GROUP BY soh.so_id, soh.cust_code, soh.cust_name, soh.reference, soh.so_status, soh.shipto_address_1
        ORDER BY COUNT(*) DESC
      `;

  // Other docs at same address that aren't attached to anything yet.
  const unattached = !so.shipto_address_1
    ? []
    : await sql<UnattachedDoc[]>`
        SELECT
          d.id::text              AS document_id,
          d.doc_type,
          d.doc_number,
          d.extracted_address,
          d.extracted_total::text AS extracted_total,
          d.match_status,
          d.received_at::text     AS received_at
        FROM bids.hubbell_documents d
        WHERE d.match_status NOT IN ('rejected')
          AND NOT EXISTS (
            SELECT 1 FROM bids.hubbell_document_sos j2 WHERE j2.document_id = d.id
          )
          AND (
            d.extracted_address ILIKE ${'%' + (so.shipto_address_1?.slice(0, 20) ?? '') + '%'}
            ${so.shipto_zip ? sql`OR d.extracted_zip = ${so.shipto_zip.slice(0, 5)}` : sql``}
          )
        ORDER BY d.received_at DESC
        LIMIT 20
      `;

  return NextResponse.json({
    so,
    attached_docs: attached,
    sibling_sos: siblings,
    unattached_address_docs: unattached,
  });
}
