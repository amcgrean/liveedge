import { getErpSql } from '../../../db/supabase';
import type {
  ScorecardParams,
  AggregateParams,
  KpiComparison,
  KpiSet,
  CustomerAvg,
  ProductMajorRow,
  ProductMinorRow,
  ProductItemRow,
  ProductOrderRow,
  ProductScorecardMajorRow,
  ProductScorecardMinorRow,
  ProductScorecardItemRow,
  SaleTypeRow,
  ThreeYearEntry,
  DaysToPayData,
  CustomerListRow,
  BranchSummaryRow,
  RepListRow,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns YYYY-MM-DD clamped to the last valid day of month in `year`. */
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
    return {
      baseCutoff: `${baseYear}-12-31`,
      compareCutoff: `${compareYear}-12-31`,
    };
  }
  const d = new Date(cutoffDate);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    baseCutoff: clampCutoff(baseYear, month, day),
    compareCutoff: clampCutoff(compareYear, month, day),
  };
}

/**
 * Returns the timestamp range that covers both baseYear and compareYear.
 * Using date ranges (not EXTRACT) lets Postgres use the (customer_id, invoice_date) composite index.
 */
function yearRange(baseYear: number, compareYear: number): { dateFrom: string; dateTo: string } {
  const minYear = Math.min(baseYear, compareYear);
  const maxYear = Math.max(baseYear, compareYear);
  return {
    dateFrom: `${minYear}-01-01`,
    dateTo: `${maxYear + 1}-01-01`,
  };
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
// Customer list (scorecard index page)
// ---------------------------------------------------------------------------

export async function fetchCustomerList(
  baseYear: number,
  compareYear: number,
  branchIds: string[],
  search: string,
  limit = 200,
  period = 'Full Year',
  cutoffDate = '',
): Promise<CustomerListRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(baseYear, compareYear, cutoffDate || `${baseYear}-12-31`, period);
  const { dateFrom, dateTo } = yearRange(baseYear, compareYear);

  type Row = {
    customer_id: string;
    customer_name: string;
    sales_base: string | null;
    sales_compare: string | null;
    gp_base: string | null;
    branch_ids: string[];
  };

  const rows = branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          customer_id,
          MAX(customer_name) AS customer_name,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::numeric(18,2)::text AS sales_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::numeric(18,2)::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::numeric(18,2)::text AS gp_base,
          array_agg(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL) AS branch_ids
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${branchIds}::text[])
          AND (
            ${search} = ''
            OR customer_name ILIKE ${'%' + search + '%'}
            OR customer_id ILIKE ${'%' + search + '%'}
          )
        GROUP BY customer_id
        ORDER BY SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ) DESC NULLS LAST
        LIMIT ${limit}
      `
    : await sql<Row[]>`
        SELECT
          customer_id,
          MAX(customer_name) AS customer_name,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::numeric(18,2)::text AS sales_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::numeric(18,2)::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::numeric(18,2)::text AS gp_base,
          array_agg(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL) AS branch_ids
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND (
            ${search} = ''
            OR customer_name ILIKE ${'%' + search + '%'}
            OR customer_id ILIKE ${'%' + search + '%'}
          )
        GROUP BY customer_id
        ORDER BY SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ) DESC NULLS LAST
        LIMIT ${limit}
      `;

  return rows.map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    salesBase: toNum(r.sales_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    branchIds: r.branch_ids ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Customer typeahead
// ---------------------------------------------------------------------------

export async function searchCustomers(
  query: string,
  limit = 20,
): Promise<{ customerId: string; customerName: string }[]> {
  const sql = getErpSql();
  type Row = { customer_id: string; customer_name: string };
  const rows = await sql<Row[]>`
    SELECT DISTINCT ON (customer_id) customer_id, customer_name
    FROM customer_scorecard_fact
    WHERE is_deleted = false
      AND (
        customer_name ILIKE ${'%' + query + '%'}
        OR customer_id ILIKE ${'%' + query + '%'}
      )
    ORDER BY customer_id, invoice_date DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ customerId: r.customer_id, customerName: r.customer_name }));
}

// ---------------------------------------------------------------------------
// Main KPI aggregation
// ---------------------------------------------------------------------------

export async function fetchKpis(params: ScorecardParams): Promise<KpiComparison> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    customer_name: string | null;
    sales_base: string | null;
    sales_compare: string | null;
    gp_base: string | null;
    gp_compare: string | null;
    va_sales_base: string | null;
    va_sales_compare: string | null;
    ns_sales_base: string | null;
    ns_sales_compare: string | null;
    ns_gp_base: string | null;
    ns_gp_compare: string | null;
    gross_sales_base: string | null;
    gross_sales_compare: string | null;
    cm_sales_base: string | null;
    cm_sales_compare: string | null;
    so_count_base: string | null;
    so_count_compare: string | null;
    cm_count_base: string | null;
    cm_count_compare: string | null;
    weight_base: string | null;
    weight_compare: string | null;
    branch_ids: string[];
    ship_to_count: string | null;
  };

  const [rows] = params.branchIds.length > 0
    ? await sql<Row[]>`
        WITH f AS (
          SELECT
            customer_name,
            sales_amount, gross_profit, weight,
            sales_order_number, is_credit_memo, is_value_add_major, is_non_stock,
            ship_to_id, branch_id,
            (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
            (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
              AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND customer_id = ${params.customerId}
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
        )
        SELECT
          MAX(customer_name) AS customer_name,
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
        FROM f
      `
    : await sql<Row[]>`
        WITH f AS (
          SELECT
            customer_name,
            sales_amount, gross_profit, weight,
            sales_order_number, is_credit_memo, is_value_add_major, is_non_stock,
            ship_to_id, branch_id,
            (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
            (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
              AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND customer_id = ${params.customerId}
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
        )
        SELECT
          MAX(customer_name) AS customer_name,
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
        FROM f
      `;

  const r = rows ?? {};

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
    branchIds: (r as Row).branch_ids ?? [],
    shipToCount: toInt((r as Row).ship_to_count) ?? 0,
    customerName: (r as Row).customer_name ?? params.customerId,
  };
}

// ---------------------------------------------------------------------------
// All-customer average benchmarks (weighted: total GP / total sales)
// ---------------------------------------------------------------------------

