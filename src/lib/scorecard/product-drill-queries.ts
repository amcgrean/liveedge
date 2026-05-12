import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';
import type {
  ProductDrillParams,
  ProductFilter,
  ProductHeader,
  ProductBranchMixRow,
  ProductTopCustomerRow,
  ItemPrimarySupplier,
  KpiComparison,
  KpiSet,
  ThreeYearEntry,
  SaleTypeRow,
} from './types';

// ---------------------------------------------------------------------------
// Helpers (mirror src/lib/scorecard/queries.ts to keep behavior identical).
// ---------------------------------------------------------------------------

function clampCutoff(year: number, month: number, day: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getCutoffs(
  baseYear: number,
  compareYear: number,
  cutoffDate: string,
  period: string,
): { baseCutoff: string; compareCutoff: string } {
  if (period === 'Full Year') {
    return { baseCutoff: `${baseYear}-12-31`, compareCutoff: `${compareYear}-12-31` };
  }
  const d = new Date(cutoffDate);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    baseCutoff: clampCutoff(baseYear, month, day),
    compareCutoff: clampCutoff(compareYear, month, day),
  };
}

function yearRange(baseYear: number, compareYear: number): { dateFrom: string; dateTo: string } {
  const minYear = Math.min(baseYear, compareYear);
  const maxYear = Math.max(baseYear, compareYear);
  return { dateFrom: `${minYear}-01-01`, dateTo: `${maxYear + 1}-01-01` };
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n !== null ? Math.round(n) : null;
}

// ---------------------------------------------------------------------------
// Product header (resolves display labels for the drill-down page title).
// ---------------------------------------------------------------------------

async function _fetchProductHeader(filter: ProductFilter): Promise<ProductHeader | null> {
  const sql = getErpSql();

  if (filter.level === 'major') {
    const rows = await sql<{ product_major: string | null }[]>`
      SELECT MAX(product_major) AS product_major
      FROM customer_scorecard_fact
      WHERE is_deleted = false AND product_major_code = ${filter.majorCode}
    `;
    if (!rows[0]) return null;
    return {
      level: 'major',
      majorCode: filter.majorCode,
      majorName: rows[0].product_major ?? filter.majorCode,
      minorCode: null,
      minorName: null,
      itemCode: null,
      itemDescription: null,
    };
  }

  if (filter.level === 'minor') {
    const rows = await sql<{ product_major: string | null; product_minor: string | null }[]>`
      SELECT MAX(product_major) AS product_major, MAX(product_minor) AS product_minor
      FROM customer_scorecard_fact
      WHERE is_deleted = false
        AND product_major_code = ${filter.majorCode}
        AND product_minor_code = ${filter.minorCode}
    `;
    if (!rows[0]) return null;
    return {
      level: 'minor',
      majorCode: filter.majorCode,
      majorName: rows[0].product_major ?? filter.majorCode,
      minorCode: filter.minorCode,
      minorName: rows[0].product_minor ?? filter.minorCode,
      itemCode: null,
      itemDescription: null,
    };
  }

  // level === 'item'
  const rows = await sql<{
    product_major_code: string | null;
    product_major: string | null;
    product_minor_code: string | null;
    product_minor: string | null;
    item_description: string | null;
  }[]>`
    SELECT
      MAX(product_major_code) AS product_major_code,
      MAX(product_major)      AS product_major,
      MAX(product_minor_code) AS product_minor_code,
      MAX(product_minor)      AS product_minor,
      MAX(item_description)   AS item_description
    FROM customer_scorecard_fact
    WHERE is_deleted = false AND item_number = ${filter.itemCode}
  `;
  if (!rows[0]) return null;
  return {
    level: 'item',
    majorCode: rows[0].product_major_code ?? '',
    majorName: rows[0].product_major ?? '',
    minorCode: rows[0].product_minor_code ?? null,
    minorName: rows[0].product_minor ?? null,
    itemCode: filter.itemCode,
    itemDescription: rows[0].item_description ?? filter.itemCode,
  };
}

// ---------------------------------------------------------------------------
// KPI tiles (sales, gp, value-add, non-stock, gross, cm, soCount, weight).
// Mirrors _fetchAggregateKpis but filtered by product.
// ---------------------------------------------------------------------------

