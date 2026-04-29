'use client';

import { useMemo, useState, useCallback } from 'react';
import type { ColumnDef, SortState, SortDir } from './types';

interface Options<Row> {
  rows: Row[];
  columns: ColumnDef<Row>[];
  initialSort?: SortState | null;
}

interface Result<Row> {
  sortedRows: Row[];
  sort: SortState | null;
  setSort: (next: SortState | null) => void;
  toggle: (key: string) => void;
}

/**
 * Client-side single-column sort for full-list tables (scorecard / management).
 * Click cycle: none → asc → desc → none. The cycle lives here so callers can
 * just wire `toggle(column.key)` to the header.
 *
 * Stable: a stable sort is preserved by adding the original index as a tiebreaker.
 */
export function useTableSort<Row>({ rows, columns, initialSort = null }: Options<Row>): Result<Row> {
  const [sort, setSort] = useState<SortState | null>(initialSort);

  const toggle = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' as SortDir };
      if (prev.dir === 'asc') return { key, dir: 'desc' as SortDir };
      return null;
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;

    const factor = sort.dir === 'asc' ? 1 : -1;
    const indexed = rows.map((row, idx) => ({ row, idx }));

    indexed.sort((a, b) => {
      const av = col.accessor(a.row);
      const bv = col.accessor(b.row);

      const aNull = av === null || av === undefined || av === '';
      const bNull = bv === null || bv === undefined || bv === '';
      if (aNull && bNull) return a.idx - b.idx;
      if (aNull) return 1;   // nulls always last regardless of dir
      if (bNull) return -1;

      if (typeof av === 'number' && typeof bv === 'number') {
        const diff = av - bv;
        return diff !== 0 ? diff * factor : a.idx - b.idx;
      }

      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return cmp !== 0 ? cmp * factor : a.idx - b.idx;
    });

    return indexed.map((x) => x.row);
  }, [rows, columns, sort]);

  return { sortedRows, sort, setSort, toggle };
}
