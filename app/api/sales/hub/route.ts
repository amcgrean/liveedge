import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';
import { fetchHubErpData, type HubCustomer, type HubTransaction } from '../../../../src/lib/sales/hub-queries';

type Count = { cnt: string };

export type { HubCustomer, HubTransaction };

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

export interface HubActivity {
  type: 'order' | 'will_call' | 'bid' | 'design' | 'service';
  title: string;
  subtitle: string;
  time: string;
}

export interface HubData {
  kpis: HubKPIs;
  topCustomers: HubCustomer[];
  recentActivity: HubActivity[];
  recentTransactions: HubTransaction[];
  username: string;
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
  const authResult = await requireCapability('sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

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

  type BidActRow  = { bid_id: number; action: string; project_name: string; customer_name: string; ts: string };
  type DesActRow  = { design_id: number; action: string; plan_name: string; customer_name: string; ts: string };

  // ERP queries are cached for 5 minutes via erpCache() keyed on (rep, branch).
  // Bids-schema queries (openQuotes / openDesigns / openServiceRequests /
  // bid + design activity) read mutable per-user state so stay uncached.
  const [
    erpData,
    openQuotesRes,
    openDesignsRes,
    openSvcRes,
    recentBidActRes,
    recentDesignActRes,
  ] = await Promise.all([
    fetchHubErpData(rep, branch),
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt
      FROM bids.bid b
      JOIN bids."user" u ON u.id = b.sales_rep_id
      WHERE b.status NOT IN ('Complete', 'Closed', 'Cancelled')
        AND UPPER(TRIM(u.username)) = ${rep}
    `,
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt
      FROM bids.design d
      JOIN bids.customer c ON c.id = d.customer_id
      WHERE d.status = 'Active'
        AND UPPER(TRIM(c.sales_agent)) = ${rep}
    `,
    sql<Count[]>`
      SELECT COUNT(*)::text AS cnt FROM bids.it_service
      WHERE status = 'Open'
        AND UPPER(TRIM(createdby)) = ${rep}
    `,
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
    ...erpData.recentTransactions.slice(0, 4).map((o: HubTransaction) => ({
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
      myOpenOrders:        erpData.myOpenOrders,
      myWrittenOrders:     erpData.myWrittenOrders,
      branchWillCalls:     erpData.branchWillCalls,
      myCustomerWillCalls: erpData.myCustomerWillCalls,
      willCallsIWrote:     erpData.willCallsIWrote,
      openQuotes:          parseInt(openQuotesRes[0]?.cnt ?? '0', 10),
      openDesigns:         parseInt(openDesignsRes[0]?.cnt ?? '0', 10),
      openServiceRequests: parseInt(openSvcRes[0]?.cnt ?? '0', 10),
      myOpenPOs:           erpData.myOpenPOs,
      posIWrote:           0, // TODO: filter by buyer_two column once name confirmed
    },
    topCustomers: erpData.topCustomers,
    recentActivity: activityItems,
    recentTransactions: erpData.recentTransactions,
    username,
  } satisfies HubData);
}
