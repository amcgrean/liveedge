import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';
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
  VendorYearEntry,
  VendorItemRow,
  VendorBranchSummaryRow,
  VendorDerivedRiskFlags,
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

async function _fetchVendorScorecardSummary(
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

  type SpendRow = { supplier_key: string; spend: string | null };

  const [ytdRows, pyRows] = await Promise.all([
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
        SUM(rl.cost)::numeric(18,2)::text AS spend,
        (SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0))::numeric(6,4)::text AS fill_rate,
        (COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0))::numeric(6,4)::text AS otd_rate
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
        SUM(rl.cost)::numeric(18,2)::text AS spend
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
        SELECT CASE WHEN p.target_amount > 0
            THEN a.attained_amount / p.target_amount ELSE 0 END AS pct
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

async function _fetchVendorList(params: VendorScorecardParams): Promise<VendorListRow[]> {
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
    shipfrom_seq: number | null;
    spend_ytd: string | null;
    fill_rate: string | null;
    otd_rate:  string | null;
    last_receive_date: string | null;
  };
  type PyRow     = { supplier_key: string; spend_py: string | null };
  type OpenPoRow = { supplier_key: string; open_po_count: string; open_po_value: string | null };

  const [ytdRows, pyRows, openPoRows] = await Promise.all([
    sql<YtdRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num, receive_date
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        CASE WHEN ph.supplier_code = 'LMC1000'
          THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
          ELSE ph.supplier_key END AS supplier_key,
        MAX(ph.supplier_code) AS supplier_code,
        COALESCE(MAX(s.ship_from_name), MAX(ph.supplier_name)) AS supplier_name,
        MAX(CASE WHEN ph.supplier_code = 'LMC1000' THEN ph.shipfrom_seq ELSE NULL END) AS shipfrom_seq,
        SUM(rl.cost)::numeric(18,2)::text AS spend_ytd,
        (SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0))::numeric(6,4)::text AS fill_rate,
        (COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0))::numeric(6,4)::text AS otd_rate,
        MAX(h.receive_date)::date::text AS last_receive_date
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      LEFT JOIN agility_suppliers s
        ON s.system_id = '00CO'
        AND TRIM(s.supplier_key) = TRIM(ph.supplier_key)
        AND s.ship_from_seq = ph.shipfrom_seq
        AND s.is_deleted = false
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY
        CASE WHEN ph.supplier_code = 'LMC1000'
          THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
          ELSE ph.supplier_key END
      ORDER BY spend_ytd DESC NULLS LAST
      LIMIT 200
    `,
    sql<PyRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${ps}::date AND receive_date < ${pe}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        CASE WHEN ph.supplier_code = 'LMC1000'
          THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
          ELSE ph.supplier_key END AS supplier_key,
        SUM(rl.cost)::numeric(18,2)::text AS spend_py
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY
        CASE WHEN ph.supplier_code = 'LMC1000'
          THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
          ELSE ph.supplier_key END
    `,
    sql<OpenPoRow[]>`
      SELECT
        CASE WHEN ph.supplier_code = 'LMC1000'
          THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
          ELSE ph.supplier_key END AS supplier_key,
        COUNT(DISTINCT ph.po_id)::text AS open_po_count,
        SUM(pl.cost)::numeric(18,2)::text AS open_po_value
      FROM agility_po_header ph
      JOIN agility_po_lines pl ON pl.system_id = ph.system_id AND pl.po_id = ph.po_id
      WHERE ph.is_deleted = false AND pl.is_deleted = false
        AND ph.canceled = false
        AND UPPER(ph.po_status) NOT IN ('CLOSED', 'CANCELED', 'COMPLETE', 'RECEIVED')
        AND (${params.branch} = 'all' OR ph.system_id = ${params.branch})
      GROUP BY
        CASE WHEN ph.supplier_code = 'LMC1000'
          THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
          ELSE ph.supplier_key END
    `,
  ]);

  const pyMap     = new Map(pyRows.map((r) => [r.supplier_key, r.spend_py]));
  const openPoMap = new Map(openPoRows.map((r) => [r.supplier_key, r]));

  let pgMap = new Map<string, string>();
  if (ytdRows.length > 0) {
    try {
      const rawKeys = [...new Set(ytdRows.map((r) => r.supplier_key.split('::')[0]))];
      const pgRows = await sql<{ vendor_key: string; product_group: string }[]>`
        SELECT DISTINCT ON (vendor_key) vendor_key, product_group
        FROM (
          SELECT
            CASE WHEN ph.supplier_code = 'LMC1000'
              THEN ph.supplier_key || '::' || COALESCE(ph.shipfrom_seq::text, '0')
              ELSE ph.supplier_key END AS vendor_key,
            ai.link_product_group AS product_group,
            SUM(rl.cost) AS gs
          FROM agility_receiving_lines rl
          JOIN agility_receiving_header rh
            ON rh.system_id = rl.system_id AND rh.po_id = rl.po_id AND rh.receive_num = rl.receive_num
          JOIN agility_po_header ph
            ON ph.system_id = rh.system_id AND ph.po_id = rh.po_id
          JOIN agility_items ai
            ON ai.item_ptr = rl.item_ptr
          WHERE rl.is_deleted = false AND rh.is_deleted = false
            AND ph.is_deleted = false AND ai.is_deleted = false
            AND ph.supplier_key = ANY(${rawKeys})
            AND rh.receive_date >= ${s}::date AND rh.receive_date < ${e}::date + 1
            AND ai.link_product_group IS NOT NULL AND ai.link_product_group <> ''
          GROUP BY vendor_key, ai.link_product_group
        ) sub
        ORDER BY vendor_key, gs DESC
      `;
      pgMap = new Map(pgRows.map((r) => [r.vendor_key, r.product_group]));
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
    const rawKey = r.supplier_key.split('::')[0];
    const rb    = rebateMap.get(rawKey);
    const op    = openPoMap.get(r.supplier_key);
    const fillN = toNumOrNull(r.fill_rate);
    const otdN  = toNumOrNull(r.otd_rate);
    const fillPct = fillN !== null ? Math.min(fillN * 100, 100) : null;
    const otdPctVal = otdN  !== null ? Math.min(otdN  * 100, 100) : null;

    // Derived risk flags — operational signals only. Stored supplier_risk_flags
    // are surfaced separately on the detail page.
    const openPoCount = parseInt(op?.open_po_count ?? '0', 10);
    const lastReceive = r.last_receive_date ? new Date(r.last_receive_date) : null;
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    let flagCount = 0;
    if (fillPct !== null && fillPct < 90) flagCount++;
    if (otdPctVal !== null && otdPctVal < 85) flagCount++;
    if (openPoCount > 0 && (lastReceive === null || lastReceive < sixtyDaysAgo)) flagCount++;

    return {
      supplierKey:         r.supplier_key,
      supplierCode:        r.supplier_code ?? '',
      supplierName:        r.supplier_name ?? r.supplier_key,
      primaryProductGroup: pgMap.get(r.supplier_key) ?? 'Various',
      spendYTD:  toNum(r.spend_ytd),
      spendPY:   toNum(pyMap.get(r.supplier_key)),
      rebateEarnedYTD: rb?.earned  ?? 0,
      rebateAccrued:   rb?.accrued ?? 0,
      fillRatePct: fillPct,
      otdPct:      otdPctVal,
      openPoCount,
      openPoValue: toNum(op?.open_po_value),
      lastReceiveDate:    r.last_receive_date,
      riskFlagCount:      flagCount,
      activeProgramCount: rb?.progCount ?? 0,
      shipFromSeq:        r.shipfrom_seq ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Single vendor detail
// ---------------------------------------------------------------------------

async function _fetchVendorDetail(
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

  const colonIdx = supplierKey.indexOf('::');
  const rawKey   = colonIdx >= 0 ? supplierKey.slice(0, colonIdx) : supplierKey;
  const seqNum   = colonIdx >= 0 ? parseInt(supplierKey.slice(colonIdx + 2), 10) : null;
  const seqFilter = (seqNum !== null && seqNum > 0) ? sql`AND ph.shipfrom_seq = ${seqNum}` : sql``;

  type BranchYtdRow = { system_id: string; spend_ytd: string | null; fill_rate: string | null; otd_rate: string | null; last_receive: string | null };
  type BranchPyRow  = { system_id: string; spend_py: string | null };
  type SupplierInfoRow = { supplier_code: string | null; supplier_name: string | null; ship_from_name: string | null };

  const [branchYtdRows, branchPyRows, pgRows, openPoRows, supplierInfoRows] = await Promise.all([
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
        SUM(rl.cost)::numeric(18,2)::text AS spend_ytd,
        (SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0))::numeric(6,4)::text AS fill_rate,
        (COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0))::numeric(6,4)::text AS otd_rate,
        MAX(h.receive_date)::date::text AS last_receive
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${rawKey}
        ${seqFilter}
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
      SELECT h.system_id, SUM(rl.cost)::numeric(18,2)::text AS spend_py
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      WHERE rl.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${rawKey}
        ${seqFilter}
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
        SUM(rl.cost)::numeric(18,2)::text AS spend_ytd
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_items ai
        ON ai.item_ptr = rl.item_ptr AND ai.is_deleted = false
      WHERE rl.is_deleted = false AND ph.is_deleted = false
        AND ph.supplier_key = ${rawKey}
        ${seqFilter}
      GROUP BY product_group
      ORDER BY spend_ytd DESC NULLS LAST
      LIMIT 20
    `,
    sql<{ open_po_count: string; open_po_value: string }[]>`
      SELECT
        COUNT(DISTINCT ph.po_id)::text AS open_po_count,
        COALESCE(SUM(pl.cost), 0)::numeric(18,2)::text AS open_po_value
      FROM agility_po_header ph
      JOIN agility_po_lines pl ON pl.system_id = ph.system_id AND pl.po_id = ph.po_id
      WHERE ph.is_deleted = false AND pl.is_deleted = false
        AND ph.supplier_key = ${rawKey}
        ${seqFilter}
        AND ph.canceled = false
        AND UPPER(ph.po_status) NOT IN ('CLOSED', 'CANCELED', 'COMPLETE', 'RECEIVED')
        AND (${params.branch} = 'all' OR ph.system_id = ${params.branch})
    `,
    sql<SupplierInfoRow[]>`
      SELECT supplier_code, supplier_name, ship_from_name
      FROM agility_suppliers
      WHERE system_id = '00CO' AND TRIM(supplier_key) = TRIM(${rawKey}) AND is_deleted = false
        ${(seqNum !== null && seqNum > 0) ? sql`AND ship_from_seq = ${seqNum}` : sql``}
      ORDER BY ship_from_seq
      LIMIT 1
    `,
  ]);

  const supplierDisplayName =
    supplierInfoRows[0]?.ship_from_name ??
    supplierInfoRows[0]?.supplier_name ??
    rawKey.trim();
  const supplierCode = supplierInfoRows[0]?.supplier_code ?? rawKey.trim();

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
      id: number; program_name: string; program_type: string;
      period_start: string; period_end: string;
      target_amount: string | null; rebate_rate_pct: string | null;
      product_group: string | null; payout_timing: string;
      milestone_label: string | null; tier_breakpoints: TierBreakpoint[] | null;
      attained_amount: string | null; earned_rebate: string | null; accrued_rebate: string | null;
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
      WHERE p.supplier_key = ${rawKey} AND p.is_active = true
      ORDER BY p.program_type, p.period_start
    `;

    rebatePrograms = progRows.map((r) => {
      const attained = toNum(r.attained_amount);
      const target   = toNumOrNull(r.target_amount);
      const rate     = toNumOrNull(r.rebate_rate_pct);
      const tiers    = r.tier_breakpoints ?? null;
      let toNext: number | null = null, nextRate: number | null = null;
      if (tiers && target !== null) {
        const nextTier = tiers.find((t) => t.threshold > attained);
        if (nextTier) { toNext = nextTier.threshold - attained; nextRate = nextTier.rate_pct; }
      }
      return {
        id: r.id, programName: r.program_name,
        programType:  r.program_type as RebateProgram['programType'],
        periodStart:  r.period_start, periodEnd: r.period_end,
        targetAmount: target, rebateRatePct: rate, productGroup: r.product_group,
        attainedAmount: attained, earnedRebate: toNum(r.earned_rebate),
        accruedRebate: toNum(r.accrued_rebate), payoutTiming: r.payout_timing,
        milestoneLabel: r.milestone_label, tierBreakpoints: tiers,
        toNextTierAmount: toNext, nextTierRatePct: nextRate,
      };
    });

    rebateEarned  = rebatePrograms.reduce((acc, p) => acc + p.earnedRebate,  0);
    rebateAccrued = rebatePrograms.reduce((acc, p) => acc + p.accruedRebate, 0);

    const flagRows = await sql<{
      id: number; flag_type: string; severity: string; description: string; created_at: string;
    }[]>`
      SELECT id, flag_type, severity, description, created_at::text
      FROM supplier_risk_flags
      WHERE supplier_key = ${rawKey} AND is_active = true
      ORDER BY severity DESC, created_at DESC
    `;
    riskFlags = flagRows.map((r) => ({
      id: r.id, flagType: r.flag_type, severity: r.severity as RiskFlag['severity'],
      description: r.description, createdAt: r.created_at,
    }));
  } catch {
    // Tables not yet seeded
  }

  // Latest receive across all branches (used by callers for the noRecentReceipts risk flag).
  const lastReceiveDate = branchYtdRows
    .map((r) => r.last_receive)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null;

  return {
    supplierKey, supplierCode, supplierName: supplierDisplayName,
    spendYTD: totalYTD, spendPY: totalPY,
    rebateEarnedYTD: rebateEarned, rebateAccrued,
    fillRatePct: branchBreakdown[0]?.fillRatePct ?? null,
    otdPct:      branchBreakdown[0]?.otdPct      ?? null,
    openPoCount: parseInt(openPoRows[0]?.open_po_count ?? '0', 10),
    openPoValue: toNum(openPoRows[0]?.open_po_value),
    lastReceiveDate,
    branchBreakdown, productGroupBreakdown, rebatePrograms, riskFlags,
  };
}

// ---------------------------------------------------------------------------
// Distinct product groups (for filter chips)
// ---------------------------------------------------------------------------

async function _fetchProductGroups(
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
      ON ai.item_ptr = rl.item_ptr
    WHERE rl.is_deleted = false AND ai.is_deleted = false
      AND ai.link_product_group IS NOT NULL AND ai.link_product_group <> ''
    ORDER BY product_group
    LIMIT 40
  `;

  return rows.map((r) => r.product_group);
}

// ---------------------------------------------------------------------------
// 3-year receipts time series for a single vendor (vendor scorecard chart).
// ---------------------------------------------------------------------------

async function _fetchVendorThreeYear(
  supplierKey: string,
  branch: string,
  baseYear: number,
): Promise<VendorYearEntry[]> {
  const sql = getErpSql();
  const colonIdx = supplierKey.indexOf('::');
  const rawKey   = colonIdx >= 0 ? supplierKey.slice(0, colonIdx) : supplierKey;
  const seqNum   = colonIdx >= 0 ? parseInt(supplierKey.slice(colonIdx + 2), 10) : null;
  const seqFilter = (seqNum !== null && seqNum > 0) ? sql`AND ph.shipfrom_seq = ${seqNum}` : sql``;
  const branchFilter = branch === 'all' ? sql`` : sql`AND h.system_id = ${branch}`;

  const prior2Start = `${baseYear - 2}-01-01`;
  const baseEnd = `${baseYear + 1}-01-01`;

  type Row = { year: number; spend: string | null; receipt_count: string | null; line_count: string | null };

  const rows = await sql<Row[]>`
    WITH h AS MATERIALIZED (
      SELECT system_id, po_id, receive_num, receive_date,
        EXTRACT(YEAR FROM receive_date)::int AS y
      FROM agility_receiving_header
      WHERE is_deleted = false
        AND receive_date >= ${prior2Start}::date
        AND receive_date < ${baseEnd}::date
        ${branchFilter}
    )
    SELECT
      h.y AS year,
      SUM(rl.cost)::numeric(18,2)::text AS spend,
      COUNT(DISTINCT (h.system_id, h.po_id, h.receive_num))::text AS receipt_count,
      COUNT(*)::text AS line_count
    FROM h
    JOIN agility_receiving_lines rl
      ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
    JOIN agility_po_header ph
      ON ph.system_id = h.system_id AND ph.po_id = h.po_id
    WHERE rl.is_deleted = false AND ph.is_deleted = false
      AND ph.supplier_key = ${rawKey}
      ${seqFilter}
    GROUP BY h.y
    ORDER BY h.y
  `;

  const byYear = new Map(rows.map((r) => [r.year, r]));
  return [baseYear - 2, baseYear - 1, baseYear].map((y) => {
    const r = byYear.get(y);
    return {
      year: y,
      label: String(y),
      spend: toNum(r?.spend),
      receiptCount: parseInt(r?.receipt_count ?? '0', 10),
      lineCount: parseInt(r?.line_count ?? '0', 10),
    };
  });
}

// ---------------------------------------------------------------------------
// Top items received from a vendor (vendor scorecard cross-link to items).
// ---------------------------------------------------------------------------

async function _fetchVendorTopItems(
  supplierKey: string,
  params: VendorScorecardParams,
  limit = 25,
): Promise<VendorItemRow[]> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const s = fmt(start);
  const e = fmt(end);
  const colonIdx = supplierKey.indexOf('::');
  const rawKey   = colonIdx >= 0 ? supplierKey.slice(0, colonIdx) : supplierKey;
  const seqNum   = colonIdx >= 0 ? parseInt(supplierKey.slice(colonIdx + 2), 10) : null;
  const seqFilter = (seqNum !== null && seqNum > 0) ? sql`AND ph.shipfrom_seq = ${seqNum}` : sql``;

  type Row = {
    item_code: string | null;
    description: string | null;
    product_major_code: string | null;
    product_major: string | null;
    product_minor_code: string | null;
    product_minor: string | null;
    spend_ytd: string | null;
    qty_ytd: string | null;
    line_count: string | null;
  };

  const rows = await sql<Row[]>`
    WITH h AS MATERIALIZED (
      SELECT system_id, po_id, receive_num
      FROM agility_receiving_header
      WHERE is_deleted = false
        AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
        AND (${params.branch} = 'all' OR system_id = ${params.branch})
    )
    SELECT
      ai.item AS item_code,
      MAX(ai.description) AS description,
      MAX(ai.product_major_code) AS product_major_code,
      MAX(ai.product_major) AS product_major,
      MAX(ai.product_minor_code) AS product_minor_code,
      MAX(ai.product_minor) AS product_minor,
      SUM(rl.cost)::numeric(18,2)::text AS spend_ytd,
      SUM(rl.qty)::numeric(18,2)::text  AS qty_ytd,
      COUNT(*)::text AS line_count
    FROM h
    JOIN agility_receiving_lines rl
      ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
    JOIN agility_po_header ph
      ON ph.system_id = h.system_id AND ph.po_id = h.po_id
    JOIN agility_items ai
      ON ai.item_ptr = rl.item_ptr
    WHERE rl.is_deleted = false AND ph.is_deleted = false AND ai.is_deleted = false
      AND ph.supplier_key = ${rawKey}
      ${seqFilter}
    GROUP BY ai.item
    ORDER BY SUM(rl.cost) DESC NULLS LAST
    LIMIT ${Math.max(1, Math.floor(limit))}
  `;

  return rows.map((r) => ({
    itemCode: r.item_code ?? '',
    description: r.description,
    productMajorCode: r.product_major_code,
    productMajor: r.product_major,
    productMinorCode: r.product_minor_code,
    productMinor: r.product_minor,
    spendYTD: toNum(r.spend_ytd),
    qtyYTD: toNum(r.qty_ytd),
    lineCount: parseInt(r.line_count ?? '0', 10),
  }));
}

// ---------------------------------------------------------------------------
// Branch & Mix tab — vendor counts and spend grouped by system_id.
// ---------------------------------------------------------------------------

async function _fetchVendorBranchSummary(
  params: VendorScorecardParams,
): Promise<VendorBranchSummaryRow[]> {
  const sql = getErpSql();
  const { start, end } = getDateRange(params.range);
  const pyStart = shiftYear(start, -1);
  const pyEnd   = shiftYear(end, -1);
  const s  = fmt(start);
  const e  = fmt(end);
  const ps = fmt(pyStart);
  const pe = fmt(pyEnd);

  type YtdRow = {
    system_id: string;
    vendor_count: string;
    spend_ytd: string | null;
    fill_rate: string | null;
    otd_rate: string | null;
  };
  type PyRow = { system_id: string; spend_py: string | null };

  const [ytdRows, pyRows] = await Promise.all([
    sql<YtdRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num, receive_date
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${s}::date AND receive_date < ${e}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT
        h.system_id,
        COUNT(DISTINCT ph.supplier_key)::text AS vendor_count,
        SUM(rl.cost)::numeric(18,2)::text AS spend_ytd,
        (SUM(rl.qty)::numeric / NULLIF(SUM(pl.qty_ordered), 0))::numeric(6,4)::text AS fill_rate,
        (COUNT(*) FILTER (WHERE h.receive_date::date <= ph.expect_date::date)::numeric
          / NULLIF(COUNT(*), 0))::numeric(6,4)::text AS otd_rate
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      LEFT JOIN agility_po_lines pl
        ON pl.system_id = rl.system_id AND pl.po_id = rl.po_id AND pl.sequence = rl.sequence
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY h.system_id
      ORDER BY spend_ytd DESC NULLS LAST
    `,
    sql<PyRow[]>`
      WITH h AS MATERIALIZED (
        SELECT system_id, po_id, receive_num
        FROM agility_receiving_header
        WHERE is_deleted = false
          AND receive_date >= ${ps}::date AND receive_date < ${pe}::date + 1
          AND (${params.branch} = 'all' OR system_id = ${params.branch})
      )
      SELECT h.system_id, SUM(rl.cost)::numeric(18,2)::text AS spend_py
      FROM h
      JOIN agility_receiving_lines rl
        ON rl.system_id = h.system_id AND rl.po_id = h.po_id AND rl.receive_num = h.receive_num
      JOIN agility_po_header ph
        ON ph.system_id = h.system_id AND ph.po_id = h.po_id
      WHERE rl.is_deleted = false AND ph.is_deleted = false
      GROUP BY h.system_id
    `,
  ]);

  const pyMap = new Map(pyRows.map((r) => [r.system_id, toNum(r.spend_py)]));
  const totalYtd = ytdRows.reduce((s, r) => s + toNum(r.spend_ytd), 0);
  return ytdRows.map((r) => ({
    systemId: r.system_id,
    branchName: BRANCH_NAMES[r.system_id] ?? r.system_id,
    vendorCount: parseInt(r.vendor_count, 10),
    spendYTD: toNum(r.spend_ytd),
    spendPY: pyMap.get(r.system_id) ?? 0,
    pctOfTotal: totalYtd > 0 ? toNum(r.spend_ytd) / totalYtd : 0,
    fillRatePct: toNumOrNull(r.fill_rate) !== null ? Math.min(toNum(r.fill_rate) * 100, 100) : null,
    otdPct:      toNumOrNull(r.otd_rate)  !== null ? Math.min(toNum(r.otd_rate)  * 100, 100) : null,
  }));
}

