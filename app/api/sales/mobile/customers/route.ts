import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';
import type { MobileCustomer } from '../_shared';

// GET /api/sales/mobile/customers?q=&limit=50
// Mirror-backed customer search for the Sales mobile app. Bearer or cookie.
export async function GET(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10) || 50);

  const isAdmin = hasCapability(session, 'branch.all');
  const branch = isAdmin ? (searchParams.get('branch') ?? '') : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    // agility_customers has one row per ship-to; collapse to one per customer
    // via DISTINCT ON. rep_1 is NOT on agility_customers.
    type CustRow = {
      cust_code: string;
      cust_name: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
    };

    const custRows = await sql<CustRow[]>`
      SELECT cust_code, cust_name, shipto_city, shipto_state
      FROM (
        SELECT DISTINCT ON (cust_code) cust_code, cust_name, shipto_city, shipto_state
        FROM agility_customers
        WHERE is_deleted = false
          ${q ? sql`AND (cust_code ILIKE ${'%' + q + '%'} OR cust_name ILIKE ${'%' + q + '%'})` : sql``}
        ORDER BY cust_code, seq_num NULLS LAST
      ) c
      ORDER BY cust_name ASC NULLS LAST
      LIMIT ${limit}
    `;

    // Open-order counts for ONLY the matched customers, in one grouped query.
    // (The old per-row correlated COUNT(*) scanned agility_so_header up to
    // `limit` times and 500'd under load.)
    const codes = custRows.map((r) => r.cust_code.trim());
    const countMap = new Map<string, number>();
    if (codes.length > 0) {
      type CntRow = { cust_code: string; n: number };
      const cntRows = await sql<CntRow[]>`
        SELECT TRIM(soh.cust_code) AS cust_code, COUNT(*)::int AS n
        FROM agility_so_header soh
        WHERE soh.is_deleted = false
          AND TRIM(soh.cust_code) = ANY(${codes})
          AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
          ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        GROUP BY TRIM(soh.cust_code)
      `;
      for (const r of cntRows) countMap.set(r.cust_code, r.n);
    }

    const customers: MobileCustomer[] = custRows.map((r) => ({
      code: r.cust_code,
      name: r.cust_name,
      city: r.shipto_city,
      state: r.shipto_state,
      open_orders: countMap.get(r.cust_code.trim()) ?? 0,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    console.error('[sales/mobile/customers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
