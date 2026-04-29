import type { ColumnDef } from './types';

/**
 * Pure (column, row) → string serialisation used by Copy and CSV.
 * Falls back to String(accessor) when a column does not provide its own
 * exportFormat.
 */
function valueFor<Row>(col: ColumnDef<Row>, row: Row): string {
  const raw = col.accessor(row);
  if (col.exportFormat) return col.exportFormat(raw);
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

function escapeForCsv(s: string): string {
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function escapeForTsv(s: string): string {
  // TSV needs quoting only when the cell already contains a tab or newline.
  return s.includes('\t') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function rowsToTsv<Row>(rows: Row[], columns: ColumnDef<Row>[]): string {
  if (rows.length === 0) return columns.map((c) => escapeForTsv(c.header)).join('\t');
  const head = columns.map((c) => escapeForTsv(c.header)).join('\t');
  const body = rows.map((r) =>
    columns.map((c) => escapeForTsv(valueFor(c, r))).join('\t'),
  );
  return [head, ...body].join('\n');
}

export function rowsToCsv<Row>(rows: Row[], columns: ColumnDef<Row>[]): string {
  if (rows.length === 0) return columns.map((c) => escapeForCsv(c.header)).join(',');
  const head = columns.map((c) => escapeForCsv(c.header)).join(',');
  const body = rows.map((r) =>
    columns.map((c) => escapeForCsv(valueFor(c, r))).join(','),
  );
  return [head, ...body].join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Flattens parent rows + their fetched children into a single TSV with both
 * column sets joined side-by-side. Child rows that share a parent repeat the
 * parent columns so the output pastes cleanly into Excel.
 */
export function flattenForCopy<Parent, Child>(
  parents: Parent[],
  parentColumns: ColumnDef<Parent>[],
  childrenByParent: Map<Parent, Child[]>,
  childColumns: ColumnDef<Child>[],
): string {
  const headers = [
    ...parentColumns.map((c) => escapeForTsv(c.header)),
    ...childColumns.map((c) => escapeForTsv(c.header)),
  ].join('\t');

  const lines: string[] = [headers];
  for (const parent of parents) {
    const parentCells = parentColumns.map((c) => escapeForTsv(valueFor(c, parent)));
    const children = childrenByParent.get(parent) ?? [];
    if (children.length === 0) {
      lines.push([...parentCells, ...childColumns.map(() => '')].join('\t'));
      continue;
    }
    for (const child of children) {
      const childCells = childColumns.map((c) => escapeForTsv(valueFor(c, child)));
      lines.push([...parentCells, ...childCells].join('\t'));
    }
  }
  return lines.join('\n');
}
