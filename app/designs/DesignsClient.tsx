'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import { Search, RefreshCw, Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface DesignRow {
  id: number;
  planNumber: string;
  planName: string;
  projectAddress: string;
  contractor: string | null;
  status: string;
  logDate: string | null;
  preliminarySetDate: string | null;
  squareFootage: number | null;
  customerName: string | null;
  designerName: string | null;
}

const STATUS_FILTERS = [
  { value: '', label: 'Active' },
  { value: 'all', label: 'All' },
  { value: 'Active', label: 'Active' },
  { value: 'Complete', label: 'Complete' },
  { value: 'On Hold', label: 'On Hold' },
];

interface Props { session: Session; }

export default function DesignsClient({ session }: Props) {
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);

    try {
      const res = await fetch(`/api/designs?${params}`);
      const data = await res.json();
      setDesigns(data.designs ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Designs</h1>
          <Link href="/designs/add" className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> New Design
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search designs..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-gray-500" />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="bg-gray-900 border border-gray-700 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-cyan-500">
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <button onClick={fetchDesigns} className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left font-medium">Plan #</th>
                <th className="px-4 py-3 text-left font-medium">Plan Name</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Designer</th>
                <th className="px-4 py-3 text-left font-medium">Address</th>
                <th className="px-4 py-3 text-left font-medium">SF</th>
                <th className="px-4 py-3 text-left font-medium">Logged</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : designs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No designs found</td></tr>
              ) : designs.map((d) => (
                <tr key={d.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/designs/${d.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-xs">{d.planNumber}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/designs/${d.id}`} className="text-cyan-400 hover:text-cyan-300 font-medium">{d.planName}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{d.customerName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{d.designerName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{d.projectAddress}</td>
                  <td className="px-4 py-3 text-gray-400">{d.squareFootage ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(d.logDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${d.status === 'Active' ? 'bg-green-900/50 text-green-300' : d.status === 'Complete' ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>{page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
