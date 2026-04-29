import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';
import type { DeliveryStop } from '../deliveries/route';
import type { DispatchKpis } from '../kpis/route';

export interface DispatchRoute {
  id: number;
  route_date: string;
  route_name: string;
  branch_code: string;
  driver_name: string | null;
  truck_id: string | null;
  status: string | null;
  notes: string | null;
  stop_count: number;
}

export interface RouteStop {
  id: number;
  route_id: number;
  so_id: string;
  shipment_num: number;
  sequence: number;
  status: string | null;
  notes: string | null;
}

export interface TruckAssignment {
  id: number;
  assignment_date: string;
  branch_code: string;
  samsara_vehicle_id: string;
  samsara_vehicle_name: string | null;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  route_id: number | null;
  route_name: string | null;
  notes: string | null;
}

export interface DispatchInitResponse {
  deliveries: DeliveryStop[];
  routes: DispatchRoute[];
  routeStops: RouteStop[];
  trucks: TruckAssignment[];
  kpis: DispatchKpis;
}

// GET /api/dispatch/init?date=2026-04-24&branch=20GR
// Single endpoint replacing the 4 parallel calls + N route-stop calls on page load.
// All queries run sequentially on one DB connection.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const branchParam = searchParams.get('branch') ?? '';

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch'].includes(r));
  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');
  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  try {
    const sql = getErpSql();

    const branchFilter = effectiveBranch ? sql`AND soh.system_id = ${effectiveBranch}` : sql``;
    const branchFilterRoutes = effectiveBranch ? sql`AND r.branch_code = ${effectiveBranch}` : sql``;
    const branchFilterTrucks = effectiveBranch ? sql`AND ta.branch_code = ${effectiveBranch}` : sql``;

    // ── Query 1: Deliveries (no LATERAL for driver_stop_status — computed from route stops below) ──
    type DeliveryRow = {
      so_id: string;
      shipment_num: number;
      system_id: string;
      ship_date: string | null;
      status_flag: string | null;
      so_status: string | null;
      route_id_char: string | null;
      driver: string | null;
      ship_via: string | null;
      loaded_date: string | null;
      loaded_time: string | null;
      reference: string | null;
      sale_type: string | null;
      cust_name: string | null;
      cust_code: string | null;
      address_1: string | null;
      city: string | null;
      expect_date: string | null;
      lat: string | null;
      lon: string | null;
    };

    const deliveryRows = await sql<DeliveryRow[]>`
      SELECT
        soh.so_id::text, soh.system_id,
        COALESCE(sh.shipment_num, 0)              AS shipment_num,
        sh.ship_date::text,
        COALESCE(sh.status_flag, soh.so_status)   AS status_flag,
        soh.so_status,
        sh.route_id_char, sh.driver,
        COALESCE(sh.ship_via, soh.ship_via)        AS ship_via,
        sh.loaded_date::text, sh.loaded_time,
        soh.reference, soh.sale_type,
        soh.cust_name, soh.cust_code,
        soh.shipto_address_1 AS address_1, soh.shipto_city AS city,
        soh.expect_date::text,
        ac.lat::text, ac.lon::text
      FROM agility_so_header soh
      LEFT JOIN LATERAL (
        SELECT *
        FROM agility_shipments s
        WHERE s.system_id = soh.system_id
          AND s.so_id = soh.so_id
          AND s.is_deleted = false
        ORDER BY s.shipment_num DESC
        LIMIT 1
      ) sh ON true
      LEFT JOIN agility_customers ac
        ON ac.cust_key = soh.cust_key
        AND ac.seq_num = soh.shipto_seq_num
        AND ac.is_deleted = false
      WHERE soh.is_deleted = false
        ${branchFilter}
        AND soh.so_status NOT IN ('C', 'X')
        AND soh.expect_date::date = ${deliveryDate}::date
      ORDER BY soh.system_id, soh.so_id
    `;

    // ── Query 2: Routes with stop counts ──
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

    const routeRows = await sql<RouteRow[]>`
      SELECT r.id, r.route_date::text, r.route_name, r.branch_code,
             r.driver_name, r.truck_id, r.status, r.notes,
             COUNT(s.id)::int AS stop_count
      FROM dispatch_routes r
      LEFT JOIN dispatch_route_stops s ON s.route_id = r.id
      WHERE r.route_date = ${deliveryDate}::date
        ${branchFilterRoutes}
      GROUP BY r.id
      ORDER BY r.branch_code, r.route_name
    `;

    // ── Query 3: All route stops for today in one query (replaces N per-route fetches) ──
    type StopRow = {
      id: number;
      route_id: number;
      so_id: string;
      shipment_num: number;
      sequence: number;
      status: string | null;
      notes: string | null;
    };

    const routeIds = routeRows.map((r) => r.id);
    const allRouteStops = routeIds.length > 0
      ? await sql<StopRow[]>`
          SELECT s.id, s.route_id, s.so_id, s.shipment_num, s.sequence, s.status, s.notes
          FROM dispatch_route_stops s
          WHERE s.route_id = ANY(${routeIds})
          ORDER BY s.route_id, s.sequence, s.id
        `
      : ([] as StopRow[]);

    // ── Query 4: Truck assignments ──
    type TruckRow = {
      id: number;
      assignment_date: string;
      branch_code: string;
      samsara_vehicle_id: string;
      samsara_vehicle_name: string | null;
      driver_id: number | null;
      driver_name: string | null;
      driver_phone: string | null;
      route_id: number | null;
      route_name: string | null;
      notes: string | null;
    };

    const truckRows = await sql<TruckRow[]>`
      SELECT
        ta.id, ta.assignment_date::text, ta.branch_code,
        ta.samsara_vehicle_id, ta.samsara_vehicle_name,
        ta.driver_id, dd.name AS driver_name, dd.phone AS driver_phone,
        ta.route_id, dr.route_name, ta.notes
      FROM dispatch_truck_assignments ta
      LEFT JOIN dispatch_drivers dd ON dd.id = ta.driver_id
      LEFT JOIN dispatch_routes dr ON dr.id = ta.route_id
      WHERE ta.assignment_date = ${deliveryDate}::date
        ${branchFilterTrucks}
      ORDER BY ta.branch_code, ta.samsara_vehicle_name
    `;

    // ── Build driver stop status map from route stops (avoids per-row LATERAL) ──
    const stopStatusMap = new Map<string, { id: number; status: string | null }>();
    for (const s of allRouteStops) {
      // Later entries (higher id) win — same logic as ORDER BY id DESC LIMIT 1 in the old LATERAL
      const existing = stopStatusMap.get(s.so_id);
      if (!existing || s.id > existing.id) {
        stopStatusMap.set(s.so_id, { id: s.id, status: s.status });
      }
    }

    // ── Merge driver stop status into deliveries ──
    const deliveries: DeliveryStop[] = deliveryRows.map((r) => {
      const drs = stopStatusMap.get(r.so_id);
      return {
        so_id: r.so_id,
        shipment_num: r.shipment_num,
        system_id: r.system_id,
        ship_date: r.ship_date ?? '',
        status_flag: r.status_flag ?? '',
        so_status: r.so_status?.trim() || null,
        route_id_char: r.route_id_char?.trim() || null,
        driver: r.driver?.trim() || null,
        ship_via: r.ship_via?.trim() || null,
        loaded_date: r.loaded_date,
        loaded_time: r.loaded_time?.trim() || null,
        reference: r.reference?.trim() || null,
        sale_type: r.sale_type?.trim() || null,
        customer_name: r.cust_name?.trim() || null,
        cust_code: r.cust_code?.trim() || null,
        address_1: r.address_1?.trim() || null,
        city: r.city?.trim() || null,
        expect_date: r.expect_date,
        lat: r.lat != null ? parseFloat(r.lat) : null,
        lon: r.lon != null ? parseFloat(r.lon) : null,
        driver_stop_status: (drs?.status as 'pending' | 'delivered' | 'skipped' | null) ?? null,
        driver_stop_id: drs?.id ?? null,
      };
    });

    // ── Compute KPIs from already-fetched data (no extra DB query) ──
    const assignedSoIds = new Set(stopStatusMap.keys());
    const kpis: DispatchKpis = {
      total_stops: deliveries.length,
      unassigned_stops: deliveries.filter((d) => !assignedSoIds.has(d.so_id)).length,
      route_count: routeRows.length,
      trucks_out: truckRows.length,
    };

    const result: DispatchInitResponse = {
      deliveries,
      routes: routeRows,
      routeStops: allRouteStops,
      trucks: truckRows,
      kpis,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[dispatch/init GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
