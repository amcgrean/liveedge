'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, FileText } from 'lucide-react';

interface AuditEntry {
  id: number;
  userId: number;
  modelName: string;
  action: string;
  timestamp: string;
  changes: string | null;
  username: string | null;
}

const MODEL_FILTER_OPTIONS = ['', 'Bid', 'Design', 'EWP', 'Project', 'User', 'Customer'];

export default function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (search) params.set('q', search);
    if (modelFilter) params.set('modelName', modelFilter);
    try {
      const res = await fetch(`/api/admin/audit?${params}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, modelFilter, page]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const totalPages = Math.ceil(total / limit);
  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" /> Audit Log
        </h2>
        <button onClick={fetchEntries} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" placeholder="Search actions..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
        </div>
        <select value={modelFilter} onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
          <option value="">All Models</option>
          {MODEL_FILTER_OPTIONS.filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No audit entries found</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th>Time</th><th>User</th><th>Model</th><th>Action</th><th>Changes</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="text-slate-400 text-xs whitespace-nowrap">{formatDate(e.timestamp)}</td>
                  <td className="text-white text-sm">{e.username ?? `User #${e.userId}`}</td>
                  <td><span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{e.modelName}</span></td>
                  <td className="text-slate-300 text-sm">{e.action}</td>
                  <td className="text-slate-500 text-xs max-w-[300px] truncate">{e.changes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
          <span>{page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-slate-800 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-slate-800 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
