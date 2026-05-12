'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  DataTable,
  type ColumnDef,
} from '@/components/data-table';

type LevelInfo =
  | { level: 'minor'; majorCode: string }   // rows are minors under a major
  | { level: 'item'; majorCode: string; minorCode: string }; // rows are items under a minor

interface Row {
  code: string;          // minor code or item code
  label: string;         // minor name or item description
  salesBase: number;
  gpBase: number;
  salesCompare: number;
  gpCompare: number;
  qtyBase?: number;
  soCountBase?: number;
}

interface Props {
  rows: Row[];
  level: LevelInfo['level'];
  majorCode: string;
  minorCode?: string;
  baseYear: number;
  compareYear: number;
  /** Carried through into row links so the drill-target's breadcrumb returns here. */
  fromHint?: string;
  qs: string;            // `?baseYear=...&period=...&...` so filter state is preserved
  exportFilename?: string;
}

function fmt$(n: number) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(sales: number, gp: number) {
  if (!sales) return '—';
  return `${((gp / sales) * 100).toFixed(1)}%`;
}

function deltaClass(base: number, compare: number) {
  if (base > compare) return 'text-emerald-400';
  if (base < compare) return 'text-red-400';
  return 'text-slate-300';
}

export default function ProductDrillBreakdownTable({
  rows,
  level,
  majorCode,
  minorCode,
  baseYear,
  compareYear,
  fromHint,
  qs,
  exportFilename,
}: Props) {
  // Build target URL per-row honoring filter state and back-stack hint.
  const buildHref = (code: string) => {
    const sep = qs.startsWith('?') ? '&' : '?';
    const fromParam = fromHint ? `${qs ? '&' : sep}from=${encodeURIComponent(fromHint)}` : '';
    const baseQs = qs ? (qs.startsWith('?') ? qs : `?${qs}`) : '';
    if (level === 'minor') {
      return `/scorecard/product/minor/${encodeURIComponent(majorCode)}/${encodeURIComponent(code)}${baseQs}${fromParam}`;
    }
    return `/scorecard/product/item/${encodeURIComponent(code)}${baseQs}${fromParam}`;
  };

  const labelHeader = level === 'minor' ? 'Product Minor' : 'Item';

  const columns: ColumnDef<Row>[] = useMemo(() => {
    const cols: ColumnDef<Row>[] = [
      {
        key: 'label',
        header: labelHeader,
        accessor: (r) => r.label,
        cell: (r) => (
          <Link
            href={buildHref(r.code)}
            className="inline-flex items-center gap-1 text-white hover:text-cyan-400 transition"
          >
            <span className="truncate">{r.label}</span>
            <span className="text-slate-500 italic text-xs ml-0.5">({r.code})</span>
            <ExternalLink className="w-3 h-3 text-slate-600" />
          </Link>
        ),
      },
      {
        key: 'sales_base',
        header: `${baseYear} Sales`,
        accessor: (r) => r.salesBase,
        align: 'right',
        cell: (r) => (
          <span className={`font-mono tabular-nums ${deltaClass(r.salesBase, r.salesCompare)}`}>{fmt$(r.salesBase)}</span>
        ),
      },
      {
        key: 'gp_base',
        header: `${baseYear} GP`,
        accessor: (r) => r.gpBase,
        align: 'right',
        cell: (r) => <span className="font-mono tabular-nums text-slate-300">{fmt$(r.gpBase)}</span>,
      },
      {
        key: 'gm_base',
        header: `${baseYear} GM%`,
        accessor: (r) => (r.salesBase ? (r.gpBase / r.salesBase) * 100 : null),
        exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(1)}%`),
        align: 'right',
        cell: (r) => <span className="font-mono tabular-nums text-cyan-400">{fmtPct(r.salesBase, r.gpBase)}</span>,
      },
      {
        key: 'sales_compare',
        header: `${compareYear} Sales`,
        accessor: (r) => r.salesCompare,
        align: 'right',
        cell: (r) => <span className="font-mono tabular-nums text-slate-500">{fmt$(r.salesCompare)}</span>,
      },
    ];
    if (rows.some((r) => r.qtyBase !== undefined)) {
      cols.push({
        key: 'qty',
        header: 'Qty',
        accessor: (r) => r.qtyBase ?? 0,
        align: 'right',
        cell: (r) =>
          r.qtyBase === undefined || r.qtyBase === 0
            ? <span className="text-slate-600">—</span>
            : <span className="font-mono tabular-nums text-slate-400">{r.qtyBase.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>,
      });
    }
    if (rows.some((r) => r.soCountBase !== undefined)) {
      cols.push({
        key: 'so_count',
        header: 'SOs',
        accessor: (r) => r.soCountBase ?? 0,
        align: 'right',
        cell: (r) =>
          r.soCountBase === undefined || r.soCountBase === 0
            ? <span className="text-slate-600">—</span>
            : <span className="font-mono tabular-nums text-slate-400">{r.soCountBase.toLocaleString()}</span>,
      });
    }
    return cols;
  }, [rows, level, baseYear, compareYear, majorCode, minorCode, fromHint, qs]);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 italic">No data for this period.</p>;
  }

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.code}
      filename={exportFilename ?? `product-drilldown-${baseYear}`}
    />
  );
}
