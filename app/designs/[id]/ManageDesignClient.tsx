'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from 'next-auth';
import { useParams, useRouter } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Props { session: Session; }

export default function ManageDesignClient({ session }: Props) {
  const params = useParams();
  const router = useRouter();
  const designId = params.id as string;

  const [design, setDesign] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [designers, setDesigners] = useState<{ id: number; name: string }[]>([]);
  const [activity, setActivity] = useState<{ id: number; action: string; timestamp: string }[]>([]);

  const fetchDesign = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/designs/${designId}`);
      if (!res.ok) { setError('Design not found'); return; }
      const data = await res.json();
      setDesign(data);
      setActivity((data.activity as { id: number; action: string; timestamp: string }[]) ?? []);
      setForm({
        planName: data.planName ?? '',
        projectAddress: data.projectAddress ?? '',
        contractor: data.contractor ?? '',
        designerId: data.designerId ?? null,
        status: data.status ?? 'Active',
        planDescription: data.planDescription ?? '',
        squareFootage: data.squareFootage ?? '',
        preliminarySetDate: data.preliminarySetDate ? new Date(data.preliminarySetDate as string).toISOString().split('T')[0] : '',
        notes: data.notes ?? '',
      });
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, [designId]);

  useEffect(() => {
    fetchDesign();
    fetch('/api/designers').then((r) => r.json()).then((d) => setDesigners(d.designers ?? [])).catch(() => {});
  }, [fetchDesign]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = { ...form, squareFootage: form.squareFootage ? Number(form.squareFootage) : null };
      const res = await fetch(`/api/designs/${designId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return; }
      setSuccess('Design saved'); fetchDesign();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this design?')) return;
    await fetch(`/api/designs/${designId}`, { method: 'DELETE' });
    router.push('/designs');
  };

  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <div className="max-w-4xl mx-auto px-4 py-8 text-gray-400">Loading...</div>
    </div>
  );

  if (!design) return (
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
            <Link href="/designs" className="p-2 rounded-lg hover:bg-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-xl font-bold">{design.planName as string}</h1>
              <p className="text-sm text-gray-400">
                {design.planNumber as string} | {design.customerName as string} | Designer: {(design.designerName as string) ?? 'Unassigned'}
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
              <label className="block text-xs text-gray-400 mb-1">Plan Name</label>
              <input type="text" value={(form.planName as string) ?? ''} onChange={(e) => setField('planName', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <select value={(form.status as string) ?? 'Active'} onChange={(e) => setField('status', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500">
                <option value="Active">Active</option>
                <option value="Complete">Complete</option>
                <option value="On Hold">On Hold</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Project Address</label>
            <input type="text" value={(form.projectAddress as string) ?? ''} onChange={(e) => setField('projectAddress', e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Contractor</label>
              <input type="text" value={(form.contractor as string) ?? ''} onChange={(e) => setField('contractor', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Square Footage</label>
              <input type="number" value={(form.squareFootage as string) ?? ''} onChange={(e) => setField('squareFootage', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Preliminary Set Date</label>
              <input type="date" value={(form.preliminarySetDate as string) ?? ''} onChange={(e) => setField('preliminarySetDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Designer</label>
            <select value={(form.designerId as number | null) ?? ''} onChange={(e) => setField('designerId', e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500">
              <option value="">— Unassigned —</option>
              {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea value={(form.notes as string) ?? ''} onChange={(e) => setField('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500 resize-y" />
          </div>
        </div>

        {activity.length > 0 && (
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Activity Log</h2>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 capitalize">{a.action}</span>
                  <span className="text-gray-500">{new Date(a.timestamp).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
