// GET /api/admin/hubbell/job?so_id=N
// Jobsite work-surface bundle. The so_id query param is only a lookup key —
// from it we resolve a physical jobsite tuple (normalized shipto_address_1 +
// city/state/zip) and return everything that lives there: open HUBB% SOs,
// every non-rejected Hubbell document whose extracted_address normalizes to
// the same key, and the junction rows that link them.

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

export const runtime = 'nodejs';

type SoRow = {
  so_id: number;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  expect_date: string | null;
  so_status: string | null;
  sale_type: string | null;
  created_date: string | null;
  ar_open_total: string | null;
  ar_amount_total: string | null;
};

type AttachedRow = {
  so_id: number;
  document_id: string;
  doc_number: string;
  doc_type: string;
  match_source: string;
  posted_to_agility_at: string | null;
};

type LineItem = {
  sku?: string;
  desc?: string;
  qty?: number | string;
  uom?: string;
  unit_price?: number | string;
  ext?: number | string;
};

type DocRow = {
  id: string;
  doc_type: string;
  doc_number: string;
  extracted_total: string | null;
  extracted_need_by: string | null;
  payment_status: 'paid' | 'partial' | 'unpaid' | null;
  paid_amount_total: string | null;
  last_check_number: string | null;
  last_payment_date: string | null;
  match_status: string;
  received_at: string;
  dev_code: string | null;
  dev_name: string | null;
  house_number: string | null;
  block_lot: string | null;
  model_elevation: string | null;
  line_items: LineItem[] | null;
};

