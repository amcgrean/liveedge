'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Calendar } from 'lucide-react';

interface SessionData {
  id: string;
  name: string;
  pdfFileName: string | null;
  pageCount: number;
  createdAt: Date;
  bidId: string | null;
  bidJobName: string | null;
  bidNumber: string | null;
}

interface Props {
  sessions: SessionData[];
}

export function TakeoffSessionList({ sessions }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  async function handleCreate() {
    if (!newName.trim() || !pdfFile) return;
    setCreating(true);

    try {
      // Create session via API
      const res = await fetch('/api/takeoff/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          pdfFileName: pdfFile.name,
          pageCount: 0, // Will be updated when PDF is loaded client-side
        }),
      });

      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();

      // Navigate to the new session
      router.push(`/takeoff/${data.session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">PDF Takeoff Sessions</h1>
        </div>

        {/* New session form */}
        <div className="mb-8 p-4 rounded-xl bg-slate-900 border border-white/10">
          <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" />
            New Takeoff Session
          </h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Session Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Smith Residence - Main Set"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">PDF Plan Set</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-cyan-500/20 file:text-cyan-400 file:cursor-pointer"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !pdfFile}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No takeoff sessions yet. Upload a PDF to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/takeoff/${s.id}`)}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/30 hover:bg-slate-800/50 text-left transition"
              >
                <FileText className="w-8 h-8 text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{s.name}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    {s.pdfFileName && <span className="truncate">{s.pdfFileName}</span>}
                    {s.pageCount > 0 && <span>{s.pageCount} pages</span>}
                    {s.bidJobName && (
                      <span className="text-cyan-400/60">
                        {s.bidNumber} — {s.bidJobName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
                  <Calendar className="w-3 h-3" />
                  {new Date(s.createdAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