/**
 * Pure helper — derived risk flags from operational metrics.
 * Used by both the leaderboard riskFlagCount and the standalone vendor scorecard.
 */
export function computeDerivedRiskFlags(input: {
  fillRatePct: number | null;
  otdPct: number | null;
  openPoCount: number;
  lastReceiveDate: string | null;
  rebatePrograms?: RebateProgram[];
  ytdPacing?: number; // 0..1 — fraction of period elapsed; for missedRebate
}): VendorDerivedRiskFlags {
  const lowFillRate = input.fillRatePct !== null && input.fillRatePct < 90;
  const lateDelivery = input.otdPct !== null && input.otdPct < 85;
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const lastReceive = input.lastReceiveDate ? new Date(input.lastReceiveDate) : null;
  const noRecentReceipts = input.openPoCount > 0 && (lastReceive === null || lastReceive < sixtyDaysAgo);

  let missedRebate = false;
  if (input.rebatePrograms && input.rebatePrograms.length > 0) {
    const pacing = input.ytdPacing ?? 0.5;
    missedRebate = input.rebatePrograms.some((p) => {
      if (!p.targetAmount || p.targetAmount <= 0) return false;
      const attainPct = p.attainedAmount / p.targetAmount;
      // expected-by-now = pacing × 1.0. missed = attained < pacing × 0.5
      return attainPct < pacing * 0.5;
    });
  }
  const count = [lowFillRate, lateDelivery, missedRebate, noRecentReceipts].filter(Boolean).length;
  return { lowFillRate, lateDelivery, missedRebate, noRecentReceipts, count };
}

// ---------------------------------------------------------------------------
// Cached public exports — 5-minute TTL, shared across all concurrent users.
// Tagged 'erp' so all ERP caches can be busted together with revalidateTag.
// ---------------------------------------------------------------------------

export const fetchVendorScorecardSummary = erpCache(
  _fetchVendorScorecardSummary,
  ['scorecard-summary'],
);

export const fetchVendorList = erpCache(
  _fetchVendorList,
  ['scorecard-vendors'],
);

export const fetchVendorDetail = erpCache(
  _fetchVendorDetail,
  ['scorecard-vendor-detail'],
);

export const fetchProductGroups = erpCache(
  _fetchProductGroups,
  ['scorecard-product-groups'],
);

export const fetchVendorThreeYear = erpCache(
  _fetchVendorThreeYear,
  ['scorecard-vendor-three-year'],
);

export const fetchVendorTopItems = erpCache(
  _fetchVendorTopItems,
  ['scorecard-vendor-top-items'],
);

export const fetchVendorBranchSummary = erpCache(
  _fetchVendorBranchSummary,
  ['scorecard-vendor-branch-summary'],
);
