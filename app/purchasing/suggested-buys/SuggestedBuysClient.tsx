'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TopNav } from '../../../src/components/nav/TopNav';
import { ChevronDown, ChevronRight, RefreshCw, Search, AlertTriangle, ExternalLink, Download, Ban } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

interface SuggestedBuy {
  ppo_id: string;
  system_id: string;
  supplier_code: string;
  supplier_name: string | null;
  order_date: string | null;
  expect_date: string | null;
  ppo_status: string | null;
  line_count: number;
  total_qty: number | null;
  estimated_value: number | null;
  max_lead_time_days: number | null;
  has_blocking_min_violation: boolean;
  has_primary_mismatch: boolean;
}

interface SuggestedLine {
  id: number;
  sequence: number;
  item_code: string | null;
  description: string | null;
  qty_to_order: number | null;
  unit_cost: number | null;
  stocking_uom: string | null;
  qty_on_hand: number | null;
  default_location: string | null;
  /** Tier-1 lead time (days) for the suggested-PO supplier × this item. */
  lead_time_days: number | null;
  min_order_qty: number | null;
  min_order_qty_uom: string | null;
  /** 'Allow' | 'Allow - Question' | 'Block' | null */
  min_order_violation: string | null;
  supplier_uom: string | null;
  /** Supplier flagged is_primary for this item (may differ from suggested supplier). */
  supplier_code_primary: string | null;
  supplier_name_primary: string | null;
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

function statusColor(status: string | null) {
  const s = (status ?? '').toUpperCase();
  if (s === 'OPEN') return 'bg-green-900/60 text-green-300 border-green-700';
  if (s === 'APPROVED') return 'bg-cyan-900/60 text-cyan-300 border-cyan-700';
  if (s === 'CONVERTED') return 'bg-gray-800 text-gray-500 border-gray-700';
  return 'bg-gray-800 text-gray-400 border-gray-600';
}

export default function SuggestedBuysClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedBuy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<SuggestedLine[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [onlyBlock, setOnlyBlock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (branch) params.set('branch', branch);
      if (q) params.set('q', q);
      const res = await fetch(`/api/purchasing/suggested-buys?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { suggestions: SuggestedBuy[] };
      setSuggestions(data.suggestions);
    } catch {
      setError('Failed to load suggested buys.');
    } finally {
      setLoading(false);
    }
  }, [branch, q]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (ppoId: string, systemId: string) => {
    if (expandedId === ppoId) { setExpandedId(null); return; }
    setExpandedId(ppoId);
    setLoadingDetail(true);
    setDetailLines([]);
    try {
      const params = new URLSearchParams({ branch: systemId });
      const res = await fetch(`/api/purchasing/suggested-buys/${ppoId}?${params}`);
      if (res.ok) {
        const data = await res.json() as { lines: SuggestedLine[] };
        setDetailLines(data.lines);
      }
    } finally { setLoadingDetail(false); }
  };

  // Apply rollup-flag filters before grouping
  const filtered = suggestions.filter((s) => {
    if (onlyMismatch && !s.has_primary_mismatch) return false;
    if (onlyBlock && !s.has_blocking_min_violation) return false;
    return true;
  });

  // Group by supplier
  const grouped = filtered.reduce<Record<string, SuggestedBuy[]>>((acc, s) => {
    const key = s.supplier_name || s.supplier_code;
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  const flagCounts = {
    mismatch: suggestions.filter((s) => s.has_primary_mismatch).length,
    block:    suggestions.filter((s) => s.has_blocking_min_violation).length,
  };

  function exportCsv() {
    const headers = [
      'PPO #', 'Branch', 'Supplier Code', 'Supplier Name', 'Status',
      'Expected', 'Lines', 'Total Qty', 'Estimated $', 'Max Lead (days)',
      'Has Block Violation', 'Has Primary Mismatch',
    ];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = filtered.map((s) => [
      s.ppo_id, s.system_id, s.supplier_code, s.supplier_name ?? '',
      s.ppo_status ?? '',
      s.expect_date ?? '', s.line_count, s.total_qty ?? '',
      s.estimated_value != null ? Number(s.estimated_value).toFixed(2) : '',
      s.max_lead_time_days ?? '',
      s.has_blocking_min_violation ? 'Y' : '',
      s.has_primary_mismatch ? 'Y' : '',
    ].map(escape).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suggested-buys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // The supplier_code of the currently-expanded PPO — used to flag lines
  // where the item's primary supplier differs from the suggested supplier.
  const expandedSupplierCode = suggestions.find((s) => s.ppo_id === expandedId)?.supplier_code ?? null;

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Suggested Buys</h1>
            <p className="text-sm text-gray-500 mt-0.5">Suggested purchase orders from ERP</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {isAdmin && (
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
              >
                <option value="">All Branches</option>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title="Export visible rows as CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button onClick={load} disabled={loading} className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter chips for the per-PPO rollup flags */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-gray-500 mr-1">Filters:</span>
            <button
              onClick={() => setOnlyMismatch((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                onlyMismatch
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500'
              }`}
              title="Show only PPOs where at least one item's primary supplier differs from the suggested supplier"
            >
              <AlertTriangle className="w-3 h-3" />
              Primary mismatch
              <span className="text-gray-500">({flagCounts.mismatch})</span>
            </button>
            <button
              onClick={() => setOnlyBlock((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                onlyBlock
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500'
              }`}
              title="Show only PPOs with at least one Block-level min-order violation"
            >
              <Ban className="w-3 h-3" />
              Block violation
              <span className="text-gray-500">({flagCounts.block})</span>
            </button>
            {(onlyMismatch || onlyBlock) && (
              <button
                onClick={() => { setOnlyMismatch(false); setOnlyBlock(false); }}
                className="text-gray-500 hover:text-gray-300 underline"
              >
                Clear
              </button>
            )}
            <span className="text-gray-600 ml-auto">
              {filtered.length} of {suggestions.length} shown
            </span>
          </div>
        )}

        {/* KPI strip */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-gray-400"><span className="text-white font-bold">{suggestions.length}</span> suggested POs</span>
            <span className="text-gray-400"><span className="text-white font-bold">{Object.keys(grouped).length}</span> suppliers</span>
            <span className="text-gray-400"><span className="text-white font-bold">
              {suggestions.reduce((s, r) => s + (r.line_count ?? 0), 0)}
            </span> lines</span>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search by PPO#, supplier name or code…"
            className="w-full pl-9 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>
        )}

        {loading && <div className="text-center py-8 text-sm text-gray-500">Loading…</div>}

        {!loading && suggestions.length === 0 && !error && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-8 text-center text-sm text-gray-500">
            No suggested buys found.
          </div>
        )}

        {/* Grouped by supplier */}
        {Object.entries(grouped).map(([supplier, items]) => (
          <div key={supplier} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-700 flex items-center justify-between">
              <span className="font-semibold text-gray-200">{supplier}</span>
              <span className="text-xs text-gray-500">{items.length} suggested PO{items.length !== 1 ? 's' : ''}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-700">
                  <th className="px-4 py-2 text-left font-medium w-8"></th>
                  <th className="px-4 py-2 text-left font-medium">PPO #</th>
                  {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Expected</th>
                  <th className="px-4 py-2 text-left font-medium">Lines</th>
                  <th className="px-4 py-2 text-right font-medium">Total Qty</th>
                  <th className="px-4 py-2 text-right font-medium" title="Max tier-1 lead time across lines (days)">Lead</th>
                  <th className="px-4 py-2 text-right font-medium" title="Sum of qty × cost across lines (rough estimate)">Est $</th>
                  <th className="px-4 py-2 text-left font-medium" title="Per-PPO warning chips: primary-supplier mismatch and/or Block min-order violation">Flags</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <>
                  <tr
                    key={s.ppo_id}
                    onClick={() => toggleExpand(s.ppo_id, s.system_id)}
                    className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2.5 text-gray-500">
                      {expandedId === s.ppo_id
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-cyan-300">{s.ppo_id}</td>
                    {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-500">{s.system_id}</td>}
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusColor(s.ppo_status)}`}>
                        {s.ppo_status || 'OPEN'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {s.expect_date ? new Date(s.expect_date + 'T00:00:00').toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{s.line_count}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 text-right">
                      {s.total_qty != null ? Number(s.total_qty).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 text-right">
                      {s.max_lead_time_days != null
                        ? <>{s.max_lead_time_days}<span className="text-gray-600">d</span></>
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-300 text-right">
                      {s.estimated_value != null && Number(s.estimated_value) > 0
                        ? `$${Number(s.estimated_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {s.has_primary_mismatch && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-medium"
                            title="At least one line's primary supplier differs from the suggested supplier"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Mismatch
                          </span>
                        )}
                        {s.has_blocking_min_violation && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-medium"
                            title="At least one line has a Block-level min-order violation"
                          >
                            <Ban className="w-3 h-3" />
                            Block
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === s.ppo_id && (
                    <tr key={`${s.ppo_id}-detail`} className="border-b border-gray-800 bg-gray-800/30">
                      <td colSpan={isAdmin ? 10 : 9} className="px-4 py-3">
                        {loadingDetail ? (
                          <div className="text-xs text-gray-500">Loading lines…</div>
                        ) : detailLines.length === 0 ? (
                          <div className="text-xs text-gray-500">No lines.</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-700">
                                <th className="pb-1 text-left font-medium">Item</th>
                                <th className="pb-1 text-left font-medium">Description</th>
                                <th className="pb-1 text-right font-medium">Qty to Order</th>
                                <th className="pb-1 text-right font-medium">Unit Cost</th>
                                <th className="pb-1 text-right font-medium">On Hand</th>
                                <th className="pb-1 text-left font-medium">Location</th>
                                <th className="pb-1 text-right font-medium" title="Tier-1 lead time (days) for this item × suggested supplier">Lead</th>
                                <th className="pb-1 text-right font-medium" title="Min order qty — amber when violation = Block">Min Ord</th>
                                <th className="pb-1 text-left font-medium" title="Supplier-side unit of measure">Supp UOM</th>
                                <th className="pb-1 text-left font-medium" title="Primary supplier per agility_item_supplier — chip shows when it differs from the suggested supplier">Primary</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailLines.map((l) => {
                                const mismatch =
                                  !!l.supplier_code_primary &&
                                  !!expandedSupplierCode &&
                                  l.supplier_code_primary !== expandedSupplierCode;
                                return (
                                <tr key={l.id} className="border-b border-gray-700/50">
                                  <td className="py-1 pr-3 font-mono text-cyan-300">
                                    {l.item_code ? (
                                      <Link
                                        href={`/scorecard/product/item/${encodeURIComponent(l.item_code)}?from=purchasing-suggested-buys`}
                                        className="inline-flex items-center gap-1 hover:text-cyan-200 hover:underline"
                                      >
                                        {l.item_code}
                                        <ExternalLink className="w-3 h-3 opacity-60" />
                                      </Link>
                                    ) : '—'}
                                  </td>
                                  <td className="py-1 pr-3 text-gray-300 max-w-[220px] truncate">{l.description || '—'}</td>
                                  <td className="py-1 pr-3 text-right text-gray-200 font-medium">
                                    {l.qty_to_order != null ? Number(l.qty_to_order).toLocaleString() : '—'}
                                    {l.stocking_uom ? <span className="text-gray-500 ml-1">{l.stocking_uom}</span> : ''}
                                  </td>
                                  <td className="py-1 pr-3 text-right text-gray-400">
                                    {l.unit_cost != null ? `$${Number(l.unit_cost).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="py-1 pr-3 text-right text-gray-400">
                                    {l.qty_on_hand != null ? Number(l.qty_on_hand).toLocaleString() : '—'}
                                  </td>
                                  <td className="py-1 pr-3 text-gray-500">{l.default_location || '—'}</td>
                                  <td className="py-1 pr-3 text-right text-gray-300">
                                    {l.lead_time_days != null
                                      ? <>{l.lead_time_days}<span className="text-gray-500">d</span></>
                                      : <span className="text-gray-600">—</span>}
                                  </td>
                                  <td className="py-1 pr-3 text-right">
                                    {l.min_order_qty && l.min_order_qty > 0 ? (
                                      <span
                                        className={
                                          l.min_order_violation === 'Block'
                                            ? 'inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium'
                                            : 'inline-flex items-baseline gap-1 text-gray-300'
                                        }
                                        title={l.min_order_violation ? `Violation rule: ${l.min_order_violation}` : undefined}
                                      >
                                        {l.min_order_qty}
                                        {l.min_order_qty_uom && (
                                          <span className="text-gray-500">{l.min_order_qty_uom}</span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-gray-600">—</span>
                                    )}
                                  </td>
                                  <td className="py-1 pr-3 text-gray-400">{l.supplier_uom || '—'}</td>
                                  <td className="py-1 text-gray-500">
                                    {mismatch ? (
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium"
                                        title={`Primary supplier is ${l.supplier_name_primary ?? l.supplier_code_primary} — differs from suggested ${expandedSupplierCode}`}
                                      >
                                        <AlertTriangle className="w-3 h-3" />
                                        {l.supplier_code_primary}
                                      </span>
                                    ) : l.supplier_code_primary ? (
                                      <span className="text-gray-500">{l.supplier_code_primary}</span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      </div>
    </div>
    </>
  );
}
