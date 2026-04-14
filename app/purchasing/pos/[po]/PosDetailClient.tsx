'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw, Package, CheckCircle, Clock, MessageSquare,
  Send, Lock, ChevronDown, ChevronUp, Truck,
} from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

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

interface ReceiptLine {
  sequence: number;
  item_number: string | null;
  description: string | null;
  qty: number;
  cost: number | null;
}

interface Receipt {
  receive_num: number;
  receive_date: string | null;
  recv_status: string | null;
  packing_slip: string | null;
  wms_user: string | null;
  recv_comment: string | null;
  lines: ReceiptLine[];
}

interface ReceivingSummary {
  receipt_count: number;
  last_received: string | null;
  total_received: number;
}

interface PoData {
  header: PoHeader | null;
  lines: PoLine[];
  receipts: Receipt[];
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val: number | null): string {
  if (val == null) return '—';
  return `$${val.toFixed(2)}`;
}

// ─── Receiving History ────────────────────────────────────────────────────────

function ReceivingHistory({ receipts }: { receipts: Receipt[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(num: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  }

  if (receipts.length === 0) {
    return (
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Truck className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Receiving History</h2>
        </div>
        <div className="px-4 py-8 text-center text-slate-500 text-sm">No receiving records</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Truck className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-white">Receiving History</h2>
        <span className="ml-auto text-xs text-slate-500">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="divide-y divide-white/5">
        {receipts.map((r) => {
          const isOpen = expanded.has(r.receive_num);
          const totalQty = r.lines.reduce((s, l) => s + l.qty, 0);
          const totalCost = r.lines.some((l) => l.cost != null)
            ? r.lines.reduce((s, l) => s + (l.cost ?? 0) * l.qty, 0)
            : null;

          return (
            <div key={r.receive_num}>
              {/* Receipt header row */}
              <button
                onClick={() => toggle(r.receive_num)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition text-left"
              >
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5">
                  <div>
                    <span className="text-xs text-slate-500">Receipt #</span>
                    <p className="text-sm font-mono text-cyan-300">{r.receive_num}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Date</span>
                    <p className="text-sm text-slate-200">{formatDate(r.receive_date)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Items / Qty</span>
                    <p className="text-sm text-slate-200">
                      {r.lines.length} line{r.lines.length !== 1 ? 's' : ''}
                      {totalQty > 0 && <span className="text-slate-400"> · {totalQty.toLocaleString()} units</span>}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">
                      {r.packing_slip ? 'Packing Slip' : r.wms_user ? 'Received By' : 'Status'}
                    </span>
                    <p className="text-sm text-slate-200 truncate">
                      {r.packing_slip || r.wms_user || r.recv_status || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {totalCost != null && (
                    <span className="text-xs text-slate-400 hidden md:inline">
                      {formatCurrency(totalCost)}
                    </span>
                  )}
                  {isOpen
                    ? <ChevronUp className="w-4 h-4 text-slate-500" />
                    : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </button>

              {/* Expanded line detail */}
              {isOpen && (
                <div className="px-4 pb-3 border-t border-white/5 bg-slate-950/40">
                  {r.recv_comment && (
                    <p className="text-xs text-slate-400 italic pt-3 pb-1">{r.recv_comment}</p>
                  )}
                  {r.lines.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">No line detail available</p>
                  ) : (
                    <div className="overflow-x-auto pt-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left border-b border-white/5">
                            <th className="py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wider">#</th>
                            <th className="py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                            <th className="py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wider text-right">Qty Received</th>
                            <th className="py-2 font-semibold text-slate-500 uppercase tracking-wider text-right">Unit Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((l, i) => (
                            <tr key={i} className="border-b border-white/5 last:border-0">
                              <td className="py-2 pr-4 text-slate-500">{l.sequence}</td>
                              <td className="py-2 pr-4 font-mono text-slate-300">{l.item_number ?? '—'}</td>
                              <td className="py-2 pr-4 text-slate-200 max-w-[240px] truncate">{l.description ?? '—'}</td>
                              <td className="py-2 pr-4 text-slate-200 text-right">{l.qty.toLocaleString()}</td>
                              <td className="py-2 text-slate-400 text-right">{formatCurrency(l.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PosDetailClient({ po, isAdmin }: Props) {
  usePageTracking();
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
        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading PO…
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

  const { header, lines, receipts, receiving_summary } = data;
  const totalLines    = lines.length;
  const receivedLines = lines.filter((l) => (l.qty_received ?? 0) >= (l.qty_ordered ?? 1)).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Breadcrumb + title */}
      <div>
        <Link href="/purchasing/open-pos" className="text-sm text-cyan-400 hover:underline">&larr; Open POs</Link>
        <div className="flex items-start justify-between mt-1 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white font-mono">PO {po}</h1>
            <p className="text-sm text-slate-400">
              {header.supplier_name ?? header.supplier_code ?? 'Unknown supplier'}
              {header.system_id && <span className="ml-2 text-slate-600">· {header.system_id}</span>}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            header.po_status?.toUpperCase() === 'OPEN'    ? 'bg-blue-500/20 text-blue-300' :
            header.po_status?.toUpperCase() === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-300' :
            'bg-slate-700 text-slate-300'
          }`}>
            {header.po_status ?? 'Unknown'}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Order Date',   value: formatDate(header.order_date),   icon: Clock },
          { label: 'Expect Date',  value: formatDate(header.expect_date),  icon: Clock },
          { label: 'Lines',        value: `${receivedLines}/${totalLines} received`, icon: Package },
          { label: 'Receipts',     value: String(receiving_summary?.receipt_count ?? 0), icon: CheckCircle },
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

      {/* Action buttons */}
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

      {/* ── Receiving History (above line items) ── */}
      <ReceivingHistory receipts={receipts ?? []} />

      {/* ── Line Items ── */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Line Items ({totalLines})</h2>
          {receivedLines > 0 && (
            <span className="ml-auto text-xs text-slate-500">
              {receivedLines}/{totalLines} fully received
            </span>
          )}
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
                  const pct  = l.qty_ordered ? Math.min(100, Math.round(((l.qty_received ?? 0) / l.qty_ordered) * 100)) : 0;
                  const done = pct >= 100;
                  const partial = pct > 0 && pct < 100;
                  return (
                    <tr key={i} className={`border-b border-white/5 hover:bg-slate-800/50 ${done ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-slate-500 text-xs">{l.sequence}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{l.item_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-200 max-w-[220px] truncate">{l.description ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{l.qty_ordered ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={done ? 'text-green-400' : partial ? 'text-yellow-400' : 'text-slate-300'}>
                            {l.qty_received ?? 0}
                          </span>
                          {done && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                          {partial && (
                            <span className="text-xs text-yellow-500">{pct}%</span>
                          )}
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

      {/* ── Notes ── */}
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
