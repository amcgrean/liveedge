'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
  SortableHeader,
  TableToolbar,
  useTableSort,
  type ColumnDef,
} from '@/components/data-table';
import type { RepListRow } from '@/lib/scorecard/types';

function fmt$(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(sales: number, gp: number): string {
  if (sales === 0) return '—';
  return `${((gp / sales) * 100).toFixed(1)}%`;
}

function deltaClass(base: number, compare: number) {
  if (base > compare) return 'text-emerald-400';
  if (base < compare) return 'text-red-400';
  return 'text-slate-400';
}

interface Props {
  rows: RepListRow[];
  baseYear: number;
  compareYear: number;
  period: string;
  cutoffDate: string;
  branchIds: string[];
}

export default function RepListTable({ rows, baseYear, compareYear, period, cutoffDate, branchIds }: Props) {
  // Two parallel column sets (Assigned vs Written) sit under a grouped header.
  // We define one combined ColumnDef array keyed on the actual data fields so
  // sort + export work; the visible header preserves the bespoke 2-row layout
  // with an Assigned/Written grouping band.
  const columns: ColumnDef<RepListRow>[] = [
    { key: 'rep',                     header: 'Rep',                                           accessor: (r) => r.repCode },
    { key: 'assigned_sales_base',     header: `${baseYear} Assigned Sales`,                    accessor: (r) => r.assignedSalesBase, align: 'right' },
    { key: 'assigned_sales_compare',  header: `${compareYear} Assigned Sales`,                 accessor: (r) => r.assignedSalesCompare, align: 'right' },
    {
      key: 'assigned_gm',
      header: 'Assigned GM%',
      accessor: (r) => (r.assignedSalesBase ? (r.assignedGpBase / r.assignedSalesBase) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
    },
    { key: 'written_sales_base',      header: `${baseYear} Written Sales`,                     accessor: (r) => r.writtenSalesBase, align: 'right' },
    { key: 'written_sales_compare',   header: `${compareYear} Written Sales`,                  accessor: (r) => r.writtenSalesCompare, align: 'right' },
    {
      key: 'written_gm',
      header: 'Written GM%',
      accessor: (r) => (r.writtenSalesBase ? (r.writtenGpBase / r.writtenSalesBase) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
    },
  ];

  const { sortedRows, sort, toggle } = useTableSort({ rows, columns });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <TableToolbar rows={sortedRows} columns={columns} filename={`rep-scorecard-${baseYear}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left">
              <th className="pb-2 text-slate-400 font-medium" rowSpan={2} />
              <th className="pb-1 text-cyan-400/80 font-medium text-right pr-4 text-xs" colSpan={3}>
                Assigned Book (rep_1)
              </th>
              <th className="pb-1 text-amber-400/80 font-medium text-right pr-4 text-xs border-l border-slate-700 pl-4" colSpan={3}>
                Written Up (rep_3)
              </th>
            </tr>
            <tr className="border-b border-slate-700 group">
              <SortableHeader
                columnKey="rep"
                label="Rep"
                sort={sort}
                onToggle={toggle}
                align="left"
                className="pb-2 text-slate-400 font-medium"
              />
              <SortableHeader columnKey="assigned_sales_base"    label={`${baseYear} Sales`}    sort={sort} onToggle={toggle} align="right" className="pb-2 text-slate-300 font-semibold pr-4" />
              <SortableHeader columnKey="assigned_sales_compare" label={`${compareYear}`}        sort={sort} onToggle={toggle} align="right" className="pb-2 text-slate-300 font-semibold pr-4" />
              <SortableHeader columnKey="assigned_gm"            label="GM%"                     sort={sort} onToggle={toggle} align="right" className="pb-2 text-slate-300 font-semibold pr-4" />
              <SortableHeader columnKey="written_sales_base"     label={`${baseYear} Sales`}    sort={sort} onToggle={toggle} align="right" className="pb-2 text-slate-300 font-semibold pr-4 border-l border-slate-700 pl-4" />
              <SortableHeader columnKey="written_sales_compare"  label={`${compareYear}`}        sort={sort} onToggle={toggle} align="right" className="pb-2 text-slate-300 font-semibold pr-4" />
              <SortableHeader columnKey="written_gm"             label="GM%"                     sort={sort} onToggle={toggle} align="right" className="pb-2 text-slate-300 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  No rep data found — verify rep_1 and rep_3 columns exist in agility_so_header
                </td>
              </tr>
            )}
            {sortedRows.map((r) => {
              const qs = `baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}${branchIds.map((b) => `&branch=${b}`).join('')}`;
              return (
                <tr
                  key={r.repCode}
                  className="border-b border-slate-800 hover:bg-slate-800/40 transition group"
                >
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/scorecard/rep/${encodeURIComponent(r.repCode)}?${qs}`}
                      className="flex items-center gap-1 group-hover:text-cyan-400 transition"
                    >
                      <span className="font-medium text-white">{r.repCode}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 ml-auto" />
                    </Link>
                  </td>
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${deltaClass(r.assignedSalesBase, r.assignedSalesCompare)}`}>
                    {fmt$(r.assignedSalesBase)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(r.assignedSalesCompare)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmtPct(r.assignedSalesBase, r.assignedGpBase)}</td>
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums border-l border-slate-800 pl-4 ${deltaClass(r.writtenSalesBase, r.writtenSalesCompare)}`}>
                    {fmt$(r.writtenSalesBase)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(r.writtenSalesCompare)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">{fmtPct(r.writtenSalesBase, r.writtenGpBase)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
