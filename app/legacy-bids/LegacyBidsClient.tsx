'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import {
  Search,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface BidRow {
  id: number;
  planType: string;
  projectName: string;
  status: string;
  logDate: string | null;
  dueDate: string | null;
  completionDate: string | null;
  includeFraming: boolean | null;
  includeSiding: boolean | null;
  includeShingle: boolean | null;
  includeDeck: boolean | null;
  includeTrim: boolean | null;
  includeWindow: boolean | null;
  includeDoor: boolean | null;
  notes: string | null;
  customerName: string | null;
  customerCode: string | null;
  estimatorName: string | null;
}

const STATUS_FILTERS = [
  { value: '', label: 'Open (Incomplete)' },
  { value: 'all', label: 'All' },
  { value: 'Incomplete', label: 'Incomplete' },
  { value: 'Complete', label: 'Complete' },
];

const PLAN_TYPE_FILTERS = [
  { value: '', label: 'All Types' },
  { value: 'Residential', label: 'Residential' },
  { value: 'Commercial', label: 'Commercial' },
];

interface Props {
  session: Session;
  embedded?: boolean;
}

export default function LegacyBidsClient({ session, embedded = false }: Props) {
  usePageTracking();
  const [bids, setBids] = useState<BidRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planTypeFilter, setPlanTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchBids = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    if (planTypeFilter) params.set('planType', planTypeFilter);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));

    try {
      const res = await fetch(`/api/legacy-bids?${params}`);
      const data = await res.json();
      setBids(data.bids ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch bids:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planTypeFilter, sortBy, sortDir, page]);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const specBadges = (bid: BidRow) => {
    const specs = [];
    if (bid.includeFraming) specs.push('Framing');
    if (bid.includeSiding) specs.push('Siding');
    if (bid.includeShingle) specs.push('Shingles');
    if (bid.includeDeck) specs.push('Deck');
    if (bid.includeTrim) specs.push('Trim');
    if (bid.includeWindow) specs.push('Windows');
    if (bid.includeDoor) specs.push('Doors');
    return specs;
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : '—';

  const totalPages = Math.ceil(total / limit);

  const body = (
    <>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          {!embedded && <h1 className="text-2xl font-bold">Bids</h1>}
          {embedded && <div />}
          <Link
            href="/legacy-bids/add"
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Bid
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search bids..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="bg-gray-900 border border-gray-700 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <select
            value={planTypeFilter}
            onChange={(e) => {
              setPlanTypeFilter(e.target.value);
              setPage(0);
            }}
            className="bg-gray-900 border border-gray-700 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            {PLAN_TYPE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <button
            onClick={fetchBids}
            className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <SortHeader label="Project" col="project_name" current={sortBy} dir={sortDir} onClick={toggleSort} />
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Estimator</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <SortHeader label="Logged" col="log_date" current={sortBy} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="Due" col="due_date" current={sortBy} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="Status" col="status" current={sortBy} dir={sortDir} onClick={toggleSort} />
                <th className="px-4 py-3 text-left font-medium">Specs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : bids.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No bids found
                  </td>
                </tr>
              ) : (
                bids.map((bid) => (
                  <tr
                    key={bid.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/legacy-bids/${bid.id}`}
                        className="text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        {bid.projectName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {bid.customerName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {bid.estimatorName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          bid.planType === 'Commercial'
                            ? 'bg-blue-900/50 text-blue-300'
                            : 'bg-green-900/50 text-green-300'
                        }`}
                      >
                        {bid.planType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {formatDate(bid.logDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {formatDate(bid.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={bid.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {specBadges(bid).map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of{' '}
              {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-gray-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-gray-800 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
    </>
  );

  if (embedded) return body;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{body}</main>
    </div>
  );
}

function SortHeader({
  label,
  col,
  current,
  dir,
  onClick,
}: {
  label: string;
  col: string;
  current: string;
  dir: string;
  onClick: (col: string) => void;
}) {
  return (
    <th className="px-4 py-3 text-left font-medium">
      <button
        onClick={() => onClick(col)}
        className="flex items-center gap-1 hover:text-gray-200 transition-colors"
      >
        {label}
        <ArrowUpDown
          className={`w-3 h-3 ${current === col ? 'text-cyan-400' : 'text-gray-600'}`}
        />
        {current === col && (
          <span className="text-[10px] text-cyan-400">
            {dir === 'asc' ? '\u2191' : '\u2193'}
          </span>
        )}
      </button>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Incomplete: 'bg-amber-900/50 text-amber-300',
    Complete: 'bg-green-900/50 text-green-300',
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${colors[status] ?? 'bg-gray-800 text-gray-400'}`}
    >
      {status}
    </span>
  );
}
