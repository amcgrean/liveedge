import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getErpSql } from '../../../../../../db/supabase';

type Params = Promise<{ id: string }>;

/**
 * GET /api/dispatch/routes/[id]/details
 *
 * Returns route header + stops enriched with customer/address from agility_so_header.
 * Used by the driver app to show the full stop list for a route.
 */
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const routeId = parseInt(id, 10);
  if (isNaN(routeId)) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });

  try {
    const sql = getErpSql();

    type RouteRow = {
      id: number; route_date: string; route_name: string; branch_code: string;
      driver_name: string | null; truck_id: string | null; status: string | null; notes: string | null;
    };
    const [route] = await sql<RouteRow[]>`
      SELECT id, route_date::text, route_name, branch_code, driver_name, truck_id, status, notes
      FROM dispatch_routes WHERE id = ${routeId}
    `;
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    type StopRow = {
      id: number; so_id: string; shipment_num: number; sequence: number;
      status: string; notes: string | null;
      customer_name: string | null; cust_code: string | null;
      address_1: string | null; city: string | null; state: string | null; zip: string | null;
      reference: string | null; ship_via: string | null; so_status: string | null;
    };
    const stops = await sql<StopRow[]>`
      SELECT
        s.id, s.so_id, s.shipment_num, s.sequence, s.status, s.notes,
        h.cust_name   AS customer_name,
        h.cust_code,
        h.shipto_address_1 AS address_1,
        h.shipto_city      AS city,
        h.shipto_state     AS state,
        h.shipto_zip       AS zip,
        h.reference,
        h.ship_via,
        h.so_status
      FROM dispatch_route_stops s
      LEFT JOIN agility_so_header h ON h.so_id = s.so_id AND h.system_id = ${route.branch_code}
      WHERE s.route_id = ${routeId}
      ORDER BY s.sequence, s.id
    `;

    return NextResponse.json({ route, stops });
  } catch (err) {
    console.error('[dispatch/routes/[id]/details GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
