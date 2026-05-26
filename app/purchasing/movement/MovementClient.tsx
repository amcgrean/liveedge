'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, RefreshCw, Pencil, X, Check, ExternalLink, Filter } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

interface MovementRow {
  systemId: string;
  itemCode: string;
  description: string | null;
  category: string | null;
  weeklyNow: number;
  weeklyPrior: number;
  pctChange: number;
  dir: 'up' | 'down';
  qtyOnHand: number;
  note: string | null;
}

interface Props { userBranch: string | null; isAllBranchUser: boolean; }

export default function MovementClient({ userBranch, isAllBranchUser }: Props) {
  usePageTracking();
  const [branch, setBranch] = useState(isAllBranchUser ? '' : (userBranch ?? ''));
  const [direction, setDirection] = useState<'all'|'up'|'down'>('all');
  const [minPct, setMinPct] = useState(25);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Note editor
  const [editing, setEditing] = useState<MovementRow | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (branch) sp.set('branch', branch);
      if (direction !== 'all') sp.set('direction', direction);
      sp.set('min_pct', String(minPct));
      sp.set('limit', '100');
      const res = await fetch(`/api/purchasing/movement?${sp}`);
      if (res.ok) setRows((await res.json()).rows ?? []);
    } finally { setLoading(false); }
  }, [branch, direction, minPct]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (r: MovementRow) => {
    setEditing(r);
    setDraft(r.note ?? '');
  };

  const saveNote = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (draft.trim()) {
        await fetch('/api/purchasing/movement/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemId: editing.systemId,
            itemCode: editing.itemCode,
            note: draft.trim(),
            dir: editing.dir,
          }),
        });
      }
      setEditing(null);
      load();
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4 text-white">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cyan-400">Recent Movement</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Items whose 7-day shipped velocity diverges by ≥{minPct}% from the trailing 30-day baseline. Click an item to write a note.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </div>
        {isAllBranchUser ? (
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="">All Branches</option>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        ) : (
          <span className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-300">{branch || 'No branch'}</span>
        )}
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'all'|'up'|'down')}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
        >
          <option value="all">Up + Down</option>
          <option value="up">Up only</option>
          <option value="down">Down only</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Min %</span>
          <input
            type="number" min={5} max={500} step={5} value={minPct}
            onChange={(e) => setMinPct(Math.max(5, Number(e.target.value) || 25))}
            className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider text-left">
                <th className="px-3 py-2.5">Dir</th>
                <th className="px-3 py-2.5">Branch</th>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right">7d</th>
                <th className="px-3 py-2.5 text-right">30d wk avg</th>
                <th className="px-3 py-2.5 text-right">Change</th>
                <th className="px-3 py-2.5 text-right">On Hand</th>
                <th className="px-3 py-2.5">Note</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-500">
                  No items meet the threshold.
                </td></tr>
              )}
              {!loading && rows.map((r) => {
                const up = r.dir === 'up';
                return (
                  <tr key={`${r.systemId}-${r.itemCode}`} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      {up
                        ? <TrendingUp className="w-4 h-4 text-green-400" />
                        : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-slate-400">{r.systemId}</td>
                    <td className="px-3 py-2 font-mono text-cyan-300 whitespace-nowrap">
                      <Link
                        href={`/scorecard/product/item/${encodeURIComponent(r.itemCode)}?from=purchasing-movement`}
                        className="inline-flex items-center gap-1 hover:text-cyan-200 hover:underline"
                      >
                        {r.itemCode}
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-300 max-w-[260px] truncate">{r.description ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-200 font-mono">{r.weeklyNow}</td>
                    <td className="px-3 py-2 text-right text-slate-400 font-mono">{r.weeklyPrior}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
                      {up ? '+' : ''}{r.pctChange}%
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300 font-mono">{Math.round(r.qtyOnHand)}</td>
                    <td className="px-3 py-2 text-slate-400 italic max-w-[200px] truncate">{r.note ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1 text-slate-400 hover:text-cyan-300"
                        title={r.note ? 'Edit note' : 'Add note'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-white">
                Note · <span className="text-cyan-300 font-mono text-sm">{editing.itemCode}</span>
              </h3>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-slate-500 mb-3 px-3 py-2 bg-slate-950/50 border border-slate-800 rounded">
              {editing.systemId} · {editing.description ?? '—'} · {editing.dir === 'up' ? '+' : ''}{editing.pctChange}%
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="Why is this moving? e.g. 'Spring framing rush', 'Hagen multi-fam Bldg C', 'Memorial Day decks'"
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-cyan-500"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveNote}
                disabled={saving}
                className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-sm font-medium flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save note'}
              </button>
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
