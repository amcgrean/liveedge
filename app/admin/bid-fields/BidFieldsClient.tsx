'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Pencil, Trash2, X, Check, GripVertical } from 'lucide-react';

interface BidField {
  id: number;
  name: string;
  category: string;
  fieldType: string;
  isRequired: boolean;
  options: string | null;
  defaultValue: string | null;
  sortOrder: number;
  isActive: boolean;
  branchIds: string | null;
}

const FIELD_TYPES = ['text', 'number', 'select', 'checkbox', 'date', 'textarea'];
const CATEGORIES = ['General', 'Framing', 'Siding', 'Shingles', 'Deck', 'Trim', 'Windows', 'Doors', 'Other'];

const EMPTY = { name: '', category: 'General', fieldType: 'text', isRequired: false, options: '', defaultValue: '', sortOrder: 0, isActive: true, branchIds: '' };

export default function BidFieldsClient() {
  const [fields, setFields] = useState<BidField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<BidField | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchFields = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bid-fields');
      if (res.ok) setFields((await res.json()).fields ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const openCreate = () => { setEditTarget(null); setForm(EMPTY); setFormError(''); setShowForm(true); };
  const openEdit = (f: BidField) => {
    setEditTarget(f);
    setForm({ name: f.name, category: f.category, fieldType: f.fieldType, isRequired: f.isRequired, options: f.options ?? '', defaultValue: f.defaultValue ?? '', sortOrder: f.sortOrder, isActive: f.isActive, branchIds: f.branchIds ?? '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    setSaving(true); setFormError('');
    try {
      const url = editTarget ? `/api/admin/bid-fields/${editTarget.id}` : '/api/admin/bid-fields';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { setFormError((await res.json()).error ?? 'Failed'); return; }
      setShowForm(false);
      fetchFields();
    } finally { setSaving(false); }
  };

  const handleDelete = async (f: BidField) => {
    if (!confirm(`Delete field "${f.name}"?`)) return;
    await fetch(`/api/admin/bid-fields/${f.id}`, { method: 'DELETE' });
    fetchFields();
  };

  const groupedByCategory = fields.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, BidField[]>);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Bid Fields</h2>
          <p className="text-slate-400 text-sm mt-0.5">{fields.filter((f) => f.isActive).length} active fields</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchFields} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Field
          </button>
        </div>
      </div>

      {Object.entries(groupedByCategory).map(([category, catFields]) => (
        <div key={category} className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{category}</h3>
          <div className="admin-card">
            <table className="admin-table">
              <thead>
                <tr><th></th><th>Name</th><th>Type</th><th>Required</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {catFields.map((f) => (
                  <tr key={f.id}>
                    <td className="w-8"><GripVertical className="w-4 h-4 text-slate-600" /></td>
                    <td><span className="font-medium text-white">{f.name}</span></td>
                    <td><span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">{f.fieldType}</span></td>
                    <td>{f.isRequired ? <span className="text-cyan-400 text-xs">Required</span> : <span className="text-slate-600 text-xs">Optional</span>}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded ${f.isActive ? 'bg-green-900/40 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                        {f.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(f)} className="p-1.5 rounded hover:bg-red-900/20 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {fields.length === 0 && !loading && (
        <div className="admin-card p-12 text-center text-slate-500">No bid fields defined yet</div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white">{editTarget ? 'Edit Field' : 'Add Field'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Field Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Field Type</label>
                  <select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {form.fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Options (comma-separated)</label>
                  <input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })}
                    placeholder="Option1, Option2, Option3"
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Default Value</label>
                <input value={form.defaultValue} onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                  Active
                </label>
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
