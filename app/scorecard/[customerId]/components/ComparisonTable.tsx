'use client';

import { TableToolbar, type ColumnDef } from '@/components/data-table';
import type { ThreeYearEntry } from '@/lib/scorecard/types';

function fmt$(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(sales: number, gp: number): string {
  if (sales === 0) return '—';
  return `${((gp / sales) * 100).toFixed(2)}%`;
}

interface Props {
  entries: ThreeYearEntry[];
  exportFilename?: string;
}

export default function ComparisonTable({ entries, exportFilename }: Props) {
  // The visual is pivoted (years as columns) but the natural CSV shape is one
  // row per year with sales / gp / gp% — that's what people paste into Excel.
  // Sort is intentionally disabled: a 3-row matrix doesn't benefit from it.
  const exportColumns: ColumnDef<ThreeYearEntry>[] = [
    { key: 'year',  header: 'Year',  accessor: (e) => e.label },
    { key: 'sales', header: 'Sales', accessor: (e) => e.sales, align: 'right' },
    { key: 'gp',    header: 'Gross Profit', accessor: (e) => e.gp, align: 'right' },
    {
      key: 'gp_pct',
      header: 'GP%',
      accessor: (e) => (e.sales === 0 ? null : (e.gp / e.sales) * 100),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <TableToolbar rows={entries} columns={exportColumns} filename={exportFilename ?? 'three-year-comparison'} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm print:text-xs">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="pb-2 text-left text-slate-400 font-medium w-32" />
              {entries.map((e) => (
                <th key={e.year} className="pb-2 text-right text-slate-300 font-semibold pr-4 last:pr-0">
                  {e.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="py-2 text-slate-400 text-xs font-medium uppercase tracking-wide">Sales</td>
              {entries.map((e) => (
                <td key={e.year} className="py-2 text-right font-mono tabular-nums text-white pr-4 last:pr-0">
                  {fmt$(e.sales)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 text-slate-400 text-xs font-medium uppercase tracking-wide">Gross Profit</td>
              {entries.map((e) => (
                <td key={e.year} className="py-2 text-right font-mono tabular-nums text-white pr-4 last:pr-0">
                  {fmt$(e.gp)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 text-slate-400 text-xs font-medium uppercase tracking-wide">GP%</td>
              {entries.map((e) => (
                <td key={e.year} className="py-2 text-right font-mono tabular-nums text-cyan-400 pr-4 last:pr-0">
                  {fmtPct(e.sales, e.gp)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
