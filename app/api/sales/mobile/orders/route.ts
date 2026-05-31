import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';
import { deriveMobileStatus, type MobileOrderStatus, type MobileOrderSummary } from '../_shared';

// Reverse map: mobile lifecycle filter → Agility so_status codes.
const STATUS_CODES: Record<MobileOrderStatus, string[]> = {
  open: ['O', 'B', ''],
  picking: ['K'],
  staged: ['S', 'P'],
  delivery: ['D'],
  invoiced: ['I'],
};

// GET /api/sales/mobile/orders?q=&status=&branch=&limit=100
// Mirror-backed order list for the Sales mobile app. $ via UOM-aware extended_price.
export async function GET(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const statusParam = (searchParams.get('status') ?? '').trim().toLowerCase();
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '100', 10) || 100);

  const isAdmin = hasCapability(session, 'branch.all');
  const branch = isAdmin ? (searchParams.get('branch') ?? '') : (session.user.branch ?? '');

  const statusCodes = STATUS_CODES[statusParam as MobileOrderStatus];

  try {
    const sql = getErpSql();

    type Row = {
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

    const rows = await sql<Row[]>`
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
        AND COALESCE(soh.sale_type,'') <> 'Credit'
        AND UPPER(COALESCE(soh.so_status,'')) NOT IN ('C','X')
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        ${statusCodes ? sql`AND UPPER(COALESCE(soh.so_status,'')) = ANY(${statusCodes})` : sql``}
        ${q ? sql`AND (
          soh.so_id::text ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.cust_name,'') ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.reference,'') ILIKE ${'%' + q + '%'}
          OR COALESCE(soh.po_number,'') ILIKE ${'%' + q + '%'}
        )` : sql``}
      GROUP BY soh.system_id, soh.so_id, soh.cust_name, soh.cust_code,
               soh.so_status, soh.expect_date, soh.reference, soh.po_number, soh.ship_via
      ORDER BY soh.expect_date ASC NULLS LAST, soh.so_id DESC
      LIMIT ${limit}
    `;

    const orders: MobileOrderSummary[] = rows.map((r) => ({
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

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('[sales/mobile/orders GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
