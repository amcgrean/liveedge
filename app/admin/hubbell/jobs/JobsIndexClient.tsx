'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Package, Wrench, RefreshCw, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [jobs, setJobs]       = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [page, setPage]       = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const paginated  = jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const COL_COUNT  = 6;

  return (
    <div className="space-y-4 max-w-5xl">
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

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/60">
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Job Site</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">POs</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">WOs</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">AR Balance</th>
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
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-slate-500">
                  No confirmed jobs yet. Confirm emails in the{' '}
                  <Link href="/admin/hubbell" className="text-cyan-400 hover:text-cyan-300">inbox</Link> to see them here.
                </td>
              </tr>
            ) : (
              paginated.map((job, i) => {
                const arBal  = parseFloat(job.ar_balance ?? '');
                const href   = `/admin/hubbell/jobs/${job.so_ids[0]}`;
                return (
                  <tr
                    key={i}
                    onClick={() => router.push(href)}
                    className="cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <p className="text-white font-medium leading-tight">{job.cust_name ?? '—'}</p>
                      {job.shipto_address_1 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-400">
                            {[job.shipto_address_1, job.shipto_city, job.shipto_state].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
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
                    <td className="px-3 py-2 text-right font-mono text-sm">
                      {!arBal || isNaN(arBal)
                        ? <span className="text-slate-500">—</span>
                        : <span className={arBal < 0 ? 'text-red-400' : 'text-amber-300'}>{fmtAmount(job.ar_balance)}</span>
                      }
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
      {!loading && jobs.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{jobs.length} total jobs</span>
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
