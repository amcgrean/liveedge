'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TopNav } from '../../../src/components/nav/TopNav';
import type { DeliveryRecord } from '../../api/delivery/tracker/route';
import { usePageTracking } from '@/hooks/usePageTracking';

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

const BRANCHES = ['', '10FD', '20GR', '25BW', '40CV'];

const STATUS_COLOR: Record<string, string> = {
  'PICKING':           'bg-yellow-900/60 text-yellow-300',
  'STAGED':            'bg-purple-900/60 text-purple-300',
  'STAGED - EN ROUTE': 'bg-indigo-900/60 text-indigo-300',
  'STAGED - LOADED':   'bg-blue-900/60 text-blue-300',
  'STAGED - DELIVERED':'bg-green-900/60 text-green-300',
  'INVOICED':          'bg-cyan-900/60 text-cyan-300',
  'PARTIAL':           'bg-orange-900/60 text-orange-300',
};

export default function SalesDeliveriesClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]       = useState(today);
  const [branch, setBranch]   = useState(isAdmin ? '' : (userBranch ?? ''));
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ date });
      if (branch) p.set('branch', branch);
      const res = await fetch(`/api/delivery/tracker?${p}`);
      if (res.ok) {
        const d = await res.json() as { records: DeliveryRecord[] };
        setRecords(d.records ?? []);
      }
    } finally { setLoading(false); }
  }, [date, branch]);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = q
    ? records.filter((r) =>
        (r.so_number ?? '').includes(q) ||
        (r.customer_name ?? '').toLowerCase().includes(q) ||
        (r.reference ?? '').toLowerCase().includes(q)
      )
    : records;

  // KPIs
  const enRoute   = filtered.filter((r) => r.status_label?.includes('EN ROUTE')).length;
  const delivered = filtered.filter((r) => r.status_label?.includes('DELIVERED') || r.status_label === 'INVOICED').length;
  const pending   = filtered.filter((r) => r.status_label === 'PICKING' || r.status_label === 'STAGED' || r.status_label === 'PARTIAL').length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <TopNav userName={userName} userRole={userRole} />
      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Sales Deliveries</h1>
            <p className="text-sm text-gray-400 mt-0.5">Today's delivery status — sales view</p>
          </div>
          <Link href="/sales" className="text-sm text-cyan-400 hover:underline">← Sales Hub</Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
          />
          {isAdmin && (
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">All Branches</option>
              {BRANCHES.filter(Boolean).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <input
            type="search"
            placeholder="Search SO, customer, ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 w-64"
          />
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm rounded text-gray-300 transition disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'En Route',  value: enRoute,   color: 'text-indigo-400' },
            { label: 'Delivered', value: delivered, color: 'text-green-400' },
            { label: 'Pending',   value: pending,   color: 'text-yellow-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">
              {loading ? 'Loading…' : `${filtered.length} deliveries`}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No deliveries found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs uppercase text-gray-500">
                    <th className="px-4 py-2 text-left">SO #</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Reference</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Route / Driver</th>
                    <th className="px-4 py-2 text-left">Ship Via</th>
                    <th className="px-4 py-2 text-left">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const sc = STATUS_COLOR[r.status_label ?? ''] ?? 'bg-gray-800 text-gray-400';
                    return (
                      <tr key={`${r.so_number}-${r.system_id}`} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-2">
                          <Link href={`/sales/orders/${r.so_number}`} className="font-mono text-cyan-400 hover:underline">
                            {r.so_number}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-gray-200 max-w-[200px] truncate">
                          {r.customer_name ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-400 max-w-[160px] truncate">{r.reference ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${sc}`}>{r.status_label ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">
                          {r.route ?? r.driver ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{r.ship_via ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{r.system_id ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
