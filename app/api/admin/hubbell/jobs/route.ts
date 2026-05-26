// GET /api/admin/hubbell/jobs
//
// Source-of-truth: open HUBB1200 + HUBB1700 sales orders in Agility, grouped
// by shipto_address_1 only (one row per physical jobsite — HUBB1200 main and
// HUBB1700 trim at the same address collapse into a single row).
//
// Doc attachment is by normalized address (not via the SO junction), so docs
// land on the right job as soon as their PDF extracted address matches the
// jobsite, regardless of whether a reviewer has linked them to a specific SO.
//
// Paginated 50/page. Search across customer name/code, address, city.

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

export const runtime = 'nodejs';

// Restrict to the two operational Hubbell customer codes only.
// HUBB1000 (Construction Services), HUBB1400 (Warranty), and legacy codes are
// intentionally excluded from this view.
const HUBBELL_JOB_CUST_CODES = ['HUBB1200', 'HUBB1700'];

type JobRow = {
  cust_codes: string;            // 'HUBB1200' or 'HUBB1200,HUBB1700'
  cust_names: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  primary_so_id: number | null;
  so_count: number;
  so_open_value: string | null;
  doc_count: number;
  hubbell_total: string | null;
};

type TotalRow = { total: number };

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
        soh.cust_name ILIKE ${'%' + q + '%'}
        OR TRIM(soh.cust_code) ILIKE ${'%' + q + '%'}
        OR soh.shipto_address_1 ILIKE ${'%' + q + '%'}
        OR soh.shipto_city ILIKE ${'%' + q + '%'}
      )`
    : sql``;

  const rows = await sql<JobRow[]>`
    WITH hubbell_open AS (
      SELECT
        soh.so_id,
        soh.system_id,
        TRIM(soh.cust_code)     AS cust_code,
        soh.cust_name,
        soh.shipto_address_1,
        soh.shipto_city,
        soh.shipto_state,
        soh.shipto_zip
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
        AND UPPER(TRIM(soh.cust_code)) = ANY(${HUBBELL_JOB_CUST_CODES})
        AND soh.shipto_address_1 IS NOT NULL
        ${searchClause}
    ),
    so_totals AS (
      SELECT h.so_id, h.system_id, SUM(l.extended_price) AS so_total
      FROM hubbell_open h
      LEFT JOIN agility_so_lines l
        ON l.so_id = h.so_id AND l.system_id = h.system_id AND l.is_deleted = false
      GROUP BY h.so_id, h.system_id
    ),
    site_meta AS (
      -- Full ship-to (address + city + state + zip) is the jobsite key, not
      -- just address_1 — two HUBB1200 SOs at "1234 Main St" in Waukee vs
      -- Grimes are different physical jobs.
      SELECT
        h.shipto_address_1,
        h.shipto_city,
        h.shipto_state,
        h.shipto_zip,
        STRING_AGG(DISTINCT h.cust_code, ',' ORDER BY h.cust_code) AS cust_codes,
        STRING_AGG(DISTINCT h.cust_name, ' / ')                    AS cust_names,
        MIN(h.so_id)::int                                          AS primary_so_id,
        COUNT(DISTINCT h.so_id)::int                               AS so_count,
        COALESCE(SUM(st.so_total), 0)::text                        AS so_open_value
      FROM hubbell_open h
      LEFT JOIN so_totals st ON st.so_id = h.so_id AND st.system_id = h.system_id
      GROUP BY h.shipto_address_1, h.shipto_city, h.shipto_state, h.shipto_zip
    ),
    docs_normalized AS (
      -- Normalize via bids.hubbell_normalize_address so street-type
      -- abbreviations (Ave / Avenue, St / Street, Dr / Drive, etc.)
      -- collapse to the same token. The function lowercases, expands
      -- abbreviations to long form, then strips non-alphanumerics.
      SELECT
        d.id,
        d.extracted_total,
        bids.hubbell_normalize_address(d.extracted_address) AS norm_addr
      FROM bids.hubbell_documents d
      WHERE d.match_status <> 'rejected'
        AND d.extracted_address IS NOT NULL
        AND TRIM(d.extracted_address) <> ''
    ),
    docs_for_site AS (
      SELECT
        s.shipto_address_1,
        s.shipto_city,
        s.shipto_state,
        s.shipto_zip,
        COUNT(DISTINCT d.id)::int                  AS doc_count,
        COALESCE(SUM(d.extracted_total), 0)::text  AS hubbell_total
      FROM site_meta s
      LEFT JOIN docs_normalized d
        ON d.norm_addr = bids.hubbell_normalize_address(s.shipto_address_1)
      GROUP BY s.shipto_address_1, s.shipto_city, s.shipto_state, s.shipto_zip
    )
    SELECT
      m.cust_codes,
      m.cust_names,
      m.shipto_address_1,
      m.shipto_city,
      m.shipto_state,
      m.shipto_zip,
      m.primary_so_id,
      m.so_count,
      m.so_open_value,
      COALESCE(d.doc_count, 0)        AS doc_count,
      COALESCE(d.hubbell_total, '0')  AS hubbell_total
    FROM site_meta m
    LEFT JOIN docs_for_site d
      ON d.shipto_address_1 IS NOT DISTINCT FROM m.shipto_address_1
     AND d.shipto_city      IS NOT DISTINCT FROM m.shipto_city
     AND d.shipto_state     IS NOT DISTINCT FROM m.shipto_state
     AND d.shipto_zip       IS NOT DISTINCT FROM m.shipto_zip
    ORDER BY m.cust_names NULLS LAST, m.shipto_address_1
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalRows = await sql<TotalRow[]>`
    WITH hubbell_open AS (
      SELECT
        soh.shipto_address_1,
        soh.shipto_city,
        soh.shipto_state,
        soh.shipto_zip
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
        AND UPPER(TRIM(soh.cust_code)) = ANY(${HUBBELL_JOB_CUST_CODES})
        AND soh.shipto_address_1 IS NOT NULL
        ${searchClause}
    )
    SELECT COUNT(*)::int AS total FROM (
      SELECT DISTINCT shipto_address_1, shipto_city, shipto_state, shipto_zip
      FROM hubbell_open
    ) t
  `;
  const total = totalRows[0]?.total ?? 0;

  return NextResponse.json({ jobs: rows, page, limit, total });
}
