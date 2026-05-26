// ERP read queries powering the personalized homepage (/api/home).
//
// Extracted from app/api/home/route.ts so the slow agility_* aggregates
// can sit behind erpCache() and be shared across concurrent users inside
// the 5-minute window. The bids-schema queries stay in the route handler
// because they read mutable per-user state (open bids, designs,
// activity, page-visit counts) that should not be cached.

import { getErpSql, isErpConfigured } from '../../../db/supabase';
import { erpCache } from '../erp-cache';

export interface RecentOrder {
  so_id: string;
  cust_name: string | null;
  cust_code: string | null;
  reference: string | null;
  so_status: string | null;
  salesperson: string | null;
  created_date: string | null;
  expect_date: string | null;
  system_id: string | null;
}

export interface HomeErpKpis {
  openPicks: number;
  openWorkOrders: number;
  openOrders: number;
  invoiced30d: number;
  recentOrders: RecentOrder[];
}

const EMPTY: HomeErpKpis = {
  openPicks: 0,
  openWorkOrders: 0,
  openOrders: 0,
  invoiced30d: 0,
  recentOrders: [],
};

async function _fetchHomeErpKpis(branchScope: string | null): Promise<HomeErpKpis> {
  if (!isErpConfigured()) return EMPTY;

  const erpSql = getErpSql();
  const branchFilter = branchScope ? erpSql`AND soh.system_id = ${branchScope}` : erpSql``;
  const branchFilterNoAlias = branchScope ? erpSql`AND system_id = ${branchScope}` : erpSql``;

  // Important: do NOT catch individual query failures here. Promise.all
  // throwing means erpCache() never stores the result, so a transient
  // failure isn't poisoned into the cache for the full 5-min TTL. The
  // route handler at /api/home wraps this call in its own .catch() to
  // surface zeros for one request while the next request retries.
  const [picksRes, woRes, openOrdersRes, invoicedRes, recentOrdersRes] = await Promise.all([
    // Open picks
    erpSql<{ cnt: number }[]>`
      SELECT COUNT(DISTINCT soh.so_id)::int AS cnt
      FROM agility_so_header soh
      JOIN agility_so_lines sol
        ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id
        AND sol.is_deleted = false
      LEFT JOIN (
        SELECT system_id, so_id, MAX(invoice_date::date) AS invoice_date
        FROM agility_shipments
        WHERE is_deleted = false
        GROUP BY system_id, so_id
      ) sh ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('C')
        AND (
          UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
          OR (UPPER(COALESCE(soh.so_status, '')) = 'I'
              AND sh.invoice_date = (NOW() AT TIME ZONE 'America/Chicago')::date)
          OR soh.expect_date::date = (NOW() AT TIME ZONE 'America/Chicago')::date
        )
        AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
        AND soh.system_id NOT IN ('', 'SYSTEM')
        ${branchFilter}
    `,

    // Open work orders
    erpSql<{ cnt: number }[]>`
      SELECT COUNT(DISTINCT wh.wo_id)::int AS cnt
      FROM agility_wo_header wh
      LEFT JOIN agility_so_header soh
        ON soh.so_id = wh.source_id::text AND soh.is_deleted = false
      WHERE wh.is_deleted = false
        AND UPPER(COALESCE(wh.wo_status, '')) NOT IN ('COMPLETED', 'CANCELED', 'C')
        AND COALESCE(soh.system_id, '') NOT IN ('', 'SYSTEM')
        ${branchFilter}
    `,

    // Open orders (status 'O')
    erpSql<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt
      FROM agility_so_header
      WHERE is_deleted = false
        AND UPPER(COALESCE(so_status, '')) = 'O'
        ${branchFilterNoAlias}
    `,

    // Invoiced in last 30 days
    erpSql<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt
      FROM agility_so_header
      WHERE is_deleted = false
        AND UPPER(COALESCE(so_status, '')) = 'I'
        AND created_date >= CURRENT_DATE - INTERVAL '30 days'
        ${branchFilterNoAlias}
    `,

    // Recent orders (last 15, newest first, active statuses)
    erpSql<RecentOrder[]>`
      SELECT
        so_id,
        cust_name,
        cust_code,
        reference,
        so_status,
        UPPER(TRIM(salesperson)) AS salesperson,
        created_date::text,
        expect_date::text,
        system_id
      FROM agility_so_header
      WHERE is_deleted = false
        AND UPPER(COALESCE(so_status, '')) IN ('O', 'K', 'P', 'S')
        AND system_id NOT IN ('', 'SYSTEM')
        ${branchFilterNoAlias}
      ORDER BY created_date DESC NULLS LAST, so_id DESC
      LIMIT 15
    `,
  ]);

  return {
    openPicks: picksRes[0]?.cnt ?? 0,
    openWorkOrders: woRes[0]?.cnt ?? 0,
    openOrders: openOrdersRes[0]?.cnt ?? 0,
    invoiced30d: invoicedRes[0]?.cnt ?? 0,
    recentOrders: (recentOrdersRes ?? []) as RecentOrder[],
  };
}

export const fetchHomeErpKpis = erpCache(_fetchHomeErpKpis, ['home-erp-kpis']);
