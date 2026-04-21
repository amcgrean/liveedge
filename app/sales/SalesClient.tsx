'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import type { SalesOrder } from '../api/sales/orders/route';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useBranchFilter } from '@/hooks/useBranchFilter';

interface Metrics {
  open_orders_count: number;
  total_orders_today: number;
  status_breakdown: { so_status: string; cnt: number }[];
  top_customers: { cust_name: string | null; order_count: number }[];
  period_days: number;
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

type Tab = 'hub' | 'orders';

const SO_STATUS: Record<string, { label: string; color: string }> = {
  O: { label: 'Open',      color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  K: { label: 'Picking',   color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  S: { label: 'Staged',    color: 'bg-orange-900/60 text-orange-300 border-orange-700' },
  D: { label: 'Delivered', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  I: { label: 'Invoiced',  color: 'bg-green-900/60 text-green-300 border-green-700' },
  C: { label: 'Closed',    color: 'bg-gray-800/80 text-gray-400 border-gray-600' },
  P: { label: 'Picked',    color: 'bg-indigo-900/60 text-indigo-300 border-indigo-700' },
};

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];
const PERIODS = [7, 30, 90];

export default function SalesClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const [tab, setTab] = useState<Tab>('hub');
  const [branch, setBranch] = useBranchFilter(isAdmin, userBranch);
  const [period, setPeriod] = useState(30);

  // Hub metrics
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Orders tab
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('O');
  const [saleTypeFilter, setSaleTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 100;

  const loadMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const params = new URLSearchParams({ period: String(period) });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/sales/metrics?${params}`);
      if (res.ok) setMetrics(await res.json() as Metrics);
    } finally {
      setLoadingMetrics(false);
    }
  }, [branch, period]);

  const loadOrders = useCallback(async (pg = 1) => {
    setLoadingOrders(true);
    setOrdersError('');
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), page: String(pg) });
      if (branch) params.set('branch', branch);
      if (statusFilter) params.set('status', statusFilter);
      if (q) params.set('q', q);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (saleTypeFilter) params.set('sale_type', saleTypeFilter);
      const res = await fetch(`/api/sales/orders?${params}`);
      if (!res.ok) throw new Error('Failed to load orders');
      const data = await res.json() as { orders: SalesOrder[]; page: number; limit: number };
      setOrders(pg === 1 ? data.orders : (prev) => [...prev, ...data.orders]);
      setHasMore(data.orders.length === LIMIT);
      setPage(pg);
    } catch {
      setOrdersError('Failed to load orders.');
    } finally {
      setLoadingOrders(false);
    }
  }, [branch, statusFilter, q, dateFrom, dateTo, saleTypeFilter]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);
  useEffect(() => { if (tab === 'orders') { setPage(1); loadOrders(1); } }, [tab, loadOrders]);

  function statusBadge(status: string) {
    const s = SO_STATUS[status?.toUpperCase()] ?? { label: status || '—', color: 'bg-gray-800/80 text-gray-400 border-gray-600' };
    return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span>;
  }

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Sales Hub</h1>
            {userName && <p className="text-sm text-gray-500 mt-0.5">Welcome, {userName}</p>}
          </div>
          <div className="flex gap-1 text-sm">
            {(['hub', 'orders'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg capitalize transition ${
                  tab === t ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {t === 'hub' ? 'Dashboard' : 'Order Status'}
              </button>
            ))}
          </div>
        </div>

        {/* Branch + period filters */}
        <div className="flex flex-wrap gap-2">
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
          {tab === 'hub' && (
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${
                    period === p ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {p}d
                </button>
              ))}
            </div>
          )}
        </div>

        {/* HUB TAB */}
        {tab === 'hub' && (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <div className="text-xs text-gray-500 font-semibold tracking-widest mb-1">OPEN ORDERS</div>
                <div className="text-3xl font-bold text-cyan-300">
                  {loadingMetrics ? '…' : (metrics?.open_orders_count ?? '—')}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <div className="text-xs text-gray-500 font-semibold tracking-widest mb-1">DUE TODAY</div>
                <div className="text-3xl font-bold text-yellow-400">
                  {loadingMetrics ? '…' : (metrics?.total_orders_today ?? '—')}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 col-span-2">
                <div className="text-xs text-gray-500 font-semibold tracking-widest mb-2">STATUS BREAKDOWN ({period}d)</div>
                {metrics?.status_breakdown.length ? (
                  <div className="flex flex-wrap gap-2">
                    {metrics.status_breakdown.map((s) => (
                      <button
                        key={s.so_status}
                        onClick={() => { setStatusFilter(s.so_status); setTab('orders'); }}
                        className="flex items-center gap-1.5 hover:opacity-80 transition"
                      >
                        {statusBadge(s.so_status)}
                        <span className="text-xs text-gray-300 font-semibold">{s.cnt}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">{loadingMetrics ? 'Loading…' : 'No data'}</div>
                )}
              </div>
            </div>

            {/* Top customers */}
            {metrics?.top_customers.length ? (
              <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-gray-300">
                  Top Customers — last {period} days
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {metrics.top_customers.map((c, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/40">
                        <td className="px-4 py-2.5 text-xs text-gray-500 w-8">{i + 1}</td>
                        <td className="px-4 py-2.5 text-gray-200">{c.cust_name ?? 'Unknown'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-cyan-300 font-semibold">{c.order_count}</span>
                          <span className="text-gray-500 text-xs ml-1">orders</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}

        {/* ORDERS TAB */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {/* Search + filters */}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadOrders(1)}
                placeholder="Search SO#, customer, reference…"
                className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
              >
                <option value="">All Statuses</option>
                {Object.entries(SO_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                placeholder="From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                placeholder="To"
              />
              <button
                onClick={() => loadOrders(1)}
                disabled={loadingOrders}
                className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm rounded transition"
              >
                {loadingOrders ? 'Loading…' : 'Search'}
              </button>
            </div>

            {ordersError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{ordersError}</div>
            )}

            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-700 text-sm text-gray-400">
                {loadingOrders && orders.length === 0
                  ? 'Loading…'
                  : `${orders.length} order${orders.length !== 1 ? 's' : ''}${hasMore ? '+' : ''}`
                }
              </div>

              {orders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-700">
                        <th className="px-4 py-2 text-left font-medium">SO #</th>
                        <th className="px-4 py-2 text-left font-medium">Customer</th>
                        <th className="px-4 py-2 text-left font-medium">Reference</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                        <th className="px-4 py-2 text-left font-medium">Salesperson</th>
                        <th className="px-4 py-2 text-left font-medium">Expect</th>
                        <th className="px-4 py-2 text-right font-medium">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={`${o.system_id}|${o.so_number}`} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-cyan-300 whitespace-nowrap">
                            <Link href={`/sales/orders/${o.so_number}`} className="hover:underline">
                              {o.so_number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-gray-200 max-w-[200px]">
                            {o.customer_code ? (
                              <Link href={`/sales/customers/${o.customer_code}`} className="truncate block hover:text-cyan-400 transition-colors">
                                {o.customer_name ?? '—'}
                              </Link>
                            ) : (
                              <div className="truncate">{o.customer_name ?? '—'}</div>
                            )}
                            {o.city && <div className="text-xs text-gray-500 truncate">{o.city}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[160px] truncate">{o.reference || '—'}</td>
                          <td className="px-4 py-2.5">{statusBadge(o.so_status)}</td>
                          {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-500">{o.system_id}</td>}
                          <td className="px-4 py-2.5 text-xs text-gray-400">{o.rep_1 || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                            {o.expect_date ? new Date(o.expect_date).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-300">{o.line_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loadingOrders && orders.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No orders found.</div>
              )}

              {hasMore && (
                <div className="px-4 py-3 border-t border-gray-700">
                  <button
                    onClick={() => loadOrders(page + 1)}
                    disabled={loadingOrders}
                    className="w-full text-sm text-gray-400 hover:text-white transition disabled:opacity-50"
                  >
                    {loadingOrders ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
