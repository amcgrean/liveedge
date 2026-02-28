'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, X, Check } from 'lucide-react';
import { formatDate } from '../../../src/lib/utils';

interface Customer {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

const EMPTY: Omit<Customer, 'id' | 'isActive' | 'createdAt'> = {
  code: '', name: '', address: '', city: '', state: '', zip: '',
  phone: '', email: '', contactName: '', notes: '',
};

export default function CustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (showInactive) params.set('active', 'false');
      const res = await fetch(`/api/customers?${params}&limit=200`);
      if (res.ok) setCustomers((await res.json()).customers ?? []);
    } finally { setLoading(false); }
  }, [search, showInactive]);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => { const t = setTimeout(fetch_, 350); return () => clearTimeout(t); }, [search, fetch_]);

  const openCreate = () => { setEditTarget(null); setForm(EMPTY); setFormError(''); setShowForm(true); };
  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setForm({ code: c.code ?? '', name: c.name, address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', zip: c.zip ?? '', phone: c.phone ?? '', email: c.email ?? '', contactName: c.contactName ?? '', notes: c.notes ?? '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    setSaving(true); setFormError('');
    try {
      const url = editTarget ? `/api/customers/${editTarget.id}` : '/api/customers';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); setFormError(err.error ?? 'Failed to save'); return; }
      setShowForm(false);
      fetch_();
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (c: Customer) => {
    if (!confirm(`Deactivate "${c.name}"?`)) return;
    await fetch(`/api/customers/${c.id}`, { method: 'DELETE' });
    fetch_();
  };

  const filtered = customers.filter((c) => showInactive ? true : c.isActive);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Customers</h2>
          <p className="text-slate-400 text-sm mt-0.5">{filtered.length} customers</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetch_} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="admin-card">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No customers found.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact</th>
                <th>City / State</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs text-slate-400">{c.code ?? '—'}</td>
                  <td className="font-semibold text-white">{c.name}</td>
                  <td className="text-slate-400 text-sm">{c.contactName ?? '—'}</td>
                  <td className="text-slate-400 text-sm">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="text-slate-400 text-sm">{c.phone ?? '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${c.isActive ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-slate-800 text-slate-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-slate-500 text-xs">{formatDate(c.createdAt)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition"><Pencil className="w-3.5 h-3.5" /></button>
                      {c.isActive && <button onClick={() => handleDeactivate(c)} className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">{editTarget ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'name', label: 'Customer Name *', span: true },
                  { key: 'code', label: 'Customer Code' },
                  { key: 'contactName', label: 'Primary Contact' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'address', label: 'Address', span: true },
                  { key: 'city', label: 'City' },
                  { key: 'state', label: 'State' },
                  { key: 'zip', label: 'ZIP' },
                ].map(({ key, label, span }) => (
                  <div key={key} className={span ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                    <input
                      value={(form as Record<string, string>)[key] ?? ''}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none resize-none"
                  />
                </div>
              </div>
              {formError && <p className="mt-3 text-sm text-red-400">{formError}</p>}
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
