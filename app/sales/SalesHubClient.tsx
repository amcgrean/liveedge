'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { HubData, HubActivity, HubCustomer, HubTransaction, HubKPIs } from '../api/sales/hub/route';

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
  agentId: string | null;
}

const SO_STATUS: Record<string, { label: string; color: string }> = {
  O: { label: 'Open',      color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  K: { label: 'Picking',   color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  S: { label: 'Staged',    color: 'bg-orange-900/60 text-orange-300 border-orange-700' },
  D: { label: 'Delivered', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  I: { label: 'Invoiced',  color: 'bg-green-900/60 text-green-300 border-green-700' },
  C: { label: 'Closed',    color: 'bg-gray-800/80 text-gray-400 border-gray-600' },
  P: { label: 'Picked',    color: 'bg-indigo-900/60 text-indigo-300 border-indigo-700' },
};

function statusBadge(status: string) {
  const s = SO_STATUS[status?.toUpperCase()] ?? { label: status || '—', color: 'bg-gray-800/80 text-gray-400 border-gray-600' };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>
      {s.label}
    </span>
  );
}

function saleTypeBadge(t: string | null) {
  if (!t) return null;
  const upper = t.toUpperCase().trim();
  if (upper === 'WC') return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-900/50 text-amber-300 border-amber-700">WC</span>;
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-gray-800 text-gray-400 border-gray-600">{t}</span>;
}

function activityIcon(type: HubActivity['type']) {
  const base = 'w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 mt-0.5';
  switch (type) {
    case 'order':     return <div className={`${base} bg-cyan-950 text-cyan-400`}>📋</div>;
    case 'will_call': return <div className={`${base} bg-amber-950 text-amber-400`}>🏪</div>;
    case 'bid':       return <div className={`${base} bg-violet-950 text-violet-400`}>📐</div>;
    case 'design':    return <div className={`${base} bg-indigo-950 text-indigo-400`}>📏</div>;
    case 'service':   return <div className={`${base} bg-red-950 text-red-400`}>🔧</div>;
  }
}

interface KPICardProps {
  label: string;
  value: number | string;
  sub: string;
  accent: string;
  href?: string;
  loading?: boolean;
}

function KPICard({ label, value, sub, accent, href, loading }: KPICardProps) {
  const inner = (
    <div
      className={`group relative bg-gray-900 border border-gray-700 rounded-xl p-4 overflow-hidden
        transition-all duration-150 hover:border-opacity-80 hover:-translate-y-px cursor-pointer`}
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">{label}</div>
      <div className="text-3xl font-black text-white leading-none mb-1">
        {loading ? <span className="text-gray-600">—</span> : value}
      </div>
      <div className="text-[11px] text-gray-500">{sub}</div>
      <div className="absolute bottom-2.5 right-3 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
           style={{ color: accent }}>
        View all →
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function SectionLabel({ children }: { children?: ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3 mt-7">
      {children}
    </div>
  );
}

export default function SalesHubClient({ isAdmin, userBranch, userName, userRole, agentId }: Props) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const txBase = '/sales/transactions';
  function txUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(params);
    return `${txBase}?${sp.toString()}`;
  }
  usePageTracking();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/sales/hub')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load hub data');
        return r.json() as Promise<HubData>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load hub data.'); setLoading(false); });
  }, []);

  const kpis: HubKPIs = data?.kpis ?? {
    myOpenOrders: 0, myWrittenOrders: 0, branchWillCalls: 0, myCustomerWillCalls: 0,
    willCallsIWrote: 0, openQuotes: 0, openDesigns: 0, openServiceRequests: 0,
    myOpenPOs: 0, posIWrote: 0,
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <TopNav userName={userName} userRole={userRole} />
      <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Sales Hub</h1>
              {userName && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {greeting}, {userName} {isAdmin && <span className="text-gray-600">· Admin view</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5">
                {dateStr}
              </span>
              {userBranch && (
                <span className="text-xs font-semibold text-blue-300 bg-blue-950 border border-blue-800 rounded-lg px-3 py-1.5">
                  {userBranch}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">{error}</div>
          )}

          {/* ── Row 1: My Activity ── */}
          <SectionLabel>My Activity</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPICard
              label="My Open Orders"
              value={kpis.myOpenOrders}
              sub="You are account rep"
              accent="#00894a"
              href={agentId ? txUrl({ rep1: agentId, status: 'O' }) : txBase}
              loading={loading}
            />
            <KPICard
              label="My Written Orders"
              value={kpis.myWrittenOrders}
              sub="Last 30 days"
              accent="#3b82f6"
              href={agentId ? txUrl({ rep3: agentId, date_from: thirtyDaysAgo }) : txBase}
              loading={loading}
            />
            <KPICard
              label="Branch Will Calls"
              value={kpis.branchWillCalls}
              sub={`Open at ${userBranch ?? 'branch'}`}
              accent="#f59e0b"
              href={txUrl({ sale_type: 'WC', status: 'O', ...(userBranch ? { branch: userBranch } : {}) })}
              loading={loading}
            />
            <KPICard
              label="My Customers' WCs"
              value={kpis.myCustomerWillCalls}
              sub="Will calls for your accounts"
              accent="#f97316"
              href={agentId ? txUrl({ rep1: agentId, sale_type: 'WC', status: 'O' }) : txBase}
              loading={loading}
            />
            <KPICard
              label="Will Calls I Wrote"
              value={kpis.willCallsIWrote}
              sub="Open WCs you entered"
              accent="#eab308"
              href={agentId ? txUrl({ rep3: agentId, sale_type: 'WC', status: 'O' }) : txBase}
              loading={loading}
            />
          </div>

          {/* ── Row 2: Related Work ── */}
          <SectionLabel>Related Work</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPICard
              label="Open Quotes"
              value={kpis.openQuotes}
              sub="From estimating"
              accent="#8b5cf6"
              href="/legacy-bids"
              loading={loading}
            />
            <KPICard
              label="Open Designs"
              value={kpis.openDesigns}
              sub="In design queue"
              accent="#a855f7"
              href="/designs"
              loading={loading}
            />
            <KPICard
              label="Service Requests"
              value={kpis.openServiceRequests}
              sub="Open IT / service issues"
              accent="#ef4444"
              href="/it-issues"
              loading={loading}
            />
            <KPICard
              label="My Open POs"
              value={kpis.myOpenPOs}
              sub={`Branch total${userBranch ? ` · ${userBranch}` : ''}`}
              accent="#06b6d4"
              href="/purchasing/open-pos"
              loading={loading}
            />
            <KPICard
              label="POs I Wrote"
              value={kpis.posIWrote}
              sub="Buyer 2"
              accent="#0891b2"
              href="/purchasing/open-pos"
              loading={loading}
            />
          </div>

          {/* ── Middle: Customers + Activity ── */}
          <SectionLabel>My Customers &amp; Recent Activity</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top Customers */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                  <span className="text-sm font-semibold text-white">Top Customers</span>
                  <span className="text-[10px] text-gray-500">last 30 days</span>
                </div>
                <Link href="/sales/customers" className="text-[11px] text-gray-500 hover:text-white transition">
                  All customers →
                </Link>
              </div>

              {loading ? (
                <div className="px-4 py-8 text-center text-sm text-gray-600">Loading…</div>
              ) : !data?.topCustomers.length ? (
                <div className="px-4 py-8 text-center text-sm text-gray-600">No orders in the last 30 days.</div>
              ) : (
                <div>
                  {data.topCustomers.map((c: HubCustomer, i: number) => {
                    const initials = c.cust_name.split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase();
                    const avatarColors = ['bg-cyan-800', 'bg-blue-800', 'bg-amber-800', 'bg-emerald-800', 'bg-violet-800', 'bg-rose-800', 'bg-indigo-800'];
                    const rankColors = ['text-yellow-400 border-yellow-600 bg-yellow-950', 'text-gray-400 border-gray-600 bg-gray-800', 'text-amber-600 border-amber-700 bg-amber-950'];
                    return (
                      <Link key={c.cust_code} href={`/sales/customers/${c.cust_code}`}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors group">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${rankColors[i] ?? 'text-gray-500 border-gray-700 bg-gray-900'}`}>
                            {i + 1}
                          </div>
                          <div className={`w-8 h-8 rounded-lg ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                            {initials}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-200 group-hover:text-white transition">{c.cust_name}</div>
                            <div className="text-[11px] text-gray-500">{c.cust_code}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-cyan-400">{c.order_count}</div>
                          <div className="text-[10px] text-gray-600">orders</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-semibold text-white">Recent Activity</span>
                </div>
              </div>

              {loading ? (
                <div className="px-4 py-8 text-center text-sm text-gray-600">Loading…</div>
              ) : !data?.recentActivity.length ? (
                <div className="px-4 py-8 text-center text-sm text-gray-600">No recent activity.</div>
              ) : (
                <div>
                  {data.recentActivity.map((item: HubActivity, i: number) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-800 last:border-0">
                      {activityIcon(item.type)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 truncate">{item.title}</div>
                        <div className="text-[11px] text-gray-500 truncate">{item.subtitle}</div>
                      </div>
                      <div className="text-[10px] text-gray-600 whitespace-nowrap flex-shrink-0 mt-0.5">{item.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* ── Recent Transactions ── */}
          <SectionLabel>Recent Transactions</SectionLabel>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <span className="text-sm font-semibold text-white">My Last 10 Orders</span>
              </div>
              <Link href="/sales/transactions" className="text-[11px] text-gray-500 hover:text-white transition">
                Full history →
              </Link>
            </div>

            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-600">Loading…</div>
            ) : !data?.recentTransactions.length ? (
              <div className="px-4 py-8 text-center text-sm text-gray-600">No recent orders found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-gray-500 border-b border-gray-700 uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left font-semibold">SO #</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Customer</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Reference</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Expect</th>
                      {isAdmin && <th className="px-4 py-2.5 text-left font-semibold">Branch</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTransactions.map((o: HubTransaction) => (
                      <tr key={`${o.system_id}|${o.so_id}`}
                          className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/sales/orders/${o.so_id}`}
                                className="font-mono text-cyan-400 hover:text-cyan-300 hover:underline text-xs">
                            {o.so_id}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          {o.cust_code ? (
                            <Link href={`/sales/customers/${o.cust_code}`}
                                  className="text-gray-200 hover:text-cyan-400 truncate block text-xs transition-colors">
                              {o.cust_name ?? '—'}
                            </Link>
                          ) : (
                            <span className="text-gray-200 truncate block text-xs">{o.cust_name ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[140px] truncate">{o.reference || '—'}</td>
                        <td className="px-4 py-2.5">{saleTypeBadge(o.sale_type)}</td>
                        <td className="px-4 py-2.5">{statusBadge(o.so_status)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {o.expect_date ? new Date(o.expect_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </td>
                        {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-600">{o.system_id}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
