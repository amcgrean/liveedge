'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from 'next-auth';
import { useParams, useRouter } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Props { session: Session; }

export default function ManageEWPClient({ session }: Props) {
  const params = useParams();
  const router = useRouter();
  const ewpId = params.id as string;

  const [ewp, setEwp] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<Record<string, unknown>>({});

  const fetchEWP = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ewp/${ewpId}`);
      if (!res.ok) { setError('EWP not found'); return; }
      const data = await res.json();
      setEwp(data);
      setForm({
        planNumber: data.planNumber ?? '',
        address: data.address ?? '',
        tjiDepth: data.tjiDepth ?? '',
        assignedDesigner: data.assignedDesigner ?? '',
        layoutFinalized: data.layoutFinalized ? new Date(data.layoutFinalized as string).toISOString().split('T')[0] : '',
        agilityQuote: data.agilityQuote ? new Date(data.agilityQuote as string).toISOString().split('T')[0] : '',
        importedStellar: data.importedStellar ? new Date(data.importedStellar as string).toISOString().split('T')[0] : '',
        notes: data.notes ?? '',
      });
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, [ewpId]);

  useEffect(() => { fetchEWP(); }, [fetchEWP]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/ewp/${ewpId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return; }
      setSuccess('EWP saved'); fetchEWP();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this EWP?')) return;
    await fetch(`/api/ewp/${ewpId}`, { method: 'DELETE' });
    router.push('/ewp');
  };

  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <div className="max-w-4xl mx-auto px-4 py-8 text-gray-400">Loading...</div>
    </div>
  );

  if (!ewp) return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <div className="max-w-4xl mx-auto px-4 py-8 text-red-400">{error || 'Not found'}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/ewp" className="p-2 rounded-lg hover:bg-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-xl font-bold">{ewp.planNumber as string}</h1>
              <p className="text-sm text-gray-400">
                {ewp.customerName as string} | {ewp.address as string}
              </p>
            </div>
          </div>
          <button onClick={handleDelete} className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg text-sm">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">{success}</div>}

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Plan Number</label>
              <input type="text" value={(form.planNumber as string) ?? ''} onChange={(e) => setField('planNumber', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">TJI Depth</label>
              <input type="text" value={(form.tjiDepth as string) ?? ''} onChange={(e) => setField('tjiDepth', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Address</label>
            <input type="text" value={(form.address as string) ?? ''} onChange={(e) => setField('address', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Assigned Designer</label>
            <input type="text" value={(form.assignedDesigner as string) ?? ''} onChange={(e) => setField('assignedDesigner', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Layout Finalized</label>
              <input type="date" value={(form.layoutFinalized as string) ?? ''} onChange={(e) => setField('layoutFinalized', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Agility Quote</label>
              <input type="date" value={(form.agilityQuote as string) ?? ''} onChange={(e) => setField('agilityQuote', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Imported Stellar</label>
              <input type="date" value={(form.importedStellar as string) ?? ''} onChange={(e) => setField('importedStellar', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea value={(form.notes as string) ?? ''} onChange={(e) => setField('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500 resize-y" />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-medium">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </main>
    </div>
  );
}
