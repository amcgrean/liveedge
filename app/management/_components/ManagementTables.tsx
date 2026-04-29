'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import type { BranchSummaryRow, SaleTypeRow, ThreeYearEntry } from '@/lib/scorecard/types';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const BRANCH_LIST = Object.keys(BRANCH_LABELS);

function fmt$(n: number | null): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(sales: number | null, gp: number | null): string {
  if (!sales || !gp) return '—';
  return `${((gp / sales) * 100).toFixed(1)}%`;
}

// ── 3-Year Comparison ──────────────────────────────────────────────────────
export function ThreeYearTable({ rows }: { rows: ThreeYearEntry[] }) {
  const columns: ColumnDef<ThreeYearEntry>[] = [
    {
      key: 'year',
      header: 'Year',
      accessor: (e) => e.label,
      cell: (e) => <span className="font-medium text-white">{e.label}</span>,
    },
    {
      key: 'sales',
      header: 'Sales',
      accessor: (e) => e.sales,
      align: 'right',
      cell: (e) => <span className="font-mono tabular-nums text-emerald-400">{fmt$(e.sales)}</span>,
    },
    {
      key: 'gp',
      header: 'Gross Profit',
      accessor: (e) => e.gp,
      align: 'right',
      cell: (e) => <span className="font-mono tabular-nums text-slate-300">{fmt$(e.gp)}</span>,
    },
    {
      key: 'gm_pct',
      header: 'GM%',
      accessor: (e) => (e.sales ? (e.gp / e.sales) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
      cell: (e) => <span className="font-mono tabular-nums text-slate-300">{fmtPct(e.sales, e.gp)}</span>,
    },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(e) => String(e.year)} filename="3year-comparison" />;
}

// ── By Branch ──────────────────────────────────────────────────────────────
type BranchRow = BranchSummaryRow | { branchId: string; branchName: string; salesBase: 0; salesCompare: 0; gpBase: 0; gpCompare: 0; customerCount: 0; _placeholder: true };

export function BranchSummaryTable({
  rows,
  baseYear,
  compareYear,
  qs,
}: {
  rows: BranchSummaryRow[];
  baseYear: number;
  compareYear: number;
  qs: string;
}) {
  // Pad with placeholder rows for branches with no data so the table always
  // shows all four locations (matches prior page behavior).
  const padded: BranchRow[] = [
    ...rows,
    ...BRANCH_LIST.filter((id) => !rows.find((b) => b.branchId === id)).map((id) => ({
      branchId: id,
      branchName: BRANCH_LABELS[id] ?? id,
      salesBase: 0 as const,
      salesCompare: 0 as const,
      gpBase: 0 as const,
      gpCompare: 0 as const,
      customerCount: 0 as const,
      _placeholder: true as const,
    })),
  ];

  const columns: ColumnDef<BranchRow>[] = [
    {
      key: 'branch',
      header: 'Branch',
      accessor: (b) => BRANCH_LABELS[b.branchId] ?? b.branchId,
      cell: (b) => {
        if ('_placeholder' in b) return <span className="text-slate-500">{BRANCH_LABELS[b.branchId]}</span>;
        return (
          <Link href={`/scorecard/branch/${b.branchId}?${qs}`} className="font-medium text-white hover:text-cyan-400 transition flex items-center gap-1">
            {BRANCH_LABELS[b.branchId] ?? b.branchId}
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 ml-auto" />
          </Link>
        );
      },
    },
    {
      key: 'sales_base',
      header: `${baseYear} Sales`,
      accessor: (b) => b.salesBase,
      align: 'right',
      cell: (b) => {
        if ('_placeholder' in b) return <span className="text-slate-600 text-xs">No data</span>;
        return (
          <span className={`font-mono tabular-nums ${b.salesBase >= b.salesCompare ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt$(b.salesBase)}
          </span>
        );
      },
    },
    {
      key: 'sales_compare',
      header: `${compareYear} Sales`,
      accessor: (b) => b.salesCompare,
      align: 'right',
      cell: (b) => ('_placeholder' in b ? null : <span className="font-mono tabular-nums text-slate-400">{fmt$(b.salesCompare)}</span>),
    },
    {
      key: 'gp_base',
      header: `${baseYear} GP`,
      accessor: (b) => b.gpBase,
      align: 'right',
      cell: (b) => ('_placeholder' in b ? null : <span className="font-mono tabular-nums text-slate-300">{fmt$(b.gpBase)}</span>),
    },
    {
      key: 'gm_pct',
      header: 'GM%',
      accessor: (b) => (b.salesBase ? (b.gpBase / b.salesBase) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
      cell: (b) => ('_placeholder' in b ? null : <span className="font-mono tabular-nums text-slate-300">{fmtPct(b.salesBase, b.gpBase)}</span>),
    },
    {
      key: 'customers',
      header: 'Customers',
      accessor: (b) => b.customerCount,
      align: 'right',
      cell: (b) => ('_placeholder' in b ? null : <span className="font-mono tabular-nums text-slate-400">{b.customerCount.toLocaleString()}</span>),
    },
  ];

  return <DataTable rows={padded} columns={columns} rowKey={(b) => b.branchId} filename="branch-summary" />;
}

// ── Sales by Type ──────────────────────────────────────────────────────────
export function SalesByTypeTable({
  rows,
  baseYear,
  compareYear,
}: {
  rows: SaleTypeRow[];
  baseYear: number;
  compareYear: number;
}) {
  const filtered = rows.filter((s) => !s.isExcluded);
  const columns: ColumnDef<SaleTypeRow>[] = [
    {
      key: 'category',
      header: 'Sale Type',
      accessor: (s) => s.category,
      cell: (s) => <span className="font-medium text-white">{s.category}</span>,
    },
    {
      key: 'sales_base',
      header: `${baseYear} Sales`,
      accessor: (s) => s.salesBase,
      align: 'right',
      cell: (s) => (
        <span className={`font-mono tabular-nums ${s.salesBase >= s.salesCompare ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmt$(s.salesBase)}
        </span>
      ),
    },
    {
      key: 'gp_base',
      header: `${baseYear} GP`,
      accessor: (s) => s.gpBase,
      align: 'right',
      cell: (s) => <span className="font-mono tabular-nums text-slate-300">{fmt$(s.gpBase)}</span>,
    },
    {
      key: 'gm_pct',
      header: 'GM%',
      accessor: (s) => (s.salesBase ? (s.gpBase / s.salesBase) * 100 : null),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
      align: 'right',
      cell: (s) => <span className="font-mono tabular-nums text-slate-300">{fmtPct(s.salesBase, s.gpBase)}</span>,
    },
    {
      key: 'sales_compare',
      header: `${compareYear} Sales`,
      accessor: (s) => s.salesCompare,
      align: 'right',
      cell: (s) => <span className="font-mono tabular-nums text-slate-400">{fmt$(s.salesCompare)}</span>,
    },
  ];

  return <DataTable rows={filtered} columns={columns} rowKey={(s) => s.category} filename="sales-by-type" />;
}
