'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import { Search, RefreshCw, Plus, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface ITIssue {
  id: number;
  issueType: string;
  createdby: string;
  description: string;
  status: string;
  updatedby: string | null;
  updatedDate: string | null;
  notes: string | null;
  createdDate: string | null;
}

const ISSUE_TYPES = ['Hardware', 'Software', 'Network', 'Account', 'Other'];

interface Props { session: Session; autoReport?: boolean; fromPage?: string; }

export default function ITIssuesClient({ session, autoReport = false, fromPage = '' }: Props) {
  usePageTracking();
  const [issues, setIssues] = useState<ITIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(autoReport);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ issueType: 'Software', description: '', notes: '', sourcePage: fromPage });
  const limit = 50;

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/it-issues?${params}`);
      const data = await res.json();
      setIssues(data.issues ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const handleCreate = async () => {
    if (!form.description.trim()) { setFormError('Description is required'); return; }
    setSaving(true); setFormError('');
    try {
      const res = await fetch('/api/it-issues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { setFormError((await res.json()).error ?? 'Failed'); return; }
      setShowForm(false); setForm({ issueType: 'Software', description: '', notes: '', sourcePage: '' });
      fetchIssues();
    } finally { setSaving(false); }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';
  const totalPages = Math.ceil(total / limit);

  const statusColor = (s: string) => {
    if (s === 'Open') return 'bg-yellow-900/40 text-yellow-400 border-yellow-700';
    if (s === 'In Progress') return 'bg-blue-900/40 text-blue-400 border-blue-700';
    if (s === 'Resolved' || s === 'Closed') return 'bg-green-900/40 text-green-400 border-green-700';
    return 'bg-slate-800 text-slate-400';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">IT Issues</h1>
          <button onClick={() => { setFormError(''); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Report Issue
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search issues..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500">
            <option value="">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
          <button onClick={fetchIssues} className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">Created By</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : issues.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No issues found</td></tr>
              ) : issues.map((i) => (
                <tr key={i.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/it-issues/${i.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-xs">#{i.id}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{i.issueType}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[300px] truncate">{i.description}</td>
                  <td className="px-4 py-3 text-gray-300">{i.createdby}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(i.createdDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded border ${statusColor(i.status)}`}>{i.status}</span>
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
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="font-bold text-white">Report IT Issue</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Issue Type *</label>
                <select value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500">
                  {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500 resize-y" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Additional Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500 resize-y" />
              </div>
              {form.sourcePage && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <span className="text-gray-600">Reporting from:</span>
                  <span className="font-mono text-gray-400">{form.sourcePage}</span>
                </p>
              )}
              {formError && <p className="text-sm text-red-400">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={handleCreate} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
