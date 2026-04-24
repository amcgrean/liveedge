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

    type ResultRow = {
      result: {
        daily_orders: DailyRow[] | null;
        by_sale_type: SaleTypeRow[] | null;
        by_ship_via: ShipViaRow[] | null;
        top_customers: TopCustomerRow[] | null;
        status_breakdown: StatusRow[] | null;
      };
    };

    // Single-scan CTE: filter agility_so_header once, then aggregate five ways.
    // The previous implementation ran 5 parallel queries that each scanned the
    // same rows; combining them cuts I/O and planner work to one round-trip.
    const rows = await (effectiveBranch
      ? sql<ResultRow[]>`
          WITH filtered AS (
            SELECT
              so_id,
              created_date::date AS order_date,
              COALESCE(NULLIF(TRIM(sale_type), ''), 'UNKNOWN') AS sale_type,
              COALESCE(NULLIF(TRIM(ship_via), ''), 'UNKNOWN') AS ship_via,
              cust_name,
              UPPER(COALESCE(so_status, '')) AS so_status
            FROM agility_so_header
            WHERE is_deleted = false
              AND system_id = ${effectiveBranch}
              AND created_date >= ${since}::date
              AND created_date <= CURRENT_DATE
              AND UPPER(COALESCE(so_status, '')) != 'C'
          )
          SELECT json_build_object(
            'daily_orders', (
              SELECT COALESCE(json_agg(d ORDER BY d.order_date), '[]'::json)
              FROM (
                SELECT order_date::text AS order_date, COUNT(*)::int AS count
                FROM filtered GROUP BY order_date
              ) d
            ),
            'by_sale_type', (
              SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
              FROM (
                SELECT sale_type, COUNT(*)::int AS count
                FROM filtered GROUP BY sale_type
                ORDER BY count DESC LIMIT 15
              ) s
            ),
            'by_ship_via', (
              SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
              FROM (
                SELECT ship_via, COUNT(*)::int AS count
                FROM filtered GROUP BY ship_via
                ORDER BY count DESC LIMIT 10
              ) s
            ),
            'top_customers', (
              SELECT COALESCE(json_agg(t ORDER BY t.order_count DESC), '[]'::json)
              FROM (
                SELECT cust_name, COUNT(*)::int AS order_count
                FROM filtered GROUP BY cust_name
                ORDER BY order_count DESC LIMIT 10
              ) t
            ),
            'status_breakdown', (
              SELECT COALESCE(json_agg(s ORDER BY s.cnt DESC), '[]'::json)
              FROM (
                SELECT so_status, COUNT(*)::int AS cnt
                FROM filtered GROUP BY so_status
              ) s
            )
          ) AS result
        `
      : sql<ResultRow[]>`
          WITH filtered AS (
            SELECT
              so_id,
              created_date::date AS order_date,
              COALESCE(NULLIF(TRIM(sale_type), ''), 'UNKNOWN') AS sale_type,
              COALESCE(NULLIF(TRIM(ship_via), ''), 'UNKNOWN') AS ship_via,
              cust_name,
              UPPER(COALESCE(so_status, '')) AS so_status
            FROM agility_so_header
            WHERE is_deleted = false
              AND created_date >= ${since}::date
              AND created_date <= CURRENT_DATE
              AND UPPER(COALESCE(so_status, '')) != 'C'
          )
          SELECT json_build_object(
            'daily_orders', (
              SELECT COALESCE(json_agg(d ORDER BY d.order_date), '[]'::json)
              FROM (
                SELECT order_date::text AS order_date, COUNT(*)::int AS count
                FROM filtered GROUP BY order_date
              ) d
            ),
            'by_sale_type', (
              SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
              FROM (
                SELECT sale_type, COUNT(*)::int AS count
                FROM filtered GROUP BY sale_type
                ORDER BY count DESC LIMIT 15
              ) s
            ),
            'by_ship_via', (
              SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
              FROM (
                SELECT ship_via, COUNT(*)::int AS count
                FROM filtered GROUP BY ship_via
                ORDER BY count DESC LIMIT 10
              ) s
            ),
            'top_customers', (
              SELECT COALESCE(json_agg(t ORDER BY t.order_count DESC), '[]'::json)
              FROM (
                SELECT cust_name, COUNT(*)::int AS order_count
                FROM filtered GROUP BY cust_name
                ORDER BY order_count DESC LIMIT 10
              ) t
            ),
            'status_breakdown', (
              SELECT COALESCE(json_agg(s ORDER BY s.cnt DESC), '[]'::json)
              FROM (
                SELECT so_status, COUNT(*)::int AS cnt
                FROM filtered GROUP BY so_status
              ) s
            )
          ) AS result
        `);

    const result = rows[0]?.result ?? {
      daily_orders: [],
      by_sale_type: [],
      by_ship_via: [],
      top_customers: [],
      status_breakdown: [],
    };

    const res = NextResponse.json({
      period_days: period,
      daily_orders: result.daily_orders ?? [],
      by_sale_type: result.by_sale_type ?? [],
      by_ship_via: result.by_ship_via ?? [],
      top_customers: result.top_customers ?? [],
      status_breakdown: result.status_breakdown ?? [],
    });
    // Browser cache for 60s, SWR for 5 min — reports don't need to be real-time.
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    console.error('[sales/reports GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