type KpiRow = {
  sales_base: string | null; sales_compare: string | null;
  gp_base: string | null; gp_compare: string | null;
  va_sales_base: string | null; va_sales_compare: string | null;
  ns_sales_base: string | null; ns_sales_compare: string | null;
  ns_gp_base: string | null; ns_gp_compare: string | null;
  gross_sales_base: string | null; gross_sales_compare: string | null;
  cm_sales_base: string | null; cm_sales_compare: string | null;
  so_count_base: string | null; so_count_compare: string | null;
  cm_count_base: string | null; cm_count_compare: string | null;
  weight_base: string | null; weight_compare: string | null;
  branch_ids: string[]; ship_to_count: string | null;
};

async function _fetchProductKpis(
  params: ProductDrillParams,
  displayTitle: string,
): Promise<KpiComparison> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);
  const f = params.productFilter;
  const hasBranches = params.branchIds.length > 0;

  // For Postgres index selection, we pass the product-level filter as a normal
  // equality predicate. The 8 partial indexes from migration 0019 cover every
  // combination of (item_code | product_major_code | product_minor_code) × (branch | no-branch).
  let rows: KpiRow[];

  if (f.level === 'item') {
    rows = hasBranches
      ? await sql<KpiRow[]>`
          WITH src AS (
            SELECT sales_amount, gross_profit, weight, sales_order_number,
              is_credit_memo, is_value_add_major, is_non_stock, ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND item_number = ${f.itemCode}
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
              AND branch_id = ANY(${params.branchIds}::text[])
          )
          ${sql.unsafe(kpiSelect())}
        `
      : await sql<KpiRow[]>`
          WITH src AS (
            SELECT sales_amount, gross_profit, weight, sales_order_number,
              is_credit_memo, is_value_add_major, is_non_stock, ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND item_number = ${f.itemCode}
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
          )
          ${sql.unsafe(kpiSelect())}
        `;
  } else if (f.level === 'minor') {
    rows = hasBranches
      ? await sql<KpiRow[]>`
          WITH src AS (
            SELECT sales_amount, gross_profit, weight, sales_order_number,
              is_credit_memo, is_value_add_major, is_non_stock, ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND product_major_code = ${f.majorCode}
              AND product_minor_code = ${f.minorCode}
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
              AND branch_id = ANY(${params.branchIds}::text[])
          )
          ${sql.unsafe(kpiSelect())}
        `
      : await sql<KpiRow[]>`
          WITH src AS (
            SELECT sales_amount, gross_profit, weight, sales_order_number,
              is_credit_memo, is_value_add_major, is_non_stock, ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND product_major_code = ${f.majorCode}
              AND product_minor_code = ${f.minorCode}
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
          )
          ${sql.unsafe(kpiSelect())}
        `;
  } else {
    // major
    rows = hasBranches
      ? await sql<KpiRow[]>`
          WITH src AS (
            SELECT sales_amount, gross_profit, weight, sales_order_number,
              is_credit_memo, is_value_add_major, is_non_stock, ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND product_major_code = ${f.majorCode}
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
              AND branch_id = ANY(${params.branchIds}::text[])
          )
          ${sql.unsafe(kpiSelect())}
        `
      : await sql<KpiRow[]>`
          WITH src AS (
            SELECT sales_amount, gross_profit, weight, sales_order_number,
              is_credit_memo, is_value_add_major, is_non_stock, ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND product_major_code = ${f.majorCode}
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
          )
          ${sql.unsafe(kpiSelect())}
        `;
  }

  const r = rows[0] ?? ({} as KpiRow);
  const mkSet = (sfx: 'base' | 'compare'): KpiSet => ({
    sales: toNum((r as Record<string, unknown>)[`sales_${sfx}`]),
    gp: toNum((r as Record<string, unknown>)[`gp_${sfx}`]),
    vaSales: toNum((r as Record<string, unknown>)[`va_sales_${sfx}`]),
    nsSales: toNum((r as Record<string, unknown>)[`ns_sales_${sfx}`]),
    nsGp: toNum((r as Record<string, unknown>)[`ns_gp_${sfx}`]),
    grossSales: toNum((r as Record<string, unknown>)[`gross_sales_${sfx}`]),
    cmSales: toNum((r as Record<string, unknown>)[`cm_sales_${sfx}`]),
    soCount: toInt((r as Record<string, unknown>)[`so_count_${sfx}`]),
    cmCount: toInt((r as Record<string, unknown>)[`cm_count_${sfx}`]),
    totalWeight: toNum((r as Record<string, unknown>)[`weight_${sfx}`]),
  });
  return {
    base: mkSet('base'),
    compare: mkSet('compare'),
    branchIds: r.branch_ids ?? [],
    shipToCount: toInt(r.ship_to_count) ?? 0,
    customerName: displayTitle,
  };
}

