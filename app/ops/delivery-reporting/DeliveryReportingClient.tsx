'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Truck, RefreshCw, BarChart2, ChevronLeft, Download, Activity, Building2, Layers,
} from 'lucide-react';
import type {
  DeliveryReportPayload, DeliveryReportRow,
} from '../../api/ops/delivery-reporting/route';
import { usePageTracking } from '@/hooks/usePageTracking';
import {
  TimeSeriesChart,
  MixDonut,
  HeatmapGrid,
  CHART_COLORS,
} from '@/components/charts';

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

const BRANCH_LABEL: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const BRANCH_COLOR: Record<string, string> = {
  '10FD': 'text-red-300',
  '20GR': 'text-cyan-300',
  '25BW': 'text-amber-300',
  '40CV': 'text-slate-200',
};

function isSaturday(date: string): boolean {
  return new Date(date + 'T00:00:00').getDay() === 6;
}

function fmtDay(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

/** Compute avg / high / low from a flat list of (date, count) pairs. */
function dailyStats(rows: { date: string; count: number }[]): {
  avg: number; high: number; low: number; days: number;
  highDate: string | null; lowDate: string | null;
} {
  if (rows.length === 0) return { avg: 0, high: 0, low: 0, days: 0, highDate: null, lowDate: null };
  let high = -Infinity, low = Infinity, sum = 0;
  let highDate: string | null = null, lowDate: string | null = null;
  for (const r of rows) {
    sum += r.count;
    if (r.count > high) { high = r.count; highDate = r.date; }
    if (r.count < low)  { low  = r.count; lowDate  = r.date; }
  }
  return {
    avg: sum / rows.length,
    high: high === -Infinity ? 0 : high,
    low:  low  === +Infinity ? 0 : low,
    days: rows.length,
    highDate, lowDate,
  };
}

export default function DeliveryReportingClient({ isAdmin, userBranch }: Props) {
  usePageTracking();
  const [windowParam, setWindowParam] = useState<'7d' | '30d' | '90d'>('30d');
  const [saleType, setSaleType] = useState('all');
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [includeSaturdays, setIncludeSaturdays] = useState(false);
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

  // Apply Saturday filter to overall daily series → daily avg / high / low
  const filteredByDate = useMemo(() => {
    if (!data) return [] as { date: string; count: number }[];
    return includeSaturdays ? data.by_date : data.by_date.filter((d) => !isSaturday(d.date));
  }, [data, includeSaturdays]);

  const overallStats = useMemo(() => dailyStats(filteredByDate), [filteredByDate]);

  // Per-branch daily aggregates → reroll into branch-specific date series, then stats
  const perBranch = useMemo(() => {
    if (!data) return [] as Array<{
      branch: string;
      avg: number; high: number; low: number; days: number; total: number;
      highDate: string | null; lowDate: string | null;
    }>;
    const byBranch = new Map<string, Map<string, number>>();
    for (const cell of data.by_date_branch) {
      if (!includeSaturdays && isSaturday(cell.date)) continue;
      let dayMap = byBranch.get(cell.system_id);
      if (!dayMap) { dayMap = new Map(); byBranch.set(cell.system_id, dayMap); }
      dayMap.set(cell.date, (dayMap.get(cell.date) ?? 0) + cell.count);
    }
    const out: Array<{
      branch: string; avg: number; high: number; low: number; days: number; total: number;
      highDate: string | null; lowDate: string | null;
    }> = [];
    for (const [b, dayMap] of byBranch) {
      const rows = Array.from(dayMap, ([date, count]) => ({ date, count }));
      const s = dailyStats(rows);
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      out.push({ branch: b, ...s, total });
    }
    out.sort((a, b) => b.avg - a.avg);
    return out;
  }, [data, includeSaturdays]);

  const shipTotal = data?.by_ship_via.reduce((s, d) => s + d.count, 0) ?? 0;

  // Stacked-by-branch time series — pivot by_date_branch into one row per date with
  // a numeric column per branch. Branches with at least one delivery in the window
  // become series; Saturday filtering is applied client-side.
  const { stackedByDate, branchSeries } = useMemo(() => {
    if (!data) return { stackedByDate: [], branchSeries: [] };
    const branches = Array.from(
      new Set(data.by_date_branch.map((c) => c.system_id)),
    ).sort();
    const dateMap = new Map<string, Record<string, number>>();
    for (const cell of data.by_date_branch) {
      if (!includeSaturdays && isSaturday(cell.date)) continue;
      let row = dateMap.get(cell.date);
      if (!row) {
        row = {};
        dateMap.set(cell.date, row);
      }
      row[cell.system_id] = (row[cell.system_id] ?? 0) + cell.count;
    }
    const stacked = Array.from(dateMap, ([date, byBranch]) => {
      const row: { date: string; [k: string]: number | string } = { date };
      for (const b of branches) row[b] = byBranch[b] ?? 0;
      return row;
    }).sort((a, b) => a.date.localeCompare(b.date));
    const series = branches.map((b) => ({
      key: b,
      label: BRANCH_LABEL[b] ?? b,
      color: CHART_COLORS.branch[b] ?? CHART_COLORS.categorical[0],
    }));
    return { stackedByDate: stacked, branchSeries: series };
  }, [data, includeSaturdays]);

  // Sale Type × Branch heatmap — pivot from the new by_sale_type_branch aggregate.
  const { saleTypeRows, saleTypeBranchCols, saleTypeBranchValues } = useMemo(() => {
    const rows = data?.by_sale_type.map((s) => s.sale_type) ?? [];
    const colSet = new Set<string>();
    const values: Record<string, Record<string, number>> = {};
    for (const cell of data?.by_sale_type_branch ?? []) {
      colSet.add(cell.system_id);
      if (!values[cell.sale_type]) values[cell.sale_type] = {};
      values[cell.sale_type][cell.system_id] = cell.count;
    }
    return {
      saleTypeRows: rows,
      saleTypeBranchCols: Array.from(colSet).sort(),
      saleTypeBranchValues: values,
    };
  }, [data]);

  const branchLabel = BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? 'All Branches';

  const fmtAvg = (n: number) => (n === 0 ? '0' : n.toFixed(1));

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
            Shipped orders by date · {branchLabel} ·{' '}
            {includeSaturdays ? 'Saturdays included' : 'Mon–Fri only'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindowParam(w)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  windowParam === w ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
              includeSaturdays
                ? 'bg-cyan-900/40 border-cyan-700 text-cyan-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Saturdays are mostly low-volume delivery days; off by default."
          >
            <input
              type="checkbox"
              checked={includeSaturdays}
              onChange={(e) => setIncludeSaturdays(e.target.checked)}
              className="accent-cyan-500"
            />
            Include Saturdays
          </label>

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

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/60 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading delivery data…</span>
        </div>
      )}

      {data && (
        <>
          {/* Daily KPI bank — avg / high / low (no rolling totals) */}
          <div>
            <SectionTitle>
              Daily Cadence · Last {windowParam} · {overallStats.days} active day
              {overallStats.days === 1 ? '' : 's'}
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiTile
                label="Daily Avg"
                value={fmtAvg(overallStats.avg)}
                sub={`across ${overallStats.days} day${overallStats.days === 1 ? '' : 's'}`}
              />
              <KpiTile
                label="Daily High"
                value={overallStats.high.toLocaleString()}
                sub={overallStats.highDate ? fmtDay(overallStats.highDate) : undefined}
              />
              <KpiTile
                label="Daily Low"
                value={overallStats.low.toLocaleString()}
                sub={overallStats.lowDate ? fmtDay(overallStats.lowDate) : undefined}
              />
            </div>
          </div>

          {/* Per-branch breakdown */}
          {perBranch.length > 0 && (
            <div>
              <SectionTitle>By Branch · Daily Avg / High / Low</SectionTitle>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900/40">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" /> Branch
                        </div>
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">
                        Daily Avg
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">
                        Daily High
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">
                        Daily Low
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 pr-4">
                        Active Days
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {perBranch.map((b) => (
                      <tr key={b.branch} className="border-b border-slate-800 hover:bg-slate-800/40 transition">
                        <td className="px-4 py-2.5">
                          <span className={`font-semibold ${BRANCH_COLOR[b.branch] ?? 'text-white'}`}>
                            {BRANCH_LABEL[b.branch] ?? b.branch}
                          </span>
                          <span className="text-slate-600 text-xs ml-2 font-mono">{b.branch}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-white">
                          {fmtAvg(b.avg)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300">
                          {b.high.toLocaleString()}
                          {b.highDate && (
                            <span className="text-[10px] text-slate-600 ml-1.5">
                              {fmtDay(b.highDate)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-300">
                          {b.low.toLocaleString()}
                          {b.lowDate && (
                            <span className="text-[10px] text-slate-600 ml-1.5">
                              {fmtDay(b.lowDate)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500 pr-4">
                          {b.days}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daily stacked-by-branch chart */}
          {data.by_date.length > 0 && (
            <div>
              <SectionTitle>Deliveries by Day</SectionTitle>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 print:break-inside-avoid">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500">{stackedByDate.length} days</span>
                  <span className="text-xs text-slate-500">
                    avg{' '}
                    <span className="text-white font-semibold tabular-nums">
                      {fmtAvg(overallStats.avg)}
                    </span>
                    {' '}· high{' '}
                    <span className="text-emerald-300 font-semibold tabular-nums">
                      {overallStats.high}
                    </span>
                    {' '}· low{' '}
                    <span className="text-amber-300 font-semibold tabular-nums">
                      {overallStats.low}
                    </span>
                    {!includeSaturdays && ' · Sat excluded'}
                  </span>
                </div>
                <TimeSeriesChart
                  data={stackedByDate}
                  series={branchSeries}
                  stacked
                  brush={windowParam === '90d'}
                  height={260}
                />
              </div>
            </div>
          )}

          {/* Sale Type × Branch heatmap */}
          {saleTypeRows.length > 0 && saleTypeBranchCols.length > 0 && (
            <div>
              <SectionTitle>Sale Type × Branch</SectionTitle>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 print:break-inside-avoid">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">Mix by Branch</span>
                  <span className="ml-auto text-xs text-slate-500">
                    cell intensity scales with delivery count
                  </span>
                </div>
                <HeatmapGrid
                  rows={saleTypeRows}
                  cols={saleTypeBranchCols}
                  colLabels={BRANCH_LABEL}
                  values={saleTypeBranchValues}
                />
              </div>
            </div>
          )}

          {/* Ship Via mix donut */}
          {data.by_ship_via.length > 0 && (
            <div>
              <SectionTitle>By Ship Via</SectionTitle>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 print:break-inside-avoid">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">Carrier Mix</span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums">
                    {shipTotal.toLocaleString()} total
                  </span>
                </div>
                <MixDonut
                  rows={data.by_ship_via.map((s) => ({ label: s.ship_via, value: s.count }))}
                  centerLabel="Deliveries"
                  height={260}
                />
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
                            {isSaturday(r.ship_date) && (
                              <span className="text-[10px] text-slate-600 ml-1.5">Sat</span>
                            )}
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
