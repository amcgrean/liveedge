'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TopNav } from '../../src/components/nav/TopNav';
import type { OpenPickSummary } from '../api/warehouse/picks/route';
import { usePageTracking } from '@/hooks/usePageTracking';
import { formatTimeCT, formatDateCT } from '@/lib/central-time';

interface BranchStats {
  system_id: string;
  open_picks: number;
  open_work_orders: number;
  handling_breakdown: Record<string, number>;
  updated_at: string;
}

interface Picker {
  id: number;
  name: string;
  user_type: string | null;
}

interface Assignment {
  picker_id: number;
  picker_name: string;
}

interface Props {
  initialStats: BranchStats[];
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

const STATUS_LABELS: Record<string, string> = {
  K: 'Pick Printed',
  P: 'Picked',
  S: 'Staged',
  I: 'Invoiced',
};

const HANDLING_COLORS: Record<string, string> = {
  'DOOR1':    'bg-purple-900/60 text-purple-300 border-purple-700',
  'EWP':      'bg-blue-900/60 text-blue-300 border-blue-700',
  'DECK BLDG':'bg-orange-900/60 text-orange-300 border-orange-700',
  'TRIM':     'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  'UNROUTED': 'bg-gray-800/80 text-gray-400 border-gray-600',
};

function handlingColor(code: string) {
  return HANDLING_COLORS[code.toUpperCase()] ?? 'bg-cyan-900/60 text-cyan-300 border-cyan-700';
}

export default function WarehouseClient({ initialStats, isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const [stats, setStats] = useState<BranchStats[]>(initialStats);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    isAdmin ? '' : (userBranch ?? '')
  );
  const [picks, setPicks] = useState<OpenPickSummary[] | null>(null);
  const [loadingPicks, setLoadingPicks] = useState(false);
  const [picksError, setPicksError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [handlingFilter, setHandlingFilter] = useState('');
  const [pickers, setPickers] = useState<Picker[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  // Pick file release state — keyed by SO number
  const [pickFileState, setPickFileState] = useState<
    Record<string, { loading: boolean; fileId?: string; error?: string }>
  >({});

  // Refresh stats every 60 seconds (only when tab is visible)
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/warehouse/stats');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setStats(data as BranchStats[]);
            setLastRefresh(new Date());
          }
        }
      } catch { /* silent */ }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const loadPicks = useCallback(async (branch: string) => {
    setLoadingPicks(true);
    setPicksError('');
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/warehouse/picks?${params}`);
      if (!res.ok) throw new Error('Failed to load picks');
      setPicks(await res.json() as OpenPickSummary[]);
    } catch {
      setPicksError('Failed to load pick board data.');
      setPicks(null);
    } finally {
      setLoadingPicks(false);
    }
  }, []);

  // Load pickers list + current assignments (for supervisor assign UI)
  const loadAssignmentData = useCallback(async () => {
    try {
      const [pickersRes, assignRes] = await Promise.all([
        fetch('/api/warehouse/pickers'),
        fetch('/api/warehouse/picks/assign'),
      ]);
      if (pickersRes.ok) {
        const d = await pickersRes.json();
        setPickers(d.pickers ?? []);
      }
      if (assignRes.ok) {
        const d = await assignRes.json();
        setAssignments(d.assignments ?? {});
      }
    } catch { /* silent */ }
  }, []);

  // Auto-load picks + assignment data for the selected branch
  useEffect(() => {
    loadPicks(selectedBranch);
    loadAssignmentData();
  }, [selectedBranch, loadPicks, loadAssignmentData]);

  // Collect all handling codes from loaded picks for filter dropdown
  const allHandlingCodes = useMemo(
    () => picks ? [...new Set(picks.flatMap((p) => p.handling_codes))].sort() : [],
    [picks]
  );

  const filteredPicks = useMemo(
    () => picks
      ? (handlingFilter ? picks.filter((p) => p.handling_codes.includes(handlingFilter)) : picks)
      : [],
    [picks, handlingFilter]
  );

  const handleAssign = useCallback(async (soNumber: string, pickerId: number | null) => {
    setAssigningKey(soNumber);
    try {
      const res = await fetch('/api/warehouse/picks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ so_number: soNumber, picker_id: pickerId }),
      });
      if (!res.ok) return;
      const assignRes = await fetch('/api/warehouse/picks/assign');
      if (assignRes.ok) {
        const d = await assignRes.json();
        setAssignments(d.assignments ?? {});
      }
    } catch { /* silent */ } finally {
      setAssigningKey(null);
    }
  }, []);

  const handleReleaseToPickFile = useCallback(async (soNumber: string, branchCode: string) => {
    setPickFileState((s) => ({ ...s, [soNumber]: { loading: true } }));
    try {
      const res = await fetch('/api/warehouse/picks/create-pick-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soNumber, branchCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPickFileState((s) => ({ ...s, [soNumber]: { loading: false, error: data.error ?? 'Failed' } }));
      } else {
        setPickFileState((s) => ({
          ...s,
          [soNumber]: { loading: false, fileId: data.pickFileId },
        }));
      }
    } catch {
      setPickFileState((s) => ({ ...s, [soNumber]: { loading: false, error: 'Network error' } }));
    }
  }, []);

  const displayedBranch = selectedBranch || 'All Branches';

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Warehouse Board</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Stats refreshed {formatTimeCT(lastRefresh)} CT · auto-updates every 60s
            </p>
          </div>
          {isAdmin && stats.length > 1 && (
            <select
              value={selectedBranch}
              onChange={(e) => { setSelectedBranch(e.target.value); setHandlingFilter(''); }}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">All Branches</option>
              {stats.map((s) => (
                <option key={s.system_id} value={s.system_id}>{s.system_id}</option>
              ))}
            </select>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats
            .filter((s) => !selectedBranch || s.system_id === selectedBranch)
            .map((s) => (
              <button
                key={s.system_id}
                onClick={() => { setSelectedBranch(s.system_id); setHandlingFilter(''); }}
                className={`text-left p-4 rounded-xl border transition ${
                  selectedBranch === s.system_id
                    ? 'bg-cyan-900/30 border-cyan-600'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="text-xs text-gray-500 font-semibold tracking-widest mb-2">{s.system_id}</div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-3xl font-bold text-cyan-300">{s.open_picks}</div>
                    <div className="text-xs text-gray-400">open picks</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold text-yellow-400">{s.open_work_orders}</div>
                    <div className="text-xs text-gray-400">work orders</div>
                  </div>
                </div>
                {Object.keys(s.handling_breakdown).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {Object.entries(s.handling_breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([code, cnt]) => (
                        <span
                          key={code}
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${handlingColor(code)}`}
                        >
                          {code} <span className="font-bold">{cnt}</span>
                        </span>
                      ))}
                  </div>
                )}
              </button>
            ))}
        </div>

        {/* Pick Board */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-700">
            <h2 className="font-semibold text-gray-200">
              Open Orders — {displayedBranch}
              {picks !== null && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filteredPicks.length} SOs)
                </span>
              )}
            </h2>
            <div className="ml-auto flex items-center gap-2">
              {allHandlingCodes.length > 0 && (
                <select
                  value={handlingFilter}
                  onChange={(e) => setHandlingFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                >
                  <option value="">All handling</option>
                  {allHandlingCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => loadPicks(selectedBranch)}
                disabled={loadingPicks}
                className="text-xs text-gray-400 hover:text-white transition disabled:opacity-50"
              >
                {loadingPicks ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {picksError && (
            <div className="px-4 py-3 text-sm text-red-400">{picksError}</div>
          )}

          {loadingPicks && picks === null && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">Loading pick data…</div>
          )}

          {picks !== null && filteredPicks.length === 0 && !loadingPicks && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No open orders found.
            </div>
          )}

          {filteredPicks.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-700 bg-gray-900/50">
                    <th className="px-4 py-2 text-left font-medium">SO #</th>
                    <th className="px-4 py-2 text-left font-medium">Customer</th>
                    <th className="px-4 py-2 text-left font-medium">Handling</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                    <th className="px-4 py-2 text-left font-medium">Assign Picker</th>
                    <th className="px-4 py-2 text-left font-medium">Ship Via</th>
                    <th className="px-4 py-2 text-left font-medium">Expect</th>
                    <th className="px-4 py-2 text-right font-medium">Lines</th>
                    {isAdmin && <th className="px-4 py-2 text-center font-medium">Pick File</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPicks.map((p) => (
                    <tr
                      key={`${p.system_id}|${p.so_number}`}
                      className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-cyan-300 whitespace-nowrap">
                        {p.so_number}
                      </td>
                      <td className="px-4 py-2.5 text-gray-200 max-w-[200px] truncate">
                        {p.customer_name}
                        {p.reference && (
                          <span className="ml-1.5 text-xs text-gray-500">{p.reference}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {p.handling_codes.map((c) => (
                            <span
                              key={c}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${handlingColor(c)}`}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        {STATUS_LABELS[p.so_status?.toUpperCase()] ?? p.so_status ?? '—'}
                        {p.staged_at && (
                          <div className="text-[10px] text-green-500">Staged</div>
                        )}
                        {p.printed_at && !p.staged_at && (
                          <div className="text-[10px] text-yellow-600">Printed</div>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-xs text-gray-500">{p.system_id}</td>
                      )}
                      <td className="px-4 py-2.5">
                        {pickers.length > 0 ? (
                          <select
                            value={assignments[p.so_number]?.picker_id ?? ''}
                            disabled={assigningKey === p.so_number}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleAssign(p.so_number, val ? Number(val) : null);
                            }}
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white disabled:opacity-50 min-w-[110px]"
                          >
                            <option value="">— unassigned —</option>
                            {pickers.map((pk) => (
                              <option key={pk.id} value={pk.id}>{pk.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {p.ship_via ?? '—'}
                        {p.driver && <div className="text-[10px] text-gray-600">{p.driver}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        {formatDateCT(p.expect_date)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-300 font-mono text-xs">
                        {p.line_count}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-center">
                          {(() => {
                            const pfs = pickFileState[p.so_number];
                            if (pfs?.fileId) {
                              return (
                                <span className="text-[10px] text-green-400 font-mono">
                                  ✓ {pfs.fileId}
                                </span>
                              );
                            }
                            if (pfs?.error) {
                              return (
                                <span className="text-[10px] text-red-400" title={pfs.error}>
                                  ✗ Error
                                </span>
                              );
                            }
                            return (
                              <button
                                disabled={pfs?.loading}
                                onClick={() => handleReleaseToPickFile(p.so_number, p.system_id)}
                                className="text-[10px] px-2 py-0.5 bg-amber-900/50 hover:bg-amber-800/70 text-amber-300 border border-amber-700/50 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {pfs?.loading ? '…' : 'Release'}
                              </button>
                            );
                          })()}
                        </td>
                      )}
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