function kpiSelect(): string {
  return `
    SELECT
      SUM(sales_amount) FILTER (WHERE is_base)::text AS sales_base,
      SUM(sales_amount) FILTER (WHERE is_compare)::text AS sales_compare,
      SUM(gross_profit) FILTER (WHERE is_base)::text AS gp_base,
      SUM(gross_profit) FILTER (WHERE is_compare)::text AS gp_compare,
      SUM(sales_amount) FILTER (WHERE is_base AND is_value_add_major)::text AS va_sales_base,
      SUM(sales_amount) FILTER (WHERE is_compare AND is_value_add_major)::text AS va_sales_compare,
      SUM(sales_amount) FILTER (WHERE is_base AND is_non_stock)::text AS ns_sales_base,
      SUM(sales_amount) FILTER (WHERE is_compare AND is_non_stock)::text AS ns_sales_compare,
      SUM(gross_profit) FILTER (WHERE is_base AND is_non_stock)::text AS ns_gp_base,
      SUM(gross_profit) FILTER (WHERE is_compare AND is_non_stock)::text AS ns_gp_compare,
      SUM(sales_amount) FILTER (WHERE is_base AND NOT is_credit_memo)::text AS gross_sales_base,
      SUM(sales_amount) FILTER (WHERE is_compare AND NOT is_credit_memo)::text AS gross_sales_compare,
      SUM(sales_amount) FILTER (WHERE is_base AND is_credit_memo)::text AS cm_sales_base,
      SUM(sales_amount) FILTER (WHERE is_compare AND is_credit_memo)::text AS cm_sales_compare,
      COUNT(DISTINCT CASE WHEN is_base AND NOT is_credit_memo THEN sales_order_number END)::text AS so_count_base,
      COUNT(DISTINCT CASE WHEN is_compare AND NOT is_credit_memo THEN sales_order_number END)::text AS so_count_compare,
      COUNT(DISTINCT CASE WHEN is_base AND is_credit_memo THEN sales_order_number END)::text AS cm_count_base,
      COUNT(DISTINCT CASE WHEN is_compare AND is_credit_memo THEN sales_order_number END)::text AS cm_count_compare,
      SUM(weight) FILTER (WHERE is_base AND NOT is_credit_memo)::text AS weight_base,
      SUM(weight) FILTER (WHERE is_compare AND NOT is_credit_memo)::text AS weight_compare,
      array_agg(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL) AS branch_ids,
      COUNT(DISTINCT ship_to_id)::text AS ship_to_count
    FROM src
  `;
}

// ---------------------------------------------------------------------------
// 3-Year time series, product-scoped.
// ---------------------------------------------------------------------------

