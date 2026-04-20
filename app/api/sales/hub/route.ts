import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

type Count = { cnt: string };

export interface HubKPIs {
  myOpenOrders: number;
  myWrittenOrders: number;
  branchWillCalls: number;
  myCustomerWillCalls: number;
  willCallsIWrote: number;
  openQuotes: number;
  openDesigns: number;
  openServiceRequests: number;
  myOpenPOs: number;
  posIWrote: number;
}

export interface HubCustomer {
  cust_code: string;
  cust_name: string;
  order_count: number;
}

export interface HubActivity {
  type: 'order' | 'will_call' | 'bid' | 'design' | 'service';
  title: string;
  subtitle: string;
  time: string;
}

export interface HubTransaction {
  so_id: string;
  cust_name: string | null;
  cust_code: string | null;
  reference: string | null;
  so_status: string;
  sale_type: string | null;
  expect_date: string | null;
  created_date: string | null;
  salesperson: string | null;
  system_id: string;
}

export interface HubData {
  kpis: HubKPIs;
  topCustomers: HubCustomer[];
  recentActivity: HubActivity[];
  recentTransactions: HubTransaction[];
  username: string;
  _debug?: { repUsed: string; agentIdInDb: string | null; branchReps: string[] };
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const EMPTY: HubData = {
  kpis: { myOpenOrders: 0, myWrittenOrders: 0, branchWillCalls: 0, myCustomerWillCalls: 0, willCallsIWrote: 0, openQuotes: 0, openDesigns: 0, openServiceRequests: 0, myOpenPOs: 0, posIWrote: 0 },
  topCustomers: [],
  recentActivity: [],
  recentTransactions: [],
  username: '',
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const branch = session.user.branch ?? null;
  const sql = getErpSql();

  const userRows = await sql<{ username: string | null; agent_id: string | null }[]>`
    SELECT username, agent_id FROM public.app_users WHERE id = ${userId} AND is_active = true LIMIT 1
  `;
  // Prefer agent_id (ERP rep code); fall back to username for users not yet migrated
  const repRaw = userRows[0]?.agent_id ?? userRows[0]?.username ?? '';
  const rep = repRaw.toUpperCase().trim();
  if (!rep) return NextResponse.json(EMPTY);
  const username = userRows[0]?.username ?? '';

  // Debug: show sample of actual salesperson values in this branch so mismatches are visible
  const sampleRepsRes = await sql<{ rep: string }[]>`
    SELECT DISTINCT UPPER(TRIM(salesperson)) AS rep
    FROM public.agility_so_header
    WHERE is_deleted = false
      AND salesperson IS NOT NULL AND TRIM(salesperson) <> ''
      ${branch ? sql`AND system_id = ${branch}` : sql``}
    ORDER BY rep LIMIT 30
  `;

  type TopCustRow = { cust_code: string; cust_name: string | null; order_count: string };
  type BidActRow  = { bid_id: number; action: string; project_name: string; customer_name: string; ts: string };
  type DesActRow  = { design_id: number; action: string; plan_name: string; customer_name: string; ts: string };

  const [
    openOrdersRes,
    writtenOrdersRes,
    branchWCRes,
    myWCRes,
    custWCRes,
    openQuotesRes,
    openDesignsRes,
    openSvcRes,
    openPOsRes,
  ] = await Promise.all([
    // My open orders — I am agent 1 (salesperson)
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(salesperson)) = ${rep}
        AND so_status NOT IN ('I', 'C')
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // My written orders — agent 1, written in the last 30 days
    // TODO: replace salesperson filter with agent_three column once column name is confirmed
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(salesperson)) = ${rep}
        AND created_date >= CURRENT_DATE - INTERVAL '30 days'
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // Branch will calls open
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(sale_type)) = 'WC'
        AND so_status NOT IN ('I', 'C')
        ${branch ? sql`AND system_id = ${branch}` : sql``}
    `,
    // Will calls I wrote
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(sale_type)) = 'WC'
        AND so_status NOT IN ('I', 'C')
        AND UPPER(TRIM(salesperson)) = ${rep}
    `,
    // Will calls for my customers (cross-schema join)
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt
      FROM public.agility_so_header soh
      WHERE soh.is_deleted = false
        AND UPPER(TRIM(soh.sale_type)) = 'WC'
        AND soh.so_status NOT IN ('I', 'C')
        AND soh.cust_code IN (
          SELECT c."customerCode" FROM bids.customer c
          WHERE UPPER(TRIM(c.sales_agent)) = ${rep}
        )
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
    `,
    // Open quotes/bids for this rep
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt
      FROM bids.bid b
      JOIN bids."user" u ON u.id = b.sales_rep_id
      WHERE b.status NOT IN ('Complete', 'Closed', 'Cancelled')
        AND UPPER(TRIM(u.username)) = ${rep}
    `,
    // Open designs for this rep's customers
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt
      FROM bids.design d
      JOIN bids.customer c ON c.id = d.customer_id
      WHERE d.status = 'Active'
        AND UPPER(TRIM(c.sales_agent)) = ${rep}
    `,
    // Open service requests created by this user
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM bids.it_service
      WHERE status = 'Open'
        AND UPPER(TRIM(createdby)) = ${rep}
    `,
    // Open POs for branch (buyer column TBD — showing branch total)
    branch
      ? sql<Count[]>`
          SELECT COUNT(*)::text AS cnt FROM public.agility_po_header
          WHERE po_status = 'O' AND system_id = ${branch}
        `
      : Promise.resolve([{ cnt: '0' }] as Count[]),
  ]);

  const [topCustRes, recentTxRes, recentBidActRes, recentDesignActRes] = await Promise.all([
    // Top customers for this rep (last 30 days)
    sql<TopCustRow[]>`
      SELECT soh.cust_code, MAX(soh.cust_name) AS cust_name, COUNT(*)::text AS order_count
      FROM public.agility_so_header soh
      WHERE soh.is_deleted = false
        AND soh.created_date >= CURRENT_DATE - INTERVAL '30 days'
        AND UPPER(TRIM(soh.salesperson)) = ${rep}
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
      GROUP BY soh.cust_code
      ORDER BY COUNT(*) DESC
      LIMIT 7
    `,
    // Recent transactions (last 10 for this rep)
    sql<HubTransaction[]>`
      SELECT so_id, cust_name, cust_code, reference, so_status, sale_type,
             expect_date::text, created_date::text, salesperson, system_id
      FROM public.agility_so_header
      WHERE is_deleted = false
        AND UPPER(TRIM(salesperson)) = ${rep}
        ${branch ? sql`AND system_id = ${branch}` : sql``}
      ORDER BY created_date DESC
      LIMIT 10
    `,
    // Recent bid activity for this rep
    sql<BidActRow[]>`
      SELECT ba.bid_id, ba.action, b.project_name, c.name AS customer_name,
             ba.timestamp::text AS ts
      FROM bids.bid_activity ba
      JOIN bids.bid b ON b.id = ba.bid_id
      JOIN bids.customer c ON c.id = b.customer_id
      JOIN bids."user" u ON u.id = ba.user_id
      WHERE UPPER(TRIM(u.username)) = ${rep}
      ORDER BY ba.timestamp DESC
      LIMIT 5
    `,
    // Recent design activity for this rep's customers
    sql<DesActRow[]>`
      SELECT da.design_id, da.action, d.plan_name, c.name AS customer_name,
             da.timestamp::text AS ts
      FROM bids.design_activity da
      JOIN bids.design d ON d.id = da.design_id
      JOIN bids.customer c ON c.id = d.customer_id
      JOIN bids."user" u ON u.id = da.user_id
      WHERE UPPER(TRIM(u.username)) = ${rep}
      ORDER BY da.timestamp DESC
      LIMIT 3
    `,
  ]);

  // Build chronological activity feed
  const activityItems: HubActivity[] = [
    ...recentTxRes.slice(0, 4).map((o: HubTransaction) => ({
      type: (o.sale_type?.toUpperCase().trim() === 'WC' ? 'will_call' : 'order') as HubActivity['type'],
      title: `SO-${o.so_id}`,
      subtitle: o.cust_name ?? '',
      time: relativeTime(o.created_date ?? ''),
    })),
    ...recentBidActRes.map((b: BidActRow) => ({
      type: 'bid' as const,
      title: `${b.action} — ${b.project_name}`,
      subtitle: b.customer_name,
      time: relativeTime(b.ts),
    })),
    ...recentDesignActRes.map((d: DesActRow) => ({
      type: 'design' as const,
      title: `${d.action} — ${d.plan_name}`,
      subtitle: d.customer_name,
      time: relativeTime(d.ts),
    })),
  ];

  return NextResponse.json({
    kpis: {
      myOpenOrders:        parseInt(openOrdersRes[0]?.cnt ?? '0', 10),
      myWrittenOrders:     parseInt(writtenOrdersRes[0]?.cnt ?? '0', 10),
      branchWillCalls:     parseInt(branchWCRes[0]?.cnt ?? '0', 10),
      myCustomerWillCalls: parseInt(custWCRes[0]?.cnt ?? '0', 10),
      willCallsIWrote:     parseInt(myWCRes[0]?.cnt ?? '0', 10),
      openQuotes:          parseInt(openQuotesRes[0]?.cnt ?? '0', 10),
      openDesigns:         parseInt(openDesignsRes[0]?.cnt ?? '0', 10),
      openServiceRequests: parseInt(openSvcRes[0]?.cnt ?? '0', 10),
      myOpenPOs:           parseInt(openPOsRes[0]?.cnt ?? '0', 10),
      posIWrote:           0, // TODO: filter by buyer_two column once name confirmed
    },
    topCustomers: topCustRes.map((c: TopCustRow) => ({
      cust_code: c.cust_code,
      cust_name: c.cust_name ?? 'Unknown',
      order_count: parseInt(c.order_count, 10),
    })),
    recentActivity: activityItems,
    recentTransactions: recentTxRes,
    username,
    // Temporary debug — remove once agent_id matching is confirmed
    _debug: { repUsed: rep, agentIdInDb: userRows[0]?.agent_id ?? null, branchReps: sampleRepsRes.map((r: { rep: string }) => r.rep) },
  } satisfies HubData);
}
