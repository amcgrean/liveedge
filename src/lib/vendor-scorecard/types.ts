export type VendorScorecardParams = {
  range: 'MTD' | 'QTD' | 'YTD' | 'TTM' | 'FY';
  branch: string;       // 'all' | system_id (e.g. '20GR')
  productGroup: string; // 'all' | group name
};

export type VendorListRow = {
  supplierKey: string;
  supplierCode: string;
  supplierName: string;
  primaryProductGroup: string;
  spendYTD: number;
  spendPY: number;
  rebateEarnedYTD: number;
  rebateAccrued: number;
  fillRatePct: number | null;
  otdPct: number | null;
  openPoCount: number;
  openPoValue: number;
  lastReceiveDate: string | null;
  riskFlagCount: number;
  activeProgramCount: number;
  shipFromSeq: number | null;
};

export type BranchSpend = {
  systemId: string;
  branchName: string;
  spendYTD: number;
  spendPY: number;
  fillRatePct: number | null;
  otdPct: number | null;
};

export type ProductGroupSpend = {
  productGroup: string;
  spendYTD: number;
  pctOfTotal: number;
};

export type TierBreakpoint = {
  threshold: number;
  rate_pct: number;
};

export type RebateProgram = {
  id: number;
  programName: string;
  programType: 'volume_tier' | 'growth' | 'mix_attach' | 'other';
  periodStart: string;
  periodEnd: string;
  targetAmount: number | null;
  rebateRatePct: number | null;
  productGroup: string | null;
  attainedAmount: number;
  earnedRebate: number;
  accruedRebate: number;
  payoutTiming: string;
  milestoneLabel: string | null;
  tierBreakpoints: TierBreakpoint[] | null;
  toNextTierAmount: number | null;
  nextTierRatePct: number | null;
};

export type RiskFlag = {
  id: number;
  flagType: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  createdAt: string;
};

export type VendorDetail = {
  supplierKey: string;
  supplierCode: string;
  supplierName: string;
  spendYTD: number;
  spendPY: number;
  rebateEarnedYTD: number;
  rebateAccrued: number;
  fillRatePct: number | null;
  otdPct: number | null;
  openPoCount: number;
  openPoValue: number;
  branchBreakdown: BranchSpend[];
  productGroupBreakdown: ProductGroupSpend[];
  rebatePrograms: RebateProgram[];
  riskFlags: RiskFlag[];
};

export type VendorScorecardSummary = {
  totalSpendYTD: number;
  totalSpendPY: number;
  totalRebateEarned: number;
  totalRebateAccrued: number;
  totalRebateForecastFY: number;
  top3ConcentrationPct: number;
  programsOnTrack: number;
  programsAtRisk: number;
  programsMissed: number;
  avgFillRatePct: number | null;
  avgOtdPct: number | null;
};

/** Annual receipts $ + line count for the vendor 3-year chart. */
export type VendorYearEntry = {
  year: number;
  label: string;
  spend: number;       // receiving_lines.cost sum
  receiptCount: number;
  lineCount: number;
};

/** Top-item row on the vendor scorecard. */
export type VendorItemRow = {
  itemCode: string;
  description: string | null;
  productMajorCode: string | null;
  productMajor: string | null;
  productMinorCode: string | null;
  productMinor: string | null;
  spendYTD: number;
  qtyYTD: number;
  lineCount: number;
};

/** Aggregate Branch & Mix tab — one row per branch. */
export type VendorBranchSummaryRow = {
  systemId: string;
  branchName: string;
  vendorCount: number;
  spendYTD: number;
  spendPY: number;
  pctOfTotal: number;
  fillRatePct: number | null;
  otdPct: number | null;
};

/** Risk flags derived from operational metrics (separate from stored supplier_risk_flags). */
export type VendorDerivedRiskFlags = {
  lowFillRate: boolean;     // fillRatePct < 90
  lateDelivery: boolean;    // otdPct < 85
  missedRebate: boolean;    // any active rebate program with <50% attainment past YTD pacing
  noRecentReceipts: boolean; // open POs exist but no receipts in last 60 days
  count: number;            // total true booleans above
};
