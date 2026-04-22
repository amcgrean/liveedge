'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { CreditMemo } from '../api/credits/route';
import { cn } from '@/lib/utils';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const STATUS_LABELS: Record<string, string> = {
  O: 'Open',
  H: 'Hold',
  Q: 'Quote',
};

function statusBadge(status: string | null) {
  const s = (status ?? '').toUpperCase();
  const label = STATUS_LABELS[s] ?? (s || '—');
  const cls =
    s === 'O' ? 'bg-emerald-500/15 text-emerald-400'
    : s === 'H' ? 'bg-amber-500/15 text-amber-400'
    : 'bg-slate-500/15 text-slate-400';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium', cls)}>
      {label}
    </span>
  );
}

interface Props {
  userBranch: string;
  isAdmin: boolean;
}

export default function CreditsClient({ userBranch, isAdmin }: Props) {
  usePageTracking();

  const [credits, setCredits]   = useState<CreditMemo[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [q, setQ]               = useState('');
  const [branch, setBranch]     = useState(userBranch);
  const [page, setPage]         = useState(1);
  const searchTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalPages              = Math.max(1, Math.ceil(total / 50));

  const fetchCredits = useCallback(async (opts?: {
    q?: string; branch?: string; page?: number;
  }) => {
    setLoading(true);
    setError('');
    const qVal  = opts?.q      ?? q;
    const br    = opts?.branch ?? branch;
    const pg    = opts?.page   ?? page;
    const params = new URLSearchParams({ q: qVal, branch: br, page: String(pg) });
    try {
      const res = await fetch(`/api/credits?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCredits(data.credits ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Failed to load credits.');
    } finally {
      setLoading(false);
    }
  }, [q, branch, page]);

  useEffect(() => {
    fetchCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (val: string) => {
    setQ(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchCredits({ q: val, page: 1 });
    }, 350);
  };

  const handleBranch = (val: string) => {
    setBranch(val);
    setPage(1);
    fetchCredits({ branch: val, page: 1 });
  };

  const goPage = (p: number) => {
    setPage(p);
    fetchCredits({ page: p });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">RMA Credits</h1>
          <p className="text-sm text-slate-400 mt-1">
            Open credit memos from ERP — {loading ? 'Loading…' : `${total.toLocaleString()} open credits`}
          </p>
        </div>
        <button
          onClick={() => fetchCredits()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search SO#, customer, reference…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        {isAdmin && (
          <select
            value={branch}
            onChange={(e) => handleBranch(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="">All Branches</option>
            {Object.entries(BRANCH_LABELS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/60">
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">SO #</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Branch</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Reference</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Salesperson</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Order Date</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-500">Loading…</td></tr>
            ) : credits.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-500">No open credits found.</td></tr>
            ) : (
              credits.map((cm) => (
                <tr key={cm.so_id} className="hover:bg-slate-800/50 transition">
                  <td className="px-4 py-3 font-mono text-cyan-400 font-medium text-sm">{cm.so_id}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {BRANCH_LABELS[cm.system_id] ?? cm.system_id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white text-sm font-medium leading-tight truncate max-w-[180px]">
                      {cm.cust_name ?? '—'}
                    </div>
                    {cm.cust_code && (
                      <div className="text-slate-500 text-[11px] font-mono">{cm.cust_code}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono hidden md:table-cell">
                    {cm.reference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden lg:table-cell">
                    {cm.salesperson ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden lg:table-cell">
                    {cm.order_date ?? '—'}
                  </td>
                  <td className="px-4 py-3">{statusBadge(cm.so_status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 50 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
