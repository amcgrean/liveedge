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

    // agility_customers has one row per ship-to; collapse to one row per
    // customer via DISTINCT ON, then count open SOs from agility_so_header
    // (so_status not invoiced/cancelled). rep_1 is NOT on agility_customers.
    type Row = {
      cust_code: string;
      cust_name: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
      open_orders: number;
    };

    const rows = await sql<Row[]>`
      WITH cust AS (
        SELECT DISTINCT ON (cust_code) cust_code, cust_name, shipto_city, shipto_state
        FROM agility_customers
        WHERE is_deleted = false
          ${q ? sql`AND (cust_code ILIKE ${'%' + q + '%'} OR cust_name ILIKE ${'%' + q + '%'})` : sql``}
        ORDER BY cust_code, seq_num NULLS LAST
      )
      SELECT c.cust_code, c.cust_name, c.shipto_city, c.shipto_state,
        COALESCE((
          SELECT COUNT(*)::int FROM agility_so_header soh
          WHERE soh.is_deleted = false
            AND TRIM(soh.cust_code) = TRIM(c.cust_code)
            AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
            ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        ), 0) AS open_orders
      FROM cust c
      ORDER BY c.cust_name ASC NULLS LAST
      LIMIT ${limit}
    `;

    const customers: MobileCustomer[] = rows.map((r) => ({
      code: r.cust_code,
      name: r.cust_name,
      city: r.shipto_city,
      state: r.shipto_state,
      open_orders: r.open_orders,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    console.error('[sales/mobile/customers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
