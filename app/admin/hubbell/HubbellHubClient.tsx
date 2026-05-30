'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Check,
  ArrowRight,
  Shield,
  Pin,
  Upload,
  Briefcase,
} from 'lucide-react';
import ChecksView from '../../../src/components/hubbell/ChecksView';

// ── Types ────────────────────────────────────────────────────────────────
type Tab = 'unmatched' | 'auto_matched' | 'confirmed' | 'rejected' | 'all';
type Section = 'documents' | 'checks' | 'jobs';
type DocType = 'all' | 'po' | 'wo';
type PayFilter = 'any' | 'paid' | 'partial' | 'unpaid';
type SortKey = 'date' | 'total' | 'payment';

type DocumentRow = {
  id: string;
  docType: 'po' | 'wo';
  docNumber: string;
  matchStatus: Tab;
  extractedAddress: string | null;
  extractedCity: string | null;
  extractedState: string | null;
  extractedZip: string | null;
  extractedTotal: string | null;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | null;
  paidAmountTotal: string | null;
  receivedAt: string;
  attachedCount: number;
  lineItems: Array<{ desc?: string }> | null;
  hasPONumberSplit: boolean;
};

type DocApi = {
  documents: DocumentRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<Tab, number>;
};

type Job = {
  cust_codes: string;
  cust_names: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  primary_so_id: number | null;
  so_count: number;
  so_open_value: string | null;
  doc_count: number;
  hubbell_total: string | null;
};

