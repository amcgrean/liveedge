'use client';

import React from 'react';
import {
  ChartCard,
  ComboBarLineChart,
  ComparisonBarChart,
  ParetoChart,
  ProductTreemap,
  DaysToPayBullet,
  fmtCurrency0,
  fmtCurrencyCompact,
} from '@/components/charts';
import type {
  ThreeYearEntry,
  SaleTypeRow,
  ProductMajorRow,
  ProductScorecardMajorRow,
  CustomerListRow,
  RepListRow,
  DaysToPayData,
  CustomerAvg,
} from '../../../src/lib/scorecard/types';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

/** 3-year sales bars + GM% line. Reused on overview/branch/rep/customer scorecards. */
export function ThreeYearChart({
  entries,
  height = 240,
}: {
  entries: ThreeYearEntry[];
  height?: number;
}) {
  const data = entries.map((e) => ({
    label: e.label,
    bar: e.sales,
    line: e.sales > 0 ? (e.gp / e.sales) * 100 : 0,
  }));
  if (data.length === 0) return null;
  return (
    <ChartCard
      title="3-Year Sales & Margin"
      subtitle="Annual sales bars with GM% line"
    >
      <ComboBarLineChart
        data={data}
        barLabel="Net Sales"
        lineLabel="GM %"
        barFormat={fmtCurrencyCompact}
        height={height}
      />
    </ChartCard>
  );
}

/** Sale-type Pareto. Bars desc, cumulative-% line, 80% reference. */
export function SaleTypeParetoChart({
  rows,
  baseYear,
}: {
  rows: SaleTypeRow[];
  baseYear?: number;
}) {
  const paretoRows = rows
    .filter((s) => !s.isExcluded && s.salesBase > 0)
    .map((s) => ({ label: s.category, value: s.salesBase }));
  if (paretoRows.length === 0) return null;
  return (
    <ChartCard
      title="Sales Mix by Type"
      subtitle="Bars are sales, line is cumulative %"
    >
      <ParetoChart
        rows={paretoRows}
        format={fmtCurrencyCompact}
        valueLabel={baseYear ? `${baseYear} Sales` : 'Sales'}
        height={300}
      />
    </ChartCard>
  );
}

/** Product Mix Treemap from ProductMajorRow[] (customer/branch/overview). */
export function ProductMixTreemap({ rows }: { rows: ProductMajorRow[] }) {
  const treemapRows = rows
    .filter((r) => r.salesBase > 0)
    .map((r) => ({
      label: r.productMajor,
      value: r.salesBase,
      sub: r.salesBase > 0 ? (r.gpBase / r.salesBase) * 100 : 0,
    }));
  if (treemapRows.length === 0) return null;
  return (
    <ChartCard
      title="Product Mix"
      subtitle="Tile size = sales, hover for GM%"
    >
      <ProductTreemap
        rows={treemapRows}
        format={fmtCurrencyCompact}
        formatSub={(n) => `${(typeof n === 'number' ? n : 0).toFixed(1)}% GM`}
        height={320}
      />
    </ChartCard>
  );
}

/** Treemap variant for the standalone Product Groups scorecard. */
export function ProductScorecardTreemap({ rows }: { rows: ProductScorecardMajorRow[] }) {
  const treemapRows = rows
    .filter((r) => r.salesBase > 0)
    .map((r) => ({
      label: r.productMajor,
      value: r.salesBase,
      sub: r.salesBase > 0 ? (r.gpBase / r.salesBase) * 100 : 0,
    }));
  if (treemapRows.length === 0) return null;
  return (
    <ChartCard
      title="Product Mix"
      subtitle="Tile size = sales, hover for GM%"
    >
      <ProductTreemap
        rows={treemapRows}
        format={fmtCurrencyCompact}
        formatSub={(n) => `${(typeof n === 'number' ? n : 0).toFixed(1)}% GM`}
        height={360}
      />
    </ChartCard>
  );
}

