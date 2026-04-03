'use client';

import { useState, useEffect, useCallback } from 'react';

interface KioskWorkOrder {
  wo_id: string;
  so_number: string;
  description: string | null;
  wo_status: string;
  branch_code: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  assignment_id: number | null;
  assignment_status: string | null;
  created_at: string | null;
}

interface Props {
  branch: string;
  picker: { id: number; name: string };
  onDone: () => void;
}

// Derive the effective status to show in the UI
function effectiveStatus(wo: KioskWorkOrder): string {
  return wo.assignment_status ?? wo.wo_status ?? 'Open';
}

const STATUS_BADGE: Record<string, string> = {
  Open:        'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  'In Progress': 'bg-blue-900/60 text-blue-300 border-blue-700',
  Assigned:    'bg-blue-900/60 text-blue-300 border-blue-700',
  Complete:    'bg-green-900/60 text-green-300 border-green-700',
  completed:   'bg-green-900/60 text-green-300 border-green-700',
};

export default function KioskWorkOrdersClient({ branch, picker, onDone }: Props) {
  const [workOrders, setWorkOrders] = useState<KioskWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // wo_id being acted on
  const [flash, setFlash] = useState<{ wo_id: string; message: string } | null>(null);
  const [error, setError] = useState('');

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        branch,
        picker_id: String(picker.id),
      });
      const res = await fetch(`/api/kiosk/work-orders?${params}`);
      if (!res.ok) throw new Error('Failed to load work orders');
      const data = (await res.json()) as { work_orders: KioskWorkOrder[] };
      setWorkOrders(data.work_orders ?? []);
    } catch {
      setError('Could not load work orders. Tap Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [branch, picker.id]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  async function handleAction(wo: KioskWorkOrder, action: 'start' | 'complete') {
    setActionLoading(wo.wo_id);
    setFlash(null);
    try {
      const res = await fetch('/api/kiosk/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wo_id: wo.wo_id, picker_id: picker.id, action }),
      });
      if (!res.ok) throw new Error('Action failed');

      const label = action === 'start' ? 'Started' : 'Completed';
      setFlash({ wo_id: wo.wo_id, message: `${label}!` });

      // Optimistically update the row status
      setWorkOrders((prev) =>
        prev.map((w) => {
          if (w.wo_id !== wo.wo_id) return w;
          return {
            ...w,
            assignment_status: action === 'start' ? 'In Progress' : 'Complete',
            assigned_to: picker.id,
            assigned_to_name: picker.name,
          };
        })
      );

      // Clear flash after 2 seconds
      setTimeout(() => setFlash(null), 2000);
    } catch {
      setFlash({ wo_id: wo.wo_id, message: 'Error — try again' });
      setTimeout(() => setFlash(null), 2500);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-bold text-cyan-400">Work Orders — {branch}</div>
          <div className="text-sm text-gray-400 mt-0.5">
            Logged in as <span className="text-white font-semibold">{picker.name}</span>
          </div>
        </div>
        <button
          onClick={onDone}
          className="text-sm text-gray-400 hover:text-white transition px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600"
        >
          ← Done
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-4">

        {/* Refresh button */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-300">
            {loading
              ? 'Loading…'
              : `${workOrders.length} work order${workOrders.length !== 1 ? 's' : ''}`}
          </h2>
          <button
            onClick={loadWorkOrders}
            disabled={loading}
            className="text-sm text-gray-500 hover:text-white transition disabled:opacity-40 px-3 py-1.5 bg-gray-800 rounded border border-gray-700"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && workOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="text-5xl">✓</div>
            <div className="text-xl font-semibold text-gray-300">No open work orders</div>
            <div className="text-sm text-gray-500">Nothing assigned to you at {branch} right now.</div>
          </div>
        )}

        {/* Work order list */}
        {!loading && workOrders.length > 0 && (
          <div className="space-y-3">
            {workOrders.map((wo) => {
              const status = effectiveStatus(wo);
              const isComplete =
                status.toLowerCase() === 'complete' || status.toLowerCase() === 'completed';
              const isInProgress = status.toLowerCase() === 'in progress' || status.toLowerCase() === 'assigned';
              const isActing = actionLoading === wo.wo_id;
              const woFlash = flash?.wo_id === wo.wo_id ? flash.message : null;

              return (
                <div
                  key={wo.wo_id}
                  className={`bg-gray-900 border rounded-xl p-4 space-y-3 transition ${
                    isComplete
                      ? 'border-green-800 opacity-70'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {/* WO info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-lg font-bold text-cyan-300">
                          WO {wo.wo_id}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            STATUS_BADGE[status] ?? 'bg-gray-800 text-gray-400 border-gray-600'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-0.5">
                        SO <span className="font-mono text-gray-300">{wo.so_number}</span>
                      </div>
                      {wo.description && (
                        <div className="text-sm text-gray-300 mt-1 leading-snug">
                          {wo.description}
                        </div>
                      )}
                      {wo.assigned_to_name && wo.assigned_to !== picker.id && (
                        <div className="text-xs text-blue-400 mt-1">
                          Assigned to {wo.assigned_to_name}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Flash message */}
                  {woFlash && (
                    <div className="text-sm font-semibold text-green-400 text-center py-1">
                      {woFlash}
                    </div>
                  )}

                  {/* Action buttons */}
                  {!isComplete && (
                    <div className="flex gap-3">
                      {!isInProgress && (
                        <button
                          onClick={() => handleAction(wo, 'start')}
                          disabled={isActing}
                          className="flex-1 py-4 bg-blue-700 hover:bg-blue-600 active:scale-95 disabled:opacity-50 rounded-xl text-lg font-bold text-white transition"
                        >
                          {isActing ? '…' : 'Start'}
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(wo, 'complete')}
                        disabled={isActing}
                        className="flex-1 py-4 bg-green-700 hover:bg-green-600 active:scale-95 disabled:opacity-50 rounded-xl text-lg font-bold text-white transition"
                      >
                        {isActing ? '…' : 'Complete'}
                      </button>
                    </div>
                  )}

                  {isComplete && (
                    <div className="text-center text-sm text-green-500 font-medium py-1">
                      Done
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
