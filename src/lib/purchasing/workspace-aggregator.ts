/**
 * Workspace aggregator — computes all six tile feeds for
 * /purchasing/workspace in a single call. Per the design in
 * docs/agent-prompts/buyer-workspace-dashboard-design.md the page does
 * one fetch and renders six tiles.
 *
 * Sparklines (14-day trend) are emitted as empty arrays for v1 — we'd
 * need a daily snapshot of the engine output to populate them, which
 * is its own follow-up. The UI hides empty sparklines automatically.
 */
import { getErpSql } from '../../../db/supabase';
import { getDb } from '../../../db/index';
import { poSubmissions } from '../../../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { fetchReplenishmentRows } from './replenishment';
import { fetchMovementRows } from './movement';

export interface WorkspaceFeed {
  buyNow:          BuyNowFeed;
  outageRisk:      OutageRiskFeed;
  overduePOs:      OverduePOsFeed;
  pendingCheckins: PendingCheckinsFeed;
  poExceptions:    POExceptionsFeed;
  recentMovement:  RecentMovementFeed;
  asOf:            string;
}

export interface BuyNowFeed {
  count: number;
  estimatedValue: number;       // 0 until cost-per-item lands on engine rows
  redCount: number;
  amberCount: number;
  deltaYesterday: number;        // null when no historical snapshot
  deltaDir: 'up' | 'down' | null;
  spark: number[];               // empty until snapshot table lands
  supplierRollup: {
    name: string;
    items: number;
    value: number;
    critical: number;
    leadDays: number | null;
  }[];
}

export interface OutageRiskFeed {
  count: number;
  criticalCount: number;
  deltaYesterday: number;
  deltaDir: 'up' | 'down' | null;
  spark: number[];
  topItems: {
    sku: string;
    desc: string | null;
    branch: string;
    dtz: number;            // days to zero
    isCritical: boolean;
    category: string | null;
    onHand: number;
    weeklyUsage: number;
  }[];
}

export interface OverduePOsFeed {
  count: number;
  value: number;
  deltaYesterday: number;
  deltaDir: 'up' | 'down' | null;
  top: {
    po: string;
    vendor: string | null;
    branch: string | null;
    expect: string | null;
    daysLate: number;
    value: number;
    lines: number;
  }[];
}

export interface PendingCheckinsFeed {
  count: number;
  totalLines: number;
  withDiscrepancy: number;
  deltaYesterday: number;
  deltaDir: 'up' | 'down' | null;
  top: {
    id: string;
    po: string;
    vendor: string | null;
    branch: string | null;
    age: string;
    lines: number;
    discrepancy: boolean;
  }[];
}

export interface POExceptionsFeed {
  count: number;
  byKind: { noReceipt: number; shortReceive: number; priceVariance: number };
  deltaYesterday: number;
  deltaDir: 'up' | 'down' | null;
  top: {
    kind: 'no_receipt' | 'short_receive' | 'price_variance';
    po: string;
    vendor: string | null;
    branch: string | null;
    days: number;
    value: number | null;
    msg: string;
  }[];
}

export interface RecentMovementFeed {
  upCount: number;
  downCount: number;
  total: number;
  deltaWeek: number;
  deltaDir: 'up' | 'down' | null;
  top: {
    sku: string;
    desc: string | null;
    branch: string;
    dir: 'up' | 'down';
    pct: number;
    weeklyNow: number;
    weeklyPrior: number;
    onHand: number;
    note: string | null;
  }[];
}

export interface AggregatorOptions {
  branch: string | null;        // null = all branches (admin/main-buyer)
}

