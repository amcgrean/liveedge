'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import type { BranchSummaryRow, CustomerListRow } from '@/lib/scorecard/types';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

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

// ── Branch breakdown (used on /scorecard/overview) ─────────────────────────
export function BranchBreakdownTable({
  rows,
  baseYear,
  compareYear,
  period,
  cutoffDate,
}: {
  rows: BranchSummaryRow[];
  baseYear: number;
  compareYear: number;
  period: string;
  cutoffDate: string;
}) {
  const ytd = period === 'YTD' ? ' YTD' : '';
  const columns: ColumnDef<BranchSummaryRow>[] = [
    {
      key: 'branch',
      header: 'Branch',
      accessor: (b) => BRANCH_LABELS[b.branchId] ?? b.branchId,
      cell: (b) => (
        <Link
          href={`/scorecard/branch/${b.branchId}?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}`}
          className="font-medium text-white hover:text-cyan-400 transition"
        >
          {BRANCH_LABELS[b.branchId] ?? b.branchId}
        </Link>
      ),
    },
    {
      key: 'sales_base',
      header: `${baseYear}${ytd} Sales`,
      accessor: (b) => b.salesBase,
      align: 'right',
      cell: (b) => (
        <span className={`font-mono tabular-nums ${deltaClass(b.salesBase, b.salesCompare)}`}>{fmt$(b.salesBase)}</span>
      ),
    },
    {
      key: 'sales_compare',
      header: `${compareYear}${ytd} Sales`,
      accessor: (b) => b.salesCompare,
      align: 'right',
      cell: (b) => <span className="font-mono tabular-nums text-slate-400">{fmt$(b.salesCompare)}</span>,
    },
    {
      key: 'gp_base',
      header: `${baseYear}${ytd} GP`,
      accessor: (b) => b.gpBase,
      align: 'right',
      cell: (b) => <span className="font-mono tabular-nums text-slate-300">{fmt$(b.gpBase)}</span>,
    },
    {
      key: 'gm_pct',
      header: 'GM%',
      accessor: (b) => (b.salesBase ? (b.gpBase / b.salesBase) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
      cell: (b) => <span className="font-mono tabular-nums text-slate-300">{fmtPct(b.salesBase, b.gpBase)}</span>,
    },
    {
      key: 'customers',
      header: 'Customers',
      accessor: (b) => b.customerCount,
      align: 'right',
      cell: (b) => <span className="font-mono tabular-nums text-slate-400">{b.customerCount.toLocaleString()}</span>,
    },
  ];

  return <DataTable rows={rows} columns={columns} rowKey={(b) => b.branchId} filename="branch-overview" />;
}

// ── Top customers for a branch ─────────────────────────────────────────────
export function TopCustomersTable({
  rows,
  baseYear,
  compareYear,
  period,
  cutoffDate,
  branchId,
  filename,
}: {
  rows: CustomerListRow[];
  baseYear: number;
  compareYear: number;
  period: string;
  cutoffDate: string;
  branchId: string;
  filename: string;
}) {
  const ytd = period === 'YTD' ? ' YTD' : '';
  const columns: ColumnDef<CustomerListRow>[] = [
    {
      key: 'customer',
      header: 'Customer',
      accessor: (c) => c.customerName,
      cell: (c) => (
        <Link
          href={`/scorecard/${encodeURIComponent(c.customerId)}?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}&branch=${branchId}`}
          className="flex items-center gap-1 hover:text-cyan-400 transition"
        >
          <span className="font-medium text-white">{c.customerName}</span>
          <span className="text-slate-500 text-xs ml-1">{c.customerId}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 ml-auto" />
        </Link>
      ),
    },
    {
      key: 'sales_base',
      header: `${baseYear}${ytd} Sales`,
      accessor: (c) => c.salesBase,
      align: 'right',
      cell: (c) => (
        <span className={`font-mono tabular-nums ${deltaClass(c.salesBase, c.salesCompare)}`}>{fmt$(c.salesBase)}</span>
      ),
    },
    {
      key: 'sales_compare',
      header: `${compareYear}${ytd} Sales`,
      accessor: (c) => c.salesCompare,
      align: 'right',
      cell: (c) => <span className="font-mono tabular-nums text-slate-400">{fmt$(c.salesCompare)}</span>,
    },
    {
      key: 'gm_pct',
      header: 'GM%',
      accessor: (c) => (c.salesBase ? (c.gpBase / c.salesBase) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
      cell: (c) => <span className="font-mono tabular-nums text-slate-300">{fmtPct(c.salesBase, c.gpBase)}</span>,
    },
  ];

  return <DataTable rows={rows} columns={columns} rowKey={(c) => c.customerId} filename={filename} />;
}
