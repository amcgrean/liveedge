'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Mail, Calendar, FileText, FileSpreadsheet, Trash2, Pause, Play, Loader2 } from 'lucide-react';
import { ISO_DOW_LABELS } from '@/lib/reports/schedule';
import type { ReportKey } from '@/lib/reports/registry';

export interface SubscriptionModalProps {
  reportKey:    ReportKey;
  reportLabel:  string;
  paramsSummary: string;
  /** Current filter values from the page — sent to the API on create. */
  params:       Record<string, unknown>;
  onClose:      () => void;
}

interface Subscription {
  id:        string;
  reportKey: string;
  cadence:   'daily' | 'weekly' | 'monthly';
  sendDow:   number | null;
  sendDom:   number | null;
  sendHour:  number;
  timezone:  string;
  format:    'pdf' | 'excel';
  isActive:  boolean;
  lastSentAt: string | null;
  nextRunAt:  string;
  email:     string;
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`,
}));

const DOM_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function describeNextRun(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SubscriptionModal(props: SubscriptionModalProps) {
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [sendDow, setSendDow] = useState(1);  // Monday
  const [sendDom, setSendDom] = useState(1);
  const [sendHour, setSendHour] = useState(7);
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf');

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago', []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/report-subscriptions');
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = await res.json() as { subscriptions: Subscription[] };
        if (!cancelled) {
          setSubs(data.subscriptions.filter((s) => s.reportKey === props.reportKey));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [props.reportKey]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  async function create() {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        reportKey: props.reportKey,
        params:    props.params,
        cadence,
        sendDow:   cadence === 'weekly'  ? sendDow : null,
        sendDom:   cadence === 'monthly' ? sendDom : null,
        sendHour,
        timezone,
        format,
      };
      const res = await fetch('/api/report-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      const { subscription } = await res.json() as { subscription: Subscription };
      setSubs((cur) => [subscription, ...cur]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  }

  async function patch(id: string, patch: Partial<Subscription>) {
    try {
      const res = await fetch(`/api/report-subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
          <div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2">
              <Mail size={18} className="text-cyan-400" />
              Email subscription
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{props.reportLabel} · {props.paramsSummary}</p>
          </div>
          <button onClick={props.onClose} className="text-slate-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-rose-900/40 border border-rose-700 rounded text-rose-200 text-sm">
              {error}
            </div>
          )}

          {/* Cadence */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar size={14} /> Cadence
            </label>
            <div className="mt-2 flex gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    cadence === c
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {c[0].toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* DOW / DOM */}
          {cadence === 'weekly' && (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Day of week</label>
              <select
                value={sendDow}
                onChange={(e) => setSendDow(Number(e.target.value))}
                className="mt-1 block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
              >
                {ISO_DOW_LABELS.map((lbl, i) => (
                  <option key={lbl} value={i + 1}>{lbl}</option>
                ))}
              </select>
            </div>
          )}
          {cadence === 'monthly' && (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Day of month</label>
              <select
                value={sendDom}
                onChange={(e) => setSendDom(Number(e.target.value))}
                className="mt-1 block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
              >
                {DOM_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Capped at 28 to avoid month-end edge cases.</p>
            </div>
          )}

          {/* Send time */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Send time</label>
            <select
              value={sendHour}
              onChange={(e) => setSendHour(Number(e.target.value))}
              className="mt-1 block w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label} ({timezone})</option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Format</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('pdf')}
                className={`px-3 py-3 rounded border text-left ${
                  format === 'pdf'
                    ? 'bg-cyan-600/20 border-cyan-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
                }`}
              >
                <FileText size={18} className={format === 'pdf' ? 'text-cyan-300' : 'text-slate-400'} />
                <p className="font-semibold text-sm mt-1">PDF</p>
                <p className="text-xs text-slate-400">For sharing &amp; printing</p>
              </button>
              <button
                onClick={() => setFormat('excel')}
                className={`px-3 py-3 rounded border text-left ${
                  format === 'excel'
                    ? 'bg-cyan-600/20 border-cyan-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
                }`}
              >
                <FileSpreadsheet size={18} className={format === 'excel' ? 'text-cyan-300' : 'text-slate-400'} />
                <p className="font-semibold text-sm mt-1">Excel</p>
                <p className="text-xs text-slate-400">For further analysis</p>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <button
              onClick={create}
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              Subscribe with these filters
            </button>
          </div>

          {/* Existing subscriptions */}
          <div className="border-t border-slate-700 pt-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Your subscriptions to this report
            </h4>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : subs.length === 0 ? (
              <p className="text-sm text-slate-500">No active subscriptions yet.</p>
            ) : (
              <ul className="space-y-2">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded p-3">
                    <div>
                      <p className="text-sm text-white">
                        {s.cadence === 'daily' && `Daily`}
                        {s.cadence === 'weekly' && `Weekly · ${ISO_DOW_LABELS[(s.sendDow ?? 1) - 1]}`}
                        {s.cadence === 'monthly' && `Monthly · day ${s.sendDom ?? 1}`}
                        {' · '}{HOURS[s.sendHour]?.label}
                        {' · '}{s.format.toUpperCase()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.isActive ? `Next: ${describeNextRun(s.nextRunAt)}` : 'Paused'}
                        {s.lastSentAt ? ` · Last sent ${describeNextRun(s.lastSentAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => patch(s.id, { isActive: !s.isActive })}
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
