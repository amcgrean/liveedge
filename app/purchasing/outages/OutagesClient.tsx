'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Search, Star, Download, ExternalLink, Filter } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { ReplenishmentRow, SupplierRollup, Severity } from '@/lib/purchasing/replenishment';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

interface Props {
  userBranch: string | null;
  isAllBranchUser: boolean;
}

interface Summary {
  total: number; red: number; amber: number; yellow: number; critical: number; totalSuggestedQty: number;
}

interface ApiResponse {
  rows: ReplenishmentRow[];
  summary: Summary;
  supplierRollup: SupplierRollup[];
}

function severityChip(s: Severity) {
  if (s === 'red')    return 'bg-red-500/20 text-red-300 border border-red-500/40';
  if (s === 'amber')  return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
  if (s === 'yellow') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
  return 'bg-slate-700 text-slate-400 border border-slate-600';
}

function fmtQty(v: number | null | undefined, uom?: string | null) {
  if (v == null) return '—';
  const s = Math.abs(v) >= 1000
    ? Math.round(v).toLocaleString()
    : Number(v.toFixed(2)).toLocaleString();
  return uom ? `${s} ${uom}` : s;
}

function fmtCoverage(d: number | null) {
  if (d == null) return '∞';
  if (d < 0)     return `OOS · ${Math.round(Math.abs(d))}d back`;
  if (d < 1)     return '<1d';
  return `${Math.round(d)}d`;
}

