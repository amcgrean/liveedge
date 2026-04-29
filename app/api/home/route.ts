import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { getErpSql, isErpConfigured } from '../../../db/supabase';
import { legacyBid, legacyDesign, legacyBidActivity } from '../../../db/schema-legacy';
import { eq, sql, desc } from 'drizzle-orm';

export interface HomeKPIs {
  openBids: number;
  openDesigns: number;
  openPicks: number;
  openWorkOrders: number;
  openOrders: number;
  invoiced30d: number;
}

export interface ActivityItem {
  id: number;
  bidId: number;
  action: string;
  timestamp: string;
  href: string;
}

export interface TopPage {
  path: string;
  label: string;
  visit_count: number;
}

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

export interface HomeData {
  kpis: HomeKPIs;
  recentActivity: ActivityItem[];
  topPages: TopPage[];
  recentOrders: RecentOrder[];
  branchScope: string | null; // null = all branches (admin/ops/supervisor); otherwise the user's branch code
}

// Friendly labels for top pages
function pathLabel(path: string): string {
  const map: Record<string, string> = {
    '/warehouse': 'Picks Board',
    '/warehouse/open-picks': 'Open Picks',
    '/warehouse/picker-stats': 'Picker Stats',
    '/work-orders': 'Work Orders',
    '/dispatch': 'Dispatch Board',
    '/delivery': 'Delivery Tracker',
    '/sales': 'Sales Hub',
    '/sales/transactions': 'Transactions',
    '/sales/customers': 'Customers',
    '/sales/history': 'Purchase History',
    '/sales/products': 'Products & Stock',
    '/legacy-bids': 'Bids',
    '/takeoff': 'PDF Takeoff',
    '/estimating': 'Estimating App',
    '/ewp': 'EWP',
    '/projects': 'Projects',
    '/designs': 'Designs',
    '/it-issues': 'IT Issues',
    '/purchasing': 'PO Check-In',
    '/purchasing/open-pos': 'Open POs',
    '/purchasing/review': 'Review Queue',
    '/purchasing/workspace': 'Buyer Workspace',
    '/credits': 'RMA Credits',
  };
  return map[path] ?? path.replace(/^\//, '').replace(/\//g, ' › ');
}

// GET /api/home
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id ?? '';
  const userRole = (session.user as { role?: string }).role ?? '';
  const userRoles = ((session.user as { roles?: string[] }).roles ?? []) as string[];
  const userBranch = (session.user as { branch?: string | null }).branch ?? null;

  // Admin / ops / supervisor see all branches. Everyone else is scoped to their branch.
  const seesAllBranches =
    userRole === 'admin' || userRoles.some((r) => ['admin', 'ops', 'supervisor'].includes(r));
  const branchScope = seesAllBranches ? null : (userBranch && userBranch.trim() ? userBranch : null);

  const kpis: HomeKPIs = {
    openBids: 0,
    openDesigns: 0,
    openPicks: 0,
    openWorkOrders: 0,
    openOrders: 0,
    invoiced30d: 0,
  };
  let recentActivity: ActivityItem[] = [];
  let topPages: TopPage[] = [];
  let recentOrders: RecentOrder[] = [];

  const db = getDb();

  // --- Bids-schema queries (run in parallel) ---
  const bidsPromise = Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(eq(legacyBid.status, 'Incomplete'))
      .then((r) => r[0]?.count ?? 0)
      .catch(() => 0),
    db.select({ count: sql<number>`count(*)::int` })
      .from(legacyDesign)
      .where(eq(legacyDesign.status, 'Active'))
      .then((r) => r[0]?.count ?? 0)
      .catch(() => 0),
    db.select({
        id: legacyBidActivity.id,
        bidId: legacyBidActivity.bidId,
        action: legacyBidActivity.action,
        timestamp: legacyBidActivity.timestamp,
      })
      .from(legacyBidActivity)
      .orderBy(desc(legacyBidActivity.timestamp))
      .limit(10)
      .catch(() => [] as Array<{ id: number; bidId: number; action: string | null; timestamp: Date | null }>),
    db.execute(
      sql`SELECT path, visit_count FROM bids.page_visits WHERE user_id = ${userId} ORDER BY visit_count DESC LIMIT 6`
    ).then(
      (res) => res as unknown as { path: string; visit_count: number }[]
    ).catch(() => [] as { path: string; visit_count: number }[]),
  ]);

  // --- ERP queries (run in parallel) ---
  const erpPromise = (async () => {
    if (!isErpConfigured()) {
      return { openPicks: 0, openWorkOrders: 0, openOrders: 0, invoiced30d: 0, recentOrders: [] as RecentOrder[] };
    }
    const erpSql = getErpSql();
    const branchFilter = branchScope ? erpSql`AND soh.system_id = ${branchScope}` : erpSql``;
    const branchFilterNoAlias = branchScope ? erpSql`AND system_id = ${branchScope}` : erpSql``;

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
      `.catch(() => [{ cnt: 0 }]),

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
      `.catch(() => [{ cnt: 0 }]),

      // Open orders (status 'O')
      erpSql<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt
        FROM agility_so_header
        WHERE is_deleted = false
          AND UPPER(COALESCE(so_status, '')) = 'O'
          ${branchFilterNoAlias}
      `.catch(() => [{ cnt: 0 }]),

      // Invoiced in last 30 days
      erpSql<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt
        FROM agility_so_header
        WHERE is_deleted = false
          AND UPPER(COALESCE(so_status, '')) = 'I'
          AND created_date >= CURRENT_DATE - INTERVAL '30 days'
          ${branchFilterNoAlias}
      `.catch(() => [{ cnt: 0 }]),

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
      `.catch(() => [] as RecentOrder[]),
    ]);

    return {
      openPicks: picksRes[0]?.cnt ?? 0,
      openWorkOrders: woRes[0]?.cnt ?? 0,
      openOrders: openOrdersRes[0]?.cnt ?? 0,
      invoiced30d: invoicedRes[0]?.cnt ?? 0,
      recentOrders: (recentOrdersRes ?? []) as RecentOrder[],
    };
  })();

  // Await both branches of work in parallel
  const [
    [openBidsCount, openDesignsCount, activityRows, pagesRows],
    erpData,
  ] = await Promise.all([bidsPromise, erpPromise]);

  kpis.openBids = openBidsCount;
  kpis.openDesigns = openDesignsCount;
  kpis.openPicks = erpData.openPicks;
  kpis.openWorkOrders = erpData.openWorkOrders;
  kpis.openOrders = erpData.openOrders;
  kpis.invoiced30d = erpData.invoiced30d;
  recentOrders = erpData.recentOrders;

  recentActivity = activityRows.map((a) => ({
    id: a.id,
    bidId: a.bidId,
    action: a.action ?? '',
    timestamp: a.timestamp?.toISOString() ?? '',
    href: `/legacy-bids/${a.bidId}`,
  }));

  topPages = pagesRows.map((r) => ({
    path: r.path,
    label: pathLabel(r.path),
    visit_count: r.visit_count,
  }));

  return NextResponse.json({
    kpis,
    recentActivity,
    topPages,
    recentOrders,
    branchScope,
  } satisfies HomeData);
}
