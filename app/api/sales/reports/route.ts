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

    // Current window: [since, today]
    const since = new Date(Date.now() - period * 86_400_000).toISOString().slice(0, 10);

    // Prior-year window: same N-day span, exactly one year back
    const sincePrevDate = new Date(Date.now() - period * 86_400_000);
    sincePrevDate.setFullYear(sincePrevDate.getFullYear() - 1);
    const sincePrev = sincePrevDate.toISOString().slice(0, 10);

    const untilPrevDate = new Date(Date.now());
    untilPrevDate.setFullYear(untilPrevDate.getFullYear() - 1);
    const untilPrev = untilPrevDate.toISOString().slice(0, 10);

    type DailyRow       = { order_date: string; count: number };
    type SaleTypeRow    = { sale_type: string; count: number };
    type ShipViaRow     = { ship_via: string; count: number };
    type TopCustomerRow = { cust_name: string | null; order_count: number };
    type StatusRow      = { so_status: string; cnt: number };

    type ResultRow = {
      result: {
        daily_orders:       DailyRow[]       | null;
        by_sale_type:       SaleTypeRow[]    | null;
        by_ship_via:        ShipViaRow[]     | null;
        top_customers:      TopCustomerRow[] | null;
        status_breakdown:   StatusRow[]      | null;
        prev_total:         number           | null;
        prev_by_sale_type:  SaleTypeRow[]    | null;
        prev_top_customers: TopCustomerRow[] | null;
      };
    };

    // Single query: two CTEs (current + prior year), aggregated five + three ways.
    // Branch filter applied inline so we avoid duplicating the entire query.
    const rows = await sql<ResultRow[]>`
      WITH filtered AS (
        SELECT
          so_id,
          created_date::date            AS order_date,
          COALESCE(NULLIF(TRIM(sale_type), ''), 'UNKNOWN') AS sale_type,
          COALESCE(NULLIF(TRIM(ship_via),  ''), 'UNKNOWN') AS ship_via,
          cust_name,
          UPPER(COALESCE(so_status, '')) AS so_status
        FROM agility_so_header
        WHERE is_deleted = false
          ${effectiveBranch ? sql`AND system_id = ${effectiveBranch}` : sql``}
          AND created_date >= ${since}::date
          AND created_date <= CURRENT_DATE
          AND UPPER(COALESCE(so_status, '')) != 'C'
      ),
      prev_filtered AS (
        SELECT
          so_id,
          COALESCE(NULLIF(TRIM(sale_type), ''), 'UNKNOWN') AS sale_type,
          cust_name
        FROM agility_so_header
        WHERE is_deleted = false
          ${effectiveBranch ? sql`AND system_id = ${effectiveBranch}` : sql``}
          AND created_date >= ${sincePrev}::date
          AND created_date <= ${untilPrev}::date
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
        ),
        'prev_total', (SELECT COUNT(*)::int FROM prev_filtered),
        'prev_by_sale_type', (
          SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
          FROM (
            SELECT sale_type, COUNT(*)::int AS count
            FROM prev_filtered GROUP BY sale_type
            ORDER BY count DESC LIMIT 15
          ) s
        ),
        'prev_top_customers', (
          SELECT COALESCE(json_agg(t ORDER BY t.order_count DESC), '[]'::json)
          FROM (
            SELECT cust_name, COUNT(*)::int AS order_count
            FROM prev_filtered GROUP BY cust_name
            ORDER BY order_count DESC LIMIT 10
          ) t
        )
      ) AS result
    `;

    const result = rows[0]?.result ?? {
      daily_orders: [], by_sale_type: [], by_ship_via: [],
      top_customers: [], status_breakdown: [],
      prev_total: 0, prev_by_sale_type: [], prev_top_customers: [],
    };

    const res = NextResponse.json({
      period_days:        period,
      daily_orders:       result.daily_orders       ?? [],
      by_sale_type:       result.by_sale_type       ?? [],
      by_ship_via:        result.by_ship_via         ?? [],
      top_customers:      result.top_customers       ?? [],
      status_breakdown:   result.status_breakdown    ?? [],
      prev_total:         result.prev_total          ?? 0,
      prev_by_sale_type:  result.prev_by_sale_type   ?? [],
      prev_top_customers: result.prev_top_customers  ?? [],
    });
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    console.error('[sales/reports GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
