'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Package, Wrench, RefreshCw, Inbox, ChevronLeft, ChevronRight, Search } from 'lucide-react';

type JobRow = {
  cust_code: string | null;
  cust_name: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  ar_balance: string | null;
  so_ids: string[];
  po_count: string;
  wo_count: string;
  total_amount: string;
  last_received: string;
};

const PAGE_SIZE = 50;

function fmtAmount(v: string | null | undefined): string {
  const n = parseFloat(v ?? '');
  if (!n || isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function JobsIndexClient() {
  const router = useRouter();
  const [jobs, setJobs]           = useState<JobRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [page, setPage]           = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/hubbell/jobs');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobs(data.jobs);
      setPage(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      (j.cust_name ?? '').toLowerCase().includes(q) ||
      (j.cust_code ?? '').toLowerCase().includes(q) ||
      (j.shipto_address_1 ?? '').toLowerCase().includes(q) ||
      (j.shipto_city ?? '').toLowerCase().includes(q) ||
      (j.shipto_zip ?? '').includes(q) ||
      j.so_ids.some((id) => id.includes(q))
    );
  }, [jobs, search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const COL_COUNT  = 7;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Hubbell Jobs</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            One row per job site — click a row to view orders and emails.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/admin/hubbell"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
          >
            <Inbox className="w-4 h-4" />
            Email Inbox
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search customer, address, city, SO#…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm transition"
          >
            Clear
          </button>
        )}
      </form>

      {!loading && search && (
        <p className="text-xs text-slate-500">{filtered.length} of {jobs.length} jobs</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/60">
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Address</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">City / State</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">POs</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">WOs</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Total</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: COL_COUNT }).map((_, j) => (
                    <td key={j} className="px-3 py-2"><div className="h-3 bg-slate-800 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-slate-500">
                  {search
                    ? 'No jobs match your search.'
                    : <>No confirmed jobs yet. Confirm emails in the{' '}
                        <Link href="/admin/hubbell" className="text-cyan-400 hover:text-cyan-300">inbox</Link> to see them here.
                      </>
                  }
                </td>
              </tr>
            ) : (
              paginated.map((job, i) => {
                const href = `/admin/hubbell/jobs/${job.so_ids[0]}`;
                const cityState = [job.shipto_city, job.shipto_state].filter(Boolean).join(', ');
                return (
                  <tr
                    key={i}
                    onClick={() => router.push(href)}
                    className="cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <p className="text-white font-medium leading-tight">{job.cust_name ?? '—'}</p>
                      {job.cust_code && (
                        <p className="text-xs text-slate-500 mt-0.5">{job.cust_code.toUpperCase()}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {job.shipto_address_1
                        ? <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{job.shipto_address_1}</span>
                          </div>
                        : <span className="text-slate-500">—</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                      {cityState || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Package className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-blue-300 font-medium">{job.po_count}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-purple-300 font-medium">{job.wo_count}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm text-green-300 font-medium">
                      {fmtAmount(job.total_amount)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
                      {fmtDate(job.last_received)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{filtered.length} job{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
