'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Edit2, Power, X, AlertCircle, Handshake } from 'lucide-react';
import {
  fetchRebatePrograms,
  createRebateProgram,
  updateRebateProgram,
  toggleRebateProgram,
} from './actions';
import type { RebateProgramRow, VendorOption, ProgramInput } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Structure = 'rate' | 'flat' | 'tiered';
type FormTier = { threshold: string; ratePct: string };

type FormState = {
  supplierKey: string;
  programName: string;
  programType: string;
  periodStart: string;
  periodEnd: string;
  payoutTiming: string;
  milestoneLabel: string;
  productGroup: string;
  isActive: boolean;
  structure: Structure;
  targetAmount: string;
  rebateRatePct: string;
  rebateAmountFlat: string;
  tiers: FormTier[];
};

const EMPTY_FORM: FormState = {
  supplierKey: '',
  programName: '',
  programType: 'volume_tier',
  periodStart: '',
  periodEnd: '',
  payoutTiming: 'annually',
  milestoneLabel: '',
  productGroup: '',
  isActive: true,
  structure: 'rate',
  targetAmount: '',
  rebateRatePct: '',
  rebateAmountFlat: '',
  tiers: [{ threshold: '', ratePct: '' }],
};

const PROG_TYPE_OPTIONS = [
  { id: 'volume_tier', label: 'Volume / Tier' },
  { id: 'growth',      label: 'Growth' },
  { id: 'mix_attach',  label: 'Mix / Attach' },
  { id: 'other',       label: 'Other' },
];

const PAYOUT_OPTIONS = [
  { id: 'annually',   label: 'Annually' },
  { id: 'quarterly',  label: 'Quarterly' },
  { id: 'monthly',    label: 'Monthly' },
  { id: 'on_invoice', label: 'On Invoice' },
  { id: 'milestone',  label: 'Milestone' },
];

const STRUCTURE_OPTIONS = [
  { id: 'rate',   label: 'Flat Rate %' },
  { id: 'flat',   label: 'Flat Amount $' },
  { id: 'tiered', label: 'Tiered by Spend' },
];

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

function programToForm(p: RebateProgramRow): FormState {
  let structure: Structure = 'rate';
  if (p.tierBreakpoints && p.tierBreakpoints.length > 0) structure = 'tiered';
  else if (p.rebateAmountFlat != null) structure = 'flat';
  return {
    supplierKey: p.supplierKey,
    programName: p.programName,
    programType: p.programType,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    payoutTiming: p.payoutTiming,
    milestoneLabel: p.milestoneLabel ?? '',
    productGroup: p.productGroup ?? '',
    isActive: p.isActive,
    structure,
    targetAmount: p.targetAmount != null ? String(p.targetAmount) : '',
    rebateRatePct: p.rebateRatePct != null ? String(p.rebateRatePct) : '',
    rebateAmountFlat: p.rebateAmountFlat != null ? String(p.rebateAmountFlat) : '',
    tiers: p.tierBreakpoints?.length
      ? p.tierBreakpoints.map((t) => ({ threshold: String(t.threshold), ratePct: String(t.rate_pct) }))
      : [{ threshold: '', ratePct: '' }],
  };
}

function formToInput(form: FormState): ProgramInput {
  const toNum = (s: string) => (s !== '' ? Number(s) : null);
  let targetAmount = toNum(form.targetAmount);
  let rebateRatePct: number | null = null;
  let rebateAmountFlat: number | null = null;
  let tierBreakpoints: { threshold: number; rate_pct: number }[] | null = null;

  if (form.structure === 'rate') {
    rebateRatePct = toNum(form.rebateRatePct);
  } else if (form.structure === 'flat') {
    rebateAmountFlat = toNum(form.rebateAmountFlat);
  } else {
    tierBreakpoints = form.tiers
      .filter((t) => t.threshold !== '' && t.ratePct !== '')
      .map((t) => ({ threshold: Number(t.threshold), rate_pct: Number(t.ratePct) }))
      .sort((a, b) => a.threshold - b.threshold);
    targetAmount = null;
  }

  return {
    supplierKey: form.supplierKey,
    programName: form.programName,
    programType: form.programType,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    targetAmount,
    rebateRatePct,
    rebateAmountFlat,
    productGroup: form.productGroup || null,
    payoutTiming: form.payoutTiming,
    milestoneLabel: form.milestoneLabel || null,
    tierBreakpoints,
    isActive: form.isActive,
  };
}

