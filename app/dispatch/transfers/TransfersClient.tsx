'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowRightLeft, RefreshCw, AlertCircle, Package, Inbox,
  ChevronRight, Building2, Calendar, Hash,
} from 'lucide-react';
import type { TransferSO, TransferPO } from '../../api/dispatch/transfers/route';

const BRANCHES = [
  { code: '', label: 'All Branches' },
  { code: '10FD', label: 'Fort Dodge' },
  { code: '20GR', label: 'Grimes' },
  { code: '25BW', label: 'Birchwood' },
  { code: '40CV', label: 'Coralville' },
];

const BRANCH_LABEL: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

function branchLabel(code: string | null | undefined) {
  if (!code) return '—';
  return BRANCH_LABEL[code.trim().toUpperCase()] ?? code;
}

function soStatusBadge(status: string | null) {
  const s = status?.trim().toUpperCase() ?? '';
  const map: Record<string, string> = {
    O: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
    P: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
    K: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    S: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  };
  const label: Record<string, string> = {
    O: 'Open', P: 'In Pick', K: 'Picked', S: 'Shipped',
  };
  const cls = map[s] ?? 'bg-slate-700/50 text-slate-400 border border-slate-600';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label[s] ?? status ?? '—'}
    </span>
  );
}

function poStatusBadge(status: string | null) {
  const s = status?.trim().toUpperCase() ?? '';
  const map: Record<string, string> = {
    O: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
    OPEN: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
    PARTIAL: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
    P: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
  };
  const cls = map[s] ?? 'bg-slate-700/50 text-slate-400 border border-slate-600';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status ?? '—'}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${m}/${day}/${y}`;
}

function isOverdue(d: string | null) {
  if (!d) return false;
  return d.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
}

export default function TransfersClient({ isAdmin, userBranch }: Props) {
  const [branch, setBranch] = useState(userBranch ?? '');
  const [outbound, setOutbound] = useState<TransferSO[]>([]);
  const [inbound, setInbound] = useState<TransferPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async (b: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (b) params.set('branch', b);
      const res = await fetch(`/api/dispatch/transfers?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { outbound: TransferSO[]; inbound: TransferPO[] };
      setOutbound(data.outbound);
      setInbound(data.inbound);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(branch); }, [branch, load]);

  const overdueSOs = outbound.filter((r) => isOverdue(r.expect_date));
  const overduePOs = inbound.filter((r) => isOverdue(r.expect_date));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">Branch Transfers</h1>
              <p className="text-xs text-slate-400">
                Inter-branch transfer SOs to fill · Inbound transfer POs to receive
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>{b.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => load(branch)}
              disabled={loading}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded px-3 py-1.5 disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {lastRefresh && (
          <p className="text-xs text-slate-500 mt-1">
            Updated {lastRefresh.toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-8 max-w-7xl mx-auto">
        {error && (
          <div className="flex items-center gap-2 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'SOs to Fill', value: outbound.length, icon: Package, color: 'text-cyan-400' },
            { label: 'Overdue SOs', value: overdueSOs.length, icon: AlertCircle, color: overdueSOs.length > 0 ? 'text-red-400' : 'text-slate-500' },
            { label: 'Inbound POs', value: inbound.length, icon: Inbox, color: 'text-cyan-400' },
            { label: 'Overdue POs', value: overduePOs.length, icon: AlertCircle, color: overduePOs.length > 0 ? 'text-red-400' : 'text-slate-500' },
          ].map((k) => (
            <div key={k.label} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 flex items-center gap-3">
              <k.icon className={`w-5 h-5 shrink-0 ${k.color}`} />
              <div>
                <p className="text-2xl font-semibold text-white">{loading ? '—' : k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Outbound: SOs to fill ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Transfer SOs to Fill
            </h2>
            <span className="text-xs text-slate-500">
              — SOs this branch must pick &amp; ship to another branch
            </span>
            {!loading && (
              <span className="ml-auto text-xs text-slate-500">{outbound.length} orders</span>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-slate-500 text-sm">Loading…</div>
            ) : outbound.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No open transfer SOs{branch ? ` for ${branchLabel(branch)}` : ''}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">SO #</th>
                      {!branch && <th className="text-left px-4 py-2.5">From Branch</th>}
                      <th className="text-left px-4 py-2.5">Destination</th>
                      <th className="text-left px-4 py-2.5">Need By</th>
                      <th className="text-left px-4 py-2.5">Status</th>
                      <th className="text-left px-4 py-2.5">Lines</th>
                      <th className="text-left px-4 py-2.5">Reference</th>
                      <th className="text-left px-4 py-2.5">Ship Via</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {outbound.map((so) => {
                      const overdue = isOverdue(so.expect_date);
                      return (
                        <tr
                          key={so.so_id}
                          className={`hover:bg-slate-800/40 transition ${overdue ? 'bg-red-950/10' : ''}`}
                        >
                          <td className="px-4 py-3 font-mono text-cyan-400 font-medium whitespace-nowrap">
                            {so.so_id}
                          </td>
                          {!branch && (
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                {branchLabel(so.system_id)}
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-slate-200">
                              {/* cust_name is the destination branch's account name */}
                              {so.dest_cust_name || so.dest_cust_code || '—'}
                            </div>
                            {so.dest_cust_code && so.dest_cust_name && (
                              <div className="text-xs text-slate-500">{so.dest_cust_code}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`flex items-center gap-1.5 ${overdue ? 'text-red-400' : 'text-slate-300'}`}>
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              {formatDate(so.expect_date)}
                              {overdue && (
                                <span className="text-xs bg-red-900/30 text-red-400 border border-red-700/30 rounded px-1">
                                  Overdue
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">{soStatusBadge(so.so_status)}</td>
                          <td className="px-4 py-3 text-slate-300 text-center">
                            <div className="flex items-center gap-1">
                              <Hash className="w-3 h-3 text-slate-500" />
                              {so.line_count}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                            {so.reference || so.po_number || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {so.ship_via || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={`/sales/orders/${so.so_id}`}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 transition"
                            >
                              View <ChevronRight className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Inbound: POs to receive via transfer ─────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Inbox className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Inbound Transfer POs
            </h2>
            <span className="text-xs text-slate-500">
              — POs this branch is waiting to receive from another branch
            </span>
            {!loading && (
              <span className="ml-auto text-xs text-slate-500">{inbound.length} POs</span>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-slate-500 text-sm">Loading…</div>
            ) : inbound.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No open inbound transfer POs{branch ? ` for ${branchLabel(branch)}` : ''}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">PO #</th>
                      {!branch && <th className="text-left px-4 py-2.5">Receiving Branch</th>}
                      <th className="text-left px-4 py-2.5">Sending Branch</th>
                      <th className="text-left px-4 py-2.5">Expected</th>
                      <th className="text-left px-4 py-2.5">Ordered</th>
                      <th className="text-left px-4 py-2.5">Status</th>
                      <th className="text-left px-4 py-2.5">Lines</th>
                      <th className="text-left px-4 py-2.5">Receipts</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {inbound.map((po) => {
                      const overdue = isOverdue(po.expect_date);
                      const hasReceipts = po.receipt_count > 0;
                      return (
                        <tr
                          key={`${po.system_id}-${po.po_number}`}
                          className={`hover:bg-slate-800/40 transition ${overdue ? 'bg-red-950/10' : ''}`}
                        >
                          <td className="px-4 py-3 font-mono text-cyan-400 font-medium whitespace-nowrap">
                            {po.po_number}
                          </td>
                          {!branch && (
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                {branchLabel(po.system_id)}
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-slate-200">
                                {po.supplier_name || branchLabel(po.supplier_code)}
                              </span>
                            </div>
                            {po.supplier_code && (
                              <div className="text-xs text-slate-500 pl-5">{po.supplier_code}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className={`flex items-center gap-1.5 ${overdue ? 'text-red-400' : 'text-slate-300'}`}>
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              {formatDate(po.expect_date)}
                              {overdue && (
                                <span className="text-xs bg-red-900/30 text-red-400 border border-red-700/30 rounded px-1">
                                  Overdue
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {formatDate(po.order_date)}
                          </td>
                          <td className="px-4 py-3">{poStatusBadge(po.po_status)}</td>
                          <td className="px-4 py-3 text-slate-300">
                            <div className="flex items-center gap-1">
                              <Hash className="w-3 h-3 text-slate-500" />
                              {po.line_count}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${hasReceipts ? 'text-green-400' : 'text-slate-500'}`}>
                              {po.receipt_count} receipt{po.receipt_count !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={`/purchasing/pos/${po.po_number}`}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 transition"
                            >
                              View <ChevronRight className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
