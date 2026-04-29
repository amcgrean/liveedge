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
  fmtPct1FromPct,
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
    line: e.sales !== 0 ? (e.gp / e.sales) * 100 : 0,
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

/** Sale-type chart. Bars desc by sales, line is GP%. */
export function SaleTypeParetoChart({
  rows,
  baseYear,
}: {
  rows: SaleTypeRow[];
  baseYear?: number;
}) {
  const data = rows
    .filter((s) => !s.isExcluded && s.salesBase > 0)
    .sort((a, b) => b.salesBase - a.salesBase)
    .map((s) => ({
      label: s.category,
      bar: s.salesBase,
      line: s.salesBase !== 0 ? (s.gpBase / s.salesBase) * 100 : 0,
    }));
  if (data.length === 0) return null;
  return (
    <ChartCard
      title="Sales Mix by Type"
      subtitle="Bars are sales, line is GP%"
    >
      <ComboBarLineChart
        data={data}
        barLabel={baseYear ? `${baseYear} Sales` : 'Sales'}
        lineLabel="GM %"
        barFormat={fmtCurrencyCompact}
        lineFormat={fmtPct1FromPct}
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

/** Branch contribution — bars by sales descending, line is GP%. */
export function BranchContributionPareto({
  rows,
}: {
  rows: { branchId: string; salesBase: number; gpBase: number }[];
}) {
  const data = rows
    .filter((b) => b.salesBase > 0)
    .sort((a, b) => b.salesBase - a.salesBase)
    .map((b) => ({
      label: BRANCH_LABELS[b.branchId] ?? b.branchId,
      bar: b.salesBase,
      line: b.salesBase !== 0 ? (b.gpBase / b.salesBase) * 100 : 0,
    }));
  if (data.length === 0) return null;
  return (
    <ChartCard
      title="Branch Contribution"
      subtitle="Sales by branch with GP% line"
    >
      <ComboBarLineChart
        data={data}
        barLabel="Sales"
        lineLabel="GM %"
        barFormat={fmtCurrencyCompact}
        lineFormat={fmtPct1FromPct}
        height={260}
      />
    </ChartCard>
  );
}

/** Days-to-pay bullet for the customer scorecard. */
export function DaysToPayCard({
  daysToPay,
}: {
  daysToPay: DaysToPayData;
  /** customerAvg accepted for forward-compat; CustomerAvg doesn't include DTP today. */
  customerAvg?: CustomerAvg | null;
}) {
  return (
    <ChartCard
      title="Days to Pay"
      subtitle="Lower is better — green when at-or-below prior year, red above"
    >
      <DaysToPayBullet
        value={daysToPay.base}
        compareValue={daysToPay.compare}
        threshold={daysToPay.compare}
      />
    </ChartCard>
  );
}
