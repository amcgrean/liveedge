'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Download, Upload, Pencil, Trash2, Search, AlertTriangle, Pause, Star, X } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface ItemPlanningRow {
  id:                 string;
  systemId:           string;
  itemCode:           string;
  minOnHand:          string | null;
  targetOnHand:       string | null;
  safetyStockDays:    number | null;
  usageWindowDays:    number | null;
  seasonalityFactor:  string | null;
  seasonalityProfile: number[] | null;
  packQty:            string | null;
  preferredSupplier:  string | null;
  isCritical:         boolean;
  category:           string | null;
  isPaused:           boolean;
  notes:              string | null;
  source:             string | null;
  updatedBy:          string | null;
  updatedAt:          string | null;
}

interface BranchDefaults {
  systemId: string;
  usageWindowDays: number;
  safetyStockDays: number;
  seasonalityProfile: number[] | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  _synthetic?: boolean;
}

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];
const CATEGORY_OPTIONS = ['millwork', 'lumber', 'siding', 'shingles', 'trim', 'decking', 'windows', 'doors', 'other'];

type FormState = {
  systemId: string; itemCode: string;
  minOnHand: string; targetOnHand: string;
  safetyStockDays: string; usageWindowDays: string;
  seasonalityFactor: string; packQty: string;
  preferredSupplier: string; category: string;
  isCritical: boolean; isPaused: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  systemId: '20GR', itemCode: '',
  minOnHand: '', targetOnHand: '',
  safetyStockDays: '', usageWindowDays: '',
  seasonalityFactor: '', packQty: '',
  preferredSupplier: '', category: 'millwork',
  isCritical: false, isPaused: false,
  notes: '',
};

interface Props { userName: string | null }

