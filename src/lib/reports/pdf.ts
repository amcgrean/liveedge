// PDF helpers built on jspdf + jspdf-autotable. Each digest module composes
// these primitives — header, KPI strip, table, simple bar chart — to produce
// an A4 portrait report suitable for printing or sharing.

import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';

const BEISSER_GREEN: [number, number, number] = [0, 104, 52];
const BEISSER_GOLD:  [number, number, number] = [158, 134, 53];
const SLATE_900:     [number, number, number] = [15, 23, 42];
const SLATE_500:     [number, number, number] = [100, 116, 139];
const SLATE_300:     [number, number, number] = [203, 213, 225];

export interface KpiTile {
  label: string;
  value: string;
  sub?:  string;
}

/**
 * Build a fresh A4 portrait jsPDF doc with the standard Beisser header.
 * Returns the doc and the y-cursor positioned below the header.
 */
export function startReportPdf(args: {
  title:       string;
  subtitle?:   string;
  rangeLabel:  string;
}): { doc: jsPDF; nextY: number } {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Green banner
  doc.setFillColor(...BEISSER_GREEN);
  doc.rect(0, 0, pageWidth, 56, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BEISSER LIVEEDGE', 32, 22);

  doc.setFontSize(16);
  doc.text(args.title, 32, 40);

  if (args.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(args.subtitle, pageWidth - 32, 22, { align: 'right' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(args.rangeLabel, pageWidth - 32, 40, { align: 'right' });

  // Reset cursor and color for content
  doc.setTextColor(...SLATE_900);
  return { doc, nextY: 80 };
}

/**
 * Draw a row of KPI tiles. Handles wrapping into a second row if there
 * are more than 4 tiles. Returns updated y-cursor.
 */
export function drawKpis(doc: jsPDF, kpis: KpiTile[], y: number): number {
  if (kpis.length === 0) return y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 32;
  const gutter = 8;
  const perRow = Math.min(4, Math.max(2, kpis.length));
  const tileWidth = (pageWidth - 2 * marginX - gutter * (perRow - 1)) / perRow;
  const tileHeight = 56;

  let cursorY = y;
  let col = 0;
  for (const k of kpis) {
    const x = marginX + col * (tileWidth + gutter);
    doc.setDrawColor(...SLATE_300);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cursorY, tileWidth, tileHeight, 4, 4, 'FD');

    doc.setTextColor(...SLATE_500);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(k.label.toUpperCase(), x + 10, cursorY + 14);

    doc.setTextColor(...SLATE_900);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(k.value, x + 10, cursorY + 34);

    if (k.sub) {
      doc.setTextColor(...SLATE_500);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(k.sub, x + 10, cursorY + 48);
    }

    col++;
    if (col >= perRow) {
      col = 0;
      cursorY += tileHeight + gutter;
    }
  }
  if (col > 0) cursorY += tileHeight + gutter;
  return cursorY + 6;
}

/**
 * Section heading.
 */
export function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setTextColor(...SLATE_500);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(title.toUpperCase(), 32, y);
  // Underline
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...SLATE_300);
  doc.line(32, y + 4, pageWidth - 32, y + 4);
  return y + 14;
}

/**
 * Simple bar chart for a per-day series. Renders bars + axis labels.
 * Returns updated y-cursor.
 */
export function drawDailyBarChart(
  doc: jsPDF,
  series: Array<{ label: string; value: number }>,
  y: number,
  height = 110,
): number {
  if (series.length === 0) return y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 32;
  const chartWidth = pageWidth - 2 * marginX;
  const maxVal = Math.max(...series.map((s) => s.value), 1);
  const barGap = 1.5;
  const barWidth = Math.max(2, (chartWidth - barGap * (series.length - 1)) / series.length);

  // Frame
  doc.setDrawColor(...SLATE_300);
  doc.rect(marginX, y, chartWidth, height);

  // Bars
  doc.setFillColor(...BEISSER_GREEN);
  for (let i = 0; i < series.length; i++) {
    const barHeight = (series[i].value / maxVal) * (height - 4);
    const x = marginX + i * (barWidth + barGap);
    const top = y + height - barHeight;
    doc.rect(x, top, barWidth, barHeight, 'F');
  }

  // Y-axis max label
  doc.setTextColor(...SLATE_500);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(String(maxVal), marginX + 2, y + 9);
  doc.text('0', marginX + 2, y + height - 2);

  // First/last x-axis labels
  if (series.length > 0) {
    doc.text(series[0].label, marginX, y + height + 10);
    if (series.length > 1) {
      doc.text(series[series.length - 1].label, marginX + chartWidth, y + height + 10, { align: 'right' });
    }
  }

  return y + height + 18;
}

/**
 * Render a simple data table. Wraps jspdf-autotable with Beisser styling.
 * Returns updated y-cursor.
 */
export function drawTable(
  doc: jsPDF,
  args: {
    head: string[];
    body: (string | number)[][];
    startY: number;
    columnStyles?: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number }>;
  },
): number {
  autoTable(doc, {
    head: [args.head],
    body: args.body as RowInput[],
    startY: args.startY,
    margin: { left: 32, right: 32 },
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: SLATE_300,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: BEISSER_GREEN,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: args.columnStyles,
  });
  // jspdf-autotable mutates doc.lastAutoTable; cast to access finalY.
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (last?.finalY ?? args.startY) + 12;
}

/**
 * Render the doc footer (page numbers + footer line) on every page.
 * Call once at the end.
 */
export function finalizeReportPdf(doc: jsPDF): Buffer {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setTextColor(...SLATE_500);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 32, pageHeight - 20, { align: 'right' });
    doc.text('Beisser Lumber Co. · LiveEdge', 32, pageHeight - 20);
  }
  // jsPDF returns ArrayBuffer; convert to Node Buffer for transport.
  return Buffer.from(doc.output('arraybuffer'));
}

/** Available for color accents in digests (e.g. gold reference lines). */
export const PDF_COLORS = {
  GREEN: BEISSER_GREEN,
  GOLD:  BEISSER_GOLD,
};
