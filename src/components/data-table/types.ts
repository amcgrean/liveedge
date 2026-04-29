// Shared types for the data-table family of components.
//
// Two consumption modes are supported:
//
//   1. Composable building blocks — custom tables import <SortableHeader>,
//      <TableToolbar>, useTableSort, useTableExport and keep their bespoke
//      row rendering (used on scorecard / management).
//
//   2. Generic <DataTable> — opinionated component that renders a plain
//      sortable, optionally paginated, optionally drill-expandable table for
//      operational list pages (sales transactions, admin lists, etc.).
//
// Either way, ColumnDef is the contract that drives sort + export.

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface ColumnDef<Row> {
  /** Stable identifier; matches sort key + URL param value. */
  key: string;

  /** Header label rendered in the <th>. */
  header: string;

  /** Returns the raw value used for sorting AND export (Copy / CSV). */
  accessor: (row: Row) => string | number | null | undefined;

  /** Optional custom React rendering. Falls back to String(accessor()). */
  cell?: (row: Row) => React.ReactNode;

  align?: 'left' | 'right' | 'center';

  /** Default true. Set false to disable header click-to-sort. */
  sortable?: boolean;

  /** Override how the value is serialised for clipboard / CSV. */
  exportFormat?: (value: ReturnType<ColumnDef<Row>['accessor']>) => string;

  className?: string;

  /** Tailwind classes applied to the <th> only. */
  headerClassName?: string;
}

/**
 * Single-level drill-down configuration. Per the agreed scope, copy-with-drill
 * only ever flattens ONE level deep (e.g. major → minor). Lower levels stay
 * visible/expandable in the UI but never participate in copy.
 */
export interface DrillConfig<Row, Child> {
  /** Used in the Copy menu, e.g. "Copy with Minors". */
  label: string;

  /** Lazily fetch the child rows for a parent. */
  fetchChildren: (row: Row, signal: AbortSignal) => Promise<Child[]>;

  /** Columns used for the flattened export of children. */
  columns: ColumnDef<Child>[];

  rowKey: (child: Child) => string;
}

/**
 * State the parent owns for the generic <DataTable>. For full-list mode (the
 * scorecard / management default) pass `pageSize: 0` and ignore page.
 */
export interface TableQueryState {
  page: number;
  pageSize: number;
  sort: SortState | null;
  search: string;
}