export default function ItemPlanningClient({ userName: _userName }: Props) {
  usePageTracking();

  const [rows, setRows] = useState<ItemPlanningRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [defaults, setDefaults] = useState<BranchDefaults[]>([]);

  // Filters
  const [branch, setBranch] = useState('');
  const [category, setCategory] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [pausedOnly, setPausedOnly] = useState(false);
  const [q, setQ] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemPlanningRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Branch defaults modal
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [defaultsSavingFor, setDefaultsSavingFor] = useState<string | null>(null);

  // Import modal
  const [importResult, setImportResult] = useState<null | { total: number; inserted: number; updated: number; skipped: number; skipReasons: string[] }>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (branch)       sp.set('branch', branch);
      if (category)     sp.set('category', category);
      if (criticalOnly) sp.set('critical', '1');
      if (pausedOnly)   sp.set('paused', '1');
      if (q.trim())     sp.set('q', q.trim());
      const res = await fetch(`/api/admin/item-planning?${sp}`);
      if (res.ok) {
        const data = await res.json() as { rows: ItemPlanningRow[]; count: number };
        setRows(data.rows);
        setCount(data.count);
      }
    } finally {
      setLoading(false);
    }
  }, [branch, category, criticalOnly, pausedOnly, q]);

  const fetchDefaults = useCallback(async () => {
    const res = await fetch('/api/admin/branch-planning-defaults');
    if (res.ok) setDefaults((await res.json()).rows ?? []);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { fetchDefaults(); }, [fetchDefaults]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, systemId: branch || EMPTY_FORM.systemId });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (r: ItemPlanningRow) => {
    setEditTarget(r);
    setForm({
      systemId: r.systemId, itemCode: r.itemCode,
      minOnHand:        r.minOnHand        ?? '',
      targetOnHand:     r.targetOnHand     ?? '',
      safetyStockDays:  r.safetyStockDays  == null ? '' : String(r.safetyStockDays),
      usageWindowDays:  r.usageWindowDays  == null ? '' : String(r.usageWindowDays),
      seasonalityFactor:r.seasonalityFactor?? '',
      packQty:          r.packQty          ?? '',
      preferredSupplier:r.preferredSupplier?? '',
      category:         r.category         ?? '',
      isCritical:       r.isCritical,
      isPaused:         r.isPaused,
      notes:            r.notes            ?? '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.itemCode.trim()) { setFormError('Item code is required'); return; }
    if (!form.systemId)        { setFormError('Branch is required');    return; }
    setSaving(true);
    setFormError('');

    const payload = {
      systemId: form.systemId,
      itemCode: form.itemCode.trim(),
      minOnHand:         form.minOnHand         === '' ? null : Number(form.minOnHand),
      targetOnHand:      form.targetOnHand      === '' ? null : Number(form.targetOnHand),
      safetyStockDays:   form.safetyStockDays   === '' ? null : Number(form.safetyStockDays),
      usageWindowDays:   form.usageWindowDays   === '' ? null : Number(form.usageWindowDays),
      seasonalityFactor: form.seasonalityFactor === '' ? null : Number(form.seasonalityFactor),
      packQty:           form.packQty           === '' ? null : Number(form.packQty),
      preferredSupplier: form.preferredSupplier.trim() || null,
      category:          form.category.trim()         || null,
      isCritical:        form.isCritical,
      isPaused:          form.isPaused,
      notes:             form.notes.trim() || null,
    };

    try {
      const url    = editTarget ? `/api/admin/item-planning/${editTarget.id}` : '/api/admin/item-planning';
      const method = editTarget ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setFormError(err.error ?? 'Save failed');
        return;
      }
      setShowForm(false);
      fetchRows();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: ItemPlanningRow) => {
    if (!confirm(`Delete planning override for ${r.itemCode} @ ${r.systemId}?`)) return;
    await fetch(`/api/admin/item-planning/${r.id}`, { method: 'DELETE' });
    fetchRows();
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/admin/item-planning/template';
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const res = await fetch('/api/admin/item-planning/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: text,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      alert(`Import failed: ${err.error ?? res.statusText}`);
      return;
    }
    const result = await res.json() as { total: number; inserted: number; updated: number; skipped: number; skipReasons: string[] };
    setImportResult(result);
    fetchRows();
  };

  const handleSaveDefault = async (sysId: string, usageWindowDays: number, safetyStockDays: number) => {
    setDefaultsSavingFor(sysId);
    try {
      const res = await fetch('/api/admin/branch-planning-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemId: sysId, usageWindowDays, safetyStockDays }),
      });
      if (!res.ok) {
        alert('Save failed');
        return;
      }
      fetchDefaults();
    } finally {
      setDefaultsSavingFor(null);
    }
  };

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Item Planning</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {count.toLocaleString()} planning override{count === 1 ? '' : 's'} — drives Suggested Buys + Potential Outages.
            Items without a row here fall back to branch defaults + Agility values.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setDefaultsOpen(true)}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5"
          >
            Branch Defaults
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button
            onClick={fetchRows}
            className="p-2 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreate}
            className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Override
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
        >
          <option value="">All Branches</option>
          {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setCriticalOnly((v) => !v)}
          className={`px-2 py-1.5 text-xs rounded border flex items-center gap-1 ${
            criticalOnly ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Star className="w-3 h-3" /> Critical only
        </button>
        <button
          onClick={() => setPausedOnly((v) => !v)}
          className={`px-2 py-1.5 text-xs rounded border flex items-center gap-1 ${
            pausedOnly ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <Pause className="w-3 h-3" /> Paused only
        </button>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item code, notes, category…"
            className="w-full pl-8 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider text-left">
                <th className="px-3 py-2.5 font-medium">Branch</th>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium text-right">Min</th>
                <th className="px-3 py-2.5 font-medium text-right">Target</th>
                <th className="px-3 py-2.5 font-medium text-right">Safety (d)</th>
                <th className="px-3 py-2.5 font-medium text-right">Window (d)</th>
                <th className="px-3 py-2.5 font-medium text-right">Pack</th>
                <th className="px-3 py-2.5 font-medium">Pref Supplier</th>
                <th className="px-3 py-2.5 font-medium">Flags</th>
                <th className="px-3 py-2.5 font-medium">Updated</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} className="px-3 py-12 text-center text-slate-500 text-sm">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-12 text-center text-slate-500 text-sm">
                  No overrides yet. Use <span className="text-slate-300">Add Override</span> or import a CSV.
                </td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-xs text-slate-400 font-mono">{r.systemId}</td>
                  <td className="px-3 py-2 font-mono text-cyan-300">{r.itemCode}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{r.category ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-200">{r.minOnHand ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-200">{r.targetOnHand ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">{r.safetyStockDays ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">{r.usageWindowDays ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-300">{r.packQty ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{r.preferredSupplier ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {r.isCritical && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                          <Star className="w-2.5 h-2.5" /> Critical
                        </span>
                      )}
                      {r.isPaused && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-medium">
                          <Pause className="w-2.5 h-2.5" /> Paused
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
                    {r.updatedBy && <div className="text-[10px] text-slate-600">{r.updatedBy}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="p-1 text-slate-400 hover:text-cyan-300" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r)} className="p-1 text-slate-400 hover:text-red-400" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {editTarget ? 'Edit Override' : 'Add Override'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Branch *" required>
                <select
                  value={form.systemId}
                  disabled={!!editTarget}
                  onChange={(e) => setForm({ ...form, systemId: e.target.value })}
                  className="form-select"
                >
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Item Code *" required>
                <input
                  type="text"
                  value={form.itemCode}
                  disabled={!!editTarget}
                  onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
                  className="form-input font-mono"
                  placeholder="e.g. MWL-1X4-PINE-12"
                />
              </Field>
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="form-select"
                >
                  <option value="">—</option>
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Preferred Supplier (override)">
                <input
                  type="text"
                  value={form.preferredSupplier}
                  onChange={(e) => setForm({ ...form, preferredSupplier: e.target.value })}
                  className="form-input"
                  placeholder="agility supplier_code"
                />
              </Field>
              <Field label="Min On Hand">
                <input type="number" step="0.001" value={form.minOnHand} onChange={(e) => setForm({ ...form, minOnHand: e.target.value })} className="form-input" />
              </Field>
              <Field label="Target On Hand">
                <input type="number" step="0.001" value={form.targetOnHand} onChange={(e) => setForm({ ...form, targetOnHand: e.target.value })} className="form-input" />
              </Field>
              <Field label="Safety Stock (days)" help="Overrides branch default">
                <input type="number" min="0" step="1" value={form.safetyStockDays} onChange={(e) => setForm({ ...form, safetyStockDays: e.target.value })} className="form-input" />
              </Field>
              <Field label="Usage Window (days)" help="Overrides branch default">
                <input type="number" min="1" step="1" value={form.usageWindowDays} onChange={(e) => setForm({ ...form, usageWindowDays: e.target.value })} className="form-input" />
              </Field>
              <Field label="Seasonality Factor" help="Flat multiplier on baseline usage (1.0 = none)">
                <input type="number" step="0.01" value={form.seasonalityFactor} onChange={(e) => setForm({ ...form, seasonalityFactor: e.target.value })} className="form-input" />
              </Field>
              <Field label="Pack Qty" help="Order rounding step">
                <input type="number" step="0.001" value={form.packQty} onChange={(e) => setForm({ ...form, packQty: e.target.value })} className="form-input" />
              </Field>
              <div className="sm:col-span-2 flex gap-4 items-center mt-1">
                <label className="flex items-center gap-2 text-slate-300 text-sm">
                  <input type="checkbox" checked={form.isCritical} onChange={(e) => setForm({ ...form, isCritical: e.target.checked })} />
                  <Star className="w-4 h-4 text-amber-400" /> Critical
                </label>
                <label className="flex items-center gap-2 text-slate-300 text-sm">
                  <input type="checkbox" checked={form.isPaused} onChange={(e) => setForm({ ...form, isPaused: e.target.checked })} />
                  <Pause className="w-4 h-4 text-slate-400" /> Pause (exclude from suggestions)
                </label>
              </div>
              <Field label="Notes" className="sm:col-span-2">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="form-input w-full resize-none"
                />
              </Field>
            </div>

            {formError && (
              <div className="mt-3 p-2 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {formError}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-sm font-medium"
              >
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Override'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch defaults modal */}
      {defaultsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Branch Planning Defaults</h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  Used when an item doesn't have an explicit override. Per-item rows above can override these per item.
                </p>
              </div>
              <button onClick={() => setDefaultsOpen(false)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider text-left">
                  <th className="py-2">Branch</th>
                  <th className="py-2">Usage Window (days)</th>
                  <th className="py-2">Safety Stock (days)</th>
                  <th className="py-2">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {defaults.map((d) => (
                  <DefaultsRow
                    key={d.systemId}
                    row={d}
                    saving={defaultsSavingFor === d.systemId}
                    onSave={(uw, ss) => handleSaveDefault(d.systemId, uw, ss)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import result modal */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">CSV Import</h3>
              <button onClick={() => setImportResult(null)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Rows processed</span><span className="text-white">{importResult.total}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Inserted</span><span className="text-green-400">{importResult.inserted}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Updated</span><span className="text-cyan-300">{importResult.updated}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Skipped</span><span className={importResult.skipped > 0 ? 'text-amber-300' : 'text-slate-500'}>{importResult.skipped}</span></div>
            </div>
            {importResult.skipReasons.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto text-xs text-slate-400 space-y-1 bg-slate-950 rounded p-2 border border-slate-800">
                {importResult.skipReasons.map((r, i) => <div key={i}>{r}</div>)}
              </div>
            )}
            <button
              onClick={() => setImportResult(null)}
              className="w-full mt-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .form-input, .form-select { width: 100%; background: rgb(15 23 42); border: 1px solid rgb(51 65 85); border-radius: 0.375rem; padding: 0.375rem 0.625rem; font-size: 0.875rem; color: white; }
        .form-input:focus, .form-select:focus { outline: none; border-color: rgb(6 182 212); }
        .form-input:disabled, .form-select:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Field({ label, required, help, className, children }: { label: string; required?: boolean; help?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {help && <p className="text-[10px] text-slate-600 mt-0.5">{help}</p>}
    </div>
  );
}

function DefaultsRow({ row, saving, onSave }: { row: BranchDefaults; saving: boolean; onSave: (usageWindowDays: number, safetyStockDays: number) => void }) {
  const [uw, setUw] = useState(row.usageWindowDays);
  const [ss, setSs] = useState(row.safetyStockDays);
  const dirty = uw !== row.usageWindowDays || ss !== row.safetyStockDays;
  return (
    <tr className="border-b border-slate-800/60">
      <td className="py-2 font-mono text-slate-200">{row.systemId}</td>
      <td className="py-2">
        <input type="number" min={1} max={730} value={uw} onChange={(e) => setUw(Number(e.target.value))} className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white" />
      </td>
      <td className="py-2">
        <input type="number" min={0} max={365} value={ss} onChange={(e) => setSs(Number(e.target.value))} className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white" />
      </td>
      <td className="py-2 text-xs">
        {row._synthetic
          ? <span className="text-slate-500">defaults (not saved)</span>
          : <span className="text-cyan-300">saved</span>}
      </td>
      <td className="py-2 text-right">
        <button
          onClick={() => onSave(uw, ss)}
          disabled={!dirty || saving}
          className="px-2 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded"
        >
          {saving ? '…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