export default function OutagesClient({ userBranch, isAllBranchUser }: Props) {
  usePageTracking();

  const [branch, setBranch] = useState(isAllBranchUser ? '' : (userBranch ?? ''));
  const [category, setCategory] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [q, setQ] = useState('');

  const [rows, setRows] = useState<ReplenishmentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      sp.set('view', 'outages');
      if (branch)       sp.set('branch', branch);
      if (category)     sp.set('category', category);
      if (criticalOnly) sp.set('critical', '1');
      if (q.trim())     sp.set('q', q.trim());
      sp.set('limit', '500');
      const res = await fetch(`/api/purchasing/replenishment?${sp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ApiResponse;
      setRows(data.rows ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outages.');
    } finally {
      setLoading(false);
    }
  }, [branch, category, criticalOnly, q]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.category) set.add(r.category);
    return [...set].sort();
  }, [rows]);

  // Per-branch breakdown (only useful in all-branches mode).
  const byBranch = useMemo(() => {
    if (branch) return null;
    const map = new Map<string, { red: number; amber: number; yellow: number; total: number }>();
    for (const r of rows) {
      const e = map.get(r.systemId) ?? { red: 0, amber: 0, yellow: 0, total: 0 };
      e.total++;
      if (r.severity === 'red')    e.red++;
      if (r.severity === 'amber')  e.amber++;
      if (r.severity === 'yellow') e.yellow++;
      map.set(r.systemId, e);
    }
    return [...map.entries()].sort((a, b) => b[1].red - a[1].red || b[1].amber - a[1].amber);
  }, [rows, branch]);

  function exportCsv() {
    const headers = [
      'Branch','Item','Description','Category','Critical','Severity',
      'On Hand','Open Demand','Open Supply','Effective','Usage/Day','Coverage Days',
      'Lead Time','Safety Days','Suggested Qty','UOM','Supplier','Supplier Code',
      'Min Order','Min Order UOM','Pack Qty',
    ];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) => [
      r.systemId, r.itemCode, r.description, r.category ?? '',
      r.isCritical ? 'Y' : '', r.severity,
      r.qtyOnHand, r.openDemandQty, r.openSupplyQty, r.effectiveOnHand,
      r.usagePerDay.toFixed(3), r.coverageDays == null ? '' : r.coverageDays.toFixed(1),
      r.leadTimeDays ?? '', r.safetyStockDays,
      r.suggestedQty, r.stockingUom ?? '',
      r.supplierName ?? '', r.supplierCode ?? '',
      r.minOrderQty ?? '', r.minOrderUom ?? '', r.packQty ?? '',
    ].map(esc).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 text-white">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cyan-400">Potential Outages</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Items at risk of stock-out within lead time + safety stock + 14 days. Sorted by days until zero.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{summary.total}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">At risk</div>
          </div>
          <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{summary.red}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Red · OOS before lead</div>
          </div>
          <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-300">{summary.amber}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Amber · Act now</div>
          </div>
          <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-300">{summary.yellow}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Yellow · Heads up</div>
          </div>
          <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-300 flex items-center justify-center gap-1.5">
              <Star className="w-4 h-4" /> {summary.critical}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Critical items</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </div>
        {isAllBranchUser ? (
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="">All Branches</option>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        ) : (
          <span className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-300">
            {branch || 'No branch'}
          </span>
        )}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
        >
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setCriticalOnly((v) => !v)}
          className={`px-2 py-1.5 text-xs rounded border flex items-center gap-1 ${
            criticalOnly
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
          }`}
        >
          <Star className="w-3 h-3" /> Critical only
        </button>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
            placeholder="Search item code or description…"
            className="w-full pl-8 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Per-branch breakdown (all-branches mode only) */}
      {byBranch && byBranch.length > 0 && !loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">By branch</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {byBranch.map(([sysId, e]) => (
              <button
                key={sysId}
                onClick={() => setBranch(sysId)}
                className="bg-slate-800/60 hover:bg-slate-800 rounded p-2 text-left border border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-cyan-300">{sysId}</span>
                  <span className="text-xs text-slate-500">{e.total} at risk</span>
                </div>
                <div className="flex gap-2 mt-1 text-[11px]">
                  {e.red > 0    && <span className="text-red-400">{e.red} red</span>}
                  {e.amber > 0  && <span className="text-amber-300">{e.amber} amber</span>}
                  {e.yellow > 0 && <span className="text-yellow-300">{e.yellow} yellow</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider text-left">
                <th className="px-3 py-2.5">Sev</th>
                <th className="px-3 py-2.5">Branch</th>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right">On Hand</th>
                <th className="px-3 py-2.5 text-right">Demand</th>
                <th className="px-3 py-2.5 text-right">Supply</th>
                <th className="px-3 py-2.5 text-right">Effective</th>
                <th className="px-3 py-2.5 text-right">Usage/d</th>
                <th className="px-3 py-2.5 text-right">Coverage</th>
                <th className="px-3 py-2.5 text-right">Lead</th>
                <th className="px-3 py-2.5 text-right">Suggest</th>
                <th className="px-3 py-2.5">Supplier</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={13} className="px-3 py-12 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && !error && (
                <tr><td colSpan={13} className="px-3 py-12 text-center text-slate-500">
                  No outage risk in the current scope. ✓
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr
                  key={`${r.systemId}-${r.itemCode}`}
                  className={`border-b border-slate-800/60 hover:bg-slate-800/40 ${
                    r.severity === 'red' ? 'bg-red-950/10' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${severityChip(r.severity)}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-slate-400">{r.systemId}</td>
                  <td className="px-3 py-2 font-mono text-cyan-300 whitespace-nowrap">
                    <Link
                      href={`/scorecard/product/item/${encodeURIComponent(r.itemCode)}?from=purchasing-outages`}
                      className="inline-flex items-center gap-1 hover:text-cyan-200 hover:underline"
                    >
                      {r.itemCode}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </Link>
                    {r.isCritical && (
                      <span title="Critical item" className="ml-1.5 inline-flex">
                        <Star className="w-3 h-3 text-amber-400" />
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-300 max-w-[260px] truncate">{r.description ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{fmtQty(r.qtyOnHand)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {r.openDemandQty > 0 ? <span className="text-red-300">-{fmtQty(r.openDemandQty)}</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {r.openSupplyQty > 0 ? <span className="text-green-400">+{fmtQty(r.openSupplyQty)}</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={r.effectiveOnHand < 0 ? 'text-red-400 font-medium' : 'text-slate-200'}>
                      {fmtQty(r.effectiveOnHand)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400 text-xs">
                    {r.usagePerDay > 0 ? r.usagePerDay.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <span className={r.coverageDays != null && r.coverageDays < 0 ? 'text-red-400 font-medium' : 'text-slate-300'}>
                      {fmtCoverage(r.coverageDays)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-400">
                    {r.leadTimeDays != null ? `${r.leadTimeDays}d` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium">
                    {r.suggestedQty > 0 ? (
                      <span className="text-cyan-300">{fmtQty(r.suggestedQty, r.stockingUom)}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.supplierCode ? (
                      <Link
                        href={`/scorecard/vendor/${encodeURIComponent(r.supplierCode)}?from=purchasing-outages`}
                        className="text-slate-300 hover:text-cyan-300 hover:underline"
                      >
                        {r.supplierName ?? r.supplierCode}
                      </Link>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length > 0 && (
          <div className="px-3 py-2 text-xs text-slate-600 border-t border-slate-800">
            Showing {rows.length} {rows.length === 500 ? '(capped at 500 — narrow filters to see all)' : 'items'}
          </div>
        )}
      </div>
    </div>
  );
}
