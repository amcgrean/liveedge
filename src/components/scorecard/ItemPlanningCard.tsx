'use client';

import { useState } from 'react';
import { Boxes, Pencil, Plus, Star, Pause, X, ExternalLink, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

/**
 * Replenishment card for the item scorecard. Shows per-branch planning
 * state for this item (override row or "uses branch defaults") and lets
 * users with admin.config.manage edit inline. Same write endpoint as
 * /admin/item-planning.
 */

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'] as const;
type Branch = typeof BRANCHES[number];

const CATEGORY_OPTIONS = ['millwork', 'lumber', 'siding', 'shingles', 'trim', 'decking', 'windows', 'doors', 'other'];

export interface ItemPlanningRowDto {
  id:                 string;
  systemId:           string;
  itemCode:           string;
  minOnHand:          string | null;
  targetOnHand:       string | null;
  safetyStockDays:    number | null;
  usageWindowDays:    number | null;
  seasonalityFactor:  string | null;
  packQty:            string | null;
  preferredSupplier:  string | null;
  isCritical:         boolean;
  category:           string | null;
  isPaused:           boolean;
  notes:              string | null;
  updatedBy:          string | null;
  updatedAt:          string | null;
}

interface Props {
  itemCode: string;
  rows: ItemPlanningRowDto[];                // current overrides for this item across branches
  canEdit: boolean;
}

type FormState = {
  systemId: Branch;
  minOnHand: string;
  targetOnHand: string;
  safetyStockDays: string;
  usageWindowDays: string;
  seasonalityFactor: string;
  packQty: string;
  preferredSupplier: string;
  category: string;
  isCritical: boolean;
  isPaused: boolean;
  notes: string;
};

function emptyForm(systemId: Branch): FormState {
  return {
    systemId, minOnHand: '', targetOnHand: '',
    safetyStockDays: '', usageWindowDays: '',
    seasonalityFactor: '', packQty: '',
    preferredSupplier: '', category: 'millwork',
    isCritical: false, isPaused: false,
    notes: '',
  };
}

function fromRow(r: ItemPlanningRowDto): FormState {
  return {
    systemId:          r.systemId as Branch,
    minOnHand:         r.minOnHand          ?? '',
    targetOnHand:      r.targetOnHand       ?? '',
    safetyStockDays:   r.safetyStockDays  == null ? '' : String(r.safetyStockDays),
    usageWindowDays:   r.usageWindowDays  == null ? '' : String(r.usageWindowDays),
    seasonalityFactor: r.seasonalityFactor  ?? '',
    packQty:           r.packQty            ?? '',
    preferredSupplier: r.preferredSupplier  ?? '',
    category:          r.category           ?? '',
    isCritical:        r.isCritical,
    isPaused:          r.isPaused,
    notes:             r.notes              ?? '',
  };
}

export default function ItemPlanningCard({ itemCode, rows: initialRows, canEdit }: Props) {
  const [rows, setRows] = useState<ItemPlanningRowDto[]>(initialRows);
  const [editing, setEditing] = useState<{ kind: 'create' | 'edit'; row?: ItemPlanningRowDto } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rowsByBranch = new Map(rows.map((r) => [r.systemId, r]));

  const openCreate = (systemId: Branch) => {
    setEditing({ kind: 'create' });
    setForm({ ...emptyForm(systemId) });
    setError('');
  };

  const openEdit = (row: ItemPlanningRowDto) => {
    setEditing({ kind: 'edit', row });
    setForm(fromRow(row));
    setError('');
  };

  const close = () => { setEditing(null); setForm(null); setError(''); };

  const save = async () => {
    if (!form || !editing) return;
    setSaving(true);
    setError('');
    const payload = {
      systemId:          form.systemId,
      itemCode,
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
      notes:             form.notes.trim()      || null,
    };
    try {
      const url    = editing.kind === 'edit' && editing.row ? `/api/admin/item-planning/${editing.row.id}` : '/api/admin/item-planning';
      const method = editing.kind === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setError(err.error ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      const { row } = await res.json() as { row: ItemPlanningRowDto };
      setRows((prev) => {
        const without = prev.filter((r) => r.systemId !== row.systemId);
        return [...without, row].sort((a, b) => a.systemId.localeCompare(b.systemId));
      });
      close();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || editing.kind !== 'edit' || !editing.row) return;
    if (!confirm(`Delete planning override for ${itemCode} @ ${editing.row.systemId}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/item-planning/${editing.row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setError(err.error ?? `Delete failed (HTTP ${res.status})`);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== editing.row!.id));
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5" />
          Replenishment
        </h2>
        {canEdit && (
          <Link
            href={`/admin/item-planning?q=${encodeURIComponent(itemCode)}`}
            className="text-[10px] text-slate-500 hover:text-cyan-400 transition inline-flex items-center gap-1"
          >
            Open admin <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>

      <div className="space-y-2">
        {BRANCHES.map((branch) => {
          const row = rowsByBranch.get(branch);
          return (
            <BranchRow
              key={branch}
              branch={branch}
              row={row}
              canEdit={canEdit}
              onCreate={() => openCreate(branch)}
              onEdit={() => row && openEdit(row)}
            />
          );
        })}
      </div>

      <p className="text-[10px] text-slate-500 mt-3">
        Overrides feed Suggested Buys, Outages, and the engine. Items without an override use the branch defaults
        (see <Link href="/admin/item-planning" className="text-slate-400 hover:text-cyan-400 underline">Item Planning</Link>).
      </p>

      {/* Editor modal */}
      {editing && form && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl p-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {editing.kind === 'edit' ? 'Edit override' : 'Add override'}
                  <span className="text-cyan-300 font-mono text-sm ml-2">{itemCode}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Branch {form.systemId}</p>
              </div>
              <button onClick={close} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
              <Field label="Seasonality Factor" help="Flat multiplier (1.0 = none)">
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

            {error && (
              <div className="mt-3 p-2 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-sm font-medium"
              >
                {saving ? 'Saving…' : editing.kind === 'edit' ? 'Save Changes' : 'Create Override'}
              </button>
              {editing.kind === 'edit' && (
                <button onClick={remove} disabled={saving} className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-950/40 text-sm rounded border border-red-900/50">
                  Delete
                </button>
              )}
              <button onClick={close} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
                Cancel
              </button>
            </div>

            <style jsx>{`
              .form-input, .form-select { width: 100%; background: rgb(15 23 42); border: 1px solid rgb(51 65 85); border-radius: 0.375rem; padding: 0.375rem 0.625rem; font-size: 0.875rem; color: white; }
              .form-input:focus, .form-select:focus { outline: none; border-color: rgb(6 182 212); }
            `}</style>
          </div>
        </div>
      )}
    </section>
  );
}

function BranchRow({
  branch, row, canEdit, onCreate, onEdit,
}: {
  branch: string;
  row: ItemPlanningRowDto | undefined;
  canEdit: boolean;
  onCreate: () => void;
  onEdit: () => void;
}) {
  const fmtNum = (v: string | null) => v == null || v === '' ? null : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (!row) {
    return (
      <div className="flex items-center justify-between text-sm bg-slate-900/40 rounded px-3 py-2 border border-slate-800">
        <div className="flex items-center gap-3">
          <span className="font-mono text-slate-400 text-xs w-12">{branch}</span>
          <span className="text-slate-500 text-xs italic">No override — uses branch defaults</span>
        </div>
        {canEdit && (
          <button
            onClick={onCreate}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>
    );
  }

  const minStr = fmtNum(row.minOnHand);
  const targetStr = fmtNum(row.targetOnHand);
  return (
    <div className="bg-slate-900/40 rounded px-3 py-2 border border-slate-800 text-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-cyan-300 text-xs w-12">{branch}</span>
          {row.category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {row.category}
            </span>
          )}
          {row.isCritical && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-medium">
              <Star className="w-2.5 h-2.5" /> Critical
            </span>
          )}
          {row.isPaused && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-medium">
              <Pause className="w-2.5 h-2.5" /> Paused
            </span>
          )}
        </div>
        {canEdit && (
          <button onClick={onEdit} className="text-slate-400 hover:text-cyan-300 p-1" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-[11px] text-slate-400 pl-14">
        <div>Min: <span className="text-slate-200 font-mono">{minStr ?? '—'}</span></div>
        <div>Target: <span className="text-slate-200 font-mono">{targetStr ?? '—'}</span></div>
        {row.safetyStockDays != null && (
          <div>Safety: <span className="text-slate-200 font-mono">{row.safetyStockDays}d</span></div>
        )}
        {row.packQty != null && (
          <div>Pack: <span className="text-slate-200 font-mono">{Number(row.packQty)}</span></div>
        )}
        {row.preferredSupplier && (
          <div className="sm:col-span-2">Pref. supplier: <span className="text-slate-200 font-mono">{row.preferredSupplier}</span></div>
        )}
      </div>
      {row.notes && (
        <div className="text-[11px] text-slate-500 italic pl-14 mt-1">{row.notes}</div>
      )}
    </div>
  );
}

function Field({ label, help, className, children }: { label: string; help?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
      {help && <p className="text-[10px] text-slate-600 mt-0.5">{help}</p>}
    </div>
  );
}
