import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/rep-metrics?branch=20GR&rep=SMITH&days=30
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const branch = searchParams.get('branch') ?? '';
  const rep    = searchParams.get('rep') ?? '';
  const days   = parseInt(searchParams.get('days') ?? '30', 10);
  const sql    = getErpSql();

  // Distinct salesperson list for the branch
  const repRows = await sql`
    SELECT DISTINCT UPPER(TRIM(salesperson)) AS rep
    FROM agility_so_header
    WHERE is_deleted = false
      AND salesperson IS NOT NULL AND TRIM(salesperson) <> ''
      ${branch ? sql`AND system_id = ${branch}` : sql``}
    ORDER BY rep
  `;
  const reps = (repRows as unknown as { rep: string }[]).map((r) => r.rep);

  // KPI totals for selected rep
  const kpiRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE UPPER(COALESCE(so_status,'')) NOT IN ('I','C')) AS open_orders,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(so_status,'')) = 'I')            AS invoiced_orders,
      COUNT(*)                                                                AS total_orders
    FROM agility_so_header
    WHERE is_deleted = false
      AND order_date >= CURRENT_DATE - ${days}::int * INTERVAL '1 day'
      ${branch ? sql`AND system_id = ${branch}` : sql``}
      ${rep    ? sql`AND UPPER(TRIM(salesperson)) = ${rep.toUpperCase()}` : sql``}
  `;
  const kpi = (kpiRows as unknown as { open_orders: string; invoiced_orders: string; total_orders: string }[])[0] ?? {};

  // Recent orders for the rep
  const orderRows = await sql`
    SELECT
      so_id, cust_name, cust_code, reference, so_status, sale_type,
      order_date::text, expect_date::text, UPPER(TRIM(salesperson)) AS salesperson
    FROM agility_so_header
    WHERE is_deleted = false
      AND order_date >= CURRENT_DATE - ${days}::int * INTERVAL '1 day'
      ${branch ? sql`AND system_id = ${branch}` : sql``}
      ${rep    ? sql`AND UPPER(TRIM(salesperson)) = ${rep.toUpperCase()}` : sql``}
    ORDER BY order_date DESC
    LIMIT 200
  `;

  return NextResponse.json({
    reps,
    kpi: {
      open_orders:     parseInt(kpi.open_orders ?? '0', 10),
      invoiced_orders: parseInt(kpi.invoiced_orders ?? '0', 10),
      total_orders:    parseInt(kpi.total_orders ?? '0', 10),
    },
    orders: orderRows as unknown as Record<string, unknown>[],
    branch,
    rep,
    days,
  });
}
