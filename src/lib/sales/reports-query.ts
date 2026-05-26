// Shared query for /api/sales/reports and the sales-reports report-digest
// subscription. Single SQL invocation; isolated here so the cron path can
// reuse the same code the UI hits.

import { getErpSql } from '../../../db/supabase';

export interface SalesReportsPayload {
  period_days:        number;
  daily_orders:       { order_date: string; count: number }[];
  by_sale_type:       { sale_type: string; count: number }[];
  by_ship_via:        { ship_via: string; count: number }[];
  top_customers:      { cust_name: string | null; order_count: number }[];
  status_breakdown:   { so_status: string; cnt: number }[];
  prev_total:         number;
  prev_by_sale_type:  { sale_type: string; count: number }[];
  prev_top_customers: { cust_name: string | null; order_count: number }[];
}

export interface SalesReportsQueryParams {
  /** 7..365, clamped */
  period: number;
  /** Empty string = all branches; admins only */
  branch: string;
}

export async function fetchSalesReports(params: SalesReportsQueryParams): Promise<SalesReportsPayload> {
  const period = Math.max(7, Math.min(365, Math.floor(params.period) || 30));
  const branch = params.branch || '';

  const sql = getErpSql();

  const since = new Date(Date.now() - period * 86_400_000).toISOString().slice(0, 10);
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
        ${branch ? sql`AND system_id = ${branch}` : sql``}
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
        ${branch ? sql`AND system_id = ${branch}` : sql``}
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

  const r = rows[0]?.result ?? {
    daily_orders: [], by_sale_type: [], by_ship_via: [],
    top_customers: [], status_breakdown: [],
    prev_total: 0, prev_by_sale_type: [], prev_top_customers: [],
  };

  return {
    period_days:        period,
    daily_orders:       r.daily_orders       ?? [],
    by_sale_type:       r.by_sale_type       ?? [],
    by_ship_via:        r.by_ship_via         ?? [],
    top_customers:      r.top_customers       ?? [],
    status_breakdown:   r.status_breakdown    ?? [],
    prev_total:         r.prev_total          ?? 0,
    prev_by_sale_type:  r.prev_by_sale_type   ?? [],
    prev_top_customers: r.prev_top_customers  ?? [],
  };
}
