// Excel helpers built on exceljs. Each digest emits a multi-sheet workbook:
// one "Summary" sheet with the cover metadata + KPIs, then one sheet per
// breakdown. Charts are out of scope for v1 — raw tables only.

import ExcelJS from 'exceljs';

const BEISSER_GREEN_HEX = 'FF006834';
const SLATE_900_HEX     = 'FF0F172A';
const SLATE_100_HEX     = 'FFF1F5F9';

export interface SheetSpec {
  name:    string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows:    Record<string, string | number | null>[];
}

export interface WorkbookSpec {
  reportLabel:   string;
  paramsSummary: string;
  rangeLabel:    string;
  generatedAt:   Date;
  kpis?:         Array<{ label: string; value: string | number; sub?: string }>;
  sheets:        SheetSpec[];
}

export async function buildReportExcel(spec: WorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Beisser LiveEdge';
  wb.created = spec.generatedAt;

  // ─── Summary sheet ────────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 28 }, { width: 28 }];

  summary.addRow([spec.reportLabel]);
  summary.getRow(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: SLATE_900_HEX } };
  summary.addRow([spec.rangeLabel]);
  summary.addRow([spec.paramsSummary]);
  summary.addRow([`Generated ${spec.generatedAt.toISOString()}`]);
  summary.addRow([]); // spacer

  if (spec.kpis && spec.kpis.length > 0) {
    const headerRow = summary.addRow(['Metric', 'Value']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BEISSER_GREEN_HEX } };
    });
    for (const k of spec.kpis) {
      const sub = k.sub ? ` (${k.sub})` : '';
      summary.addRow([`${k.label}${sub}`, k.value]);
    }
  }

  // ─── Data sheets ──────────────────────────────────────────────────────────
  for (const s of spec.sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31)); // Excel limits sheet names to 31 chars
    ws.columns = s.columns.map((c) => ({
      header: c.header,
      key:    c.key,
      width:  c.width ?? Math.max(c.header.length + 4, 12),
      style:  c.numFmt ? { numFmt: c.numFmt } : undefined,
    }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BEISSER_GREEN_HEX } };
      cell.alignment = { vertical: 'middle' };
    });
    for (const row of s.rows) {
      ws.addRow(row);
    }
    // Banded rows
    for (let i = 2; i <= ws.rowCount; i++) {
      if (i % 2 === 0) {
        const r = ws.getRow(i);
        r.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_100_HEX } };
        });
      }
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
