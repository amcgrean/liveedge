'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Package, CheckCircle, Clock, MessageSquare, Send, Lock } from 'lucide-react';

interface PoHeader {
  po_number: string;
  supplier_name: string | null;
  supplier_code: string | null;
  system_id: string | null;
  expect_date: string | null;
  order_date: string | null;
  po_status: string | null;
}

interface PoLine {
  sequence: number | string;
  item_number: string | null;
  description: string | null;
  qty_ordered: number | null;
  qty_received: number | null;
  unit_cost: number | null;
  unit_of_measure: string | null;
}

interface ReceivingSummary {
  receipt_count: number;
  last_received: string | null;
}

interface PoData {
  header: PoHeader | null;
  lines: PoLine[];
  receiving_summary: ReceivingSummary | null;
}

interface Note {
  id: number;
  body: string;
  is_internal: boolean;
  created_by_user_id: number | null;
  created_at: string;
}

interface Props { po: string; isAdmin: boolean; }

export default function PosDetailClient({ po, isAdmin }: Props) {
  const [data, setData] = useState<PoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/purchasing/pos/${encodeURIComponent(po)}/notes`);
      if (res.ok) {
        const d = await res.json() as { notes: Note[] };
        setNotes(d.notes ?? []);
      }
    } catch { /* silent */ }
  }, [po]);

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/purchasing/pos/${encodeURIComponent(po)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, is_internal: isInternal }),
      });
      if (res.ok) {
        setNoteText('');
        await loadNotes();
      }
    } finally { setSavingNote(false); }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/purchasing/pos/${encodeURIComponent(po)}`);
        if (res.status === 404) { setError('PO not found'); return; }
        if (!res.ok) { setError('Failed to load PO'); return; }
        setData(await res.json());
      } catch {
        setError('Failed to load PO');
      } finally {
        setLoading(false);
      }
    })();
    loadNotes();
  }, [po, loadNotes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading PO...
      </div>
    );
  }

  if (error || !data?.header) {
    return (
      <div className="p-6">
        <Link href="/purchasing/open-pos" className="text-sm text-cyan-400 hover:underline">&larr; Open POs</Link>
        <div className="mt-8 text-center text-slate-400">{error || 'PO not found'}</div>
      </div>
    );
  }

  const { header, lines, receiving_summary } = data;
  const totalLines = lines.length;
  const receivedLines = lines.filter((l) => (l.qty_received ?? 0) >= (l.qty_ordered ?? 1)).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <Link href="/purchasing/open-pos" className="text-sm text-cyan-400 hover:underline">&larr; Open POs</Link>
        <div className="flex items-start justify-between mt-1 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white font-mono">PO {po}</h1>
            <p className="text-sm text-slate-400">{header.supplier_name ?? header.supplier_code ?? 'Unknown supplier'}</p>
          </div>
          <div className="flex gap-2 items-center">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              header.po_status?.toUpperCase() === 'OPEN' ? 'bg-blue-500/20 text-blue-300' :
              header.po_status?.toUpperCase() === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-slate-700 text-slate-300'
            }`}>
              {header.po_status ?? 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Order Date', value: header.order_date ?? '—', icon: Clock },
          { label: 'Expect Date', value: header.expect_date ?? '—', icon: Clock },
          { label: 'Lines', value: `${receivedLines}/${totalLines} received`, icon: Package },
          { label: 'Receipts', value: String(receiving_summary?.receipt_count ?? 0), icon: CheckCircle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-900 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
            <div className="text-sm font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Check-in shortcut */}
      <div className="flex gap-3">
        <Link
          href={`/purchasing?po=${encodeURIComponent(po)}`}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition"
        >
          Start Receiving Check-In
        </Link>
        <Link
          href="/purchasing/review"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
        >
          View Submissions
        </Link>
      </div>

      {/* Lines */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Line Items ({totalLines})</h2>
        </div>
        {lines.length === 0 ? (
          <div className="px-4 py-10 text-center text-slate-500">No line items</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">#</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ordered</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">UOM</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const pct = l.qty_ordered ? Math.min(100, Math.round(((l.qty_received ?? 0) / l.qty_ordered) * 100)) : 0;
                  const done = pct >= 100;
                  return (
                    <tr key={i} className={`border-b border-white/5 hover:bg-slate-800/50 ${done ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-slate-500 text-xs">{l.sequence}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{l.item_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-200 max-w-[220px] truncate">{l.description ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{l.qty_ordered ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={done ? 'text-green-400' : 'text-slate-300'}>{l.qty_received ?? 0}</span>
                          {done && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{l.unit_of_measure ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Notes */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Notes ({notes.length})</h2>
        </div>
        <div className="p-4 space-y-3">
          {notes.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">No notes yet</p>
          )}
          {notes.map((n) => (
            <div key={n.id} className="bg-slate-800 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                {n.is_internal && (
                  <span className="flex items-center gap-1 text-xs text-orange-400">
                    <Lock className="w-3 h-3" /> Internal
                  </span>
                )}
                <span className="text-xs text-slate-500 ml-auto">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}

          <form onSubmit={submitNote} className="space-y-2 pt-2 border-t border-white/10">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
            />
            <div className="flex items-center justify-between">
              {isAdmin && (
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded"
                  />
                  Internal only
                </label>
              )}
              <button
                type="submit"
                disabled={!noteText.trim() || savingNote}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm rounded-lg transition"
              >
                <Send className="w-3.5 h-3.5" />
                {savingNote ? 'Saving…' : 'Add Note'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
