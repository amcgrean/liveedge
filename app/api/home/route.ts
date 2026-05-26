import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { legacyBid, legacyDesign, legacyBidActivity } from '../../../db/schema-legacy';
import { eq, sql, desc } from 'drizzle-orm';
import { fetchHomeErpKpis, type RecentOrder } from '../../../src/lib/home/queries';

export type { RecentOrder };

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
  const userRole = session.user.role ?? '';
  const userRoles = (session.user.roles ?? []) as string[];
  const userBranch = session.user.branch ?? null;

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

  // ERP queries are cached for 5 minutes via erpCache(); home traffic is the
  // single biggest source of ERP read load and the data is fine to share
  // across concurrent users at this latency.
  const erpPromise = fetchHomeErpKpis(branchScope).catch(() => ({
    openPicks: 0,
    openWorkOrders: 0,
    openOrders: 0,
    invoiced30d: 0,
    recentOrders: [] as RecentOrder[],
  }));

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
