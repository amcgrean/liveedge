import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../db/supabase';

type Params = Promise<{ id: string }>;

export interface RunSheetStop {
  id: number;
  sequence: number;
  so_id: string;
  status: string | null;
  notes: string | null;
  time_window_start: string | null;
  time_window_end: string | null;
  bay_number: string | null;
  wc_notified_at: string | null;
  // From agility_so_header / agility_customers
  customer_name: string | null;
  cust_code: string | null;
  cust_phone: string | null;
  address_1: string | null;
  city: string | null;
  reference: string | null;
  ship_via: string | null;
  sale_type: string | null;
  expect_date: string | null;
  // Order lines summary (item count)
  line_count: number;
}

export interface RunSheetData {
  route: {
    id: number;
    route_date: string;
    route_name: string;
    branch_code: string;
    driver_name: string | null;
    truck_id: string | null;
    notes: string | null;
  };
  stops: RunSheetStop[];
}

// GET /api/dispatch/routes/[id]/run-sheet
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const routeId = parseInt(id, 10);
  if (isNaN(routeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

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

    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    type StopRow = {
      id: number; sequence: number; so_id: string; status: string | null;
      notes: string | null; time_window_start: string | null; time_window_end: string | null;
      bay_number: string | null; wc_notified_at: string | null;
      customer_name: string | null; cust_code: string | null; cust_phone: string | null;
      address_1: string | null; city: string | null; reference: string | null;
      ship_via: string | null; sale_type: string | null; expect_date: string | null;
      line_count: number;
    };

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

    const result: RunSheetData = { route, stops };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[dispatch/routes/[id]/run-sheet GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
