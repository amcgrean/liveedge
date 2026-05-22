// Digest for the sales-reports subscription. Fetches the same payload the
// /sales/reports UI uses, then emits either a PDF or an Excel attachment.

import { fetchSalesReports, type SalesReportsPayload } from '../../sales/reports-query';
import {
  startReportPdf, drawKpis, drawSectionTitle,
  drawDailyBarChart, drawTable, finalizeReportPdf,
  type KpiTile,
} from '../pdf';
import { buildReportExcel, type SheetSpec } from '../excel';
import type { SalesReportsParams } from '../registry';

export interface DigestRenderInput {
  params:        SalesReportsParams;
  format:        'pdf' | 'excel';
  generatedAt:   Date;
}

export interface DigestRenderOutput {
  buffer:        Buffer;
  filename:      string;
  mimeType:      string;
  highlights:    Array<{ label: string; value: string }>;
  rangeLabel:    string;
  isEmpty:       boolean;
}

function pctDelta(current: number, prev: number): string {
  if (prev === 0) return current === 0 ? '0%' : 'N/A';
  const pct = ((current - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function rangeLabelFor(period: number): string {
  const today = new Date();
  const since = new Date(Date.now() - period * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(since)} → ${fmt(today)}`;
}

export async function renderSalesReportsDigest(input: DigestRenderInput): Promise<DigestRenderOutput> {
  const data = await fetchSalesReports({
    period: input.params.period,
    branch: input.params.branch ?? '',
  });

  const total = data.daily_orders.reduce((m, d) => m + d.count, 0);
  const activeDays = data.daily_orders.filter((d) => d.count > 0).length || 1;
  const avgPerDay = total / activeDays;
  const peakDay = data.daily_orders.reduce<{ date: string; count: number } | null>(
    (best, d) => (best === null || d.count > best.count ? { date: d.order_date, count: d.count } : best),
    null,
  );
  const openOrders = data.status_breakdown
    .filter((s) => s.so_status === '' || s.so_status === 'O' || s.so_status === 'B')
    .reduce((m, s) => m + s.cnt, 0);

  const rangeLabel = rangeLabelFor(data.period_days);
  const branchLabel = input.params.branch ? `Branch ${input.params.branch}` : 'All branches';
  const subtitle = `${branchLabel} · ${data.period_days} days`;

  const highlights: Array<{ label: string; value: string }> = [
    { label: 'Total orders', value: total.toLocaleString() },
    { label: 'Avg/day',      value: avgPerDay.toFixed(1) },
    { label: 'Peak day',     value: peakDay ? `${peakDay.count} on ${peakDay.date}` : '—' },
    { label: 'Open orders',  value: openOrders.toLocaleString() },
  ];

  const isEmpty = total === 0;

  if (input.format === 'pdf') {
    const { doc, nextY } = startReportPdf({
      title: 'Sales Reports',
      subtitle,
      rangeLabel,
    });

    const kpis: KpiTile[] = [
      { label: 'Total orders', value: total.toLocaleString(), sub: `vs ${data.prev_total.toLocaleString()} prior yr (${pctDelta(total, data.prev_total)})` },
      { label: 'Avg per day',  value: avgPerDay.toFixed(1) },
      { label: 'Peak day',     value: peakDay ? String(peakDay.count) : '—', sub: peakDay?.date },
      { label: 'Open orders',  value: openOrders.toLocaleString() },
    ];

    let y = drawKpis(doc, kpis, nextY);

    y = drawSectionTitle(doc, 'Order volume by day', y);
    y = drawDailyBarChart(
      doc,
      data.daily_orders.map((d) => ({ label: d.order_date.slice(5), value: d.count })),
      y,
    );

    y = drawSectionTitle(doc, 'By sale type', y);
    y = drawTable(doc, {
      head: ['Sale Type', 'Orders', 'Share'],
      body: data.by_sale_type.slice(0, 12).map((s) => [
        s.sale_type,
        s.count.toLocaleString(),
        total > 0 ? `${((s.count / total) * 100).toFixed(1)}%` : '0%',
      ]),
      startY: y,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });

    y = drawSectionTitle(doc, 'Top customers', y);
    y = drawTable(doc, {
      head: ['#', 'Customer', 'Orders'],
      body: data.top_customers.map((c, i) => [
        String(i + 1),
        c.cust_name ?? '(unknown)',
        c.order_count.toLocaleString(),
      ]),
      startY: y,
      columnStyles: { 0: { halign: 'right', cellWidth: 28 }, 2: { halign: 'right' } },
    });

    y = drawSectionTitle(doc, 'Status breakdown', y);
    y = drawTable(doc, {
      head: ['Status', 'Orders'],
      body: data.status_breakdown.map((s) => [s.so_status || '(blank)', s.cnt.toLocaleString()]),
      startY: y,
      columnStyles: { 1: { halign: 'right' } },
    });

    return {
      buffer:   finalizeReportPdf(doc),
      filename: `sales-reports-${data.period_days}d-${input.generatedAt.toISOString().slice(0, 10)}.pdf`,
      mimeType: 'application/pdf',
      highlights,
      rangeLabel,
      isEmpty,
    };
  }

  // Excel path
  const sheets: SheetSpec[] = [
    {
      name: 'Daily Orders',
      columns: [
        { header: 'Date',   key: 'date',  width: 14 },
        { header: 'Orders', key: 'count', width: 12, numFmt: '#,##0' },
      ],
      rows: data.daily_orders.map((d) => ({ date: d.order_date, count: d.count })),
    },
    {
      name: 'By Sale Type',
      columns: [
        { header: 'Sale Type', key: 'sale_type', width: 24 },
        { header: 'Orders',    key: 'count',     width: 12, numFmt: '#,##0' },
      ],
      rows: data.by_sale_type.map((r) => ({ sale_type: r.sale_type, count: r.count })),
    },
    {
      name: 'By Ship Via',
      columns: [
        { header: 'Ship Via', key: 'ship_via', width: 24 },
        { header: 'Orders',   key: 'count',    width: 12, numFmt: '#,##0' },
      ],
      rows: data.by_ship_via.map((r) => ({ ship_via: r.ship_via, count: r.count })),
    },
    {
      name: 'Top Customers',
      columns: [
        { header: 'Customer', key: 'cust_name',  width: 40 },
        { header: 'Orders',   key: 'order_count', width: 12, numFmt: '#,##0' },
      ],
      rows: data.top_customers.map((r) => ({ cust_name: r.cust_name ?? '(unknown)', order_count: r.order_count })),
    },
    {
      name: 'Status Breakdown',
      columns: [
        { header: 'Status', key: 'so_status', width: 16 },
        { header: 'Orders', key: 'cnt',       width: 12, numFmt: '#,##0' },
      ],
      rows: data.status_breakdown.map((r) => ({ so_status: r.so_status || '(blank)', cnt: r.cnt })),
    },
  ];

  const buffer = await buildReportExcel({
    reportLabel:   'Sales Reports',
    paramsSummary: subtitle,
    rangeLabel,
    generatedAt:   input.generatedAt,
    kpis:          highlights,
    sheets,
  });

  return {
    buffer,
    filename: `sales-reports-${data.period_days}d-${input.generatedAt.toISOString().slice(0, 10)}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    highlights,
    rangeLabel,
    isEmpty,
  };
}

// Re-export for type checking from generic dispatch.
export type { SalesReportsPayload };
