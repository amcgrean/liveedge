'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from 'next-auth';
import { useParams, useRouter } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Props { session: Session; }

const SPEC_FIELDS = [
  { key: 'includeFraming', label: 'Framing' },
  { key: 'includeSiding', label: 'Siding' },
  { key: 'includeShingles', label: 'Shingles' },
  { key: 'includeDeck', label: 'Deck' },
  { key: 'includeDoors', label: 'Doors' },
  { key: 'includeWindows', label: 'Windows' },
  { key: 'includeTrim', label: 'Trim' },
];

export default function ManageProjectClient({ session }: Props) {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<Record<string, unknown>>({});

  const fetchProject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) { setError('Project not found'); return; }
      const data = await res.json();
      setProject(data);
      setForm({
        contractor: data.contractor ?? '',
        projectAddress: data.projectAddress ?? '',
        contractorPhone: data.contractorPhone ?? '',
        contractorEmail: data.contractorEmail ?? '',
        includeFraming: data.includeFraming ?? false,
        includeSiding: data.includeSiding ?? false,
        includeShingles: data.includeShingles ?? false,
        includeDeck: data.includeDeck ?? false,
        includeDoors: data.includeDoors ?? false,
        includeWindows: data.includeWindows ?? false,
        includeTrim: data.includeTrim ?? false,
        notes: data.notes ?? '',
      });
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return; }
      setSuccess('Project saved'); fetchProject();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this project?')) return;
    await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    router.push('/projects');
  };

  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <div className="max-w-4xl mx-auto px-4 py-8 text-gray-400">Loading...</div>
    </div>
  );

  if (!project) return (
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
            <Link href="/projects" className="p-2 rounded-lg hover:bg-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-xl font-bold">{project.contractor as string}</h1>
              <p className="text-sm text-gray-400">
                {project.projectAddress as string} | {project.customerName as string ?? 'No customer'}
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
              <label className="block text-xs text-gray-400 mb-1">Contractor</label>
              <input type="text" value={(form.contractor as string) ?? ''} onChange={(e) => setField('contractor', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Project Address</label>
              <input type="text" value={(form.projectAddress as string) ?? ''} onChange={(e) => setField('projectAddress', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Phone</label>
              <input type="text" value={(form.contractorPhone as string) ?? ''} onChange={(e) => setField('contractorPhone', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input type="email" value={(form.contractorEmail as string) ?? ''} onChange={(e) => setField('contractorEmail', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Includes</label>
            <div className="flex flex-wrap gap-3">
              {SPEC_FIELDS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={Boolean(form[s.key])} onChange={(e) => setField(s.key, e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500" />
                  {s.label}
                </label>
              ))}
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
