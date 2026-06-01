'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw, Search, Star, Download, ExternalLink, Filter,
  ChevronDown, ChevronRight, AlertTriangle, Truck,
} from 'lucide-react';
import { TopNav } from '../../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { ReplenishmentRow, Severity } from '@/lib/purchasing/replenishment';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

interface Summary {
  total: number; red: number; amber: number; yellow: number; critical: number; totalSuggestedQty: number;
}

interface ApiResponse {
  rows: ReplenishmentRow[];
  summary: Summary;
}

function severityChip(s: Severity) {
  if (s === 'red')    return 'bg-red-500/20 text-red-300 border border-red-500/40';
  if (s === 'amber')  return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
  if (s === 'yellow') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
  return 'bg-slate-700 text-slate-400 border border-slate-600';
}

function fmtQty(v: number | null | undefined, uom?: string | null) {
  if (v == null) return '—';
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Number(v.toFixed(2)).toLocaleString();
  return uom ? `${s} ${uom}` : s;
}

function fmtCoverage(d: number | null) {
  if (d == null) return '∞';
  if (d < 0)     return `OOS · ${Math.round(Math.abs(d))}d back`;
  if (d < 1)     return '<1d';
  return `${Math.round(d)}d`;
}

export default function SuggestedBuysClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();

  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [category, setCategory] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [q, setQ] = useState('');

  const [rows, setRows] = useState<ReplenishmentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      sp.set('view', 'suggested');
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
      setError(err instanceof Error ? err.message : 'Failed to load suggested buys.');
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

  // Group by supplier + ship-from so a buyer can assemble one PO per destination.
  //
  // LMC1000 resells many manufacturers (Top Notch hardware, Novo millwork, Banner
  // hardware, Linc Systems fasteners, Simpson Strong-Tie, ...) and each is a
  // SEPARATE PO destination with its own ship-from seq in agility_suppliers.
  // Keying on r.supplierCode alone collapses them — the bug the purchasing
  // manager flagged at the 2026-06-01 review prep: 177 items rolled up under one
  // "Top Notch Distributors - LMC" label, but they actually spanned ~5 ship-froms.
  // The supplierName is already the ship-from name (engine SELECTs
  // COALESCE(s.ship_from_name, s.supplier_name)), so once we split the buckets
  // each one shows its real ship-from label automatically.
  //
  // Items without a supplier collapse into a single "Unassigned" bucket.
  const grouped = useMemo(() => {
    const map = new Map<string, { supplierCode: string | null; shipFromSeq: number | null; supplierName: string; rows: ReplenishmentRow[]; red: number; amber: number }>();
    for (const r of rows) {
      const key = r.supplierCode ? `${r.supplierCode}::${r.shipFromSeq ?? 0}` : '__none__';
      const name = r.supplierName ?? (r.supplierCode ?? 'Unassigned');
      let entry = map.get(key);
      if (!entry) {
        entry = { supplierCode: r.supplierCode, shipFromSeq: r.shipFromSeq, supplierName: name, rows: [], red: 0, amber: 0 };
        map.set(key, entry);
      }
      entry.rows.push(r);
      if (r.severity === 'red')   entry.red++;
      if (r.severity === 'amber') entry.amber++;
    }
    return [...map.values()].sort((a, b) => b.red - a.red || b.amber - a.amber || b.rows.length - a.rows.length);
  }, [rows]);

  function exportCsv() {
    const headers = [
      'Branch','Item','Description','Category','Critical','Severity',
      'On Hand','Open Demand','Open Supply','Effective','Usage/Day','Coverage Days',
      'Lead Time','Suggested Qty','UOM','Supplier','Supplier Code',
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
      r.leadTimeDays ?? '', r.suggestedQty, r.stockingUom ?? '',
      r.supplierName ?? '', r.supplierCode ?? '',
      r.minOrderQty ?? '', r.minOrderUom ?? '', r.packQty ?? '',
    ].map(esc).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suggested-buys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <TopNav userName={userName} userRole={userRole} />
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-cyan-400">Suggested Buys</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Items where coverage falls inside lead time + safety stock. Grouped by supplier so you can build one PO per vendor.
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
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">To buy</div>
              </div>
              <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{summary.red}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Red · before lead</div>
              </div>
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-300">{summary.amber}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Amber · act now</div>
              </div>
              <div className="bg-slate-900 border border-cyan-500/40 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-cyan-300 flex items-center justify-center gap-1.5">
                  <Truck className="w-4 h-4" /> {grouped.length}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Suppliers</div>
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
            {isAdmin ? (
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

          {loading && (
            <div className="text-center py-12 text-sm text-slate-500">Loading…</div>
          )}

          {!loading && rows.length === 0 && !error && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-12 text-center text-sm text-slate-500">
              No items need ordering in the current scope. ✓
            </div>
          )}

          {/* Supplier groups */}
          {!loading && grouped.map((group) => {
            const key = group.supplierCode ? `${group.supplierCode}::${group.shipFromSeq ?? 0}` : '__none__';
            const expanded = expandedSupplier === key;
            const totalSuggested = group.rows.reduce((s, r) => s + r.suggestedQty, 0);
            return (
              <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedSupplier(expanded ? null : key)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    <Truck className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold text-slate-100">{group.supplierName}</span>
                    {group.supplierCode && (
                      <span className="text-xs text-slate-500 font-mono">{group.supplierCode}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {group.red > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                        {group.red} red
                      </span>
                    )}
                    {group.amber > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {group.amber} amber
                      </span>
                    )}
                    <span className="text-slate-500">{group.rows.length} item{group.rows.length === 1 ? '' : 's'}</span>
                    <span className="text-cyan-300 font-medium">{fmtQty(totalSuggested)} total qty</span>
                  </div>
                </button>

                {expanded && (
                  <div className="overflow-x-auto border-t border-slate-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 uppercase tracking-wider text-left bg-slate-950/50">
                          <th className="px-3 py-2">Sev</th>
                          <th className="px-3 py-2">Branch</th>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2 text-right">On Hand</th>
                          <th className="px-3 py-2 text-right">Effective</th>
                          <th className="px-3 py-2 text-right">Usage/d</th>
                          <th className="px-3 py-2 text-right">Coverage</th>
                          <th className="px-3 py-2 text-right">Lead</th>
                          <th className="px-3 py-2 text-right">Min</th>
                          <th className="px-3 py-2 text-right">Suggest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((r) => (
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
                                href={`/scorecard/product/item/${encodeURIComponent(r.itemCode)}?from=purchasing-suggested-buys`}
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
                            <td className="px-3 py-2 text-right text-xs">
                              {r.minOrderQty != null && r.minOrderQty > 0 ? (
                                <span className={r.minOrderViolation === 'Block' ? 'text-amber-300' : 'text-slate-400'}>
                                  {fmtQty(r.minOrderQty, r.minOrderUom)}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium">
                              {r.suggestedQty > 0 ? (
                                <span className="text-cyan-300">{fmtQty(r.suggestedQty, r.stockingUom)}</span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {!loading && rows.length >= 500 && (
            <div className="text-xs text-slate-600 text-center">
              Showing 500 items (capped) — narrow filters to see more.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
