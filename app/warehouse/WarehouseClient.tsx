'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TopNav } from '../../src/components/nav/TopNav';
import type { OpenPickSummary } from '@/lib/warehouse-picks';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { formatTimeCT, formatDateCT } from '@/lib/central-time';
import { RefreshCw } from 'lucide-react';

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
  initialBranch: string;
  initialPicks: OpenPickSummary[];
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

function pickStatusBorderColor(p: OpenPickSummary): string {
  if (p.staged_at) return '#1f8a4f';      // green — staged
  if (p.printed_at) return '#c9a83f';     // gold — pick printed
  return '#4a8fbf';                        // blue — open
}

function pickChipClass(p: OpenPickSummary): string {
  if (p.staged_at) return 'chip chip-prog';
  if (p.printed_at) return 'chip chip-staged';
  return 'chip chip-open';
}

function pickStatusLabel(p: OpenPickSummary): string {
  if (p.staged_at) return 'Staged';
  if (p.printed_at) return 'Printed';
  return STATUS_LABELS[p.so_status?.toUpperCase()] ?? p.so_status ?? 'Open';
}

function pickerInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const PICKER_HUE: string[] = [
  '#6e7d89', '#4a8fbf', '#1f8a4f', '#c9a83f', '#d05050',
  '#8b5cf6', '#e07b39', '#2ab7b7', '#c45bab', '#a3b54a',
];
function pickerColor(id: number): string {
  return PICKER_HUE[id % PICKER_HUE.length];
}

