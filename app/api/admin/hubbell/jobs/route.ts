// GET /api/admin/hubbell/jobs
//
// Source-of-truth: open HUBB% sales orders in Agility, grouped by
// (cust_code, shipto_address_1). Attached Hubbell document count + $ is a
// sidecar metric — a job appears whether or not it has docs yet, so the
// jobs page is useful before reviewers start confirming attachments.
//
// Paginated 50/page. Search across customer name/code, address, city.

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
        AND UPPER(TRIM(soh.cust_code)) LIKE 'HUBB%'
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
      SELECT
        h.cust_code,
        h.shipto_address_1,
        MAX(h.cust_name)        AS cust_name,
        MAX(h.shipto_city)      AS shipto_city,
        MAX(h.shipto_state)     AS shipto_state,
        MAX(h.shipto_zip)       AS shipto_zip,
        MIN(h.so_id)::int       AS primary_so_id,
        COUNT(DISTINCT h.so_id)::int                          AS so_count,
        COALESCE(SUM(st.so_total), 0)::text                   AS so_open_value
      FROM hubbell_open h
      LEFT JOIN so_totals st ON st.so_id = h.so_id AND st.system_id = h.system_id
      GROUP BY h.cust_code, h.shipto_address_1
    ),
    -- Docs are associated with a job site by physical address, not via the
    -- SO junction. Every doc has an extracted_address parsed from the PDF
    -- header; that's enough to map it to a job site at the same address
    -- regardless of whether a reviewer has confirmed an SO attachment yet.
    -- Address normalize: lowercase + strip non-alphanumerics to absorb
    -- punctuation/spacing drift ("1224, 1228 Granite St" ~ "1224 Granite Street").
    docs_normalized AS (
      SELECT
        d.id,
        d.extracted_total,
        LOWER(REGEXP_REPLACE(COALESCE(d.extracted_address, ''), '[^a-z0-9]', '', 'gi')) AS norm_addr
      FROM bids.hubbell_documents d
      WHERE d.match_status <> 'rejected'
        AND d.extracted_address IS NOT NULL
        AND TRIM(d.extracted_address) <> ''
    ),
    docs_for_site AS (
      SELECT
        s.cust_code,
        s.shipto_address_1,
        COUNT(DISTINCT d.id)::int                  AS doc_count,
        COALESCE(SUM(d.extracted_total), 0)::text  AS hubbell_total
      FROM site_meta s
      LEFT JOIN docs_normalized d
        ON d.norm_addr =
           LOWER(REGEXP_REPLACE(s.shipto_address_1, '[^a-z0-9]', '', 'gi'))
      GROUP BY s.cust_code, s.shipto_address_1
    )
    SELECT
      m.cust_code,
      m.cust_name,
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
      ON d.cust_code IS NOT DISTINCT FROM m.cust_code
     AND d.shipto_address_1 IS NOT DISTINCT FROM m.shipto_address_1
    ORDER BY m.cust_name NULLS LAST, m.shipto_address_1
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalRows = await sql<TotalRow[]>`
    WITH hubbell_open AS (
      SELECT
        TRIM(soh.cust_code) AS cust_code,
        soh.shipto_address_1
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
        AND UPPER(TRIM(soh.cust_code)) LIKE 'HUBB%'
        AND soh.shipto_address_1 IS NOT NULL
        ${searchClause}
    )
    SELECT COUNT(*)::int AS total FROM (
      SELECT cust_code, shipto_address_1
      FROM hubbell_open
      GROUP BY cust_code, shipto_address_1
    ) t
  `;
  const total = totalRows[0]?.total ?? 0;

  return NextResponse.json({ jobs: rows, page, limit, total });
}
