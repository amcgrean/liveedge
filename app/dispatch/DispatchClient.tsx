'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TopNav } from '../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { DeliveryStop } from '../api/dispatch/deliveries/route';
import type { DispatchKpis } from '../api/dispatch/kpis/route';
import type { OrderLine } from '../api/dispatch/orders/[so_number]/lines/route';
import {
  X, ChevronDown, ChevronRight, ChevronUp, Truck, AlertCircle, Clock,
  Package, MapPin, User, Plus, Trash2, RefreshCw, Search,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DispatchRoute {
  id: number; route_date: string; route_name: string; branch_code: string;
  driver_name: string | null; truck_id: string | null;
  status: string | null; notes: string | null; stop_count: number;
}

interface RouteStop {
  id: number; route_id: number; so_id: string;
  shipment_num: number; sequence: number; status: string | null; notes: string | null;
}

interface TruckAssignment {
  id: number; assignment_date: string; branch_code: string;
  samsara_vehicle_id: string; samsara_vehicle_name: string | null;
  driver_name: string | null; driver_phone: string | null;
  route_id: number | null; route_name: string | null; notes: string | null;
}

interface TimelineEvent { label: string; time: string | null; detail?: string }
interface TimelineData {
  events: TimelineEvent[];
  ar: { balance: number | null; open_count: number };
  so: {
    reference: string | null; sale_type: string | null;
    expect_date: string | null; shipto_address_1: string | null;
    shipto_city: string | null; cust_code: string | null;
    ship_via: string | null;
  };
}

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  userName: string | null;
  userRole?: string;
}

type LeftTab = 'unassigned' | 'routes' | 'all';
type DetailTab = 'timeline' | 'lines' | 'ar';

// ── Constants ─────────────────────────────────────────────────────────────────

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

