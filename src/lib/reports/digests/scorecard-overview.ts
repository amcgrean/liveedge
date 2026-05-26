// Scorecard Overview digest — emails the company-wide 3-year sales/margin,
// KPI tiles, branch contribution, and branch breakdown. Skips product-mix
// drill tables (interactive-only, per the plan).

import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchBranchSummaries,
} from '../../scorecard/queries';
import type { AggregateParams, KpiComparison } from '../../scorecard/types';
import {
  startReportPdf, drawKpis, drawSectionTitle,
  drawTable, finalizeReportPdf,
} from '../pdf';
import { buildReportExcel, type SheetSpec } from '../excel';
import type { ScorecardOverviewParams } from '../registry';

export interface DigestRenderInput {
  params:      ScorecardOverviewParams;
  format:      'pdf' | 'excel';
  generatedAt: Date;
}

export interface DigestRenderOutput {
  buffer:     Buffer;
  filename:   string;
  mimeType:   string;
  highlights: Array<{ label: string; value: string }>;
  rangeLabel: string;
  isEmpty:    boolean;
}

const BRANCH_LABEL: Record<string, string> = {
  '10FD': 'Fort Dodge', '20GR': 'Grimes', '25BW': 'Birchwood', '40CV': 'Coralville',
};

function fmtCurrency(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function pctDeltaText(current: number | null, prev: number | null): string {
  if (current === null || prev === null || prev === 0) return '';
  const delta = ((current - prev) / Math.abs(prev)) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}% YoY`;
}

export async function renderScorecardOverviewDigest(input: DigestRenderInput): Promise<DigestRenderOutput> {
  // Resolve year fields lazily so subscribers stay evergreen.
  const now = input.generatedAt;
  const baseYear    = input.params.baseYear    ?? now.getFullYear();
  const compareYear = input.params.compareYear ?? baseYear - 1;
  const cutoffDate  = now.toISOString().slice(0, 10);

  const aggParams: AggregateParams = {
    branchIds:   input.params.branchIds ?? [],
    baseYear,
    compareYear,
    period:      input.params.period,
    cutoffDate,
  };

  const [kpisRes, threeYearRes, branchSummariesRes] = await Promise.allSettled([
    fetchAggregateKpis(aggParams, 'All Branches'),
    fetchAggregateThreeYear(aggParams),
    fetchBranchSummaries(baseYear, compareYear, cutoffDate, input.params.period),
  ]);

  const emptyKpis: KpiComparison = {
    base: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
      grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
    compare: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
      grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
    branchIds: [], shipToCount: 0, customerName: 'All Branches',
  };

  const kpis = kpisRes.status === 'fulfilled' ? kpisRes.value : emptyKpis;
  const threeYear = threeYearRes.status === 'fulfilled' ? threeYearRes.value : [];
  const branchSummaries = branchSummariesRes.status === 'fulfilled' ? branchSummariesRes.value : [];

  const gmPctBase    = kpis.base.sales && kpis.base.gp !== null
    ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null
    ? kpis.compare.gp / kpis.compare.sales : null;
  const nsPctBase    = kpis.base.sales && kpis.base.nsSales !== null
    ? kpis.base.nsSales / kpis.base.sales : null;

  const branchScope = input.params.branchIds.length === 0
    ? 'All Branches'
    : input.params.branchIds.map((b) => BRANCH_LABEL[b] ?? b).join(', ');
  const periodLabel = input.params.period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';
  const rangeLabel = `${baseYear} vs ${compareYear} · ${periodLabel}`;
  const subtitle = branchScope;

  const highlights = [
    { label: 'Sales',         value: fmtCurrency(kpis.base.sales) },
    { label: 'Gross profit',  value: fmtCurrency(kpis.base.gp) },
    { label: 'Gross margin',  value: fmtPct(gmPctBase) },
    { label: 'Non-stock %',   value: fmtPct(nsPctBase) },
  ];

  const isEmpty = (kpis.base.sales ?? 0) === 0 && threeYear.length === 0;

  if (input.format === 'pdf') {
    const { doc, nextY } = startReportPdf({
      title: 'Scorecard Overview',
      subtitle,
      rangeLabel,
    });

    let y = drawKpis(doc, [
      { label: 'Sales',        value: fmtCurrency(kpis.base.sales), sub: pctDeltaText(kpis.base.sales, kpis.compare.sales) },
      { label: 'Gross profit', value: fmtCurrency(kpis.base.gp),    sub: pctDeltaText(kpis.base.gp,    kpis.compare.gp) },
      { label: 'GM %',         value: fmtPct(gmPctBase),            sub: gmPctCompare !== null ? `vs ${fmtPct(gmPctCompare)} prior` : '' },
      { label: 'Non-stock %',  value: fmtPct(nsPctBase) },
    ], nextY);

    y = drawSectionTitle(doc, '3-Year Comparison', y);
    y = drawTable(doc, {
      head: ['Year', 'Sales', 'Gross Profit', 'GM %'],
      body: threeYear.map((r) => {
        const gm = r.sales > 0 ? r.gp / r.sales : 0;
        return [
          String(r.year),
          fmtCurrency(r.sales),
          fmtCurrency(r.gp),
          `${(gm * 100).toFixed(1)}%`,
        ];
      }),
      startY: y,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    const totalBranchSales = branchSummaries.reduce((m, r) => m + (r.salesBase ?? 0), 0) || 1;
    y = drawSectionTitle(doc, 'By branch', y);
    y = drawTable(doc, {
      head: ['Branch', 'Sales', 'Share', 'GP', 'YoY'],
      body: branchSummaries
        .slice()
        .sort((a, b) => (b.salesBase ?? 0) - (a.salesBase ?? 0))
        .map((b) => {
          const share = totalBranchSales > 0 ? (b.salesBase ?? 0) / totalBranchSales : 0;
          return [
            `${b.branchId} · ${BRANCH_LABEL[b.branchId] ?? ''}`.trim(),
            fmtCurrency(b.salesBase),
            `${(share * 100).toFixed(1)}%`,
            fmtCurrency(b.gpBase),
            pctDeltaText(b.salesBase, b.salesCompare) || '—',
          ];
        }),
      startY: y,
      columnStyles: {
        1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      },
    });

    return {
      buffer: finalizeReportPdf(doc),
      filename: `scorecard-overview-${baseYear}-${input.generatedAt.toISOString().slice(0, 10)}.pdf`,
      mimeType: 'application/pdf',
      highlights,
      rangeLabel,
      isEmpty,
    };
  }

  // Excel
  const sheets: SheetSpec[] = [
    {
      name: '3-Year Comparison',
      columns: [
        { header: 'Year',         key: 'year',  width: 10 },
        { header: 'Sales',        key: 'sales', width: 16, numFmt: '$#,##0' },
        { header: 'Gross Profit', key: 'gp',    width: 16, numFmt: '$#,##0' },
        { header: 'GM %',         key: 'gm',    width: 10, numFmt: '0.0%' },
      ],
      rows: threeYear.map((r) => ({
        year:  r.year,
        sales: Math.round(r.sales),
        gp:    Math.round(r.gp),
        gm:    r.sales > 0 ? r.gp / r.sales : 0,
      })),
    },
    {
      name: 'By Branch',
      columns: [
        { header: 'Branch',         key: 'branch',        width: 24 },
        { header: 'Sales (base)',   key: 'salesBase',     width: 16, numFmt: '$#,##0' },
        { header: 'Sales (compare)',key: 'salesCompare',  width: 16, numFmt: '$#,##0' },
        { header: 'GP (base)',      key: 'gpBase',        width: 16, numFmt: '$#,##0' },
        { header: 'GP (compare)',   key: 'gpCompare',     width: 16, numFmt: '$#,##0' },
        { header: 'Customer count', key: 'customerCount', width: 14 },
      ],
      rows: branchSummaries.map((b) => ({
        branch:        `${b.branchId} · ${BRANCH_LABEL[b.branchId] ?? ''}`.trim(),
        salesBase:     Math.round(b.salesBase ?? 0),
        salesCompare:  Math.round(b.salesCompare ?? 0),
        gpBase:        Math.round(b.gpBase ?? 0),
        gpCompare:     Math.round(b.gpCompare ?? 0),
        customerCount: b.customerCount ?? 0,
      })),
    },
    {
      name: 'KPIs',
      columns: [
        { header: 'Metric',  key: 'metric', width: 22 },
        { header: 'Base',    key: 'base',   width: 16 },
        { header: 'Compare', key: 'comp',   width: 16 },
      ],
      rows: [
        { metric: 'Sales',         base: fmtCurrency(kpis.base.sales), comp: fmtCurrency(kpis.compare.sales) },
        { metric: 'Gross Profit',  base: fmtCurrency(kpis.base.gp),    comp: fmtCurrency(kpis.compare.gp) },
        { metric: 'GM %',          base: fmtPct(gmPctBase),            comp: fmtPct(gmPctCompare) },
        { metric: 'Non-stock %',   base: fmtPct(nsPctBase),            comp: '' },
      ],
    },
  ];

  const buffer = await buildReportExcel({
    reportLabel:   'Scorecard Overview',
    paramsSummary: subtitle,
    rangeLabel,
    generatedAt:   input.generatedAt,
    kpis:          highlights,
    sheets,
  });

  return {
    buffer,
    filename: `scorecard-overview-${baseYear}-${input.generatedAt.toISOString().slice(0, 10)}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    highlights,
    rangeLabel,
    isEmpty,
  };
}
