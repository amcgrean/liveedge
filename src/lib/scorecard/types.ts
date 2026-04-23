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

export interface SaleTypeRow {
  category: string;
  salesBase: number;
  gpBase: number;
  salesCompare: number;
  gpCompare: number;
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
  salesBase: number;
  salesCompare: number;
  gpBase: number;
  gpCompare: number;
  customerCount: number;
}
