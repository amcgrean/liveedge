// ERP read queries powering the Sales Hub (/api/sales/hub).
//
// Extracted from app/api/sales/hub/route.ts so the agility_* aggregates
// can sit behind erpCache(). Keyed on (rep, branch) so a rep change or
// branch change doesn't collide with a cached payload for another user.
//
// The bids-schema queries (openQuotes, openDesigns, openServiceRequests,
// recentBidActivity, recentDesignActivity) stay in the route handler —
// they read mutable per-user state that shouldn't lag by 5 minutes.

import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';

type Count = { cnt: string };

export interface HubTransaction {
  so_id: string;
  cust_name: string | null;
  cust_code: string | null;
  reference: string | null;
  so_status: string;
  sale_type: string | null;
  expect_date: string | null;
  created_date: string | null;
  rep_1: string | null;
  system_id: string;
}

export interface HubCustomer {
  cust_code: string;
  cust_name: string;
  order_count: number;
}

export interface HubErpData {
  myOpenOrders: number;
  myWrittenOrders: number;
  branchWillCalls: number;
  myCustomerWillCalls: number;
  willCallsIWrote: number;
  myOpenPOs: number;
  topCustomers: HubCustomer[];
  recentTransactions: HubTransaction[];
}

async function _fetchHubErpData(rep: string, branch: string | null): Promise<HubErpData> {
  const sql = getErpSql();
  type TopCustRow = { cust_code: string; cust_name: string | null; order_count: string };

  const [
    openOrdersRes,
    writtenOrdersRes,
    branchWCRes,
    myWCRes,
    custWCRes,
    openPOsRes,
    topCustRes,
    recentTxRes,
  ] = await Promise.all([
    // My open orders — I am rep_1 (account rep on order)
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(rep_1)) = ${rep}
        AND so_status NOT IN ('I', 'C')
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // My written orders — rep_3 (who wrote the ticket), last 30 days
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(rep_3)) = ${rep}
        AND created_date >= CURRENT_DATE - INTERVAL '30 days'
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // Branch will calls open (not yet staged/delivered/invoiced/closed)
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(sale_type)) = 'WILLCALL'
        AND COALESCE(UPPER(TRIM(so_status)), '') NOT IN ('S', 'D', 'I', 'C')
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // Will calls I wrote — rep_3 (who entered the order)
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(sale_type)) = 'WILLCALL'
        AND COALESCE(UPPER(TRIM(so_status)), '') NOT IN ('S', 'D', 'I', 'C')
        AND UPPER(TRIM(rep_3)) = ${rep}
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // Will calls for my customers — rep_1 = me (I am account rep on the order)
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(sale_type)) = 'WILLCALL'
        AND COALESCE(UPPER(TRIM(so_status)), '') NOT IN ('S', 'D', 'I', 'C')
        AND UPPER(TRIM(rep_1)) = ${rep}
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // Open POs for branch (buyer column TBD — showing branch total)
    branch
      ? sql<Count[]>`
          SELECT COUNT(*)::text AS cnt FROM public.agility_po_header
          WHERE po_status = 'O' AND system_id = ${branch}
        `
      : Promise.resolve([{ cnt: '0' }] as Count[]),
    // Top customers for this rep (last 30 days, rep_1 = account rep)
    sql<TopCustRow[]>`
      SELECT soh.cust_code, MAX(soh.cust_name) AS cust_name, COUNT(*)::text AS order_count
      FROM public.agility_so_header soh
      WHERE soh.is_deleted = false
        AND soh.created_date >= CURRENT_DATE - INTERVAL '30 days'
        AND UPPER(TRIM(soh.rep_1)) = ${rep}
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
      GROUP BY soh.cust_code
      ORDER BY COUNT(*) DESC
      LIMIT 7
    `,
    // Recent transactions (last 10, rep_1 = account rep on order)
    sql<HubTransaction[]>`
      SELECT so_id, cust_name, cust_code, reference, so_status, sale_type,
             expect_date::text, created_date::text, rep_1, system_id
      FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(rep_1)) = ${rep}
        ${branch ? sql`AND system_id = ${branch}` : sql``}
      ORDER BY created_date DESC
      LIMIT 10
    `,
  ]);

  return {
    myOpenOrders:        parseInt(openOrdersRes[0]?.cnt ?? '0', 10),
    myWrittenOrders:     parseInt(writtenOrdersRes[0]?.cnt ?? '0', 10),
    branchWillCalls:     parseInt(branchWCRes[0]?.cnt ?? '0', 10),
    myCustomerWillCalls: parseInt(custWCRes[0]?.cnt ?? '0', 10),
    willCallsIWrote:     parseInt(myWCRes[0]?.cnt ?? '0', 10),
    myOpenPOs:           parseInt(openPOsRes[0]?.cnt ?? '0', 10),
    topCustomers: topCustRes.map((c) => ({
      cust_code: c.cust_code,
      cust_name: c.cust_name ?? 'Unknown',
      order_count: parseInt(c.order_count, 10),
    })),
    recentTransactions: recentTxRes,
  };
}

export const fetchHubErpData = erpCache(_fetchHubErpData, ['sales-hub-erp']);
