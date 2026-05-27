'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X, Check, Send, Edit3, Truck } from 'lucide-react';

interface Recipient {
  id:           string;
  branchCode:   string;
  name:         string;
  email:        string | null;
  phoneE164:    string | null;
  notifyEmail:  boolean;
  notifySms:    boolean;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

interface LogRow {
  id:                 string;
  routeId:            number;
  branchCode:         string;
  driverName:         string | null;
  routeName:          string | null;
  completedSoNumber:  string | null;
  completedAt:        string;
  recipientId:        string | null;
  recipientLabel:     string | null;
  channel:            'email' | 'sms';
  status:             'sent' | 'failed' | 'skipped_console';
  error:              string | null;
  providerMessageId:  string | null;
  sentAt:             string;
}

const BRANCH_CODES = ['10FD', '20GR', '25BW', '40CV'] as const;

const emptyForm = {
  branchCode:  '20GR',
  name:        '',
  email:       '',
  phoneE164:   '',
  notifyEmail: true,
  notifySms:   false,
  isActive:    true,
};

export default function DispatchAlertsClient() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recentLog, setRecentLog]   = useState<LogRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<Recipient | null>(null);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [form, setForm]             = useState({ ...emptyForm });
  const [testingId, setTestingId]   = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string>('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dispatch-alerts');
      if (res.ok) {
        const json = await res.json();
        setRecipients(json.recipients ?? []);
        setRecentLog(json.recentLog ?? []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (r: Recipient) => {
    setEditing(r);
    setForm({
      branchCode:  r.branchCode,
      name:        r.name,
      email:       r.email ?? '',
      phoneE164:   r.phoneE164 ?? '',
      notifyEmail: r.notifyEmail,
      notifySms:   r.notifySms,
      isActive:    r.isActive,
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const url = editing ? `/api/admin/dispatch-alerts/${editing.id}` : '/api/admin/dispatch-alerts';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setFormError((await res.json().catch(() => ({ error: 'Save failed' }))).error ?? 'Save failed');
        return;
      }
      setShowForm(false);
      await fetchAll();
    } finally { setSaving(false); }
  };

  const handleDelete = async (r: Recipient) => {
    if (!confirm(`Delete dispatch alert recipient "${r.name}"?`)) return;
    await fetch(`/api/admin/dispatch-alerts/${r.id}`, { method: 'DELETE' });
    fetchAll();
  };

  const handleTest = async (r: Recipient) => {
    setTestingId(r.id);
    setTestResult('');
    try {
      const res = await fetch(`/api/admin/dispatch-alerts/${r.id}/test`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult(`${r.name}: ${json.error ?? 'Test failed'}`);
        return;
      }
      const summary = (json.results as { channel: string; ok: boolean; error?: string | null }[])
        .map((x) => `${x.channel}=${x.ok ? 'ok' : `fail (${x.error ?? '?'})`}`)
        .join(' · ');
      setTestResult(`${r.name}: ${summary}`);
      fetchAll();
    } finally { setTestingId(null); }
  };

  const formatDate = (s: string | null) => s ? new Date(s).toLocaleString() : '—';

  const groupedByBranch = recipients.reduce<Record<string, Recipient[]>>((acc, r) => {
    (acc[r.branchCode] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Truck className="w-5 h-5 text-cyan-400" /> Dispatch Alerts
        </h2>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Recipient
        </button>
      </div>

      <p className="text-sm text-slate-400 mb-4">
        Recipients here get an email and/or SMS the moment a driver finishes the final stop on a dispatch route at the matching branch.
        Capability required to edit: <code className="text-cyan-300">admin.config.manage</code>.
      </p>

      {testResult && (
        <div className="mb-4 px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-slate-200">
          {testResult}
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="admin-card p-12 text-center text-slate-400 animate-pulse">Loading...</div>
        ) : recipients.length === 0 ? (
          <div className="admin-card p-12 text-center text-slate-500">
            No recipients yet. Add one to start receiving route-completion alerts.
          </div>
        ) : (
          BRANCH_CODES.filter((b) => groupedByBranch[b]?.length).map((branch) => (
            <div key={branch} className="admin-card">
              <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">Branch {branch}</h3>
                <span className="text-xs text-slate-400">{groupedByBranch[branch].length} recipient{groupedByBranch[branch].length !== 1 ? 's' : ''}</span>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Channels</th>
                    <th>Active</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByBranch[branch].map((r) => (
                    <tr key={r.id}>
                      <td className="text-white text-sm">{r.name}</td>
                      <td className="text-slate-300 text-sm">{r.email ?? '—'}</td>
                      <td className="text-slate-300 text-sm">{r.phoneE164 ?? '—'}</td>
                      <td className="text-xs">
                        <div className="flex gap-1.5">
                          {r.notifyEmail && <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">email</span>}
                          {r.notifySms   && <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">sms</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded ${r.isActive ? 'bg-green-900/40 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                          {r.isActive ? 'active' : 'paused'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => handleTest(r)} disabled={testingId === r.id}
                            className="p-1.5 rounded hover:bg-cyan-900/20 text-slate-400 hover:text-cyan-400 disabled:opacity-50" title="Test send">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(r)}
                            className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white" title="Edit">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(r)}
                            className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-white mb-3">Recent sends</h3>
        <div className="admin-card">
          {loading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse">Loading...</div>
          ) : recentLog.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No sends yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Branch</th>
                  <th>Driver</th>
                  <th>Route</th>
                  <th>Recipient</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {recentLog.map((l) => (
                  <tr key={l.id}>
                    <td className="text-slate-400 text-xs">{formatDate(l.sentAt)}</td>
                    <td className="text-slate-300 text-xs">{l.branchCode}</td>
                    <td className="text-slate-300 text-sm">{l.driverName ?? '—'}</td>
                    <td className="text-slate-300 text-sm">{l.routeName ?? `#${l.routeId}`}</td>
                    <td className="text-slate-300 text-xs max-w-[200px] truncate">{l.recipientLabel ?? '—'}</td>
                    <td>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{l.channel}</span>
                    </td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        l.status === 'sent' ? 'bg-green-900/40 text-green-400' :
                        l.status === 'failed' ? 'bg-red-900/40 text-red-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>{l.status}</span>
                    </td>
                    <td className="text-red-400 text-xs max-w-[260px] truncate">{l.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">{editing ? 'Edit Recipient' : 'Add Recipient'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Branch *</label>
                <select value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
                  {BRANCH_CODES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Grimes Yard Lead"
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="dispatcher@beisserlumber.com"
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Phone (E.164)</label>
                <input value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}
                  placeholder="+15155550123"
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
                <p className="text-[11px] text-slate-500 mt-1">E.164 format only — include country code, no spaces or dashes.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={form.notifyEmail}
                    onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400" />
                  Send email
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={form.notifySms}
                    onChange={(e) => setForm({ ...form, notifySms: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400" />
                  Send SMS
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-400" />
                Active
              </label>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