export async function GET(req: NextRequest) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const url = new URL(req.url);
  const soIdRaw = url.searchParams.get('so_id');
  const soId = soIdRaw ? parseInt(soIdRaw, 10) : NaN;
  if (!Number.isFinite(soId)) {
    return NextResponse.json({ error: 'so_id is required' }, { status: 400 });
  }

  const sql = getErpSql();

  // Resolve the seed SO -> jobsite key.
  const seedRows = await sql<{
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
  }[]>`
    SELECT shipto_address_1, shipto_city, shipto_state, shipto_zip
    FROM agility_so_header
    WHERE so_id = ${soId} AND is_deleted = false
    LIMIT 1
  `;
  if (seedRows.length === 0) {
    return NextResponse.json({ error: 'SO not found' }, { status: 404 });
  }
  const seed = seedRows[0];
  if (!seed.shipto_address_1) {
    return NextResponse.json({ error: 'SO has no shipto address' }, { status: 400 });
  }

  const addr = seed.shipto_address_1;
  const city = seed.shipto_city;
  const state = seed.shipto_state;
  const zip = seed.shipto_zip;

  // ALL HUBB% SOs at this jobsite — no so_status filter. Buyers want to see
  // open + invoiced + cancelled in one view, matching Agility's AR Open and
  // Paid Inquiry. The dollar figure is AR Open (not unshipped order $) —
  // mirrors agility_ar_open.open_amt summed per SO. ref_num in agility_ar_open
  // is zero-padded with a "-NNN" shipment suffix; strip both to match so_id.
  const salesOrders = await sql<SoRow[]>`
    SELECT
      soh.so_id::int        AS so_id,
      TRIM(soh.cust_code)   AS cust_code,
      soh.cust_name,
      soh.reference,
      soh.po_number,
      soh.expect_date::text AS expect_date,
      soh.so_status,
      soh.sale_type,
      soh.created_date::text AS created_date,
      ar.ar_open_total::text   AS ar_open_total,
      ar.ar_amount_total::text AS ar_amount_total
    FROM agility_so_header soh
    LEFT JOIN LATERAL (
      SELECT
        SUM(open_amt) AS ar_open_total,
        SUM(amount)   AS ar_amount_total
      FROM agility_ar_open
      WHERE is_deleted = false
        -- ref_num is the invoice # zero-padded + a "-NNN" shipment suffix
        -- ("0001458813-001"). Strip both to match agility_so_header.so_id.
        -- NB: this lives inside a JS tagged template literal. Avoid any
        -- backslash escapes (esp. backslash-d and backslash-digit) — they
        -- are deprecated escape sequences that set the cooked value to
        -- undefined and break postgres.js param substitution. See PR #362.
        AND TRIM(LEADING '0' FROM split_part(ref_num, '-', 1))::bigint = soh.so_id
    ) ar ON true
    WHERE soh.is_deleted = false
      AND UPPER(TRIM(soh.cust_code)) LIKE 'HUBB%'
      AND bids.hubbell_normalize_address(soh.shipto_address_1)
          = bids.hubbell_normalize_address(${addr})
      AND soh.shipto_city  IS NOT DISTINCT FROM ${city}
      AND soh.shipto_state IS NOT DISTINCT FROM ${state}
      AND soh.shipto_zip   IS NOT DISTINCT FROM ${zip}
    ORDER BY soh.so_id DESC
  `;

  const soIds = salesOrders.map((s) => s.so_id);

  // All non-rejected docs at this jobsite (whether attached or not).
  const documents = await sql<DocRow[]>`
    SELECT
      d.id::text              AS id,
      d.doc_type,
      d.doc_number,
      d.extracted_total::text AS extracted_total,
      d.extracted_need_by::text AS extracted_need_by,
      d.payment_status,
      d.paid_amount_total::text AS paid_amount_total,
      d.last_check_number,
      d.last_payment_date::text AS last_payment_date,
      d.match_status,
      d.received_at::text     AS received_at,
      d.dev_code,
      d.dev_name,
      d.house_number,
      d.block_lot,
      d.model_elevation,
      d.line_items
    FROM bids.hubbell_documents d
    WHERE d.match_status <> 'rejected'
      AND d.extracted_address IS NOT NULL
      AND TRIM(d.extracted_address) <> ''
      AND bids.hubbell_normalize_address(d.extracted_address)
          = bids.hubbell_normalize_address(${addr})
    ORDER BY d.received_at DESC
  `;

  const docIds = documents.map((d) => d.id);

  // Junction rows for (SOs at this jobsite) OR (docs at this jobsite). We
  // union both directions so the SO-side shows attached docs AND the doc-side
  // shows attached SO ids — even if the linked counterpart sits outside this
  // jobsite (unusual but possible).
  const attached = (soIds.length === 0 && docIds.length === 0)
    ? []
    : await sql<AttachedRow[]>`
        SELECT
          j.so_id::int            AS so_id,
          d.id::text              AS document_id,
          d.doc_number,
          d.doc_type,
          j.match_source,
          j.posted_to_agility_at::text AS posted_to_agility_at
        FROM bids.hubbell_document_sos j
        JOIN bids.hubbell_documents d ON d.id = j.document_id
        WHERE j.so_id = ANY(${soIds.length === 0 ? [-1] : soIds})
           OR j.document_id::text = ANY(${docIds.length === 0 ? [''] : docIds})
      `;

  // Build SO -> attached docs map.
  const attachedBySo = new Map<number, AttachedRow[]>();
  const attachedByDoc = new Map<string, number[]>();
  for (const a of attached) {
    if (!attachedBySo.has(a.so_id)) attachedBySo.set(a.so_id, []);
    attachedBySo.get(a.so_id)!.push(a);
    if (!attachedByDoc.has(a.document_id)) attachedByDoc.set(a.document_id, []);
    attachedByDoc.get(a.document_id)!.push(a.so_id);
  }

  const salesOrdersOut = salesOrders.map((s) => ({
    ...s,
    attached_docs: (attachedBySo.get(s.so_id) ?? []).map((a) => ({
      document_id: a.document_id,
      doc_number: a.doc_number,
      doc_type: a.doc_type,
      match_source: a.match_source,
      posted_to_agility_at: a.posted_to_agility_at,
    })),
  }));

  const documentsOut = documents.map((d) => ({
    ...d,
    attached_so_ids: attachedByDoc.get(d.id) ?? [],
  }));

  // Jobsite header rollups.
  const custCodes = Array.from(
    new Set(salesOrders.map((s) => s.cust_code).filter((c): c is string => !!c))
  );
  const custNames = Array.from(
    new Set(salesOrders.map((s) => s.cust_name).filter((c): c is string => !!c))
  );
  const devDoc = documents.find((d) => d.dev_code || d.dev_name);

  const arOpenValue = salesOrders.reduce(
    (acc, s) => acc + (s.ar_open_total ? parseFloat(s.ar_open_total) || 0 : 0),
    0
  );
  const hubbellTotal = documents.reduce(
    (acc, d) => acc + (d.extracted_total ? parseFloat(d.extracted_total) || 0 : 0),
    0
  );
  const paidTotal = documents.reduce(
    (acc, d) => acc + (d.paid_amount_total ? parseFloat(d.paid_amount_total) || 0 : 0),
    0
  );

  return NextResponse.json({
    jobsite: {
      cust_codes: custCodes.join(','),
      cust_names: custNames.join(' / '),
      shipto_address_1: addr,
      shipto_city: city,
      shipto_state: state,
      shipto_zip: zip,
      dev_code: devDoc?.dev_code ?? null,
      dev_name: devDoc?.dev_name ?? null,
      so_count: salesOrders.length,
      ar_open_value: arOpenValue,
      doc_count: documents.length,
      hubbell_total: hubbellTotal,
      paid_total: paidTotal,
    },
    sales_orders: salesOrdersOut,
    documents: documentsOut,
  });
}
