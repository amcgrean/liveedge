import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../db/supabase';
import { deriveMobileStatus, type MobileCustomer, type MobileOrderSummary } from '../../_shared';

// GET /api/sales/mobile/customers/[code]
// Mirror-backed customer profile + open orders for the Sales mobile app.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { code } = await params;
  const isAdmin = hasCapability(session, 'branch.all');
  const branch = isAdmin ? '' : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type CustRow = {
      cust_code: string;
      cust_name: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
    };
    const custRows = await sql<CustRow[]>`
      SELECT DISTINCT ON (cust_code) cust_code, cust_name, shipto_city, shipto_state
      FROM agility_customers
      WHERE is_deleted = false AND TRIM(cust_code) = TRIM(${code})
      ORDER BY cust_code, seq_num NULLS LAST
      LIMIT 1
    `;
    if (!custRows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    type OrderRow = {
      so_number: string;
      system_id: string;
      customer_name: string | null;
      customer_code: string | null;
      so_status: string | null;
      total: string | null;
      expect_date: string | null;
      reference: string | null;
      po_number: string | null;
      ship_via: string | null;
      line_count: number;
    };
    const orderRows = await sql<OrderRow[]>`
      SELECT
        soh.so_id::text AS so_number,
        soh.system_id,
        soh.cust_name   AS customer_name,
        soh.cust_code   AS customer_code,
        soh.so_status,
        SUM(sol.extended_price)::text AS total,
        soh.expect_date::text AS expect_date,
        soh.reference,
        soh.po_number,
        soh.ship_via,
        COUNT(DISTINCT sol.sequence)::int AS line_count
      FROM agility_so_header soh
      LEFT JOIN agility_so_lines sol
        ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id AND sol.is_deleted = false
      WHERE soh.is_deleted = false
        AND TRIM(soh.cust_code) = TRIM(${code})
        AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('I','C','X')
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
      GROUP BY soh.system_id, soh.so_id, soh.cust_name, soh.cust_code,
               soh.so_status, soh.expect_date, soh.reference, soh.po_number, soh.ship_via
      ORDER BY soh.expect_date ASC NULLS LAST, soh.so_id DESC
      LIMIT 100
    `;

    const c = custRows[0];
    const customer: MobileCustomer = {
      code: c.cust_code,
      name: c.cust_name,
      city: c.shipto_city,
      state: c.shipto_state,
      open_orders: orderRows.length,
    };

    const orders: MobileOrderSummary[] = orderRows.map((r) => ({
      so_number: r.so_number,
      system_id: r.system_id,
      customer_name: r.customer_name,
      customer_code: r.customer_code,
      status: deriveMobileStatus(r.so_status),
      so_status: r.so_status ?? '',
      total: r.total != null ? parseFloat(r.total) : null,
      expect_date: r.expect_date,
      reference: r.reference,
      po_number: r.po_number,
      ship_via: r.ship_via,
      line_count: r.line_count,
    }));

    return NextResponse.json({ customer, orders });
  } catch (err) {
    console.error('[sales/mobile/customers/[code] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
