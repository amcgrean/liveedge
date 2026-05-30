import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { requireSessionOrMobile } from '../../../../src/lib/mobile-auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/dispatch/routes?date=2026-04-02&branch=20GR[&include=stops]
//
// Accepts either a NextAuth cookie session (web) or a Bearer JWT (mobile).
// Pass `include=stops` to embed each route's stops with customer/address —
// the mobile driver app uses this to render its route list in one fetch.
export async function GET(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const branchParam = searchParams.get('branch') ?? '';
  const includeStops = searchParams.get('include') === 'stops';

  const isAdmin = hasCapability(session, 'branch.all');
  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');
  const routeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  try {
    const sql = getErpSql();

    type RouteRow = {
      id: number;
      route_date: string;
      route_name: string;
      branch_code: string;
      driver_name: string | null;
      truck_id: string | null;
      status: string | null;
      notes: string | null;
      stop_count: number;
    };

    const branchFilter = effectiveBranch
      ? sql`AND r.branch_code = ${effectiveBranch}`
      : sql``;

    const rows = await sql<RouteRow[]>`
      SELECT r.id, r.route_date::text, r.route_name, r.branch_code,
             r.driver_name, r.truck_id, r.status, r.notes,
             COUNT(s.id)::int AS stop_count
      FROM dispatch_routes r
      LEFT JOIN dispatch_route_stops s ON s.route_id = r.id
      WHERE r.route_date = ${routeDate}::date
        ${branchFilter}
      GROUP BY r.id
      ORDER BY r.branch_code, r.route_name
    `;

    if (!includeStops) {
      return NextResponse.json(rows);
    }

    if (rows.length === 0) {
      return NextResponse.json({ routes: [] });
    }

    type StopRow = {
      route_id: number;
      id: number;
      so_id: string;
      shipment_num: number;
      sequence: number;
      status: string;
      notes: string | null;
      customer_name: string | null;
      cust_code: string | null;
      address_1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      reference: string | null;
      ship_via: string | null;
      so_status: string | null;
    };

    const routeIds = rows.map((r) => r.id);
    // Note: we join on h.system_id = r.branch_code by computing the branch per
    // stop's parent route; expressed as an IN on the route ids + a self-join
    // back to dispatch_routes for branch.
    const stops = await sql<StopRow[]>`
      SELECT
        s.route_id, s.id, s.so_id, s.shipment_num, s.sequence, s.status, s.notes,
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
      JOIN dispatch_routes r ON r.id = s.route_id
      LEFT JOIN agility_so_header h ON h.so_id = s.so_id AND h.system_id = r.branch_code
      WHERE s.route_id = ANY(${routeIds})
      ORDER BY s.route_id, s.sequence, s.id
    `;

    const stopsByRoute = new Map<number, Omit<StopRow, 'route_id'>[]>();
    for (const s of stops) {
      const { route_id, ...rest } = s;
      if (!stopsByRoute.has(route_id)) stopsByRoute.set(route_id, []);
      stopsByRoute.get(route_id)!.push(rest);
    }

    return NextResponse.json({
      routes: rows.map((r) => ({ ...r, stops: stopsByRoute.get(r.id) ?? [] })),
    });
  } catch (err) {
    console.error('[dispatch/routes GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/dispatch/routes
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as {
    route_date?: string;
    route_code?: string;
    route_name?: string;
    branch_code?: string;
    driver_name?: string;
    truck_id?: string;
    notes?: string;
  };

  const { route_date, route_name, branch_code } = body;
  if (!route_name?.trim() || !branch_code?.trim()) {
    return NextResponse.json({ error: 'route_name and branch_code are required' }, { status: 400 });
  }

  const date = route_date && /^\d{4}-\d{2}-\d{2}$/.test(route_date)
    ? route_date
    : new Date().toISOString().slice(0, 10);

  try {
    const sql = getErpSql();
    type InsertRow = { id: number };
    const [row] = await sql<InsertRow[]>`
      INSERT INTO dispatch_routes (route_date, route_code, route_name, branch_code, driver_name, truck_id, notes, status, created_at, updated_at)
      VALUES (${date}::date, ${body.route_code?.trim() || null}, ${route_name.trim()}, ${branch_code.trim()},
              ${body.driver_name?.trim() || null}, ${body.truck_id?.trim() || null},
              ${body.notes?.trim() || null}, 'planned', NOW(), NOW())
      RETURNING id
    `;
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[dispatch/routes POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