function fmtRule(p: RebateProgramRow): string {
  if (p.tierBreakpoints?.length) {
    const tiers = p.tierBreakpoints
      .sort((a, b) => a.threshold - b.threshold)
      .map((t) => `${t.rate_pct}% ≥$${(t.threshold / 1000).toFixed(0)}K`)
      .join(' → ');
    return tiers;
  }
  if (p.rebateRatePct != null) {
    const target = p.targetAmount ? ` on ≥$${(p.targetAmount / 1_000_000).toFixed(1)}M` : '';
    return `${p.rebateRatePct}%${target}`;
  }
  if (p.rebateAmountFlat != null) {
    return `$${p.rebateAmountFlat.toLocaleString()} flat`;
  }
  return '—';
}

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block mb-1.5"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--panel-2)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  outline: 'none',
};

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2 text-sm rounded"
      style={{ ...INPUT_STYLE, ...props.style }}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full px-3 py-2 text-sm rounded"
      style={{ ...INPUT_STYLE, ...props.style }}
    />
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="px-3 py-1.5 text-xs font-medium rounded transition"
          style={{
            background: value === o.id ? 'rgba(31,138,79,0.2)' : 'var(--panel-2)',
            border: `1px solid ${
              value === o.id ? 'var(--green-bright)' : 'var(--line)'
            }`,
            color: value === o.id ? 'var(--green-bright)' : 'var(--text-3)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SectionBlock({
  tag,
  color,
  children,
}: {
  tag: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)' }}
      >
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ background: color + '22', color, border: `1px solid ${color}44` }}
        >
          {tag}
        </span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendor combobox
// ---------------------------------------------------------------------------

