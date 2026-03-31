'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Shield } from 'lucide-react';
import Link from 'next/link';

const PERM_LABELS: Record<string, string> = {
  admin: 'Admin',
  estimating: 'Estimating',
  bidRequest: 'Bid Request',
  design: 'Design',
  ewp: 'EWP',
  service: 'Service',
  install: 'Install',
  picking: 'Picking',
  workOrders: 'Work Orders',
  dashboards: 'Dashboards',
  security10: 'Security 10',
  security11: 'Security 11',
  security12: 'Security 12',
  security13: 'Security 13',
  security14: 'Security 14',
  security15: 'Security 15',
  security16: 'Security 16',
  security17: 'Security 17',
  security18: 'Security 18',
  security19: 'Security 19',
  security20: 'Security 20',
};

const PERM_KEYS = Object.keys(PERM_LABELS);

interface UserType { id: number; name: string; }

export default function PermissionsClient() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState<{ id: number; username: string; email: string; usertypeId: number; userTypeName: string | null } | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [userTypes, setUserTypes] = useState<UserType[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`);
      if (!res.ok) { setError('Failed to load'); return; }
      const data = await res.json();
      setUser(data.user);
      setUserTypes(data.userTypes ?? []);
      if (data.permissions) {
        const p: Record<string, boolean> = {};
        for (const k of PERM_KEYS) p[k] = data.permissions[k] ?? false;
        setPerms(p);
      } else {
        const p: Record<string, boolean> = {};
        for (const k of PERM_KEYS) p[k] = false;
        setPerms(p);
      }
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: perms }),
      });
      if (!res.ok) { setError('Failed to save'); return; }
      setSuccess('Permissions saved');
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const handleUserTypeChange = async (newTypeId: number) => {
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usertypeId: newTypeId }),
      });
      fetchData();
    } catch { setError('Failed to update user type'); }
    finally { setSaving(false); }
  };

  const toggleAll = (val: boolean) => {
    const p: Record<string, boolean> = {};
    for (const k of PERM_KEYS) p[k] = val;
    setPerms(p);
  };

  if (loading) return <div className="max-w-3xl p-8 text-slate-400">Loading...</div>;
  if (!user) return <div className="max-w-3xl p-8 text-red-400">{error || 'User not found'}</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" /> {user.username}
          </h2>
          <p className="text-sm text-slate-400">{user.email} | Type: {user.userTypeName ?? 'Unknown'}</p>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">{success}</div>}

      <div className="admin-card p-4 mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-1">User Type</label>
        <select value={user.usertypeId} onChange={(e) => handleUserTypeChange(Number(e.target.value))}
          className="px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 focus:border-cyan-400 focus:outline-none">
          {userTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="admin-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Permission Flags</h3>
          <div className="flex gap-2">
            <button onClick={() => toggleAll(true)} className="text-xs px-2 py-1 rounded bg-cyan-900/40 text-cyan-400 hover:bg-cyan-900/60">All On</button>
            <button onClick={() => toggleAll(false)} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700">All Off</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PERM_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
              <input type="checkbox" checked={perms[k] ?? false} onChange={(e) => setPerms((p) => ({ ...p, [k]: e.target.checked }))}
                className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500" />
              {PERM_LABELS[k]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Permissions'}
        </button>
      </div>
    </div>
  );
}
