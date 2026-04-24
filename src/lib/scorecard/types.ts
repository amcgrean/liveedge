export type ScorecardPeriod = 'YTD' | 'Full Year';

export interface ScorecardParams {
  customerId: string;
  branchIds: string[];
  baseYear: number;
  compareYear: number;
  period: ScorecardPeriod;
  cutoffDate: string; // YYYY-MM-DD, defaults to today
}

export interface KpiSet {
  sales: number | null;
  gp: number | null;
  vaSales: number | null;       // value-add sales
  nsSales: number | null;       // non-stock sales
  nsGp: number | null;          // non-stock GP
  grossSales: number | null;    // sales before CMs
  cmSales: number | null;       // credit memo dollars (negative)
  soCount: number | null;
  cmCount: number | null;
  totalWeight: number | null;
}

export interface KpiComparison {
  base: KpiSet;
  compare: KpiSet;
  branchIds: string[];
  shipToCount: number;
  customerName: string;
}

export interface CustomerAvg {
  gmPct: number | null;
  vaPct: number | null;
  nsPct: number | null;
}

export interface ProductMajorRow {
  productMajorCode: string;
  productMajor: string;
  salesBase: number;
  gpBase: number;
  salesCompare: number;
  gpCompare: number;
}

export interface ProductMinorRow {
  productMinorCode: string;
  productMinor: string;
  salesBase: number;
  gpBase: number;
  salesCompare: number;
  gpCompare: number;
}

export interface ProductItemRow {
  itemNumber: string;
  itemDescription: string;
  qtyBase: number;
  salesBase: number;
  gpBase: number;
  qtyCompare: number;
  salesCompare: number;
  gpCompare: number;
}

export interface ProductOrderRow {
  soNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  qty: number;
  sales: number;
  gp: number;
}

// ---------------------------------------------------------------------------
// Product Scorecard (aggregate across all customers, by product group)
// ---------------------------------------------------------------------------

export interface ProductScorecardMajorRow {
  productMajorCode: string;
  productMajor: string;
  salesBase: number;
  gpBase: number;
  soCountBase: number;
  creditCountBase: number;
  qtyBase: number;
  salesCompare: number;
  gpCompare: number;
  soCountCompare: number;
  qtyCompare: number;
}

export interface ProductScorecardMinorRow {
  productMinorCode: string;
  productMinor: string;
  salesBase: number;
  gpBase: number;
  soCountBase: number;
  creditCountBase: number;
  qtyBase: number;
  salesCompare: number;
  gpCompare: number;
  soCountCompare: number;
  qtyCompare: number;
}

export interface ProductScorecardItemRow {
  itemNumber: string;
  itemDescription: string;
  salesBase: number;
  gpBase: number;
  soCountBase: number;
  qtyBase: number;
  salesCompare: number;
  soCountCompare: number;
  qtyCompare: number;
}

export interface SaleTypeRow {
  category: string;
  salesBase: number;
  gpBase: number;
  salesCompare: number;
  gpCompare: number;
  isExcluded: boolean;
}

export interface ThreeYearEntry {
  year: number;
  label: string;
  sales: number;
  gp: number;
}

export interface DaysToPayData {
  base: number | null;
  compare: number | null;
}

export interface CustomerListRow {
  customerId: string;
  customerName: string;
  salesBase: number;
  salesCompare: number;
  gpBase: number;
  branchIds: string[];
}

export interface ScorecardPageData {
  kpis: KpiComparison;
  threeYear: ThreeYearEntry[];
  productMajors: ProductMajorRow[];
  saleTypes: SaleTypeRow[];
  daysToPay: DaysToPayData;
  params: ScorecardParams;
}

// ---------------------------------------------------------------------------
// Aggregate views (overview / branch / rep)
// ---------------------------------------------------------------------------

export interface AggregateParams {
  branchIds: string[];  // empty = all branches
  repCode?: string;     // if set, scope to this sales rep
  repField?: 'rep_1' | 'rep_3'; // rep_1=assigned rep, rep_3=who wrote the order; defaults to rep_1
  baseYear: number;
  compareYear: number;
  period: ScorecardPeriod;
  cutoffDate: string;
}

export interface BranchSummaryRow {
  branchId: string;
  salesBase: number;
  salesCompare: number;
  gpBase: number;
  gpCompare: number;
  customerCount: number;
}

export interface RepListRow {
  repCode: string;
  // assigned book (rep_1 — customer's primary rep)
  assignedSalesBase: number;
  assignedSalesCompare: number;
  assignedGpBase: number;
  assignedCustomerCount: number;
  // written up (rep_3 — who entered the order)
  writtenSalesBase: number;
  writtenSalesCompare: number;
  writtenGpBase: number;
}