export async function buildWorkspaceFeed(opts: AggregatorOptions): Promise<WorkspaceFeed> {
  const { branch } = opts;

  // Fire the heavy lookups in parallel.
  const [buyNowRows, outageRows, overduePOs, pendingCheckins, poExceptions, movement] = await Promise.all([
    fetchReplenishmentRows({ branch, view: 'suggested', limit: 500 }),
    fetchReplenishmentRows({ branch, view: 'outages',   limit: 200 }),
    fetchOverduePOs(branch),
    fetchPendingCheckins(branch),
    fetchPOExceptions(branch),
    fetchMovementRows({ branch, minPct: 25, limit: 30 }),
  ]);

  // --- Buy Now ---
  const redCount   = buyNowRows.filter((r) => r.severity === 'red').length;
  const amberCount = buyNowRows.filter((r) => r.severity === 'amber').length;
  const supplierGrp = new Map<string, { items: number; value: number; critical: number; leadDays: number | null }>();
  for (const r of buyNowRows) {
    const key = r.supplierName ?? r.supplierCode ?? 'Unassigned';
    let e = supplierGrp.get(key);
    if (!e) { e = { items: 0, value: 0, critical: 0, leadDays: null }; supplierGrp.set(key, e); }
    e.items++;
    if (r.isCritical) e.critical++;
    if (r.leadTimeDays != null && (e.leadDays == null || r.leadTimeDays > e.leadDays)) {
      e.leadDays = r.leadTimeDays;
    }
    // Engine doesn't track $ per row yet — leave value at 0; the UI will hide it.
  }
  const supplierRollup = [...supplierGrp.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.critical - a.critical || b.items - a.items)
    .slice(0, 6);

  const buyNow: BuyNowFeed = {
    count: buyNowRows.length,
    estimatedValue: 0,
    redCount,
    amberCount,
    deltaYesterday: 0,
    deltaDir: null,
    spark: [],
    supplierRollup,
  };

  // --- Outage Risk ---
  // dtz = coverage_days (rounded down to integer; floor at 0 for items already negative)
  const outageTop = outageRows
    .slice() // copy before sort
    .sort((a, b) => {
      if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
      const ac = a.coverageDays ?? Number.POSITIVE_INFINITY;
      const bc = b.coverageDays ?? Number.POSITIVE_INFINITY;
      return ac - bc;
    })
    .slice(0, 8)
    .map((r) => ({
      sku: r.itemCode,
      desc: r.description,
      branch: r.systemId,
      dtz: r.coverageDays == null ? 999 : Math.max(0, Math.floor(r.coverageDays)),
      isCritical: r.isCritical,
      category: r.category,
      onHand: r.qtyOnHand,
      weeklyUsage: Math.round(r.usagePerDay * 7),
    }));
  const outageRisk: OutageRiskFeed = {
    count: outageRows.length,
    criticalCount: outageRows.filter((r) => r.isCritical).length,
    deltaYesterday: 0,
    deltaDir: null,
    spark: [],
    topItems: outageTop,
  };

  // --- Recent Movement ---
  const upCount   = movement.filter((m) => m.dir === 'up').length;
  const downCount = movement.filter((m) => m.dir === 'down').length;
  const recentMovement: RecentMovementFeed = {
    upCount,
    downCount,
    total: movement.length,
    deltaWeek: 0,
    deltaDir: null,
    top: movement.slice(0, 6).map((m) => ({
      sku: m.itemCode,
      desc: m.description,
      branch: m.systemId,
      dir: m.dir,
      pct: m.pctChange,
      weeklyNow: Math.round(m.weeklyNow),
      weeklyPrior: Math.round(m.weeklyPrior),
      onHand: Math.round(m.qtyOnHand),
      note: m.note,
    })),
  };

  return {
    buyNow,
    outageRisk,
    overduePOs,
    pendingCheckins,
    poExceptions,
    recentMovement,
    asOf: formatAsOf(new Date()),
  };
}

function formatAsOf(d: Date): string {
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const day = d.getDate();
  const yr  = d.getFullYear();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'p' : 'a';
  h = h % 12; if (h === 0) h = 12;
  return `${dow} ${mon} ${day} ${yr} · ${h}:${m}${ap}`;
}

// ----------------------------------------------------------------------
// Sub-feeds. These hit ERP mirror tables directly via getErpSql().
// ----------------------------------------------------------------------