async function _fetchProductThreeYear(params: ProductDrillParams): Promise<ThreeYearEntry[]> {
  const sql = getErpSql();
  const { baseCutoff } = getCutoffs(params.baseYear, params.compareYear, params.cutoffDate, params.period);
  const prior1 = params.baseYear - 1;
  const prior2 = params.baseYear - 2;
  const d = new Date(baseCutoff);
  const cm = d.getUTCMonth() + 1;
  const cd = d.getUTCDate();
  const prior1Cutoff = params.period === 'YTD' ? clampCutoff(prior1, cm, cd) : `${prior1}-12-31`;
  const prior2Cutoff = params.period === 'YTD' ? clampCutoff(prior2, cm, cd) : `${prior2}-12-31`;
  const dateFrom = `${prior2}-01-01`;
  const dateTo = `${params.baseYear + 1}-01-01`;
  const f = params.productFilter;
  const hasBranches = params.branchIds.length > 0;

  type Row = {
    cy_sales: string | null; cy_gp: string | null;
    py1_sales: string | null; py1_gp: string | null;
    py2_sales: string | null; py2_gp: string | null;
  };

  const projection = sql.unsafe(`
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS cy_sales,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS cy_gp,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${prior1}, 1, 1)
        AND invoice_date::date <= '${prior1Cutoff}'::date
    )::text AS py1_sales,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${prior1}, 1, 1)
        AND invoice_date::date <= '${prior1Cutoff}'::date
    )::text AS py1_gp,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${prior2}, 1, 1)
        AND invoice_date::date <= '${prior2Cutoff}'::date
    )::text AS py2_sales,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${prior2}, 1, 1)
        AND invoice_date::date <= '${prior2Cutoff}'::date
    )::text AS py2_gp
  `);

  let rows: Row[];
  if (f.level === 'item') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
        `;
  } else if (f.level === 'minor') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
        `;
  } else {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
        `;
  }

  const r = rows[0] ?? ({} as Row);
  return [
    { year: prior2, label: String(prior2), sales: toNum(r.py2_sales) ?? 0, gp: toNum(r.py2_gp) ?? 0 },
    { year: prior1, label: String(prior1), sales: toNum(r.py1_sales) ?? 0, gp: toNum(r.py1_gp) ?? 0 },
    { year: params.baseYear, label: String(params.baseYear), sales: toNum(r.cy_sales) ?? 0, gp: toNum(r.cy_gp) ?? 0 },
  ];
}

// ---------------------------------------------------------------------------
// Top customers buying this product (15 rows, sorted by base-year sales).
// ---------------------------------------------------------------------------

async function _fetchProductTopCustomers(
  params: ProductDrillParams,
  limit = 15,
): Promise<ProductTopCustomerRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);
  const f = params.productFilter;
  const hasBranches = params.branchIds.length > 0;

  type Row = {
    customer_id: string;
    customer_name: string | null;
    sales_base: string | null;
    sales_compare: string | null;
    gp_base: string | null;
    branch_ids: string[];
  };

  const projection = sql.unsafe(`
    customer_id,
    MAX(customer_name) AS customer_name,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS sales_base,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS sales_compare,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS gp_base,
    array_agg(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL) AS branch_ids
  `);

  const orderBy = sql.unsafe(`
    ORDER BY COALESCE(SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    ), 0) DESC
    LIMIT ${Math.max(1, Math.floor(limit))}
  `);

  let rows: Row[];
  if (f.level === 'item') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY customer_id
          ${orderBy}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          GROUP BY customer_id
          ${orderBy}
        `;
  } else if (f.level === 'minor') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY customer_id
          ${orderBy}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          GROUP BY customer_id
          ${orderBy}
        `;
  } else {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY customer_id
          ${orderBy}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          GROUP BY customer_id
          ${orderBy}
        `;
  }

  return rows.map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name ?? r.customer_id,
    salesBase: toNum(r.sales_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    branchIds: r.branch_ids ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Branch mix — sales by branch for this product scope.
// ---------------------------------------------------------------------------

async function _fetchProductBranchMix(params: ProductDrillParams): Promise<ProductBranchMixRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);
  const f = params.productFilter;
  const hasBranches = params.branchIds.length > 0;

  type Row = {
    branch_id: string;
    sales_base: string | null;
    sales_compare: string | null;
    gp_base: string | null;
    gp_compare: string | null;
    customer_count: string | null;
  };

  const projection = sql.unsafe(`
    branch_id,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS sales_base,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS sales_compare,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS gp_base,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS gp_compare,
    COUNT(DISTINCT customer_id)::text AS customer_count
  `);

  const tail = sql.unsafe(`
    GROUP BY branch_id
    HAVING branch_id IS NOT NULL
    ORDER BY COALESCE(SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    ), 0) DESC
  `);

  let rows: Row[];
  if (f.level === 'item') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          ${tail}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          ${tail}
        `;
  } else if (f.level === 'minor') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          ${tail}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          ${tail}
        `;
  } else {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          ${tail}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          ${tail}
        `;
  }

  return rows.map((r) => ({
    branchId: r.branch_id,
    salesBase: toNum(r.sales_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
    customerCount: toInt(r.customer_count) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Sale type breakdown, product-scoped.
// ---------------------------------------------------------------------------

async function _fetchProductSaleTypes(params: ProductDrillParams): Promise<SaleTypeRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);
  const f = params.productFilter;
  const hasBranches = params.branchIds.length > 0;

  type Row = {
    category: string | null;
    is_excluded: boolean | null;
    sales_base: string | null; gp_base: string | null;
    sales_compare: string | null; gp_compare: string | null;
  };

  const projection = sql.unsafe(`
    COALESCE(sale_type_reporting_category, 'Other') AS category,
    BOOL_OR(is_sale_type_excluded) AS is_excluded,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS sales_base,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS gp_base,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS sales_compare,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS gp_compare
  `);

  const tail = sql.unsafe(`
    GROUP BY sale_type_reporting_category
    ORDER BY COALESCE(SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    ), 0) DESC
  `);

  let rows: Row[];
  if (f.level === 'item') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          ${tail}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND item_number = ${f.itemCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          ${tail}
        `;
  } else if (f.level === 'minor') {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          ${tail}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${f.majorCode} AND product_minor_code = ${f.minorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          ${tail}
        `;
  } else {
    rows = hasBranches
      ? await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          ${tail}
        `
      : await sql<Row[]>`
          SELECT ${projection}
          FROM customer_scorecard_fact
          WHERE is_deleted = false AND product_major_code = ${f.majorCode}
            AND invoice_date >= ${dateFrom}::timestamp AND invoice_date < ${dateTo}::timestamp
          ${tail}
        `;
  }

  return rows.map((r) => ({
    category: r.category ?? 'Other',
    isExcluded: r.is_excluded ?? false,
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Primary supplier for an item (item-scorecard "Supplier" card cross-link).
// agility_items.primary_supplier is a conditional column on some sync builds;
// queried defensively via information_schema before referencing.
// ---------------------------------------------------------------------------

async function _fetchItemPrimarySupplier(itemCode: string): Promise<ItemPrimarySupplier | null> {
  const sql = getErpSql();

  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agility_items'
      AND column_name IN ('primary_supplier','primary_supplier_key')
  `;
  const hasSupplier = cols.some((c) => c.column_name === 'primary_supplier');
  const hasSupplierKey = cols.some((c) => c.column_name === 'primary_supplier_key');
  if (!hasSupplier && !hasSupplierKey) return null;

  if (hasSupplierKey) {
    const rows = await sql<{ supplier_code: string | null; supplier_name: string | null }[]>`
      SELECT s.supplier_code AS supplier_code, s.supplier_name AS supplier_name
      FROM agility_items i
      LEFT JOIN agility_suppliers s ON s.supplier_key = i.primary_supplier_key
      WHERE i.item = ${itemCode}
      LIMIT 1
    `;
    if (!rows[0] || !rows[0].supplier_code) return null;
    return { supplierCode: rows[0].supplier_code, supplierName: rows[0].supplier_name };
  }

  // hasSupplier: column stores supplier code directly
  const rows = await sql<{ supplier_code: string | null; supplier_name: string | null }[]>`
    SELECT i.primary_supplier AS supplier_code,
      (SELECT supplier_name FROM agility_suppliers s
        WHERE TRIM(s.supplier_code) = TRIM(i.primary_supplier) LIMIT 1) AS supplier_name
    FROM agility_items i
    WHERE i.item = ${itemCode}
    LIMIT 1
  `;
  if (!rows[0] || !rows[0].supplier_code) return null;
  return { supplierCode: rows[0].supplier_code, supplierName: rows[0].supplier_name };
}

// ---------------------------------------------------------------------------
// Cached exports.
// ---------------------------------------------------------------------------

export const fetchProductHeader = erpCache(_fetchProductHeader, ['fetch-product-header']);
export const fetchProductKpis = erpCache(_fetchProductKpis, ['fetch-product-kpis']);
export const fetchProductThreeYear = erpCache(_fetchProductThreeYear, ['fetch-product-three-year']);
export const fetchProductTopCustomers = erpCache(_fetchProductTopCustomers, ['fetch-product-top-customers']);
export const fetchProductBranchMix = erpCache(_fetchProductBranchMix, ['fetch-product-branch-mix']);
export const fetchProductSaleTypes = erpCache(_fetchProductSaleTypes, ['fetch-product-sale-types']);
export const fetchItemPrimarySupplier = erpCache(_fetchItemPrimarySupplier, ['fetch-item-primary-supplier']);
