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

  const searchClause = q
    ? sql`AND (
        s.cust_name ILIKE ${'%' + q + '%'}
        OR s.cust_code ILIKE ${'%' + q + '%'}
        OR s.shipto_address_1 ILIKE ${'%' + q + '%'}
        OR s.shipto_city ILIKE ${'%' + q + '%'}
      )`
    : sql``;

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
    )
    SELECT
      s.cust_code,
      MAX(s.cust_name)         AS cust_name,
      s.shipto_address_1,
      MAX(s.shipto_city)       AS shipto_city,
      MAX(s.shipto_state)      AS shipto_state,
      MAX(s.shipto_zip)        AS shipto_zip,
      MIN(s.so_id)::int        AS primary_so_id,
      COUNT(DISTINCT a.document_id)::int        AS doc_count,
      COUNT(DISTINCT a.so_id)::int              AS so_count,
      COALESCE(SUM(d.extracted_total), 0)::text AS hubbell_total
    FROM soh_keyed s
    JOIN attached a ON a.so_id = s.so_id
    JOIN bids.hubbell_documents d ON d.id = a.document_id
    WHERE 1=1 ${searchClause}
    GROUP BY s.cust_code, s.shipto_address_1
    ORDER BY MAX(s.cust_name) NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `;

  return NextResponse.json({ jobs: rows, page, limit });
}
