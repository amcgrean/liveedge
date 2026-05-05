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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    case 'MTD':
      return { start: new Date(y, m, 1), end: today };
    case 'QTD':
      return { start: new Date(y, Math.floor(m / 3) * 3, 1), end: today };
    case 'YTD':
      return { start: new Date(y, 0, 1), end: today };
    case 'TTM':
      return { start: new Date(y - 1, m, d), end: today };
    case 'FY':
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    default:
      return { start: new Date(y, 0, 1), end: today };
  }
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
// Aggregate summary KPIs for the scorecard header
// ---------------------------------------------------------------------------

export async function fetchVendorScorecardSummary(
  params: VendorScorecardParams,
): Promise<VendorScorecardSummary> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const pyStart = shiftYear(start, -1);
  const pyEnd = shiftYear(end, -1);
  const s = fmt(start);
  const e = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  type SpendRow = { supplier_key: string; spend_ytd: string | null; spend_py: string | null };

  const [spendRows, fillOtdRows] = await Promise.all([
    sql<SpendRow[]>`
      SELECT
        ph.supplier_key,
        SUM(rl.qty * rl.cost) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
        )::numeric(18,2)::text AS spend_ytd,
        SUM(rl.qty * rl.cost) FILTER (
          WHERE rh.receive_date::date BETWEEN ${ps}::date AND ${pe}::date
        )::numeric(18,2)::text AS spend_py
      FROM agility_receiving_lines rl
      JOIN agility_receiving_header rh
        ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
      WHERE rl.is_deleted = false AND rh.is_deleted = false AND ph.is_deleted = false
        AND rh.receive_date IS NOT NULL
        AND rh.receive_date::date BETWEEN ${ps}::date AND ${e}::date
        AND (${params.branch} = 'all' OR rh.system_id = ${params.branch})
      GROUP BY ph.supplier_key
    `,
    sql<{ avg_fill: string | null; avg_otd: string | null }[]>`
      SELECT
        AVG(fill_rate)::numeric(6,4)::text AS avg_fill,
        AVG(otd_rate)::numeric(6,4)::text AS avg_otd
      FROM (
        SELECT
          ph.supplier_key,
          SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0) AS fill_rate,
          COUNT(*) FILTER (WHERE rh.receive_date::date <= ph.expect_date::date)::numeric
            / NULLIF(COUNT(*), 0) AS otd_rate
        FROM agility_receiving_lines rl
        JOIN agility_receiving_header rh
          ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
        JOIN agility_po_header ph
          ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
        LEFT JOIN agility_po_lines pl
          ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
        WHERE rl.is_deleted = false AND rh.is_deleted = false AND ph.is_deleted = false
          AND rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
          AND (${params.branch} = 'all' OR rh.system_id = ${params.branch})
        GROUP BY ph.supplier_key
      ) sub
    `,
  ]);

  const totalYTD = spendRows.reduce((acc, r) => acc + toNum(r.spend_ytd), 0);
  const totalPY = spendRows.reduce((acc, r) => acc + toNum(r.spend_py), 0);
  const sorted = [...spendRows].sort((a, b) => toNum(b.spend_ytd) - toNum(a.spend_ytd));
  const top3 = sorted.slice(0, 3).reduce((acc, r) => acc + toNum(r.spend_ytd), 0);
  const concentration = totalYTD > 0 ? (top3 / totalYTD) * 100 : 0;

  let totalEarned = 0;
  let totalAccrued = 0;
  let totalForecastFY = 0;
  let onTrack = 0;
  let atRisk = 0;
  let missed = 0;

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
    totalEarned = toNum(rebateRows[0]?.earned);
    totalAccrued = toNum(rebateRows[0]?.accrued);
    totalForecastFY = toNum(rebateRows[0]?.forecast_fy);

    const healthRows = await sql<{ on_track: string; at_risk: string; missed: string }[]>`
      SELECT
        COUNT(*) FILTER (WHERE pct >= 0.9)::text  AS on_track,
        COUNT(*) FILTER (WHERE pct >= 0.5 AND pct < 0.9)::text AS at_risk,
        COUNT(*) FILTER (WHERE pct < 0.5)::text   AS missed
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
    // Tables not yet seeded in ERP — rebate data unavailable
  }

  const fo = fillOtdRows[0];
  const fillNum = toNumOrNull(fo?.avg_fill);
  const otdNum  = toNumOrNull(fo?.avg_otd);

  return {
    totalSpendYTD: totalYTD,
    totalSpendPY: totalPY,
    totalRebateEarned: totalEarned,
    totalRebateAccrued: totalAccrued,
    totalRebateForecastFY: totalForecastFY,
    top3ConcentrationPct: concentration,
    programsOnTrack: onTrack,
    programsAtRisk: atRisk,
    programsMissed: missed,
    avgFillRatePct: fillNum !== null ? fillNum * 100 : null,
    avgOtdPct: otdNum !== null ? otdNum * 100 : null,
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
  const pyEnd = shiftYear(end, -1);
  const s = fmt(start);
  const e = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  type SpendRow = {
    supplier_key: string;
    supplier_code: string;
    supplier_name: string;
    spend_ytd: string | null;
    spend_py: string | null;
    fill_rate: string | null;
    otd_rate: string | null;
    open_po_count: string;
    open_po_value: string | null;
    last_receive_date: string | null;
  };

  // Main query: spend, fill/OTD, open POs. Product group resolved separately
  // below to avoid a second full scan of agility_receiving_lines + agility_items.
  const rows = await sql<SpendRow[]>`
    WITH spend AS (
      SELECT
        ph.supplier_key,
        MAX(ph.supplier_code) AS supplier_code,
        MAX(ph.supplier_name) AS supplier_name,
        SUM(rl.qty * rl.cost) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
        )::numeric(18,2) AS spend_ytd,
        SUM(rl.qty * rl.cost) FILTER (
          WHERE rh.receive_date::date BETWEEN ${ps}::date AND ${pe}::date
        )::numeric(18,2) AS spend_py,
        SUM(rl.qty) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
        )::numeric
          / NULLIF(SUM(pl.qty_ordered) FILTER (
            WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
          ), 0) AS fill_rate,
        COUNT(*) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
            AND rh.receive_date::date <= ph.expect_date::date
        )::numeric
          / NULLIF(COUNT(*) FILTER (
            WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
          ), 0) AS otd_rate,
        MAX(rh.receive_date)::date::text AS last_receive_date
      FROM agility_receiving_lines rl
      JOIN agility_receiving_header rh
        ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND rh.is_deleted = false AND ph.is_deleted = false
        AND rh.receive_date IS NOT NULL
        AND rh.receive_date::date BETWEEN ${ps}::date AND ${e}::date
        AND (${params.branch} = 'all' OR rh.system_id = ${params.branch})
      GROUP BY ph.supplier_key
    ),
    open_pos AS (
      SELECT
        ph.supplier_key,
        COUNT(DISTINCT ph.po_id)::text AS open_po_count,
        SUM(pl.qty_ordered * pl.cost)::numeric(18,2)::text AS open_po_value
      FROM agility_po_header ph
      JOIN agility_po_lines pl
        ON pl.system_id = ph.system_id AND pl.po_id = ph.po_id
      WHERE ph.is_deleted = false AND pl.is_deleted = false
        AND ph.canceled = false
        AND ph.po_status NOT IN ('complete', 'closed', 'received')
        AND (${params.branch} = 'all' OR ph.system_id = ${params.branch})
      GROUP BY ph.supplier_key
    )
    SELECT
      s.supplier_key,
      s.supplier_code,
      s.supplier_name,
      s.spend_ytd::text,
      s.spend_py::text,
      s.fill_rate::numeric(6,4)::text AS fill_rate,
      s.otd_rate::numeric(6,4)::text  AS otd_rate,
      COALESCE(op.open_po_count, '0')  AS open_po_count,
      COALESCE(op.open_po_value, '0')  AS open_po_value,
      s.last_receive_date
    FROM spend s
    LEFT JOIN open_pos op ON op.supplier_key = s.supplier_key
    WHERE (s.spend_ytd > 0 OR s.spend_py > 0)
    ORDER BY s.spend_ytd DESC NULLS LAST
    LIMIT 200
  `;

  // Resolve primary product group scoped to the supplier_keys already fetched.
  // Using supplier_key = ANY(...) lets Postgres use an index scan instead of
  // a full table scan over all receiving lines.
  let pgMap = new Map<string, string>();
  if (rows.length > 0) {
    try {
      const keys = rows.map((r) => r.supplier_key);
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
            AND rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
            AND ai.link_product_group IS NOT NULL AND ai.link_product_group <> ''
          GROUP BY ph.supplier_key, ai.link_product_group
        ) sub
        ORDER BY supplier_key, gs DESC
      `;
      pgMap = new Map(pgRows.map((r) => [r.supplier_key, r.product_group]));
    } catch {
      // Items table unavailable — product group falls back to 'Various'
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
    // supplier_rebate_programs not seeded in ERP
  }

  // Apply product group filter in JS so LIMIT 200 doesn't hide matching vendors
  const filtered =
    params.productGroup === 'all'
      ? rows
      : rows.filter((r) => pgMap.get(r.supplier_key) === params.productGroup);

  return filtered.slice(0, 150).map((r) => {
    const rb = rebateMap.get(r.supplier_key);
    const fillN = toNumOrNull(r.fill_rate);
    const otdN  = toNumOrNull(r.otd_rate);
    return {
      supplierKey: r.supplier_key,
      supplierCode: r.supplier_code ?? '',
      supplierName: r.supplier_name ?? r.supplier_key,
      primaryProductGroup: pgMap.get(r.supplier_key) ?? 'Various',
      spendYTD: toNum(r.spend_ytd),
      spendPY:  toNum(r.spend_py),
      rebateEarnedYTD: rb?.earned ?? 0,
      rebateAccrued:   rb?.accrued ?? 0,
      fillRatePct: fillN !== null ? Math.min(fillN * 100, 100) : null,
      otdPct:  otdN  !== null ? Math.min(otdN  * 100, 100) : null,
      openPoCount: parseInt(r.open_po_count, 10),
      openPoValue: toNum(r.open_po_value),
      lastReceiveDate: r.last_receive_date,
      riskFlagCount: 0,
      activeProgramCount: rb?.progCount ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Single vendor detail (branch breakdown, product mix, rebate programs, risks)
// ---------------------------------------------------------------------------

export async function fetchVendorDetail(
  supplierKey: string,
  params: VendorScorecardParams,
): Promise<VendorDetail | null> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const pyStart = shiftYear(start, -1);
  const pyEnd   = shiftYear(end, -1);
  const s = fmt(start);
  const e = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  type BranchRow = {
    system_id: string;
    spend_ytd: string | null;
    spend_py: string | null;
    fill_rate: string | null;
    otd_rate: string | null;
  };

  const [branchRows, pgRows, openPoRows] = await Promise.all([
    sql<BranchRow[]>`
      SELECT
        rh.system_id,
        SUM(rl.qty * rl.cost) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
        )::numeric(18,2)::text AS spend_ytd,
        SUM(rl.qty * rl.cost) FILTER (
          WHERE rh.receive_date::date BETWEEN ${ps}::date AND ${pe}::date
        )::numeric(18,2)::text AS spend_py,
        SUM(rl.qty) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
        )::numeric
          / NULLIF(SUM(pl.qty_ordered) FILTER (
            WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
          ), 0) AS fill_rate,
        COUNT(*) FILTER (
          WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
            AND rh.receive_date::date <= ph.expect_date::date
        )::numeric
          / NULLIF(COUNT(*) FILTER (
            WHERE rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
          ), 0) AS otd_rate
      FROM agility_receiving_lines rl
      JOIN agility_receiving_header rh
        ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND rh.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${supplierKey}
        AND rh.receive_date IS NOT NULL
        AND rh.receive_date::date BETWEEN ${ps}::date AND ${e}::date
        AND (${params.branch} = 'all' OR rh.system_id = ${params.branch})
      GROUP BY rh.system_id
      ORDER BY spend_ytd DESC NULLS LAST
    `,
    sql<{ product_group: string; spend_ytd: string }[]>`
      SELECT
        COALESCE(ai.link_product_group, 'Unassigned') AS product_group,
        SUM(rl.qty * rl.cost)::numeric(18,2)::text AS spend_ytd
      FROM agility_receiving_lines rl
      JOIN agility_receiving_header rh
        ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
      LEFT JOIN agility_items ai
        ON ai.system_id = rl.system_id AND ai.item_ptr = rl.item_ptr AND ai.is_deleted = false
      WHERE rl.is_deleted = false AND rh.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${supplierKey}
        AND rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
        AND (${params.branch} = 'all' OR rh.system_id = ${params.branch})
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
        AND ph.po_status NOT IN ('complete', 'closed', 'received')
        AND (${params.branch} = 'all' OR ph.system_id = ${params.branch})
    `,
  ]);

  if (branchRows.length === 0) return null;

  const totalYTD = branchRows.reduce((acc, r) => acc + toNum(r.spend_ytd), 0);
  const totalPY  = branchRows.reduce((acc, r) => acc + toNum(r.spend_py),  0);

  const branchBreakdown: BranchSpend[] = branchRows.map((r) => ({
    systemId:    r.system_id,
    branchName:  BRANCH_NAMES[r.system_id] ?? r.system_id,
    spendYTD:    toNum(r.spend_ytd),
    spendPY:     toNum(r.spend_py),
    fillRatePct: toNumOrNull(r.fill_rate) !== null ? Math.min(toNum(r.fill_rate) * 100, 100) : null,
    otdPct:      toNumOrNull(r.otd_rate)  !== null ? Math.min(toNum(r.otd_rate)  * 100, 100) : null,
  }));

  const pgTotal = pgRows.reduce((acc, r) => acc + toNum(r.spend_ytd), 0);
  const productGroupBreakdown: ProductGroupSpend[] = pgRows.map((r) => ({
    productGroup: r.product_group,
    spendYTD: toNum(r.spend_ytd),
    pctOfTotal: pgTotal > 0 ? (toNum(r.spend_ytd) / pgTotal) * 100 : 0,
  }));

  let rebatePrograms: RebateProgram[] = [];
  let riskFlags: RiskFlag[] = [];
  let rebateEarned = 0;
  let rebateAccrued = 0;

  try {
    type ProgRow = {
      id: number;
      program_name: string;
      program_type: string;
      period_start: string;
      period_end: string;
      target_amount: string | null;
      rebate_rate_pct: string | null;
      product_group: string | null;
      payout_timing: string;
      milestone_label: string | null;
      tier_breakpoints: TierBreakpoint[] | null;
      attained_amount: string | null;
      earned_rebate: string | null;
      accrued_rebate: string | null;
    };

    const progRows = await sql<ProgRow[]>`
      SELECT
        p.id,
        p.program_name,
        p.program_type,
        p.period_start::text,
        p.period_end::text,
        p.target_amount::text,
        p.rebate_rate_pct::text,
        p.product_group,
        p.payout_timing,
        p.milestone_label,
        p.tier_breakpoints,
        a.attained_amount::text,
        a.earned_rebate::text,
        a.accrued_rebate::text
      FROM supplier_rebate_programs p
      LEFT JOIN supplier_rebate_attainment a ON a.program_id = p.id
        AND a.snapshot_date = (
          SELECT MAX(a2.snapshot_date) FROM supplier_rebate_attainment a2
          WHERE a2.program_id = p.id
        )
      WHERE p.supplier_key = ${supplierKey}
        AND p.is_active = true
      ORDER BY p.program_type, p.period_start
    `;

    rebatePrograms = progRows.map((r) => {
      const attained = toNum(r.attained_amount);
      const target   = toNumOrNull(r.target_amount);
      const rate     = toNumOrNull(r.rebate_rate_pct);
      const tiers: TierBreakpoint[] | null = r.tier_breakpoints ?? null;

      let toNext: number | null = null;
      let nextRate: number | null = null;
      if (tiers && target !== null) {
        const nextTier = tiers.find((t) => t.threshold > attained);
        if (nextTier) {
          toNext   = nextTier.threshold - attained;
          nextRate = nextTier.rate_pct;
        }
      }

      return {
        id: r.id,
        programName: r.program_name,
        programType: r.program_type as RebateProgram['programType'],
        periodStart: r.period_start,
        periodEnd:   r.period_end,
        targetAmount: target,
        rebateRatePct: rate,
        productGroup:  r.product_group,
        attainedAmount: attained,
        earnedRebate:   toNum(r.earned_rebate),
        accruedRebate:  toNum(r.accrued_rebate),
        payoutTiming:  r.payout_timing,
        milestoneLabel: r.milestone_label,
        tierBreakpoints: tiers,
        toNextTierAmount: toNext,
        nextTierRatePct:  nextRate,
      };
    });

    rebateEarned  = rebatePrograms.reduce((acc, p) => acc + p.earnedRebate, 0);
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
    // Tables not yet seeded in ERP
  }

  return {
    supplierKey,
    supplierCode: branchRows[0] ? '' : '',
    supplierName: supplierKey,
    spendYTD:       totalYTD,
    spendPY:        totalPY,
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
// Distinct product groups with spend (for filter chips)
// ---------------------------------------------------------------------------

export async function fetchProductGroups(
  params: Pick<VendorScorecardParams, 'range' | 'branch'>,
): Promise<string[]> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const s = fmt(start);
  const e = fmt(end);

  const rows = await sql<{ product_group: string }[]>`
    SELECT DISTINCT ai.link_product_group AS product_group
    FROM agility_receiving_lines rl
    JOIN agility_receiving_header rh
      ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
    JOIN agility_items ai
      ON ai.system_id = rl.system_id AND ai.item_ptr = rl.item_ptr
    WHERE rl.is_deleted = false AND rh.is_deleted = false AND ai.is_deleted = false
      AND rh.receive_date::date BETWEEN ${s}::date AND ${e}::date
      AND (${params.branch} = 'all' OR rh.system_id = ${params.branch})
      AND ai.link_product_group IS NOT NULL AND ai.link_product_group <> ''
    ORDER BY product_group
    LIMIT 40
  `;

  return rows.map((r) => r.product_group);
}