const STATUS_FLAG: Record<string, { label: string; color: string; step: number }> = {
  K: { label: 'Picking',     color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700', step: 1 },
  P: { label: 'Picked',      color: 'bg-blue-900/60 text-blue-300 border-blue-700',       step: 2 },
  S: { label: 'Staged',      color: 'bg-orange-900/60 text-orange-300 border-orange-700', step: 3 },
  D: { label: 'En Route',    color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700',        step: 4 },
  I: { label: 'Invoiced',    color: 'bg-green-900/60 text-green-300 border-green-700',    step: 5 },
  C: { label: 'Complete',    color: 'bg-gray-800/80 text-gray-400 border-gray-600',       step: 5 },
};

const STEPS = ['Ordered', 'Picking', 'Picked', 'Staged', 'En Route', 'Invoiced'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(flag: string) {
  const s = STATUS_FLAG[flag?.toUpperCase()] ?? { label: flag || '—', color: 'bg-gray-800/80 text-gray-400 border-gray-600' };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.color}`}>
      {s.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function fmtMoney(n: number | null) {
  if (n == null) return '—';
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// ── KPI Bar ───────────────────────────────────────────────────────────────────

function KpiTile({ label, value, accent }: { label: string; value: number | null; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-4 py-2.5 text-center ${accent ? 'bg-cyan-900/40 border border-cyan-700/50' : 'bg-gray-800 border border-gray-700'}`}>
      <div className={`text-2xl font-bold tabular-nums ${accent ? 'text-cyan-300' : 'text-white'}`}>
        {value ?? '—'}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

// ── Status Stepper ─────────────────────────────────────────────────────────────

function StatusStepper({ flag }: { flag: string }) {
  const currentStep = STATUS_FLAG[flag?.toUpperCase()]?.step ?? 0;
  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all ${
                done ? 'bg-cyan-500 border-cyan-400 text-white' :
                active ? 'bg-cyan-900 border-cyan-400 text-cyan-300' :
                'bg-gray-800 border-gray-600 text-gray-600'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <div className={`text-[9px] mt-1 text-center truncate w-full leading-tight ${
                active ? 'text-cyan-400 font-medium' : done ? 'text-gray-400' : 'text-gray-600'
              }`}>{step}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-shrink-0 w-3 mb-4 ${done ? 'bg-cyan-500' : 'bg-gray-700'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Stop Card (left panel) ────────────────────────────────────────────────────

function StopCard({
  stop, selected, onClick, routes, onAssign,
}: {
  stop: DeliveryStop;
  selected: boolean;
  onClick: () => void;
  routes: DispatchRoute[];
  onAssign: (routeId: number) => Promise<void>;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [assignRoute, setAssignRoute] = useState('');
  const [assigning, setAssigning] = useState(false);

  async function doAssign() {
    if (!assignRoute) return;
    setAssigning(true);
    await onAssign(parseInt(assignRoute, 10));
    setAssigning(false);
    setShowAssign(false);
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-2.5 cursor-pointer transition-all mb-1.5 ${
        selected
          ? 'border-cyan-500 bg-cyan-900/20'
          : 'border-gray-700 bg-gray-900 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-mono text-cyan-400 truncate">{stop.so_id}</div>
          <div className="text-xs font-medium text-gray-200 truncate">{stop.customer_name ?? '—'}</div>
          <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
            <MapPin className="w-2.5 h-2.5" />
            <span className="truncate">{stop.city ?? stop.address_1 ?? '—'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {statusBadge(stop.status_flag)}
          {stop.ar_balance != null && stop.ar_balance > 0 && (
            <span className="text-[9px] text-red-400 font-medium">
              <AlertCircle className="w-2.5 h-2.5 inline mr-0.5" />
              {fmtMoney(stop.ar_balance)}
            </span>
          )}
        </div>
      </div>
      {routes.length > 0 && (
        <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
          {showAssign ? (
            <div className="flex gap-1">
              <select
                value={assignRoute}
                onChange={(e) => setAssignRoute(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-[10px] text-white"
              >
                <option value="">Route…</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.route_name}{r.driver_name ? ` (${r.driver_name})` : ''}</option>
                ))}
              </select>
              <button
                onClick={doAssign}
                disabled={!assignRoute || assigning}
                className="px-2 py-0.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 rounded text-[10px] text-white"
              >
                {assigning ? '…' : 'Add'}
              </button>
              <button onClick={() => setShowAssign(false)} className="px-1.5 py-0.5 text-gray-400 hover:text-white text-[10px]">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAssign(true)}
              className="text-[10px] text-gray-500 hover:text-cyan-400 transition"
            >
              + assign to route
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Route Card (left panel) ────────────────────────────────────────────────────

function RouteCard({
  route, stops, stopLookup, selectedSoId, onSelectStop, onRemoveStop, onDeleteRoute,
}: {
  route: DispatchRoute;
  stops: RouteStop[];
  stopLookup: Map<string, DeliveryStop>;
  selectedSoId: string | null;
  onSelectStop: (stop: DeliveryStop) => void;
  onRemoveStop: (routeId: number, stopRowId: number) => Promise<void>;
  onDeleteRoute: (routeId: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 mb-2 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-800/50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-200 truncate">{route.route_name}</div>
            {route.driver_name && (
              <div className="text-[10px] text-gray-500 flex items-center gap-1">
                <User className="w-2.5 h-2.5" />{route.driver_name}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-500">{route.stop_count} stop{route.stop_count !== 1 ? 's' : ''}</span>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm(`Delete route "${route.route_name}"?`)) return;
              setDeleting(true);
              await onDeleteRoute(route.id);
            }}
            disabled={deleting}
            className="text-gray-600 hover:text-red-400 transition disabled:opacity-30"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-gray-800">
          {stops.length === 0 ? (
            <div className="text-[10px] text-gray-600 text-center py-2">No stops — assign from Unassigned tab</div>
          ) : (
            stops.map((rs) => {
              const del = stopLookup.get(rs.so_id);
              const isSelected = rs.so_id === selectedSoId;
              return (
                <div
                  key={rs.id}
                  onClick={() => del && onSelectStop(del)}
                  className={`flex items-center justify-between gap-1 rounded px-2 py-1.5 mt-1 cursor-pointer transition ${
                    isSelected ? 'bg-cyan-900/30 border border-cyan-700/50' : 'hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-gray-600 font-mono w-5 text-right shrink-0">{rs.sequence}</span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-cyan-400">{rs.so_id}</div>
                      <div className="text-[10px] text-gray-400 truncate">{del?.customer_name ?? '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {del && statusBadge(del.status_flag)}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onRemoveStop(route.id, rs.id);
                      }}
                      className="text-gray-600 hover:text-red-400 transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ stop, onClose }: { stop: DeliveryStop; onClose: () => void }) {
  const [detailTab, setDetailTab] = useState<DetailTab>('timeline');
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [lines, setLines] = useState<OrderLine[] | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    setTimeline(null); setLines(null); setDetailTab('timeline');
  }, [stop.so_id]);

  useEffect(() => {
    if (detailTab !== 'timeline' || timeline) return;
    setLoadingTimeline(true);
    fetch(`/api/dispatch/orders/${encodeURIComponent(stop.so_id)}/timeline`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTimeline(d))
      .catch(() => {})
      .finally(() => setLoadingTimeline(false));
  }, [detailTab, stop.so_id, timeline]);

  useEffect(() => {
    if (detailTab !== 'lines' || lines) return;
    setLoadingLines(true);
    fetch(`/api/dispatch/orders/${encodeURIComponent(stop.so_id)}/lines`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setLines(d?.lines ?? []))
      .catch(() => {})
      .finally(() => setLoadingLines(false));
  }, [detailTab, stop.so_id, lines]);

  const arBalance = timeline?.ar?.balance ?? stop.ar_balance;
  const arCount = timeline?.ar?.open_count ?? 0;

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-gray-700 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-cyan-300 text-sm font-bold">{stop.so_id}</span>
            {statusBadge(stop.status_flag)}
          </div>
          <div className="text-sm font-medium text-gray-200 mt-0.5 truncate">{stop.customer_name ?? '—'}</div>
          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" />
            {[stop.address_1, stop.city].filter(Boolean).join(', ') || '—'}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition shrink-0 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status stepper */}
      <div className="px-4 py-3 border-b border-gray-700 shrink-0">
        <StatusStepper flag={stop.status_flag} />
      </div>

      {/* Summary grid */}
      <div className="px-4 py-3 border-b border-gray-700 shrink-0">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div><dt className="text-gray-500">Expected</dt><dd className="text-gray-200">{fmtDate(stop.expect_date)}</dd></div>
          <div><dt className="text-gray-500">Ship Via</dt><dd className="text-gray-200 uppercase">{stop.ship_via ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Sale Type</dt><dd className="text-gray-200 uppercase">{stop.sale_type ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Reference</dt><dd className="text-gray-200 truncate">{stop.reference ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Driver</dt><dd className="text-gray-200">{stop.driver ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Route</dt><dd className="text-gray-200">{stop.route_id_char ?? '—'}</dd></div>
          <div className="col-span-2">
            <dt className="text-gray-500">AR Balance</dt>
            <dd className={`font-semibold ${arBalance != null && arBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {arBalance != null ? fmtMoney(arBalance) : 'No open balance'}
              {arCount > 0 && <span className="ml-1 text-xs font-normal text-gray-500">({arCount} items)</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 shrink-0">
        {(['timeline', 'lines', 'ar'] as DetailTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setDetailTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition border-b-2 ${
              detailTab === t ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'ar' ? 'AR' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Timeline tab */}
        {detailTab === 'timeline' && (
          loadingTimeline ? (
            <div className="text-xs text-gray-500 text-center py-6">Loading timeline…</div>
          ) : !timeline ? (
            <div className="text-xs text-red-400 text-center py-6">Could not load timeline.</div>
          ) : timeline.events.length === 0 ? (
            <div className="text-xs text-gray-600 text-center py-6">No timeline events yet.</div>
          ) : (
            <ol className="relative border-l border-gray-700 ml-2 space-y-4">
              {timeline.events.map((ev, i) => (
                <li key={i} className="pl-4">
                  <span className="absolute -left-1 w-2 h-2 rounded-full bg-cyan-500 mt-0.5" />
                  <div className="text-xs font-medium text-gray-200">{ev.label}</div>
                  {ev.time && <div className="text-xs text-gray-500">{new Date(ev.time).toLocaleString()}</div>}
                  {ev.detail && <div className="text-xs text-gray-500 italic">{ev.detail}</div>}
                </li>
              ))}
            </ol>
          )
        )}

        {/* Lines tab */}
        {detailTab === 'lines' && (
          loadingLines ? (
            <div className="text-xs text-gray-500 text-center py-6">Loading line items…</div>
          ) : !lines ? (
            <div className="text-xs text-red-400 text-center py-6">Could not load line items.</div>
          ) : lines.length === 0 ? (
            <div className="text-xs text-gray-600 text-center py-6">No line items found.</div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase border-b border-gray-700">
                    <th className="text-left py-1.5 px-1">Item</th>
                    <th className="text-left py-1.5 px-1">Description</th>
                    <th className="text-right py-1.5 px-1">Ordered</th>
                    <th className="text-right py-1.5 px-1">Shipped</th>
                    <th className="text-right py-1.5 px-1">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/40">
                      <td className="py-1.5 px-1 font-mono text-cyan-400 whitespace-nowrap">{line.item_code ?? '—'}</td>
                      <td className="py-1.5 px-1 text-gray-300">
                        {line.description ?? '—'}
                        {line.size && <span className="text-gray-500 ml-1">{line.size}</span>}
                      </td>
                      <td className="py-1.5 px-1 text-right text-gray-300 whitespace-nowrap">
                        {line.qty_ordered != null ? line.qty_ordered : '—'} {line.uom ?? ''}
                      </td>
                      <td className="py-1.5 px-1 text-right text-gray-300 whitespace-nowrap">
                        {line.qty_shipped != null ? line.qty_shipped : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-right text-gray-400 whitespace-nowrap">
                        {line.price != null ? fmtMoney(line.price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* AR tab */}
        {detailTab === 'ar' && (
          <div className="space-y-4">
            <div className={`rounded-lg border p-4 text-center ${
              arBalance != null && arBalance > 0
                ? 'border-red-700 bg-red-900/20'
                : 'border-green-700 bg-green-900/20'
            }`}>
              <div className={`text-2xl font-bold ${arBalance != null && arBalance > 0 ? 'text-red-300' : 'text-green-300'}`}>
                {arBalance != null ? fmtMoney(arBalance) : 'No open balance'}
              </div>
              <div className="text-xs text-gray-400 mt-1">Open AR Balance</div>
              {arCount > 0 && (
                <div className="text-xs text-gray-500 mt-1">{arCount} open item{arCount !== 1 ? 's' : ''}</div>
              )}
            </div>
            {arBalance != null && arBalance > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-900/20 border border-yellow-700/50">
                <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                <p className="text-xs text-yellow-300">Customer has outstanding balance. Confirm payment before loading.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Main DispatchClient ────────────────────────────────────────────────────────

export default function DispatchClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const today = new Date().toISOString().slice(0, 10);

  // Filters
  const [date, setDate] = useState(today);
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [search, setSearch] = useState('');

  // Data
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [kpis, setKpis] = useState<DispatchKpis | null>(null);
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [routeStops, setRouteStops] = useState<Map<number, RouteStop[]>>(new Map());
  const [trucks, setTrucks] = useState<TruckAssignment[]>([]);

  // UI state
  const [leftTab, setLeftTab] = useState<LeftTab>('unassigned');
  const [selectedStop, setSelectedStop] = useState<DeliveryStop | null>(null);
  const [showTrucks, setShowTrucks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState<'route' | 'status' | 'branch'>('route');
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ route_name: '', branch_code: userBranch ?? '', driver_name: '', truck_id: '' });
  const [savingRoute, setSavingRoute] = useState(false);

  // Build a fast lookup: so_id → DeliveryStop
  const stopLookup = React.useMemo(() => {
    const m = new Map<string, DeliveryStop>();
    stops.forEach((s) => m.set(s.so_id, s));
    return m;
  }, [stops]);

  // Set of so_ids that are assigned to any route
  const assignedSoIds = React.useMemo(() => {
    const s = new Set<string>();
    routeStops.forEach((rsList) => rsList.forEach((rs) => s.add(rs.so_id)));
    return s;
  }, [routeStops]);

  // Load all route stops for every route
  const loadRouteStops = useCallback(async (routeList: DispatchRoute[]) => {
    const entries = await Promise.all(
      routeList.map(async (r) => {
        try {
          const res = await fetch(`/api/dispatch/routes/${r.id}/stops`);
          const data = res.ok ? (await res.json() as RouteStop[]) : [];
          return [r.id, data] as [number, RouteStop[]];
        } catch {
          return [r.id, []] as [number, RouteStop[]];
        }
      })
    );
    setRouteStops(new Map(entries));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date });
      if (branch) params.set('branch', branch);
      const qs = params.toString();

      const [stopsRes, kpisRes, routesRes, trucksRes] = await Promise.all([
        fetch(`/api/dispatch/deliveries?${qs}`),
        fetch(`/api/dispatch/kpis?${qs}`),
        fetch(`/api/dispatch/routes?${qs}`),
        fetch(`/api/dispatch/truck-assignments?${qs}`),
      ]);

      const [stopsData, kpisData, routesData, trucksData] = await Promise.all([
        stopsRes.ok ? stopsRes.json() : [],
        kpisRes.ok ? kpisRes.json() : null,
        routesRes.ok ? routesRes.json() : [],
        trucksRes.ok ? trucksRes.json() : { assignments: [] },
      ]);

      setStops(stopsData as DeliveryStop[]);
      setKpis(kpisData as DispatchKpis | null);
      const routeList = routesData as DispatchRoute[];
      setRoutes(routeList);
      setTrucks((trucksData as { assignments: TruckAssignment[] }).assignments ?? []);
      await loadRouteStops(routeList);
    } catch {
      setError('Failed to load dispatch data.');
    } finally {
      setLoading(false);
    }
  }, [date, branch, loadRouteStops]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Assign stop to route
  async function assignStopToRoute(soId: string, routeId: number) {
    const stop = stopLookup.get(soId);
    await fetch(`/api/dispatch/routes/${routeId}/stops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ so_id: soId, shipment_num: stop?.shipment_num ?? 1 }),
    });
    // Refresh route stops
    const res = await fetch(`/api/dispatch/routes/${routeId}/stops`);
    if (res.ok) {
      const data = await res.json() as RouteStop[];
      setRouteStops((prev) => new Map(prev).set(routeId, data));
    }
    // Update route stop_count
    setRoutes((prev) => prev.map((r) => r.id === routeId ? { ...r, stop_count: r.stop_count + 1 } : r));
    setKpis((prev) => prev ? { ...prev, unassigned_stops: Math.max(0, prev.unassigned_stops - 1) } : prev);
  }

  // Remove stop from route
  async function removeStopFromRoute(routeId: number, stopRowId: number) {
    await fetch(`/api/dispatch/routes/${routeId}/stops/${stopRowId}`, { method: 'DELETE' });
    setRouteStops((prev) => {
      const next = new Map(prev);
      const list = next.get(routeId) ?? [];
      next.set(routeId, list.filter((s) => s.id !== stopRowId));
      return next;
    });
    setRoutes((prev) => prev.map((r) => r.id === routeId ? { ...r, stop_count: Math.max(0, r.stop_count - 1) } : r));
    setKpis((prev) => prev ? { ...prev, unassigned_stops: prev.unassigned_stops + 1 } : prev);
  }

  // Delete route
  async function deleteRoute(routeId: number) {
    await fetch(`/api/dispatch/routes/${routeId}`, { method: 'DELETE' });
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));
    setRouteStops((prev) => { const n = new Map(prev); n.delete(routeId); return n; });
    setKpis((prev) => prev ? { ...prev, route_count: Math.max(0, prev.route_count - 1) } : prev);
  }

  // Create route
  async function createRoute() {
    if (!newRoute.route_name.trim() || !newRoute.branch_code.trim()) return;
    setSavingRoute(true);
    try {
      const res = await fetch('/api/dispatch/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRoute, route_date: date }),
      });
      if (res.ok) {
        setShowNewRoute(false);
        setNewRoute({ route_name: '', branch_code: userBranch ?? '', driver_name: '', truck_id: '' });
        await loadAll();
      }
    } finally {
      setSavingRoute(false);
    }
  }

  // Delivery board grouping
  const grouped = React.useMemo(() => {
    return stops.reduce<Record<string, DeliveryStop[]>>((acc, d) => {
      let key: string;
      if (groupBy === 'route') key = d.route_id_char || '(Unrouted)';
      else if (groupBy === 'status') key = (STATUS_FLAG[d.status_flag?.toUpperCase()]?.label ?? d.status_flag) || '—';
      else key = d.system_id;
      (acc[key] ??= []).push(d);
      return acc;
    }, {});
  }, [stops, groupBy]);

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === '(Unrouted)') return 1;
    if (b === '(Unrouted)') return -1;
    return a.localeCompare(b);
  });

  // Filtered lists
  const q = search.toLowerCase();
  const unassignedStops = stops.filter((s) => !assignedSoIds.has(s.so_id));
  const filteredUnassigned = q
    ? unassignedStops.filter((s) =>
        s.so_id.includes(q) || s.customer_name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q))
    : unassignedStops;
  const filteredAll = q
    ? stops.filter((s) =>
        s.so_id.includes(q) || s.customer_name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q))
    : stops;

  return (
    <>
      <TopNav userName={userName} userRole={userRole} />
      <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">

        {/* ── Command Bar ── */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur">
          <div className="flex flex-wrap gap-3 items-center">
            {/* KPI tiles */}
            <div className="flex gap-2">
              <KpiTile label="Total Stops"  value={kpis?.total_stops ?? null} accent />
              <KpiTile label="Unassigned"   value={kpis?.unassigned_stops ?? null} />
              <KpiTile label="Routes"       value={kpis?.route_count ?? null} />
              <KpiTile label="Trucks Out"   value={kpis?.trucks_out ?? null} />
            </div>

            {/* Divider */}
            <div className="w-px h-10 bg-gray-700 hidden sm:block" />

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white"
              />
              {isAdmin && (
                <select
                  value={branch} onChange={(e) => setBranch(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white"
                >
                  <option value="">All Branches</option>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input
                  type="text" placeholder="Search stops…" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded pl-7 pr-3 py-1.5 text-sm text-white w-44 placeholder-gray-600"
                />
              </div>
              <select
                value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white"
              >
                <option value="route">Group: Route</option>
                <option value="status">Group: Status</option>
                {isAdmin && <option value="branch">Group: Branch</option>}
              </select>
              <button
                onClick={loadAll} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-300 hover:text-white transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowTrucks(!showTrucks)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded transition ${
                  showTrucks ? 'bg-cyan-800 border-cyan-600 text-cyan-200' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Trucks
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-2 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded px-3 py-1.5">{error}</div>
          )}
        </div>

        {/* ── Truck Panel ── */}
        {showTrucks && (
          <div className="shrink-0 border-b border-gray-800 bg-gray-900/60 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Truck Assignments — {date}
              </h3>
              <button onClick={() => setShowTrucks(false)} className="text-gray-600 hover:text-gray-400">
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            {trucks.length === 0 ? (
              <div className="text-xs text-gray-600">No truck assignments for this date{branch ? ` / ${branch}` : ''}.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase">
                      <th className="text-left pr-6 pb-1">Vehicle</th>
                      <th className="text-left pr-6 pb-1">Driver</th>
                      <th className="text-left pr-6 pb-1">Route</th>
                      {isAdmin && <th className="text-left pr-6 pb-1">Branch</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {trucks.map((t) => (
                      <tr key={t.id} className="border-t border-gray-800">
                        <td className="pr-6 py-1 text-gray-300">{t.samsara_vehicle_name ?? t.samsara_vehicle_id}</td>
                        <td className="pr-6 py-1 text-gray-400">{t.driver_name ?? '—'}</td>
                        <td className="pr-6 py-1 text-gray-400">{t.route_name ?? '—'}</td>
                        {isAdmin && <td className="pr-6 py-1 text-gray-500">{t.branch_code}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Main Layout ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left Panel */}
          <div className="w-64 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-800 shrink-0">
              {(['unassigned', 'routes', 'all'] as LeftTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setLeftTab(t)}
                  className={`flex-1 py-2 text-[10px] font-medium capitalize transition border-b-2 ${
                    leftTab === t ? 'border-cyan-500 text-cyan-400 bg-gray-900/50' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t === 'unassigned' ? `Unassigned${kpis ? ` (${kpis.unassigned_stops})` : ''}` : t === 'routes' ? `Routes (${routes.length})` : 'All'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2">

              {/* Unassigned tab */}
              {leftTab === 'unassigned' && (
                filteredUnassigned.length === 0 ? (
                  <div className="text-xs text-gray-600 text-center py-8">
                    {search ? 'No matches.' : 'All stops are assigned to routes.'}
                  </div>
                ) : (
                  filteredUnassigned.map((s) => (
                    <StopCard
                      key={`${s.so_id}-${s.shipment_num}`}
                      stop={s}
                      selected={selectedStop?.so_id === s.so_id}
                      onClick={() => setSelectedStop(selectedStop?.so_id === s.so_id ? null : s)}
                      routes={routes}
                      onAssign={(routeId) => assignStopToRoute(s.so_id, routeId)}
                    />
                  ))
                )
              )}

              {/* Routes tab */}
              {leftTab === 'routes' && (
                <>
                  {routes.length === 0 ? (
                    <div className="text-xs text-gray-600 text-center py-6">No routes planned for {date}.</div>
                  ) : (
                    routes.map((r) => (
                      <RouteCard
                        key={r.id}
                        route={r}
                        stops={routeStops.get(r.id) ?? []}
                        stopLookup={stopLookup}
                        selectedSoId={selectedStop?.so_id ?? null}
                        onSelectStop={(s) => setSelectedStop(selectedStop?.so_id === s.so_id ? null : s)}
                        onRemoveStop={removeStopFromRoute}
                        onDeleteRoute={deleteRoute}
                      />
                    ))
                  )}
                  {/* Create route form */}
                  {showNewRoute ? (
                    <div className="rounded-lg border border-cyan-700 bg-gray-900 p-3 mt-2 space-y-2">
                      <div className="text-xs font-semibold text-cyan-400">New Route</div>
                      <input
                        type="text" placeholder="Route name *" value={newRoute.route_name}
                        onChange={(e) => setNewRoute((r) => ({ ...r, route_name: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
                      />
                      {isAdmin && (
                        <select
                          value={newRoute.branch_code}
                          onChange={(e) => setNewRoute((r) => ({ ...r, branch_code: e.target.value }))}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white"
                        >
                          <option value="">Branch *</option>
                          {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      )}
                      <input
                        type="text" placeholder="Driver name" value={newRoute.driver_name}
                        onChange={(e) => setNewRoute((r) => ({ ...r, driver_name: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
                      />
                      <input
                        type="text" placeholder="Truck ID" value={newRoute.truck_id}
                        onChange={(e) => setNewRoute((r) => ({ ...r, truck_id: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={createRoute}
                          disabled={savingRoute || !newRoute.route_name.trim() || (!newRoute.branch_code && isAdmin)}
                          className="flex-1 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs rounded transition"
                        >
                          {savingRoute ? 'Creating…' : 'Create'}
                        </button>
                        <button onClick={() => setShowNewRoute(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewRoute(true)}
                      className="w-full mt-2 py-2 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500 hover:text-cyan-400 hover:border-cyan-700 transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Route
                    </button>
                  )}
                </>
              )}

              {/* All tab */}
              {leftTab === 'all' && (
                filteredAll.length === 0 ? (
                  <div className="text-xs text-gray-600 text-center py-8">No stops found.</div>
                ) : (
                  filteredAll.map((s) => (
                    <StopCard
                      key={`${s.so_id}-${s.shipment_num}`}
                      stop={s}
                      selected={selectedStop?.so_id === s.so_id}
                      onClick={() => setSelectedStop(selectedStop?.so_id === s.so_id ? null : s)}
                      routes={routes}
                      onAssign={(routeId) => assignStopToRoute(s.so_id, routeId)}
                    />
                  ))
                )
              )}
            </div>
          </div>

          {/* Center: Delivery Board */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-32 text-sm text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
              </div>
            )}
            {!loading && stops.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm text-gray-600">
                No deliveries for {date}{branch ? ` · ${branch}` : ''}.
              </div>
            )}
            {!loading && groupKeys.map((key) => (
              <div key={key} className="border-b border-gray-800">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-900/60 border-b border-gray-800 sticky top-0 z-10">
                  <span className="text-xs font-semibold text-gray-300">
                    {key}
                    <span className="ml-2 font-normal text-gray-600">
                      ({grouped[key].length} stop{grouped[key].length !== 1 ? 's' : ''})
                    </span>
                  </span>
                  <div className="flex gap-1.5">
                    {['S', 'D', 'I'].map((flag) => {
                      const cnt = grouped[key].filter((d) => d.status_flag?.toUpperCase() === flag).length;
                      if (!cnt) return null;
                      return <span key={flag} className="flex items-center gap-0.5">{statusBadge(flag)}<span className="text-[10px] text-gray-600">{cnt}</span></span>;
                    })}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {grouped[key].map((d) => {
                      const isSelected = selectedStop?.so_id === d.so_id;
                      return (
                        <tr
                          key={`${d.so_id}-${d.shipment_num}`}
                          onClick={() => setSelectedStop(isSelected ? null : d)}
                          className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-cyan-900/20 border-l-2 border-l-cyan-500' : 'hover:bg-gray-800/30'
                          }`}
                        >
                          <td className="px-3 py-2.5 w-4">
                            {isSelected
                              ? <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                              : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                          </td>
                          <td className="px-2 py-2.5 font-mono text-cyan-400 whitespace-nowrap text-xs w-24">
                            {d.so_id}
                            {d.shipment_num > 1 && <span className="text-gray-600 ml-1">#{d.shipment_num}</span>}
                          </td>
                          <td className="px-2 py-2.5 max-w-[180px]">
                            <div className="text-sm text-gray-200 truncate">{d.customer_name ?? '—'}</div>
                            {d.reference && <div className="text-xs text-gray-500 truncate">{d.reference}</div>}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-gray-400 max-w-[140px]">
                            <div className="truncate">{d.city ?? d.address_1 ?? '—'}</div>
                          </td>
                          <td className="px-2 py-2.5">{statusBadge(d.status_flag)}</td>
                          <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                            {d.driver ?? d.route_id_char ?? '—'}
                          </td>
                          {isAdmin && <td className="px-2 py-2.5 text-xs text-gray-600">{d.system_id}</td>}
                          <td className="px-2 py-2.5 text-xs whitespace-nowrap">
                            {d.ar_balance != null && d.ar_balance > 0
                              ? <span className="text-red-400 font-medium">{fmtMoney(d.ar_balance)}</span>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                            {d.loaded_date
                              ? `${new Date(d.loaded_date).toLocaleDateString()}${d.loaded_time ? ' ' + d.loaded_time : ''}`
                              : fmtDate(d.expect_date)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Right: Detail Panel (slides in) */}
          {selectedStop && (
            <div className="w-96 shrink-0 overflow-hidden">
              <DetailPanel stop={selectedStop} onClose={() => setSelectedStop(null)} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