type JobsApi = { jobs: Job[]; page: number; limit: number; total: number };

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtUSD2(n: number): string {
  return (
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
function parseNum(s: string | null): number {
  if (s === null) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}
function formatExact(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── Root client ──────────────────────────────────────────────────────────
export default function HubbellHubClient() {
  const router = useRouter();
  const search = useSearchParams();
  const section = (search.get('section') as Section) || 'documents';

  function setSection(next: Section) {
    const params = new URLSearchParams(search.toString());
    params.set('section', next);
    // Drop documents-only filters when leaving the tab so the URL stays clean.
    if (next !== 'documents') {
      params.delete('tab');
      params.delete('type');
      params.delete('q');
      params.delete('payment');
    }
    router.push(`/admin/hubbell?${params.toString()}`);
  }

  // Documents-tab total comes from the docs API so the Documents tab pill can
  // show its count even while the user is on Checks/Jobs.
  const [docTotal, setDocTotal] = useState<number | null>(null);

  return (
    <div className="text-slate-200">
      {/* Page header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Link href="/admin" className="hover:text-slate-300">
              Admin
            </Link>
            <span className="text-slate-600">›</span>
            <span className="text-slate-300">Hubbell</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">Hubbell</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/hubbell/status"
            className="px-3 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded text-xs inline-flex items-center gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" /> Status
          </Link>
          <Link
            href="/admin/hubbell/suggestions"
            className="px-3 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded text-xs inline-flex items-center gap-1.5"
          >
            <Pin className="w-3.5 h-3.5" /> Suggestions
          </Link>
          <button
            disabled
            title="Uploads are driven by the daily Pi scrape"
            className="px-3 py-1.5 border border-cyan-700/50 bg-cyan-900/30 text-cyan-200 rounded text-xs inline-flex items-center gap-1.5 opacity-60 cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" /> Upload PDF
          </button>
        </div>
      </div>

      {/* Top-level tabs */}
      <div className="px-5 border-b border-slate-800 flex gap-1">
        {(
          [
            { id: 'documents', label: 'Documents', count: docTotal ?? undefined },
            { id: 'checks', label: 'Checks' },
            { id: 'jobs', label: 'Jobs' },
          ] as { id: Section; label: string; count?: number }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`relative px-4 py-3 text-xs uppercase tracking-wider font-medium transition border-b-2 -mb-px ${
              section === t.id
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-2 font-mono text-[10px] text-slate-500">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-5 max-w-[1600px] mx-auto">
        {section === 'documents' && (
          <DocumentsTab
            onTotal={setDocTotal}
          />
        )}
        {section === 'checks' && <ChecksView minHeight={580} />}
        {section === 'jobs' && <JobsTab />}
      </div>
    </div>
  );
}

// ── Documents tab ────────────────────────────────────────────────────────
const SUB_TABS: { key: Tab; label: string }[] = [
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'auto_matched', label: 'Auto-matched' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function DocumentsTab({
  onTotal,
}: {
  onTotal: (total: number) => void;
}) {
  const router = useRouter();
  const search = useSearchParams();

  const tab = ((search.get('tab') as Tab) ?? 'unmatched') as Tab;
  const docType = (search.get('type') as DocType) ?? 'all';
  const payment = (search.get('payment') as PayFilter) ?? 'any';
  const q = search.get('q') ?? '';
  const page = parseInt(search.get('page') ?? '1', 10);

  const [data, setData] = useState<DocApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  });
  const [busy, setBusy] = useState(false);

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    if (name !== 'page') params.delete('page');
    params.set('section', 'documents');
    router.push(`/admin/hubbell?${params.toString()}`);
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (docType !== 'all') params.set('type', docType);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    fetch(`/api/admin/hubbell/documents?${params.toString()}`)
      .then((r) => r.json())
      .then((j: DocApi) => {
        setData(j);
        onTotal(j.total);
      })
      .finally(() => setLoading(false));
  }, [tab, docType, q, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Payment filter is client-side (it's not on the API). Sort is client-side
  // too — server already orders by received_at desc which is the default.
  const filteredSorted = useMemo(() => {
    if (!data) return [];
    let docs = data.documents;
    if (payment !== 'any') {
      docs = docs.filter((d) => (d.paymentStatus ?? 'unpaid') === payment);
    }
    const payRank: Record<string, number> = { unpaid: 2, partial: 1, paid: 0 };
    const accessor: Record<SortKey, (d: DocumentRow) => number> = {
      date: (d) => new Date(d.receivedAt).getTime(),
      total: (d) => parseNum(d.extractedTotal),
      payment: (d) => payRank[d.paymentStatus ?? 'unpaid'] ?? 0,
    };
    const sorted = [...docs].sort((a, b) => {
      const av = accessor[sort.key](a);
      const bv = accessor[sort.key](b);
      if (av === bv) return 0;
      const mul = sort.dir === 'desc' ? -1 : 1;
      return mul * (av < bv ? -1 : 1);
    });
    return sorted;
  }, [data, payment, sort]);

  function setSortKey(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' }));
  }

  async function confirmAllAuto() {
    if (!data) return;
    const ids = data.documents.filter((d) => d.matchStatus === 'auto_matched').map((d) => d.id);
    if (ids.length === 0) return;
    if (!confirm(`Confirm ${ids.length} auto-matched documents?`)) return;
    setBusy(true);
    try {
      await fetch('/api/admin/hubbell/documents/bulk-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_ids: ids }),
      });
      // Reload current view.
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (docType !== 'all') params.set('type', docType);
      if (q) params.set('q', q);
      if (page > 1) params.set('page', String(page));
      const j: DocApi = await fetch(`/api/admin/hubbell/documents?${params.toString()}`).then((r) =>
        r.json(),
      );
      setData(j);
      onTotal(j.total);
    } finally {
      setBusy(false);
    }
  }

  const docs = filteredSorted;
  const autoCount = data?.counts.auto_matched ?? 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden">
      {/* match-status sub-tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-slate-800 flex-wrap">
        {SUB_TABS.map((t) => {
          const active = tab === t.key;
          const n = data?.counts[t.key];
          return (
            <button
              key={t.key}
              onClick={() => updateParam('tab', t.key)}
              className={`h-7 px-3 inline-flex items-center gap-1.5 text-sm rounded-md border ${
                active
                  ? 'bg-slate-800 border-slate-700 text-slate-100'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
              {n !== undefined && (
                <span
                  className={`font-mono text-[10px] ${
                    active ? 'text-cyan-400' : 'text-slate-600'
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* filter bar */}
      <div className="flex gap-2 items-center px-3 py-2.5 border-b border-slate-800 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && updateParam('q', searchInput)}
            onBlur={() => {
              if (searchInput !== q) updateParam('q', searchInput);
            }}
            placeholder="Search doc #, address, SO #, customer…"
            className="w-full pl-9 pr-3 h-8 bg-slate-800 border border-slate-700 rounded text-sm"
          />
        </div>
        <SegGroup
          value={docType}
          onChange={(v) => updateParam('type', v === 'all' ? '' : v)}
          options={[
            ['all', 'All'],
            ['po', 'PO'],
            ['wo', 'WO'],
          ]}
        />
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Payment</span>
          <SegGroup
            value={payment}
            onChange={(v) => updateParam('payment', v === 'any' ? '' : v)}
            options={[
              ['any', 'Any'],
              ['paid', 'Paid'],
              ['partial', 'Partial'],
              ['unpaid', 'Unpaid'],
            ]}
          />
        </div>
        {tab === 'auto_matched' && autoCount > 0 && (
          <>
            <span className="flex-1" />
            <button
              onClick={confirmAllAuto}
              disabled={busy}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded bg-cyan-900/40 border border-cyan-700/50 text-cyan-200 hover:bg-cyan-900/60 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> Confirm all auto-matched
              <span className="font-mono text-[10px] opacity-85">({autoCount})</span>
            </button>
          </>
        )}
      </div>

      {/* table */}
      {loading ? (
        <div className="px-4 py-8 text-sm text-slate-500">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="px-5 py-16 flex flex-col items-center gap-3 text-slate-500">
          <div className="w-11 h-11 rounded-full bg-emerald-900/20 border border-emerald-700/40 flex items-center justify-center text-emerald-400">
            <Check className="w-5 h-5" />
          </div>
          <span className="text-sm text-slate-300">
            {tab === 'unmatched'
              ? 'All caught up — no unmatched documents'
              : 'No documents match these filters'}
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/40 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 w-[160px]">Doc</th>
                <th className="px-3 py-2 w-[200px]">Address</th>
                <th className="px-3 py-2">Description</th>
                <ThSort
                  k="total"
                  align="right"
                  sort={sort}
                  setSortKey={setSortKey}
                  label="PDF Total"
                />
                <ThSort k="payment" sort={sort} setSortKey={setSortKey} label="Payment" />
                <th className="px-3 py-2 text-center w-[60px]">SOs</th>
                <th className="px-3 py-2 w-[140px]">Status</th>
                <ThSort k="date" sort={sort} setSortKey={setSortKey} label="Date" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const firstDesc = d.lineItems?.[0]?.desc ?? null;
                return (
                  <tr
                    key={d.id}
                    className="border-t border-slate-800/60 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => router.push(`/admin/hubbell/${d.id}`)}
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-100">
                          {d.docNumber}
                        </span>
                        <TypePill type={d.docType} />
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-slate-300">
                      {d.extractedAddress ?? '—'}
                      {d.extractedCity && (
                        <span className="text-slate-500"> · {d.extractedCity}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-200">
                      {firstDesc ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono font-medium">
                      {d.extractedTotal ? fmtUSD2(parseNum(d.extractedTotal)) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <PaymentBadge status={d.paymentStatus} paid={d.paidAmountTotal} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {d.attachedCount > 0 ? (
                        <span className="font-mono text-emerald-400 font-semibold">
                          {d.attachedCount}
                        </span>
                      ) : (
                        <span className="font-mono text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex flex-col items-start gap-1">
                        <StatusBadge status={d.matchStatus} />
                        {d.matchStatus === 'auto_matched' && d.hasPONumberSplit && (
                          <PoMatchPill />
                        )}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-xs text-slate-500"
                      title={formatExact(d.receivedAt)}
                    >
                      {formatRelative(d.receivedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <div>
          Showing {docs.length} document{docs.length === 1 ? '' : 's'} · click a row to open
          & match
        </div>
        {data && (
          <div className="flex gap-1 items-center">
            <button
              disabled={page <= 1}
              onClick={() => updateParam('page', String(page - 1))}
              className="px-2 py-0.5 bg-slate-800 rounded disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2">Page {page}</span>
            <button
              disabled={data.documents.length < data.limit}
              onClick={() => updateParam('page', String(page + 1))}
              className="px-2 py-0.5 bg-slate-800 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Jobs tab ─────────────────────────────────────────────────────────────
function JobsTab() {
  const router = useRouter();
  const [data, setData] = useState<JobsApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    const t = setTimeout(() => {
      fetch(`/api/admin/hubbell/jobs?${params.toString()}`)
        .then((r) => r.json())
        .then(setData)
        .finally(() => setLoading(false));
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-slate-400" /> Jobsites
          </div>
          <div className="text-[11px] text-slate-500">
            physical sites · grouped by address
          </div>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, address, city…"
            className="w-full pl-9 pr-3 h-8 bg-slate-800 border border-slate-700 rounded text-sm"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/40 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 w-[170px]">Customer</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2 text-center w-[60px]">SOs</th>
              <th className="px-3 py-2 text-right w-[120px]">Open $</th>
              <th className="px-3 py-2 text-center w-[60px]">Docs</th>
              <th className="px-3 py-2 text-right w-[130px]">Hubbell $</th>
              <th className="px-3 py-2 w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data && data.jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No jobsites match.
                </td>
              </tr>
            )}
            {!loading &&
              data?.jobs.map((j, i) => {
                const open = parseNum(j.so_open_value);
                const hubbell = parseNum(j.hubbell_total);
                const codes = j.cust_codes.split(',').join(' / ');
                return (
                  <tr
                    key={i}
                    className="border-t border-slate-800/60 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => {
                      if (j.primary_so_id != null)
                        router.push(`/admin/hubbell/jobs/${j.primary_so_id}`);
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{codes}</td>
                    <td className="px-3 py-2">
                      {j.shipto_address_1 ?? '—'}
                      {j.shipto_city && (
                        <span className="text-slate-500"> · {j.shipto_city}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono tabular-nums">
                      {j.so_count}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {open > 0 ? (
                        fmtUSD(open)
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono tabular-nums">
                      {j.doc_count}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        hubbell > 0 ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      {hubbell > 0 ? fmtUSD(hubbell) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="px-3 py-2 border-t border-slate-800 text-[11px] font-mono text-slate-500">
          Showing {data.jobs.length} of {data.total} jobsites
        </div>
      )}
    </div>
  );
}

// ── Small UI helpers ─────────────────────────────────────────────────────
function SegGroup<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: [V, string][];
}) {
  return (
    <div className="inline-flex bg-slate-800 border border-slate-700 rounded p-0.5 gap-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`h-6 px-2.5 rounded text-xs font-medium ${
            value === v
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ThSort({
  k,
  label,
  sort,
  setSortKey,
  align,
}: {
  k: SortKey;
  label: string;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  setSortKey: (k: SortKey) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const active = sort.key === k;
  return (
    <th
      onClick={() => setSortKey(k)}
      style={{ textAlign: align ?? 'left' }}
      className={`px-3 py-2 cursor-pointer select-none ${active ? 'text-cyan-300' : ''}`}
    >
      {label}
      <span className="ml-1 text-slate-600">
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unmatched: 'bg-slate-700 text-slate-200',
    auto_matched: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    confirmed: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    rejected: 'bg-red-900/30 text-red-300 border border-red-800/50',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
        styles[status] || styles.unmatched
      }`}
    >
      {status.replace('_', '-')}
    </span>
  );
}

function PaymentBadge({
  status,
  paid,
}: {
  status: 'paid' | 'partial' | 'unpaid' | null;
  paid: string | null;
}) {
  if (!status || status === 'unpaid') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300">
        UNPAID
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-amber-900/40 text-amber-300 border border-amber-700/50">
        PARTIAL {paid ? fmtUSD(parseNum(paid)) : ''}
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
      PAID
    </span>
  );
}

function TypePill({ type }: { type: 'po' | 'wo' }) {
  const isWO = type === 'wo';
  return (
    <span
      className={`inline-flex items-center h-[18px] px-1.5 font-mono text-[10px] font-semibold tracking-wide rounded-sm border ${
        isWO
          ? 'text-purple-300 border-purple-700/50 bg-purple-900/20'
          : 'text-slate-200 border-slate-700 bg-slate-800'
      }`}
    >
      {type.toUpperCase()}
    </span>
  );
}

function PoMatchPill() {
  return (
    <span className="inline-flex items-center gap-1 h-[20px] px-1.5 rounded-sm text-[10px] font-semibold tracking-wide uppercase text-emerald-400 border border-emerald-700/50 bg-emerald-900/20 whitespace-nowrap">
      <Check className="w-2.5 h-2.5" /> PO# match
    </span>
  );
}
