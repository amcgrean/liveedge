'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Pause, Play, Trash2, ChevronLeft, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { TopNav } from '../../../src/components/nav/TopNav';
import { REPORTS } from '@/lib/reports/registry';
import { ISO_DOW_LABELS } from '@/lib/reports/schedule';

interface Subscription {
  id:         string;
  reportKey:  string;
  cadence:    'daily' | 'weekly' | 'monthly';
  sendDow:    number | null;
  sendDom:    number | null;
  sendHour:   number;
  timezone:   string;
  format:     'pdf' | 'excel';
  isActive:   boolean;
  lastSentAt: string | null;
  nextRunAt:  string;
  email:      string;
  params:     Record<string, unknown>;
}

function hourLabel(h: number): string {
  if (h === 0) return '12 am';
  if (h < 12) return `${h} am`;
  if (h === 12) return '12 pm';
  return `${h - 12} pm`;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function SubscriptionsClient(props: { userName?: string | null; userRole?: string; email: string }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/report-subscriptions');
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = await res.json() as { subscriptions: Subscription[] };
        setSubs(data.subscriptions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggle(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/report-subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const { subscription } = await res.json() as { subscription: Subscription };
      setSubs((cur) => cur.map((s) => (s.id === id ? subscription : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this subscription?')) return;
    try {
      const res = await fetch(`/api/report-subscriptions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setSubs((cur) => cur.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={props.userName ?? null} userRole={props.userRole} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition mb-2">
            <ChevronLeft className="w-3 h-3" /> Home
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Mail className="w-6 h-6 text-cyan-400" />
            Email subscriptions
          </h1>
          <p className="text-sm text-slate-400 mt-1">Reports delivered to {props.email}.</p>
        </div>

        {error && (
          <div className="p-3 bg-rose-900/30 border border-rose-700 rounded text-rose-200 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : subs.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/40 border border-slate-700 rounded-lg">
            <Mail className="w-10 h-10 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-300">You don&apos;t have any active subscriptions.</p>
            <p className="text-sm text-slate-500 mt-1">
              Open a supported report and click Subscribe to set one up.
            </p>
            <ul className="mt-4 text-sm space-y-1">
              {Object.values(REPORTS).map((r) => (
                <li key={r.key}>
                  <Link href={r.pagePath} className="text-cyan-400 hover:underline">{r.label}</Link>
                  <span className="text-slate-500"> — {r.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-3">
            {subs.map((s) => {
              const report = REPORTS[s.reportKey as keyof typeof REPORTS];
              const cadenceLabel =
                s.cadence === 'daily'   ? 'Daily' :
                s.cadence === 'weekly'  ? `Weekly · ${ISO_DOW_LABELS[(s.sendDow ?? 1) - 1]}` :
                                          `Monthly · day ${s.sendDom ?? 1}`;
              return (
                <li key={s.id} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-white">
                          {report?.label ?? s.reportKey}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                          s.isActive
                            ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60'
                            : 'bg-slate-800 text-slate-400 border-slate-600'
                        }`}>
                          {s.isActive ? 'Active' : 'Paused'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-600">
                          {s.format === 'pdf' ? <FileText size={12} /> : <FileSpreadsheet size={12} />}
                          {s.format.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 mt-1">
                        {cadenceLabel} · {hourLabel(s.sendHour)} ({s.timezone})
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {report ? report.formatParamsSummary(report.paramsSchema.parse(s.params)) : ''}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Next: {s.isActive ? fmt(s.nextRunAt) : '—'}
                        {s.lastSentAt ? ` · Last sent ${fmt(s.lastSentAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {report && (
                        <Link
                          href={report.pagePath}
                          className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded"
                        >
                          Open report
                        </Link>
                      )}
                      <button
                        onClick={() => toggle(s.id, !s.isActive)}
                        title={s.isActive ? 'Pause' : 'Resume'}
                        className="p-2 text-slate-400 hover:text-white"
                      >
                        {s.isActive ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button
                        onClick={() => remove(s.id)}
                        title="Delete"
                        className="p-2 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
