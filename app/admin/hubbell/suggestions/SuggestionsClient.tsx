'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X, ExternalLink, ChevronLeft, ChevronRight, RefreshCw, Play, Sparkles } from 'lucide-react';

type Status = 'pending' | 'accepted' | 'rejected' | 'all';

type Suggestion = {
  id: string;
  document_id: string;
  so_id: number;
  cust_code: string | null;
  match_source: string;
  confidence: number;
  match_reasons: string[];
  status: string;
  suggested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  doc: {
    doc_type: string;
    doc_number: string;
    extracted_address: string | null;
    extracted_city: string | null;
    extracted_state: string | null;
    extracted_zip: string | null;
    extracted_total: number | null;
    dev_code: string | null;
    house_number: string | null;
    scrape_cust_code: string | null;
    scrape_seq_num: string | null;
    match_status: string;
  };
  so: {
    cust_code: string | null;
    cust_name: string | null;
    reference: string | null;
    po_number: string | null;
    shipto_address: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
    so_status: string | null;
    expect_date: string | null;
    order_total: number | null;
  };
};

type ApiResponse = {
  suggestions: Suggestion[];
  total: number;
  count: number;
};

type StatusResponse = {
  unmatched_docs: number;
  never_suggested: number;
};

type RunResponse = {
  run_id: string;
  processed: number;
  candidates_inserted: number;
  candidates_skipped_existing: number;
  errors?: Array<{ doc_id: string; error: string }>;
};

type AiReviewResponse = {
  run_id: string;
  processed: number;
  suggestions_evaluated: number;
  accepted: number;
  rejected: number;
  skipped: number;
  errors?: Array<{ doc_id: string; error: string }>;
};

