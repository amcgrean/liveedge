'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Pencil, Trash2, X, Check, Shield, Eye, KeyRound,
         ShoppingCart, Package, PackageCheck, Info, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '../../../src/lib/utils';
import { useSession } from 'next-auth/react';

export interface AppUser {
  id: string;
  name: string;         // display_name
  username: string | null;
  agentId: string | null;
  email: string | null;
  role: string;         // primary role (derived)
  roles: string[];      // full roles array
  branch: string | null;
  isActive: boolean;
  createdAt: string;
}

const ROLES = [
  { value: 'admin',          label: 'Admin',              icon: <Shield className="w-3 h-3" />,       desc: 'Full access including admin panel' },
  { value: 'management',     label: 'Management',         icon: <BarChart3 className="w-3 h-3" />,    desc: 'Full access to all modules, no admin panel' },
  { value: 'estimator',      label: 'Estimator',          icon: <Pencil className="w-3 h-3" />,       desc: 'Create & manage bids and takeoffs' },
  { value: 'designer',       label: 'Designer',           icon: <Pencil className="w-3 h-3" />,       desc: 'Design work' },
  { value: 'purchasing',     label: 'Purchasing',         icon: <ShoppingCart className="w-3 h-3" />, desc: 'PO check-in, open POs, receiving' },
  { value: 'receiving_yard', label: 'Receiving (Yard)',   icon: <PackageCheck className="w-3 h-3" />, desc: 'PO check-in, open POs, review queue' },
  { value: 'warehouse',      label: 'Warehouse',          icon: <Package className="w-3 h-3" />,      desc: 'Picks board' },
  { value: 'supervisor',     label: 'Supervisor',         icon: <Shield className="w-3 h-3" />,       desc: 'Warehouse + supervisor views' },
  { value: 'sales',          label: 'Sales',              icon: <ShoppingCart className="w-3 h-3" />, desc: 'Sales hub, customers, orders' },
  { value: 'ops',            label: 'Ops',                icon: <Package className="w-3 h-3" />,      desc: 'Dispatch, delivery, ops reporting' },
  { value: 'viewer',         label: 'Viewer',             icon: <Eye className="w-3 h-3" />,          desc: 'Read-only access' },
];

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

const EMPTY = { name: '', username: '', agentId: '', email: '', role: 'estimator', password: '', branch: '' };

