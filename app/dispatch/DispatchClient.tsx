'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DeliveryStop } from '../api/dispatch/deliveries/route';

interface DispatchRoute {
  id: number;
  route_date: string;
  route_name: string;
  branch_code: string;
  driver_name: string | null;
  truck_id: string | null;
  status: string | null;
  notes: string | null;
  stop_count: number;
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
}

type Tab = 'board' | 'routes';

const STATUS_FLAG: Record<string, { label: string; color: string }> = {
  K: { label: 'Picking',          color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  P: { label: 'Picked',           color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  S: { label: 'Staged',           color: 'bg-orange-900/60 text-orange-300 border-orange-700' },
  D: { label: 'Out for Delivery', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  I: { label: 'Invoiced',         color: 'bg-green-900/60 text-green-300 border-green-700' },
  C: { label: 'Complete',         color: 'bg-gray-800/80 text-gray-400 border-gray-600' },
};

function statusBadge(flag: string) {
  const s = STATUS_FLAG[flag?.toUpperCase()] ?? { label: flag || '—', color: 'bg-gray-800/80 text-gray-400 border-gray-600' };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.color}`}>
      {s.label}
    </span>
  );
}

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

export default function DispatchClient({ isAdmin, userBranch }: Props) {
  const [tab, setTab] = useState<Tab>('board');
  const today = new Date().toISOString().slice(0, 10);

  // Board state
  const [date, setDate] = useState(today);
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [deliveries, setDeliveries] = useState<DeliveryStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState<'route' | 'status' | 'branch'>('route');

  // Routes state
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ route_name: '', branch_code: userBranch ?? '', driver_name: '', truck_id: '' });
  const [savingRoute, setSavingRoute] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/dispatch/deliveries?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      setDeliveries(await res.json() as DeliveryStop[]);
    } catch {
      setError('Failed to load deliveries.');
    } finally {
      setLoading(false);
    }
  }, [date, branch]);

  const loadRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    try {
      const params = new URLSearchParams({ date });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/dispatch/routes?${params}`);
      if (res.ok) setRoutes(await res.json() as DispatchRoute[]);
    } finally {
      setLoadingRoutes(false);
    }
  }, [date, branch]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);
  useEffect(() => { if (tab === 'routes') loadRoutes(); }, [tab, loadRoutes]);

  async function createRoute() {
    if (!newRoute.route_name.trim() || !newRoute.branch_code.trim()) return;
    setSavingRoute(true);
    try {
      const res = await fetch('/api/dispatch/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRoute, route_date: date }),
      });
      if (res.ok) {
        setShowNewRoute(false);
        setNewRoute({ route_name: '', branch_code: userBranch ?? '', driver_name: '', truck_id: '' });
        loadRoutes();
      }
    } finally {
      setSavingRoute(false);
    }
  }

  // Group deliveries by the selected dimension
  const grouped = deliveries.reduce<Record<string, DeliveryStop[]>>((acc, d) => {
    let key: string;
    if (groupBy === 'route') key = d.route_id_char || '(Unrouted)';
    else if (groupBy === 'status') key = STATUS_FLAG[d.status_flag?.toUpperCase()]?.label ?? d.status_flag || '—';
    else key = d.system_id;
    (acc[key] ??= []).push(d);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === '(Unrouted)') return 1;
    if (b === '(Unrouted)') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <h1 className="text-2xl font-bold text-cyan-400">Dispatch Board</h1>
          <div className="flex gap-1 text-sm">
            {(['board', 'routes'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg capitalize transition ${
                  tab === t ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {t === 'board' ? 'Delivery Board' : 'Routes'}
              </button>
            ))}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          />
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
          {tab === 'board' && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="route">Group by Route/Driver</option>
              <option value="status">Group by Status</option>
              {isAdmin && <option value="branch">Group by Branch</option>}
            </select>
          )}
          <button
            onClick={tab === 'board' ? loadDeliveries : loadRoutes}
            disabled={loading || loadingRoutes}
            className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-300 hover:text-white transition disabled:opacity-50"
          >
            {(loading || loadingRoutes) ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>
        )}

        {/* BOARD TAB */}
        {tab === 'board' && (
          <>
            {/* Summary counts */}
            {deliveries.length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm">
                {Object.entries(
                  deliveries.reduce<Record<string, number>>((acc, d) => {
                    const label = STATUS_FLAG[d.status_flag?.toUpperCase()]?.label ?? d.status_flag ?? '—';
                    acc[label] = (acc[label] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([label, cnt]) => (
                  <span key={label} className="text-gray-400">
                    <span className="font-semibold text-white">{cnt}</span> {label}
                  </span>
                ))}
                <span className="text-gray-600">·</span>
                <span className="text-gray-400">
                  <span className="font-semibold text-cyan-300">{deliveries.length}</span> total
                </span>
              </div>
            )}

            {loading && (
              <div className="text-center py-8 text-sm text-gray-500">Loading deliveries…</div>
            )}

            {!loading && deliveries.length === 0 && !error && (
              <div className="text-center py-8 text-sm text-gray-500">
                No deliveries found for {date}.
              </div>
            )}

            {groupKeys.map((key) => (
              <div key={key} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-700 flex items-center justify-between">
                  <span className="font-semibold text-gray-200">
                    {key}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({grouped[key].length} stop{grouped[key].length !== 1 ? 's' : ''})
                    </span>
                  </span>
                  {/* Staging summary for route */}
                  <div className="flex gap-1.5">
                    {['S', 'D', 'I'].map((flag) => {
                      const cnt = grouped[key].filter((d) => d.status_flag?.toUpperCase() === flag).length;
                      if (!cnt) return null;
                      return <span key={flag}>{statusBadge(flag)} <span className="text-xs text-gray-500 ml-0.5">{cnt}</span></span>;
                    })}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-700">
                      <th className="px-4 py-2 text-left font-medium">SO #</th>
                      <th className="px-4 py-2 text-left font-medium">Customer</th>
                      <th className="px-4 py-2 text-left font-medium">Address</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                      <th className="px-4 py-2 text-left font-medium">Via</th>
                      <th className="px-4 py-2 text-left font-medium">Loaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[key].map((d) => (
                      <tr
                        key={`${d.system_id}|${d.so_id}|${d.shipment_num}`}
                        className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono text-cyan-300 whitespace-nowrap">
                          {d.so_id}
                          {d.shipment_num > 1 && <span className="text-gray-500 text-xs ml-1">#{d.shipment_num}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-200 max-w-[200px]">
                          <div className="truncate">{d.customer_name ?? '—'}</div>
                          {d.reference && <div className="text-xs text-gray-500 truncate">{d.reference}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[180px]">
                          {d.city ?? d.address_1 ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">{statusBadge(d.status_flag)}</td>
                        {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-500">{d.system_id}</td>}
                        <td className="px-4 py-2.5 text-xs text-gray-400">{d.ship_via || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                          {d.loaded_date
                            ? `${new Date(d.loaded_date).toLocaleDateString()}${d.loaded_time ? ' ' + d.loaded_time : ''}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {/* ROUTES TAB */}
        {tab === 'routes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">
                {loadingRoutes ? 'Loading…' : `${routes.length} route${routes.length !== 1 ? 's' : ''} on ${date}`}
              </span>
              {isAdmin && (
                <button
                  onClick={() => setShowNewRoute(true)}
                  className="text-sm px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded text-white transition"
                >
                  + New Route
                </button>
              )}
            </div>

            {/* New route form */}
            {showNewRoute && (
              <div className="bg-gray-900 border border-cyan-700 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-cyan-400">New Route — {date}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Route name *"
                    value={newRoute.route_name}
                    onChange={(e) => setNewRoute((r) => ({ ...r, route_name: e.target.value }))}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
                  />
                  <select
                    value={newRoute.branch_code}
                    onChange={(e) => setNewRoute((r) => ({ ...r, branch_code: e.target.value }))}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
                  >
                    <option value="">Branch *</option>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Driver name"
                    value={newRoute.driver_name}
                    onChange={(e) => setNewRoute((r) => ({ ...r, driver_name: e.target.value }))}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
                  />
                  <input
                    type="text"
                    placeholder="Truck ID"
                    value={newRoute.truck_id}
                    onChange={(e) => setNewRoute((r) => ({ ...r, truck_id: e.target.value }))}
                    className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createRoute}
                    disabled={savingRoute || !newRoute.route_name.trim() || !newRoute.branch_code}
                    className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded transition"
                  >
                    {savingRoute ? 'Saving…' : 'Create Route'}
                  </button>
                  <button
                    onClick={() => setShowNewRoute(false)}
                    className="px-4 py-1.5 text-gray-400 hover:text-white text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {routes.length === 0 && !loadingRoutes ? (
              <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-8 text-center text-sm text-gray-500">
                No planned routes for {date}. Routes created here overlay the ERP delivery board.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {routes.map((r) => (
                  <div key={r.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-gray-200">{r.route_name}</div>
                        <div className="text-xs text-gray-500">{r.branch_code}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded border bg-gray-800 text-gray-400 border-gray-600">
                        {r.status ?? 'planned'}
                      </span>
                    </div>
                    {r.driver_name && (
                      <div className="text-sm text-gray-300">Driver: {r.driver_name}</div>
                    )}
                    {r.truck_id && (
                      <div className="text-xs text-gray-500">Truck: {r.truck_id}</div>
                    )}
                    <div className="text-xs text-gray-500">{r.stop_count} stop{r.stop_count !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
