'use client';

import React from 'react';
import {
  ChartCard,
  ComboBarLineChart,
  ComparisonBarChart,
  ParetoChart,
  fmtCurrency0,
  fmtCurrencyCompact,
} from '@/components/charts';
import type {
  BranchSummaryRow,
  SaleTypeRow,
  ThreeYearEntry,
} from '../../../src/lib/scorecard/types';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

interface ManagementChartsProps {
  threeYear: ThreeYearEntry[];
  branchSummaries: BranchSummaryRow[];
  saleTypes: SaleTypeRow[];
  baseYear: number;
  compareYear: number;
}

export default function ManagementCharts({
  threeYear,
  branchSummaries,
  saleTypes,
  baseYear,
  compareYear,
}: ManagementChartsProps) {
  // M1: 3-year combo — bars=sales, line=GM%
  const threeYearData = threeYear.map((e) => ({
    label: e.label,
    bar: e.sales,
    line: e.sales !== 0 ? (e.gp / e.sales) * 100 : 0,
  }));

  // M2: branch comparison
  const branchRows = branchSummaries.map((b) => ({
    id: b.branchId,
    label: BRANCH_LABELS[b.branchId] ?? b.branchId,
    base: b.salesBase,
    compare: b.salesCompare,
  }));

  // M3: sale-type Pareto, exclude flagged-out categories, sort desc
  const paretoRows = saleTypes
    .filter((s) => !s.isExcluded && s.salesBase > 0)
    .map((s) => ({ label: s.category, value: s.salesBase }));

  const showThreeYear = threeYearData.length > 0;
  const showBranches = branchRows.length > 0;
  const showPareto = paretoRows.length > 0;

  if (!showThreeYear && !showBranches && !showPareto) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {showThreeYear && (
        <ChartCard
          title="3-Year Sales & Margin"
          subtitle="Annual revenue with gross-margin trend"
          className="lg:col-span-2"
        >
          <ComboBarLineChart
            data={threeYearData}
            barLabel="Net Sales"
            lineLabel="GM %"
            barFormat={fmtCurrencyCompact}
            height={260}
          />
        </ChartCard>
      )}
      {showBranches && (
        <ChartCard
          title="Branch Comparison"
          subtitle={`${baseYear} vs ${compareYear} sales by branch`}
        >
          <ComparisonBarChart
            rows={branchRows}
            baseLabel={String(baseYear)}
            compareLabel={String(compareYear)}
            format={fmtCurrency0}
          />
        </ChartCard>
      )}
      {showPareto && (
        <ChartCard
          title="Sales Mix by Type"
          subtitle="Concentration — bars are sales, line is cumulative %"
        >
          <ParetoChart
            rows={paretoRows}
            format={fmtCurrencyCompact}
            valueLabel={`${baseYear} Sales`}
            height={300}
          />
        </ChartCard>
      )}
    </div>
  );
}
