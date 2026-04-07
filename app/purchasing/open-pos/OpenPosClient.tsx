'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, Package, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { OpenPO } from '@/lib/purchasing';

const BRANCH_OPTIONS = [
  { code: '',     label: 'All Branches' },
  { code: '10FD', label: '10FD · Fort Dodge' },
  { code: '20GR', label: '20GR · Grimes' },
  { code: '25BW', label: '25BW · Birchwood' },
  { code: '40CV', label: '40CV · Coralville' },
];

const PAGE_SIZE = 50;

type DateFilter = 'all' | 'overdue' | 'today' | 'next5';

const STATUS_COLORS: Record<string, string> = {
  OPEN:    'bg-blue-500/20 text-blue-300',
  PARTIAL: 'bg-yellow-500/20 text-yellow-300',
  ORDERED: 'bg-cyan-500/20 text-cyan-300',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props { isAdmin: boolean; userBranch: string | null; }

export default function OpenPosClient({ isAdmin, userBranch }: Props) {
  usePageTracking();

  const [allPos, setAllPos]           = useState<OpenPO[]>([]);
  const [loading, setLoading]         = useState(true);
  const [branch, setBranch]           = useState(userBranch ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFilter, setDateFilter]   = useState<DateFilter>('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [page, setPage]               = useState(1);

  const load = useCallback(async (br: string) => {
    setLoading(true);
    setPage(1);
    try {
      const params = new URLSearchParams();
      if (br) params.set('branch', br);
      const res = await fetch(`/api/purchasing/pos/open?${params}`);
      if (!res.ok) return;
      setAllPos(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(branch); }, [load, branch]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [dateFilter, supplierFilter]);

  // Supplier list derived from loaded data
  const suppliers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of allPos) {
      const code = p.supplier_code ?? '';
      const name = p.supplier_name ?? p.supplier_code ?? '';
      if (code && !seen.has(code)) seen.set(code, name);
    }
    return Array.from(seen.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allPos]);

  const today = new Date().toISOString().slice(0, 10);
  const next5 = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let result = allPos;

    if (dateFilter === 'overdue') {
      result = result.filter((p) => p.expect_date && p.expect_date.slice(0, 10) < today);
    } else if (dateFilter === 'today') {
      result = result.filter((p) => p.expect_date && p.expect_date.slice(0, 10) === today);
    } else if (dateFilter === 'next5') {
      result = result.filter(
        (p) => p.expect_date && p.expect_date.slice(0, 10) >= today && p.expect_date.slice(0, 10) <= next5,
      );
    }

    if (supplierFilter) {
      result = result.filter((p) => p.supplier_code === supplierFilter);
    }

    return result;
  }, [allPos, dateFilter, supplierFilter, today, next5]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const overdueCount = useMemo(
    () => allPos.filter((p) => p.expect_date && p.expect_date.slice(0, 10) < today).length,
    [allPos, today],
  );

  const activeFilterLabels = [
    dateFilter !== 'all' && ({ all: '', overdue: 'Overdue', today: 'Due Today', next5: 'Next 5 Days' }[dateFilter]),
    supplierFilter && (suppliers.find((s) => s.code === supplierFilter)?.name ?? supplierFilter),
  ].filter(Boolean) as string[];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/purchasing" className="text-sm text-cyan-400 hover:underline">&larr; PO Check-In</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Open Purchase Orders</h1>
          <p className="text-sm text-slate-400">
            {allPos.length} open PO{allPos.length !== 1 ? 's' : ''}
            {filtered.length !== allPos.length && ` · ${filtered.length} matching filters`}
            {isAdmin && (branch ? ` · ${branch}` : ' (all branches)')}
          </p>
        </div>
        <button
          onClick={() => load(branch)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-sm transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Branch switcher — admin only */}
      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          {BRANCH_OPTIONS.map((b) => (
            <button
              key={b.code}
              onClick={() => setBranch(b.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                branch === b.code
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Advanced filters — collapsed by default */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-300 hover:text-white transition"
        >
          <span className="flex items-center gap-2 font-medium">
            Filters
            {activeFilterLabels.length > 0 && (
              <span className="flex gap-1">
                {activeFilterLabels.map((label) => (
                  <span key={label} className="px-1.5 py-0.5 rounded bg-cyan-600 text-white text-xs">
                    {label}
                  </span>
                ))}
              </span>
            )}
          </span>
          {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 pt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date filter */}
            <div>
              <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">
                Due Date
              </label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'all',     label: 'All' },
                  { value: 'overdue', label: overdueCount > 0 ? `Overdue (${overdueCount})` : 'Overdue' },
                  { value: 'today',   label: 'Due Today' },
                  { value: 'next5',   label: 'Next 5 Days' },
                ] as { value: DateFilter; label: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDateFilter(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      dateFilter === opt.value
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Supplier filter */}
            <div>
              <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">
                Supplier
              </label>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Suppliers ({suppliers.length})</option>
                {suppliers.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>

            {activeFilterLabels.length > 0 && (
              <div className="md:col-span-2">
                <button
                  onClick={() => { setDateFilter('all'); setSupplierFilter(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition underline"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overdue banner (when not using date filter so users notice) */}
      {overdueCount > 0 && dateFilter === 'all' && !supplierFilter && (
        <button
          onClick={() => { setDateFilter('overdue'); setFiltersOpen(true); }}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-900/30 border border-red-500/30 text-red-400 text-sm hover:bg-red-900/50 transition text-left"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{overdueCount} overdue PO{overdueCount !== 1 ? 's' : ''} — click to filter</span>
        </button>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm">No open purchase orders match the current filters</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">PO #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Expect Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Receipts</th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Branch</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p) => {
                    const isOverdue = !!p.expect_date && p.expect_date.slice(0, 10) < today;
                    const isSupplierActive = supplierFilter === p.supplier_code;
                    return (
                      <tr
                        key={p.po_number}
                        className={`border-b border-white/5 hover:bg-slate-800/50 ${isOverdue ? 'border-l-2 border-red-500/40' : ''}`}
                      >
                        {/* Clickable PO number */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/purchasing/pos/${encodeURIComponent(p.po_number)}`}
                            className="font-mono text-cyan-400 hover:text-cyan-300 font-medium transition hover:underline"
                          >
                            {p.po_number}
                          </Link>
                        </td>

                        {/* Clickable supplier — filters table inline */}
                        <td className="px-4 py-3 max-w-[200px] truncate">
                          <button
                            onClick={() => setSupplierFilter(isSupplierActive ? '' : (p.supplier_code ?? ''))}
                            title={isSupplierActive ? 'Clear supplier filter' : 'Filter by this supplier'}
                            className={`text-left text-sm transition hover:underline ${
                              isSupplierActive ? 'text-cyan-400 font-medium' : 'text-slate-200 hover:text-cyan-400'
                            }`}
                          >
                            {p.supplier_name ?? p.supplier_code ?? '—'}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.po_status?.toUpperCase() ?? ''] ?? 'bg-slate-700 text-slate-300'}`}>
                            {p.po_status ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(p.order_date)}</td>
                        <td className={`px-4 py-3 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-300'}`}>
                          {formatDate(p.expect_date)}
                          {isOverdue && <span className="ml-1">⚠</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{p.receipt_count ?? 0}</td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-slate-400 text-xs">{p.system_id ?? '—'}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span className="text-xs">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs transition"
                >
                  Previous
                </button>
                <span className="text-xs px-2">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
