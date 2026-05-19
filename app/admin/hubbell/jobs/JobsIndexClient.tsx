'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Briefcase, Search } from 'lucide-react';

type Job = {
  cust_code: string | null;
  cust_name: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  primary_so_id: number | null;
  so_count: number;
  so_open_value: string | null;
  doc_count: number;
  hubbell_total: string | null;
};

type ApiResp = { jobs: Job[]; page: number; limit: number; total: number };

export default function JobsIndexClient() {
  const router = useRouter();
  const search = useSearchParams();
  const q = search.get('q') ?? '';
  const page = parseInt(search.get('page') ?? '1', 10);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    fetch(`/api/admin/hubbell/jobs?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [q, page]);

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    if (name !== 'page') params.delete('page');
    router.push(`/admin/hubbell/jobs?${params.toString()}`);
  }

  const fmtMoney = (s: string | null) => (s ? `$${Math.round(parseFloat(s)).toLocaleString()}` : '—');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <Briefcase className="w-5 h-5 text-cyan-400" />
        <h1 className="text-xl font-semibold">Hubbell Jobs</h1>
        <span className="ml-auto text-sm text-slate-400">
          Open HUBB* sales orders, grouped by ship-to address
        </span>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && updateParam('q', searchInput)}
            placeholder="Search customer or address…"
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
          />
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {!loading && data && (
        <>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-center">SOs</th>
                  <th className="px-3 py-2 text-right">Open $</th>
                  <th className="px-3 py-2 text-center">Docs</th>
                  <th className="px-3 py-2 text-right">Hubbell $</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      No open Hubbell jobs found{q ? ` for "${q}"` : ''}.
                    </td>
                  </tr>
                )}
                {data.jobs.map((j) => (
                  <tr
                    key={`${j.cust_code}-${j.shipto_address_1}`}
                    className="border-t border-slate-800 hover:bg-slate-900/50"
                  >
                    <td className="px-3 py-2">
                      <div>{j.cust_name ?? '—'}</div>
                      <div className="text-xs text-slate-500 font-mono">{j.cust_code ?? ''}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {j.shipto_address_1 ?? '—'}
                      {j.shipto_city && (
                        <div className="text-xs text-slate-500">
                          {j.shipto_city}, {j.shipto_state} {j.shipto_zip}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{j.so_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(j.so_open_value)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{j.doc_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(j.hubbell_total)}</td>
                    <td className="px-3 py-2 text-right">
                      {j.primary_so_id !== null && (
                        <Link
                          href={`/admin/hubbell/jobs/${j.primary_so_id}`}
                          className="text-cyan-400 hover:underline text-xs"
                        >
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-slate-500">
              Showing {data.jobs.length} of {data.total} job site{data.total === 1 ? '' : 's'}
            </div>
            <div className="flex gap-2 items-center">
              <button
                disabled={page <= 1}
                onClick={() => updateParam('page', String(page - 1))}
                className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40"
              >
                Prev
              </button>
              <span className="px-3 py-1">
                Page {page} / {Math.max(1, Math.ceil(data.total / data.limit))}
              </span>
              <button
                disabled={page * data.limit >= data.total}
                onClick={() => updateParam('page', String(page + 1))}
                className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
