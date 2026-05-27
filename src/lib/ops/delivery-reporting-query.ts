// Shared query for /api/ops/delivery-reporting and the delivery-reports
// subscription digest.
//
// Wrapped in erpCache (5-min TTL) so concurrent users and the cron digest
// share one result set rather than each hitting the shipments × SO join
// independently.

import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';

export interface DeliveryReportRow {
  ship_date: string;
  system_id: string;
  so_id: string;
  sale_type: string | null;
  ship_via: string | null;
  line_count: number;
}

export interface DailyBranchCell {
  date: string;
  system_id: string;
  count: number;
}

export interface DeliveryReportPayload {
  window: string;
  sale_type: string;
  active_dates: string[];
  by_date: { date: string; count: number }[];
  by_date_branch: DailyBranchCell[];
  by_sale_type: { sale_type: string; count: number }[];
  by_sale_type_branch: { sale_type: string; system_id: string; count: number }[];
  by_ship_via: { ship_via: string; count: number }[];
  detail: DeliveryReportRow[];
}

export interface DeliveryReportQueryParams {
  windowParam: '7d' | '30d' | '90d';
  saleTypeParam: string;
  branchParam: string;
  dateParam?: string;
  detailLimit?: number;
}

async function _fetchDeliveryReport(args: DeliveryReportQueryParams): Promise<DeliveryReportPayload> {
  const windowDays = args.windowParam === '7d' ? 7 : args.windowParam === '90d' ? 90 : 30;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const saleTypeFilter = args.saleTypeParam !== 'all' ? args.saleTypeParam.toUpperCase() : null;
  const detailLimit = Math.min(1000, Math.max(1, args.detailLimit ?? 250));
  const branchParam = args.branchParam || '';
  const dateParam = args.dateParam ?? '';

  const sql = getErpSql();

  type ResultRow = {
    result: {
      by_date:             { date: string; count: number }[]                                | null;
      by_date_branch:      DailyBranchCell[]                                                | null;
      by_sale_type:        { sale_type: string; count: number }[]                           | null;
      by_sale_type_branch: { sale_type: string; system_id: string; count: number }[]        | null;
      by_ship_via:         { ship_via: string;  count: number }[]                           | null;
      detail:              DeliveryReportRow[]                                              | null;
    };
  };

  const rows = await sql<ResultRow[]>`
    WITH filtered AS (
      SELECT
        soh.so_id,
        soh.system_id,
        CAST(sh.ship_date AS DATE)            AS ship_date,
        UPPER(COALESCE(soh.sale_type, ''))    AS sale_type_norm,
        COALESCE(soh.sale_type, 'Unknown')    AS sale_type_raw,
        COALESCE(sh.ship_via, soh.ship_via, 'Unknown') AS ship_via
      FROM agility_shipments sh
      JOIN agility_so_header soh
        ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id
      WHERE soh.is_deleted = false
        AND CAST(sh.ship_date AS DATE) >= ${since}::date
        AND CAST(sh.ship_date AS DATE) <= CURRENT_DATE
        AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
        ${branchParam ? sql`AND soh.system_id = ${branchParam}` : sql``}
        ${saleTypeFilter ? sql`AND UPPER(COALESCE(soh.sale_type, '')) = ${saleTypeFilter}` : sql``}
        ${dateParam ? sql`AND CAST(sh.ship_date AS DATE) = ${dateParam}::date` : sql``}
    ),
    uniq AS (
      SELECT DISTINCT system_id, so_id, ship_date, sale_type_raw, ship_via FROM filtered
    ),
    detail_window AS (
      SELECT
        system_id, so_id, ship_date, sale_type_raw AS sale_type, ship_via,
        COALESCE((
          SELECT COUNT(*)::int
          FROM agility_so_lines sol
          WHERE sol.system_id = uniq.system_id
            AND sol.so_id     = uniq.so_id
            AND sol.is_deleted = false
        ), 0) AS line_count
      FROM uniq
      ORDER BY ship_date DESC, so_id DESC
      LIMIT ${detailLimit}
    )
    SELECT json_build_object(
      'by_date', (
        SELECT COALESCE(json_agg(d ORDER BY d.date ASC), '[]'::json)
        FROM (
          SELECT ship_date::text AS date, COUNT(*)::int AS count
          FROM uniq GROUP BY ship_date
        ) d
      ),
      'by_date_branch', (
        SELECT COALESCE(json_agg(d ORDER BY d.date ASC, d.system_id ASC), '[]'::json)
        FROM (
          SELECT ship_date::text AS date, system_id, COUNT(*)::int AS count
          FROM uniq GROUP BY ship_date, system_id
        ) d
      ),
      'by_sale_type', (
        SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
        FROM (
          SELECT sale_type_raw AS sale_type, COUNT(*)::int AS count
          FROM uniq GROUP BY sale_type_raw
        ) s
      ),
      'by_sale_type_branch', (
        SELECT COALESCE(json_agg(s ORDER BY s.sale_type ASC, s.system_id ASC), '[]'::json)
        FROM (
          SELECT sale_type_raw AS sale_type, system_id, COUNT(*)::int AS count
          FROM uniq GROUP BY sale_type_raw, system_id
        ) s
      ),
      'by_ship_via', (
        SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
        FROM (
          SELECT ship_via, COUNT(*)::int AS count
          FROM uniq GROUP BY ship_via
          ORDER BY COUNT(*) DESC LIMIT 20
        ) s
      ),
      'detail', (
        SELECT COALESCE(json_agg(json_build_object(
          'ship_date',  ship_date::text,
          'system_id',  system_id,
          'so_id',      so_id::text,
          'sale_type',  sale_type,
          'ship_via',   ship_via,
          'line_count', line_count
        )), '[]'::json)
        FROM detail_window
      )
    ) AS result
  `;

  const r = rows[0]?.result ?? {
    by_date: [], by_date_branch: [], by_sale_type: [], by_sale_type_branch: [], by_ship_via: [], detail: [],
  };
  const byDate = r.by_date ?? [];

  return {
    window: args.windowParam,
    sale_type: args.saleTypeParam,
    active_dates: byDate.map((d) => d.date),
    by_date: byDate,
    by_date_branch: r.by_date_branch ?? [],
    by_sale_type: r.by_sale_type ?? [],
    by_sale_type_branch: r.by_sale_type_branch ?? [],
    by_ship_via: r.by_ship_via ?? [],
    detail: r.detail ?? [],
  };
}

// 5-min server-side cache. All args (windowParam, saleTypeParam, branchParam,
// dateParam, detailLimit) are serialized as part of the cache key automatically
// by unstable_cache, so drill-down calls with different params get their own
// independent cache entries.
// IMPORTANT: do NOT add .catch() inside _fetchDeliveryReport — let failures
// throw so erpCache never stores a partial/empty result.
export const fetchDeliveryReport = erpCache(_fetchDeliveryReport, ['ops-delivery-reporting']);
