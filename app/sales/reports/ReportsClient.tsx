'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { BarChart2, RefreshCw, TrendingUp, Users, Truck, Activity, ChevronLeft } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import HouseLoader from '@/components/scorecard/HouseLoader';
import ExportTableButton from '@/components/shared/ExportTableButton';
import {
  TimeSeriesChart,
  MixDonut,
  StatusFunnelBar,
  CHART_COLORS,
} from '@/components/charts';

interface ReportsData {
  period_days: number;
  daily_orders:       { order_date: string; count: number }[];
  by_sale_type:       { sale_type: string; count: number }[];
  by_ship_via:        { ship_via: string; count: number }[];
  top_customers:      { cust_name: string | null; order_count: number }[];
  status_breakdown:   { so_status: string; cnt: number }[];
  prev_total:         number;
  prev_by_sale_type:  { sale_type: string; count: number }[];
  prev_top_customers: { cust_name: string | null; order_count: number }[];
}

type DailyRow = { order_date: string; count: number };

// B = blank/no-status in Agility = effectively Open. C (Cancelled) is excluded at the query level.
const SO_STATUS: Record<string, { label: string; cls: string }> = {
  O: { label: 'Open',      cls: 'bg-blue-900/60 text-blue-300 border-blue-700/60' },
  B: { label: 'Open',      cls: 'bg-blue-900/60 text-blue-300 border-blue-700/60' },
  K: { label: 'Picking',   cls: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/60' },
  S: { label: 'Staged',    cls: 'bg-orange-900/60 text-orange-300 border-orange-700/60' },
  D: { label: 'Delivered', cls: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/60' },
  I: { label: 'Invoiced',  cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60' },
  P: { label: 'Picked',    cls: 'bg-indigo-900/60 text-indigo-300 border-indigo-700/60' },
};

const BRANCH_OPTIONS = [
  { value: '',     label: 'All Branches' },
  { value: '10FD', label: 'Fort Dodge' },
  { value: '20GR', label: 'Grimes' },
  { value: '25BW', label: 'Birchwood' },
  { value: '40CV', label: 'Coralville' },
];

const PERIOD_OPTIONS = [
  { value: 7,  label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-3">
      {children}
    </h2>
  );
}

function yoyDelta(current: number, prev: number) {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function DeltaBadge({ current, prev }: { current: number; prev: number | undefined }) {
  if (prev == null || prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiTile({
  label, value, sub, current, prev,
}: {
  label: string;
  value: string | number;
  sub?: string;
  current?: number;
  prev?: number;
}) {
  const delta = current != null && prev != null ? yoyDelta(current, prev) : null;
  const up = delta != null && delta >= 0;
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <div className="flex items-center justify-between gap-1 mt-0.5">
        {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
        {delta != null && (
          <span className={`text-xs font-semibold shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs prior yr
          </span>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  label, value, total, max, barColor = 'bg-cyan-600', badge, prevValue,
}: {
  label: string;
  value: number;
  total: number;
  max: number;
  barColor?: string;
  badge?: React.ReactNode;
  prevValue?: number;
}) {
  const barPct   = max > 0 ? (value / max) * 100 : 0;
  const sharePct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {badge}
        <span className="text-sm text-slate-200 truncate flex-1">{label}</span>
        <DeltaBadge current={value} prev={prevValue} />
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

export default function ReportsClient({ isAdmin, userBranch }: Props) {
  usePageTracking();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(30);
  const [branch, setBranch] = useState(userBranch ?? '');

  const fetchData = useCallback(async (p: number, br: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: String(p) });
      if (br) params.set('branch', br);
      const res = await window.fetch(`/api/sales/reports?${params}`);
      if (!res.ok) return;
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period, branch); }, [fetchData, period, branch]);

  // Derived stats — current period
  const totalOrders = data?.daily_orders.reduce((s, d) => s + d.count, 0) ?? 0;
  const activeDays  = data?.daily_orders.filter((d) => d.count > 0).length ?? 0;
  const avgPerDay   = activeDays > 0 ? (totalOrders / activeDays).toFixed(1) : '—';
  const peakDay     = data?.daily_orders.reduce(
    (best, d) => (!best || d.count > best.count ? d : best),
    null as DailyRow | null,
  );

  // Open orders = any status that isn't a terminal state (B = blank/open in Agility, O = Open)
  const openCount = data?.status_breakdown
    .filter((s) => s.so_status === 'O' || s.so_status === 'B')
    .reduce((sum, s) => sum + s.cnt, 0) ?? 0;

  // Prior year lookup maps
  const prevSaleTypeMap = new Map(
    (data?.prev_by_sale_type ?? []).map((s) => [s.sale_type, s.count]),
  );
  const prevCustomerMap = new Map(
    (data?.prev_top_customers ?? []).map((c) => [c.cust_name, c.order_count]),
  );

  // Breakdown totals / maxes
  const statusTotal   = data?.status_breakdown.reduce((s, d) => s + d.cnt,       0) ?? 0;
  const shipTotal     = data?.by_ship_via.reduce((s, d) => s + d.count,           0) ?? 0;
  const saleTypeTotal = data?.by_sale_type.reduce((s, d) => s + d.count,          0) ?? 0;
  const customerTotal = data?.top_customers.reduce((s, d) => s + d.order_count,   0) ?? 0;
  const maxShip       = Math.max(...(data?.by_ship_via.map((d) => d.count)      ?? [1]), 1);
  const maxSaleType   = Math.max(...(data?.by_sale_type.map((d) => d.count)     ?? [1]), 1);
  const maxStatus     = Math.max(...(data?.status_breakdown.map((d) => d.cnt)   ?? [1]), 1);
  const maxCustomer   = Math.max(...(data?.top_customers.map((d) => d.order_count) ?? [1]), 1);

  // Prior year avg/day for KPI comparison
  const prevActiveDays = period; // approximate — prior year had the same window length
  const prevAvgPerDay  = data && data.prev_total > 0
    ? data.prev_total / prevActiveDays
    : undefined;
  const currentAvgNum  = activeDays > 0 ? totalOrders / activeDays : 0;

  const branchLabel = BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? 'All Branches';
  const fmtDate = (s: string) =>
    new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/sales"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition mb-2"
          >
            <ChevronLeft className="w-3 h-3" /> Sales Hub
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-cyan-400" />
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Sales order activity · {branchLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setPeriod(o.value)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  period === o.value ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

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

          <button
            onClick={() => fetchData(period, branch)}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-24 text-slate-500 gap-3">
          <HouseLoader size={48} />
          <span className="text-sm">Loading analytics…</span>
        </div>
      )}

      {data && (
        <>
          {/* Export all data */}
          <div className="flex justify-end">
            <ExportTableButton
              data={data.daily_orders.map((d) => ({
                Date: d.order_date,
                Orders: d.count,
              }))}
              filename={`daily-orders-${period}d`}
            />
          </div>

          {/* KPI summary */}
          <div>
            <SectionTitle>Summary · Last {period} days</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiTile
                label="Total Orders"
                value={totalOrders.toLocaleString()}
                sub={`${activeDays} active days`}
                current={totalOrders}
                prev={data.prev_total}
              />
              <KpiTile
                label="Avg / Day"
                value={avgPerDay}
                sub="on active days"
                current={currentAvgNum}
                prev={prevAvgPerDay}
              />
              <KpiTile
                label="Peak Day"
                value={peakDay?.count.toLocaleString() ?? '—'}
                sub={peakDay ? fmtDate(peakDay.order_date) : undefined}
              />
              <KpiTile
                label="Open Orders"
                value={openCount.toLocaleString()}
                sub="not yet invoiced"
              />
            </div>
          </div>

          {/* Daily bar chart */}
          <div>
            <SectionTitle>Order Volume by Day</SectionTitle>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 print:break-inside-avoid">
              {data.daily_orders.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No data for this period</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500">{data.daily_orders.length} days</span>
                    <span className="text-xs text-slate-500">
                      peak{' '}
                      <span className="text-white font-semibold tabular-nums">
                        {peakDay?.count ?? 0}
                      </span>
                      {prevAvgPerDay !== undefined && (
                        <>
                          {' · '}
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block w-3 h-px"
                              style={{ backgroundColor: CHART_COLORS.accent, borderTop: `1px dashed ${CHART_COLORS.accent}` }}
                            />
                            prior yr avg{' '}
                            <span className="text-white font-semibold tabular-nums">
                              {prevAvgPerDay.toFixed(1)}
                            </span>
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <TimeSeriesChart
                    data={data.daily_orders.map((d) => ({ date: d.order_date, count: d.count }))}
                    series={[{ key: 'count', label: 'Orders', color: CHART_COLORS.base }]}
                    referenceY={
                      prevAvgPerDay !== undefined
                        ? { value: prevAvgPerDay, label: 'Prior yr avg' }
                        : undefined
                    }
                    brush={period >= 90}
                    height={220}
                  />
                </>
              )}
            </div>
          </div>

          {/* Mix + Status visualizations */}
          {(data.by_sale_type.length > 0 || data.status_breakdown.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.by_sale_type.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 print:break-inside-avoid">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-semibold text-white">Sale Type Mix</span>
                    <span className="ml-auto text-xs text-slate-500">top 6 + Other</span>
                  </div>
                  <MixDonut
                    rows={data.by_sale_type.map((s) => ({
                      label: s.sale_type,
                      value: s.count,
                      prevValue: prevSaleTypeMap.get(s.sale_type),
                    }))}
                    centerLabel="Orders"
                    height={240}
                  />
                </div>
              )}
              {data.status_breakdown.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 print:break-inside-avoid">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-sm font-semibold text-white">Pipeline</span>
                    <span className="ml-auto text-xs text-slate-500">Open → Invoiced</span>
                  </div>
                  <StatusFunnelBar
                    counts={data.status_breakdown.reduce<Record<string, number>>(
                      (acc, s) => {
                        const key = s.so_status?.trim() ? s.so_status : 'B';
                        acc[key] = (acc[key] ?? 0) + s.cnt;
                        return acc;
                      },
                      {},
                    )}
                    height={48}
                  />
                </div>
              )}
            </div>
          )}

          {/* Breakdowns */}
          <div>
            <SectionTitle>Breakdowns</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* By Sale Type */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">By Sale Type</span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                    {saleTypeTotal.toLocaleString()}
                  </span>
                  <ExportTableButton
                    data={data.by_sale_type.map((s) => ({
                      'Sale Type': s.sale_type,
                      Count: s.count,
                      'Prior Year': prevSaleTypeMap.get(s.sale_type) ?? '',
                      'Share %': saleTypeTotal > 0 ? `${((s.count / saleTypeTotal) * 100).toFixed(1)}%` : '—',
                    }))}
                    filename="by-sale-type"
                  />
                </div>
                {data.by_sale_type.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">No data</p>
                ) : (
                  <div className="space-y-3">
                    {data.by_sale_type.map((s, i) => (
                      <BreakdownRow
                        key={i}
                        label={s.sale_type}
                        value={s.count}
                        total={saleTypeTotal}
                        max={maxSaleType}
                        barColor="bg-emerald-600"
                        prevValue={prevSaleTypeMap.get(s.sale_type)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* By Ship Via */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">By Ship Via</span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                    {shipTotal.toLocaleString()}
                  </span>
                  <ExportTableButton
                    data={data.by_ship_via.map((s) => ({
                      'Ship Via': s.ship_via,
                      Count: s.count,
                      'Share %': shipTotal > 0 ? `${((s.count / shipTotal) * 100).toFixed(1)}%` : '—',
                    }))}
                    filename="by-ship-via"
                  />
                </div>
                {data.by_ship_via.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">No data</p>
                ) : (
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
                )}
              </div>

              {/* Status breakdown */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">Order Status</span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                    {statusTotal.toLocaleString()}
                  </span>
                  <ExportTableButton
                    data={data.status_breakdown.map((s) => ({
                      'Status Code': s.so_status,
                      'Status Label': SO_STATUS[s.so_status]?.label ?? s.so_status,
                      Count: s.cnt,
                      'Share %': statusTotal > 0 ? `${((s.cnt / statusTotal) * 100).toFixed(1)}%` : '—',
                    }))}
                    filename="order-status"
                  />
                </div>
                {data.status_breakdown.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">No data</p>
                ) : (
                  <div className="space-y-3">
                    {data.status_breakdown.map((s, i) => {
                      const info = SO_STATUS[s.so_status] ?? {
                        label: s.so_status,
                        cls: 'bg-slate-800 text-slate-400 border-slate-600',
                      };
                      return (
                        <BreakdownRow
                          key={i}
                          label={info.label}
                          value={s.cnt}
                          total={statusTotal}
                          max={maxStatus}
                          barColor="bg-cyan-600"
                          badge={
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${info.cls}`}>
                              {s.so_status}
                            </span>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top customers */}
          <div>
            <SectionTitle>Top Customers</SectionTitle>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-sm font-semibold text-white">Top 10 by Order Count</span>
                <span className="ml-auto text-xs text-slate-500">
                  last {period} days · {customerTotal.toLocaleString()} total
                </span>
                <ExportTableButton
                  data={data.top_customers.map((c, i) => ({
                    Rank: i + 1,
                    Customer: c.cust_name ?? 'Unknown',
                    'This Period': c.order_count,
                    'Prior Year': prevCustomerMap.get(c.cust_name) ?? '',
                    'Share %': customerTotal > 0 ? `${((c.order_count / customerTotal) * 100).toFixed(1)}%` : '—',
                  }))}
                  filename={`top-customers-${period}d`}
                  className="ml-1"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 w-10">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Customer</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Share</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">This Period</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 pr-4">Prior Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_customers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-sm">No data</td>
                      </tr>
                    )}
                    {data.top_customers.map((c, i) => {
                      const barPct   = maxCustomer > 0 ? (c.order_count / maxCustomer) * 100 : 0;
                      const sharePct = customerTotal > 0
                        ? ((c.order_count / customerTotal) * 100).toFixed(1)
                        : '0.0';
                      const prevCount = prevCustomerMap.get(c.cust_name) ?? undefined;
                      const delta     = prevCount != null ? yoyDelta(c.order_count, prevCount) : null;
                      return (
                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/40 transition">
                          <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-white">{c.cust_name ?? 'Unknown'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-600 rounded-full" style={{ width: `${barPct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 tabular-nums">{sharePct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-cyan-400 tabular-nums">
                            {c.order_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right pr-4">
                            {prevCount != null ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className={`text-[10px] font-semibold ${delta != null && delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {delta != null ? (delta >= 0 ? '▲' : '▼') : ''}{delta != null ? `${Math.abs(delta).toFixed(0)}%` : ''}
                                </span>
                                <span className="text-xs text-slate-500 tabular-nums font-mono">
                                  {prevCount.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
