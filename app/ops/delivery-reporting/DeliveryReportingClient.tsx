'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Truck, RefreshCw, BarChart2, ChevronLeft, Download, Activity } from 'lucide-react';
import type { DeliveryReportPayload, DeliveryReportRow } from '../../api/ops/delivery-reporting/route';
import { usePageTracking } from '@/hooks/usePageTracking';

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
}

const WINDOWS = ['7d', '30d', '90d'] as const;

const BRANCH_OPTIONS = [
  { value: '',     label: 'All Branches' },
  { value: '10FD', label: 'Fort Dodge' },
  { value: '20GR', label: 'Grimes' },
  { value: '25BW', label: 'Birchwood' },
  { value: '40CV', label: 'Coralville' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-3">
      {children}
    </h2>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  max,
  barColor = 'bg-cyan-600',
}: {
  label: string;
  value: number;
  total: number;
  max: number;
  barColor?: string;
}) {
  const barPct = max > 0 ? (value / max) * 100 : 0;
  const sharePct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-200 truncate flex-1">{label}</span>
        <span className="text-xs text-slate-500 tabular-nums">{sharePct}%</span>
        <span className="text-sm font-semibold text-white tabular-nums w-12 text-right">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

type DailyRow = { date: string; count: number };

function DailyBars({ data }: { data: DailyRow[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-px h-28">
      {data.map((d) => {
        const heightPct = (d.count / max) * 100;
        const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        return (
          <div
            key={d.date}
            className="group relative flex-1 flex flex-col justify-end h-full"
            title={`${label}: ${d.count}`}
          >
            <div
              className="w-full bg-cyan-600 group-hover:bg-cyan-400 rounded-sm transition-colors"
              style={{ height: `${heightPct}%`, minHeight: d.count > 0 ? '2px' : '0' }}
            />
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg">
                <span className="text-slate-400">{label}</span>
                <span className="font-bold ml-1.5">{d.count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function exportCsv(detail: DeliveryReportRow[], filename: string) {
  const headers = ['ship_date', 'branch', 'so_number', 'sale_type', 'ship_via', 'line_count'];
  const rows = detail.map((r) =>
    [r.ship_date, r.system_id, r.so_id, r.sale_type ?? '', r.ship_via ?? '', r.line_count].join(','),
  );
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DeliveryReportingClient({ isAdmin, userBranch }: Props) {
  usePageTracking();
  const [windowParam, setWindowParam] = useState<'7d' | '30d' | '90d'>('30d');
  const [saleType, setSaleType] = useState('all');
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [data, setData] = useState<DeliveryReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ window: windowParam, sale_type: saleType, detail_limit: '500' });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/ops/delivery-reporting?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json() as DeliveryReportPayload);
    } catch (e) {
      setError(`Failed to load delivery report. ${e instanceof Error ? e.message : ''}`);
    } finally {
      setLoading(false);
    }
  }, [windowParam, saleType, branch]);

  useEffect(() => { load(); }, [load]);

  // Derived
  const peakDay = data?.by_date.reduce(
    (best, d) => (!best || d.count > best.count ? d : best),
    null as DailyRow | null,
  );
  const avgPerDay = data && data.by_date.length > 0
    ? (data.total / data.by_date.length).toFixed(1)
    : '—';

  const shipTotal    = data?.by_ship_via.reduce((s, d) => s + d.count, 0) ?? 0;
  const saleTotal    = data?.by_sale_type.reduce((s, d) => s + d.count, 0) ?? 0;
  const maxShip      = Math.max(...(data?.by_ship_via.map((d) => d.count) ?? [1]), 1);
  const maxSaleType  = Math.max(...(data?.by_sale_type.map((d) => d.count) ?? [1]), 1);

  const firstDate = data?.by_date[0]?.date;
  const lastDate  = data?.by_date[data?.by_date.length - 1]?.date;
  const fmtDate   = (s: string) =>
    new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const branchLabel = BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? 'All Branches';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/sales"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition mb-2"
          >
            <ChevronLeft className="w-3 h-3" />
            Sales Hub
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-cyan-400" />
            Delivery Reporting
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Shipped orders by date · {branchLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Window selector */}
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindowParam(w)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  windowParam === w
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Sale type filter */}
          <select
            value={saleType}
            onChange={(e) => setSaleType(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Types</option>
            {data?.by_sale_type.map((s) => (
              <option key={s.sale_type} value={s.sale_type}>{s.sale_type}</option>
            ))}
          </select>

          {/* Branch filter (admin only) */}
          {isAdmin && (
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            >
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          )}

          {data && (
            <button
              onClick={() => exportCsv(data.detail, `deliveries-${windowParam}-${saleType}.csv`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white hover:border-slate-600 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}

          <button
            onClick={load}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/60 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading delivery data…</span>
        </div>
      )}

      {data && (
        <>
          {/* KPI tiles */}
          <div>
            <SectionTitle>Summary · Last {windowParam}</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiTile
                label="Total Deliveries"
                value={data.total.toLocaleString()}
                sub={`${data.by_date.length} shipping days`}
              />
              <KpiTile
                label="Avg / Day"
                value={avgPerDay}
                sub="on active days"
              />
              <KpiTile
                label="Peak Day"
                value={peakDay?.count.toLocaleString() ?? '—'}
                sub={peakDay ? fmtDate(peakDay.date) : undefined}
              />
              <KpiTile
                label="Unique SOs"
                value={data.detail.length < 500
                  ? data.detail.length.toLocaleString()
                  : `${data.detail.length}+`}
                sub="in detail view"
              />
            </div>
          </div>

          {/* Daily bar chart */}
          {data.by_date.length > 0 && (
            <div>
              <SectionTitle>Deliveries by Day</SectionTitle>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500">{data.by_date.length} days</span>
                  <span className="text-xs text-slate-500">
                    peak{' '}
                    <span className="text-white font-semibold tabular-nums">
                      {peakDay?.count ?? 0}
                    </span>
                  </span>
                </div>
                <DailyBars data={data.by_date} />
                {data.by_date.length > 1 && firstDate && lastDate && (
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-slate-600">{fmtDate(firstDate)}</span>
                    <span className="text-[10px] text-slate-600">{fmtDate(lastDate)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Breakdowns */}
          {(data.by_sale_type.length > 0 || data.by_ship_via.length > 0) && (
            <div>
              <SectionTitle>Breakdowns</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* By sale type */}
                {data.by_sale_type.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-sm font-semibold text-white">By Sale Type</span>
                      <span className="ml-auto text-xs text-slate-500 tabular-nums">
                        {saleTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {data.by_sale_type.map((s, i) => (
                        <BreakdownRow
                          key={i}
                          label={s.sale_type}
                          value={s.count}
                          total={saleTotal}
                          max={maxSaleType}
                          barColor="bg-emerald-600"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* By ship via */}
                {data.by_ship_via.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Truck className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="text-sm font-semibold text-white">By Ship Via</span>
                      <span className="ml-auto text-xs text-slate-500 tabular-nums">
                        {shipTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {data.by_ship_via.map((s, i) => (
                        <BreakdownRow
                          key={i}
                          label={s.ship_via}
                          value={s.count}
                          total={shipTotal}
                          max={maxShip}
                          barColor="bg-purple-600"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detail table */}
          <div>
            <SectionTitle>Detail</SectionTitle>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-sm font-semibold text-white">Shipped Orders</span>
                <span className="ml-auto text-xs text-slate-500">
                  {data.detail.length}{data.detail.length >= 500 ? '+' : ''} rows · {windowParam}
                  {saleType !== 'all' ? ` · ${saleType}` : ''}
                </span>
              </div>

              {data.detail.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">
                  No delivery data found for this period.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr className="border-b border-slate-700">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 whitespace-nowrap">
                          Ship Date
                        </th>
                        {isAdmin && (
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                            Branch
                          </th>
                        )}
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          SO #
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          Sale Type
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                          Ship Via
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 pr-4">
                          Lines
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detail.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-800 hover:bg-slate-800/40 transition"
                        >
                          <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap tabular-nums">
                            {r.ship_date}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2.5 text-xs text-slate-500">{r.system_id}</td>
                          )}
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/sales/orders/${r.so_id}`}
                              className="font-mono text-cyan-400 hover:text-cyan-300 text-xs transition"
                            >
                              {r.so_id}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">{r.sale_type ?? '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">{r.ship_via ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-mono tabular-nums text-slate-300 pr-4">
                            {r.line_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
