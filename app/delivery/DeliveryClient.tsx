'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TopNav } from '../../src/components/nav/TopNav';
import type { DeliveryRecord } from '../api/delivery/tracker/route';

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

interface Vehicle {
  id: string;
  name: string;
  branch_code: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  address: string | null;
  time: string | null;
}

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

const STATUS_COLORS: Record<string, string> = {
  'PICKING':              'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  'PARTIAL':              'bg-orange-900/60 text-orange-300 border-orange-700',
  'STAGED':               'bg-purple-900/60 text-purple-300 border-purple-700',
  'STAGED - EN ROUTE':    'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  'STAGED - LOADED':      'bg-blue-900/60 text-blue-300 border-blue-700',
  'STAGED - DELIVERED':   'bg-green-900/60 text-green-300 border-green-700',
  'INVOICED':             'bg-cyan-900/60 text-cyan-300 border-cyan-700',
};

function statusBadge(label: string) {
  const cls = STATUS_COLORS[label] ?? 'bg-gray-800/80 text-gray-400 border-gray-600';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls} whitespace-nowrap`}>
      {label}
    </span>
  );
}

export default function DeliveryClient({ isAdmin, userBranch, userName, userRole }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/delivery/tracker?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { deliveries: DeliveryRecord[] };
      setDeliveries(data.deliveries);
    } catch {
      setError('Failed to load deliveries.');
    } finally {
      setLoading(false);
    }
  }, [date, branch]);

  const loadVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    try {
      const params = new URLSearchParams();
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/dispatch/vehicles?${params}`);
      if (res.ok) {
        const data = await res.json() as { vehicles: Vehicle[] };
        setVehicles(data.vehicles ?? []);
      }
    } finally {
      setLoadingVehicles(false);
    }
  }, [branch]);

  useEffect(() => { loadDeliveries(); }, [loadDeliveries]);
  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  // Auto-refresh every 60s (only when tab is visible)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') { loadDeliveries(); loadVehicles(); }
    }, 60_000);
    return () => clearInterval(timer);
  }, [loadDeliveries, loadVehicles]);

  const filtered = useMemo(() => deliveries.filter((d) => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      d.so_number.toLowerCase().includes(ql) ||
      d.customer_name.toLowerCase().includes(ql) ||
      (d.reference ?? '').toLowerCase().includes(ql) ||
      (d.city ?? '').toLowerCase().includes(ql)
    );
  }), [deliveries, q]);

  // KPI counts by status label
  const statusCounts = useMemo(() => deliveries.reduce<Record<string, number>>((acc, d) => {
    acc[d.status_label] = (acc[d.status_label] ?? 0) + 1;
    return acc;
  }, {}), [deliveries]);

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Delivery Tracker</h1>
            {userName && <p className="text-sm text-gray-500 mt-0.5">Welcome, {userName}</p>}
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
            />
            <button
              onClick={() => { loadDeliveries(); loadVehicles(); }}
              disabled={loading}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm rounded transition"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* KPI chips */}
        {deliveries.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500 font-semibold mr-1">{deliveries.length} total</span>
            {Object.entries(statusCounts).map(([label, cnt]) => (
              <button
                key={label}
                onClick={() => setQ(label === q ? '' : label)}
                className="flex items-center gap-1 hover:opacity-80 transition"
              >
                {statusBadge(label)}
                <span className="text-xs text-gray-300 font-semibold">{cnt}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>
        )}

        {/* Search */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by SO#, customer, city, reference…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />

        {/* Delivery table */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-700 text-sm text-gray-400">
            {loading && deliveries.length === 0 ? 'Loading…' : `${filtered.length} deliveries`}
          </div>
          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-700">
                    <th className="px-4 py-2 text-left font-medium">SO #</th>
                    <th className="px-4 py-2 text-left font-medium">Customer</th>
                    <th className="px-4 py-2 text-left font-medium">Reference</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Route</th>
                    <th className="px-4 py-2 text-left font-medium">Ship Via</th>
                    <th className="px-4 py-2 text-left font-medium">Driver</th>
                    <th className="px-4 py-2 text-left font-medium">Expect</th>
                    {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={`${d.system_id}|${d.so_number}`} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-cyan-300 whitespace-nowrap">{d.so_number}</td>
                      <td className="px-4 py-2.5 text-gray-200 max-w-[200px]">
                        <div className="truncate">{d.customer_name}</div>
                        {d.city && <div className="text-xs text-gray-500 truncate">{d.city}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[140px] truncate">{d.reference || '—'}</td>
                      <td className="px-4 py-2.5">{statusBadge(d.status_label)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{d.route || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{d.ship_via || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{d.driver || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        {d.expect_date ? new Date(d.expect_date).toLocaleDateString() : '—'}
                      </td>
                      {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-500">{d.system_id}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">No deliveries found.</div>
          )}
        </div>

        {/* Fleet GPS */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-gray-300">
            Fleet Status {loadingVehicles && <span className="text-gray-500 font-normal">— updating…</span>}
          </div>
          {vehicles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-700">
                    <th className="px-4 py-2 text-left font-medium">Vehicle</th>
                    {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                    <th className="px-4 py-2 text-left font-medium">Speed</th>
                    <th className="px-4 py-2 text-left font-medium">Location</th>
                    <th className="px-4 py-2 text-left font-medium">Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 text-gray-200 font-medium">{v.name}</td>
                      {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-500">{v.branch_code ?? '—'}</td>}
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {v.speed != null ? `${Math.round(v.speed)} mph` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[280px] truncate">{v.address ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {v.time ? new Date(v.time).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              {loadingVehicles ? 'Loading vehicles…' : 'No vehicle data available.'}
            </div>
          )}
        </div>

      </div>
    </div>
    </>
  );
}
