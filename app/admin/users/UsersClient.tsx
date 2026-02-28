'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Pencil, Trash2, X, Check, Shield, Eye } from 'lucide-react';
import { formatDate } from '../../../src/lib/utils';
import { useSession } from 'next-auth/react';

interface AppUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', icon: <Shield className="w-3 h-3" />, desc: 'Full access, admin panel' },
  { value: 'estimator', label: 'Estimator', icon: <Pencil className="w-3 h-3" />, desc: 'Create & manage own bids' },
  { value: 'viewer', label: 'Viewer', icon: <Eye className="w-3 h-3" />, desc: 'Read-only access to bids' },
];

const EMPTY = { name: '', email: '', role: 'estimator', password: '' };

export default function UsersClient() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) setUsers((await res.json()).users ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const openCreate = () => { setEditTarget(null); setForm(EMPTY); setFormError(''); setShowForm(true); };
  const openEdit = (u: AppUser) => {
    setEditTarget(u);
    setForm({ name: u.name, email: u.email, role: u.role, password: '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) { setFormError('Name and email are required'); return; }
    if (!editTarget && !form.password) { setFormError('Password is required for new users'); return; }
    if (form.password && form.password.length < 8) { setFormError('Password must be at least 8 characters'); return; }
    setSaving(true); setFormError('');
    try {
      const url = editTarget ? `/api/admin/users/${editTarget.id}` : '/api/admin/users';
      const method = editTarget ? 'PUT' : 'POST';
      const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
      if (form.password) body.password = form.password;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); setFormError(err.error ?? 'Failed to save'); return; }
      setShowForm(false);
      fetch_();
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (u: AppUser) => {
    if (!confirm(`Deactivate "${u.name}"? They will no longer be able to sign in.`)) return;
    await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    fetch_();
  };

  const getRoleInfo = (role: string) => ROLES.find((r) => r.value === role) ?? ROLES[1];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Users</h2>
          <p className="text-slate-400 text-sm mt-0.5">{users.filter((u) => u.isActive).length} active users</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetch_} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleInfo = getRoleInfo(u.role);
                const isSelf = u.id === session?.user?.id;
                return (
                  <tr key={u.id} className={isSelf ? 'bg-cyan-500/5' : ''}>
                    <td>
                      <span className="font-semibold text-white">{u.name}</span>
                      {isSelf && <span className="ml-2 text-[10px] bg-cyan-900/40 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-700">You</span>}
                    </td>
                    <td className="text-slate-400 text-sm">{u.email}</td>
                    <td>
                      <span className={`flex items-center gap-1.5 w-fit px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                        u.role === 'admin' ? 'bg-purple-900/40 text-purple-400 border border-purple-700' :
                        u.role === 'viewer' ? 'bg-slate-800 text-slate-400' :
                        'bg-blue-900/30 text-blue-400 border border-blue-800'
                      }`}>
                        {roleInfo.icon}
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${u.isActive ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-slate-800 text-slate-500'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition"><Pencil className="w-3.5 h-3.5" /></button>
                        {!isSelf && u.isActive && (
                          <button onClick={() => handleDeactivate(u)} className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">{editTarget ? 'Edit User' : 'Add User'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Full Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              {!editTarget && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Role</label>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <label key={r.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${form.role === r.value ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-slate-950/40 border-slate-700 hover:border-slate-600'}`}>
                      <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => setForm({ ...form, role: r.value })} className="mt-0.5" />
                      <div>
                        <p className={`text-sm font-medium capitalize flex items-center gap-1.5 ${form.role === r.value ? 'text-cyan-400' : 'text-slate-200'}`}>
                          {r.icon} {r.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {editTarget ? 'New Password (leave blank to keep)' : 'Password *'}
                </label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editTarget ? '••••••••' : 'min. 8 characters'}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                {editTarget ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