export async function fetchAllCustomersAvg(params: ScorecardParams): Promise<CustomerAvg> {
  const sql = getErpSql();
  const { baseCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    total_sales: string | null;
    total_gp: string | null;
    total_va_sales: string | null;
    total_ns_sales: string | null;
  };

  const [r] = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          SUM(sales_amount) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS total_sales,
          SUM(gross_profit) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS total_gp,
          SUM(sales_amount) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
              AND is_value_add_major
          )::text AS total_va_sales,
          SUM(sales_amount) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
              AND is_non_stock
          )::text AS total_ns_sales
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
      `
    : await sql<Row[]>`
        SELECT
          SUM(sales_amount) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS total_sales,
          SUM(gross_profit) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS total_gp,
          SUM(sales_amount) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
              AND is_value_add_major
          )::text AS total_va_sales,
          SUM(sales_amount) FILTER (
            WHERE EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
              AND invoice_date::date <= ${baseCutoff}::date
              AND is_non_stock
          )::text AS total_ns_sales
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
      `;

  const sales = toNum(r?.total_sales);
  const gp = toNum(r?.total_gp);
  const vaSales = toNum(r?.total_va_sales);
  const nsSales = toNum(r?.total_ns_sales);

  return {
    gmPct: sales && sales !== 0 && gp !== null ? gp / sales : null,
    vaPct: sales && sales !== 0 && vaSales !== null ? vaSales / sales : null,
    nsPct: sales && sales !== 0 && nsSales !== null ? nsSales / sales : null,
  };
}

// ---------------------------------------------------------------------------
// 3-year rolling comparison table
// ---------------------------------------------------------------------------

export async function fetchThreeYear(params: ScorecardParams): Promise<ThreeYearEntry[]> {
  const sql = getErpSql();
  const { baseCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const prior1 = params.baseYear - 1;
  const prior2 = params.baseYear - 2;

  type Row = {
    cy_sales: string | null; cy_gp: string | null;
    py1_sales: string | null; py1_gp: string | null;
    py2_sales: string | null; py2_gp: string | null;
  };

  const [r] = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS cy_sales,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS cy_gp,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${prior1}, 1, 1)
              AND invoice_date < make_date(${prior1 + 1}, 1, 1)
          )::text AS py1_sales,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${prior1}, 1, 1)
              AND invoice_date < make_date(${prior1 + 1}, 1, 1)
          )::text AS py1_gp,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${prior2}, 1, 1)
              AND invoice_date < make_date(${prior2 + 1}, 1, 1)
          )::text AS py2_sales,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${prior2}, 1, 1)
              AND invoice_date < make_date(${prior2 + 1}, 1, 1)
          )::text AS py2_gp
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND invoice_date >= ${String(prior2) + '-01-01'}::timestamp
          AND invoice_date < ${String(params.baseYear + 1) + '-01-01'}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
      `
    : await sql<Row[]>`
        SELECT
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS cy_sales,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS cy_gp,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${prior1}, 1, 1)
              AND invoice_date < make_date(${prior1 + 1}, 1, 1)
          )::text AS py1_sales,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${prior1}, 1, 1)
              AND invoice_date < make_date(${prior1 + 1}, 1, 1)
          )::text AS py1_gp,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${prior2}, 1, 1)
              AND invoice_date < make_date(${prior2 + 1}, 1, 1)
          )::text AS py2_sales,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${prior2}, 1, 1)
              AND invoice_date < make_date(${prior2 + 1}, 1, 1)
          )::text AS py2_gp
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND invoice_date >= ${String(prior2) + '-01-01'}::timestamp
          AND invoice_date < ${String(params.baseYear + 1) + '-01-01'}::timestamp
      `;

  const periodLabel = params.period === 'YTD'
    ? `YTD thru ${baseCutoff}`
    : 'Full Year';

  return [
    { year: params.baseYear, label: `${params.baseYear} ${periodLabel}`, sales: toNum(r?.cy_sales) ?? 0, gp: toNum(r?.cy_gp) ?? 0 },
    { year: prior1,           label: `12/31/${prior1}`,                  sales: toNum(r?.py1_sales) ?? 0, gp: toNum(r?.py1_gp) ?? 0 },
    { year: prior2,           label: `12/31/${prior2}`,                  sales: toNum(r?.py2_sales) ?? 0, gp: toNum(r?.py2_gp) ?? 0 },
  ];
}

// ---------------------------------------------------------------------------
// Product major breakdown
// ---------------------------------------------------------------------------

