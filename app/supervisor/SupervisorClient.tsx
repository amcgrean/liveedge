'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TopNav } from '../../src/components/nav/TopNav';
import type { PickerStatus, RecentPick } from '../api/supervisor/pickers/route';

interface Props {
  isAdmin: boolean;
  userName: string | null;
  userRole?: string;
}

const STATUS_CONFIG = {
  active:   { label: 'ACTIVE',   color: 'bg-green-900/60 text-green-300 border-green-700' },
  assigned: { label: 'ASSIGNED', color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  idle:     { label: 'IDLE',     color: 'bg-gray-800/80 text-gray-400 border-gray-600' },
};

export default function SupervisorClient({ isAdmin, userName, userRole }: Props) {
  const [pickers, setPickers] = useState<PickerStatus[]>([]);
  const [recentPicks, setRecentPicks] = useState<RecentPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/supervisor/pickers');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { pickers: PickerStatus[]; recent_picks: RecentPick[] };
      setPickers(data.pickers);
      setRecentPicks(data.recent_picks);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to load supervisor data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const active = useMemo(() => pickers.filter((p) => p.status === 'active'), [pickers]);
  const assigned = useMemo(() => pickers.filter((p) => p.status === 'assigned'), [pickers]);
  const idle = useMemo(() => pickers.filter((p) => p.status === 'idle'), [pickers]);

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Supervisor Dashboard</h1>
            {userName && <p className="text-sm text-gray-500 mt-0.5">Welcome, {userName}</p>}
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-gray-500">Updated {lastRefresh.toLocaleTimeString()}</span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm rounded transition"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-green-800 rounded-xl p-4">
            <div className="text-xs text-green-500 font-semibold tracking-widest mb-1">ACTIVE PICKS</div>
            <div className="text-3xl font-bold text-green-300">{active.length}</div>
          </div>
          <div className="bg-gray-900 border border-blue-800 rounded-xl p-4">
            <div className="text-xs text-blue-500 font-semibold tracking-widest mb-1">ASSIGNED</div>
            <div className="text-3xl font-bold text-blue-300">{assigned.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="text-xs text-gray-500 font-semibold tracking-widest mb-1">IDLE</div>
            <div className="text-3xl font-bold text-gray-400">{idle.length}</div>
          </div>
        </div>

        {/* Picker board */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-gray-300">
            Picker Status — {pickers.length} staff
          </div>
          {pickers.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-700">
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Task</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {pickers.map((p) => {
                  const sc = STATUS_CONFIG[p.status];
                  return (
                    <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 text-gray-200 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{p.user_type}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${sc.color}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-cyan-300 text-xs">{p.current_task ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{p.task_type ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                        {p.active_duration_min > 0 ? `${p.active_duration_min}m` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              {loading ? 'Loading…' : 'No pickers found.'}
            </div>
          )}
        </div>

        {/* Recent completed picks */}
        {recentPicks.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-gray-300">
              Recent Completed Picks
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-700">
                  <th className="px-4 py-2 text-left font-medium">Picker</th>
                  <th className="px-4 py-2 text-left font-medium">SO #</th>
                  <th className="px-4 py-2 text-left font-medium">Started</th>
                  <th className="px-4 py-2 text-left font-medium">Completed</th>
                </tr>
              </thead>
              <tbody>
                {recentPicks.map((p) => (
                  <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-gray-200">{p.picker_name}</td>
                    <td className="px-4 py-2.5 font-mono text-cyan-300 text-xs">{p.so_number}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {p.start_time ? new Date(p.start_time).toLocaleTimeString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {p.completed_time ? new Date(p.completed_time).toLocaleTimeString() : '—'}
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
  );
}
