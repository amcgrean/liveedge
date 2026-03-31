'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, X, Check, Bell, List } from 'lucide-react';

interface NotificationRule {
  id: number;
  eventType: string;
  recipientType: string;
  recipientId: number | null;
  recipientName: string | null;
  branchId: number | null;
  bidType: string | null;
  createdAt: string | null;
  branchName: string | null;
}

interface LogEntry {
  id: number;
  bidId: number | null;
  eventType: string;
  recipients: string | null;
  matchedRules: string | null;
  status: string;
  errorMessage: string | null;
  timestamp: string | null;
}

const EVENT_TYPES = ['bid_created', 'bid_completed', 'bid_updated', 'design_created', 'design_updated', 'ewp_created'];
const RECIPIENT_TYPES = ['email', 'user', 'branch_all'];

export default function NotificationsClient() {
  const [tab, setTab] = useState<'rules' | 'logs'>('rules');
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ eventType: 'bid_created', recipientType: 'email', recipientName: '', bidType: '' });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications');
      if (res.ok) setRules((await res.json()).rules ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/logs');
      if (res.ok) setLogs((await res.json()).logs ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'rules') fetchRules(); else fetchLogs(); }, [tab, fetchRules, fetchLogs]);

  const handleCreate = async () => {
    if (!form.recipientName.trim()) { setFormError('Recipient is required'); return; }
    setSaving(true); setFormError('');
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { setFormError((await res.json()).error ?? 'Failed'); return; }
      setShowForm(false);
      fetchRules();
    } finally { setSaving(false); }
  };

  const handleDelete = async (r: NotificationRule) => {
    if (!confirm('Delete this notification rule?')) return;
    await fetch(`/api/admin/notifications/${r.id}`, { method: 'DELETE' });
    fetchRules();
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : '—';

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-cyan-400" /> Notifications
        </h2>
        <div className="flex gap-3">
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            <button onClick={() => setTab('rules')}
              className={`px-3 py-1 text-sm rounded-md transition ${tab === 'rules' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              Rules
            </button>
            <button onClick={() => setTab('logs')}
              className={`px-3 py-1 text-sm rounded-md transition ${tab === 'logs' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              Logs
            </button>
          </div>
          {tab === 'rules' && (
            <button onClick={() => { setForm({ eventType: 'bid_created', recipientType: 'email', recipientName: '', bidType: '' }); setFormError(''); setShowForm(true); }}
              className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Rule</button>
          )}
        </div>
      </div>

      {tab === 'rules' && (
        <div className="admin-card">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
          ) : rules.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No notification rules defined</div>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Event</th><th>Type</th><th>Recipient</th><th>Branch</th><th>Bid Type</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td><span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{r.eventType}</span></td>
                    <td className="text-slate-400 text-sm">{r.recipientType}</td>
                    <td className="text-white text-sm">{r.recipientName ?? '—'}</td>
                    <td className="text-slate-400 text-sm">{r.branchName ?? 'All'}</td>
                    <td className="text-slate-400 text-sm">{r.bidType ?? 'Any'}</td>
                    <td><button onClick={() => handleDelete(r)} className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="admin-card">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <List className="w-8 h-8" /> No notification logs yet
            </div>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Time</th><th>Event</th><th>Recipients</th><th>Status</th><th>Error</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="text-slate-400 text-xs">{formatDate(l.timestamp)}</td>
                    <td><span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{l.eventType}</span></td>
                    <td className="text-white text-sm">{l.recipients ?? '—'}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        l.status === 'sent' ? 'bg-green-900/40 text-green-400' :
                        l.status === 'failed' ? 'bg-red-900/40 text-red-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>{l.status}</span>
                    </td>
                    <td className="text-red-400 text-xs max-w-[200px] truncate">{l.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">Add Notification Rule</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Event Type *</label>
                <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
                  {EVENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Recipient Type *</label>
                <select value={form.recipientType} onChange={(e) => setForm({ ...form, recipientType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
                  {RECIPIENT_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Recipient (email or name) *</label>
                <input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Bid Type Filter (optional)</label>
                <input value={form.bidType} onChange={(e) => setForm({ ...form, bidType: e.target.value })} placeholder="e.g. Residential"
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
