// GET /api/admin/hubbell/jobs
// Aggregates Hubbell documents (auto_matched + confirmed) by job site.
// A job site is (cust_code, shipto_address_1). Returns one row per site.

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

export const runtime = 'nodejs';

type JobRow = {
  cust_code: string | null;
  cust_name: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  primary_so_id: number | null;
  doc_count: number;
  so_count: number;
  hubbell_total: string | null;
};

export async function GET(req: NextRequest) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const offset = (page - 1) * limit;

  const sql = getErpSql();

  // The aggregate is keyed on (cust_code, shipto_address_1). A single Hubbell
  // doc can be attached to N SOs at the same job site, so we must dedupe doc
  // membership per job *before* summing — otherwise extracted_total gets
  // counted once per attached SO. Two CTEs:
  //   doc_at_site — DISTINCT (cust_code, address, document_id, total)
  //   so_at_site  — DISTINCT (cust_code, address, so_id)
  // Each is aggregated separately, joined back at the end.
  const rows = await sql<JobRow[]>`
    WITH attached AS (
      SELECT DISTINCT j.so_id, j.document_id
      FROM bids.hubbell_document_sos j
      JOIN bids.hubbell_documents d ON d.id = j.document_id
      WHERE d.match_status IN ('auto_matched', 'confirmed')
    ),
    soh_keyed AS (
      SELECT
        soh.so_id,
        TRIM(soh.cust_code) AS cust_code,
        soh.cust_name,
        soh.shipto_address_1,
        soh.shipto_city,
        soh.shipto_state,
        soh.shipto_zip
      FROM agility_so_header soh
      WHERE soh.so_id IN (SELECT so_id FROM attached)
        AND soh.is_deleted = false
    ),
    doc_at_site AS (
      SELECT DISTINCT
        s.cust_code,
        s.shipto_address_1,
        a.document_id,
        d.extracted_total
      FROM soh_keyed s
      JOIN attached a ON a.so_id = s.so_id
      JOIN bids.hubbell_documents d ON d.id = a.document_id
    ),
    so_at_site AS (
      SELECT DISTINCT
        s.cust_code,
        s.shipto_address_1,
        s.so_id,
        s.cust_name,
        s.shipto_city,
        s.shipto_state,
        s.shipto_zip
      FROM soh_keyed s
      JOIN attached a ON a.so_id = s.so_id
    ),
    site_meta AS (
      SELECT
        cust_code,
        shipto_address_1,
        MAX(cust_name)      AS cust_name,
        MAX(shipto_city)    AS shipto_city,
        MAX(shipto_state)   AS shipto_state,
        MAX(shipto_zip)     AS shipto_zip,
        MIN(so_id)::int     AS primary_so_id,
        COUNT(*)::int       AS so_count
      FROM so_at_site
      GROUP BY cust_code, shipto_address_1
    ),
    site_docs AS (
      SELECT
        cust_code,
        shipto_address_1,
        COUNT(*)::int                            AS doc_count,
        COALESCE(SUM(extracted_total), 0)::text  AS hubbell_total
      FROM doc_at_site
      GROUP BY cust_code, shipto_address_1
    )
    SELECT
      m.cust_code,
      m.cust_name,
      m.shipto_address_1,
      m.shipto_city,
      m.shipto_state,
      m.shipto_zip,
      m.primary_so_id,
      sd.doc_count,
      m.so_count,
      sd.hubbell_total
    FROM site_meta m
    JOIN site_docs sd
      ON sd.cust_code IS NOT DISTINCT FROM m.cust_code
     AND sd.shipto_address_1 IS NOT DISTINCT FROM m.shipto_address_1
    WHERE 1=1 ${q ? sql`
      AND (
        m.cust_name ILIKE ${'%' + q + '%'}
        OR m.cust_code ILIKE ${'%' + q + '%'}
        OR m.shipto_address_1 ILIKE ${'%' + q + '%'}
        OR m.shipto_city ILIKE ${'%' + q + '%'}
      )` : sql``}
    ORDER BY m.cust_name NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `;

  return NextResponse.json({ jobs: rows, page, limit });
}
