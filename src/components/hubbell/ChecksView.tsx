'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Check, Flag, FileText } from 'lucide-react';

export type ChecksLine = {
  docId: string | null;
  docNumber: string;
  docType: 'po' | 'wo' | 'inv';
  description: string | null;
  paymentAmount: string;
  matchStatus: string | null;
  attachedSo: { soId: number; reference: string | null } | null;
};

export type ChecksCheck = {
  id: string;
  checkNumber: string;
  checkDate: string | null;
  totalAmount: string | null;
  lineCount: number;
  lineSum: number;
  health: 'ok' | 'partial' | 'none';
  lines: ChecksLine[];
};

type Resp = { checks: ChecksCheck[]; total: number };

function fmtUSD2(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseNum(s: string | null): number {
  if (s === null) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export default function ChecksView({ minHeight = 560 }: { minHeight?: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/hubbell/checks')
      .then((r) => r.json())
      .then((j: Resp) => {
        setData(j);
        if (j.checks?.[0]) setSelected(j.checks[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const checks = data?.checks ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return checks;
    return checks.filter(
      (c) =>
        c.checkNumber.toLowerCase().includes(q) ||
        (c.checkDate ?? '').toLowerCase().includes(q),
    );
  }, [checks, query]);

  const check = checks.find((c) => c.id === selected) ?? null;

  return (
    <div
      className="flex flex-col md:flex-row border border-slate-800 rounded-md overflow-hidden bg-slate-900"
      style={{ minHeight }}
    >
      {/* LEFT — check list */}
      <div className="md:w-72 md:flex-none border-b md:border-b-0 md:border-r border-slate-800 flex flex-col">
        <div className="p-2 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search check #, date…"
              className="w-full pl-7 pr-2 h-7 text-xs bg-slate-800 border border-slate-700 rounded"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-xs text-slate-500">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-xs text-slate-500">No checks.</div>
          )}
          {filtered.map((c) => {
            const isSel = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full text-left block py-3 px-3 border-b border-slate-800/60 border-l-2 ${
                  isSel
                    ? 'border-l-cyan-400 bg-cyan-950/20'
                    : 'border-l-transparent hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <HealthDot health={c.health} />
                  <span className="font-mono text-base font-semibold text-slate-100">
                    #{c.checkNumber}
                  </span>
                  <span className="flex-1" />
                  <span className="font-mono text-sm font-semibold">
                    {fmtUSD2(parseNum(c.totalAmount))}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span className="font-mono">{c.checkDate ?? '—'}</span>
                  <span>
                    {c.lineCount} {c.lineCount === 1 ? 'line' : 'lines'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT — lines */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!check ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
            <FileText className="w-7 h-7 text-slate-600" />
            <span className="text-sm">Select a check to see its lines</span>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-800 flex items-baseline gap-4 flex-wrap">
              <span className="font-mono text-xl font-semibold">
                Check #{check.checkNumber}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {check.checkDate ?? '—'}
              </span>
              <span className="flex-1" />
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Check total
                </div>
                <div className="font-mono text-lg font-semibold">
                  {fmtUSD2(parseNum(check.totalAmount))}
                </div>
              </div>
              <div className="pl-4 border-l border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Lines
                </div>
                <div className="font-mono text-lg font-semibold">{check.lineCount}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Doc #</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Attached SO</th>
                  </tr>
                </thead>
                <tbody>
                  {check.lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-800/60">
                      <td className="px-3 py-2">
                        {l.docId ? (
                          <Link
                            href={`/admin/hubbell/${l.docId}`}
                            className="font-mono text-cyan-400 hover:underline font-medium"
                          >
                            {l.docNumber}
                          </Link>
                        ) : (
                          <span className="font-mono text-slate-300">{l.docNumber}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <TypePill type={l.docType} />
                      </td>
                      <td className="px-3 py-2 max-w-[280px] truncate text-slate-300">
                        {l.description ?? (l.docType === 'inv' ? 'AR invoice payment' : '—')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-mono font-medium">
                        {fmtUSD2(parseNum(l.paymentAmount))}
                      </td>
                      <td className="px-3 py-2">
                        <MatchBadge status={l.matchStatus} docType={l.docType} />
                      </td>
                      <td className="px-3 py-2">
                        {l.attachedSo ? (
                          l.docId ? (
                            <Link
                              href={`/admin/hubbell/${l.docId}`}
                              className="font-mono text-slate-200 hover:underline"
                            >
                              SO {l.attachedSo.soId}
                              {l.attachedSo.reference && (
                                <span className="text-slate-500"> — {l.attachedSo.reference}</span>
                              )}
                            </Link>
                          ) : (
                            <span className="font-mono text-slate-200">
                              SO {l.attachedSo.soId}
                              {l.attachedSo.reference && (
                                <span className="text-slate-500"> — {l.attachedSo.reference}</span>
                              )}
                            </span>
                          )
                        ) : (
                          <span className="text-amber-400 text-xs">Unmatched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Footer — reconciliation */}
            {(() => {
              const total = parseNum(check.totalAmount);
              const sum = check.lineSum;
              const disc = +(total - sum).toFixed(2);
              const ok = Math.abs(disc) < 0.005;
              return (
                <div
                  className={`px-4 py-2 border-t border-slate-800 flex items-center gap-4 text-xs ${
                    ok ? '' : 'bg-amber-950/20'
                  }`}
                >
                  <span className="text-slate-500">Sum of lines</span>
                  <span className="font-mono font-semibold">{fmtUSD2(sum)}</span>
                  <span className="text-slate-600">vs</span>
                  <span className="text-slate-500">check total</span>
                  <span className="font-mono font-semibold">{fmtUSD2(total)}</span>
                  <span className="flex-1" />
                  {ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Check className="w-3.5 h-3.5" /> Reconciled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <Flag className="w-3 h-3" /> Discrepancy {fmtUSD2(Math.abs(disc))}
                    </span>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

function HealthDot({ health }: { health: 'ok' | 'partial' | 'none' }) {
  const color =
    health === 'ok'
      ? 'bg-emerald-400'
      : health === 'partial'
      ? 'bg-amber-400'
      : 'bg-slate-600';
  return <span className={`w-2 h-2 rounded-full flex-none ${color}`} />;
}

function TypePill({ type }: { type: 'po' | 'wo' | 'inv' }) {
  const styles =
    type === 'wo'
      ? 'text-purple-300 border-purple-700/50 bg-purple-900/20'
      : type === 'inv'
      ? 'text-amber-300 border-amber-700/50 bg-amber-900/20'
      : 'text-slate-200 border-slate-700 bg-slate-800';
  const label = type === 'inv' ? 'INV' : type.toUpperCase();
  return (
    <span
      className={`inline-flex items-center h-[18px] px-1.5 font-mono text-[10px] font-semibold tracking-wide rounded-sm border ${styles}`}
    >
      {label}
    </span>
  );
}

function MatchBadge({
  status,
  docType,
}: {
  status: string | null;
  docType: 'po' | 'wo' | 'inv';
}) {
  if (docType === 'inv') {
    return <span className="text-xs text-slate-500">—</span>;
  }
  if (!status) return <span className="text-xs text-slate-600">—</span>;
  const styles: Record<string, string> = {
    unmatched: 'bg-slate-700 text-slate-200',
    auto_matched: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    confirmed: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    rejected: 'bg-red-900/30 text-red-300 border border-red-800/50',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
        styles[status] ?? styles.unmatched
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
