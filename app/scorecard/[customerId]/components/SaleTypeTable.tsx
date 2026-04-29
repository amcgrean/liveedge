'use client';

import { SortableHeader, TableToolbar, useTableSort, type ColumnDef } from '@/components/data-table';
import type { SaleTypeRow } from '@/lib/scorecard/types';

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

function gmPct(sales: number, gp: number): number | null {
  if (sales === 0) return null;
  return (gp / sales) * 100;
}

function deltaClass(base: number, compare: number): string {
  if (base > compare) return 'text-emerald-400';
  if (base < compare) return 'text-red-400';
  return 'text-white';
}

function gmColor(baseSales: number, baseGp: number, cmpSales: number, cmpGp: number): string {
  const base = gmPct(baseSales, baseGp);
  const cmp  = gmPct(cmpSales, cmpGp);
  if (base === null) return 'text-slate-400';
  if (cmp === null)  return 'text-slate-300';
  if (base > cmp + 0.005) return 'text-emerald-400';
  if (base < cmp - 0.005) return 'text-red-400';
  return 'text-slate-300';
}

interface Props {
  rows: SaleTypeRow[];
  baseYear: number;
  compareYear: number;
  exportFilename?: string;
}

export default function SaleTypeTable({ rows, baseYear, compareYear, exportFilename }: Props) {
  // Columns are declared once and used for both sort + export. Accessors return
  // raw numbers so sort and CSV are correct; cells handle display formatting.
  const columns: ColumnDef<SaleTypeRow>[] = [
    {
      key: 'category',
      header: 'Sale Type',
      accessor: (r) => (r.isExcluded ? 'Hold' : r.category),
    },
    { key: 'sales_base', header: `${baseYear} Sales`, accessor: (r) => r.salesBase, align: 'right' },
    { key: 'gp_base',    header: `${baseYear} GP`,    accessor: (r) => r.gpBase,    align: 'right' },
    {
      key: 'gm_base',
      header: `${baseYear} GM%`,
      accessor: (r) => gmPct(r.salesBase, r.gpBase),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
    { key: 'sales_compare', header: `${compareYear} Sales`, accessor: (r) => r.salesCompare, align: 'right' },
    { key: 'gp_compare',    header: `${compareYear} GP`,    accessor: (r) => r.gpCompare,    align: 'right' },
    {
      key: 'gm_compare',
      header: `${compareYear} GM%`,
      accessor: (r) => gmPct(r.salesCompare, r.gpCompare),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
  ];

  const { sortedRows, sort, toggle } = useTableSort({ rows, columns });

  if (rows.length === 0) return null;

  // Totals are unaffected by sort — they're the sum of all rows regardless of order.
  const totalBase = rows.reduce((s, r) => s + r.salesBase, 0);
  const totalCompare = rows.reduce((s, r) => s + r.salesCompare, 0);
  const totalGpBase = rows.reduce((s, r) => s + r.gpBase, 0);
  const totalGpCompare = rows.reduce((s, r) => s + r.gpCompare, 0);
  const hasExcluded = rows.some((r) => r.isExcluded);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <TableToolbar rows={sortedRows} columns={columns} filename={exportFilename ?? `sale-types-${baseYear}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm print:text-xs">
          <thead>
            <tr className="border-b border-slate-700 group">
              <SortableHeader
                columnKey="category"
                label="Sale Type"
                sort={sort}
                onToggle={toggle}
                align="left"
                className="pb-2 text-left text-slate-400 font-medium"
              />
              {columns.slice(1).map((c) => (
                <SortableHeader
                  key={c.key}
                  columnKey={c.key}
                  label={c.header}
                  sort={sort}
                  onToggle={toggle}
                  align="right"
                  className={`pb-2 text-right text-slate-300 font-semibold ${c.key === 'gm_compare' ? '' : 'pr-3'}`}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr
                key={r.category}
                className={`border-b border-slate-800 ${r.isExcluded ? 'bg-amber-950/20' : ''}`}
              >
                <td className="py-2 text-slate-200 flex items-center gap-2">
                  <span>{r.isExcluded ? 'Hold' : r.category}</span>
                  {r.isExcluded && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-900/60 text-amber-300 border border-amber-700/50">
                      ⚠ Process Issue
                    </span>
                  )}
                </td>
                <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(r.salesBase, r.salesCompare)}`}>{fmt$(r.salesBase)}</td>
                <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(r.gpBase, r.gpCompare)}`}>{fmt$(r.gpBase)}</td>
                <td className={`py-2 text-right font-mono tabular-nums pr-3 ${gmColor(r.salesBase, r.gpBase, r.salesCompare, r.gpCompare)}`}>{fmtPct(r.salesBase, r.gpBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(r.salesCompare)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(r.gpCompare)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-400">{fmtPct(r.salesCompare, r.gpCompare)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-600 font-semibold">
              <td className="py-2 text-slate-200">Total</td>
              <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(totalBase, totalCompare)}`}>{fmt$(totalBase)}</td>
              <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(totalGpBase, totalGpCompare)}`}>{fmt$(totalGpBase)}</td>
              <td className={`py-2 text-right font-mono tabular-nums pr-3 ${gmColor(totalBase, totalGpBase, totalCompare, totalGpCompare)}`}>{fmtPct(totalBase, totalGpBase)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(totalCompare)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(totalGpCompare)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-slate-400">{fmtPct(totalCompare, totalGpCompare)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {hasExcluded && (
        <p className="text-xs text-amber-400/70">
          ⚠ Rows marked "Process Issue" contain orders where staff released without updating the sale type (e.g. HOLD, DOORHOLD). The dollar amounts are real — this is a workflow gap to address.
        </p>
      )}
    </div>
  );
}
