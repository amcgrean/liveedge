'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart2, Users, Globe, RefreshCw, Clock, TrendingUp } from 'lucide-react';

// Path → human-readable label (matches getPageLabel in /api/home/route.ts)
const PATH_LABELS: Record<string, string> = {
  '/':                        'Home',
  '/warehouse':               'Warehouse Board',
  '/warehouse/open-picks':    'Open Picks',
  '/warehouse/picker-stats':  'Picker Stats',
  '/work-orders':             'Work Orders',
  '/supervisor':              'Supervisor',
  '/dispatch':                'Dispatch Board',
  '/delivery':                'Delivery Tracker',
  '/delivery/map':            'Fleet Map',
  '/sales':                   'Sales Hub',
  '/sales/customers':         'Customers',
  '/sales/transactions':      'Transactions',
  '/sales/history':           'Purchase History',
  '/sales/products':          'Products & Stock',
  '/sales/reports':           'Sales Reports',
  '/credits':                 'RMA Credits',
  '/legacy-bids':             'Bids',
  '/designs':                 'Designs',
  '/ewp':                     'EWP',
  '/projects':                'Projects',
  '/purchasing/workspace':    'Buyer Workspace',
  '/purchasing/open-pos':     'Open POs',
  '/purchasing/manage':       'PO Command Center',
  '/purchasing':              'PO Check-In',
  '/purchasing/review':       'Review Queue',
  '/purchasing/suggested-buys': 'Suggested Buys',
  '/purchasing/exceptions':   'Exceptions',
  '/it-issues':               'IT Issues',
  '/ops/delivery-reporting':  'Delivery Reporting',
  '/admin':                   'Admin',
};

function label(path: string) {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  // Dynamic routes: /legacy-bids/123 → Bid #123, etc.
  const bidMatch = path.match(/^\/legacy-bids\/(\d+)/);
  if (bidMatch) return `Bid #${bidMatch[1]}`;
  const soMatch = path.match(/^\/sales\/orders\/(\w+)/);
  if (soMatch) return `SO ${soMatch[1]}`;
  const custMatch = path.match(/^\/sales\/customers\/(\w+)/);
  if (custMatch) return `Customer ${custMatch[1]}`;
  const poMatch = path.match(/^\/purchasing\/pos\/(\w+)/);
  if (poMatch) return `PO ${poMatch[1]}`;
  return path;
}

type PageRow = {
  path: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  visit_count: number;
  last_visited_at: string | null;
};

type TopPage = { path: string; total_visits: number; unique_users: number };
type TopUser = { user_id: string; username: string | null; full_name: string | null; total_visits: number; pages_visited: number };

type AnalyticsData = {
  rows: PageRow[];
  topPages: TopPage[];
  topUsers: TopUser[];
  total: number;
};

type Tab = 'pages' | 'users' | 'detail';

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pages');
  const [userFilter, setUserFilter] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analytics');
      if (res.ok) setData(await res.json() as AnalyticsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredRows = userFilter
    ? data?.rows.filter((r) => r.user_id === userFilter) ?? []
    : data?.rows ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-cyan-400" />
            Page Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Visit counts from <code className="text-gray-400 text-xs">bids.page_visits</code> — per user, per page
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-300 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <div className="text-xs text-gray-500 mb-1">Total Tracked Visits</div>
          <div className="text-2xl font-bold text-white">
            {loading ? '…' : (data?.rows.reduce((s, r) => s + Number(r.visit_count), 0).toLocaleString() ?? 0)}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <div className="text-xs text-gray-500 mb-1">Unique Users Tracked</div>
          <div className="text-2xl font-bold text-cyan-400">
            {loading ? '…' : (data?.topUsers.length ?? 0)}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <div className="text-xs text-gray-500 mb-1">Unique Pages</div>
          <div className="text-2xl font-bold text-purple-400">
            {loading ? '…' : (data?.topPages.length ?? 0)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {(['pages', 'users', 'detail'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'pages' ? 'Top Pages' : t === 'users' ? 'Top Users' : 'All Records'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-600 text-sm">Loading…</div>
      ) : !data ? (
        <div className="text-center py-12 text-red-400 text-sm">Failed to load analytics.</div>
      ) : (
        <>
          {/* Top Pages tab */}
          {tab === 'pages' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Page</th>
                    <th className="px-4 py-3 text-left">Path</th>
                    <th className="px-4 py-3 text-right">Total Visits</th>
                    <th className="px-4 py-3 text-right">Unique Users</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPages.map((p, i) => (
                    <tr key={p.path} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-white font-medium">{label(p.path)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.path}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-bold text-cyan-400">{p.total_visits.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        <span className="flex items-center justify-end gap-1">
                          <Users className="w-3 h-3" />{p.unique_users}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topPages.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-600">No data yet — visit tracking started after the migration.</div>
              )}
            </div>
          )}

          {/* Top Users tab */}
          {tab === 'users' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-right">Total Visits</th>
                    <th className="px-4 py-3 text-right">Pages Visited</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.map((u, i) => (
                    <tr key={u.user_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-white">{u.full_name ?? u.username ?? `User #${u.user_id}`}</div>
                        {u.username && <div className="text-xs text-gray-500">{u.username}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-bold text-cyan-400">{u.total_visits.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        <span className="flex items-center justify-end gap-1">
                          <Globe className="w-3 h-3" />{u.pages_visited}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => { setUserFilter(u.user_id); setTab('detail'); }}
                          className="text-xs text-cyan-500 hover:text-cyan-300 transition"
                        >
                          View detail →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topUsers.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-600">No data yet.</div>
              )}
            </div>
          )}

          {/* All Records / Detail tab */}
          {tab === 'detail' && (
            <div className="space-y-3">
              {/* User filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Filter by user:</span>
                <button
                  onClick={() => setUserFilter(null)}
                  className={`px-3 py-1 text-xs rounded-full border transition ${
                    userFilter === null
                      ? 'bg-cyan-900/50 border-cyan-700 text-cyan-300'
                      : 'border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  All
                </button>
                {data.topUsers.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setUserFilter(u.user_id)}
                    className={`px-3 py-1 text-xs rounded-full border transition ${
                      userFilter === u.user_id
                        ? 'bg-cyan-900/50 border-cyan-700 text-cyan-300'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {u.full_name ?? u.username ?? `#${u.user_id}`}
                  </button>
                ))}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">User</th>
                      <th className="px-4 py-3 text-left">Page</th>
                      <th className="px-4 py-3 text-right">Visits</th>
                      <th className="px-4 py-3 text-right">Last Visited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 200).map((r, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {r.full_name ?? r.username ?? `#${r.user_id}`}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-white text-xs font-medium">{label(r.path)}</div>
                          <div className="font-mono text-[10px] text-gray-600">{r.path}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-cyan-400">
                          {Number(r.visit_count).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                          <span className="flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3" />
                            {r.last_visited_at
                              ? new Date(r.last_visited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                              : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-gray-600">No records.</div>
                )}
                {filteredRows.length > 200 && (
                  <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-800">
                    Showing first 200 of {filteredRows.length} records
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
