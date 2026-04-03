'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, User, Activity, Clock } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface ActivePick {
  pick_id: number;
  picker_id: number;
  picker_name: string;
  barcode_number: string | null;
  start_time: string | null;
}

interface PickerSummary {
  picker_id: number;
  picker_name: string;
  user_type: string | null;
  today_count: number;
  five_day_count: number;
  active_picks: ActivePick[];
}

interface Props { isAdmin: boolean; }

function minutesSince(iso: string | null) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

export default function OpenPicksClient({ isAdmin }: Props) {
  usePageTracking();
  const [pickers, setPickers] = useState<PickerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/warehouse/open-picks');
      if (!res.ok) return;
      const data = await res.json();
      setPickers(data.pickers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const activePickers = pickers.filter((p) => p.active_picks.length > 0);
  const idlePickers = pickers.filter((p) => p.active_picks.length === 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/warehouse" className="text-sm text-cyan-400 hover:underline">&larr; Warehouse</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Open Picks</h1>
          <p className="text-sm text-slate-400">Active picks by picker — refreshes every 30s</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex gap-2">
            <span className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg text-sm font-medium">
              {activePickers.length} active
            </span>
            <span className="px-3 py-1.5 bg-slate-700 text-slate-400 rounded-lg text-sm font-medium">
              {idlePickers.length} idle
            </span>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Active pickers */}
      {activePickers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Currently Picking
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePickers.map((p) => (
              <Link
                key={p.picker_id}
                href={`/warehouse/pickers/${p.picker_id}`}
                className="bg-slate-900 border border-green-500/30 rounded-xl p-4 hover:border-green-400/50 transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-white font-semibold">{p.picker_name}</div>
                    <div className="text-xs text-slate-500">{p.user_type ?? 'picker'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs font-medium">
                      {p.active_picks.length} active
                    </span>
                  </div>
                </div>

                {p.active_picks.map((ap) => {
                  const mins = minutesSince(ap.start_time);
                  return (
                    <div key={ap.pick_id} className="flex items-center justify-between py-1.5 border-t border-white/5">
                      {ap.barcode_number ? (
                        <Link href={`/warehouse/orders/${ap.barcode_number}`} className="text-xs text-cyan-400 hover:underline font-mono">
                          {ap.barcode_number}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-300 font-mono">#{ap.pick_id}</span>
                      )}
                      {mins !== null && (
                        <span className={`flex items-center gap-1 text-xs ${mins > 30 ? 'text-red-400' : 'text-slate-400'}`}>
                          <Clock className="w-3 h-3" />{mins}m
                        </span>
                      )}
                    </div>
                  );
                })}

                <div className="mt-3 flex gap-3 text-xs text-slate-500">
                  <span>Today: <span className="text-slate-300">{p.today_count}</span></span>
                  <span>5-day: <span className="text-slate-300">{p.five_day_count}</span></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All pickers table */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
          <User className="w-4 h-4" /> All Pickers — Pick Counts
        </h2>
        <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
          {pickers.length === 0 && !loading ? (
            <div className="px-4 py-10 text-center text-slate-500">No pickers found</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Picker</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Today</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase">5-Day</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pickers.map((p) => (
                  <tr key={p.picker_id} className="border-b border-white/5 hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-white font-medium">{p.picker_name}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{p.user_type ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        p.active_picks.length > 0
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {p.active_picks.length > 0 ? `PICKING (${p.active_picks.length})` : 'IDLE'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium">{p.today_count}</td>
                    <td className="px-4 py-3 text-slate-300">{p.five_day_count}</td>
                    <td className="px-4 py-3">
                      <Link href={`/warehouse/pickers/${p.picker_id}`} className="text-xs text-cyan-400 hover:text-cyan-300 transition">
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
