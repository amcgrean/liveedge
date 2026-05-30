// GET /api/admin/hubbell/so-search?q=<number>
//
// Live SO# typeahead for the manual-attach control on the Hubbell document
// detail page. Restricted to open Hubbell sales orders only.
//
// Auth: user session with `hubbell.review`.

import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

export const runtime = 'nodejs';

type Row = {
  so_id: number;
  reference: string | null;
  cust_code: string | null;
  cust_name: string | null;
  so_status: string | null;
  shipto_address_1: string | null;
  order_total: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireCapability('hubbell.review');
  if (auth instanceof NextResponse) return auth;

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const digits = q.replace(/[^0-9]/g, '');
  if (digits.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const sql = getErpSql();
  const rows = await sql<Row[]>`
    SELECT
      soh.so_id::int           AS so_id,
      soh.reference,
      TRIM(soh.cust_code)      AS cust_code,
      soh.cust_name,
      soh.so_status,
      soh.shipto_address_1,
      COALESCE((
        SELECT SUM(l.extended_price)::text
        FROM agility_so_lines l
        WHERE l.so_id = soh.so_id
          AND l.system_id = soh.system_id
          AND l.is_deleted = false
      ), '0')                  AS order_total
    FROM agility_so_header soh
    WHERE soh.is_deleted = false
      AND UPPER(TRIM(soh.cust_code)) LIKE 'HUBB%'
      AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
      AND soh.so_id::text LIKE ${'%' + digits + '%'}
    ORDER BY soh.so_id DESC
    LIMIT 8
  `;

  return NextResponse.json({ results: rows });
}
