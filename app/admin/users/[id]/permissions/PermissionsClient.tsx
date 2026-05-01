'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Save, Shield, Check, X } from 'lucide-react';
import Link from 'next/link';
// ─── Tab definitions ──────────────────────────────────────────────────────────
// Capability codes are string literals here — do NOT import from access-control.ts
// in this client component; that module re-exports auth.ts which pulls in
// the postgres package (Node-only), breaking the browser bundle.

interface CapabilityDef {
  code: string;
  label: string;
  desc: string;
}

const TABS: { id: string; label: string; caps: CapabilityDef[] }[] = [
  {
    id: 'pages',
    label: 'Pages & Menus',
    caps: [
      { code: 'yard.view',             label: 'Yard View',             desc: 'Access to picks board, open picks, picker stats, work orders' },
      { code: 'dispatch.view',         label: 'Dispatch View',         desc: 'Access to dispatch board, delivery tracker, fleet map' },
      { code: 'sales.view',            label: 'Sales View',            desc: 'Access to sales hub, customers, transactions, orders' },
      { code: 'credits.view',          label: 'Credits View',          desc: 'Access to RMA credits list' },
      { code: 'purchasing.view',       label: 'Purchasing View',       desc: 'Access to buyer workspace, open POs, command center' },
      { code: 'ar.view',              label: 'AR View',               desc: 'Access to accounts receivable data' },
      { code: 'admin.audit.view',      label: 'Admin — Audit Log',     desc: 'Access to the audit log page' },
      { code: 'admin.products.view',   label: 'Admin — Products/SKUs', desc: 'Access to product and SKU management' },
      { code: 'admin.customers.view',  label: 'Admin — Customers',     desc: 'Access to admin customer detail pages' },
      { code: 'branch.all',            label: 'All Branches',          desc: 'Can view data across all branches (not scoped to own branch)' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    caps: [
      { code: 'picks.release',         label: 'Release Picks',         desc: 'Release pick files for warehouse orders' },
      { code: 'pickers.manage',        label: 'Manage Pickers',        desc: 'Add, edit, delete picker accounts' },
      { code: 'workorders.assign',     label: 'Assign Work Orders',    desc: 'Assign and complete work orders' },
      { code: 'dispatch.manage',       label: 'Manage Dispatch',       desc: 'Create routes, mark deliveries complete, POD signatures' },
      { code: 'customers.notes.write', label: 'Write Customer Notes',  desc: 'Add and edit notes on customer profiles' },
      { code: 'orders.push_to_erp',    label: 'Push Orders to ERP',    desc: 'Create or cancel sales orders in Agility' },
      { code: 'quotes.manage',         label: 'Manage Quotes',         desc: 'Create and release Agility quotes' },
      { code: 'bids.manage',           label: 'Manage Bids',           desc: 'Create, edit, and manage estimating bids' },
      { code: 'designs.manage',        label: 'Manage Designs',        desc: 'Create, edit, and manage design records' },
      { code: 'ewp.manage',            label: 'Manage EWP',            desc: 'Create, edit, and manage EWP records' },
      { code: 'projects.manage',       label: 'Manage Projects',       desc: 'Create, edit, and manage estimating projects' },
      { code: 'purchasing.receive',    label: 'Receive POs',           desc: 'Submit PO check-ins and receiving records' },
      { code: 'purchasing.review',     label: 'Review PO Submissions', desc: 'Access the purchasing review queue' },
      { code: 'credits.manage',        label: 'Manage Credits',        desc: 'Upload documents and manage RMA credit records' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    caps: [
      { code: 'admin.users.manage',    label: 'Manage Users',          desc: 'Add, edit, deactivate users and change permissions' },
      { code: 'admin.config.manage',   label: 'Manage Config',         desc: 'Edit bid fields, formulas, and system configuration' },
      { code: 'admin.jobs.review',     label: 'Review Jobs',           desc: 'Access the admin job review (SO GPS status) page' },
      { code: 'hubbell.review',        label: 'Hubbell Review',        desc: 'Access Hubbell email reconciliation tool' },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type CapState = 'inherited' | 'granted' | 'revoked';

interface UserData {
  id: string;
  name: string;
  username: string | null;
  email: string;
  roles: string[];
  isActive: boolean;
}

interface PermissionsData {
  user: UserData;
  granted_capabilities: string[];
  revoked_capabilities: string[];
  effective_capabilities: string[];
  role_defaults: Record<string, string[]>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PermissionsClient() {
  const params = useParams();
  const userId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [data, setData] = useState<PermissionsData | null>(null);
  const [activeTab, setActiveTab] = useState('pages');
  // Map of capability code → UI state
  const [capStates, setCapStates] = useState<Record<string, CapState>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`);
      if (!res.ok) { setError('Failed to load'); return; }
      const d: PermissionsData = await res.json();
      setData(d);

      // Build initial capStates from granted/revoked arrays
      const states: Record<string, CapState> = {};
      const grantedSet = new Set(d.granted_capabilities);
      const revokedSet = new Set(d.revoked_capabilities);
      for (const tab of TABS) {
        for (const { code } of tab.caps) {
          if (grantedSet.has(code)) states[code] = 'granted';
          else if (revokedSet.has(code)) states[code] = 'revoked';
          else states[code] = 'inherited';
        }
      }
      setCapStates(states);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const granted = Object.entries(capStates).filter(([, s]) => s === 'granted').map(([c]) => c);
      const revoked = Object.entries(capStates).filter(([, s]) => s === 'revoked').map(([c]) => c);
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: data.user.roles,
          granted_capabilities: granted,
          revoked_capabilities: revoked,
        }),
      });
      if (!res.ok) { const e = await res.json(); setError(e.error ?? 'Failed to save'); return; }
      const updated = await res.json();
      setData((prev) => prev ? {
        ...prev,
        granted_capabilities: updated.granted_capabilities,
        revoked_capabilities: updated.revoked_capabilities,
        effective_capabilities: updated.effective_capabilities,
      } : prev);
      setSuccess('Permissions saved. Changes take effect on the user\'s next sign-in.');
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const cycleState = (code: string) => {
    setCapStates((prev) => {
      const cur = prev[code] ?? 'inherited';
      const next: CapState = cur === 'inherited' ? 'granted' : cur === 'granted' ? 'revoked' : 'inherited';
      return { ...prev, [code]: next };
    });
    setSuccess('');
  };

  if (loading) return <div className="max-w-3xl p-8 text-slate-400">Loading...</div>;
  if (!data) return <div className="max-w-3xl p-8 text-red-400">{error || 'User not found'}</div>;

  const { user } = data;
  const effectiveSet = new Set(data.effective_capabilities);
  const roleDefaultSet = new Set(
    user.roles.flatMap((r) => data.role_defaults[r] ?? [])
  );

  const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            {user.name}
          </h2>
          <p className="text-sm text-slate-400">
            {user.email}
            {user.username && <> · <span className="font-mono">{user.username}</span></>}
            {' · '}
            <span className="capitalize">{user.roles.join(', ') || 'no role'}</span>
          </p>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">{success}</div>}

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded border border-slate-600 bg-slate-800 flex items-center justify-center text-slate-500">—</span>
          Inherited (from role)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded border border-cyan-500 bg-cyan-900/40 flex items-center justify-center">
            <Check className="w-3 h-3 text-cyan-400" />
          </span>
          Granted (explicit)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded border border-red-700 bg-red-900/30 flex items-center justify-center">
            <X className="w-3 h-3 text-red-400" />
          </span>
          Revoked (explicit)
        </span>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 mb-4">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white border-t border-x border-white/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Capability rows */}
      <div className="admin-card divide-y divide-white/5">
        {currentTab.caps.map(({ code, label, desc }) => {
          const state = capStates[code] ?? 'inherited';
          const isEffective = effectiveSet.has(code);
          const isFromRole = roleDefaultSet.has(code);

          return (
            <div key={code} className="flex items-center gap-3 px-4 py-3">
              {/* 3-state toggle button */}
              <button
                onClick={() => cycleState(code)}
                title="Click to cycle: Inherited → Granted → Revoked"
                className={`w-9 h-6 rounded border flex items-center justify-center shrink-0 transition ${
                  state === 'granted'
                    ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400'
                    : state === 'revoked'
                    ? 'bg-red-900/30 border-red-700 text-red-400'
                    : 'bg-slate-800 border-slate-600 text-slate-500'
                }`}
              >
                {state === 'granted' ? <Check className="w-3.5 h-3.5" /> :
                 state === 'revoked' ? <X className="w-3.5 h-3.5" /> :
                 <span className="text-xs">—</span>}
              </button>

              {/* Label + inherited hint */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200 font-medium">{label}</span>
                  {isFromRole && state === 'inherited' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                      from {user.roles.filter((r) => (data.role_defaults[r] ?? []).includes(code)).join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                <p className="text-[10px] text-slate-600 font-mono mt-0.5">{code}</p>
              </div>

              {/* Effective dot */}
              <div
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${isEffective ? 'bg-green-400' : 'bg-slate-700'}`}
                title={isEffective ? 'Effective: granted' : 'Effective: denied'}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Green dot = capability is currently effective for this user. Changes take effect on the user&apos;s next sign-in (JWT refresh).
      </p>

      <div className="flex justify-end mt-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Permissions'}
        </button>
      </div>
    </div>
  );
}
