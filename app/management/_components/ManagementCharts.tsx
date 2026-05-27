'use client';

import React, { useState } from 'react';
import {
  ChartCard,
  ComboBarLineChart,
  ComparisonBarChart,
  ParetoChart,
  fmtCurrency0,
  fmtCurrencyCompact,
} from '@/components/charts';
import { ThreeYearTable, BranchSummaryTable, SalesByTypeTable } from './ManagementTables';
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
  qs?: string;
}

function ChartTableToggle({
  view,
  onChange,
}: {
  view: 'chart' | 'table';
  onChange: (v: 'chart' | 'table') => void;
}) {
  return (
    <div className="seg">
      <button onClick={() => onChange('chart')} className={view === 'chart' ? 'active' : ''}>
        Chart
      </button>
      <button onClick={() => onChange('table')} className={view === 'table' ? 'active' : ''}>
        Table
      </button>
    </div>
  );
}

export default function ManagementCharts({
  threeYear,
  branchSummaries,
  saleTypes,
  baseYear,
  compareYear,
  qs = '',
}: ManagementChartsProps) {
  const [threeYearView, setThreeYearView] = useState<'chart' | 'table'>('chart');
  const [branchView, setBranchView] = useState<'chart' | 'table'>('chart');
  const [saleTypeView, setSaleTypeView] = useState<'chart' | 'table'>('chart');

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

  // M3: sale-type Pareto
  const paretoRows = saleTypes
    .filter((s) => s.salesBase > 0)
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
          action={<ChartTableToggle view={threeYearView} onChange={setThreeYearView} />}
        >
          {threeYearView === 'chart' ? (
            <ComboBarLineChart
              data={threeYearData}
              barLabel="Net Sales"
              lineLabel="GM %"
              barFormat={fmtCurrencyCompact}
              height={260}
            />
          ) : (
            <ThreeYearTable rows={threeYear} />
          )}
        </ChartCard>
      )}
      {showBranches && (
        <ChartCard
          title="Branch Comparison"
          subtitle={`${baseYear} vs ${compareYear} sales by branch`}
          action={<ChartTableToggle view={branchView} onChange={setBranchView} />}
        >
          {branchView === 'chart' ? (
            <ComparisonBarChart
              rows={branchRows}
              baseLabel={String(baseYear)}
              compareLabel={String(compareYear)}
              format={fmtCurrency0}
            />
          ) : (
            <BranchSummaryTable rows={branchSummaries} baseYear={baseYear} compareYear={compareYear} qs={qs} />
          )}
        </ChartCard>
      )}
      {showPareto && (
        <ChartCard
          title="Sales Mix by Type"
          subtitle="Concentration — sales sorted by volume"
          action={<ChartTableToggle view={saleTypeView} onChange={setSaleTypeView} />}
        >
          {saleTypeView === 'chart' ? (
            <ParetoChart
              rows={paretoRows}
              format={fmtCurrencyCompact}
              valueLabel={`${baseYear} Sales`}
              height={300}
            />
          ) : (
            <SalesByTypeTable rows={saleTypes} baseYear={baseYear} compareYear={compareYear} />
          )}
        </ChartCard>
      )}
    </div>
  );
}
