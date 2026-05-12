/**
 * generateSpecSheet.ts
 *
 * Client-side PDF spec sheet generator for legacy bids.
 * Fetches bid data from /api/legacy-bids/[id] and renders a printable PDF
 * using jsPDF — same approach as the takeoff PDF export.
 */

import { jsPDF } from 'jspdf';

interface DynamicValue {
  fieldId: number;
  fieldName: string | null;
  fieldType: string | null;
  category: string | null;
  value: string | null;
}

interface BidData {
  id: number;
  projectName: string;
  planType: string;
  status: string;
  logDate: string;
  dueDate: string | null;
  completionDate: string | null;
  notes: string | null;
  includeFraming: boolean;
  includeSiding: boolean;
  includeShingle: boolean;
  includeDeck: boolean;
  includeTrim: boolean;
  includeWindow: boolean;
  includeDoor: boolean;
  customerName: string | null;
  customerCode: string | null;
  estimatorName: string | null;
  branchId: number | null;
}

const CATEGORY_ORDER = [
  'General',
  'Framing',
  'Siding',
  'Shingles',
  'Deck',
  'Trim',
  'Windows',
  'Doors',
  'Other',
];

const INCLUDE_MAP: Record<string, keyof BidData> = {
  Framing:  'includeFraming',
  Siding:   'includeSiding',
  Shingles: 'includeShingle',
  Deck:     'includeDeck',
  Trim:     'includeTrim',
  Windows:  'includeWindow',
  Doors:    'includeDoor',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatValue(value: string | null, fieldType: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  if (fieldType === 'checkbox') return value === 'true' ? '✓ Yes' : '✗ No';
  if (fieldType === 'date') return formatDate(value);
  return value;
}

export async function generateSpecSheet(bidId: number): Promise<void> {
  // ── Fetch bid data ──────────────────────────────────────────────────────
  const res = await fetch(`/api/legacy-bids/${bidId}`);
  if (!res.ok) throw new Error('Failed to load bid data');
  // The GET /api/legacy-bids/[id] response is flat: bid fields at the top level
  // plus dynamicValues, files, activity, etc. alongside them.
  const data = await res.json() as BidData & {
    dynamicValues: DynamicValue[];
    customerName?: string | null;
    estimatorName?: string | null;
  };

  const bid = data;
  const dynamicValues = data.dynamicValues ?? [];

  // Group dynamic values by category
  const byCategory = new Map<string, DynamicValue[]>();
  for (const v of dynamicValues) {
    if (!v.value && v.value !== '0') continue; // skip blanks
    const cat = v.category ?? 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(v);
  }

  // ── Layout constants ────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const W = 612; // letter width in pt
  const H = 792;
  const MARGIN = 36;
  const CONTENT_W = W - MARGIN * 2;

  // Colors (dark green = #006834, light gray bg)
  const GREEN: [number, number, number]  = [0, 104, 52];
  const DARK: [number, number, number]   = [30, 30, 30];
  const MID: [number, number, number]    = [80, 80, 80];
  const LIGHT: [number, number, number]  = [200, 200, 200];
  const STRIPE: [number, number, number] = [245, 248, 245];
  const WHITE: [number, number, number]  = [255, 255, 255];

  let y = MARGIN;

  // ── Header bar ──────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(MARGIN, y, CONTENT_W, 52, 'F');

  doc.setTextColor(...WHITE);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BEISSER LUMBER CO.', MARGIN + 10, y + 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Estimating Spec Sheet', MARGIN + 10, y + 34);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const typeLabel = bid.planType ?? '';
  doc.text(typeLabel, W - MARGIN - 10 - doc.getTextWidth(typeLabel), y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const statusLabel = bid.status === 'Complete' ? '✓ Complete' : 'In Progress';
  doc.text(statusLabel, W - MARGIN - 10 - doc.getTextWidth(statusLabel), y + 32);

  y += 60;

  // ── Project info block ──────────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(bid.projectName ?? 'Untitled Project', MARGIN, y);
  y += 16;

  // Meta row
  const meta = [
    bid.customerName ? `Customer: ${bid.customerName}` : null,
    bid.estimatorName ? `Estimator: ${bid.estimatorName}` : null,
    bid.dueDate ? `Due: ${formatDate(bid.dueDate)}` : null,
    bid.completionDate ? `Completed: ${formatDate(bid.completionDate)}` : null,
    `Logged: ${formatDate(bid.logDate)}`,
  ].filter(Boolean) as string[];

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  const metaLine = meta.join('   ·   ');
  doc.text(metaLine, MARGIN, y);
  y += 6;

  // Divider
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 12;

  // ── Spec sections ───────────────────────────────────────────────────────
  const COL_W = (CONTENT_W - 8) / 2; // two columns with 8pt gap
  const ROW_H = 15;
  const SECTION_HEADER_H = 20;

  const orderedCategories = CATEGORY_ORDER.filter((cat) => {
    const includeKey = INCLUDE_MAP[cat];
    // Always show General/Other; show spec categories only if included
    if (!includeKey) return byCategory.has(cat);
    return (bid[includeKey] as boolean) && byCategory.has(cat);
  });

  if (orderedCategories.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(...MID);
    doc.text('No dynamic field values recorded for this bid.', MARGIN, y);
    y += 20;
  }

  for (const cat of orderedCategories) {
    const fields = byCategory.get(cat) ?? [];
    if (fields.length === 0) continue;

    // Estimate height needed for this section
    const sectionH = SECTION_HEADER_H + Math.ceil(fields.length / 2) * ROW_H + 10;
    if (y + sectionH > H - MARGIN - 20) {
      doc.addPage();
      y = MARGIN;
    }

    // Section header
    doc.setFillColor(...GREEN);
    doc.rect(MARGIN, y, CONTENT_W, SECTION_HEADER_H, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(cat.toUpperCase(), MARGIN + 8, y + 13);
    y += SECTION_HEADER_H;

    // Fields in two-column layout
    let col = 0;
    let rowStart = y;
    fields.forEach((f, i) => {
      const xOff = col === 0 ? MARGIN : MARGIN + COL_W + 8;
      const isStripe = Math.floor(i / 2) % 2 === 0;

      // Stripe background for even rows
      if (col === 0) {
        doc.setFillColor(...(isStripe ? STRIPE : WHITE));
        doc.rect(MARGIN, rowStart, CONTENT_W, ROW_H, 'F');
      }

      doc.setTextColor(...DARK);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const nameStr = doc.splitTextToSize(f.fieldName ?? '', COL_W * 0.48 - 4)[0] ?? '';
      doc.text(nameStr, xOff + 4, rowStart + ROW_H - 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MID);
      const valStr = doc.splitTextToSize(formatValue(f.value, f.fieldType), COL_W * 0.52 - 4)[0] ?? '';
      doc.text(valStr, xOff + COL_W * 0.48 + 4, rowStart + ROW_H - 4);

      col++;
      if (col >= 2) {
        col = 0;
        rowStart += ROW_H;
      }
    });
    // If odd number of fields, last row still needs to advance
    if (col !== 0) rowStart += ROW_H;

    y = rowStart + 6;
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  if (bid.notes?.trim()) {
    if (y + 60 > H - MARGIN) { doc.addPage(); y = MARGIN; }
    doc.setFillColor(...GREEN);
    doc.rect(MARGIN, y, CONTENT_W, SECTION_HEADER_H, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES', MARGIN + 8, y + 13);
    y += SECTION_HEADER_H;
    doc.setFillColor(...STRIPE);
    doc.rect(MARGIN, y, CONTENT_W, 40, 'F');
    doc.setTextColor(...DARK);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(bid.notes, CONTENT_W - 16);
    doc.text(noteLines, MARGIN + 8, y + 12);
    y += Math.max(40, noteLines.length * 11 + 8);
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(...GREEN);
    doc.rect(MARGIN, H - 24, CONTENT_W, 14, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Beisser Lumber Co. · LiveEdge Estimating', MARGIN + 6, H - 13);
    doc.text(
      `Page ${p} of ${pageCount}`,
      W - MARGIN - doc.getTextWidth(`Page ${p} of ${pageCount}`) - 6,
      H - 13
    );
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const slug = (bid.projectName ?? `bid-${bidId}`)
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  doc.save(`spec-sheet-${slug}.pdf`);
}
