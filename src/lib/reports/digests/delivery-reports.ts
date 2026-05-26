import { fetchDeliveryReport } from '../../ops/delivery-reporting-query';
import {
  startReportPdf, drawKpis, drawSectionTitle,
  drawDailyBarChart, drawTable, finalizeReportPdf,
} from '../pdf';
import { buildReportExcel, type SheetSpec } from '../excel';
import type { DeliveryReportsParams } from '../registry';

export interface DigestRenderInput {
  params:      DeliveryReportsParams;
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

function windowDays(w: '7d' | '30d' | '90d'): number {
  return w === '7d' ? 7 : w === '90d' ? 90 : 30;
}

export async function renderDeliveryReportsDigest(input: DigestRenderInput): Promise<DigestRenderOutput> {
  const data = await fetchDeliveryReport({
    windowParam:    input.params.window,
    saleTypeParam:  input.params.sale_type ?? 'all',
    branchParam:    input.params.branch ?? '',
    detailLimit:    250,
  });

  const totalDeliveries = data.by_date.reduce((m, d) => m + d.count, 0);
  const activeDays = data.by_date.length || 1;
  const avgPerDay = totalDeliveries / activeDays;
  const peak = data.by_date.reduce<{ date: string; count: number } | null>(
    (b, d) => (b === null || d.count > b.count ? { date: d.date, count: d.count } : b),
    null,
  );

  const days = windowDays(input.params.window);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const rangeLabel = `${since} → ${today}`;
  const branchLabel = input.params.branch
    ? `${BRANCH_LABEL[input.params.branch] ?? input.params.branch}`
    : 'All branches';
  const saleTypeLabel = input.params.sale_type === 'all' ? 'All sale types' : input.params.sale_type;
  const subtitle = `${branchLabel} · ${saleTypeLabel} · ${input.params.window}`;

  // Per-branch breakdown: aggregate by_date_branch into per-branch totals
  type BranchStat = { branch: string; total: number; days: number; avg: number; high: number };
  const perBranchMap = new Map<string, { total: number; counts: number[]; high: number }>();
  for (const cell of data.by_date_branch) {
    const cur = perBranchMap.get(cell.system_id) ?? { total: 0, counts: [], high: 0 };
    cur.total += cell.count;
    cur.counts.push(cell.count);
    if (cell.count > cur.high) cur.high = cell.count;
    perBranchMap.set(cell.system_id, cur);
  }
  const perBranch: BranchStat[] = Array.from(perBranchMap.entries()).map(([branch, s]) => ({
    branch,
    total: s.total,
    days:  s.counts.length,
    avg:   s.counts.length === 0 ? 0 : s.total / s.counts.length,
    high:  s.high,
  })).sort((a, b) => b.total - a.total);

  const highlights = [
    { label: 'Deliveries',  value: totalDeliveries.toLocaleString() },
    { label: 'Avg/day',     value: avgPerDay.toFixed(1) },
    { label: 'Peak day',    value: peak ? `${peak.count} on ${peak.date}` : '—' },
    { label: 'Active days', value: String(activeDays) },
  ];

  const isEmpty = totalDeliveries === 0;

  if (input.format === 'pdf') {
    const { doc, nextY } = startReportPdf({
      title: 'Delivery Reports',
      subtitle,
      rangeLabel,
    });
    let y = drawKpis(doc, highlights, nextY);

    y = drawSectionTitle(doc, 'Deliveries per day', y);
    y = drawDailyBarChart(
      doc,
      data.by_date.map((d) => ({ label: d.date.slice(5), value: d.count })),
      y,
    );

    y = drawSectionTitle(doc, 'By branch', y);
    y = drawTable(doc, {
      head: ['Branch', 'Total', 'Active days', 'Avg/day', 'Peak day'],
      body: perBranch.map((b) => [
        `${b.branch} · ${BRANCH_LABEL[b.branch] ?? ''}`.trim(),
        b.total.toLocaleString(),
        String(b.days),
        b.avg.toFixed(1),
        String(b.high),
      ]),
      startY: y,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });

    y = drawSectionTitle(doc, 'By sale type', y);
    y = drawTable(doc, {
      head: ['Sale Type', 'Deliveries', 'Share'],
      body: data.by_sale_type.slice(0, 12).map((s) => [
        s.sale_type,
        s.count.toLocaleString(),
        totalDeliveries > 0 ? `${((s.count / totalDeliveries) * 100).toFixed(1)}%` : '0%',
      ]),
      startY: y,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });

    y = drawSectionTitle(doc, 'By ship via', y);
    y = drawTable(doc, {
      head: ['Ship Via', 'Deliveries'],
      body: data.by_ship_via.slice(0, 12).map((s) => [s.ship_via, s.count.toLocaleString()]),
      startY: y,
      columnStyles: { 1: { halign: 'right' } },
    });

    return {
      buffer: finalizeReportPdf(doc),
      filename: `delivery-reports-${input.params.window}-${input.generatedAt.toISOString().slice(0, 10)}.pdf`,
      mimeType: 'application/pdf',
      highlights,
      rangeLabel,
      isEmpty,
    };
  }

  // Excel path
  const sheets: SheetSpec[] = [
    {
      name: 'Daily Deliveries',
      columns: [
        { header: 'Date',        key: 'date',  width: 14 },
        { header: 'Deliveries',  key: 'count', width: 14, numFmt: '#,##0' },
      ],
      rows: data.by_date.map((d) => ({ date: d.date, count: d.count })),
    },
    {
      name: 'By Branch',
      columns: [
        { header: 'Branch',      key: 'branch', width: 26 },
        { header: 'Total',       key: 'total',  width: 12, numFmt: '#,##0' },
        { header: 'Active Days', key: 'days',   width: 14 },
        { header: 'Avg/Day',     key: 'avg',    width: 12, numFmt: '0.0' },
        { header: 'Peak Day',    key: 'high',   width: 12, numFmt: '#,##0' },
      ],
      rows: perBranch.map((b) => ({
        branch: `${b.branch} · ${BRANCH_LABEL[b.branch] ?? ''}`.trim(),
        total: b.total, days: b.days, avg: Number(b.avg.toFixed(2)), high: b.high,
      })),
    },
    {
      name: 'By Sale Type',
      columns: [
        { header: 'Sale Type',  key: 'sale_type', width: 24 },
        { header: 'Deliveries', key: 'count',     width: 14, numFmt: '#,##0' },
      ],
      rows: data.by_sale_type.map((r) => ({ sale_type: r.sale_type, count: r.count })),
    },
    {
      name: 'By Ship Via',
      columns: [
        { header: 'Ship Via',   key: 'ship_via', width: 24 },
        { header: 'Deliveries', key: 'count',    width: 14, numFmt: '#,##0' },
      ],
      rows: data.by_ship_via.map((r) => ({ ship_via: r.ship_via, count: r.count })),
    },
    {
      name: 'Detail',
      columns: [
        { header: 'Ship Date', key: 'ship_date', width: 14 },
        { header: 'Branch',    key: 'system_id', width: 10 },
        { header: 'SO Number', key: 'so_id',     width: 14 },
        { header: 'Sale Type', key: 'sale_type', width: 18 },
        { header: 'Ship Via',  key: 'ship_via',  width: 18 },
        { header: 'Lines',     key: 'line_count', width: 8, numFmt: '#,##0' },
      ],
      rows: data.detail.map((r) => ({
        ship_date: r.ship_date,
        system_id: r.system_id,
        so_id: r.so_id,
        sale_type: r.sale_type ?? '',
        ship_via: r.ship_via ?? '',
        line_count: r.line_count,
      })),
    },
  ];

  const buffer = await buildReportExcel({
    reportLabel:   'Delivery Reports',
    paramsSummary: subtitle,
    rangeLabel,
    generatedAt:   input.generatedAt,
    kpis:          highlights,
    sheets,
  });

  return {
    buffer,
    filename: `delivery-reports-${input.params.window}-${input.generatedAt.toISOString().slice(0, 10)}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    highlights,
    rangeLabel,
    isEmpty,
  };
}