export default function UsersClient({ initialUsers }: { initialUsers?: AppUser[] }) {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AppUser[]>(initialUsers ?? []);
  const [loading, setLoading] = useState(!initialUsers);
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

  useEffect(() => { if (!initialUsers) fetch_(); }, [fetch_, initialUsers]);

  const openCreate = () => { setEditTarget(null); setForm(EMPTY); setFormError(''); setShowForm(true); };
  const openEdit = (u: AppUser) => {
    setEditTarget(u);
    setForm({
      name:     u.name,
      username: u.username ?? '',
      agentId:  u.agentId ?? '',
      email:    u.email ?? '',
      role:     u.role,
      password: '',
      branch:   u.branch ?? '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.email.trim() && !form.username.trim()) {
      setFormError('Email or username is required');
      return;
    }
    if (!editTarget && !form.password && !form.email.includes('@')) {
      setFormError('Password is required for username-only users');
      return;
    }
    if (form.password && form.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const url = editTarget ? `/api/admin/users/${editTarget.id}` : '/api/admin/users';
      const method = editTarget ? 'PUT' : 'POST';
      const body: Record<string, string | string[] | undefined> = {
        name:  form.name.trim() || undefined,
        role:  form.role,
        branch: form.branch.trim() || undefined,
      };
      if (form.username.trim()) body.username = form.username.trim().toLowerCase();
      if (form.agentId.trim())  body.agentId  = form.agentId.trim().toLowerCase();
      if (form.email.trim())    body.email    = form.email.trim().toLowerCase();
      if (form.password)        body.password = form.password;
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

  const getRoleInfo = (role: string) => ROLES.find((r) => r.value === role) ?? ROLES[ROLES.length - 1];

  return (
    <div className="max-w-full">
      {/* Context banner */}
      <div className="flex items-start gap-2.5 mb-5 p-3.5 bg-cyan-500/5 border border-cyan-500/20 rounded-xl text-sm text-slate-400">
        <Info className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
        <span>
          All LiveEdge users are managed here. Users with an <span className="text-slate-200 font-medium">email address</span> sign in via{' '}
          <span className="text-slate-200 font-medium">email + one-time code (OTP)</span>.
          Users with a <span className="text-slate-200 font-medium">username</span> sign in via{' '}
          <span className="text-slate-200 font-medium">username + password</span>.
          Both flows use the same <code className="text-cyan-400 text-xs">/login</code> page.
        </span>
      </div>

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
          <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Agent ID</th>
                <th>Email</th>
                <th>Role</th>
                <th>Branch</th>
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
                    <td className="text-slate-400 text-sm font-mono">
                      {u.username || <span className="text-slate-600 italic">—</span>}
                    </td>
                    <td className="text-slate-400 text-sm font-mono">
                      {u.agentId || <span className="text-slate-600 italic">—</span>}
                    </td>
                    <td className="text-slate-400 text-sm">{u.email || <span className="text-slate-600 italic">—</span>}</td>
                    <td>
                      <span className={`flex items-center gap-1.5 w-fit px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                        u.role === 'admin'          ? 'bg-purple-900/40 text-purple-400 border border-purple-700' :
                        u.role === 'management'     ? 'bg-gold-800/40 text-gold-300 border border-gold-700' :
                        u.role === 'purchasing'     ? 'bg-amber-900/30 text-amber-400 border border-amber-800' :
                        u.role === 'receiving_yard' ? 'bg-orange-900/30 text-orange-400 border border-orange-800' :
                        u.role === 'warehouse'      ? 'bg-green-900/30 text-green-400 border border-green-800' :
                        u.role === 'supervisor'     ? 'bg-orange-900/30 text-orange-400 border border-orange-800' :
                        u.role === 'sales'          ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800' :
                        u.role === 'ops'            ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' :
                        u.role === 'viewer'         ? 'bg-slate-800 text-slate-400' :
                        'bg-blue-900/30 text-blue-400 border border-blue-800'
                      }`}>
                        {roleInfo.icon}
                        {u.role}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs">{u.branch || <span className="italic">—</span>}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${u.isActive ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-slate-800 text-slate-500'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs">{formatDate(u.createdAt)}</td>
                    <td className="whitespace-nowrap w-px">
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/users/${u.id}/permissions`} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-cyan-400 transition" title="Permissions"><KeyRound className="w-3.5 h-3.5" /></Link>
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        {!isSelf && u.isActive && (
                          <button onClick={() => handleDeactivate(u)} className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400 transition" title="Deactivate"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">{editTarget ? 'Edit User' : 'Add User'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Display Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Username <span className="text-slate-600">(password login)</span>
                  </label>
                  <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="jsmith"
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Email <span className="text-slate-600">(OTP login)</span>
                  </label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="user@beisserlumber.com"
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Agent ID <span className="text-slate-600">(ERP rep code — full first name + last initial, e.g. Aaron McGrean → aaronm)</span>
                </label>
                <input value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                  placeholder="aaronm"
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Branch</label>
                <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
                  <option value="">No branch restriction</option>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Role</label>
                <div className="space-y-1.5">
                  {ROLES.map((r) => (
                    <label key={r.value} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition ${form.role === r.value ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-slate-950/40 border-slate-700 hover:border-slate-600'}`}>
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
                  {editTarget ? 'New Password (leave blank to keep)' : 'Password'}
                  {!editTarget && !form.email.includes('@') && <span className="text-red-400"> *</span>}
                </label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editTarget ? '••••••••' : 'Required for username-only users'}
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
