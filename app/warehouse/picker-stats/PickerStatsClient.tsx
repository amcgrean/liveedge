'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, BarChart2, Clock, TrendingUp } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface PickerStat {
  picker_id: number;
  picker_name: string;
  user_type: string | null;
  total_picks: number;
  today_picks: number;
  avg_minutes: number | null;
}

interface Props { isAdmin: boolean; }

const PERIOD_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

export default function PickerStatsClient({ isAdmin }: Props) {
  usePageTracking();
  const [stats, setStats] = useState<PickerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/picker-stats?days=${d}`);
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const maxTotal = Math.max(...stats.map((s) => s.total_picks), 1);
  const totalPicks = stats.reduce((sum, s) => sum + s.total_picks, 0);
  const todayTotal = stats.reduce((sum, s) => sum + s.today_picks, 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/warehouse" className="text-sm text-cyan-400 hover:underline">&larr; Warehouse</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Picker Stats</h1>
          <p className="text-sm text-slate-400">Performance metrics by picker</p>
        </div>
        <div className="flex gap-2 items-center">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setDays(o.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${days === o.value ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() => load(days)}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {loading && stats.length === 0 ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-slate-900 border border-white/10 rounded-xl p-4">
                <div className="h-3 bg-slate-800 rounded w-28 mb-2" />
                <div className="h-7 bg-slate-800 rounded w-16" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">Total Picks ({days}d)</span>
              </div>
              <div className="text-2xl font-bold text-white">{totalPicks}</div>
            </div>
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">Today&apos;s Picks</span>
              </div>
              <div className="text-2xl font-bold text-white">{todayTotal}</div>
            </div>
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">Active Pickers</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.filter((s) => s.total_picks > 0).length}</div>
            </div>
          </>
        )}
      </div>

      {/* Stats table */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Picker</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Today</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">{days}d Total</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Avg Time</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Volume</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && stats.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5 animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800 rounded w-28" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-800 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800 rounded w-8" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-800 rounded w-8" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-800 rounded w-10" /></td>
                  <td className="px-4 py-3"><div className="h-2 bg-slate-800 rounded-full w-24" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-800 rounded w-12" /></td>
                </tr>
              ))
            ) : stats.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No data</td>
              </tr>
            ) : stats.map((s) => {
              const pct = maxTotal > 0 ? Math.round((s.total_picks / maxTotal) * 100) : 0;
              return (
                <tr key={s.picker_id} className="border-b border-white/5 hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-white font-medium">{s.picker_name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{s.user_type ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300 font-semibold">{s.today_picks}</td>
                  <td className="px-4 py-3 text-slate-200 font-semibold">{s.total_picks}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {s.avg_minutes != null ? `${s.avg_minutes}m` : '—'}
                  </td>
                  <td className="px-4 py-3 w-32">
                    <div className="bg-slate-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/warehouse/pickers/${s.picker_id}`} className="text-xs text-cyan-400 hover:text-cyan-300 transition">
                      Details
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