const STATUSES: { key: Status; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function confidenceClass(c: number): string {
  if (c >= 80) return 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
  if (c >= 50) return 'bg-amber-900/40 text-amber-300 border-amber-700';
  return 'bg-slate-700/40 text-slate-300 border-slate-600';
}

export default function SuggestionsClient() {
  const [status, setStatus] = useState<Status>('pending');
  const [minConfidence, setMinConfidence] = useState(30);
  const [docType, setDocType] = useState<'' | 'po' | 'wo'>('');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<StatusResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunResponse | null>(null);
  const [aiReviewing, setAiReviewing] = useState(false);
  const [lastAiReview, setLastAiReview] = useState<AiReviewResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status,
        min_confidence: String(minConfidence),
        limit: String(limit),
        offset: String(offset),
      });
      if (docType) params.set('doc_type', docType);
      const res = await fetch(`/api/admin/hubbell/suggestions?${params}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [status, minConfidence, docType, limit, offset]);

  useEffect(() => { load(); }, [load]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/hubbell/documents/suggest-matches/status');
      if (!res.ok) return;
      setRunStatus(await res.json());
    } catch {
      // ignore — status is informational
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function runAiReview() {
    setAiReviewing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hubbell/documents/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json: AiReviewResponse = await res.json();
      setLastAiReview(json);
      await Promise.all([load(), loadStatus()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiReviewing(false);
    }
  }

  async function runBatch() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hubbell/documents/suggest-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 200, only_unmatched: true, min_confidence: 30 }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json: RunResponse = await res.json();
      setLastRun(json);
      // Refresh the suggestions list + status counts
      await Promise.all([load(), loadStatus()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function review(id: string, action: 'accept' | 'reject') {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/hubbell/suggestions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      // Optimistic: drop the row from the list (we're on a pending filter).
      setData((d) => d
        ? { ...d, suggestions: d.suggestions.filter((s) => s.id !== id), total: Math.max(0, d.total - 1) }
        : d);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActingId(null);
    }
  }

  const total = data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Suggested matches</h1>
          <p className="mt-1 text-sm text-slate-400">
            Pre-computed Hubbell-doc → Agility-SO match candidates. Accept to attach; reject to suppress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runBatch}
            disabled={running || aiReviewing}
            className="flex items-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? 'Running…' : 'Run suggester (200)'}
          </button>
          <button
            onClick={runAiReview}
            disabled={running || aiReviewing}
            className="flex items-center gap-2 rounded bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
            title="Use Claude vision to review the next 5 docs with pending suggestions"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiReviewing ? 'AI reviewing…' : 'AI review (5 docs)'}
          </button>
          <button
            onClick={() => { load(); loadStatus(); }}
            className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {(runStatus || lastRun) && (
        <div className="mb-4 rounded border border-slate-700 bg-slate-800/40 px-3 py-2 text-sm text-slate-300">
          {runStatus && (
            <div>
              <span className="text-slate-400">Unmatched docs:</span>{' '}
              <span className="font-mono text-slate-100">{runStatus.unmatched_docs.toLocaleString()}</span>
              {' · '}
              <span className="text-slate-400">Never suggested:</span>{' '}
              <span className="font-mono text-slate-100">{runStatus.never_suggested.toLocaleString()}</span>
            </div>
          )}
          {lastRun && (
            <div className="mt-1 text-xs text-slate-400">
              Suggester: processed <span className="font-mono text-slate-200">{lastRun.processed}</span> docs,
              inserted <span className="font-mono text-emerald-300">{lastRun.candidates_inserted}</span> new candidates
              {lastRun.candidates_skipped_existing > 0 && (
                <>, skipped <span className="font-mono">{lastRun.candidates_skipped_existing}</span> already-reviewed</>
              )}
              {lastRun.errors && lastRun.errors.length > 0 && (
                <>, <span className="text-red-300">{lastRun.errors.length} errors</span></>
              )}
            </div>
          )}
          {lastAiReview && (
            <div className="mt-1 text-xs text-slate-400">
              AI review: evaluated <span className="font-mono text-slate-200">{lastAiReview.suggestions_evaluated}</span> suggestions across{' '}
              <span className="font-mono text-slate-200">{lastAiReview.processed}</span> docs —
              <span className="ml-1 text-emerald-300">{lastAiReview.accepted} accepted</span>,
              <span className="ml-1 text-rose-300">{lastAiReview.rejected} rejected</span>,
              <span className="ml-1 text-amber-300">{lastAiReview.skipped} left pending</span>
              {lastAiReview.errors && lastAiReview.errors.length > 0 && (
                <>, <span className="text-red-300">{lastAiReview.errors.length} errors</span></>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-slate-700 bg-slate-800/40">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => { setStatus(s.key); setOffset(0); }}
              className={`px-3 py-1.5 text-sm ${
                status === s.key ? 'bg-emerald-700 text-white' : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={docType}
          onChange={(e) => { setDocType(e.target.value as '' | 'po' | 'wo'); setOffset(0); }}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="">All doc types</option>
          <option value="po">PO only</option>
          <option value="wo">WO only</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          Min confidence:
          <input
            type="number"
            value={minConfidence}
            min={0}
            max={100}
            onChange={(e) => { setMinConfidence(Number(e.target.value) || 0); setOffset(0); }}
            className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200"
          />
        </label>

        <div className="ml-auto text-sm text-slate-400">
          {loading ? 'Loading…' : `${total.toLocaleString()} suggestion${total === 1 ? '' : 's'}`}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Hubbell doc</th>
              <th className="px-3 py-2 text-left font-medium">Doc address</th>
              <th className="px-3 py-2 text-left font-medium">Agility SO</th>
              <th className="px-3 py-2 text-left font-medium">SO address</th>
              <th className="px-3 py-2 text-left font-medium">Signal</th>
              <th className="px-3 py-2 text-left font-medium">Conf</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data?.suggestions.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                No suggestions match the current filter.
              </td></tr>
            )}
            {data?.suggestions.map((s) => (
              <tr key={s.id} className="text-slate-200">
                <td className="px-3 py-2 align-top">
                  <div className="font-mono text-xs uppercase text-slate-400">{s.doc.doc_type}</div>
                  <Link
                    href={`/admin/hubbell/${s.document_id}`}
                    className="font-mono text-emerald-300 hover:underline"
                  >
                    {s.doc.doc_number}
                  </Link>
                  {s.doc.dev_code && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {s.doc.dev_code}{s.doc.house_number ? ` · ${s.doc.house_number}` : ''}
                    </div>
                  )}
                  {s.doc.extracted_total != null && (
                    <div className="mt-0.5 text-xs text-slate-400">{fmtMoney(s.doc.extracted_total)}</div>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-300">
                  {s.doc.extracted_address && <div>{s.doc.extracted_address}</div>}
                  {(s.doc.extracted_city || s.doc.extracted_state || s.doc.extracted_zip) && (
                    <div className="text-slate-400">
                      {[s.doc.extracted_city, s.doc.extracted_state, s.doc.extracted_zip].filter(Boolean).join(' ')}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <Link
                    href={`/sales/orders/${s.so_id}`}
                    className="flex items-center gap-1 font-mono text-emerald-300 hover:underline"
                  >
                    {s.so_id}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {s.so.cust_code} {s.so.cust_name && `· ${s.so.cust_name}`}
                  </div>
                  {s.so.po_number && (
                    <div className="text-xs text-slate-500">PO: {s.so.po_number}</div>
                  )}
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    {s.so.so_status && (
                      <span className="rounded bg-slate-700 px-1.5 text-slate-300">{s.so.so_status}</span>
                    )}
                    {s.so.order_total != null && (
                      <span className="text-slate-400">{fmtMoney(s.so.order_total)}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-300">
                  {s.so.shipto_address && <div>{s.so.shipto_address}</div>}
                  {(s.so.shipto_city || s.so.shipto_state || s.so.shipto_zip) && (
                    <div className="text-slate-400">
                      {[s.so.shipto_city, s.so.shipto_state, s.so.shipto_zip].filter(Boolean).join(' ')}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-xs font-mono text-slate-400">{s.match_source}</div>
                  {s.match_reasons.length > 0 && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {s.match_reasons.slice(0, 3).join(', ')}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${confidenceClass(s.confidence)}`}>
                    {s.confidence}
                  </span>
                </td>
                <td className="px-3 py-2 align-top text-right">
                  {s.status === 'pending' ? (
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => review(s.id, 'accept')}
                        disabled={actingId === s.id}
                        className="flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Accept
                      </button>
                      <button
                        onClick={() => review(s.id, 'reject')}
                        disabled={actingId === s.id}
                        className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      <div className="font-medium capitalize">{s.status}</div>
                      {s.reviewed_by && <div className="text-slate-500">by {s.reviewed_by}</div>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <div>Page {page} of {totalPages}</div>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
