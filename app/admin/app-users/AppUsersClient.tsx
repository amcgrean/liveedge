'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Pencil, Trash2, X, Check, Shield, ShoppingCart,
         Package, AlertCircle, UserCheck, UserX, Info } from 'lucide-react';
import Link from 'next/link';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

const ALL_ROLES = [
  { value: 'admin',       label: 'Admin',         color: 'bg-red-900/60 text-red-300 border-red-700' },
  { value: 'supervisor',  label: 'Supervisor',     color: 'bg-orange-900/60 text-orange-300 border-orange-700' },
  { value: 'ops',         label: 'Ops',            color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  { value: 'warehouse',   label: 'Warehouse',      color: 'bg-purple-900/60 text-purple-300 border-purple-700' },
  { value: 'dispatch',    label: 'Dispatch',       color: 'bg-indigo-900/60 text-indigo-300 border-indigo-700' },
  { value: 'sales',       label: 'Sales',          color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  { value: 'purchasing',  label: 'Purchasing',     color: 'bg-green-900/60 text-green-300 border-green-700' },
  { value: 'driver',      label: 'Driver',         color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
];

function roleBadge(role: string) {
  const def = ALL_ROLES.find((r) => r.value === role);
  const cls = def?.color ?? 'bg-gray-800 text-gray-400 border-gray-600';
  return (
    <span key={role} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls} whitespace-nowrap`}>
      {def?.label ?? role}
    </span>
  );
}

interface AppUser {
  id: number;
  email: string;
  display_name: string | null;
  user_id: string | null;
  phone: string | null;
  roles: string[];
  branch: string | null;
  is_active: boolean;
  created_at: string | null;
  last_login_at: string | null;
}

const EMPTY_FORM = {
  email: '', display_name: '', user_id: '', phone: '',
  branch: '', is_active: true, roles: [] as string[],
};

export default function AppUsersClient() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/app-users');
      if (res.ok) {
        const data = await res.json() as { users: AppUser[] };
        setUsers(data.users.map((u) => ({
          ...u,
          roles: Array.isArray(u.roles) ? u.roles : [],
        })));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (u: AppUser) => {
    setEditTarget(u);
    setForm({
      email: u.email,
      display_name: u.display_name ?? '',
      user_id: u.user_id ?? '',
      phone: u.phone ?? '',
      branch: u.branch ?? '',
      is_active: u.is_active,
      roles: [...u.roles],
    });
    setFormError('');
    setShowForm(true);
  };

  const toggleRole = (role: string) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter((r) => r !== role)
        : [...f.roles, role],
    }));
  };

  const save = async () => {
    if (!form.email.trim()) { setFormError('Email is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        email: form.email.trim(),
        display_name: form.display_name.trim() || null,
        user_id: form.user_id.trim() || null,
        phone: form.phone.trim() || null,
        branch: form.branch || null,
        is_active: form.is_active,
        roles: form.roles,
      };

      const url = editTarget ? `/api/admin/app-users/${editTarget.id}` : '/api/admin/app-users';
      const method = editTarget ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setFormError(data.error ?? 'Failed to save.');
        return;
      }

      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/app-users/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        await load();
      }
    } finally { setDeleting(false); }
  };

  const filtered = users.filter((u) => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      u.email.toLowerCase().includes(ql) ||
      (u.display_name ?? '').toLowerCase().includes(ql) ||
      (u.branch ?? '').toLowerCase().includes(ql) ||
      u.roles.some((r) => r.includes(ql))
    );
  });

  return (
    <div className="max-w-5xl space-y-5">

        {/* Context banner */}
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-sm text-gray-400">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <span>
            These users log in via <span className="text-gray-200 font-medium">email + one-time code (OTP)</span> — used for ops staff who have a company email (dispatch, sales, supervisors, drivers).
            Yard/warehouse employees who use a shared terminal or don&apos;t have email belong in{' '}
            <Link href="/admin/users" className="text-cyan-400 underline underline-offset-2">LiveEdge Users</Link>{' '}
            and log in with a username + password instead.
          </span>
        </div>

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Ops Users (OTP)</h1>
            <p className="text-sm text-gray-500 mt-0.5">Email + one-time-code login for dispatch, sales, and ops staff</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} disabled={loading} className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-sm rounded transition">
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
            <div className="text-2xl font-bold text-white">{users.length}</div>
            <div className="text-xs text-gray-500">Total Users</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
            <div className="text-2xl font-bold text-green-300">{users.filter((u) => u.is_active).length}</div>
            <div className="text-xs text-gray-500">Active</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
            <div className="text-2xl font-bold text-gray-500">{users.filter((u) => !u.is_active).length}</div>
            <div className="text-xs text-gray-500">Inactive</div>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, branch, or role…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />

        {/* Users table */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-700 text-sm text-gray-400">
            {loading ? 'Loading…' : `${filtered.length} users`}
          </div>
          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-700">
                    <th className="px-4 py-2 text-left font-medium">Name / Email</th>
                    <th className="px-4 py-2 text-left font-medium">Roles</th>
                    <th className="px-4 py-2 text-left font-medium">Branch</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Last Login</th>
                    <th className="px-4 py-2 text-left font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className={`border-b border-gray-800 hover:bg-gray-800/40 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-200">{u.display_name || '—'}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length > 0 ? u.roles.map((r) => roleBadge(r)) : (
                            <span className="text-xs text-gray-600">none</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{u.branch || '—'}</td>
                      <td className="px-4 py-2.5">
                        {u.is_active ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <UserCheck className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <UserX className="w-3 h-3" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {u.last_login_at
                          ? new Date(u.last_login_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 hover:bg-gray-700 rounded transition text-gray-400 hover:text-white"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 hover:bg-red-900/40 rounded transition text-gray-500 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">No users found.</div>
          )}
        </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editTarget ? 'Edit User' : 'Add User'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@beisserlumber.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="John Smith"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ERP User ID</label>
                  <input
                    type="text"
                    value={form.user_id}
                    onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                    placeholder="e.g. JSMITH"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="515-555-0100"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Home Branch</label>
                <select
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">No branch restriction</option>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => {
                    const active = form.roles.includes(r.value);
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => toggleRole(r.value)}
                        className={`text-xs px-2.5 py-1 rounded border transition ${
                          active ? r.color : 'bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-400'
                        }`}
                      >
                        {active && <span className="mr-1">✓</span>}
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="accent-cyan-500"
                />
                <label htmlFor="is_active" className="text-sm text-gray-300">Active (can log in)</label>
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded transition flex items-center gap-2"
              >
                {saving ? 'Saving…' : <><Check className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-800 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Delete User?</h2>
            <p className="text-sm text-gray-400">
              This will permanently delete <span className="text-white font-medium">{deleteTarget.display_name || deleteTarget.email}</span> and all their pending OTP codes.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded transition flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
