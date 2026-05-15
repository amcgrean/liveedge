'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  category: string;
  risk: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  operations: 'Operations',
  dispatch: 'Dispatch',
  sales: 'Sales',
  estimating: 'Estimating',
  purchasing: 'Purchasing',
  accounting: 'Accounting',
  admin: 'Admin',
  'cross-cutting': 'Cross-cutting',
};

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
  const [activeTab, setActiveTab] = useState('operations');
  // Map of capability code → UI state
  const [capStates, setCapStates] = useState<Record<string, CapState>>({});
  const [capabilities, setCapabilities] = useState<CapabilityDef[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, { signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Error ${res.status}: ${(body as { error?: string }).error ?? 'Failed to load'}`);
        return;
      }
      const d: PermissionsData = await res.json();
      const capsRes = await fetch('/api/admin/capabilities', { signal: controller.signal });
      if (!capsRes.ok) {
        const body = await capsRes.json().catch(() => ({}));
        setError(`Error ${capsRes.status}: ${(body as { error?: string }).error ?? 'Failed to load capability catalog'}`);
        return;
      }
      const capsBody = await capsRes.json() as { capabilities?: Array<{ code: string; label: string; description: string; category: string; risk: string }> };
      const catalog = (capsBody.capabilities ?? []).map((c) => ({
        code: c.code,
        label: c.label,
        desc: c.description,
        category: c.category,
        risk: c.risk,
      }));
      setData(d);
      setCapabilities(catalog);

      // Build initial capStates from granted/revoked arrays
      const states: Record<string, CapState> = {};
      const grantedSet = new Set(d.granted_capabilities);
      const revokedSet = new Set(d.revoked_capabilities);
      for (const { code } of catalog) {
        if (grantedSet.has(code)) states[code] = 'granted';
        else if (revokedSet.has(code)) states[code] = 'revoked';
        else states[code] = 'inherited';
      }
      setCapStates(states);
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') {
        setError('Request timed out — the server is slow. Please try again.');
      } else {
        setError('Network error — please check your connection and try again.');
      }
    }
    finally { clearTimeout(timeout); setLoading(false); }
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

  const tabs = useMemo(
    () => Object.entries(
      capabilities.reduce<Record<string, CapabilityDef[]>>((acc, cap) => {
        (acc[cap.category] ||= []).push(cap);
        return acc;
      }, {})
    ).map(([id, caps]) => ({ id, label: CATEGORY_LABELS[id] ?? id, caps })),
    [capabilities]
  );

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  if (loading) return <div className="max-w-3xl p-8 text-slate-400">Loading…</div>;
  if (!data) return (
    <div className="max-w-3xl p-8">
      <p className="text-red-400 mb-4">{error || 'User not found'}</p>
      {error && (
        <button onClick={() => fetchData()} className="btn-secondary text-sm">
          Retry
        </button>
      )}
    </div>
  );

  const { user } = data;
  const effectiveSet = new Set(data.effective_capabilities);
  const roleDefaultSet = new Set(
    user.roles.flatMap((r) => data.role_defaults[r] ?? [])
  );

  const tabs = Object.entries(
    capabilities.reduce<Record<string, CapabilityDef[]>>((acc, cap) => {
      (acc[cap.category] ||= []).push(cap);
      return acc;
    }, {})
  ).map(([id, caps]) => ({ id, label: CATEGORY_LABELS[id] ?? id, caps }));

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

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
          {tabs.map((tab) => (
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
        {currentTab?.caps.map(({ code, label, desc, risk }) => {
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
                <p className="text-[10px] text-amber-400/80 mt-0.5 uppercase tracking-wide">risk: {risk}</p>
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
