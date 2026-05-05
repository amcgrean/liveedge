'use client';

import { useState, useEffect, useCallback } from 'react';
import { TopNav } from '../../../src/components/nav/TopNav';
import { RefreshCw, Pencil, Trash2, X, Check, AlertCircle, Truck, Zap, Info } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import type { DriverRoute } from '../../api/dispatch/drivers/route';
import type { SamsaraDriver } from '../../api/dispatch/samsara-drivers/route';

interface SamsaraVehicle {
  id: string;
  name: string;
  branch_code: string | null;
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

export default function DriversClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();

  const [branch] = useBranchFilter(isAdmin, userBranch);
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [samsaraDrivers, setSamsaraDrivers] = useState<SamsaraDriver[]>([]);
  const [samsaraVehicles, setSamsaraVehicles] = useState<SamsaraVehicle[]>([]);
  const [synced, setSynced] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  // Assign / edit modal state
  const [assignTarget, setAssignTarget] = useState<DriverRoute | null>(null);
  const [assignTruckId, setAssignTruckId] = useState('');
  const [assignTruckName, setAssignTruckName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Clear modal state
  const [clearTarget, setClearTarget] = useState<DriverRoute | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const params = branch ? `?branch=${branch}` : '';
      const res = await fetch(`/api/dispatch/drivers${params}`);
      if (res.ok) {
        const data = await res.json() as { drivers: DriverRoute[]; synced: boolean };
        setRoutes(data.drivers);
        setSynced(data.synced);
      }
    } finally {
      setLoading(false);
    }
  }, [branch]);

  const loadSamsaraDrivers = useCallback(async () => {
    const res = await fetch('/api/dispatch/samsara-drivers');
    if (res.ok) {
      const data = await res.json() as { drivers: SamsaraDriver[] };
      setSamsaraDrivers(data.drivers);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
    loadSamsaraDrivers();
  }, [loadRoutes, loadSamsaraDrivers]);

  async function loadVehicles() {
    if (samsaraVehicles.length) return; // already loaded
    setVehiclesLoading(true);
    try {
      const params = branch ? `?branch=${branch}` : '';
      const res = await fetch(`/api/dispatch/vehicles${params}`);
      if (res.ok) {
        const data = await res.json() as { vehicles: SamsaraVehicle[] };
        setSamsaraVehicles(data.vehicles);
      }
    } finally {
      setVehiclesLoading(false);
    }
  }

  // For a given route, find matching Samsara driver (username === route_code)
  function getSamsaraSuggestion(route: DriverRoute): SamsaraDriver | null {
    return samsaraDrivers.find((d) => d.username === route.route_code) ?? null;
  }

  function openAssign(route: DriverRoute) {
    setAssignTarget(route);
    setAssignTruckId(route.assigned_truck_id ?? '');
    setAssignTruckName(route.assigned_truck_name ?? '');
    setSaveError('');
    loadVehicles();
  }

  function selectVehicle(v: SamsaraVehicle) {
    setAssignTruckId(v.id);
    setAssignTruckName(v.name);
  }

  async function acceptSuggestion(route: DriverRoute, suggestion: SamsaraDriver) {
    setSaving(true);
    try {
      await fetch('/api/dispatch/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_code: route.route_code,
          branch_code: route.branch_code,
          truck_id: suggestion.staticVehicleId,
          truck_name: suggestion.staticVehicleName,
        }),
      });
      await loadRoutes();
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!assignTarget) return;
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        route_code: assignTarget.route_code,
        branch_code: assignTarget.branch_code,
        truck_id: assignTruckId.trim() || null,
        truck_name: assignTruckName.trim() || null,
      };

      let res: Response;
      if (assignTarget.id) {
        res = await fetch(`/api/dispatch/drivers/${assignTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truck_id: body.truck_id, truck_name: body.truck_name }),
        });
      } else {
        res = await fetch('/api/dispatch/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setSaveError(data.error ?? 'Failed to save.');
        return;
      }
      setAssignTarget(null);
      await loadRoutes();
    } finally {
      setSaving(false);
    }
  }

  async function confirmClear() {
    if (!clearTarget?.id) return;
    setClearing(true);
    try {
      await fetch(`/api/dispatch/drivers/${clearTarget.id}`, { method: 'DELETE' });
      setClearTarget(null);
      await loadRoutes();
    } finally {
      setClearing(false);
    }
  }

  const assigned = routes.filter((r) => r.assigned_truck_id).length;
  const unassigned = routes.length - assigned;

  return (
    <>
      <TopNav userName={userName} userRole={userRole} />
      <div className="min-h-screen bg-gray-950 text-white p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-cyan-400">Delivery Routes</h1>
              <p className="text-sm text-gray-500 mt-0.5">ERP route codes and Samsara truck assignments</p>
            </div>
            <button onClick={() => { loadRoutes(); loadSamsaraDrivers(); setSamsaraVehicles([]); }}
              disabled={loading}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
              <div className="text-2xl font-bold">{routes.length}</div>
              <div className="text-xs text-gray-500">Total Routes</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
              <div className="text-2xl font-bold text-green-300">{assigned}</div>
              <div className="text-xs text-gray-500">Truck Assigned</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
              <div className="text-2xl font-bold text-amber-400">{unassigned}</div>
              <div className="text-xs text-gray-500">No Truck</div>
            </div>
          </div>

          {/* Not-synced callout */}
          {synced === false && (
            <div className="flex items-start gap-3 p-4 bg-amber-900/30 border border-amber-700/60 rounded-xl text-sm text-amber-200">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
              <div>
                <div className="font-medium text-amber-300 mb-0.5">Delivery routes not yet synced from ERP</div>
                <div className="text-amber-200/70">
                  The WH-Tracker Pi sync job must be updated to push <code className="font-mono text-xs bg-amber-900/50 px-1 rounded">delv_route</code> to Supabase.
                  Once synced, all routes and drivers will appear here automatically.
                </div>
              </div>
            </div>
          )}

          {/* Route table */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-700 text-sm text-gray-400">
              {loading ? 'Loading…' : synced ? `${routes.length} routes from ERP` : 'Awaiting ERP sync'}
            </div>

            {routes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-700">
                      <th className="px-4 py-2 text-left font-medium">Route Code</th>
                      <th className="px-4 py-2 text-left font-medium">Driver / Route Name</th>
                      <th className="px-4 py-2 text-left font-medium">Branch</th>
                      <th className="px-4 py-2 text-left font-medium">Assigned Truck</th>
                      <th className="px-4 py-2 text-left font-medium">Auto-Match</th>
                      {isAdmin && <th className="px-4 py-2 w-24"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r) => {
                      const suggestion = getSamsaraSuggestion(r);
                      const hasTruck = !!r.assigned_truck_id;
                      const hasSuggestion = !hasTruck && !!suggestion?.staticVehicleId;

                      return (
                        <tr key={`${r.branch_code}-${r.route_code}`}
                          className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">

                          {/* Route Code */}
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-300">
                            {r.route_code}
                          </td>

                          {/* Driver / Route Name */}
                          <td className="px-4 py-2.5 font-medium text-gray-200">
                            {r.driver_name}
                            {r.notes && <div className="text-xs text-gray-500 mt-0.5">{r.notes}</div>}
                          </td>

                          {/* Branch */}
                          <td className="px-4 py-2.5 text-xs text-gray-400">{r.branch_code}</td>

                          {/* Assigned Truck */}
                          <td className="px-4 py-2.5">
                            {hasTruck ? (
                              <span className="flex items-center gap-1.5 text-xs text-green-300">
                                <Truck className="w-3 h-3" />
                                {r.assigned_truck_name || r.assigned_truck_id}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>

                          {/* Auto-Match */}
                          <td className="px-4 py-2.5">
                            {hasSuggestion && isAdmin ? (
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 text-xs text-cyan-400 font-medium">
                                  <Zap className="w-3 h-3" />
                                  {suggestion!.staticVehicleName ?? suggestion!.name}
                                </span>
                                <button
                                  onClick={() => acceptSuggestion(r, suggestion!)}
                                  disabled={saving}
                                  className="px-2 py-0.5 text-xs bg-cyan-800/60 hover:bg-cyan-700/60 text-cyan-200 rounded transition disabled:opacity-40">
                                  Accept
                                </button>
                              </div>
                            ) : hasTruck && suggestion ? (
                              <span className="text-xs text-gray-600">Matched</span>
                            ) : suggestion && !suggestion.staticVehicleId ? (
                              <span className="text-xs text-gray-600">User found, no vehicle</span>
                            ) : (
                              <span className="text-xs text-gray-700">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          {isAdmin && (
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => openAssign(r)}
                                  className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition"
                                  title={hasTruck ? 'Edit truck assignment' : 'Assign truck'}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {hasTruck && (
                                  <button
                                    onClick={() => setClearTarget(r)}
                                    className="p-1.5 hover:bg-red-900/40 rounded text-gray-500 hover:text-red-400 transition"
                                    title="Clear truck assignment">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && routes.length === 0 && synced !== false && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">No routes found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Assign / Edit Truck Modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {assignTarget.assigned_truck_id ? 'Edit Truck Assignment' : 'Assign Truck'}
              </h2>
              <button onClick={() => setAssignTarget(null)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-sm space-y-0.5">
              <div className="text-gray-400 text-xs">Route</div>
              <div className="font-mono text-gray-200 text-xs">{assignTarget.route_code}</div>
              <div className="text-gray-300">{assignTarget.driver_name}</div>
            </div>

            {/* Samsara suggestion */}
            {(() => {
              const s = getSamsaraSuggestion(assignTarget);
              if (!s?.staticVehicleId) return null;
              return (
                <button
                  onClick={() => selectVehicle({ id: s.staticVehicleId!, name: s.staticVehicleName ?? s.name, branch_code: null })}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-cyan-900/30 border border-cyan-700/40 rounded-lg text-sm text-cyan-200 hover:bg-cyan-900/50 transition text-left">
                  <Zap className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Auto-match: <span className="font-medium">{s.staticVehicleName ?? s.name}</span></span>
                </button>
              );
            })()}

            {/* Vehicle picker */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Select Samsara Vehicle</label>
              {vehiclesLoading ? (
                <div className="text-xs text-gray-500 py-2">Loading vehicles…</div>
              ) : (
                <select
                  value={assignTruckId}
                  onChange={(e) => {
                    const v = samsaraVehicles.find((x) => x.id === e.target.value);
                    setAssignTruckId(e.target.value);
                    setAssignTruckName(v?.name ?? '');
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
                  <option value="">— No vehicle —</option>
                  {samsaraVehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
              {assignTruckId && (
                <div className="mt-1 text-xs text-gray-500 font-mono">{assignTruckId}</div>
              )}
            </div>

            {saveError && (
              <div className="flex items-center gap-2 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{saveError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setAssignTarget(null)}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded transition">
                Cancel
              </button>
              <button onClick={saveAssignment} disabled={saving}
                className="px-4 py-2 text-sm bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded transition flex items-center gap-2">
                {saving ? 'Saving…' : <><Check className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear assignment confirm */}
      {clearTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-800 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Clear Truck Assignment?</h2>
            <p className="text-sm text-gray-400">
              Remove the truck assignment for <span className="text-white font-medium">{clearTarget.driver_name}</span> ({clearTarget.route_code})?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setClearTarget(null)}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded transition">
                Cancel
              </button>
              <button onClick={confirmClear} disabled={clearing}
                className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded transition flex items-center gap-2">
                <Trash2 className="w-4 h-4" />{clearing ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
