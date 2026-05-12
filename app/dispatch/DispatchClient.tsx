'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { TopNav } from '../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import type { DeliveryStop } from '../api/dispatch/deliveries/route';
import type { DispatchKpis } from '../api/dispatch/kpis/route';
import type { DispatchInitResponse } from '../api/dispatch/init/route';
import type { OrderLine } from '../api/dispatch/orders/[so_number]/lines/route';
import Link from 'next/link';
import {
  X, ChevronDown, ChevronRight, ChevronUp, Truck, AlertCircle,
  MapPin, Map as MapIcon, LayoutList, User, Plus, Trash2, RefreshCw, Search, Package, MessageSquare, Send, Camera, Phone, GripVertical,
  Pencil, Clock, Bell,
} from 'lucide-react';

// Leaflet requires browser APIs — load without SSR
const DispatchMap = dynamic(
  () => import('../../src/components/dispatch/DispatchMap').then((m) => m.DispatchMap),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-sm text-gray-500">Loading map…</div> }
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface DispatchRoute {
  id: number; route_date: string; route_name: string; branch_code: string;
  driver_name: string | null; truck_id: string | null;
  status: string | null; notes: string | null; stop_count: number;
}

interface RouteStop {
  id: number; route_id: number; so_id: string;
  shipment_num: number; sequence: number; status: string | null; notes: string | null;
  time_window_start: string | null; time_window_end: string | null;
  eta_minutes: number | null; bay_number: string | null; wc_notified_at: string | null;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

const PICKER_HUE: string[] = [
  '#4a8fbf', '#1f8a4f', '#c9a83f', '#d05050', '#8b5cf6',
  '#e07b39', '#2ab7b7', '#c45bab', '#6e7d89', '#a3b54a',
];

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

function parseLocalDate(iso: string | null): Date | null {
  if (!iso) return null;
  const s = iso.split('T')[0]; // strip time component if present
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function fmtExpectDate(iso: string | null): string {
  const d = parseLocalDate(iso);
  if (!d) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function expectDateColor(iso: string | null): string {
  const d = parseLocalDate(iso);
  if (!d) return 'var(--text-3)';
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return '#4ec48a';
  if (d.getTime() === tomorrow.getTime()) return '#d4a23a';
  if (d < today) return '#d05050';
  return 'var(--text-3)';
}

const MAX_STOPS_PER_ROUTE = 12;

function isOverdue(stop: DeliveryStop): boolean {
  const sf = stop.status_flag?.toUpperCase();
  const ss = stop.so_status?.toUpperCase();
  if (sf === 'D' || ss === 'D' || sf === 'I' || ss === 'I') return false;
  const d = parseLocalDate(stop.expect_date);
  if (!d) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return d < today;
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

  const isDelivered = stop.status_flag?.toUpperCase() === 'D' || stop.so_status?.toUpperCase() === 'D';
  const overdue = isOverdue(stop);

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-2.5 cursor-pointer transition-all mb-1.5 ${
        selected
          ? 'border-cyan-500 bg-cyan-900/20'
          : isDelivered
          ? 'border-gray-700 bg-gray-900/50 opacity-60 hover:opacity-80'
          : overdue
          ? 'border-red-700 bg-red-950/20 hover:border-red-600'
          : 'border-gray-700 bg-gray-900 hover:border-gray-600'
      }`}
      style={overdue && !selected ? { borderLeftWidth: 3, borderLeftColor: '#d05050' } : undefined}
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
          {overdue
            ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#5c1a1a', color: '#f87171', letterSpacing: '0.05em' }}>OVERDUE</span>
            : statusBadge(stop.status_flag)
          }
          {stop.expect_date && (
            <span className="text-[9px] font-mono" style={{ color: expectDateColor(stop.expect_date) }}>
              {fmtExpectDate(stop.expect_date)}
            </span>
          )}
          {stop.driver_stop_status === 'delivered' && (
            <span className="text-[9px] text-green-400 font-medium">✓ Driver confirmed</span>
          )}
          {stop.driver_stop_status === 'skipped' && (
            <span className="text-[9px] text-yellow-400 font-medium">⚠ Skipped</span>
          )}
        </div>
      </div>
      {(stop.ship_via || stop.reference) && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {stop.ship_via && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-400">
              {stop.ship_via}
            </span>
          )}
          {stop.reference && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800/60 text-gray-400 truncate max-w-[120px]" title={stop.reference}>
              {stop.reference}
            </span>
          )}
        </div>
      )}
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


// ── Order Lines Section ────────────────────────────────────────────────────────

function OrderLinesSection({ lines, loading }: { lines: OrderLine[] | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-gray-700 shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Order Lines</div>
        <div className="text-xs text-gray-600">Loading lines…</div>
      </div>
    );
  }
  if (!lines || lines.length === 0) return null;

  const shortCount = lines.filter(
    (l) => l.qty_ordered != null && l.qty_ordered > 0 && (l.qty_on_hand ?? Infinity) <= 0
  ).length;

  return (
    <div className="border-b border-gray-700 shrink-0">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">Order Lines</span>
        <span className="text-[10px] font-mono text-gray-600">({lines.length})</span>
        {shortCount > 0 && (
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: '#d4a23a', background: 'rgba(212,162,58,0.12)', border: '1px solid rgba(212,162,58,0.4)' }}>
            {shortCount} short / awaiting PO
          </span>
        )}
      </div>
      <div className="px-4 pb-3">
        <div className="rounded border border-gray-700 overflow-hidden text-xs font-mono">
          {/* header */}
          <div className="grid text-[9.5px] uppercase tracking-wider text-gray-500 font-sans font-semibold"
            style={{ gridTemplateColumns: '44px 40px 1fr', gap: '6px', padding: '5px 8px', background: 'var(--panel-2)', borderBottom: '1px solid var(--line)' }}>
            <div className="text-right">Qty</div>
            <div>UOM</div>
            <div>Item · Description</div>
          </div>
          {lines.map((l, i) => {
            const isShort = (l.qty_on_hand ?? Infinity) <= 0 && (l.qty_ordered ?? 0) > 0;
            const isReturn = (l.qty_ordered ?? 0) < 0;
            return (
              <div key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '44px 40px 1fr', gap: '6px',
                  padding: '6px 8px',
                  borderBottom: i === lines.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  background: isShort ? 'rgba(212,162,58,0.06)' : 'transparent',
                  alignItems: 'baseline',
                }}
              >
                <div className="text-right font-semibold" style={{ color: isReturn || isShort ? '#d4a23a' : 'var(--text)' }}>
                  {l.qty_ordered}
                </div>
                <div className="text-gray-400">{l.uom ?? '—'}</div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-cyan-400 font-semibold">{l.item_code ?? '—'}</span>
                    {isShort && (
                      <span className="font-sans text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded"
                        style={{ color: '#d4a23a', background: 'rgba(212,162,58,0.16)', border: '1px solid rgba(212,162,58,0.45)' }}>
                        0 avail · special order
                      </span>
                    )}
                    {isReturn && (
                      <span className="font-sans text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded"
                        style={{ color: '#d4a23a', background: 'rgba(212,162,58,0.16)', border: '1px solid rgba(212,162,58,0.45)' }}>
                        return
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 text-[10.5px] mt-0.5 font-sans">
                    {l.description ?? ''}{l.size ? ` ${l.size}` : ''}
                  </div>
                  {isShort && (
                    <div className="text-[10px] text-gray-600 mt-0.5 font-sans">
                      On hand <span className="font-mono text-red-400">0</span> · awaiting PO receipt
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ stop, routeStop, onClose }: { stop: DeliveryStop; routeStop: RouteStop | null; onClose: () => void }) {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [lines, setLines] = useState<OrderLine[] | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  // ERP action state
  const [pickFileId, setPickFileId] = useState<string | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickError, setPickError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');

  useEffect(() => {
    setTimeline(null); setLines(null);
    setPickFileId(null); setPickError(''); setNoteText(''); setShowNoteForm(false); setNoteError(''); setNoteSuccess('');
  }, [stop.so_id]);

  const handleReleasePick = async () => {
    setPickLoading(true);
    setPickError('');
    try {
      const res = await fetch(`/api/warehouse/orders/${encodeURIComponent(stop.so_id)}/release-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchCode: stop.system_id }),
      });
      const data = await res.json();
      if (!res.ok) { setPickError(data.error ?? 'Failed to create pick file'); return; }
      setPickFileId(data.pickFileId ?? 'Created');
    } catch {
      setPickError('Network error');
    } finally {
      setPickLoading(false);
    }
  };

  const handleSendNote = async () => {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    setNoteError('');
    setNoteSuccess('');
    try {
      const res = await fetch(`/api/sales/orders/${encodeURIComponent(stop.so_id)}/push-to-erp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', branchCode: stop.system_id, message: noteText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setNoteError(data.error ?? 'Failed to add note'); return; }
      setNoteSuccess('Note added to order in Agility');
      setNoteText('');
      setShowNoteForm(false);
    } catch {
      setNoteError('Network error');
    } finally {
      setNoteLoading(false);
    }
  };

  useEffect(() => {
    if (timeline) return;
    setLoadingTimeline(true);
    fetch(`/api/dispatch/orders/${encodeURIComponent(stop.so_id)}/timeline`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTimeline(d))
      .catch(() => {})
      .finally(() => setLoadingTimeline(false));
  }, [stop.so_id, timeline]);

  useEffect(() => {
    if (lines) return;
    setLoadingLines(true);
    const branch = stop.system_id ? `?branch=${encodeURIComponent(stop.system_id)}` : '';
    fetch(`/api/dispatch/orders/${encodeURIComponent(stop.so_id)}/lines${branch}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setLines(d?.lines ?? []))
      .catch(() => {})
      .finally(() => setLoadingLines(false));
  }, [stop.so_id, stop.system_id, lines]);

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
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {[stop.address_1, stop.city].filter(Boolean).join(', ') || '—'}
            </div>
            {stop.cust_phone && (
              <a href={`tel:${stop.cust_phone}`} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition">
                <Phone className="w-3 h-3" />{stop.cust_phone}
              </a>
            )}
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
        </dl>
      </div>

      {/* Route stop details */}
      {routeStop && (routeStop.time_window_start || routeStop.time_window_end || routeStop.bay_number || routeStop.notes || routeStop.wc_notified_at) && (
        <div className="px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Stop Details</div>
          <dl className="space-y-1 text-xs">
            {(routeStop.time_window_start || routeStop.time_window_end) && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-gray-400">Window</span>
                <span className="text-gray-200 ml-auto">
                  {[routeStop.time_window_start, routeStop.time_window_end].filter(Boolean).join(' – ')}
                </span>
              </div>
            )}
            {routeStop.bay_number && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 w-16">Bay</span>
                <span className="text-gray-200 ml-auto font-mono">{routeStop.bay_number}</span>
              </div>
            )}
            {routeStop.wc_notified_at && (
              <div className="flex items-center gap-1.5">
                <Bell className="w-3 h-3 text-yellow-400 shrink-0" />
                <span className="text-gray-400">Will-call</span>
                <span className="text-yellow-300 ml-auto text-[10px]">
                  Called {new Date(routeStop.wc_notified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            {routeStop.notes && (
              <div className="pt-0.5">
                <div className="text-gray-500 mb-0.5">Notes</div>
                <div className="text-gray-300 text-[11px] leading-snug bg-gray-800 rounded px-2 py-1.5">{routeStop.notes}</div>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* ERP Actions */}
      <div className="px-4 py-3 border-b border-gray-700 shrink-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Open POD capture — always available */}
          <Link
            href={`/dispatch/pod/${encodeURIComponent(stop.so_id)}?branch=${stop.system_id}&shipment=${stop.shipment_num}&customer=${encodeURIComponent(stop.customer_name ?? '')}`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-900/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 rounded text-xs font-medium transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            Open POD
          </Link>
        </div>
        <div className="flex gap-2">
          {/* Release to Pick — only for pickable statuses */}
          {['K', 'P', 'S'].includes((stop.status_flag ?? '').toUpperCase()) && (
            pickFileId ? (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <Package className="w-3.5 h-3.5" />
                Pick file {pickFileId} created
              </div>
            ) : (
              <button
                onClick={handleReleasePick}
                disabled={pickLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/40 hover:bg-amber-900/60 disabled:opacity-50 text-amber-300 border border-amber-700/50 rounded text-xs font-medium transition-colors"
              >
                <Package className="w-3.5 h-3.5" />
                {pickLoading ? 'Releasing…' : 'Release to Pick'}
              </button>
            )
          )}

          {/* Add Note */}
          <button
            onClick={() => { setShowNoteForm((v) => !v); setNoteError(''); setNoteSuccess(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-600 rounded text-xs transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Add Note
          </button>
        </div>

        {pickError && (
          <div className="text-[11px] text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" /> {pickError}
          </div>
        )}
        {noteSuccess && (
          <div className="text-[11px] text-green-400">{noteSuccess}</div>
        )}
        {noteError && (
          <div className="text-[11px] text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" /> {noteError}
          </div>
        )}

        {showNoteForm && (
          <div className="space-y-1.5">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Note to add to this order in Agility..."
              rows={2}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-cyan-500 resize-none"
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleSendNote}
                disabled={noteLoading || !noteText.trim()}
                className="flex items-center gap-1 px-3 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
              >
                <Send className="w-3 h-3" />
                {noteLoading ? 'Sending…' : 'Send'}
              </button>
              <button
                onClick={() => { setShowNoteForm(false); setNoteText(''); }}
                className="px-2 py-1 text-gray-500 hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order lines — always visible below Actions */}
      <OrderLinesSection lines={lines} loading={loadingLines} />

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Activity</div>
        {loadingTimeline ? (
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
        )}
      </div>
    </div>
  );
}


// ── Routes Drawer ─────────────────────────────────────────────────────────────

function StopInlineEditor({
  rs, routeId, onSaved,
}: {
  rs: RouteStop;
  routeId: number;
  onSaved: (updated: Partial<RouteStop>) => void;
}) {
  const [twStart, setTwStart] = useState(rs.time_window_start ?? '');
  const [twEnd, setTwEnd] = useState(rs.time_window_end ?? '');
  const [notes, setNotes] = useState(rs.notes ?? '');
  const [bay, setBay] = useState(rs.bay_number ?? '');
  const [saving, setSaving] = useState(false);
  const [markingWc, setMarkingWc] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = {
        time_window_start: twStart.trim() || null,
        time_window_end: twEnd.trim() || null,
        notes: notes.trim() || null,
        bay_number: bay.trim() || null,
      };
      await fetch(`/api/dispatch/routes/${routeId}/stops/${rs.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onSaved(body);
    } finally {
      setSaving(false);
    }
  }

  async function markCalled() {
    setMarkingWc(true);
    try {
      const wc = new Date().toISOString();
      await fetch(`/api/dispatch/routes/${routeId}/stops/${rs.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wc_notified_at: wc }),
      });
      onSaved({ wc_notified_at: wc });
    } finally {
      setMarkingWc(false);
    }
  }

  return (
    <div
      className="mt-1 rounded p-2 space-y-1.5 text-[10px]"
      style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
    >
      {/* Time window */}
      <div className="flex items-center gap-1">
        <Clock className="w-2.5 h-2.5 shrink-0" style={{ color: 'var(--text-4)' }} />
        <input
          value={twStart}
          onChange={(e) => setTwStart(e.target.value)}
          placeholder="Start (e.g. 8:00 AM)"
          className="flex-1 bg-transparent border-b px-0.5 py-0.5 text-[10px] outline-none focus:border-cyan-500"
          style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
        />
        <span style={{ color: 'var(--text-4)' }}>–</span>
        <input
          value={twEnd}
          onChange={(e) => setTwEnd(e.target.value)}
          placeholder="End"
          className="flex-1 bg-transparent border-b px-0.5 py-0.5 text-[10px] outline-none focus:border-cyan-500"
          style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
        />
      </div>
      {/* Bay + notes row */}
      <div className="flex items-center gap-1">
        <span style={{ color: 'var(--text-4)' }}>Bay</span>
        <input
          value={bay}
          onChange={(e) => setBay(e.target.value)}
          placeholder="—"
          className="w-12 bg-transparent border-b px-0.5 py-0.5 text-[10px] outline-none focus:border-cyan-500 text-center"
          style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Stop notes…"
        rows={2}
        className="w-full bg-transparent border rounded px-1.5 py-1 text-[10px] outline-none resize-none focus:border-cyan-500"
        style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={save}
          disabled={saving}
          className="px-2 py-0.5 rounded text-[10px] font-medium transition disabled:opacity-50"
          style={{ background: 'var(--green-bright)', color: '#000' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {rs.wc_notified_at ? (
          <span className="flex items-center gap-0.5" style={{ color: '#4ec48a' }}>
            <Bell className="w-2.5 h-2.5" /> Called {new Date(rs.wc_notified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : (
          <button
            onClick={markCalled}
            disabled={markingWc}
            className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] transition disabled:opacity-50"
            style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid #92400e', color: '#fbbf24' }}
          >
            <Bell className="w-2.5 h-2.5" /> {markingWc ? '…' : 'Mark Called'}
          </button>
        )}
      </div>
    </div>
  );
}

function RoutesDrawer({
  routes, routeStops, stopLookup, unassignedStops, selectedSoId,
  onSelectStop, onAssignStop, onRemoveStop, onDeleteRoute, onUpdateStop, onClose,
}: {
  routes: DispatchRoute[];
  routeStops: Map<number, RouteStop[]>;
  stopLookup: Map<string, DeliveryStop>;
  unassignedStops: DeliveryStop[];
  selectedSoId: string | null;
  onSelectStop: (s: DeliveryStop) => void;
  onAssignStop: (soId: string, routeId: number) => Promise<void>;
  onRemoveStop: (routeId: number, stopRowId: number) => Promise<void>;
  onDeleteRoute: (routeId: number) => Promise<void>;
  onUpdateStop: (routeId: number, stopId: number, patch: Partial<RouteStop>) => void;
  onClose: () => void;
}) {
  const [dragSoId, setDragSoId] = useState<string | null>(null);
  const [dragOverRouteId, setDragOverRouteId] = useState<number | null>(null);
  const [dragOverUnassigned, setDragOverUnassigned] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<number | null>(null);

  function onDragStart(e: React.DragEvent, soId: string) {
    setDragSoId(soId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', soId);
  }

  async function onDropRoute(e: React.DragEvent, routeId: number) {
    e.preventDefault();
    setDragOverRouteId(null);
    const soId = dragSoId ?? e.dataTransfer.getData('text/plain');
    if (!soId || assigning) return;
    // Already on this route?
    const existing = routeStops.get(routeId) ?? [];
    if (existing.some((rs) => rs.so_id === soId)) return;
    setAssigning(true);
    await onAssignStop(soId, routeId);
    setAssigning(false);
    setDragSoId(null);
  }

  async function onDropUnassigned(e: React.DragEvent, routeId: number, stopRowId: number) {
    e.preventDefault();
    setDragOverUnassigned(false);
    if (assigning) return;
    setAssigning(true);
    await onRemoveStop(routeId, stopRowId);
    setAssigning(false);
    setDragSoId(null);
  }

  const assignedSoIds = new Set(
    Array.from(routeStops.values()).flat().map((rs) => rs.so_id)
  );

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      />
      {/* panel — wider to fit unassigned column + routes */}
      <aside
        className="absolute top-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden"
        style={{
          width: '82%', minWidth: 860, maxWidth: 1400,
          background: 'var(--panel)', borderRight: '1px solid var(--line)',
          boxShadow: '8px 0 32px rgba(0,0,0,0.45)',
        }}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
          <Truck className="w-4 h-4" style={{ color: 'var(--green-bright)' }} />
          <h2 className="text-sm font-semibold m-0">Routes &amp; Stops</h2>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-3)' }}>
            {routes.length} routes · {routes.reduce((n, r) => n + r.stop_count, 0)} assigned · {unassignedStops.length} unassigned
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--panel-2)', color: 'var(--text-4)', border: '1px solid var(--line)' }}>
            Drag stops into routes
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition"
            style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text-2)' }}
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>

        {/* two-panel body: unassigned pool | route columns */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Unassigned pool ── */}
          <div
            className="flex flex-col overflow-hidden shrink-0"
            style={{ width: 240, borderRight: '1px solid var(--line)', background: 'var(--bg)' }}
            onDragOver={(e) => { e.preventDefault(); setDragOverUnassigned(true); }}
            onDragLeave={() => setDragOverUnassigned(false)}
          >
            <div className="px-3 py-2 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Unassigned</span>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded" style={{ background: 'var(--panel-2)', color: 'var(--text-3)' }}>
                {unassignedStops.length}
              </span>
            </div>
            <div
              className="flex-1 overflow-y-auto p-2 space-y-1 transition-colors"
              style={{ background: dragOverUnassigned ? 'rgba(255,255,255,0.03)' : undefined }}
            >
              {unassignedStops.length === 0 ? (
                <div className="text-[10px] text-center py-8" style={{ color: 'var(--text-4)' }}>All stops assigned</div>
              ) : (
                unassignedStops.map((stop) => {
                  const overdue = isOverdue(stop);
                  const isDragging = dragSoId === stop.so_id;
                  return (
                    <div
                      key={stop.so_id}
                      draggable
                      onDragStart={(e) => onDragStart(e, stop.so_id)}
                      onDragEnd={() => setDragSoId(null)}
                      onClick={() => onSelectStop(stop)}
                      className="rounded p-2 cursor-grab active:cursor-grabbing transition select-none"
                      style={{
                        opacity: isDragging ? 0.4 : 1,
                        background: stop.so_id === selectedSoId ? 'rgba(31,138,79,0.08)' : 'var(--panel)',
                        border: `1px solid ${stop.so_id === selectedSoId ? 'var(--green-bright)' : overdue ? '#7f1d1d' : 'var(--line)'}`,
                        borderLeft: overdue ? '3px solid #d05050' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <GripVertical className="w-3 h-3 shrink-0" style={{ color: 'var(--text-4)' }} />
                        <span className="text-[10px] font-mono" style={{ color: '#4ec48a' }}>{stop.so_id}</span>
                        {overdue
                          ? <span className="text-[8px] font-bold px-1 rounded ml-auto" style={{ background: '#5c1a1a', color: '#f87171' }}>LATE</span>
                          : statusBadge(stop.status_flag)
                        }
                      </div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-2)' }}>{stop.customer_name ?? '—'}</div>
                      {stop.city && <div className="text-[9px]" style={{ color: 'var(--text-4)' }}>{stop.city}</div>}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Route columns ── */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
            <div className="flex gap-3 h-full" style={{ minWidth: 'min-content', alignItems: 'flex-start' }}>
              {routes.length === 0 ? (
                <div className="flex items-center justify-center w-full h-32 text-sm" style={{ color: 'var(--text-3)' }}>
                  No routes planned — create one from the toolbar.
                </div>
              ) : (
                routes.map((route, idx) => {
                  const rStops = routeStops.get(route.id) ?? [];
                  const routeColor = PICKER_HUE[idx % PICKER_HUE.length];
                  const loadPct = Math.min(100, Math.round((rStops.length / MAX_STOPS_PER_ROUTE) * 100));
                  const barColor = loadPct >= 90 ? '#d05050' : loadPct >= 70 ? '#d4a23a' : '#4ec48a';
                  const overdueCount = rStops.filter(rs => {
                    const del = stopLookup.get(rs.so_id);
                    return del ? isOverdue(del) : false;
                  }).length;
                  const isDropTarget = dragOverRouteId === route.id;
                  return (
                    <div
                      key={route.id}
                      className="flex-shrink-0 flex flex-col rounded-lg overflow-hidden transition-shadow"
                      style={{
                        width: 260,
                        background: 'var(--panel-2)',
                        border: `1px solid ${isDropTarget ? routeColor : 'var(--line)'}`,
                        borderTop: `3px solid ${routeColor}`,
                        maxHeight: 'calc(100vh - 160px)',
                        boxShadow: isDropTarget ? `0 0 0 2px ${routeColor}44` : undefined,
                      }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverRouteId(route.id); }}
                      onDragLeave={() => setDragOverRouteId(null)}
                      onDrop={(e) => onDropRoute(e, route.id)}
                    >
                      <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate" style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                              {route.route_name}
                            </div>
                            {route.driver_name && (
                              <div className="text-[10px] mt-0.5 truncate flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                                <User className="w-2.5 h-2.5" /> {route.driver_name}
                                {route.truck_id ? ` · ${route.truck_id}` : ''}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {overdueCount > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#5c1a1a', color: '#f87171' }}>
                                {overdueCount} late
                              </span>
                            )}
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete route "${route.route_name}"?`)) return;
                                await onDeleteRoute(route.id);
                              }}
                              style={{ color: 'var(--text-4)' }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {/* load bar */}
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>{rStops.length} / {MAX_STOPS_PER_ROUTE} stops</span>
                            <span className="text-[9px] font-mono" style={{ color: barColor }}>{loadPct}%</span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${loadPct}%`, background: barColor }} />
                          </div>
                        </div>
                      </div>

                      {/* drop zone hint when dragging */}
                      {isDropTarget && dragSoId && !rStops.some(rs => rs.so_id === dragSoId) && (
                        <div className="mx-2 mt-2 rounded text-center text-[10px] py-2 pointer-events-none" style={{ border: `1px dashed ${routeColor}`, color: routeColor }}>
                          Drop to add
                        </div>
                      )}

                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {rStops.length === 0 ? (
                          <div className="text-[10px] text-center py-6" style={{ color: 'var(--text-4)' }}>
                            {dragSoId ? '↑ Drop here' : 'No stops assigned'}
                          </div>
                        ) : (
                          rStops.map((rs, stopIdx) => {
                            const del = stopLookup.get(rs.so_id);
                            const isSelected = rs.so_id === selectedSoId;
                            const isExpanded = expandedStopId === rs.id;
                            const hasWindow = rs.time_window_start || rs.time_window_end;
                            return (
                              <div
                                key={rs.id}
                                className="flex items-start gap-1.5"
                                draggable={!isExpanded}
                                onDragStart={(e) => { if (!isExpanded) onDragStart(e, rs.so_id); }}
                                onDragEnd={() => setDragSoId(null)}
                                onDrop={(e) => { e.stopPropagation(); onDropUnassigned(e, route.id, rs.id); }}
                              >
                                <div className="flex flex-col items-center gap-0.5 pt-2 shrink-0">
                                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-4)', fontWeight: 600 }}>{stopIdx + 1}</span>
                                  <GripVertical className="w-3 h-3 cursor-grab" style={{ color: 'var(--text-4)' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {del ? (
                                    <>
                                      <div
                                        onClick={() => onSelectStop(del)}
                                        className="rounded p-2 cursor-pointer transition"
                                        style={{
                                          background: isSelected ? 'rgba(31,138,79,0.08)' : 'var(--panel)',
                                          border: `1px solid ${isSelected ? 'var(--green-bright)' : 'var(--line)'}`,
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                          <span className="text-[10px] font-mono" style={{ color: '#4ec48a' }}>{rs.so_id}</span>
                                          <div className="flex items-center gap-1">
                                            {rs.wc_notified_at && <Bell className="w-2.5 h-2.5" style={{ color: '#fbbf24' }} />}
                                            {statusBadge(del.status_flag)}
                                          </div>
                                        </div>
                                        <div className="text-[10px] truncate" style={{ color: 'var(--text-2)' }}>{del.customer_name ?? '—'}</div>
                                        {del.city && <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{del.city}</div>}
                                        {(hasWindow || rs.bay_number) && (
                                          <div className="flex items-center gap-2 mt-0.5 text-[9px]" style={{ color: 'var(--text-4)' }}>
                                            {hasWindow && (
                                              <span className="flex items-center gap-0.5">
                                                <Clock className="w-2 h-2" />
                                                {[rs.time_window_start, rs.time_window_end].filter(Boolean).join('–')}
                                              </span>
                                            )}
                                            {rs.bay_number && <span>Bay {rs.bay_number}</span>}
                                          </div>
                                        )}
                                      </div>
                                      {isExpanded && (
                                        <StopInlineEditor
                                          rs={rs}
                                          routeId={route.id}
                                          onSaved={(patch) => {
                                            onUpdateStop(route.id, rs.id, patch);
                                            setExpandedStopId(null);
                                          }}
                                        />
                                      )}
                                    </>
                                  ) : (
                                    <div className="text-[10px] p-2 rounded" style={{ background: 'var(--panel)', color: 'var(--text-4)' }}>{rs.so_id}</div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1 mt-2 shrink-0">
                                  {del && (
                                    <button
                                      onClick={() => setExpandedStopId(isExpanded ? null : rs.id)}
                                      title="Edit stop details"
                                      style={{ color: isExpanded ? 'var(--green-bright)' : 'var(--text-4)' }}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => { await onRemoveStop(route.id, rs.id); }}
                                    style={{ color: 'var(--text-4)' }}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Board View (5-column card grid) ───────────────────────────────────────────

function BoardCardGrid({
  stops, selectedSoId, onSelectStop, sortKey, groupKey,
}: {
  stops: DeliveryStop[];
  selectedSoId: string | null;
  onSelectStop: (s: DeliveryStop) => void;
  sortKey: string;
  groupKey: string;
}) {
  const groups = React.useMemo(() => {
    if (groupKey === 'none') return [{ key: null, label: null, items: stops }];
    const map = new Map<string, DeliveryStop[]>();
    stops.forEach((s) => {
      const k = groupKey === 'city' ? (s.city ?? '—') : (s.expect_date ?? '—');
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    });
    return [...map.entries()]
      .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
      .map(([k, items]) => ({
        key: k,
        label: groupKey === 'city' ? k : (k === '—' ? 'No date' : fmtDate(k) + ' · ' + k),
        items,
      }));
  }, [stops, groupKey]);

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
      {groups.map((g, gi) => (
        <div key={g.key ?? gi} style={{ marginBottom: 20 }}>
          {g.label && (
            <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
              {groupKey === 'city' ? <MapPin className="w-3 h-3" style={{ color: 'var(--text-3)' }} /> : <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-3)' }} />}
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>{g.label}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>{g.items.length}</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
            {g.items.map((s) => (
              <StopCard
                key={`${s.so_id}-${s.shipment_num}`}
                stop={s}
                selected={s.so_id === selectedSoId}
                onClick={() => onSelectStop(s)}
                routes={[]}
                onAssign={async () => {}}
              />
            ))}
          </div>
        </div>
      ))}
      {stops.length === 0 && (
        <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-3)' }}>
          No stops match your filters.
        </div>
      )}
    </div>
  );
}

// ── Main DispatchClient ────────────────────────────────────────────────────────

export default function DispatchClient({ isAdmin, userBranch, userName, userRole }: Props) {
  usePageTracking();
  const today = new Date().toISOString().slice(0, 10);

  // Filters
  const [date, setDate] = useState(today);
  const [branch, setBranch] = useBranchFilter(isAdmin, userBranch);
  const [search, setSearch] = useState('');
  const [shipViaFilter, setShipViaFilter] = useState<Set<string>>(new Set());
  const [shipViaOpen, setShipViaOpen] = useState(false);
  const shipViaRef = useRef<HTMLDivElement>(null);
  const [hideWillCall, setHideWillCall] = useState(true);

  // Data
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [kpis, setKpis] = useState<DispatchKpis | null>(null);
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [routeStops, setRouteStops] = useState<Map<number, RouteStop[]>>(new Map());
  const [trucks, setTrucks] = useState<TruckAssignment[]>([]);

  // UI state
  const [selectedStop, setSelectedStop] = useState<DeliveryStop | null>(null);
  const [showTrucks, setShowTrucks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState<'route' | 'status' | 'branch'>('route');
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ route_code: '', route_name: '', branch_code: userBranch ?? '', driver_name: '', truck_id: '' });
  const [savingRoute, setSavingRoute] = useState(false);
  const [erpRoutes, setErpRoutes] = useState<Array<{ route_code: string; driver_name: string; assigned_truck_id: string | null; assigned_truck_name: string | null }>>([]);
  const [erpRoutesLoaded, setErpRoutesLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'map'>('map');
  const [sortKey, setSortKey] = useState<'so' | 'date' | 'city'>('so');
  const [groupKey, setGroupKey] = useState<'none' | 'date' | 'city'>('none');
  const [routesDrawerOpen, setRoutesDrawerOpen] = useState(false);
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);

  // Close ship-via dropdown on outside click
  useEffect(() => {
    if (!shipViaOpen) return;
    function handler(e: MouseEvent) {
      if (shipViaRef.current && !shipViaRef.current.contains(e.target as Node)) {
        setShipViaOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [shipViaOpen]);

  // Unique ship_via values present in loaded stops (for building the dropdown)
  const shipViaOptions = React.useMemo(() => {
    const set = new Set<string>();
    stops.forEach((s) => { if (s.ship_via?.trim()) set.add(s.ship_via.trim()); });
    return Array.from(set).sort();
  }, [stops]);

  // Stops after ship-via filter applied (all other derived lists use this)
  const shipViaFilteredStops = React.useMemo(() => {
    if (shipViaFilter.size === 0) return stops;
    return stops.filter((s) => shipViaFilter.has(s.ship_via?.trim() ?? ''));
  }, [stops, shipViaFilter]);

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

  // Fast lookup: so_id → most recent RouteStop (for DetailPanel)
  const routeStopLookup = React.useMemo(() => {
    const m = new Map<string, RouteStop>();
    routeStops.forEach((rsList) => rsList.forEach((rs) => m.set(rs.so_id, rs)));
    return m;
  }, [routeStops]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/dispatch/init?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load dispatch data');
      const data = await res.json() as DispatchInitResponse;

      setStops(data.deliveries);
      setKpis(data.kpis);
      setRoutes(data.routes);
      setTrucks(data.trucks);

      // Build routeStops Map from the flat stops array
      const map = new Map<number, RouteStop[]>();
      for (const s of data.routeStops) {
        const arr = map.get(s.route_id) ?? [];
        arr.push(s);
        map.set(s.route_id, arr);
      }
      setRouteStops(map);
    } catch {
      setError('Failed to load dispatch data.');
    } finally {
      setLoading(false);
    }
  }, [date, branch]);

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

  // Optimistic local update after PATCH /routes/[id]/stops/[stopId]
  function updateRouteStop(routeId: number, stopId: number, patch: Partial<RouteStop>) {
    setRouteStops((prev) => {
      const next = new Map(prev);
      const list = next.get(routeId) ?? [];
      next.set(routeId, list.map((rs) => rs.id === stopId ? { ...rs, ...patch } : rs));
      return next;
    });
  }

  // Load ERP delivery routes for the route creation dropdown (called once when the panel opens)
  async function loadErpRoutes() {
    if (erpRoutesLoaded) return;
    try {
      const params = branch ? `?branch=${branch}` : '';
      const res = await fetch(`/api/dispatch/drivers${params}`);
      if (res.ok) {
        const data = await res.json() as { drivers: typeof erpRoutes; synced: boolean };
        if (data.synced) setErpRoutes(data.drivers);
      }
    } finally {
      setErpRoutesLoaded(true);
    }
  }

  function openNewRoute() {
    setShowNewRoute(true);
    loadErpRoutes();
  }

  function selectErpRoute(routeCode: string) {
    const r = erpRoutes.find((x) => x.route_code === routeCode);
    setNewRoute((prev) => ({
      ...prev,
      route_code: routeCode,
      route_name: r?.driver_name ?? routeCode,
      driver_name: r?.driver_name ?? '',
      truck_id: r?.assigned_truck_id ?? '',
    }));
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
        setNewRoute({ route_code: '', route_name: '', branch_code: userBranch ?? '', driver_name: '', truck_id: '' });
        await loadAll();
      }
    } finally {
      setSavingRoute(false);
    }
  }

  // Bulk-generate routes from ERP delv_route for the selected date/branch
  const [generating, setGenerating] = useState(false);
  async function generateRoutes() {
    if (!branch) return; // need a specific branch
    setGenerating(true);
    try {
      const res = await fetch('/api/dispatch/routes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, branch_code: branch }),
      });
      if (res.ok) await loadAll();
    } finally {
      setGenerating(false);
    }
  }

  // Delivery board grouping
  const grouped = React.useMemo(() => {
    return shipViaFilteredStops.reduce<Record<string, DeliveryStop[]>>((acc, d) => {
      let key: string;
      if (groupBy === 'route') key = d.route_id_char || '(Unrouted)';
      else if (groupBy === 'status') key = (STATUS_FLAG[d.status_flag?.toUpperCase()]?.label ?? d.status_flag) || '—';
      else key = d.system_id;
      (acc[key] ??= []).push(d);
      return acc;
    }, {});
  }, [shipViaFilteredStops, groupBy]);

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === '(Unrouted)') return 1;
    if (b === '(Unrouted)') return -1;
    return a.localeCompare(b);
  });

  // Filtered lists — invoiced orders always excluded; will call excluded by default
  const q = search.toLowerCase();
  function isWillCall(s: DeliveryStop) {
    const v = s.ship_via?.trim().toUpperCase() ?? '';
    return v === 'WC' || v === 'W/C' || v === 'WILL CALL' || v === 'WILLCALL';
  }
  const nonInvoicedStops = shipViaFilteredStops.filter(
    (s) =>
      s.status_flag?.toUpperCase() !== 'I' &&
      s.so_status?.toUpperCase() !== 'I' &&
      !(hideWillCall && isWillCall(s))
  );

  function applySort(arr: DeliveryStop[]): DeliveryStop[] {
    return [...arr].sort((a, b) => {
      if (sortKey === 'date') return (a.expect_date ?? '').localeCompare(b.expect_date ?? '') || a.so_id.localeCompare(b.so_id);
      if (sortKey === 'city') return (a.city ?? '').localeCompare(b.city ?? '') || a.so_id.localeCompare(b.so_id);
      return a.so_id.localeCompare(b.so_id);
    });
  }

  const unassignedStops = applySort(nonInvoicedStops.filter((s) => !assignedSoIds.has(s.so_id)));
  const filteredUnassigned = q
    ? unassignedStops.filter((s) =>
        s.so_id.includes(q) || s.customer_name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q))
    : unassignedStops;
  const filteredAll = q
    ? applySort(nonInvoicedStops.filter((s) =>
        s.so_id.includes(q) || s.customer_name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q)))
    : applySort(nonInvoicedStops);

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <TopNav userName={userName} userRole={userRole} />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Command Bar ── */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur">
          <div className="flex flex-wrap gap-3 items-center">
            {/* KPI tiles — Total Stops clickable to open Routes drawer */}
            <div className="flex gap-2">
              <button
                onClick={() => setRoutesDrawerOpen(true)}
                title="Open Routes & Stops"
                className={`rounded-lg px-4 py-2.5 text-center transition-colors ${
                  routesDrawerOpen
                    ? 'bg-cyan-800 border border-cyan-600'
                    : 'bg-cyan-900/40 border border-cyan-700/50 hover:bg-cyan-900/60'
                }`}
              >
                <div className="text-2xl font-bold tabular-nums text-cyan-300">{kpis?.total_stops ?? '—'}</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">Stops ↗</div>
              </button>
              <KpiTile label="Unassigned"   value={kpis?.unassigned_stops ?? null} />
              <KpiTile label="Routes"       value={kpis?.route_count ?? null} />
              {/* Live truck count from Samsara */}
              <div className="flex flex-col items-center justify-center px-3 py-1 rounded" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" style={{ color: vehicleCount != null && vehicleCount > 0 ? '#4ec48a' : 'var(--text-4)' }} />
                  <span className="text-lg font-bold tabular-nums" style={{ color: vehicleCount != null && vehicleCount > 0 ? '#4ec48a' : 'var(--text-3)' }}>
                    {vehicleCount ?? '—'}
                  </span>
                </div>
                <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-4)' }}>Live GPS</div>
              </div>
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

              {/* Ship Via multi-select */}
              <div className="relative" ref={shipViaRef}>
                <button
                  onClick={() => setShipViaOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded transition whitespace-nowrap ${
                    shipViaFilter.size > 0
                      ? 'bg-cyan-900/40 border-cyan-700 text-cyan-300'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
                  }`}
                >
                  Ship Via{shipViaFilter.size > 0 ? ` (${shipViaFilter.size})` : ''}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {shipViaOpen && (
                  <div className="absolute top-full left-0 mt-1 z-[1001] min-w-[160px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1">
                    {shipViaOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">No options</div>
                    ) : (
                      <>
                        {shipViaOptions.map((v) => (
                          <label key={v} className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shipViaFilter.has(v)}
                              onChange={() => {
                                setShipViaFilter((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(v)) next.delete(v); else next.add(v);
                                  return next;
                                });
                              }}
                              className="accent-cyan-500"
                            />
                            {v}
                          </label>
                        ))}
                        {shipViaFilter.size > 0 && (
                          <button
                            onClick={() => setShipViaFilter(new Set())}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-white border-t border-gray-800 mt-1 pt-1.5"
                          >
                            Clear filter
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Will Call toggle */}
              <button
                onClick={() => setHideWillCall((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded transition whitespace-nowrap ${
                  hideWillCall
                    ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    : 'bg-cyan-900/40 border-cyan-700 text-cyan-300'
                }`}
                title={hideWillCall ? 'Will Call orders hidden — click to show' : 'Will Call orders visible — click to hide'}
              >
                {hideWillCall ? 'WC hidden' : 'WC shown'}
              </button>

              <select
                value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white"
              >
                <option value="route">Group: Route</option>
                <option value="status">Group: Status</option>
                {isAdmin && <option value="branch">Group: Branch</option>}
              </select>

              {/* Sort + Group for cards */}
              <div className="flex items-center h-9 rounded border border-gray-700 bg-gray-800 overflow-hidden text-sm">
                <span className="px-2.5 text-[10px] uppercase tracking-wider text-gray-500 border-r border-gray-700">Sort</span>
                <select
                  value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                  className="h-full px-2 bg-transparent text-gray-300 border-none outline-none"
                >
                  <option value="so">SO #</option>
                  <option value="date">Expected date</option>
                  <option value="city">City</option>
                </select>
                <span className="w-px h-5 bg-gray-700" />
                <span className="px-2.5 text-[10px] uppercase tracking-wider text-gray-500 border-l border-gray-700">Group</span>
                <select
                  value={groupKey} onChange={(e) => setGroupKey(e.target.value as typeof groupKey)}
                  className="h-full px-2 bg-transparent border-none outline-none"
                  style={{ color: groupKey !== 'none' ? 'var(--green-bright)' : 'var(--text-3)' }}
                >
                  <option value="none">None</option>
                  <option value="date">Expected date</option>
                  <option value="city">City</option>
                </select>
              </div>

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
              <div className="flex rounded border border-gray-700 overflow-hidden">
                <button
                  onClick={() => setViewMode('board')}
                  title="Board view"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition ${
                    viewMode === 'board' ? 'bg-cyan-800 text-cyan-200' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Board</span>
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  title="Map view"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-700 transition ${
                    viewMode === 'map' ? 'bg-cyan-800 text-cyan-200' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Map</span>
                </button>
              </div>
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

        {/* ── Three-Panel Layout ── */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* Left Panel — Unassigned Pool (hidden in board mode) */}
          {viewMode === 'map' && (
          <div
            className="shrink-0 border-r flex flex-col overflow-hidden"
            style={{ width: 280, background: 'var(--bg)', borderColor: 'var(--line)' }}
          >
            {/* Header */}
            <div className="px-3 py-2.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Unassigned</span>
                {kpis && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded mono font-bold" style={{ background: 'rgba(212,162,58,0.15)', color: 'var(--gold-bright)' }}>
                    {kpis.unassigned_stops}
                  </span>
                )}
              </div>
            </div>

            {/* Unassigned stop cards */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredUnassigned.length === 0 ? (
                <div className="text-xs text-center py-8" style={{ color: 'var(--text-3)' }}>
                  {search ? 'No matches.' : 'All stops assigned.'}
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
              )}
              {/* Create route button at bottom */}
              <button
                onClick={openNewRoute}
                className="w-full mt-2 py-2 text-xs flex items-center justify-center gap-1 rounded-lg transition"
                style={{ border: '1px dashed var(--line)', color: 'var(--text-3)' }}
              >
                <Plus className="w-3.5 h-3.5" /> New Route
              </button>
              {showNewRoute && (
                <div className="rounded-lg p-3 mt-2 space-y-2" style={{ border: '1px solid var(--green-bright)', background: 'var(--panel)' }}>
                  <div className="text-xs font-semibold" style={{ color: 'var(--green-bright)' }}>New Route</div>
                  {/* ERP route dropdown (populated from delv_route when synced) */}
                  {erpRoutes.length > 0 ? (
                    <select
                      value={newRoute.route_code}
                      onChange={(e) => selectErpRoute(e.target.value)}
                      className="w-full text-xs rounded px-2 py-1.5"
                      style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    >
                      <option value="">Select route *</option>
                      {erpRoutes
                        .filter((r) => !newRoute.branch_code || r.route_code.startsWith('') /* show all; branch already filtered by API */)
                        .map((r) => (
                          <option key={r.route_code} value={r.route_code}>
                            {r.route_code} — {r.driver_name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text" placeholder="Route name *" value={newRoute.route_name}
                      onChange={(e) => setNewRoute((r) => ({ ...r, route_name: e.target.value }))}
                      className="w-full text-xs rounded px-2 py-1.5 placeholder-gray-500"
                      style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    />
                  )}
                  {isAdmin && (
                    <select
                      value={newRoute.branch_code}
                      onChange={(e) => { setNewRoute((r) => ({ ...r, branch_code: e.target.value })); setErpRoutesLoaded(false); setErpRoutes([]); }}
                      className="w-full text-xs rounded px-2 py-1.5"
                      style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    >
                      <option value="">Branch *</option>
                      {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
                  {newRoute.route_code && (
                    <div className="text-xs px-1 py-0.5 rounded" style={{ color: 'var(--text-3)' }}>
                      Driver: {newRoute.driver_name || '—'} · Truck: {newRoute.truck_id || 'unassigned'}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      onClick={createRoute}
                      disabled={savingRoute || !newRoute.route_name.trim() || (!newRoute.branch_code && isAdmin)}
                      className="flex-1 py-1.5 text-xs rounded transition disabled:opacity-40"
                      style={{ background: 'var(--green-bright)', color: '#fff' }}
                    >
                      {savingRoute ? 'Creating…' : 'Create'}
                    </button>
                    <button onClick={() => setShowNewRoute(false)} className="px-3 py-1.5 text-xs transition" style={{ color: 'var(--text-3)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )} {/* end map-mode left panel */}

          {/* Center — Map view OR 5-column Board card grid */}
          <main className="flex-1 min-w-0 relative overflow-hidden" style={{ background: 'var(--bg)' }}>
            {viewMode === 'map' ? (
              <DispatchMap
                stops={stops}
                routes={routes}
                routeStops={routeStops}
                selectedStop={selectedStop}
                onSelectStop={setSelectedStop}
                branch={branch}
                onVehicleCount={setVehicleCount}
              />
            ) : (
              <BoardCardGrid
                stops={filteredAll}
                selectedSoId={selectedStop?.so_id ?? null}
                onSelectStop={(s) => setSelectedStop(selectedStop?.so_id === s.so_id ? null : s)}
                sortKey={sortKey}
                groupKey={groupKey}
              />
            )}

            {/* Routes drawer — slides over center area */}
            {routesDrawerOpen && (
              <RoutesDrawer
                routes={routes}
                routeStops={routeStops}
                stopLookup={stopLookup}
                unassignedStops={unassignedStops}
                selectedSoId={selectedStop?.so_id ?? null}
                onSelectStop={(s) => setSelectedStop(s)}
                onAssignStop={assignStopToRoute}
                onRemoveStop={removeStopFromRoute}
                onDeleteRoute={deleteRoute}
                onUpdateStop={updateRouteStop}
                onClose={() => setRoutesDrawerOpen(false)}
              />
            )}
          </main>

          {/* Right Panel — Detail panel (board) or Mini Map + Vehicles (map) */}
          {viewMode === 'board' ? (
            /* Board mode: always-visible detail panel */
            <aside
              className="shrink-0 flex flex-col overflow-hidden"
              style={{ width: 360, background: 'var(--bg)', borderLeft: '1px solid var(--line)' }}
            >
              {selectedStop ? (
                <DetailPanel stop={selectedStop} routeStop={routeStopLookup.get(selectedStop.so_id) ?? null} onClose={() => setSelectedStop(null)} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                  <MapPin className="w-8 h-8" style={{ color: 'var(--text-4)' }} />
                  <div className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>No stop selected</div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>Click a stop card to view order details, line items, and actions.</div>
                </div>
              )}
            </aside>
          ) : (
          /* Map mode: mini map + vehicles */
          <div
            className="shrink-0 flex flex-col overflow-hidden"
            style={{ width: 320, background: 'var(--panel)', borderLeft: '1px solid var(--line)' }}
          >
            {/* Mini Iowa SVG map */}
            <div className="shrink-0 p-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  Live Map · {trucks.length} trucks
                </span>
                <a href="/delivery/map" className="text-[10px] mono transition" style={{ color: 'var(--green-bright)' }}>
                  Full map →
                </a>
              </div>
              {/* Simple Iowa SVG */}
              <svg viewBox="0 0 280 180" className="w-full rounded" style={{ background: '#0a0f13' }}>
                {/* Iowa outline (simplified polygon) */}
                <polygon
                  points="30,20 250,20 260,45 260,90 240,100 245,140 220,155 80,155 55,140 20,110 15,65 30,20"
                  fill="none"
                  stroke="#243038"
                  strokeWidth="1.5"
                />
                {/* I-80 highway line */}
                <line x1="30" y1="95" x2="255" y2="95" stroke="#1a2830" strokeWidth="2" strokeDasharray="8,4" />
                <text x="135" y="91" fill="#2d3f4c" fontSize="7" textAnchor="middle">I-80</text>
                {/* Branch pins */}
                <g>
                  {/* Fort Dodge — northwest */}
                  <rect x="68" y="42" width="8" height="8" rx="1" fill="#d05050" />
                  <text x="72" y="58" fill="#d05050" fontSize="7" textAnchor="middle">FD</text>
                  {/* Grimes — central */}
                  <rect x="138" y="75" width="8" height="8" rx="1" fill="#1f8a4f" />
                  <text x="142" y="91" fill="#1f8a4f" fontSize="7" textAnchor="middle">GR</text>
                  {/* Birchwood — east */}
                  <rect x="195" y="62" width="8" height="8" rx="1" fill="#c9a83f" />
                  <text x="199" y="78" fill="#c9a83f" fontSize="7" textAnchor="middle">BW</text>
                  {/* Coralville — southeast */}
                  <rect x="190" y="110" width="8" height="8" rx="1" fill="#6e7d89" />
                  <text x="194" y="126" fill="#6e7d89" fontSize="7" textAnchor="middle">CV</text>
                </g>
                {/* Truck markers from assignments */}
                {trucks.slice(0, 6).map((t, i) => (
                  <g key={t.id} transform={`translate(${50 + i * 35}, ${105 + (i % 2) * 15})`}>
                    <rect x="-8" y="-5" width="16" height="10" rx="2" fill="#1f8a4f" opacity="0.8" />
                    <text x="0" y="3" fill="#fff" fontSize="6" textAnchor="middle">🚚</text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Vehicle cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {trucks.length === 0 ? (
                <div className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>
                  No truck assignments for {date}.
                </div>
              ) : (
                trucks.map((t, idx) => (
                  <div
                    key={t.id}
                    className="rounded p-2.5"
                    style={{
                      background: 'var(--panel-2)',
                      border: '1px solid var(--line)',
                      borderLeft: `3px solid ${PICKER_HUE[idx % PICKER_HUE.length]}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: PICKER_HUE[idx % PICKER_HUE.length] }} />
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {t.samsara_vehicle_name ?? t.samsara_vehicle_id}
                        </span>
                      </div>
                      <span className="chip chip-prog text-[9px] shrink-0">En Route</span>
                    </div>
                    {t.driver_name && (
                      <div className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                        {t.driver_name}
                      </div>
                    )}
                    {t.route_name && (
                      <div className="text-[10px] mono mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {t.route_name}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          )} {/* end map-mode right panel */}

          {/* Map mode: stop detail overlay */}
          {viewMode === 'map' && selectedStop && (
            <div className="absolute right-0 top-0 bottom-0 w-96 z-20 shadow-2xl overflow-hidden" style={{ boxShadow: '-4px 0 20px rgba(0,0,0,0.4)' }}>
              <DetailPanel stop={selectedStop} routeStop={routeStopLookup.get(selectedStop.so_id) ?? null} onClose={() => setSelectedStop(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
