'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TopNav } from '../../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

interface Order {
  so_id: string;
  cust_name: string | null;
  cust_code: string | null;
  reference: string | null;
  so_status: string | null;
  sale_type: string | null;
  order_date: string | null;
  expect_date: string | null;
  salesperson: string | null;
}

interface Kpi {
  open_orders: number;
  invoiced_orders: number;
  total_orders: number;
}

const BRANCHES = ['', '10FD', '20GR', '25BW', '40CV'];
const PERIODS  = [7, 30, 90];

const SO_STATUS: Record<string, { label: string; color: string }> = {
  O: { label: 'Open',      color: 'bg-blue-900/60 text-blue-300' },
  K: { label: 'Picking',   color: 'bg-yellow-900/60 text-yellow-300' },
  S: { label: 'Staged',    color: 'bg-orange-900/60 text-orange-300' },
  D: { label: 'Delivered', color: 'bg-cyan-900/60 text-cyan-300' },
  I: { label: 'Invoiced',  color: 'bg-green-900/60 text-green-300' },
  C: { label: 'Closed',    color: 'bg-gray-800 text-gray-400' },
};

export default function RepDashboardClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [rep, setRep]       = useState('');
  const [days, setDays]     = useState(30);
  const [reps, setReps]     = useState<string[]>([]);
  const [kpi, setKpi]       = useState<Kpi | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ days: String(days) });
      if (branch) p.set('branch', branch);
      if (rep)    p.set('rep', rep);
      const res = await fetch(`/api/sales/rep-metrics?${p}`);
      if (res.ok) {
        const d = await res.json() as { reps: string[]; kpi: Kpi; orders: Order[] };
        setReps(d.reps ?? []);
        setKpi(d.kpi ?? null);
        setOrders(d.orders ?? []);
      }
    } finally { setLoading(false); }
  }, [branch, rep, days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <TopNav userName={userName} userRole={userRole} />
      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Sales Rep Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">Performance by salesperson</p>
          </div>
          <Link href="/sales" className="text-sm text-cyan-400 hover:underline">← Sales Hub</Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {isAdmin && (
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">All Branches</option>
              {BRANCHES.filter(Boolean).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white min-w-[160px]"
          >
            <option value="">All Reps</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`px-3 py-1.5 text-sm rounded transition ${days === p ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>

        {/* KPI tiles */}
        {kpi && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Open Orders',     value: kpi.open_orders,     color: 'text-blue-400' },
              { label: 'Invoiced',        value: kpi.invoiced_orders,  color: 'text-green-400' },
              { label: `Total (${days}d)`, value: kpi.total_orders,    color: 'text-cyan-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-3xl font-bold ${color}`}>{loading ? '…' : value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Orders table */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              Orders {loading ? '…' : `(${orders.length})`}
            </span>
            {rep && <span className="text-xs text-cyan-400 font-medium">{rep}</span>}
          </div>
          {orders.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-500">No orders found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs uppercase text-gray-500">
                    <th className="px-4 py-2 text-left">SO #</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Reference</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Rep</th>
                    <th className="px-4 py-2 text-left">Ordered</th>
                    <th className="px-4 py-2 text-left">Need By</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const st = SO_STATUS[o.so_status ?? ''] ?? { label: o.so_status ?? '?', color: 'bg-gray-800 text-gray-400' };
                    return (
                      <tr key={o.so_id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-2">
                          <Link href={`/sales/orders/${o.so_id}`} className="font-mono text-cyan-400 hover:underline">
                            {o.so_id}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <Link href={`/sales/customers/${o.cust_code}`} className="text-gray-200 hover:text-white hover:underline">
                            {o.cust_name ?? o.cust_code ?? '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-gray-400 max-w-[160px] truncate">{o.reference ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{o.salesperson ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{o.order_date?.slice(0,10) ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{o.expect_date?.slice(0,10) ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
