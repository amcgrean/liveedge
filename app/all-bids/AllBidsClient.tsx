'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import {
  Search,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  Calendar,
  Filter,
  Building2,
  User,
} from 'lucide-react';

interface UnifiedBid {
  id: string;
  source: 'legacy' | 'estimator';
  name: string;
  customer: string | null;
  customerId: number | null;
  estimator: string | null;
  status: string;
  planType: string | null;
  logDate: string | null;
  dueDate: string | null;
  branch: string | null;
  specs: string[];
  href: string;
}

interface Counts { legacy: number; estimator: number; total: number }

const SOURCE_FILTERS = [
  { value: 'all', label: 'All Sources' },
  { value: 'legacy', label: 'Bid Tracker' },
  { value: 'estimator', label: 'Estimator' },
];

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'complete', label: 'Complete' },
  { value: 'all', label: 'All' },
];

// Legacy status badge colors
const LEGACY_STATUS_COLOR: Record<string, string> = {
  Incomplete: 'bg-yellow-900/60 text-yellow-300',
  Complete: 'bg-green-900/60 text-green-300',
  'On Hold': 'bg-gray-700 text-gray-300',
  Cancelled: 'bg-red-900/60 text-red-300',
};

// Estimator bid status badge colors
const EST_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  submitted: 'bg-blue-900/60 text-blue-300',
  won: 'bg-green-900/60 text-green-300',
  lost: 'bg-red-900/60 text-red-300',
  archived: 'bg-gray-800 text-gray-500',
};

function statusBadge(bid: UnifiedBid) {
  const colorMap = bid.source === 'legacy' ? LEGACY_STATUS_COLOR : EST_STATUS_COLOR;
  const color = colorMap[bid.status] ?? 'bg-gray-700 text-gray-300';
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${color}`}>
      {bid.status}
    </span>
  );
}

function sourceBadge(source: 'legacy' | 'estimator') {
  return source === 'legacy'
    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/40 text-amber-400 border border-amber-700/30">Bid Tracker</span>
    : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-900/40 text-cyan-400 border border-cyan-700/30">Estimator</span>;
}

interface Props { session: Session; }

export default function AllBidsClient({ session }: Props) {
  const [bids, setBids] = useState<UnifiedBid[]>([]);
  const [counts, setCounts] = useState<Counts>({ legacy: 0, estimator: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');

  const fetchBids = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ source: sourceFilter, status: statusFilter });
    if (search) params.set('q', search);
    try {
      const res = await fetch(`/api/all-bids?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBids(data.bids ?? []);
        setCounts(data.counts ?? { legacy: 0, estimator: 0, total: 0 });
      }
    } catch { /* DB may not be configured */ }
    finally { setLoading(false); }
  }, [search, sourceFilter, statusFilter]);

  useEffect(() => { fetchBids(); }, [fetchBids]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(fetchBids, 350);
    return () => clearTimeout(t);
  }, [search, fetchBids]);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={(session.user as { role?: string }).role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">All Bids</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Unified view — Bid Tracker ({counts.legacy}) + Estimator ({counts.estimator})
            </p>
          </div>
          <button onClick={fetchBids} className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-gray-500 mr-1" />
            {SOURCE_FILTERS.map((f) => (
              <button key={f.value} onClick={() => setSourceFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  sourceFilter === f.value
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === f.value
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs">
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Name / Plan</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Estimator</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Logged</th>
                <th className="px-4 py-3 text-left font-medium">Due</th>
                <th className="px-4 py-3 text-left font-medium">Specs</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : bids.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <FolderOpen className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No bids found</p>
                  </td>
                </tr>
              ) : bids.map((bid) => (
                <tr key={bid.id} className="border-b border-gray-800/50 hover:bg-gray-800/40">
                  <td className="px-4 py-3">{sourceBadge(bid.source)}</td>
                  <td className="px-4 py-3">
                    <Link href={bid.href} className="text-white hover:text-cyan-400 font-medium">
                      {bid.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      {bid.customerId ? (
                        <Link href={`/customers/${bid.customerId}/bids`} className="hover:text-cyan-400 transition-colors">
                          {bid.customer ?? '—'}
                        </Link>
                      ) : (bid.customer ?? '—')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      {bid.estimator ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{bid.planType ?? '—'}</td>
                  <td className="px-4 py-3">{statusBadge(bid)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(bid.logDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(bid.dueDate)}</td>
                  <td className="px-4 py-3">
                    {bid.specs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {bid.specs.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400">{s}</span>
                        ))}
                      </div>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={bid.href} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white inline-flex">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          {counts.total} bid{counts.total !== 1 ? 's' : ''} shown
          {counts.total > 0 && ` (${counts.legacy} legacy, ${counts.estimator} estimator)`}
          <span className="ml-4">
            <Link href="/legacy-bids" className="text-gray-500 hover:text-cyan-400">Bid Tracker →</Link>
            <span className="mx-2">·</span>
            <Link href="/bids" className="text-gray-500 hover:text-cyan-400">Estimator bids →</Link>
          </span>
        </div>
      </main>
    </div>
  );
}
