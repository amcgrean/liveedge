'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TopNav } from '../../src/components/nav/TopNav';
import type { OpenWorkOrder } from '../api/work-orders/open/route';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useBranchFilter } from '@/hooks/useBranchFilter';

interface Builder {
  id: number;
  name: string;
  user_type: string;
  branch_code: string | null;
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  builders: Builder[];
  userName: string | null;
  userRole?: string;
}

type Tab = 'board' | 'search' | 'assigned';

const STATUS_BADGE: Record<string, string> = {
  'Open':       'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  'Assigned':   'bg-blue-900/60 text-blue-300 border-blue-700',
  'Complete':   'bg-green-900/60 text-green-300 border-green-700',
};

interface SearchWO {
  wo_id: string;
  so_number: string;
  item_number: string | null;
  description: string | null;
  wo_status: string;
  handling_code: string | null;
  assignment_id: number | null;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  assignment_status: string | null;
}

interface Assignment {
  id: number;
  work_order_number: string;
  sales_order_number: string;
  item_number: string | null;
  description: string | null;
  status: string;
  assigned_to_id: number;
  assigned_to_name: string | null;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
}

const PAGE_SIZE = 50;

function WorkOrderTableSkeleton({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="border-b border-gray-800 px-4 py-3 flex gap-4 items-center">
          <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-44 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-32 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
          {isAdmin && <div className="h-3.5 bg-gray-800 rounded w-12 shrink-0" />}
          <div className="h-3.5 bg-gray-800 rounded w-24 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function AssignedTableSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border-b border-gray-800 px-4 py-3 flex gap-4 items-center">
          <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-44 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-24 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-20 shrink-0" />
          <div className="h-3.5 bg-gray-800 rounded w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function WorkOrdersClient({ isAdmin, userBranch, builders, userName, userRole }: Props) {
  usePageTracking();
  const [tab, setTab] = useState<Tab>('board');

  // Board state
  const [branchFilter, setBranchFilter] = useBranchFilter(isAdmin, userBranch);
  const [deptFilter, setDeptFilter] = useState('');
  const [workOrders, setWorkOrders] = useState<OpenWorkOrder[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState('');
  const [boardPage, setBoardPage] = useState(0);

  // Search state
  const [soQuery, setSoQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchWO[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Assign state
  const [assigning, setAssigning] = useState<string | null>(null); // wo_id being assigned
  const [assignPickerId, setAssignPickerId] = useState('');
  const [assignError, setAssignError] = useState('');

  // Assigned tab
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  const loadBoard = useCallback(async () => {
    setLoadingBoard(true);
    setBoardError('');
    setBoardPage(0);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (branchFilter) params.set('branch', branchFilter);
      if (deptFilter) params.set('department', deptFilter);
      const res = await fetch(`/api/work-orders/open?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      setWorkOrders(await res.json() as OpenWorkOrder[]);
    } catch {
      setBoardError('Failed to load work orders.');
    } finally {
      setLoadingBoard(false);
    }
  }, [branchFilter, deptFilter]);

  const loadAssigned = useCallback(async () => {
    setLoadingAssigned(true);
    try {
      const res = await fetch('/api/work-orders/assignments');
      if (res.ok) {
        const data = await res.json() as { assignments: Assignment[] };
        setAssignments(data.assignments);
      }
    } finally {
      setLoadingAssigned(false);
    }
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => { if (tab === 'assigned') loadAssigned(); }, [tab, loadAssigned]);

  async function search() {
    const so = soQuery.trim().replace(/^0+/, '');
    if (!so) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const res = await fetch(`/api/work-orders/search?so=${encodeURIComponent(so)}`);
      if (!res.ok) throw new Error('Search failed');
      setSearchResults(await res.json() as SearchWO[]);
    } catch {
      setSearchError('Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  }

  async function assignWO(wo: OpenWorkOrder | SearchWO, pickerId: number) {
    setAssignError('');
    try {
      const res = await fetch('/api/work-orders/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wo_id: wo.wo_id,
          so_number: wo.so_number,
          item_number: wo.item_number,
          description: wo.description,
          assigned_to_id: pickerId,
        }),
      });
      if (!res.ok) throw new Error('Assignment failed');
      setAssigning(null);
      setAssignPickerId('');
      // Refresh both lists
      loadBoard();
      if (searchResults) search();
    } catch {
      setAssignError('Failed to save assignment.');
    }
  }

  async function markComplete(assignmentId: number) {
    try {
      await fetch(`/api/work-orders/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      loadAssigned();
      loadBoard();
    } catch { /* silent */ }
  }

  // Collect departments from loaded work orders
  const departments = [...new Set(workOrders.map((w) => w.department).filter(Boolean))].sort();

  // Pagination
  const totalPages = Math.ceil(workOrders.length / PAGE_SIZE);
  const pagedWorkOrders = useMemo(
    () => workOrders.slice(boardPage * PAGE_SIZE, (boardPage + 1) * PAGE_SIZE),
    [workOrders, boardPage]
  );

  return (
    <>
    <TopNav userName={userName} userRole={userRole} />
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <h1 className="text-2xl font-bold text-cyan-400">Work Orders</h1>
          <div className="flex gap-1 text-sm">
            {(['board', 'search', 'assigned'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg capitalize transition ${
                  tab === t
                    ? 'bg-cyan-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {t === 'board' ? 'Open WOs' : t === 'search' ? 'Search by SO' : 'Assigned'}
              </button>
            ))}
          </div>
        </div>

        {/* BOARD TAB */}
        {tab === 'board' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                >
                  <option value="">All Branches</option>
                  {['10FD','20GR','25BW','40CV'].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              )}
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <button
                onClick={loadBoard}
                disabled={loadingBoard}
                className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-300 hover:text-white transition disabled:opacity-50"
              >
                {loadingBoard ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {assignError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
                {assignError}
              </div>
            )}

            {boardError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
                {boardError}
              </div>
            )}

            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 text-sm text-gray-400">
                {loadingBoard && workOrders.length === 0
                  ? <div className="animate-pulse h-4 bg-gray-800 rounded w-40" />
                  : `${workOrders.length} open work order${workOrders.length !== 1 ? 's' : ''}${branchFilter ? ` — ${branchFilter}` : ''}${totalPages > 1 ? ` · page ${boardPage + 1} of ${totalPages}` : ''}`
                }
              </div>

              {/* Skeleton on initial load */}
              {loadingBoard && workOrders.length === 0 && (
                <WorkOrderTableSkeleton isAdmin={isAdmin} />
              )}

              {workOrders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-700">
                        <th className="px-4 py-2 text-left font-medium">WO #</th>
                        <th className="px-4 py-2 text-left font-medium">SO #</th>
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-4 py-2 text-left font-medium">Customer</th>
                        <th className="px-4 py-2 text-left font-medium">Dept</th>
                        {isAdmin && <th className="px-4 py-2 text-left font-medium">Branch</th>}
                        <th className="px-4 py-2 text-left font-medium">Assigned</th>
                        <th className="px-4 py-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedWorkOrders.map((wo) => (
                        <tr key={wo.wo_id} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-cyan-300 whitespace-nowrap">{wo.wo_id}</td>
                          <td className="px-4 py-2.5 font-mono text-gray-300 whitespace-nowrap">{wo.so_number}</td>
                          <td className="px-4 py-2.5 text-gray-300 max-w-[220px]">
                            <div className="truncate">{wo.description ?? '—'}</div>
                            {wo.item_number && (
                              <div className="text-xs text-gray-500">{wo.item_number}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[160px] truncate">
                            {wo.customer_name ?? '—'}
                            {wo.reference && <div className="text-gray-600">{wo.reference}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{wo.department || '—'}</td>
                          {isAdmin && <td className="px-4 py-2.5 text-xs text-gray-500">{wo.branch_code ?? '—'}</td>}
                          <td className="px-4 py-2.5 text-xs">
                            {wo.assigned_to_name ? (
                              <span className="text-blue-300">{wo.assigned_to_name}</span>
                            ) : (
                              <span className="text-gray-600">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {assigning === wo.wo_id ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={assignPickerId}
                                  onChange={(e) => setAssignPickerId(e.target.value)}
                                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                                >
                                  <option value="">Select builder…</option>
                                  {builders.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => assignPickerId && assignWO(wo, parseInt(assignPickerId, 10))}
                                  disabled={!assignPickerId}
                                  className="text-xs px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded disabled:opacity-40 transition"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setAssigning(null); setAssignPickerId(''); }}
                                  className="text-xs text-gray-500 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAssigning(wo.wo_id); setAssignPickerId(''); }}
                                className="text-xs text-gray-500 hover:text-cyan-400 transition"
                              >
                                {wo.assigned_to_name ? 'Reassign' : 'Assign'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loadingBoard && workOrders.length === 0 && !boardError && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No open work orders found.</div>
              )}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between text-sm">
                  <span className="text-gray-500 text-xs">
                    Showing {boardPage * PAGE_SIZE + 1}–{Math.min((boardPage + 1) * PAGE_SIZE, workOrders.length)} of {workOrders.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setBoardPage((p) => Math.max(0, p - 1))}
                      disabled={boardPage === 0}
                      className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:text-white disabled:opacity-40 transition text-xs"
                    >
                      ← Prev
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                      const pageIdx = totalPages <= 7 ? i : Math.max(0, Math.min(boardPage - 3, totalPages - 7)) + i;
                      return (
                        <button
                          key={pageIdx}
                          onClick={() => setBoardPage(pageIdx)}
                          className={`px-2.5 py-1 rounded text-xs transition ${
                            pageIdx === boardPage
                              ? 'bg-cyan-700 text-white'
                              : 'bg-gray-800 text-gray-400 hover:text-white'
                          }`}
                        >
                          {pageIdx + 1}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setBoardPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={boardPage >= totalPages - 1}
                      className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:text-white disabled:opacity-40 transition text-xs"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* SEARCH TAB */}
        {tab === 'search' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={soQuery}
                onChange={(e) => setSoQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Enter Sales Order number…"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                autoFocus
              />
              <button
                onClick={search}
                disabled={searching || !soQuery.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-white text-sm font-medium transition"
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{searchError}</div>
            )}

            {searching && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden animate-pulse">
                <div className="px-4 py-3 border-b border-gray-700">
                  <div className="h-4 bg-gray-800 rounded w-48" />
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border-b border-gray-800 px-4 py-3 flex gap-4 items-center">
                    <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
                    <div className="h-3.5 bg-gray-800 rounded w-20 shrink-0" />
                    <div className="h-3.5 bg-gray-800 rounded w-48 shrink-0" />
                    <div className="h-3.5 bg-gray-800 rounded w-16 shrink-0" />
                    <div className="h-3.5 bg-gray-800 rounded w-20 shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {searchResults !== null && !searching && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 text-sm text-gray-400">
                  SO {soQuery} — {searchResults.length} work order{searchResults.length !== 1 ? 's' : ''}
                </div>
                {searchResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">No work orders found for this SO.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-700">
                        <th className="px-4 py-2 text-left font-medium">WO #</th>
                        <th className="px-4 py-2 text-left font-medium">Item</th>
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-left font-medium">Assigned</th>
                        <th className="px-4 py-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((wo) => (
                        <tr key={wo.wo_id} className="border-b border-gray-800 hover:bg-gray-800/40">
                          <td className="px-4 py-2.5 font-mono text-cyan-300">{wo.wo_id}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{wo.item_number ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-300 max-w-[240px] truncate">{wo.description ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_BADGE[wo.assignment_status ?? wo.wo_status] ?? 'bg-gray-800 text-gray-400 border-gray-600'}`}>
                              {wo.assignment_status ?? wo.wo_status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {wo.assigned_to_name
                              ? <span className="text-blue-300">{wo.assigned_to_name}</span>
                              : <span className="text-gray-600">Unassigned</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {assigning === wo.wo_id ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={assignPickerId}
                                  onChange={(e) => setAssignPickerId(e.target.value)}
                                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                                >
                                  <option value="">Select builder…</option>
                                  {builders.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => assignPickerId && assignWO(wo, parseInt(assignPickerId, 10))}
                                  disabled={!assignPickerId}
                                  className="text-xs px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded disabled:opacity-40 transition"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setAssigning(null); setAssignPickerId(''); }}
                                  className="text-xs text-gray-500 hover:text-white"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAssigning(wo.wo_id); setAssignPickerId(''); }}
                                className="text-xs text-gray-500 hover:text-cyan-400 transition"
                              >
                                {wo.assigned_to_name ? 'Reassign' : 'Assign'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* ASSIGNED TAB */}
        {tab === 'assigned' && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-400">
                {loadingAssigned
                  ? <div className="animate-pulse h-4 bg-gray-800 rounded w-36 inline-block" />
                  : `${assignments.length} active assignment${assignments.length !== 1 ? 's' : ''}`
                }
              </span>
              <button
                onClick={loadAssigned}
                disabled={loadingAssigned}
                className="text-xs text-gray-500 hover:text-white transition disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {loadingAssigned && assignments.length === 0 && (
              <AssignedTableSkeleton />
            )}

            {assignments.length === 0 && !loadingAssigned ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">No active assignments.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-700">
                    <th className="px-4 py-2 text-left font-medium">WO #</th>
                    <th className="px-4 py-2 text-left font-medium">SO #</th>
                    <th className="px-4 py-2 text-left font-medium">Description</th>
                    <th className="px-4 py-2 text-left font-medium">Assigned To</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Since</th>
                    <th className="px-4 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 font-mono text-cyan-300 whitespace-nowrap">{a.work_order_number}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-300 whitespace-nowrap">{a.sales_order_number}</td>
                      <td className="px-4 py-2.5 text-gray-300 max-w-[200px] truncate">{a.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-blue-300 text-sm">{a.assigned_to_name ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_BADGE[a.status] ?? 'bg-gray-800 text-gray-400 border-gray-600'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => markComplete(a.id)}
                          className="text-xs text-green-500 hover:text-green-400 transition"
                        >
                          Mark Complete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
