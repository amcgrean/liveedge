'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FileText, Search } from 'lucide-react';

type Tab = 'unmatched' | 'auto_matched' | 'confirmed' | 'rejected' | 'all';

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
};

type ApiResponse = {
  documents: DocumentRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<Tab, number>;
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'auto_matched', label: 'Auto-matched' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export default function DocumentsClient() {
  const router = useRouter();
  const search = useSearchParams();
  const tab = (search.get('tab') as Tab) ?? 'unmatched';
  const type = search.get('type') ?? '';
  const q = search.get('q') ?? '';
  const page = parseInt(search.get('page') ?? '1', 10);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (type) params.set('type', type);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    fetch(`/api/admin/hubbell/documents?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [tab, type, q, page]);

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    if (name !== 'page') params.delete('page');
    router.push(`/admin/hubbell?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5 text-cyan-400" />
        <h1 className="text-xl font-semibold">Hubbell Documents</h1>
        <span className="ml-auto text-sm text-slate-400 flex items-center gap-3">
          <span className="hidden sm:inline">PO/WO records uploaded daily from the portal scrape</span>
          <Link href="/admin/hubbell/jobs" className="text-cyan-400 hover:underline">Jobs →</Link>
          <Link href="/admin/hubbell/status" className="text-cyan-400 hover:underline">Status →</Link>
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => updateParam('tab', t.key)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition ${
              tab === t.key
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
            {data?.counts[t.key] !== undefined && t.key !== 'all' && (
              <span className="ml-2 text-xs text-slate-500">({data.counts[t.key]})</span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && updateParam('q', searchInput)}
            placeholder="Search doc#, SO#, customer, address…"
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
          />
        </div>
        <select
          value={type}
          onChange={(e) => updateParam('type', e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
        >
          <option value="">All types</option>
          <option value="po">PO only</option>
          <option value="wo">WO only</option>
        </select>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {!loading && data && (
        <>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Doc #</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Paid</th>
                  <th className="px-3 py-2 text-center">Attached</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No documents</td></tr>
                )}
                {data.documents.map((d) => (
                  <tr key={d.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                    <td className="px-3 py-2">
                      <Link href={`/admin/hubbell/${d.id}`} className="text-cyan-400 hover:underline font-mono">
                        {d.docNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 uppercase text-xs">{d.docType}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {d.extractedAddress || <span className="text-slate-600">—</span>}
                      {d.extractedCity && (
                        <span className="text-slate-500"> · {d.extractedCity}, {d.extractedState} {d.extractedZip}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {d.extractedTotal ? `$${parseFloat(d.extractedTotal).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center"><PaymentBadge status={d.paymentStatus} paid={d.paidAmountTotal} /></td>
                    <td className="px-3 py-2 text-center">{d.attachedCount}</td>
                    <td className="px-3 py-2"><StatusBadge status={d.matchStatus} /></td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(d.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-slate-500">
              Showing {data.documents.length} of {data.total}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => updateParam('page', String(page - 1))}
                className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40"
              >Prev</button>
              <span className="px-3 py-1">Page {page}</span>
              <button
                disabled={data.documents.length < data.limit}
                onClick={() => updateParam('page', String(page + 1))}
                className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40"
              >Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unmatched:    'bg-slate-700 text-slate-200',
    auto_matched: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    confirmed:    'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    rejected:     'bg-red-900/30 text-red-300 border border-red-800/50',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${styles[status] || styles.unmatched}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function PaymentBadge({ status, paid }: { status: 'paid' | 'partial' | 'unpaid' | null; paid: string | null }) {
  if (!status) return <span className="text-slate-600">—</span>;
  const styles: Record<string, string> = {
    paid:    'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    partial: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    unpaid:  'bg-slate-700 text-slate-300',
  };
  const label = status === 'partial' && paid
    ? `partial $${Math.round(parseFloat(paid)).toLocaleString()}`
    : status;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${styles[status]}`}>{label}</span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}
