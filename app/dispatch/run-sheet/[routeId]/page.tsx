import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { getErpSql } from '../../../../db/supabase';
import type { RunSheetData, RunSheetStop } from '../../../api/dispatch/routes/[id]/run-sheet/route';
import { PrintButton } from './PrintButton';

interface PageProps {
  params: Promise<{ routeId: string }>;
}

async function loadRunSheet(routeId: number): Promise<RunSheetData | null> {
  try {
    const sql = getErpSql();

    type RouteRow = {
      id: number; route_date: string; route_name: string; branch_code: string;
      driver_name: string | null; truck_id: string | null; notes: string | null;
    };

    const [route] = await sql<RouteRow[]>`
      SELECT id, route_date::text, route_name, branch_code, driver_name, truck_id, notes
      FROM dispatch_routes WHERE id = ${routeId}
    `;

    if (!route) return null;

    type StopRow = RunSheetStop;

    const stops = await sql<StopRow[]>`
      SELECT
        rs.id, rs.sequence, rs.so_id, rs.status, rs.notes,
        rs.time_window_start, rs.time_window_end, rs.bay_number, rs.wc_notified_at::text,
        COALESCE(NULLIF(TRIM(soh.cust_name), ''), ac.cust_name) AS customer_name,
        soh.cust_code,
        ac.cust_phone,
        soh.shipto_address_1 AS address_1,
        soh.shipto_city AS city,
        soh.reference,
        COALESCE(sh.ship_via, soh.ship_via) AS ship_via,
        soh.sale_type,
        soh.expect_date::text,
        COALESCE(line_counts.cnt, 0)::int AS line_count
      FROM dispatch_route_stops rs
      LEFT JOIN agility_so_header soh
        ON soh.so_id = rs.so_id::integer AND soh.is_deleted = false
      LEFT JOIN LATERAL (
        SELECT s.ship_via FROM agility_shipments s
        WHERE s.so_id = soh.so_id AND s.system_id = soh.system_id AND s.is_deleted = false
        ORDER BY s.shipment_num DESC LIMIT 1
      ) sh ON true
      LEFT JOIN LATERAL (
        SELECT ac2.cust_name, ac2.cust_phone
        FROM agility_customers ac2
        WHERE ac2.cust_key = soh.cust_key AND ac2.seq_num = soh.shipto_seq_num AND ac2.is_deleted = false
        LIMIT 1
      ) ac ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM agility_so_lines sol
        WHERE sol.so_id = soh.so_id AND sol.system_id = soh.system_id AND sol.is_deleted = false
      ) line_counts ON true
      WHERE rs.route_id = ${routeId}
      ORDER BY rs.sequence, rs.id
    `;

    return { route, stops };
  } catch {
    return null;
  }
}

export default async function RunSheetPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { routeId } = await params;
  const id = parseInt(routeId, 10);
  if (isNaN(id)) return <div className="p-8 text-gray-500">Invalid route ID.</div>;

  const data = await loadRunSheet(id);

  if (!data) {
    return <div className="p-8 text-center text-gray-500">Could not load run sheet for route {routeId}.</div>;
  }

  const { route, stops } = data;

  const fmt = (d: string | null) => {
    if (!d) return '—';
    const s = d.split('T')[0];
    return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.5in; }
          body { background: white !important; color: black !important; font-size: 11pt; }
          .no-print { display: none !important; }
          .stop-card { break-inside: avoid; }
        }
        body { font-family: system-ui, sans-serif; background: #f9fafb; }
      `}</style>

      <PrintButton routeName={route.route_name} />

      <div className="max-w-3xl mx-auto p-8">
        {/* Header */}
        <div className="mb-6 pb-4 border-b-2 border-gray-800">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{route.route_name}</h1>
              <p className="text-gray-600 mt-0.5">{fmt(route.route_date)} · {route.branch_code}</p>
            </div>
            <div className="text-right text-sm text-gray-600 space-y-0.5">
              {route.driver_name && <p><span className="font-semibold">Driver:</span> {route.driver_name}</p>}
              {route.truck_id && <p><span className="font-semibold">Truck:</span> {route.truck_id}</p>}
              <p><span className="font-semibold">Stops:</span> {stops.length}</p>
            </div>
          </div>
          {route.notes && (
            <p className="mt-3 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              <span className="font-semibold">Route notes:</span> {route.notes}
            </p>
          )}
        </div>

        {/* Stops */}
        <div className="space-y-4">
          {stops.map((stop, idx) => (
            <div
              key={stop.id}
              className="stop-card border border-gray-300 rounded-lg overflow-hidden"
              style={{ breakInside: 'avoid' }}
            >
              {/* Stop header */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800 text-white">
                <span className="text-lg font-bold w-7 text-center shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">{stop.customer_name ?? stop.so_id}</span>
                  {stop.cust_code && <span className="ml-2 text-gray-400 text-xs">#{stop.cust_code}</span>}
                </div>
                <span className="font-mono text-xs text-gray-300 shrink-0">{stop.so_id}</span>
                {stop.sale_type === 'Credit' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-black shrink-0">RETURN</span>
                )}
              </div>

              {/* Stop body */}
              <div className="px-4 py-3 bg-white grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block">Address</span>
                  <span className="font-medium">{[stop.address_1, stop.city].filter(Boolean).join(', ') || '—'}</span>
                </div>
                {stop.cust_phone && (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block">Phone</span>
                    <span>{stop.cust_phone}</span>
                  </div>
                )}
                {(stop.time_window_start || stop.time_window_end) && (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block">Time Window</span>
                    <span className="font-medium">{[stop.time_window_start, stop.time_window_end].filter(Boolean).join(' – ')}</span>
                  </div>
                )}
                {stop.bay_number && (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block">Bay / Dock</span>
                    <span className="font-medium">{stop.bay_number}</span>
                  </div>
                )}
                {stop.reference && (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block">PO / Reference</span>
                    <span>{stop.reference}</span>
                  </div>
                )}
                {stop.ship_via && (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block">Ship Via</span>
                    <span className="uppercase">{stop.ship_via}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block">Lines</span>
                  <span>{stop.line_count} item{stop.line_count !== 1 ? 's' : ''}</span>
                </div>
                {stop.wc_notified_at && (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block">Will-Call</span>
                    <span className="text-amber-700 font-medium">
                      Called {new Date(stop.wc_notified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>

              {stop.notes && (
                <div className="px-4 pb-3 bg-white border-t border-gray-100">
                  <span className="text-gray-500 text-xs uppercase tracking-wide">Notes: </span>
                  <span className="text-sm">{stop.notes}</span>
                </div>
              )}

              {/* Signature line */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-end gap-8">
                <div className="flex-1">
                  <div className="border-b border-gray-400 h-8 mb-1" />
                  <span className="text-xs text-gray-400">Received by (print name)</span>
                </div>
                <div className="flex-1">
                  <div className="border-b border-gray-400 h-8 mb-1" />
                  <span className="text-xs text-gray-400">Signature</span>
                </div>
                <div className="w-24">
                  <div className="border-b border-gray-400 h-8 mb-1" />
                  <span className="text-xs text-gray-400">Time</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {stops.length === 0 && (
          <div className="text-center py-12 text-gray-400">No stops on this route.</div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-xs text-gray-400 flex justify-between">
          <span>Beisser LiveEdge — {route.route_name} — {fmt(route.route_date)}</span>
          <span>Printed {new Date().toLocaleString()}</span>
        </div>
      </div>
    </>
  );
}
