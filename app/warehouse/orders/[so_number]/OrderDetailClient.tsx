'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Ticket, User } from 'lucide-react';
import type {
  WarehouseOrderDetail,
  WarehouseOrderHeader,
  WarehouseOrderLine,
  WarehouseOrderPick,
  WarehouseOrderAssignedPicker,
} from '../../../api/warehouse/orders/[so_number]/route';

const SO_STATUS: Record<string, { label: string; color: string }> = {
  O: { label: 'Open',      color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  K: { label: 'Picking',   color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700' },
  S: { label: 'Staged',    color: 'bg-orange-900/60 text-orange-300 border-orange-700' },
  D: { label: 'Delivered', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  I: { label: 'Invoiced',  color: 'bg-green-900/60 text-green-300 border-green-700' },
  C: { label: 'Closed',    color: 'bg-gray-800/80 text-gray-400 border-gray-600' },
  P: { label: 'Picked',    color: 'bg-indigo-900/60 text-indigo-300 border-indigo-700' },
};

const PRINT_STATUS: Record<string, { label: string; color: string }> = {
  'PICK TICKET': { label: 'Pick Ticket', color: 'text-yellow-300' },
  'REPRINT':     { label: 'Reprint',     color: 'text-orange-300' },
  'CLOSED':      { label: 'Closed',      color: 'text-gray-400' },
};

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
}

function money(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  soNumber: string;
}

export default function OrderDetailClient({ soNumber }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<WarehouseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/warehouse/orders/${encodeURIComponent(soNumber)}`);
      if (res.status === 404) { setError('Order not found.'); return; }
      if (!res.ok) throw new Error('Failed to load');
      setDetail(await res.json() as WarehouseOrderDetail);
    } catch {
      setError('Failed to load order details.');
    } finally {
      setLoading(false);
    }
  }, [soNumber]);

  useEffect(() => { load(); }, [load]);

  const h: WarehouseOrderHeader | undefined = detail?.header;
  const statusInfo = h?.so_status
    ? (SO_STATUS[(h.so_status).toUpperCase()] ?? { label: h.so_status, color: 'bg-gray-800/80 text-gray-400 border-gray-600' })
    : null;

  const lineTotal = (detail?.lines ?? []).reduce((sum, l: WarehouseOrderLine) => {
    if (l.unit_price != null && l.qty_ordered != null) return sum + l.unit_price * l.qty_ordered;
    return sum;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {loading && (
          <div className="text-gray-500 text-sm py-16 text-center">Loading…</div>
        )}
        {error && (
          <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {detail && h && (
          <>
            {/* ── Header card ─────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap gap-3 items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold font-mono text-cyan-400">
                      SO {h.so_id}
                    </h1>
                    {statusInfo && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    )}
                    {h.sale_type && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded border bg-gray-800/60 text-gray-400 border-gray-600">
                        {h.sale_type}
                      </span>
                    )}
                  </div>
                  <div className="text-lg text-gray-200 mt-0.5">
                    {h.cust_name ?? '—'}
                    {h.cust_code && (
                      <span className="ml-2 text-sm text-gray-500 font-mono">{h.cust_code}</span>
                    )}
                  </div>
                  {h.reference && (
                    <div className="text-sm text-gray-400 mt-0.5">Ref: {h.reference}</div>
                  )}
                </div>

                {/* Assigned picker badge */}
                <div className="flex flex-col items-end gap-1">
                  {detail.assigned_picker ? (
                    <AssignedPickerBadge picker={detail.assigned_picker} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 border border-gray-700 rounded px-2 py-1">
                      <User size={12} />
                      No picker assigned
                    </span>
                  )}
                </div>
              </div>

              {/* Details row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm border-t border-gray-800 pt-4">
                <div>
                  <div className="text-xs text-gray-500 font-semibold tracking-wide">EXPECT DATE</div>
                  <div className="text-gray-200">{fmt(h.expect_date)}</div>
                </div>
                {(h.shipto_name || h.shipto_addr1) && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 font-semibold tracking-wide">SHIP TO</div>
                    <div className="text-gray-200">
                      {h.shipto_name && <div>{h.shipto_name}</div>}
                      {h.shipto_addr1 && <div>{h.shipto_addr1}</div>}
                      {(h.shipto_city || h.shipto_state) && (
                        <div>{[h.shipto_city, h.shipto_state].filter(Boolean).join(', ')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Line items ──────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <Package size={15} className="text-cyan-500" />
                  Line Items ({detail.lines.length})
                </span>
                {lineTotal > 0 && (
                  <span className="text-sm text-gray-400">
                    Est. Total: <span className="text-cyan-300 font-semibold">${money(lineTotal)}</span>
                  </span>
                )}
              </div>

              {detail.lines.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">No line items found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-800 bg-gray-900/60">
                        <th className="px-4 py-2 text-left font-medium w-10">#</th>
                        <th className="px-4 py-2 text-left font-medium">Item Code</th>
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-4 py-2 text-right font-medium">Ordered</th>
                        <th className="px-4 py-2 text-right font-medium">Shipped</th>
                        <th className="px-4 py-2 text-right font-medium">Unit Price</th>
                        <th className="px-4 py-2 text-left font-medium">Handling</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line: WarehouseOrderLine, idx: number) => {
                        const remaining =
                          line.qty_ordered != null && line.qty_shipped != null
                            ? line.qty_ordered - line.qty_shipped
                            : null;
                        return (
                          <tr
                            key={line.so_line_id ?? idx}
                            className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-xs text-gray-500">{line.sequence ?? idx + 1}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-cyan-300 whitespace-nowrap">
                              {line.item_code ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-200 max-w-[260px]">
                              <div className="truncate">{line.description ?? '—'}</div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-200">
                              {line.qty_ordered != null ? line.qty_ordered.toLocaleString() : '—'}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono text-xs ${
                              remaining != null && remaining > 0 ? 'text-yellow-400' : 'text-gray-400'
                            }`}>
                              {line.qty_shipped != null ? line.qty_shipped.toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-300">
                              {line.unit_price != null ? `$${money(line.unit_price)}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-400">
                              {line.handling_code ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {lineTotal > 0 && (
                      <tfoot>
                        <tr className="border-t border-gray-700 bg-gray-800/40">
                          <td colSpan={6} className="px-4 py-2.5 text-xs text-gray-400 text-right font-semibold">
                            ESTIMATED TOTAL
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-cyan-300 font-semibold">
                            ${money(lineTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* ── Pick tickets ────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <Ticket size={15} className="text-cyan-500" />
                  Pick Tickets ({detail.picks.length})
                </span>
              </div>

              {detail.picks.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No pick tickets found for this order.</div>
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {detail.picks.map((pick: WarehouseOrderPick, idx: number) => {
                    const statusKey = pick.print_status?.toUpperCase() ?? '';
                    const ps = PRINT_STATUS[statusKey] ?? { label: pick.print_status ?? '—', color: 'text-gray-400' };
                    return (
                      <div
                        key={`${pick.tran_id}-${idx}`}
                        className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-gray-300">{pick.tran_id}</span>
                          <span className={`text-xs font-medium ${ps.color}`}>{ps.label}</span>
                        </div>
                        <span className="text-xs text-gray-500">{fmt(pick.created_date)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssignedPickerBadge({ picker }: { picker: WarehouseOrderAssignedPicker }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-cyan-900/40 text-cyan-300 border border-cyan-700 rounded px-2 py-1">
      <User size={12} />
      {picker.picker_name}
    </span>
  );
}
