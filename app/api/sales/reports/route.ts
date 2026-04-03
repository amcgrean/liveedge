import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/reports?branch=&period=30
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const period = Math.max(7, Math.min(365, parseInt(searchParams.get('period') ?? '30', 10) || 30));

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  const effectiveBranch = isAdmin
    ? (searchParams.get('branch') ?? '')
    : (session.user.branch ?? '');

  try {
    const sql = getErpSql();
    const since = new Date(Date.now() - period * 86_400_000).toISOString().slice(0, 10);

    type DailyRow = { order_date: string; count: number };
    type SaleTypeRow = { sale_type: string; count: number };
    type ShipViaRow = { ship_via: string; count: number };
    type TopCustomerRow = { cust_name: string | null; order_count: number };
    type StatusRow = { so_status: string; cnt: number };

    const [dailyRows, saleTypeRows, shipViaRows, topRows, statusRows] = await Promise.all([
      effectiveBranch
        ? sql<DailyRow[]>`
            SELECT
              CAST(COALESCE(expect_date, synced_at) AS DATE)::text AS order_date,
              COUNT(DISTINCT so_id)::int AS count
            FROM agility_so_header
            WHERE is_deleted = false AND system_id = ${effectiveBranch}
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY CAST(COALESCE(expect_date, synced_at) AS DATE)
            ORDER BY order_date
          `
        : sql<DailyRow[]>`
            SELECT
              CAST(COALESCE(expect_date, synced_at) AS DATE)::text AS order_date,
              COUNT(DISTINCT so_id)::int AS count
            FROM agility_so_header
            WHERE is_deleted = false
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY CAST(COALESCE(expect_date, synced_at) AS DATE)
            ORDER BY order_date
          `,

      effectiveBranch
        ? sql<SaleTypeRow[]>`
            SELECT COALESCE(NULLIF(TRIM(sale_type),''), 'UNKNOWN') AS sale_type,
                   COUNT(DISTINCT so_id)::int AS count
            FROM agility_so_header
            WHERE is_deleted = false AND system_id = ${effectiveBranch}
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY sale_type
            ORDER BY count DESC
            LIMIT 15
          `
        : sql<SaleTypeRow[]>`
            SELECT COALESCE(NULLIF(TRIM(sale_type),''), 'UNKNOWN') AS sale_type,
                   COUNT(DISTINCT so_id)::int AS count
            FROM agility_so_header
            WHERE is_deleted = false
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY sale_type
            ORDER BY count DESC
            LIMIT 15
          `,

      effectiveBranch
        ? sql<ShipViaRow[]>`
            SELECT COALESCE(NULLIF(TRIM(ship_via),''), 'UNKNOWN') AS ship_via,
                   COUNT(DISTINCT so_id)::int AS count
            FROM agility_so_header
            WHERE is_deleted = false AND system_id = ${effectiveBranch}
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY ship_via
            ORDER BY count DESC
            LIMIT 10
          `
        : sql<ShipViaRow[]>`
            SELECT COALESCE(NULLIF(TRIM(ship_via),''), 'UNKNOWN') AS ship_via,
                   COUNT(DISTINCT so_id)::int AS count
            FROM agility_so_header
            WHERE is_deleted = false
              AND CAST(COALESCE(expect_date, synced_at) AS DATE) >= ${since}::date
            GROUP BY ship_via
            ORDER BY count DESC
            LIMIT 10
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
    ]);

    return NextResponse.json({
      period_days: period,
      daily_orders: dailyRows,
      by_sale_type: saleTypeRows,
      by_ship_via: shipViaRows,
      top_customers: topRows,
      status_breakdown: statusRows,
    });
  } catch (err) {
    console.error('[sales/reports GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