export default function WarehouseClient({
  initialStats,
  isAdmin,
  userBranch,
  userName,
  userRole,
  initialBranch,
  initialPicks,
}: Props) {
  usePageTracking();
  const [stats, setStats] = useState<BranchStats[]>(initialStats);
  const [selectedBranch, setSelectedBranch] = useBranchFilter(isAdmin, userBranch);
  const [picks, setPicks] = useState<OpenPickSummary[] | null>(initialPicks);
  const [loadingPicks, setLoadingPicks] = useState(false);
  const [picksError, setPicksError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown] = useState(60);
  const [handlingFilter, setHandlingFilter] = useState('');
  const [pickers, setPickers] = useState<Picker[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const skippedInitialPicksLoad = useRef(false);
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');

  const [pickFileState, setPickFileState] = useState<
    Record<string, { loading: boolean; fileId?: string; error?: string }>
  >({});

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/stats');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setStats(data as BranchStats[]);
      }
    } catch { /* silent */ }
  }, []);

  // Countdown + auto-refresh every 60s
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    setCountdown(60);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (document.visibilityState === 'visible') {
            refreshStats();
            setLastRefresh(new Date());
          }
          return 60;
        }
        return c - 1;
      });
    }, 1_000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [refreshStats]);

  const loadPicks = useCallback(async (branch: string) => {
    setLoadingPicks(true);
    setPicksError('');
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/warehouse/picks?${params}`);
      if (!res.ok) throw new Error('Failed to load picks');
      setPicks(await res.json() as OpenPickSummary[]);
      setLastRefresh(new Date());
    } catch {
      setPicksError('Failed to load pick board data.');
      setPicks(null);
    } finally {
      setLoadingPicks(false);
    }
  }, []);

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

  const handleManualRefresh = useCallback(() => {
    loadPicks(selectedBranch);
    loadAssignmentData();
    setCountdown(60);
  }, [loadPicks, loadAssignmentData, selectedBranch]);

  useEffect(() => {
    if (!skippedInitialPicksLoad.current && selectedBranch === initialBranch && initialPicks.length > 0) {
      skippedInitialPicksLoad.current = true;
    } else {
      loadPicks(selectedBranch);
    }
    loadAssignmentData();
  }, [selectedBranch, loadPicks, loadAssignmentData, initialBranch, initialPicks.length]);

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

  // Stats derived from picks
  const derivedStats = useMemo(() => {
    if (!picks) return { open: 0, assigned: 0, staged: 0, printed: 0, unassigned: 0 };
    const open = picks.length;
    const assigned = Object.keys(assignments).filter((so) => picks.some((p) => p.so_number === so)).length;
    const staged = picks.filter((p) => p.staged_at).length;
    const printed = picks.filter((p) => p.printed_at && !p.staged_at).length;
    const unassigned = picks.filter((p) => !assignments[p.so_number]).length;
    return { open, assigned, staged, printed, unassigned };
  }, [picks, assignments]);

  // Group picks by picker for board view
  const pickerGroups = useMemo(() => {
    if (!filteredPicks.length) return [];
    const groups = new Map<string, { picker: Picker | null; pickerId: number | null; picks: OpenPickSummary[] }>();

    // Unassigned group first
    groups.set('unassigned', { picker: null, pickerId: null, picks: [] });

    for (const pick of filteredPicks) {
      const assignment = assignments[pick.so_number];
      if (assignment) {
        const key = String(assignment.picker_id);
        if (!groups.has(key)) {
          const picker = pickers.find((pk) => pk.id === assignment.picker_id) ?? null;
          groups.set(key, { picker, pickerId: assignment.picker_id, picks: [] });
        }
        groups.get(key)!.picks.push(pick);
      } else {
        groups.get('unassigned')!.picks.push(pick);
      }
    }

    // Remove empty unassigned if all picks are assigned
    if (groups.get('unassigned')!.picks.length === 0 && groups.size > 1) {
      groups.delete('unassigned');
    }

    return [...groups.values()].sort((a, b) => {
      if (!a.pickerId) return -1;
      if (!b.pickerId) return 1;
      return (a.picker?.name ?? '').localeCompare(b.picker?.name ?? '');
    });
  }, [filteredPicks, assignments, pickers]);

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
        setPickFileState((s) => ({ ...s, [soNumber]: { loading: false, fileId: data.pickFileId } }));
      }
    } catch {
      setPickFileState((s) => ({ ...s, [soNumber]: { loading: false, error: 'Network error' } }));
    }
  }, []);

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }} className="p-5">
      <div className="max-w-[1600px] mx-auto space-y-4">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Picks Board</h1>
            <p className="text-xs mt-0.5 mono" style={{ color: 'var(--text-3)' }}>
              {selectedBranch || 'All Branches'} · updated {formatTimeCT(lastRefresh)} CT
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && stats.length > 1 && (
              <select
                value={selectedBranch}
                onChange={(e) => { setSelectedBranch(e.target.value); setHandlingFilter(''); }}
                className="text-sm rounded px-2 py-1"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              >
                <option value="">All Branches</option>
                {stats.map((s) => (
                  <option key={s.system_id} value={s.system_id}>{s.system_id}</option>
                ))}
              </select>
            )}
            {/* Board / Table toggle */}
            <div className="seg">
              <button
                onClick={() => setViewMode('board')}
                className={viewMode === 'board' ? 'active' : ''}
              >
                Board
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={viewMode === 'table' ? 'active' : ''}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Inline stats row */}
        <div
          className="grid grid-cols-5 divide-x"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r)',
          }}
        >
          {[
            { label: 'Open picks', value: derivedStats.open },
            { label: 'Assigned', value: derivedStats.assigned },
            { label: 'Staged', value: derivedStats.staged },
            { label: 'Printed', value: derivedStats.printed },
            { label: 'Unassigned', value: derivedStats.unassigned },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3 text-center" style={{ borderRight: '1px solid var(--line)' }}>
              <div className="text-lg font-bold mono" style={{ color: 'var(--text)' }}>{picks === null ? '—' : value}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Pick Board Panel */}
        <div className="ds-panel">
          <div className="ds-panel-header">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span className="ds-panel-title">
                Open Orders
                {picks !== null && (
                  <span className="ml-2 font-normal mono text-xs" style={{ color: 'var(--text-3)' }}>
                    {filteredPicks.length} SOs
                  </span>
                )}
              </span>
              <span className="ds-panel-sub ml-2">
                refresh in {String(countdown).padStart(2, '0')}s
              </span>
            </div>
            <div className="flex items-center gap-2">
              {allHandlingCodes.length > 0 && (
                <select
                  value={handlingFilter}
                  onChange={(e) => setHandlingFilter(e.target.value)}
                  className="text-xs rounded px-2 py-1"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text-2)' }}
                >
                  <option value="">All handling</option>
                  {allHandlingCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              <button
                onClick={handleManualRefresh}
                disabled={loadingPicks}
                title="Refresh"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition"
                style={{ color: 'var(--text-3)', background: 'transparent' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPicks ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {picksError && (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--err)' }}>{picksError}</div>
          )}

          {loadingPicks && picks === null && (
            <div className="p-4 animate-pulse space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 rounded" style={{ background: 'var(--panel-2)' }} />
              ))}
            </div>
          )}

          {picks !== null && filteredPicks.length === 0 && !loadingPicks && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No open orders found.
            </div>
          )}

          {/* BOARD VIEW */}
          {viewMode === 'board' && filteredPicks.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex gap-3 p-4" style={{ minWidth: 'max-content' }}>
                {pickerGroups.map((group) => {
                  const color = group.pickerId ? pickerColor(group.pickerId) : 'var(--text-3)';
                  const hasActive = group.picks.some((p) => p.printed_at && !p.staged_at);
                  const stagedCount = group.picks.filter((p) => p.staged_at).length;
                  const printedCount = group.picks.filter((p) => p.printed_at && !p.staged_at).length;

                  return (
                    <div
                      key={group.pickerId ?? 'unassigned'}
                      className="flex-shrink-0 flex flex-col gap-2"
                      style={{ width: 260 }}
                    >
                      {/* Column header */}
                      <div
                        className="rounded-t p-3 flex items-center gap-2"
                        style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderBottom: 'none' }}
                      >
                        {group.picker ? (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: color, color: '#fff' }}
                          >
                            {pickerInitials(group.picker.name)}
                          </div>
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: 'var(--panel-3)', color: 'var(--text-3)' }}
                          >
                            —
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                              {group.picker?.name ?? 'Unassigned'}
                            </span>
                            {hasActive && <span className="live-dot" />}
                          </div>
                          <div className="text-[11px] mono mt-0.5" style={{ color: 'var(--text-3)' }}>
                            {group.picks.length} open · {stagedCount} staged · {printedCount} active
                          </div>
                        </div>
                      </div>

                      {/* Pick cards */}
                      <div
                        className="flex flex-col gap-1.5 rounded-b p-2 flex-1"
                        style={{ background: 'var(--panel)', border: '1px solid var(--line)', minHeight: 80 }}
                      >
                        {group.picks.map((p) => (
                          <div
                            key={`${p.system_id}|${p.so_number}`}
                            className="rounded p-2.5 relative"
                            style={{
                              background: 'var(--panel-2)',
                              border: '1px solid var(--line)',
                              borderLeft: `3px solid ${pickStatusBorderColor(p)}`,
                            }}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-mono text-xs font-bold" style={{ color: '#4ec48a' }}>
                                {p.so_number}
                              </span>
                              <span className={pickChipClass(p)} style={{ fontSize: 10 }}>
                                {pickStatusLabel(p)}
                              </span>
                            </div>
                            <div className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                              {p.customer_name}
                            </div>
                            {p.reference && (
                              <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-3)' }}>
                                {p.reference}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
                              <div className="flex gap-1 flex-wrap">
                                {p.handling_codes.map((c) => (
                                  <span key={c} className={`text-[10px] px-1.5 py-0.5 rounded border ${handlingColor(c)}`}>
                                    {c}
                                  </span>
                                ))}
                              </div>
                              <span className="text-[10px] mono" style={{ color: 'var(--text-3)' }}>
                                {p.line_count} ln
                              </span>
                            </div>
                            {pickers.length > 0 && (
                              <select
                                value={assignments[p.so_number]?.picker_id ?? ''}
                                disabled={assigningKey === p.so_number}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleAssign(p.so_number, val ? Number(val) : null);
                                }}
                                className="mt-2 w-full text-[11px] rounded px-1.5 py-1"
                                style={{ background: 'var(--panel-3)', border: '1px solid var(--line)', color: 'var(--text-2)' }}
                              >
                                <option value="">— unassigned —</option>
                                {pickers.map((pk) => (
                                  <option key={pk.id} value={pk.id}>{pk.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'table' && filteredPicks.length > 0 && (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>SO #</th>
                    <th>Customer</th>
                    <th>Handling</th>
                    <th>Status</th>
                    {isAdmin && <th>Branch</th>}
                    <th>Assign Picker</th>
                    <th>Ship Via</th>
                    <th>Expect</th>
                    <th className="num">Lines</th>
                    {isAdmin && <th style={{ textAlign: 'center' }}>Pick File</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPicks.map((p) => (
                    <tr key={`${p.system_id}|${p.so_number}`}>
                      <td>
                        <span className="mono text-xs font-bold" style={{ color: '#4ec48a' }}>
                          {p.so_number}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text)' }}>{p.customer_name}</span>
                        {p.reference && (
                          <span className="ml-1.5 text-xs" style={{ color: 'var(--text-3)' }}>{p.reference}</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {p.handling_codes.map((c) => (
                            <span key={c} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${handlingColor(c)}`}>
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={pickChipClass(p)}>{pickStatusLabel(p)}</span>
                      </td>
                      {isAdmin && (
                        <td className="text-xs" style={{ color: 'var(--text-3)' }}>{p.system_id}</td>
                      )}
                      <td>
                        {pickers.length > 0 ? (
                          <select
                            value={assignments[p.so_number]?.picker_id ?? ''}
                            disabled={assigningKey === p.so_number}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleAssign(p.so_number, val ? Number(val) : null);
                            }}
                            className="text-xs rounded px-2 py-1"
                            style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                          >
                            <option value="">— unassigned —</option>
                            {pickers.map((pk) => (
                              <option key={pk.id} value={pk.id}>{pk.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>—</span>
                        )}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-2)' }}>
                        {p.ship_via ?? '—'}
                        {p.driver && <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{p.driver}</div>}
                      </td>
                      <td className="text-xs mono" style={{ color: 'var(--text-2)' }}>
                        {formatDateCT(p.expect_date)}
                      </td>
                      <td className="num text-xs mono">{p.line_count}</td>
                      {isAdmin && (
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const pfs = pickFileState[p.so_number];
                            if (pfs?.fileId) {
                              return <span className="text-[10px] mono" style={{ color: 'var(--ok)' }}>✓ {pfs.fileId}</span>;
                            }
                            if (pfs?.error) {
                              return <span className="text-[10px]" style={{ color: 'var(--err)' }} title={pfs.error}>✗ Error</span>;
                            }
                            return (
                              <button
                                disabled={pfs?.loading}
                                onClick={() => handleReleaseToPickFile(p.so_number, p.system_id)}
                                className="text-[10px] px-2 py-0.5 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                                style={{
                                  background: 'rgba(201,168,63,0.12)',
                                  border: '1px solid rgba(201,168,63,0.4)',
                                  color: 'var(--gold-bright)',
                                }}
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