async function fetchOverduePOs(branch: string | null): Promise<OverduePOsFeed> {
  const sql = getErpSql();
  // expect_date < today, open status, with line aggregates.
  const rows = await sql<OverdueRow[]>`
    WITH heads AS (
      SELECT poh.system_id, poh.po_id::text AS po_id, poh.supplier_name,
        poh.expect_date,
        DATE_PART('day', now() - poh.expect_date)::int AS days_late
      FROM agility_po_header poh
      WHERE poh.is_deleted = false
        AND poh.po_status IN ('Open','In Process')
        AND poh.expect_date IS NOT NULL
        AND poh.expect_date::date < CURRENT_DATE
        ${branch ? sql`AND poh.system_id = ${branch}` : sql``}
    ),
    line_sums AS (
      SELECT pol.system_id, pol.po_id,
        COUNT(*)::int AS line_count,
        SUM(GREATEST(0, pol.qty_ordered) * COALESCE(pol.cost, 0))::numeric AS value
      FROM agility_po_lines pol
      JOIN heads h ON h.system_id = pol.system_id AND h.po_id = pol.po_id::text
      WHERE pol.is_deleted = false AND pol.canceled = false
      GROUP BY pol.system_id, pol.po_id
    )
    SELECT h.po_id, h.supplier_name, h.system_id, h.expect_date::text AS expect,
      h.days_late,
      COALESCE(ls.line_count, 0) AS line_count,
      COALESCE(ls.value, 0)::numeric AS value
    FROM heads h
    LEFT JOIN line_sums ls ON ls.system_id = h.system_id AND ls.po_id::text = h.po_id
    ORDER BY h.days_late DESC, ls.value DESC NULLS LAST
    LIMIT 50
  `;

  const totalValue = rows.reduce((s, r) => s + Number(r.value || 0), 0);
  return {
    count: rows.length,
    value: totalValue,
    deltaYesterday: 0,
    deltaDir: null,
    top: rows.slice(0, 6).map((r) => ({
      po: r.po_id,
      vendor: r.supplier_name,
      branch: r.system_id,
      expect: r.expect ? r.expect.slice(5) : null,         // 'MM-DD'
      daysLate: r.days_late,
      value: Number(r.value || 0),
      lines: r.line_count,
    })),
  };
}

type OverdueRow = {
  po_id: string; supplier_name: string | null; system_id: string;
  expect: string | null; days_late: number; line_count: number; value: string;
};

async function fetchPendingCheckins(branch: string | null): Promise<PendingCheckinsFeed> {
  // bids.po_submissions doesn't carry per-line data, so total_lines /
  // with_discrepancy from the design map to what we can derive: total
  // count and high-priority count (priority='high' is the closest
  // proxy for "has discrepancy" until per-line submission data exists).
  try {
    const db = getDb();
    const whereConds = [eq(poSubmissions.status, 'pending')];
    if (branch) whereConds.push(eq(poSubmissions.branch, branch));

    const rows = await db
      .select({
        id: poSubmissions.id,
        poNumber: poSubmissions.poNumber,
        supplierName: poSubmissions.supplierName,
        branch: poSubmissions.branch,
        createdAt: poSubmissions.createdAt,
        priority: poSubmissions.priority,
      })
      .from(poSubmissions)
      .where(and(...whereConds))
      .orderBy(desc(poSubmissions.createdAt))
      .limit(100);

    const withDiscrepancy = rows.filter((r) => r.priority === 'high').length;
    return {
      count: rows.length,
      totalLines: 0,                       // not tracked at submission level today
      withDiscrepancy,
      deltaYesterday: 0,
      deltaDir: null,
      top: rows.slice(0, 6).map((r) => ({
        id: r.id,
        po: r.poNumber,
        vendor: r.supplierName,
        branch: r.branch,
        age: relAge(r.createdAt ? r.createdAt.toISOString() : null),
        lines: 0,
        discrepancy: r.priority === 'high',
      })),
    };
  } catch (err) {
    console.error('[workspace-aggregator pending-checkins]', err);
    return { count: 0, totalLines: 0, withDiscrepancy: 0, deltaYesterday: 0, deltaDir: null, top: [] };
  }
}

