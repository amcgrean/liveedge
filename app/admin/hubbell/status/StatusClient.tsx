'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft } from 'lucide-react';

type Status = {
  last_document_at: string | null;
  last_source_run_id: string | null;
  last_24_hours: { po?: number; wo?: number };
  by_status: Record<string, number>;
};

export default function StatusClient() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/hubbell/status')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const lastAgeHours = data?.last_document_at
    ? (Date.now() - new Date(data.last_document_at).getTime()) / 36e5
    : null;
  const stale = lastAgeHours !== null && lastAgeHours > 36;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link href="/admin/hubbell" className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to documents
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-cyan-400" />
        <h1 className="text-xl font-semibold">Hubbell ingest status</h1>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Tile
              label="Last document received"
              value={data.last_document_at ? new Date(data.last_document_at).toLocaleString() : 'never'}
              hint={lastAgeHours !== null ? `${lastAgeHours.toFixed(1)}h ago` : ''}
              alert={stale}
            />
            <Tile label="Last run ID" value={data.last_source_run_id ?? '—'} hint="" />
            <Tile
              label="Last 24 hours"
              value={`${data.last_24_hours.po ?? 0} PO · ${data.last_24_hours.wo ?? 0} WO`}
              hint=""
            />
          </div>

          <div className="rounded border border-slate-800 p-4">
            <div className="text-xs uppercase text-slate-500 mb-3">By match status</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {(['unmatched', 'auto_matched', 'confirmed', 'rejected'] as const).map((k) => (
                <div key={k} className="bg-slate-900/40 px-3 py-2 rounded">
                  <div className="text-slate-500 text-xs">{k.replace('_', ' ')}</div>
                  <div className="text-xl font-mono">{data.by_status[k] ?? 0}</div>
                </div>
              ))}
            </div>
          </div>

          {stale && (
            <div className="mt-6 p-3 rounded border border-amber-700/50 bg-amber-900/20 text-amber-200 text-sm">
              <strong>Stale.</strong> No new documents in over 36 hours. Check the local
              Task Scheduler job and the Playwright auth session.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, alert }: { label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div className={`rounded border p-4 ${alert ? 'border-amber-700/50 bg-amber-900/20' : 'border-slate-800 bg-slate-900/40'}`}>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg mt-1 break-all">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
