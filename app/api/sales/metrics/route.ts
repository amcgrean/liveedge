import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/metrics?branch=20GR&period=30
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const branchParam = searchParams.get('branch') ?? '';
  const period = Math.max(7, Math.min(365, parseInt(searchParams.get('period') ?? '30', 10) || 30));

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');

  try {
    const sql = getErpSql();
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - period * 86_400_000).toISOString().slice(0, 10);

    type MetricsRow = {
      open_orders_count: number;
      total_orders_today: number;
    };

    type RepMetricsRow = {
      active_customers: number;
    };

    type StatusRow = {
      so_status: string;
      cnt: number;
    };

    type TopCustomerRow = {
      cust_name: string | null;
      order_count: number;
    };

    const [metricsRows, statusRows, topRows] = await Promise.all([
      effectiveBranch
        ? sql<MetricsRow[]>`
            SELECT
              COUNT(DISTINCT CASE WHEN UPPER(COALESCE(so_status,'')) = 'O' THEN so_id END)::int AS open_orders_count,
              COUNT(DISTINCT CASE WHEN CAST(expect_date AS DATE) = ${today}::date THEN so_id END)::int AS total_orders_today
            FROM agility_so_header
            WHERE is_deleted = false AND system_id = ${effectiveBranch}
          `
        : sql<MetricsRow[]>`
            SELECT
              COUNT(DISTINCT CASE WHEN UPPER(COALESCE(so_status,'')) = 'O' THEN so_id END)::int AS open_orders_count,
              COUNT(DISTINCT CASE WHEN CAST(expect_date AS DATE) = ${today}::date THEN so_id END)::int AS total_orders_today
            FROM agility_so_header
            WHERE is_deleted = false
          `,

      effectiveBranch
        ? sql<StatusRow[]>`
            SELECT UPPER(COALESCE(so_status,'—')) AS so_status, COUNT(DISTINCT so_id)::int AS cnt
            FROM agility_so_header
            WHERE is_deleted = false AND system_id = ${effectiveBranch}
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY UPPER(COALESCE(so_status,'—'))
            ORDER BY cnt DESC
          `
        : sql<StatusRow[]>`
            SELECT UPPER(COALESCE(so_status,'—')) AS so_status, COUNT(DISTINCT so_id)::int AS cnt
            FROM agility_so_header
            WHERE is_deleted = false
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY UPPER(COALESCE(so_status,'—'))
            ORDER BY cnt DESC
          `,

      effectiveBranch
        ? sql<TopCustomerRow[]>`
            SELECT cust_name, COUNT(DISTINCT so_id)::int AS order_count
            FROM agility_so_header
            WHERE is_deleted = false AND system_id = ${effectiveBranch}
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY cust_name
            ORDER BY order_count DESC
            LIMIT 10
          `
        : sql<TopCustomerRow[]>`
            SELECT cust_name, COUNT(DISTINCT so_id)::int AS order_count
            FROM agility_so_header
            WHERE is_deleted = false
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY cust_name
            ORDER BY order_count DESC
            LIMIT 10
          `,
    ]);

    return NextResponse.json({
      open_orders_count: metricsRows[0]?.open_orders_count ?? 0,
      total_orders_today: metricsRows[0]?.total_orders_today ?? 0,
      status_breakdown: statusRows,
      top_customers: topRows,
      period_days: period,
    });
  } catch (err) {
    console.error('[sales/metrics GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