async function fetchPOExceptions(branch: string | null): Promise<POExceptionsFeed> {
  const sql = getErpSql();
  // High-severity reframing of the existing exception logic:
  //   no_receipt     — Open PO past expect_date by 7+ days with zero receipts
  //   short_receive  — PO closed/in-process with received qty < ordered (no top-up)
  //   price_variance — not derivable from mirror tables yet; return 0 for v1
  const rows = await sql<ExceptionRow[]>`
    WITH no_receipt AS (
      SELECT 'no_receipt'::text AS kind,
        poh.po_id::text AS po,
        poh.supplier_name AS vendor,
        poh.system_id AS branch,
        DATE_PART('day', now() - poh.expect_date)::int AS days,
        NULL::numeric AS value,
        'No receipts · expect was ' || to_char(poh.expect_date, 'M/D') AS msg
      FROM agility_po_header poh
      WHERE poh.is_deleted = false
        AND poh.po_status IN ('Open','In Process')
        AND poh.expect_date IS NOT NULL
        AND poh.expect_date::date < CURRENT_DATE - interval '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM agility_receiving_lines rl
          WHERE rl.system_id = poh.system_id AND rl.po_id = poh.po_id AND rl.is_deleted = false
        )
        ${branch ? sql`AND poh.system_id = ${branch}` : sql``}
    ),
    short_receive AS (
      SELECT 'short_receive'::text AS kind,
        pol.po_id::text AS po,
        poh.supplier_name AS vendor,
        pol.system_id AS branch,
        DATE_PART('day', now() - poh.expect_date)::int AS days,
        SUM((pol.qty_ordered - COALESCE(rl_sum.received, 0)) * COALESCE(pol.cost, 0))::numeric AS value,
        SUM(COALESCE(rl_sum.received, 0))::numeric || ' of ' ||
          SUM(pol.qty_ordered)::numeric || ' received' AS msg
      FROM agility_po_lines pol
      JOIN agility_po_header poh
        ON poh.system_id = pol.system_id AND poh.po_id = pol.po_id
        AND poh.is_deleted = false AND poh.po_status IN ('Open','In Process')
        AND poh.expect_date IS NOT NULL AND poh.expect_date::date < CURRENT_DATE
      LEFT JOIN LATERAL (
        SELECT SUM(rl.qty) AS received
        FROM agility_receiving_lines rl
        WHERE rl.system_id = pol.system_id AND rl.po_id = pol.po_id
          AND rl.sequence = pol.sequence AND rl.is_deleted = false
      ) rl_sum ON true
      WHERE pol.is_deleted = false AND pol.canceled = false
        AND rl_sum.received IS NOT NULL
        AND rl_sum.received < pol.qty_ordered
        ${branch ? sql`AND pol.system_id = ${branch}` : sql``}
      GROUP BY pol.po_id, pol.system_id, poh.supplier_name, poh.expect_date
    )
    SELECT * FROM no_receipt
    UNION ALL
    SELECT * FROM short_receive
    ORDER BY days DESC
    LIMIT 50
  `;

  const byKind = { noReceipt: 0, shortReceive: 0, priceVariance: 0 };
  for (const r of rows) {
    if (r.kind === 'no_receipt')     byKind.noReceipt++;
    if (r.kind === 'short_receive')  byKind.shortReceive++;
    if (r.kind === 'price_variance') byKind.priceVariance++;
  }

  return {
    count: rows.length,
    byKind,
    deltaYesterday: 0,
    deltaDir: null,
    top: rows.slice(0, 5).map((r) => ({
      kind: r.kind as 'no_receipt' | 'short_receive' | 'price_variance',
      po: r.po,
      vendor: r.vendor,
      branch: r.branch,
      days: r.days,
      value: r.value == null ? null : Number(r.value),
      msg: r.msg,
    })),
  };
}

type ExceptionRow = {
  kind: string; po: string; vendor: string | null; branch: string | null;
  days: number; value: string | null; msg: string;
};

function relAge(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 60) return mins < 1 ? '<1m' : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
