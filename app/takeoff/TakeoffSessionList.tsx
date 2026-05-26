'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Calendar, Link2, X } from 'lucide-react';
import { usePageTracking } from '../../src/hooks/usePageTracking';

interface SessionData {
  id: string;
  name: string;
  pdfFileName: string | null;
  pageCount: number;
  createdAt: Date;
  bidId: string | null;
  bidJobName: string | null;
  bidNumber: string | null;
  legacyBidId?: number | null;
}

interface LegacyBidOption {
  id: number;
  projectName: string;
  customerName: string | null;
  planType: string;
}

interface Props {
  sessions: SessionData[];
}

export function TakeoffSessionList({ sessions }: Props) {
  usePageTracking();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showBidSearch, setShowBidSearch] = useState(false);
  const [bidQuery, setBidQuery] = useState('');
  const [bidOptions, setBidOptions] = useState<LegacyBidOption[]>([]);
  const [selectedBid, setSelectedBid] = useState<LegacyBidOption | null>(null);
  const bidSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showBidSearch) return;
    if (bidSearchTimer.current) clearTimeout(bidSearchTimer.current);
    bidSearchTimer.current = setTimeout(async () => {
      const res = await fetch(
        `/api/legacy-bids?status=Incomplete&limit=20${bidQuery ? `&q=${encodeURIComponent(bidQuery)}` : ''}`
      );
      if (res.ok) {
        const data = await res.json();
        setBidOptions(data.bids ?? []);
      }
    }, 300);
  }, [bidQuery, showBidSearch]);

  async function handleCreate() {
    if (!newName.trim() || !pdfFile) return;

    // If user opened bid search but didn't pick a bid, prompt them
    if (showBidSearch && !selectedBid) {
      if (!confirm('No bid selected. Create a standalone takeoff not linked to any bid?')) return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/takeoff/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          pdfFileName: pdfFile.name,
          pageCount: 0,
          legacyBidId: selectedBid?.id ?? null,
        }),
      });

      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
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
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-slate-400 block mb-1">Session Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Smith Residence - Main Set"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div className="flex-1 min-w-48">
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

          {/* Optional bid link */}
          <div className="mt-3 pt-3 border-t border-white/5">
            {!showBidSearch && !selectedBid ? (
              <button
                onClick={() => setShowBidSearch(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Link to a bid tracker bid (optional)
              </button>
            ) : selectedBid ? (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Linked to: <span className="text-cyan-400">{selectedBid.projectName}</span> — {selectedBid.customerName} ({selectedBid.planType})</span>
                <button onClick={() => { setSelectedBid(null); setBidQuery(''); }} className="text-slate-500 hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={bidQuery}
                    onChange={(e) => setBidQuery(e.target.value)}
                    placeholder="Search bids by project name or customer..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <button onClick={() => { setShowBidSearch(false); setBidQuery(''); setBidOptions([]); }} className="text-slate-500 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {bidOptions.length > 0 && (
                  <div className="bg-slate-800 border border-white/10 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {bidOptions.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedBid(b); setShowBidSearch(false); if (!newName.trim()) setNewName(`${b.projectName} — ${b.customerName ?? ''}`); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 border-b border-white/5 last:border-0"
                      >
                        <span className="text-white">{b.projectName}</span>
                        <span className="text-slate-400"> — {b.customerName} · {b.planType} · Bid #{b.id}</span>
                      </button>
                    ))}
                  </div>
                )}
                {bidOptions.length === 0 && bidQuery && (
                  <p className="text-xs text-slate-500 pl-5">No open bids found</p>
                )}
              </div>
            )}
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
                        {s.bidNumber ? `${s.bidNumber} — ` : ''}{s.bidJobName}
                      </span>
                    )}
                    {s.legacyBidId && !s.bidJobName && (
                      <span className="text-cyan-400/60">Bid #{s.legacyBidId}</span>
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
