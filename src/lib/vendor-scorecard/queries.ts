import { getErpSql } from '../../../db/supabase';
import type {
  VendorListRow,
  VendorDetail,
  VendorScorecardSummary,
  VendorScorecardParams,
  BranchSpend,
  ProductGroupSpend,
  RebateProgram,
  RiskFlag,
  TierBreakpoint,
} from './types';

const BRANCH_NAMES: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

function getDateRange(range: VendorScorecardParams['range']): { start: Date; end: Date } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (range) {
    case 'MTD': return { start: new Date(y, m, 1), end: today };
    case 'QTD': return { start: new Date(y, Math.floor(m / 3) * 3, 1), end: today };
    case 'YTD': return { start: new Date(y, 0, 1), end: today };
    case 'TTM': return { start: new Date(y - 1, m, d), end: today };
    case 'FY':  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    default:    return { start: new Date(y, 0, 1), end: today };
  }
}

function fmt(d: Date): string { return d.toISOString().slice(0, 10); }

function shiftYear(d: Date, delta: number): Date {
  const c = new Date(d);
  c.setFullYear(c.getFullYear() + delta);
  return c;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Aggregate summary KPIs
// ---------------------------------------------------------------------------

export async function fetchVendorScorecardSummary(
  params: VendorScorecardParams,
): Promise<VendorScorecardSummary> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const pyStart = shiftYear(start, -1);
  const pyEnd   = shiftYear(end, -1);
  const s  = fmt(start);
  const e  = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  // Two narrow-range parallel queries instead of one wide PS→E scan.
  // MATERIALIZED header CTE forces the planner to use the receive_date index
  // first, materialise the matching headers, then join lines against that
  // small result set — preventing a full table scan of receiving_lines.
  type SpendRow = { supplier_key: string; spend: string | null };

  const [ytdRows, pyRows] = await Promise.all([
    // YTD spend + fill/OTD  (s → e, narrow)
    sql<(SpendRow & { fill_rate: string | null; otd_rate: string | null })[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num, receive_date
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        ph.supplier_key,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend,
        (
          SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0)
        )::numeric(6,4)::text AS fill_rate,
        (
          COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0)
        )::numeric(6,4)::text AS otd_rate
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY ph.supplier_key
    `,
    // PY spend only  (ps → pe, narrow)
    sql<SpendRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${ps}::date AND receive_date < ${pe}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        ph.supplier_key,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY ph.supplier_key
    `,
  ]);

  const ytdMap  = new Map(ytdRows.map((r) => [r.supplier_key, r]));
  const pyMap   = new Map(pyRows.map((r) => [r.supplier_key, toNum(r.spend)]));
  const allKeys = new Set([...ytdMap.keys(), ...pyMap.keys()]);

  let totalYTD = 0, totalPY = 0;
  let fillSum = 0, otdSum = 0, fillCount = 0, otdCount = 0;
  const ytdValues: number[] = [];

  for (const key of allKeys) {
    const row = ytdMap.get(key);
    const ytd = toNum(row?.spend);
    totalYTD += ytd;
    totalPY  += pyMap.get(key) ?? 0;
    ytdValues.push(ytd);
    const fr = toNumOrNull(row?.fill_rate);
    const or = toNumOrNull(row?.otd_rate);
    if (fr !== null) { fillSum += fr; fillCount++; }
    if (or !== null) { otdSum  += or; otdCount++; }
  }

  ytdValues.sort((a, b) => b - a);
  const top3 = ytdValues.slice(0, 3).reduce((a, v) => a + v, 0);
  const concentration = totalYTD > 0 ? (top3 / totalYTD) * 100 : 0;

  let totalEarned = 0, totalAccrued = 0, totalForecastFY = 0;
  let onTrack = 0, atRisk = 0, missed = 0;

  try {
    const rebateRows = await sql<{ earned: string; accrued: string; forecast_fy: string }[]>`
      SELECT
        COALESCE(SUM(a.earned_rebate), 0)::numeric(18,2)::text  AS earned,
        COALESCE(SUM(a.accrued_rebate), 0)::numeric(18,2)::text AS accrued,
        COALESCE(SUM(
          CASE WHEN p.target_amount > 0
            THEN p.target_amount * p.rebate_rate_pct / 100.0
            ELSE p.rebate_amount_flat
          END
        ), 0)::numeric(18,2)::text AS forecast_fy
      FROM supplier_rebate_attainment a
      JOIN supplier_rebate_programs p ON p.id = a.program_id
      WHERE p.is_active = true
        AND a.snapshot_date = (
          SELECT MAX(a2.snapshot_date) FROM supplier_rebate_attainment a2
          WHERE a2.program_id = a.program_id
        )
    `;
    totalEarned     = toNum(rebateRows[0]?.earned);
    totalAccrued    = toNum(rebateRows[0]?.accrued);
    totalForecastFY = toNum(rebateRows[0]?.forecast_fy);

    const healthRows = await sql<{ on_track: string; at_risk: string; missed: string }[]>`
      SELECT
        COUNT(*) FILTER (WHERE pct >= 0.9)::text             AS on_track,
        COUNT(*) FILTER (WHERE pct >= 0.5 AND pct < 0.9)::text AS at_risk,
        COUNT(*) FILTER (WHERE pct < 0.5)::text              AS missed
      FROM (
        SELECT
          CASE WHEN p.target_amount > 0
            THEN a.attained_amount / p.target_amount ELSE 0
          END AS pct
        FROM supplier_rebate_attainment a
        JOIN supplier_rebate_programs p ON p.id = a.program_id
        WHERE p.is_active = true
          AND a.snapshot_date = (
            SELECT MAX(a2.snapshot_date) FROM supplier_rebate_attainment a2
            WHERE a2.program_id = a.program_id
          )
      ) sub
    `;
    onTrack = parseInt(healthRows[0]?.on_track ?? '0', 10);
    atRisk  = parseInt(healthRows[0]?.at_risk   ?? '0', 10);
    missed  = parseInt(healthRows[0]?.missed     ?? '0', 10);
  } catch {
    // Tables not yet seeded
  }

  return {
    totalSpendYTD:        totalYTD,
    totalSpendPY:         totalPY,
    totalRebateEarned:    totalEarned,
    totalRebateAccrued:   totalAccrued,
    totalRebateForecastFY: totalForecastFY,
    top3ConcentrationPct: concentration,
    programsOnTrack: onTrack,
    programsAtRisk:  atRisk,
    programsMissed:  missed,
    avgFillRatePct: fillCount > 0 ? (fillSum / fillCount) * 100 : null,
    avgOtdPct:      otdCount  > 0 ? (otdSum  / otdCount)  * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Vendor leaderboard list
// ---------------------------------------------------------------------------

export async function fetchVendorList(
  params: VendorScorecardParams,
): Promise<VendorListRow[]> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const pyStart = shiftYear(start, -1);
  const pyEnd   = shiftYear(end, -1);
  const s  = fmt(start);
  const e  = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  type YtdRow = {
    supplier_key: string;
    supplier_code: string;
    supplier_name: string;
    spend_ytd: string | null;
    fill_rate: string | null;
    otd_rate:  string | null;
    last_receive_date: string | null;
  };
  type PyRow     = { supplier_key: string; spend_py: string | null };
  type OpenPoRow = { supplier_key: string; open_po_count: string; open_po_value: string | null };

  const [ytdRows, pyRows, openPoRows] = await Promise.all([
    // YTD spend + fill/OTD  (s → e)
    sql<YtdRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num, receive_date
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        ph.supplier_key,
        MAX(ph.supplier_code) AS supplier_code,
        MAX(ph.supplier_name) AS supplier_name,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend_ytd,
        (
          SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0)
        )::numeric(6,4)::text AS fill_rate,
        (
          COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0)
        )::numeric(6,4)::text AS otd_rate,
        MAX(h.receive_date)::date::text AS last_receive_date
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY ph.supplier_key
      ORDER BY spend_ytd DESC NULLS LAST
      LIMIT 200
    `,
    // PY spend only  (ps → pe)
    sql<PyRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${ps}::date AND receive_date < ${pe}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        ph.supplier_key,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend_py
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY ph.supplier_key
    `,
    // Open POs (no date filter on receiving — hits po_header directly)
    sql<OpenPoRow[]>`
      SELECT
        ph.supplier_key,
        COUNT(DISTINCT ph.po_id)::text AS open_po_count,
        SUM(pl.qty_ordered * pl.cost)::numeric(18,2)::text AS open_po_value
      FROM agility_po_header ph
      JOIN agility_po_lines pl
        ON pl.system_id = ph.system_id AND pl.po_id = ph.po_id
      WHERE ph.is_deleted = false AND pl.is_deleted = false
        AND ph.canceled = false
        AND UPPER(ph.po_status) NOT IN ('CLOSED', 'CANCELED', 'COMPLETE', 'RECEIVED')
        AND (${params.branch} = 'all' OR ph.system_id = ${params.branch})
      GROUP BY ph.supplier_key
    `,
  ]);

  const pyMap     = new Map(pyRows.map((r) => [r.supplier_key, r.spend_py]));
  const openPoMap = new Map(openPoRows.map((r) => [r.supplier_key, r]));

  // Resolve primary product group scoped to the fetched vendor keys
  let pgMap = new Map<string, string>();
  if (ytdRows.length > 0) {
    try {
      const keys = ytdRows.map((r) => r.supplier_key);
      const pgRows = await sql<{ supplier_key: string; product_group: string }[]>`
        SELECT DISTINCT ON (supplier_key) supplier_key, product_group
        FROM (
          SELECT
            ph.supplier_key,
            ai.link_product_group AS product_group,
            SUM(rl.qty * rl.cost) AS gs
          FROM agility_receiving_lines rl
          JOIN agility_receiving_header rh
            ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
          JOIN agility_po_header ph
            ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
          JOIN agility_items ai
            ON ai.system_id = rl.system_id AND ai.item_ptr = rl.item_ptr
          WHERE rl.is_deleted = false AND rh.is_deleted = false
            AND ph.is_deleted = false AND ai.is_deleted = false
            AND ph.supplier_key = ANY(${keys})
            AND rh.receive_date >= ${s}::date AND rh.receive_date < ${e}::date + 1
            AND ai.link_product_group IS NOT NULL AND ai.link_product_group <> ''
          GROUP BY ph.supplier_key, ai.link_product_group
        ) sub
        ORDER BY supplier_key, gs DESC
      `;
      pgMap = new Map(pgRows.map((r) => [r.supplier_key, r.product_group]));
    } catch {
      // Items table unavailable
    }
  }

  let rebateMap = new Map<string, { earned: number; accrued: number; progCount: number }>();
  try {
    const rebRows = await sql<{ supplier_key: string; earned: string; accrued: string; prog_count: string }[]>`
      SELECT
        p.supplier_key,
        SUM(a.earned_rebate)::numeric(18,2)::text  AS earned,
        SUM(a.accrued_rebate)::numeric(18,2)::text AS accrued,
        COUNT(p.id)::text AS prog_count
      FROM supplier_rebate_programs p
      LEFT JOIN supplier_rebate_attainment a ON a.program_id = p.id
        AND a.snapshot_date = (
          SELECT MAX(a2.snapshot_date) FROM supplier_rebate_attainment a2
          WHERE a2.program_id = p.id
        )
      WHERE p.is_active = true
      GROUP BY p.supplier_key
    `;
    rebateMap = new Map(
      rebRows.map((r) => [
        r.supplier_key,
        { earned: toNum(r.earned), accrued: toNum(r.accrued), progCount: parseInt(r.prog_count, 10) },
      ]),
    );
  } catch {
    // supplier_rebate_programs not seeded
  }

  const filtered =
    params.productGroup === 'all'
      ? ytdRows
      : ytdRows.filter((r) => pgMap.get(r.supplier_key) === params.productGroup);

  return filtered.slice(0, 150).map((r) => {
    const rb    = rebateMap.get(r.supplier_key);
    const op    = openPoMap.get(r.supplier_key);
    const fillN = toNumOrNull(r.fill_rate);
    const otdN  = toNumOrNull(r.otd_rate);
    return {
      supplierKey:         r.supplier_key,
      supplierCode:        r.supplier_code ?? '',
      supplierName:        r.supplier_name ?? r.supplier_key,
      primaryProductGroup: pgMap.get(r.supplier_key) ?? 'Various',
      spendYTD:  toNum(r.spend_ytd),
      spendPY:   toNum(pyMap.get(r.supplier_key)),
      rebateEarnedYTD: rb?.earned  ?? 0,
      rebateAccrued:   rb?.accrued ?? 0,
      fillRatePct: fillN !== null ? Math.min(fillN * 100, 100) : null,
      otdPct:      otdN  !== null ? Math.min(otdN  * 100, 100) : null,
      openPoCount: parseInt(op?.open_po_count ?? '0', 10),
      openPoValue: toNum(op?.open_po_value),
      lastReceiveDate:    r.last_receive_date,
      riskFlagCount:      0,
      activeProgramCount: rb?.progCount ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Single vendor detail
// ---------------------------------------------------------------------------

export async function fetchVendorDetail(
  supplierKey: string,
  params: VendorScorecardParams,
): Promise<VendorDetail | null> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const pyStart = shiftYear(start, -1);
  const pyEnd   = shiftYear(end, -1);
  const s  = fmt(start);
  const e  = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  type BranchYtdRow = {
    system_id: string;
    spend_ytd: string | null;
    fill_rate: string | null;
    otd_rate:  string | null;
  };
  type BranchPyRow = { system_id: string; spend_py: string | null };

  const [branchYtdRows, branchPyRows, pgRows, openPoRows] = await Promise.all([
    sql<BranchYtdRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num, receive_date
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        h.system_id,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend_ytd,
        (
          SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0)
        )::numeric(6,4)::text AS fill_rate,
        (
          COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0)
        )::numeric(6,4)::text AS otd_rate
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${supplierKey}
      GROUP BY h.system_id
      ORDER BY spend_ytd DESC NULLS LAST
    `,
    sql<BranchPyRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${ps}::date AND receive_date < ${pe}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        h.system_id,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend_py
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      WHERE rl.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${supplierKey}
      GROUP BY h.system_id
    `,
    sql<{ product_group: string; spend_ytd: string }[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        COALESCE(ai.link_product_group, 'Unassigned') AS product_group,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend_ytd
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_items ai
        ON ai.system_id = rl.system_id AND ai.item_ptr = rl.item_ptr AND ai.is_deleted = false
      WHERE rl.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${supplierKey}
      GROUP BY product_group
      ORDER BY spend_ytd DESC NULLS LAST
      LIMIT 20
    `,
    sql<{ open_po_count: string; open_po_value: string }[]>`
      SELECT
        COUNT(DISTINCT ph.po_id)::text AS open_po_count,
        COALESCE(SUM(pl.qty_ordered * pl.cost), 0)::numeric(18,2)::text AS open_po_value
      FROM agility_po_header ph
      JOIN agility_po_lines pl ON pl.system_id = ph.system_id AND pl.po_id = ph.po_id
      WHERE ph.is_deleted = false AND pl.is_deleted = false
        AND ph.supplier_key = ${supplierKey}
        AND ph.canceled = false
        AND UPPER(ph.po_status) NOT IN ('CLOSED', 'CANCELED', 'COMPLETE', 'RECEIVED')
        AND (${params.branch} = 'all' OR ph.system_id = ${params.branch})
    `,
  ]);

  if (branchYtdRows.length === 0 && branchPyRows.length === 0) return null;

  const pyByBranch = new Map(branchPyRows.map((r) => [r.system_id, toNum(r.spend_py)]));

  const branchBreakdown: BranchSpend[] = branchYtdRows.map((r) => ({
    systemId:    r.system_id,
    branchName:  BRANCH_NAMES[r.system_id] ?? r.system_id,
    spendYTD:    toNum(r.spend_ytd),
    spendPY:     pyByBranch.get(r.system_id) ?? 0,
    fillRatePct: toNumOrNull(r.fill_rate) !== null ? Math.min(toNum(r.fill_rate) * 100, 100) : null,
    otdPct:      toNumOrNull(r.otd_rate)  !== null ? Math.min(toNum(r.otd_rate)  * 100, 100) : null,
  }));

  const pgTotal = pgRows.reduce((acc, r) => acc + toNum(r.spend_ytd), 0);
  const productGroupBreakdown: ProductGroupSpend[] = pgRows.map((r) => ({
    productGroup: r.product_group,
    spendYTD:     toNum(r.spend_ytd),
    pctOfTotal:   pgTotal > 0 ? (toNum(r.spend_ytd) / pgTotal) * 100 : 0,
  }));

  const totalYTD = branchBreakdown.reduce((acc, r) => acc + r.spendYTD, 0);
  const totalPY  = branchBreakdown.reduce((acc, r) => acc + r.spendPY,  0);

  let rebatePrograms: RebateProgram[] = [];
  let riskFlags: RiskFlag[]           = [];
  let rebateEarned  = 0;
  let rebateAccrued = 0;

  try {
    type ProgRow = {
      id: number;
      program_name: string;
      program_type: string;
      period_start: string;
      period_end:   string;
      target_amount:    string | null;
      rebate_rate_pct:  string | null;
      product_group:    string | null;
      payout_timing:    string;
      milestone_label:  string | null;
      tier_breakpoints: TierBreakpoint[] | null;
      attained_amount:  string | null;
      earned_rebate:    string | null;
      accrued_rebate:   string | null;
    };

    const progRows = await sql<ProgRow[]>`
      SELECT
        p.id, p.program_name, p.program_type,
        p.period_start::text, p.period_end::text,
        p.target_amount::text, p.rebate_rate_pct::text,
        p.product_group, p.payout_timing, p.milestone_label, p.tier_breakpoints,
        a.attained_amount::text, a.earned_rebate::text, a.accrued_rebate::text
      FROM supplier_rebate_programs p
      LEFT JOIN supplier_rebate_attainment a ON a.program_id = p.id
        AND a.snapshot_date = (
          SELECT MAX(a2.snapshot_date) FROM supplier_rebate_attainment a2
          WHERE a2.program_id = p.id
        )
      WHERE p.supplier_key = ${supplierKey} AND p.is_active = true
      ORDER BY p.program_type, p.period_start
    `;

    rebatePrograms = progRows.map((r) => {
      const attained = toNum(r.attained_amount);
      const target   = toNumOrNull(r.target_amount);
      const rate     = toNumOrNull(r.rebate_rate_pct);
      const tiers    = r.tier_breakpoints ?? null;
      let toNext:   number | null = null;
      let nextRate: number | null = null;
      if (tiers && target !== null) {
        const nextTier = tiers.find((t) => t.threshold > attained);
        if (nextTier) { toNext = nextTier.threshold - attained; nextRate = nextTier.rate_pct; }
      }
      return {
        id: r.id,
        programName:  r.program_name,
        programType:  r.program_type as RebateProgram['programType'],
        periodStart:  r.period_start,
        periodEnd:    r.period_end,
        targetAmount: target,
        rebateRatePct:  rate,
        productGroup:   r.product_group,
        attainedAmount: attained,
        earnedRebate:   toNum(r.earned_rebate),
        accruedRebate:  toNum(r.accrued_rebate),
        payoutTiming:   r.payout_timing,
        milestoneLabel: r.milestone_label,
        tierBreakpoints:  tiers,
        toNextTierAmount: toNext,
        nextTierRatePct:  nextRate,
      };
    });

    rebateEarned  = rebatePrograms.reduce((acc, p) => acc + p.earnedRebate,  0);
    rebateAccrued = rebatePrograms.reduce((acc, p) => acc + p.accruedRebate, 0);

    const flagRows = await sql<{
      id: number; flag_type: string; severity: string;
      description: string; created_at: string;
    }[]>`
      SELECT id, flag_type, severity, description, created_at::text
      FROM supplier_risk_flags
      WHERE supplier_key = ${supplierKey} AND is_active = true
      ORDER BY severity DESC, created_at DESC
    `;
    riskFlags = flagRows.map((r) => ({
      id: r.id,
      flagType:    r.flag_type,
      severity:    r.severity as RiskFlag['severity'],
      description: r.description,
      createdAt:   r.created_at,
    }));
  } catch {
    // Tables not yet seeded
  }

  return {
    supplierKey,
    supplierCode: '',
    supplierName: supplierKey,
    spendYTD:        totalYTD,
    spendPY:         totalPY,
    rebateEarnedYTD: rebateEarned,
    rebateAccrued:   rebateAccrued,
    fillRatePct: branchBreakdown[0]?.fillRatePct ?? null,
    otdPct:      branchBreakdown[0]?.otdPct      ?? null,
    openPoCount: parseInt(openPoRows[0]?.open_po_count ?? '0', 10),
    openPoValue: toNum(openPoRows[0]?.open_po_value),
    branchBreakdown,
    productGroupBreakdown,
    rebatePrograms,
    riskFlags,
  };
}

// ---------------------------------------------------------------------------
// Distinct product groups (for filter chips)
// ---------------------------------------------------------------------------

export async function fetchProductGroups(
  params: Pick<VendorScorecardParams, 'range' | 'branch'>,
): Promise<string[]> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const s = fmt(start);
  const e = fmt(end);

  const rows = await sql<{ product_group: string }[]>`
    WITH h AS MATERIALIZED (
      SELECT system_id, po_id, receive_num
      FROM agility_receiving_header
      WHERE is_deleted = false
        AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
        AND (${params.branch} = 'all' OR system_id = ${params.branch})
    )
    SELECT DISTINCT ai.link_product_group AS product_group
    FROM h
    JOIN agility_receiving_lines rl
      ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
    JOIN agility_items ai
      ON ai.system_id = rl.system_id AND ai.item_ptr = rl.item_ptr
    WHERE rl.is_deleted = false AND ai.is_deleted = false
      AND ai.link_product_group IS NOT NULL AND ai.link_product_group <> ''
    ORDER BY product_group
    LIMIT 40
  `;

  return rows.map((r) => r.product_group);
}
