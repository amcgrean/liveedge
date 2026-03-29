import Papa from 'papaparse';
import type { GroupState, MeasurementState } from '@/hooks/useMeasurementReducer';

interface ExportRow {
  Group: string;
  Category: string;
  Type: string;
  Value: string;
  Unit: string;
  'Target Field': string;
  Page: string;
  Label: string;
  Notes: string;
}

/**
 * Export all measurements as a CSV file.
 * Includes individual measurements and group totals.
 */
export function exportMeasurementsCsv(
  groups: GroupState[],
  measurements: Record<number, MeasurementState[]>,
  sessionName: string
): void {
  const rows: ExportRow[] = [];

  for (const group of groups) {
    // Collect all measurements for this group across all pages
    const groupMeasurements: MeasurementState[] = [];
    for (const pageMeasurements of Object.values(measurements)) {
      for (const m of pageMeasurements) {
        if (m.groupId === group.id) {
          groupMeasurements.push(m);
        }
      }
    }

    if (groupMeasurements.length === 0 && group.runningTotal === 0) continue;

    // Individual measurements
    for (const m of groupMeasurements) {
      rows.push({
        Group: group.name,
        Category: group.category ?? '',
        Type: m.type,
        Value: m.calculatedValue.toFixed(2),
        Unit: m.unit,
        'Target Field': group.targetField ?? '',
        Page: String(m.pageNumber),
        Label: m.label,
        Notes: m.notes,
      });
    }

    // Group total row
    rows.push({
      Group: `${group.name} — TOTAL`,
      Category: group.category ?? '',
      Type: group.type,
      Value: group.runningTotal.toFixed(2),
      Unit: group.unit,
      'Target Field': group.targetField ?? '',
      Page: '',
      Label: '',
      Notes: '',
    });
  }

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sessionName || 'takeoff'}-export.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export group summary only (no individual measurements).
 */
export function exportGroupSummaryCsv(
  groups: GroupState[],
  sessionName: string
): void {
  const rows = groups
    .filter((g) => g.runningTotal > 0)
    .map((g) => ({
      Group: g.name,
      Category: g.category ?? '',
      Type: g.type,
      Total: g.runningTotal.toFixed(2),
      Unit: g.unit,
      'Target Field': g.targetField ?? '',
    }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sessionName || 'takeoff'}-summary.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
