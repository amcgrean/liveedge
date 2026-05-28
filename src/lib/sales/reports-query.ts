// Shared query for /api/sales/reports and the sales-reports report-digest
// subscription. Single SQL invocation; isolated here so the cron path can
// reuse the same code the UI hits.
//
// Wrapped in erpCache (5-min TTL) so concurrent users and the cron digest
// share a single result set rather than each triggering this heavy JSON-agg
// query independently.

import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';

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

async function _fetchSalesReports(params: SalesReportsQueryParams): Promise<SalesReportsPayload> {
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

  // NOTE on cust_name fallback: ~75% of recent agility_so_header rows ship with a
  // blank cust_name (header cust_name is unreliable — the actual name lives on
  // agility_customers, joined via cust_key). Same pattern documented in CLAUDE.md
  // for credit-memo handling. Without this LATERAL fallback the digest groups
  // every blank-name row together and the email shows the top customer as
  // "(unknown)" — that was the 2026-05-28 user-reported regression.
  const rows = await sql<ResultRow[]>`
    WITH filtered AS (
      SELECT
        soh.so_id,
        soh.created_date::date            AS order_date,
        COALESCE(NULLIF(TRIM(soh.sale_type), ''), 'UNKNOWN') AS sale_type,
        COALESCE(NULLIF(TRIM(soh.ship_via),  ''), 'UNKNOWN') AS ship_via,
        COALESCE(NULLIF(TRIM(soh.cust_name), ''), ac.cust_name) AS cust_name,
        UPPER(COALESCE(soh.so_status, '')) AS so_status
      FROM agility_so_header soh
      LEFT JOIN LATERAL (
        SELECT cust_name FROM agility_customers
        WHERE cust_key = soh.cust_key AND is_deleted = false
        LIMIT 1
      ) ac ON true
      WHERE soh.is_deleted = false
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        AND soh.created_date >= ${since}::date
        AND soh.created_date <= CURRENT_DATE
        AND UPPER(COALESCE(soh.so_status, '')) != 'C'
    ),
    prev_filtered AS (
      SELECT
        soh.so_id,
        COALESCE(NULLIF(TRIM(soh.sale_type), ''), 'UNKNOWN') AS sale_type,
        COALESCE(NULLIF(TRIM(soh.cust_name), ''), ac.cust_name) AS cust_name
      FROM agility_so_header soh
      LEFT JOIN LATERAL (
        SELECT cust_name FROM agility_customers
        WHERE cust_key = soh.cust_key AND is_deleted = false
        LIMIT 1
      ) ac ON true
      WHERE soh.is_deleted = false
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        AND soh.created_date >= ${sincePrev}::date
        AND soh.created_date <= ${untilPrev}::date
        AND UPPER(COALESCE(soh.so_status, '')) != 'C'
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

// 5-min server-side cache. Cache key includes all params so (period=30, branch='')
// and (period=30, branch='20GR') never collide.
// IMPORTANT: do NOT put .catch() inside _fetchSalesReports — let failures throw
// so erpCache never stores a partial result. The caller applies the fallback.
export const fetchSalesReports = erpCache(_fetchSalesReports, ['sales-reports']);