function VendorCombobox({
  vendors,
  value,
  onChange,
}: {
  vendors: VendorOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = vendors.find((v) => v.key === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return (q
      ? vendors.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.code.toLowerCase().includes(q) ||
            v.key.toLowerCase().includes(q),
        )
      : vendors
    ).slice(0, 25);
  }, [vendors, query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selected ? `${selected.name} (${selected.code})` : ''}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search vendors…"
        className="w-full px-3 py-2 text-sm rounded"
        style={INPUT_STYLE}
      />
      {open && filtered.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded shadow-2xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          {filtered.map((v) => (
            <button
              key={v.key}
              type="button"
              onMouseDown={() => {
                onChange(v.key);
                setOpen(false);
              }}
              className="w-full flex items-baseline gap-2 text-left px-3 py-2 text-sm transition hover:bg-slate-700"
            >
              <span style={{ color: v.key === value ? 'var(--green-bright)' : 'var(--text)' }}>
                {v.name}
              </span>
              <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>
                {v.code}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RebatesClient({
  initialPrograms,
  vendors,
  productGroups,
}: {
  initialPrograms: RebateProgramRow[];
  vendors: VendorOption[];
  productGroups: string[];
}) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [editing, setEditing] = useState<RebateProgramRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const upd = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  async function refresh() {
    const fresh = await fetchRebatePrograms();
    setPrograms(fresh);
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing('new');
    setError(null);
  }

  function openEdit(p: RebateProgramRow) {
    setForm(programToForm(p));
    setEditing(p);
    setError(null);
  }

  function validate(): string | null {
    if (!form.supplierKey) return 'Vendor is required.';
    if (!form.programName.trim()) return 'Program name is required.';
    if (!form.periodStart || !form.periodEnd) return 'Period start and end are required.';
    if (form.periodEnd < form.periodStart) return 'Period end must be after period start.';
    if (form.structure === 'rate' && !form.rebateRatePct) return 'Rebate rate % is required.';
    if (form.structure === 'flat' && !form.rebateAmountFlat) return 'Rebate amount is required.';
    if (form.structure === 'tiered') {
      const complete = form.tiers.filter((t) => t.threshold && t.ratePct);
      if (complete.length === 0) return 'At least one complete tier is required.';
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      const input = formToInput(form);
      if (editing === 'new') {
        await createRebateProgram(input);
      } else {
        await updateRebateProgram((editing as RebateProgramRow).id, input);
      }
      await refresh();
      setEditing(null);
    } catch {
      setError('Save failed. Please check your inputs and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, current: boolean) {
    await toggleRebateProgram(id, !current);
    await refresh();
  }

  const visible = programs.filter((p) =>
    filter === 'all' ? true : filter === 'active' ? p.isActive : !p.isActive,
  );

  const counts = {
    active: programs.filter((p) => p.isActive).length,
    inactive: programs.filter((p) => !p.isActive).length,
    all: programs.length,
  };

  // Tiers update helper
  function setTier(i: number, field: keyof FormTier, val: string) {
    const tiers = form.tiers.map((t, j) => (j === i ? { ...t, [field]: val } : t));
    upd('tiers', tiers);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Page header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}
      >
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Handshake className="w-5 h-5" style={{ color: 'var(--green-bright)' }} />
            Rebate Rules
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {counts.active} active program{counts.active !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition"
          style={{ background: 'var(--green)', color: 'white' }}
        >
          <Plus className="w-4 h-4" />
          New Program
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 px-6" style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
        {(['active', 'inactive', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 pb-2 pt-2.5 text-sm font-medium capitalize transition"
            style={{
              color: filter === f ? 'var(--text)' : 'var(--text-3)',
              borderBottom: filter === f ? '2px solid var(--green-bright)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Program list */}
      <div className="p-6 max-w-screen-xl mx-auto">
        {visible.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-3)' }}>
            <Handshake className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No programs.</p>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="text-sm underline mt-1" style={{ color: 'var(--green-bright)' }}>
                Show all
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
                  {['Vendor', 'Program', 'Type', 'Product Group', 'Rule', 'Period', 'Payout', 'Status', ''].map(
                    (h) => (
                      <th
                        key={h}
                        className="py-2.5 px-4 text-left"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '1px solid var(--line-soft)' }}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium" style={{ color: 'var(--text)' }}>
                        {p.supplierName}
                      </div>
                      <div className="text-xs mono" style={{ color: 'var(--text-3)' }}>
                        {p.supplierKey}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium" style={{ color: 'var(--text)' }}>
                      {p.programName}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--panel-2)',
                          color: 'var(--text-3)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        {PROG_TYPE_OPTIONS.find((o) => o.id === p.programType)?.label ?? p.programType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm" style={{ color: 'var(--text-2)' }}>
                      {p.productGroup ?? (
                        <span style={{ color: 'var(--text-4)' }}>All groups</span>
                      )}
                    </td>
                    <td className="py-3 px-4 mono text-xs font-medium" style={{ color: 'var(--green-bright)' }}>
                      {fmtRule(p)}
                    </td>
                    <td className="py-3 px-4 text-xs mono" style={{ color: 'var(--text-3)' }}>
                      {p.periodStart} → {p.periodEnd}
                    </td>
                    <td className="py-3 px-4 text-xs capitalize" style={{ color: 'var(--text-3)' }}>
                      {p.payoutTiming.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.isActive
                            ? 'text-emerald-400 bg-emerald-900/20'
                            : 'text-slate-500 bg-slate-800'
                        }`}
                      >
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded transition hover:bg-slate-700"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                        </button>
                        <button
                          onClick={() => handleToggle(p.id, p.isActive)}
                          className="p-1.5 rounded transition hover:bg-slate-700"
                          title={p.isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power
                            className={`w-3.5 h-3.5 ${
                              p.isActive ? 'text-emerald-400' : 'text-slate-600'
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-out form */}
      {editing !== null && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setEditing(null)}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 flex flex-col"
            style={{
              width: 560,
              background: 'var(--panel)',
              borderLeft: '1px solid var(--line)',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
            }}
          >
            {/* Form header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                {editing === 'new' ? 'New Rebate Program' : 'Edit Program'}
              </p>
              <button onClick={() => setEditing(null)}>
                <X className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* IF block */}
              <SectionBlock tag="IF" color="#60a5fa">
                <Field label="Vendor" required>
                  <VendorCombobox
                    vendors={vendors}
                    value={form.supplierKey}
                    onChange={(v) => upd('supplierKey', v)}
                  />
                </Field>

                <Field label="Product Group">
                  <SelectInput
                    value={form.productGroup}
                    onChange={(e) => upd('productGroup', e.target.value)}
                  >
                    <option value="">All Product Groups</option>
                    {productGroups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </SelectInput>
                </Field>

                <Field label="Program Type">
                  <RadioGroup
                    options={PROG_TYPE_OPTIONS}
                    value={form.programType}
                    onChange={(v) => upd('programType', v)}
                  />
                </Field>
              </SectionBlock>

              {/* THEN block */}
              <SectionBlock tag="THEN" color="#4ade80">
                <Field label="Rebate Structure">
                  <RadioGroup
                    options={STRUCTURE_OPTIONS}
                    value={form.structure}
                    onChange={(v) => upd('structure', v as Structure)}
                  />
                </Field>

                {form.structure === 'rate' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Rebate Rate %" required>
                      <div className="relative">
                        <TextInput
                          type="number"
                          min="0" max="100" step="0.01"
                          value={form.rebateRatePct}
                          onChange={(e) => upd('rebateRatePct', e.target.value)}
                          placeholder="e.g. 2.5"
                        />
                        <span
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                          style={{ color: 'var(--text-3)' }}
                        >
                          %
                        </span>
                      </div>
                    </Field>
                    <Field label="Spend Target (optional)">
                      <div className="relative">
                        <span
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                          style={{ color: 'var(--text-3)' }}
                        >
                          $
                        </span>
                        <TextInput
                          type="number" min="0"
                          value={form.targetAmount}
                          onChange={(e) => upd('targetAmount', e.target.value)}
                          placeholder="e.g. 500000"
                          style={{ paddingLeft: '1.5rem' }}
                        />
                      </div>
                    </Field>
                  </div>
                )}

                {form.structure === 'flat' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Rebate Amount" required>
                      <div className="relative">
                        <span
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                          style={{ color: 'var(--text-3)' }}
                        >
                          $
                        </span>
                        <TextInput
                          type="number" min="0"
                          value={form.rebateAmountFlat}
                          onChange={(e) => upd('rebateAmountFlat', e.target.value)}
                          placeholder="e.g. 25000"
                          style={{ paddingLeft: '1.5rem' }}
                        />
                      </div>
                    </Field>
                    <Field label="Spend Target (optional)">
                      <div className="relative">
                        <span
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                          style={{ color: 'var(--text-3)' }}
                        >
                          $
                        </span>
                        <TextInput
                          type="number" min="0"
                          value={form.targetAmount}
                          onChange={(e) => upd('targetAmount', e.target.value)}
                          placeholder="e.g. 500000"
                          style={{ paddingLeft: '1.5rem' }}
                        />
                      </div>
                    </Field>
                  </div>
                )}

                {form.structure === 'tiered' && (
                  <div className="space-y-2">
                    <div
                      className="grid gap-2 text-[10px] font-semibold uppercase tracking-wider pb-1"
                      style={{ gridTemplateColumns: '1fr 1fr auto', color: 'var(--text-3)' }}
                    >
                      <span>Spend Threshold ≥</span>
                      <span>Rebate Rate</span>
                      <span />
                    </div>
                    {form.tiers.map((tier, i) => (
                      <div
                        key={i}
                        className="grid gap-2 items-center"
                        style={{ gridTemplateColumns: '1fr 1fr auto' }}
                      >
                        <div className="relative">
                          <span
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                            style={{ color: 'var(--text-3)' }}
                          >
                            $
                          </span>
                          <TextInput
                            type="number" min="0"
                            value={tier.threshold}
                            onChange={(e) => setTier(i, 'threshold', e.target.value)}
                            placeholder="500000"
                            style={{ paddingLeft: '1.5rem' }}
                          />
                        </div>
                        <div className="relative">
                          <TextInput
                            type="number" min="0" max="100" step="0.01"
                            value={tier.ratePct}
                            onChange={(e) => setTier(i, 'ratePct', e.target.value)}
                            placeholder="2.5"
                          />
                          <span
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                            style={{ color: 'var(--text-3)' }}
                          >
                            %
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            form.tiers.length > 1 &&
                            upd('tiers', form.tiers.filter((_, j) => j !== i))
                          }
                          disabled={form.tiers.length <= 1}
                          className="p-1.5 rounded hover:bg-slate-700 transition disabled:opacity-30"
                        >
                          <X className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        upd('tiers', [...form.tiers, { threshold: '', ratePct: '' }])
                      }
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition mt-1"
                      style={{
                        color: 'var(--green-bright)',
                        border: '1px dashed var(--green-bright)',
                      }}
                    >
                      <Plus className="w-3 h-3" /> Add Tier
                    </button>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>
                      Each tier represents the rebate rate earned once cumulative spend crosses that threshold.
                    </p>
                  </div>
                )}
              </SectionBlock>

              {/* Program Details block */}
              <SectionBlock tag="DETAILS" color="#a78bfa">
                <Field label="Program Name" required>
                  <TextInput
                    type="text"
                    value={form.programName}
                    onChange={(e) => upd('programName', e.target.value)}
                    placeholder="e.g. Weyerhaeuser 2026 Volume Rebate"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Period Start" required>
                    <TextInput
                      type="date"
                      value={form.periodStart}
                      onChange={(e) => upd('periodStart', e.target.value)}
                    />
                  </Field>
                  <Field label="Period End" required>
                    <TextInput
                      type="date"
                      value={form.periodEnd}
                      onChange={(e) => upd('periodEnd', e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Payout Timing">
                  <RadioGroup
                    options={PAYOUT_OPTIONS}
                    value={form.payoutTiming}
                    onChange={(v) => upd('payoutTiming', v)}
                  />
                </Field>

                {form.payoutTiming === 'milestone' && (
                  <Field label="Milestone Description">
                    <TextInput
                      type="text"
                      value={form.milestoneLabel}
                      onChange={(e) => upd('milestoneLabel', e.target.value)}
                      placeholder="e.g. End of calendar year"
                    />
                  </Field>
                )}

                <Field label="Status">
                  <RadioGroup
                    options={[
                      { id: 'true',  label: 'Active' },
                      { id: 'false', label: 'Inactive' },
                    ]}
                    value={String(form.isActive)}
                    onChange={(v) => upd('isActive', v === 'true')}
                  />
                </Field>
              </SectionBlock>

              {error && (
                <div
                  className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm"
                  style={{
                    background: 'rgba(220,38,38,0.1)',
                    border: '1px solid rgba(220,38,38,0.3)',
                    color: '#f87171',
                  }}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Sticky footer */}
            <div
              className="flex items-center justify-end gap-3 px-5 py-4"
              style={{ borderTop: '1px solid var(--line)', background: 'var(--panel)' }}
            >
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg text-sm transition"
                style={{
                  color: 'var(--text-3)',
                  border: '1px solid var(--line)',
                  background: 'var(--panel-2)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-medium transition"
                style={{ background: 'var(--green)', color: 'white', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : editing === 'new' ? 'Create Program' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
