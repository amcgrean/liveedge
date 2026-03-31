'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../../src/components/nav/TopNav';
import {
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface BidRow {
  id: number;
  planType: string;
  projectName: string;
  status: string;
  logDate: string | null;
  dueDate: string | null;
  completionDate: string | null;
  customerName: string | null;
  estimatorName: string | null;
}

interface Props {
  session: Session;
}

export default function CompletedBidsClient({ session }: Props) {
  const [bids, setBids] = useState<BidRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchBids = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      status: 'Complete',
      limit: String(limit),
      offset: String(page * limit),
      sortBy: 'due_date',
      sortDir: 'desc',
    });
    if (search) params.set('q', search);

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
  }, [search, page]);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : '—';

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/legacy-bids" className="p-2 rounded-lg hover:bg-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Completed Bids</h1>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search completed bids..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={fetchBids}
            className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Estimator</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Logged</th>
                <th className="px-4 py-3 text-left font-medium">Completed</th>
                <th className="px-4 py-3 text-left font-medium">Days</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : bids.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No completed bids found
                  </td>
                </tr>
              ) : (
                bids.map((bid) => {
                  const days =
                    bid.logDate && bid.completionDate
                      ? Math.round(
                          (new Date(bid.completionDate).getTime() -
                            new Date(bid.logDate).getTime()) /
                            86400000
                        )
                      : null;
                  return (
                    <tr
                      key={bid.id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/legacy-bids/${bid.id}`}
                          className="text-cyan-400 hover:text-cyan-300"
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
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded ${
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
                        {formatDate(bid.completionDate)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {days !== null ? `${days}d` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>
              {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
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
                {page + 1} / {totalPages}
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
      </main>
    </div>
  );
}
