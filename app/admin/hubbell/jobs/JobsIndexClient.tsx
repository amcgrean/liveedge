'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Package, Wrench, RefreshCw, Inbox, ChevronRight } from 'lucide-react';

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

function fmtAmount(v: string | null | undefined): string {
  const n = parseFloat(v ?? '');
  if (!n || isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function JobsIndexClient() {
  const [jobs, setJobs]       = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/hubbell/jobs');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobs(data.jobs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const COL_COUNT = 6;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Hubbell Jobs</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            One row per job site — click an SO to reconcile its emails.
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Job Site</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">POs</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">WOs</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Total</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">AR Balance</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: COL_COUNT }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-12 text-center text-slate-500">
                  No confirmed jobs yet. Confirm emails in the{' '}
                  <Link href="/admin/hubbell" className="text-cyan-400 hover:text-cyan-300">inbox</Link> to see them here.
                </td>
              </tr>
            ) : (
              jobs.map((job, i) => {
                const arBal = parseFloat(job.ar_balance ?? '');
                return (
                  <tr key={i} className="align-top">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{job.cust_name ?? '—'}</p>
                      {job.shipto_address_1 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-xs text-slate-400">
                            {[job.shipto_address_1, job.shipto_city, job.shipto_state].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                      {/* SO chips — one per sales order at this site */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {job.so_ids.map((soId) => (
                          <Link
                            key={soId}
                            href={`/admin/hubbell/jobs/${soId}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 hover:bg-cyan-900/40 hover:text-cyan-300 transition"
                          >
                            #{soId}
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Package className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-blue-300 font-medium">{job.po_count}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-purple-300 font-medium">{job.wo_count}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-green-300 font-medium">
                      {fmtAmount(job.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      {!arBal || isNaN(arBal)
                        ? <span className="text-slate-500">—</span>
                        : <span className={arBal < 0 ? 'text-red-400' : 'text-amber-300'}>{fmtAmount(job.ar_balance)}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {fmtDate(job.last_received)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