export async function fetchProductMajors(params: ScorecardParams): Promise<ProductMajorRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    product_major_code: string | null;
    product_major: string | null;
    sales_base: string | null;
    gp_base: string | null;
    sales_compare: string | null;
    gp_compare: string | null;
  };

  const rows = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          COALESCE(product_major_code, '') AS product_major_code,
          COALESCE(product_major, 'Unknown') AS product_major,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY product_major_code, product_major
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<Row[]>`
        SELECT
          COALESCE(product_major_code, '') AS product_major_code,
          COALESCE(product_major, 'Unknown') AS product_major,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY product_major_code, product_major
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

  return rows.map((r) => ({
    productMajorCode: r.product_major_code ?? '',
    productMajor: r.product_major ?? 'Unknown',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Product minor drill-down (on demand)
// ---------------------------------------------------------------------------

export async function fetchProductMinors(
  params: ScorecardParams,
  majorCode: string,
): Promise<ProductMinorRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    product_minor_code: string | null;
    product_minor: string | null;
    sales_base: string | null;
    gp_base: string | null;
    sales_compare: string | null;
    gp_compare: string | null;
  };

  const rows = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          COALESCE(product_minor_code, '') AS product_minor_code,
          COALESCE(product_minor, 'Unknown') AS product_minor,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND product_major_code = ${majorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY product_minor_code, product_minor
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<Row[]>`
        SELECT
          COALESCE(product_minor_code, '') AS product_minor_code,
          COALESCE(product_minor, 'Unknown') AS product_minor,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND product_major_code = ${majorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY product_minor_code, product_minor
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

  return rows.map((r) => ({
    productMinorCode: r.product_minor_code ?? '',
    productMinor: r.product_minor ?? 'Unknown',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Sale type breakdown
// ---------------------------------------------------------------------------

export async function fetchSaleTypes(params: ScorecardParams): Promise<SaleTypeRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    category: string | null;
    is_excluded: boolean | null;
    sales_base: string | null;
    gp_base: string | null;
    sales_compare: string | null;
    gp_compare: string | null;
  };

  const rows = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          COALESCE(sale_type_reporting_category, 'Other') AS category,
          BOOL_OR(is_sale_type_excluded) AS is_excluded,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY sale_type_reporting_category
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<Row[]>`
        SELECT
          COALESCE(sale_type_reporting_category, 'Other') AS category,
          BOOL_OR(is_sale_type_excluded) AS is_excluded,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY sale_type_reporting_category
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

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
// Average days to pay
// ---------------------------------------------------------------------------

export async function fetchDaysToPay(params: ScorecardParams): Promise<DaysToPayData> {
  const sql = getErpSql();

  type Row = { avg_base: string | null; avg_compare: string | null };
  const [r] = await sql<Row[]>`
    SELECT
      AVG(days_to_pay) FILTER (
        WHERE payment_date >= make_date(${params.baseYear}, 1, 1)
          AND payment_date < make_date(${params.baseYear + 1}, 1, 1)
      )::text AS avg_base,
      AVG(days_to_pay) FILTER (
        WHERE payment_date >= make_date(${params.compareYear}, 1, 1)
          AND payment_date < make_date(${params.compareYear + 1}, 1, 1)
      )::text AS avg_compare
    FROM customer_payments
    WHERE is_deleted = false
      AND customer_id = ${params.customerId}
      AND payment_date >= make_date(${Math.min(params.baseYear, params.compareYear)}, 1, 1)
      AND payment_date < make_date(${Math.max(params.baseYear, params.compareYear) + 1}, 1, 1)
  `;

  return {
    base: r?.avg_base != null ? Math.round(toNum(r.avg_base) ?? 0) : null,
    compare: r?.avg_compare != null ? Math.round(toNum(r.avg_compare) ?? 0) : null,
  };
}

// ---------------------------------------------------------------------------
// Aggregate KPIs (company / branch / rep â€” no customer_id filter)
// ---------------------------------------------------------------------------

export async function fetchAggregateKpis(
  params: AggregateParams,
  displayTitle: string,
): Promise<KpiComparison> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear,
    params.compareYear,
    params.cutoffDate,
    params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
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

  let rows: Row[];

  if (params.repCode) {
    // rep_1 = assigned rep, rep_3 = who wrote the order
    const repCol = params.repField ?? 'rep_1';
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          WITH f AS (
            SELECT csf.sales_amount, csf.gross_profit, csf.weight,
              csf.sales_order_number, csf.is_credit_memo,
              csf.is_value_add_major, csf.is_non_stock,
              csf.ship_to_id, csf.branch_id,
              (EXTRACT(YEAR FROM csf.invoice_date)::int = ${params.baseYear}
                AND csf.invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM csf.invoice_date)::int = ${params.compareYear}
                AND csf.invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact csf
            JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
            WHERE csf.is_deleted = false
              AND csf.invoice_date >= ${dateFrom}::timestamp
              AND csf.invoice_date < ${dateTo}::timestamp
              AND soh.${sql(repCol)} = ${params.repCode}
              AND csf.branch_id = ANY(${params.branchIds}::text[])
          )
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
          FROM f
        `
      : await sql<Row[]>`
          WITH f AS (
            SELECT csf.sales_amount, csf.gross_profit, csf.weight,
              csf.sales_order_number, csf.is_credit_memo,
              csf.is_value_add_major, csf.is_non_stock,
              csf.ship_to_id, csf.branch_id,
              (EXTRACT(YEAR FROM csf.invoice_date)::int = ${params.baseYear}
                AND csf.invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM csf.invoice_date)::int = ${params.compareYear}
                AND csf.invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact csf
            JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
            WHERE csf.is_deleted = false
              AND csf.invoice_date >= ${dateFrom}::timestamp
              AND csf.invoice_date < ${dateTo}::timestamp
              AND soh.${sql(repCol)} = ${params.repCode}
          )
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
          FROM f
        `;
  } else {
    // No rep filter â€” direct fact table
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          WITH f AS (
            SELECT sales_amount, gross_profit, weight,
              sales_order_number, is_credit_memo, is_value_add_major, is_non_stock,
              ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
              AND branch_id = ANY(${params.branchIds}::text[])
          )
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
          FROM f
        `
      : await sql<Row[]>`
          WITH f AS (
            SELECT sales_amount, gross_profit, weight,
              sales_order_number, is_credit_memo, is_value_add_major, is_non_stock,
              ship_to_id, branch_id,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.baseYear}
                AND invoice_date::date <= ${baseCutoff}::date) AS is_base,
              (EXTRACT(YEAR FROM invoice_date)::int = ${params.compareYear}
                AND invoice_date::date <= ${compareCutoff}::date) AS is_compare
            FROM customer_scorecard_fact
            WHERE is_deleted = false
              AND invoice_date >= ${dateFrom}::timestamp
              AND invoice_date < ${dateTo}::timestamp
          )
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
          FROM f
        `;
  }

  const r = rows[0] ?? {};
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
    branchIds: (r as Row).branch_ids ?? [],
    shipToCount: toInt((r as Row).ship_to_count) ?? 0,
    customerName: displayTitle,
  };
}

// ---------------------------------------------------------------------------
// Aggregate 3-year comparison
// ---------------------------------------------------------------------------

export async function fetchAggregateThreeYear(
  params: AggregateParams,
): Promise<ThreeYearEntry[]> {
  const sql = getErpSql();
  const { baseCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const prior1 = params.baseYear - 1;
  const prior2 = params.baseYear - 2;

  type Row = {
    cy_sales: string | null; cy_gp: string | null;
    py1_sales: string | null; py1_gp: string | null;
    py2_sales: string | null; py2_gp: string | null;
  };

  const dateFrom = `${prior2}-01-01`;
  const dateTo = `${params.baseYear + 1}-01-01`;

  let r: Row | undefined;

  if (params.repCode) {
    const repCol = params.repField ?? 'rep_1';
    [r] = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_sales,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_gp,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${prior1}, 1, 1)
                AND csf.invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_sales,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${prior1}, 1, 1)
                AND csf.invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_gp,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${prior2}, 1, 1)
                AND csf.invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_sales,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${prior2}, 1, 1)
                AND csf.invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_gp
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
            AND csf.branch_id = ANY(${params.branchIds}::text[])
        `
      : await sql<Row[]>`
          SELECT
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_sales,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_gp,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${prior1}, 1, 1)
                AND csf.invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_sales,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${prior1}, 1, 1)
                AND csf.invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_gp,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${prior2}, 1, 1)
                AND csf.invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_sales,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${prior2}, 1, 1)
                AND csf.invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_gp
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
        `;
  } else {
    [r] = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT
            SUM(sales_amount) FILTER (
              WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_sales,
            SUM(gross_profit) FILTER (
              WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_gp,
            SUM(sales_amount) FILTER (
              WHERE invoice_date >= make_date(${prior1}, 1, 1)
                AND invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_sales,
            SUM(gross_profit) FILTER (
              WHERE invoice_date >= make_date(${prior1}, 1, 1)
                AND invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_gp,
            SUM(sales_amount) FILTER (
              WHERE invoice_date >= make_date(${prior2}, 1, 1)
                AND invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_sales,
            SUM(gross_profit) FILTER (
              WHERE invoice_date >= make_date(${prior2}, 1, 1)
                AND invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_gp
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
        `
      : await sql<Row[]>`
          SELECT
            SUM(sales_amount) FILTER (
              WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_sales,
            SUM(gross_profit) FILTER (
              WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
                AND invoice_date::date <= ${baseCutoff}::date
            )::text AS cy_gp,
            SUM(sales_amount) FILTER (
              WHERE invoice_date >= make_date(${prior1}, 1, 1)
                AND invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_sales,
            SUM(gross_profit) FILTER (
              WHERE invoice_date >= make_date(${prior1}, 1, 1)
                AND invoice_date < make_date(${prior1 + 1}, 1, 1)
            )::text AS py1_gp,
            SUM(sales_amount) FILTER (
              WHERE invoice_date >= make_date(${prior2}, 1, 1)
                AND invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_sales,
            SUM(gross_profit) FILTER (
              WHERE invoice_date >= make_date(${prior2}, 1, 1)
                AND invoice_date < make_date(${prior2 + 1}, 1, 1)
            )::text AS py2_gp
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
        `;
  }

  const periodLabel = params.period === 'YTD' ? `YTD thru ${baseCutoff}` : 'Full Year';
  return [
    { year: params.baseYear, label: `${params.baseYear} ${periodLabel}`, sales: toNum(r?.cy_sales) ?? 0, gp: toNum(r?.cy_gp) ?? 0 },
    { year: prior1, label: `12/31/${prior1}`, sales: toNum(r?.py1_sales) ?? 0, gp: toNum(r?.py1_gp) ?? 0 },
    { year: prior2, label: `12/31/${prior2}`, sales: toNum(r?.py2_sales) ?? 0, gp: toNum(r?.py2_gp) ?? 0 },
  ];
}

// ---------------------------------------------------------------------------
// Aggregate product major breakdown
// ---------------------------------------------------------------------------

export async function fetchAggregateProductMajors(
  params: AggregateParams,
): Promise<ProductMajorRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    product_major_code: string | null; product_major: string | null;
    sales_base: string | null; gp_base: string | null;
    sales_compare: string | null; gp_compare: string | null;
  };

  const baseFilter = sql`invoice_date >= make_date(${params.baseYear}, 1, 1) AND invoice_date::date <= ${baseCutoff}::date`;
  const compareFilter = sql`invoice_date >= make_date(${params.compareYear}, 1, 1) AND invoice_date::date <= ${compareCutoff}::date`;

  let rows: Row[];

  if (params.repCode) {
    const repCol = params.repField ?? 'rep_1';
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(csf.product_major_code, '') AS product_major_code,
            COALESCE(csf.product_major, 'Unknown') AS product_major,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
            AND csf.branch_id = ANY(${params.branchIds}::text[])
          GROUP BY csf.product_major_code, csf.product_major
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(csf.product_major_code, '') AS product_major_code,
            COALESCE(csf.product_major, 'Unknown') AS product_major,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
          GROUP BY csf.product_major_code, csf.product_major
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `;
  } else {
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(product_major_code, '') AS product_major_code,
            COALESCE(product_major, 'Unknown') AS product_major,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY product_major_code, product_major
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(product_major_code, '') AS product_major_code,
            COALESCE(product_major, 'Unknown') AS product_major,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
          GROUP BY product_major_code, product_major
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `;
  }

  return rows.map((r) => ({
    productMajorCode: r.product_major_code ?? '',
    productMajor: r.product_major ?? 'Unknown',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Aggregate product minor drill-down
// ---------------------------------------------------------------------------

export async function fetchAggregateProductMinors(
  params: AggregateParams,
  majorCode: string,
): Promise<ProductMinorRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    product_minor_code: string | null; product_minor: string | null;
    sales_base: string | null; gp_base: string | null;
    sales_compare: string | null; gp_compare: string | null;
  };

  const baseFilter = sql`invoice_date >= make_date(${params.baseYear}, 1, 1) AND invoice_date::date <= ${baseCutoff}::date`;
  const compareFilter = sql`invoice_date >= make_date(${params.compareYear}, 1, 1) AND invoice_date::date <= ${compareCutoff}::date`;

  let rows: Row[];
  if (params.repCode) {
    const repCol = params.repField ?? 'rep_1';
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(csf.product_minor_code, '') AS product_minor_code,
            COALESCE(csf.product_minor, 'Unknown') AS product_minor,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.product_major_code = ${majorCode}
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
            AND csf.branch_id = ANY(${params.branchIds}::text[])
          GROUP BY csf.product_minor_code, csf.product_minor
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(csf.product_minor_code, '') AS product_minor_code,
            COALESCE(csf.product_minor, 'Unknown') AS product_minor,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.product_major_code = ${majorCode}
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
          GROUP BY csf.product_minor_code, csf.product_minor
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `;
  } else {
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(product_minor_code, '') AS product_minor_code,
            COALESCE(product_minor, 'Unknown') AS product_minor,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${majorCode}
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY product_minor_code, product_minor
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(product_minor_code, '') AS product_minor_code,
            COALESCE(product_minor, 'Unknown') AS product_minor,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND product_major_code = ${majorCode}
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
          GROUP BY product_minor_code, product_minor
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `;
  }

  return rows.map((r) => ({
    productMinorCode: r.product_minor_code ?? '',
    productMinor: r.product_minor ?? 'Unknown',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Product item drill-down (on demand, within a major+minor)
// ---------------------------------------------------------------------------

export async function fetchProductItems(
  params: ScorecardParams,
  majorCode: string,
  minorCode: string,
): Promise<ProductItemRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    item_number: string | null;
    item_description: string | null;
    qty_base: string | null;
    sales_base: string | null;
    gp_base: string | null;
    qty_compare: string | null;
    sales_compare: string | null;
    gp_compare: string | null;
  };

  const rows = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          COALESCE(item_number, '') AS item_number,
          COALESCE(item_description, '') AS item_description,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS qty_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS qty_compare,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND COALESCE(product_minor_code, '') = ${minorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY item_number, item_description
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<Row[]>`
        SELECT
          COALESCE(item_number, '') AS item_number,
          COALESCE(item_description, '') AS item_description,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS qty_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS qty_compare,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS gp_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND COALESCE(product_minor_code, '') = ${minorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY item_number, item_description
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

  return rows.map((r) => ({
    itemNumber: r.item_number ?? '',
    itemDescription: r.item_description ?? '',
    qtyBase: toNum(r.qty_base) ?? 0,
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    qtyCompare: toNum(r.qty_compare) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Aggregate product item drill-down
// ---------------------------------------------------------------------------

export async function fetchAggregateProductItems(
  params: AggregateParams,
  majorCode: string,
  minorCode: string,
): Promise<ProductItemRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    item_number: string | null; item_description: string | null;
    qty_base: string | null; sales_base: string | null; gp_base: string | null;
    qty_compare: string | null; sales_compare: string | null; gp_compare: string | null;
  };

  const baseFilter = sql`invoice_date >= make_date(${params.baseYear}, 1, 1) AND invoice_date::date <= ${baseCutoff}::date`;
  const compareFilter = sql`invoice_date >= make_date(${params.compareYear}, 1, 1) AND invoice_date::date <= ${compareCutoff}::date`;

  let rows: Row[];
  if (params.repCode) {
    const repCol = params.repField ?? 'rep_1';
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(csf.item_number, '') AS item_number,
            COALESCE(csf.item_description, '') AS item_description,
            SUM(csf.qty_shipped) FILTER (WHERE csf.${baseFilter})::text AS qty_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.qty_shipped) FILTER (WHERE csf.${compareFilter})::text AS qty_compare,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND COALESCE(csf.product_major_code, '') = ${majorCode}
            AND COALESCE(csf.product_minor_code, '') = ${minorCode}
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
            AND csf.branch_id = ANY(${params.branchIds}::text[])
          GROUP BY csf.item_number, csf.item_description
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(csf.item_number, '') AS item_number,
            COALESCE(csf.item_description, '') AS item_description,
            SUM(csf.qty_shipped) FILTER (WHERE csf.${baseFilter})::text AS qty_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.qty_shipped) FILTER (WHERE csf.${compareFilter})::text AS qty_compare,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND COALESCE(csf.product_major_code, '') = ${majorCode}
            AND COALESCE(csf.product_minor_code, '') = ${minorCode}
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
          GROUP BY csf.item_number, csf.item_description
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `;
  } else {
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(item_number, '') AS item_number,
            COALESCE(item_description, '') AS item_description,
            SUM(qty_shipped) FILTER (WHERE ${baseFilter})::text AS qty_base,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(qty_shipped) FILTER (WHERE ${compareFilter})::text AS qty_compare,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND COALESCE(product_major_code, '') = ${majorCode}
            AND COALESCE(product_minor_code, '') = ${minorCode}
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY item_number, item_description
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(item_number, '') AS item_number,
            COALESCE(item_description, '') AS item_description,
            SUM(qty_shipped) FILTER (WHERE ${baseFilter})::text AS qty_base,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(qty_shipped) FILTER (WHERE ${compareFilter})::text AS qty_compare,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND COALESCE(product_major_code, '') = ${majorCode}
            AND COALESCE(product_minor_code, '') = ${minorCode}
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
          GROUP BY item_number, item_description
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `;
  }

  return rows.map((r) => ({
    itemNumber: r.item_number ?? '',
    itemDescription: r.item_description ?? '',
    qtyBase: toNum(r.qty_base) ?? 0,
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    qtyCompare: toNum(r.qty_compare) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Product order drill-down (customer scorecard only, base year)
// ---------------------------------------------------------------------------

export async function fetchProductOrders(
  params: ScorecardParams,
  majorCode: string,
  minorCode: string,
  itemNumber: string,
): Promise<ProductOrderRow[]> {
  const sql = getErpSql();
  const { baseCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );

  type Row = {
    so_number: string | null;
    invoice_date: string | null;
    qty: string | null;
    sales: string | null;
    gp: string | null;
  };

  const rows = params.branchIds.length > 0
    ? await sql<Row[]>`
        SELECT
          COALESCE(sales_order_number, '') AS so_number,
          MAX(invoice_date::date)::text AS invoice_date,
          SUM(qty_shipped)::text AS qty,
          SUM(sales_amount)::text AS sales,
          SUM(gross_profit)::text AS gp
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND COALESCE(product_minor_code, '') = ${minorCode}
          AND COALESCE(item_number, '') = ${itemNumber}
          AND invoice_date >= make_date(${params.baseYear}, 1, 1)::timestamp
          AND invoice_date::date <= ${baseCutoff}::date
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY sales_order_number
        ORDER BY MAX(invoice_date::date) DESC
        LIMIT 100
      `
    : await sql<Row[]>`
        SELECT
          COALESCE(sales_order_number, '') AS so_number,
          MAX(invoice_date::date)::text AS invoice_date,
          SUM(qty_shipped)::text AS qty,
          SUM(sales_amount)::text AS sales,
          SUM(gross_profit)::text AS gp
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND customer_id = ${params.customerId}
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND COALESCE(product_minor_code, '') = ${minorCode}
          AND COALESCE(item_number, '') = ${itemNumber}
          AND invoice_date >= make_date(${params.baseYear}, 1, 1)::timestamp
          AND invoice_date::date <= ${baseCutoff}::date
        GROUP BY sales_order_number
        ORDER BY MAX(invoice_date::date) DESC
        LIMIT 100
      `;

  return rows.map((r) => ({
    soNumber: r.so_number ?? '',
    invoiceDate: r.invoice_date ?? '',
    qty: toNum(r.qty) ?? 0,
    sales: toNum(r.sales) ?? 0,
    gp: toNum(r.gp) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Aggregate sale type breakdown
// ---------------------------------------------------------------------------

export async function fetchAggregateSaleTypes(
  params: AggregateParams,
): Promise<SaleTypeRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(
    params.baseYear, params.compareYear, params.cutoffDate, params.period,
  );
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type Row = {
    category: string | null;
    is_excluded: boolean | null;
    sales_base: string | null; gp_base: string | null;
    sales_compare: string | null; gp_compare: string | null;
  };

  const baseFilter = sql`invoice_date >= make_date(${params.baseYear}, 1, 1) AND invoice_date::date <= ${baseCutoff}::date`;
  const compareFilter = sql`invoice_date >= make_date(${params.compareYear}, 1, 1) AND invoice_date::date <= ${compareCutoff}::date`;

  let rows: Row[];
  if (params.repCode) {
    const repCol = params.repField ?? 'rep_1';
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(csf.sale_type_reporting_category, 'Other') AS category,
            BOOL_OR(csf.is_sale_type_excluded) AS is_excluded,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
            AND csf.branch_id = ANY(${params.branchIds}::text[])
          GROUP BY csf.sale_type_reporting_category
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(csf.sale_type_reporting_category, 'Other') AS category,
            BOOL_OR(csf.is_sale_type_excluded) AS is_excluded,
            SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter})::text AS sales_base,
            SUM(csf.gross_profit) FILTER (WHERE csf.${baseFilter})::text AS gp_base,
            SUM(csf.sales_amount) FILTER (WHERE csf.${compareFilter})::text AS sales_compare,
            SUM(csf.gross_profit) FILTER (WHERE csf.${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.${sql(repCol)} = ${params.repCode}
          GROUP BY csf.sale_type_reporting_category
          ORDER BY COALESCE(SUM(csf.sales_amount) FILTER (WHERE csf.${baseFilter}), 0) DESC
        `;
  } else {
    rows = params.branchIds.length > 0
      ? await sql<Row[]>`
          SELECT COALESCE(sale_type_reporting_category, 'Other') AS category,
            BOOL_OR(is_sale_type_excluded) AS is_excluded,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
            AND branch_id = ANY(${params.branchIds}::text[])
          GROUP BY sale_type_reporting_category
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
        `
      : await sql<Row[]>`
          SELECT COALESCE(sale_type_reporting_category, 'Other') AS category,
            BOOL_OR(is_sale_type_excluded) AS is_excluded,
            SUM(sales_amount) FILTER (WHERE ${baseFilter})::text AS sales_base,
            SUM(gross_profit) FILTER (WHERE ${baseFilter})::text AS gp_base,
            SUM(sales_amount) FILTER (WHERE ${compareFilter})::text AS sales_compare,
            SUM(gross_profit) FILTER (WHERE ${compareFilter})::text AS gp_compare
          FROM customer_scorecard_fact
          WHERE is_deleted = false
            AND invoice_date >= ${dateFrom}::timestamp
            AND invoice_date < ${dateTo}::timestamp
          GROUP BY sale_type_reporting_category
          ORDER BY COALESCE(SUM(sales_amount) FILTER (WHERE ${baseFilter}), 0) DESC
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
// Branch summary table (for overview page)
// ---------------------------------------------------------------------------

export async function fetchBranchSummaries(
  baseYear: number,
  compareYear: number,
  cutoffDate: string,
  period: string,
): Promise<BranchSummaryRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(baseYear, compareYear, cutoffDate, period);
  const { dateFrom, dateTo } = yearRange(baseYear, compareYear);

  type Row = {
    branch_id: string | null;
    sales_base: string | null; sales_compare: string | null;
    gp_base: string | null; gp_compare: string | null;
    customer_count: string | null;
  };

  const rows = await sql<Row[]>`
    SELECT
      branch_id,
      SUM(sales_amount) FILTER (
        WHERE invoice_date >= make_date(${baseYear}, 1, 1)
          AND invoice_date::date <= ${baseCutoff}::date
      )::text AS sales_base,
      SUM(sales_amount) FILTER (
        WHERE invoice_date >= make_date(${compareYear}, 1, 1)
          AND invoice_date::date <= ${compareCutoff}::date
      )::text AS sales_compare,
      SUM(gross_profit) FILTER (
        WHERE invoice_date >= make_date(${baseYear}, 1, 1)
          AND invoice_date::date <= ${baseCutoff}::date
      )::text AS gp_base,
      SUM(gross_profit) FILTER (
        WHERE invoice_date >= make_date(${compareYear}, 1, 1)
          AND invoice_date::date <= ${compareCutoff}::date
      )::text AS gp_compare,
      COUNT(DISTINCT customer_id) FILTER (
        WHERE invoice_date >= make_date(${baseYear}, 1, 1)
          AND invoice_date::date <= ${baseCutoff}::date
      )::text AS customer_count
    FROM customer_scorecard_fact
    WHERE is_deleted = false
      AND invoice_date >= ${dateFrom}::timestamp
      AND invoice_date < ${dateTo}::timestamp
      AND branch_id IS NOT NULL
    GROUP BY branch_id
    ORDER BY COALESCE(SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${baseYear}, 1, 1)
        AND invoice_date::date <= ${baseCutoff}::date
    ), 0) DESC
  `;

  return rows.map((r) => ({
    branchId: r.branch_id ?? '',
    salesBase: toNum(r.sales_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
    customerCount: toInt(r.customer_count) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Rep list (for rep index page)
// Shows both assigned book (rep_1) and written-up (rep_3) per rep in one query.
// ---------------------------------------------------------------------------

export async function fetchRepList(
  baseYear: number,
  compareYear: number,
  cutoffDate: string,
  period: string,
  branchIds: string[],
): Promise<RepListRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(baseYear, compareYear, cutoffDate, period);
  const { dateFrom, dateTo } = yearRange(baseYear, compareYear);

  type Row = {
    rep_code: string | null;
    a_sales_base: string | null; a_sales_compare: string | null;
    a_gp_base: string | null; a_customer_count: string | null;
    w_sales_base: string | null; w_sales_compare: string | null;
    w_gp_base: string | null;
  };

  const rows = branchIds.length > 0
    ? await sql<Row[]>`
        WITH assigned AS (
          SELECT soh.rep_1 AS rep_code,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS sales_base,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${compareYear}, 1, 1)
                AND csf.invoice_date::date <= ${compareCutoff}::date
            ) AS sales_compare,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS gp_base,
            COUNT(DISTINCT csf.customer_id) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS customer_count
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND csf.branch_id = ANY(${branchIds}::text[])
            AND soh.rep_1 IS NOT NULL
          GROUP BY soh.rep_1
        ),
        written AS (
          SELECT soh.rep_3 AS rep_code,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS sales_base,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${compareYear}, 1, 1)
                AND csf.invoice_date::date <= ${compareCutoff}::date
            ) AS sales_compare,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS gp_base
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND csf.branch_id = ANY(${branchIds}::text[])
            AND soh.rep_3 IS NOT NULL
          GROUP BY soh.rep_3
        )
        SELECT
          COALESCE(a.rep_code, w.rep_code) AS rep_code,
          a.sales_base::text AS a_sales_base,
          a.sales_compare::text AS a_sales_compare,
          a.gp_base::text AS a_gp_base,
          a.customer_count::text AS a_customer_count,
          w.sales_base::text AS w_sales_base,
          w.sales_compare::text AS w_sales_compare,
          w.gp_base::text AS w_gp_base
        FROM assigned a
        FULL OUTER JOIN written w ON a.rep_code = w.rep_code
        WHERE COALESCE(a.rep_code, w.rep_code) IS NOT NULL
        ORDER BY COALESCE(a.sales_base, 0) DESC
      `
    : await sql<Row[]>`
        WITH assigned AS (
          SELECT soh.rep_1 AS rep_code,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS sales_base,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${compareYear}, 1, 1)
                AND csf.invoice_date::date <= ${compareCutoff}::date
            ) AS sales_compare,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS gp_base,
            COUNT(DISTINCT csf.customer_id) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS customer_count
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.rep_1 IS NOT NULL
          GROUP BY soh.rep_1
        ),
        written AS (
          SELECT soh.rep_3 AS rep_code,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS sales_base,
            SUM(csf.sales_amount) FILTER (
              WHERE csf.invoice_date >= make_date(${compareYear}, 1, 1)
                AND csf.invoice_date::date <= ${compareCutoff}::date
            ) AS sales_compare,
            SUM(csf.gross_profit) FILTER (
              WHERE csf.invoice_date >= make_date(${baseYear}, 1, 1)
                AND csf.invoice_date::date <= ${baseCutoff}::date
            ) AS gp_base
          FROM customer_scorecard_fact csf
          JOIN agility_so_header soh ON soh.so_id::text = csf.sales_order_number
          WHERE csf.is_deleted = false
            AND csf.invoice_date >= ${dateFrom}::timestamp
            AND csf.invoice_date < ${dateTo}::timestamp
            AND soh.rep_3 IS NOT NULL
          GROUP BY soh.rep_3
        )
        SELECT
          COALESCE(a.rep_code, w.rep_code) AS rep_code,
          a.sales_base::text AS a_sales_base,
          a.sales_compare::text AS a_sales_compare,
          a.gp_base::text AS a_gp_base,
          a.customer_count::text AS a_customer_count,
          w.sales_base::text AS w_sales_base,
          w.sales_compare::text AS w_sales_compare,
          w.gp_base::text AS w_gp_base
        FROM assigned a
        FULL OUTER JOIN written w ON a.rep_code = w.rep_code
        WHERE COALESCE(a.rep_code, w.rep_code) IS NOT NULL
        ORDER BY COALESCE(a.sales_base, 0) DESC
      `;

  return rows.map((r) => ({
    repCode: r.rep_code ?? '',
    assignedSalesBase: toNum(r.a_sales_base) ?? 0,
    assignedSalesCompare: toNum(r.a_sales_compare) ?? 0,
    assignedGpBase: toNum(r.a_gp_base) ?? 0,
    assignedCustomerCount: toInt(r.a_customer_count) ?? 0,
    writtenSalesBase: toNum(r.w_sales_base) ?? 0,
    writtenSalesCompare: toNum(r.w_sales_compare) ?? 0,
    writtenGpBase: toNum(r.w_gp_base) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Product Scorecard — aggregate by product group (no customer filter)
// ---------------------------------------------------------------------------

type ProdRow = {
  code: string | null; label: string | null;
  sales_base: string | null; gp_base: string | null;
  so_count_base: string | null; credit_count_base: string | null; qty_base: string | null;
  sales_compare: string | null; gp_compare: string | null;
  so_count_compare: string | null; qty_compare: string | null;
};

function buildProdSelect(
  codeExpr: string,
  labelExpr: string,
  baseCutoff: string,
  compareCutoff: string,
  baseYear: number,
  compareYear: number,
) {
  return `
    COALESCE(${codeExpr}, '') AS code,
    COALESCE(${labelExpr}, 'Unknown') AS label,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS sales_base,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS gp_base,
    COUNT(DISTINCT sales_order_number) FILTER (
      WHERE invoice_date >= make_date(${baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
        AND is_credit_memo IS NOT TRUE
    )::text AS so_count_base,
    COUNT(DISTINCT sales_order_number) FILTER (
      WHERE invoice_date >= make_date(${baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
        AND is_credit_memo = true
    )::text AS credit_count_base,
    SUM(qty_shipped) FILTER (
      WHERE invoice_date >= make_date(${baseYear}, 1, 1)
        AND invoice_date::date <= '${baseCutoff}'::date
    )::text AS qty_base,
    SUM(sales_amount) FILTER (
      WHERE invoice_date >= make_date(${compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS sales_compare,
    SUM(gross_profit) FILTER (
      WHERE invoice_date >= make_date(${compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS gp_compare,
    COUNT(DISTINCT sales_order_number) FILTER (
      WHERE invoice_date >= make_date(${compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
        AND is_credit_memo IS NOT TRUE
    )::text AS so_count_compare,
    SUM(qty_shipped) FILTER (
      WHERE invoice_date >= make_date(${compareYear}, 1, 1)
        AND invoice_date::date <= '${compareCutoff}'::date
    )::text AS qty_compare
  `;
}

function mapProdMajorRow(r: ProdRow): ProductScorecardMajorRow {
  return {
    productMajorCode: r.code ?? '',
    productMajor: r.label ?? 'Unknown',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    soCountBase: toInt(r.so_count_base) ?? 0,
    creditCountBase: toInt(r.credit_count_base) ?? 0,
    qtyBase: toNum(r.qty_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
    soCountCompare: toInt(r.so_count_compare) ?? 0,
    qtyCompare: toNum(r.qty_compare) ?? 0,
  };
}

function mapProdMinorRow(r: ProdRow): ProductScorecardMinorRow {
  return {
    productMinorCode: r.code ?? '',
    productMinor: r.label ?? 'Unknown',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    soCountBase: toInt(r.so_count_base) ?? 0,
    creditCountBase: toInt(r.credit_count_base) ?? 0,
    qtyBase: toNum(r.qty_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    gpCompare: toNum(r.gp_compare) ?? 0,
    soCountCompare: toInt(r.so_count_compare) ?? 0,
    qtyCompare: toNum(r.qty_compare) ?? 0,
  };
}

export async function fetchProductScorecardMajors(
  params: AggregateParams,
): Promise<ProductScorecardMajorRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(params.baseYear, params.compareYear, params.cutoffDate, params.period);
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);
  const sel = buildProdSelect('product_major_code', 'product_major', baseCutoff, compareCutoff, params.baseYear, params.compareYear);

  const rows = params.branchIds.length > 0
    ? await sql<ProdRow[]>`
        SELECT ${sql.unsafe(sel)}
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY product_major_code, product_major
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<ProdRow[]>`
        SELECT ${sql.unsafe(sel)}
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY product_major_code, product_major
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

  return rows.map(mapProdMajorRow);
}

export async function fetchProductScorecardMinors(
  params: AggregateParams,
  majorCode: string,
): Promise<ProductScorecardMinorRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(params.baseYear, params.compareYear, params.cutoffDate, params.period);
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);
  const sel = buildProdSelect('product_minor_code', 'product_minor', baseCutoff, compareCutoff, params.baseYear, params.compareYear);

  const rows = params.branchIds.length > 0
    ? await sql<ProdRow[]>`
        SELECT ${sql.unsafe(sel)}
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY product_minor_code, product_minor
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<ProdRow[]>`
        SELECT ${sql.unsafe(sel)}
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY product_minor_code, product_minor
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

  return rows.map(mapProdMinorRow);
}

export async function fetchProductScorecardItems(
  params: AggregateParams,
  majorCode: string,
  minorCode: string,
): Promise<ProductScorecardItemRow[]> {
  const sql = getErpSql();
  const { baseCutoff, compareCutoff } = getCutoffs(params.baseYear, params.compareYear, params.cutoffDate, params.period);
  const { dateFrom, dateTo } = yearRange(params.baseYear, params.compareYear);

  type ItemRow = {
    item_number: string | null; item_description: string | null;
    sales_base: string | null; gp_base: string | null;
    so_count_base: string | null; qty_base: string | null;
    sales_compare: string | null; so_count_compare: string | null; qty_compare: string | null;
  };

  const rows = params.branchIds.length > 0
    ? await sql<ItemRow[]>`
        SELECT
          COALESCE(item_number, '') AS item_number,
          COALESCE(item_description, '') AS item_description,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          COUNT(DISTINCT sales_order_number) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
              AND is_credit_memo IS NOT TRUE
          )::text AS so_count_base,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS qty_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          COUNT(DISTINCT sales_order_number) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
              AND is_credit_memo IS NOT TRUE
          )::text AS so_count_compare,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS qty_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND COALESCE(product_minor_code, '') = ${minorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
          AND branch_id = ANY(${params.branchIds}::text[])
        GROUP BY item_number, item_description
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `
    : await sql<ItemRow[]>`
        SELECT
          COALESCE(item_number, '') AS item_number,
          COALESCE(item_description, '') AS item_description,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS sales_base,
          SUM(gross_profit) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS gp_base,
          COUNT(DISTINCT sales_order_number) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
              AND is_credit_memo IS NOT TRUE
          )::text AS so_count_base,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
              AND invoice_date::date <= ${baseCutoff}::date
          )::text AS qty_base,
          SUM(sales_amount) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS sales_compare,
          COUNT(DISTINCT sales_order_number) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
              AND is_credit_memo IS NOT TRUE
          )::text AS so_count_compare,
          SUM(qty_shipped) FILTER (
            WHERE invoice_date >= make_date(${params.compareYear}, 1, 1)
              AND invoice_date::date <= ${compareCutoff}::date
          )::text AS qty_compare
        FROM customer_scorecard_fact
        WHERE is_deleted = false
          AND COALESCE(product_major_code, '') = ${majorCode}
          AND COALESCE(product_minor_code, '') = ${minorCode}
          AND invoice_date >= ${dateFrom}::timestamp
          AND invoice_date < ${dateTo}::timestamp
        GROUP BY item_number, item_description
        ORDER BY COALESCE(SUM(sales_amount) FILTER (
          WHERE invoice_date >= make_date(${params.baseYear}, 1, 1)
            AND invoice_date::date <= ${baseCutoff}::date
        ), 0) DESC
      `;

  return rows.map((r) => ({
    itemNumber: r.item_number ?? '',
    itemDescription: r.item_description ?? '',
    salesBase: toNum(r.sales_base) ?? 0,
    gpBase: toNum(r.gp_base) ?? 0,
    soCountBase: toInt(r.so_count_base) ?? 0,
    qtyBase: toNum(r.qty_base) ?? 0,
    salesCompare: toNum(r.sales_compare) ?? 0,
    soCountCompare: toInt(r.so_count_compare) ?? 0,
    qtyCompare: toNum(r.qty_compare) ?? 0,
  }));
}
