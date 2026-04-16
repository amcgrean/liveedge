'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, X, Check } from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  description: string;
  uom: string;
  category: string | null;
  isActive: boolean;
  branchOverrides: Record<string, string> | null;
  updatedAt: string;
}

const CATEGORIES = ['framing', 'siding', 'hardware', 'deck', 'roofing', 'trim', 'sheathing', 'windows-doors', 'other'];
const EMPTY = { sku: '', description: '', uom: 'EA', category: '', branchOverrides: '' };

export default function ProductsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (search) params.set('q', search);
      if (catFilter) params.set('category', catFilter);
      const res = await fetch(`/api/products?${params}`);
      if (res.ok) setProducts((await res.json()).products ?? []);
    } finally { setLoading(false); }
  }, [search, catFilter]);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => { const t = setTimeout(fetch_, 350); return () => clearTimeout(t); }, [search, fetch_]);

  const openCreate = () => { setEditTarget(null); setForm(EMPTY); setFormError(''); setShowForm(true); };
  const openEdit = (p: Product) => {
    setEditTarget(p);
    setForm({
      sku: p.sku, description: p.description, uom: p.uom,
      category: p.category ?? '',
      branchOverrides: p.branchOverrides ? JSON.stringify(p.branchOverrides, null, 2) : '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.sku.trim() || !form.description.trim() || !form.uom.trim()) {
      setFormError('SKU, description, and UOM are required');
      return;
    }
    let branchOverrides: Record<string, string> | null = null;
    if (form.branchOverrides.trim()) {
      try { branchOverrides = JSON.parse(form.branchOverrides); } catch { setFormError('Branch overrides must be valid JSON'); return; }
    }
    setSaving(true); setFormError('');
    try {
      const url = editTarget ? `/api/products/${editTarget.id}` : '/api/products';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, branchOverrides }),
      });
      if (!res.ok) { const err = await res.json(); setFormError(err.error ?? 'Failed to save'); return; }
      setShowForm(false);
      fetch_();
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (p: Product) => {
    if (!confirm(`Remove product "${p.sku}"?`)) return;
    await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
    fetch_();
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Products / SKUs</h2>
          <p className="text-slate-400 text-sm mt-0.5">{products.length} active products</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetch_} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU or description..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No products found. Add a product to get started.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>UOM</th>
                <th>Category</th>
                <th>Branch Overrides</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs font-semibold text-cyan-400">{p.sku}</td>
                  <td className="text-slate-200 max-w-xs truncate">{p.description}</td>
                  <td className="text-slate-400 text-sm">{p.uom}</td>
                  <td><span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 capitalize">{p.category ?? '—'}</span></td>
                  <td className="text-slate-500 text-xs">
                    {p.branchOverrides ? Object.keys(p.branchOverrides).join(', ') : '—'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeactivate(p)} className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">{editTarget ? 'Edit Product' : 'Add Product'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {[
                { key: 'sku', label: 'SKU *' },
                { key: 'description', label: 'Description *' },
                { key: 'uom', label: 'Unit of Measure *' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                  <input
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">— Select —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Branch Overrides (JSON)
                  <span className="ml-1 text-slate-500 font-normal normal-case">e.g. {"{ \"fort_dodge\": \"ALT-SKU\" }"}</span>
                </label>
                <textarea
                  rows={4}
                  value={form.branchOverrides}
                  onChange={(e) => setForm({ ...form, branchOverrides: e.target.value })}
                  placeholder='{ "fort_dodge": "ALTERNATIVE-SKU-123" }'
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:border-cyan-400 focus:outline-none resize-none"
                />
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
