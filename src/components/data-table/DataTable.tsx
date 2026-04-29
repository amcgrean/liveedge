'use client';

import React from 'react';
import SortableHeader from './SortableHeader';
import TableToolbar from './TableToolbar';
import { useTableSort } from './useTableSort';
import type { ColumnDef, DrillConfig, SortState } from './types';

interface Props<Row> {
  rows: Row[];
  columns: ColumnDef<Row>[];
  rowKey: (r: Row) => string;

  /** Forwarded to <TableToolbar>. Set to null to render no toolbar. */
  filename?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drill?: DrillConfig<Row, any>;
  hideToolbar?: boolean;
  /** Extra content placed inline with the Copy / CSV buttons. */
  toolbarLeft?: React.ReactNode;

  /** Optional totals / summary row, rendered inside <tbody> after the data. */
  footer?: React.ReactNode;

  /** Rendered in place of the data rows when `rows.length === 0`. */
  empty?: React.ReactNode;

  /** Per-row className. Useful for highlight states (e.g. excluded sale types). */
  rowClassName?: (r: Row) => string;

  /** Initial sort state (default: no sort, original row order). */
  initialSort?: SortState | null;

  className?: string;
  tableClassName?: string;
  /** Wrap the table in `overflow-x-auto`. Default true. */
  scrollWrapper?: boolean;
}

/**
 * Generic full-list table for scorecard / management / simple list pages.
 *
 * - Sortable headers wired to `useTableSort` (none → asc → desc → none).
 * - Toolbar with Copy + CSV + optional drill-down chevron.
 * - Custom cell rendering via `column.cell`; falls back to String(accessor()).
 * - Footer slot for totals rows (unaffected by sort — totals are sums).
 *
 * For paginated / server-driven tables, use the building blocks
 * (`SortableHeader`, `TableToolbar`) directly with your own state.
 */
export default function DataTable<Row>({
  rows,
  columns,
  rowKey,
  filename = 'export',
  drill,
  hideToolbar = false,
  toolbarLeft,
  footer,
  empty,
  rowClassName,
  initialSort = null,
  className = '',
  tableClassName = 'w-full text-sm print:text-xs',
  scrollWrapper = true,
}: Props<Row>) {
  const { sortedRows, sort, toggle } = useTableSort({ rows, columns, initialSort });

  const tableEl = (
    <table className={tableClassName}>
      <thead>
        <tr className="border-b border-slate-700 group">
          {columns.map((c) => (
            <SortableHeader
              key={c.key}
              columnKey={c.key}
              label={c.header}
              sort={sort}
              onToggle={toggle}
              align={c.align ?? 'left'}
              sortable={c.sortable !== false}
              className={
                c.headerClassName ??
                `pb-2 font-${c.align === 'right' ? 'semibold text-slate-300' : 'medium text-slate-400'} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`
              }
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.length === 0 && empty && (
          <tr>
            <td colSpan={columns.length} className="py-12 text-center text-slate-500">
              {empty}
            </td>
          </tr>
        )}
        {sortedRows.map((r) => {
          const extraCls = rowClassName?.(r) ?? '';
          return (
            <tr key={rowKey(r)} className={`border-b border-slate-800 hover:bg-slate-800/40 transition ${extraCls}`}>
              {columns.map((c) => {
                const align = c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
                const cellContent = c.cell ? c.cell(r) : String(c.accessor(r) ?? '');
                return (
                  <td
                    key={c.key}
                    className={c.className ?? `py-2 ${align} ${c.align === 'right' ? 'font-mono tabular-nums' : ''}`}
                  >
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          );
        })}
        {footer}
      </tbody>
    </table>
  );

  return (
    <div className={`space-y-2 ${className}`}>
      {!hideToolbar && (
        <div className="flex justify-end">
          <TableToolbar rows={sortedRows} columns={columns} filename={filename} drill={drill}>
            {toolbarLeft}
          </TableToolbar>
        </div>
      )}
      {scrollWrapper ? <div className="overflow-x-auto">{tableEl}</div> : tableEl}
    </div>
  );
}