/** Pareto of product majors — useful when treemap doesn't show concentration. */
export function ProductScorecardPareto({ rows }: { rows: ProductScorecardMajorRow[] }) {
  const paretoRows = rows
    .filter((r) => r.salesBase > 0)
    .map((r) => ({ label: r.productMajor, value: r.salesBase }));
  if (paretoRows.length === 0) return null;
  return (
    <ChartCard
      title="Product Concentration"
      subtitle="Bars = sales by major group, line = cumulative %"
    >
      <ParetoChart rows={paretoRows} format={fmtCurrencyCompact} valueLabel="Sales" height={320} />
    </ChartCard>
  );
}

/** Top customers Pareto for branch scorecards. */
export function TopCustomersPareto({ rows }: { rows: CustomerListRow[] }) {
  const paretoRows = rows
    .filter((c) => c.salesBase > 0)
    .map((c) => ({ label: c.customerName, value: c.salesBase }));
  if (paretoRows.length === 0) return null;
  return (
    <ChartCard
      title="Top Customers"
      subtitle="Bars are sales, line is cumulative % — exposes 80/20 concentration"
    >
      <ParetoChart rows={paretoRows} format={fmtCurrencyCompact} valueLabel="Sales" height={300} />
    </ChartCard>
  );
}

/** Rep list — assigned-book vs written-up sales side-by-side. */
export function RepComparisonChart({
  rows,
  baseYear,
}: {
  rows: RepListRow[];
  baseYear: number;
}) {
  const comparisonRows = rows
    .filter((r) => r.assignedSalesBase > 0 || r.writtenSalesBase > 0)
    .sort((a, b) => b.assignedSalesBase + b.writtenSalesBase - (a.assignedSalesBase + a.writtenSalesBase))
    .slice(0, 12)
    .map((r) => ({
      id: r.repCode,
      label: r.repCode,
      base: r.assignedSalesBase,
      compare: r.writtenSalesBase,
    }));
  if (comparisonRows.length === 0) return null;
  return (
    <ChartCard
      title="Sales Rep Performance"
      subtitle={`Top 12 reps · ${baseYear} assigned book vs written-up sales`}
    >
      <ComparisonBarChart
        rows={comparisonRows}
        baseLabel="Assigned"
        compareLabel="Written"
        format={fmtCurrency0}
        showDelta={false}
      />
    </ChartCard>
  );
}

/** Branch contribution Pareto (sales) for the Overview page. */
export function BranchContributionPareto({
  rows,
}: {
  rows: { branchId: string; salesBase: number }[];
}) {
  const paretoRows = rows
    .filter((b) => b.salesBase > 0)
    .map((b) => ({
      label: BRANCH_LABELS[b.branchId] ?? b.branchId,
      value: b.salesBase,
    }));
  if (paretoRows.length === 0) return null;
  return (
    <ChartCard
      title="Branch Contribution"
      subtitle="Sales share by branch with cumulative %"
    >
      <ParetoChart rows={paretoRows} format={fmtCurrencyCompact} valueLabel="Sales" height={260} />
    </ChartCard>
  );
}

/** Days-to-pay bullet for the customer scorecard. */
export function DaysToPayCard({
  daysToPay,
  customerAvg,
}: {
  daysToPay: DaysToPayData;
  customerAvg?: CustomerAvg | null;
}) {
  // CustomerAvg doesn't include days-to-pay; the threshold is the customer's prior-period value
  // when it exists, otherwise just the current value. We surface the "compare" side as context.
  const _avg = customerAvg; // reserved — currently no avg field exposed for DTP
  void _avg;
  return (
    <ChartCard
      title="Days to Pay"
      subtitle="Lower is better — green when below prior year, red above"
    >
      <DaysToPayBullet
        value={daysToPay.base}
        compareValue={daysToPay.compare}
        average={daysToPay.compare}
      />
    </ChartCard>
  );
}
