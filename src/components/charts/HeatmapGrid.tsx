'use client';

import React, { useMemo } from 'react';
import { CHART_COLORS } from './theme';

export interface HeatmapGridProps {
  rows: string[];
  cols: string[];
  rowLabels?: Record<string, string>;
  colLabels?: Record<string, string>;
  /** values keyed [row][col] */
  values: Record<string, Record<string, number>>;
  format?: (n: number) => string;
  /** Optional override for total label per row (else sum of cells) */
  rowTotals?: Record<string, number>;
  /** Optional override for total label per column (else sum of cells) */
  colTotals?: Record<string, number>;
  /** Hide the totals row/column */
  hideTotals?: boolean;
  cellHeight?: number;
}

function shade(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'transparent';
  // Beisser green base, alpha scales 0.12 → 0.85 over the range
  const ratio = Math.min(1, value / max);
  const alpha = 0.12 + ratio * 0.73;
  return `rgba(26, 146, 72, ${alpha.toFixed(3)})`;
}

export default function HeatmapGrid({
  rows,
  cols,
  rowLabels,
  colLabels,
  values,
  format = (n) => n.toLocaleString(),
  rowTotals,
  colTotals,
  hideTotals = false,
  cellHeight = 32,
}: HeatmapGridProps) {
  const { max, computedRowTotals, computedColTotals, grandTotal } = useMemo(() => {
    let m = 0;
    const rt: Record<string, number> = {};
    const ct: Record<string, number> = {};
    let gt = 0;
    for (const r of rows) {
      let rowSum = 0;
      for (const c of cols) {
        const v = values[r]?.[c] ?? 0;
        if (v > m) m = v;
        rowSum += v;
        ct[c] = (ct[c] ?? 0) + v;
        gt += v;
      }
      rt[r] = rowSum;
    }
    return { max: m, computedRowTotals: rt, computedColTotals: ct, grandTotal: gt };
  }, [rows, cols, values]);

  const effRowTotals = rowTotals ?? computedRowTotals;
  const effColTotals = colTotals ?? computedColTotals;

  if (rows.length === 0 || cols.length === 0) {
    return <p className="text-xs text-slate-500 py-4">No data</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs print:break-inside-avoid">
        <thead>
          <tr>
            <th className="text-left px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide text-[10px] sticky left-0 bg-slate-800/40 print:bg-white print:text-slate-700" />
            {cols.map((c) => (
              <th
                key={c}
                className="text-right px-2 py-1.5 text-slate-400 font-medium text-[11px] print:text-slate-700"
              >
                {colLabels?.[c] ?? c}
              </th>
            ))}
            {!hideTotals && (
              <th className="text-right px-2 py-1.5 pr-3 text-slate-300 font-semibold text-[11px] border-l border-slate-700 print:text-slate-900 print:border-slate-300">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r} className="border-t border-slate-800 print:border-slate-300">
              <td
                className="text-left px-2 text-slate-200 font-medium whitespace-nowrap sticky left-0 bg-slate-800/40 print:bg-white print:text-slate-900"
                style={{ height: cellHeight }}
              >
                {rowLabels?.[r] ?? r}
              </td>
              {cols.map((c) => {
                const v = values[r]?.[c] ?? 0;
                return (
                  <td
                    key={c}
                    className="text-right px-2 tabular-nums text-slate-100 print:text-slate-900"
                    style={{
                      backgroundColor: shade(v, max),
                      height: cellHeight,
                    }}
                    title={`${rowLabels?.[r] ?? r} × ${colLabels?.[c] ?? c}: ${format(v)}`}
                  >
                    {v > 0 ? format(v) : <span className="text-slate-700 print:text-slate-400">·</span>}
                  </td>
                );
              })}
              {!hideTotals && (
                <td
                  className="text-right px-2 pr-3 tabular-nums font-semibold text-slate-200 border-l border-slate-700 print:text-slate-900 print:border-slate-300"
                  style={{ height: cellHeight }}
                >
                  {format(effRowTotals[r] ?? 0)}
                </td>
              )}
            </tr>
          ))}
          {!hideTotals && (
            <tr className="border-t border-slate-700 bg-slate-900/40 print:bg-slate-100 print:border-slate-300">
              <td
                className="text-left px-2 py-1.5 text-slate-300 uppercase font-semibold text-[10px] tracking-wide sticky left-0 bg-slate-900/60 print:bg-slate-100 print:text-slate-700"
              >
                Total
              </td>
              {cols.map((c) => (
                <td
                  key={c}
                  className="text-right px-2 py-1.5 tabular-nums text-slate-200 font-semibold print:text-slate-900"
                >
                  {format(effColTotals[c] ?? 0)}
                </td>
              ))}
              <td
                className="text-right px-2 py-1.5 pr-3 tabular-nums font-bold border-l border-slate-700 text-white print:text-slate-900 print:border-slate-300"
                style={{ color: CHART_COLORS.base }}
              >
                {format(grandTotal)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
