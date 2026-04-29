import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface DispatchKpis {
  total_stops: number;
  unassigned_stops: number;
  route_count: number;
  trucks_out: number;
}

// GET /api/dispatch/kpis?date=2026-04-09&branch=20GR
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

    type StopCountRow = { total: number };
    type RouteCountRow = { count: number };
    type TruckCountRow = { count: number };

    const [stopRows, routeRows, truckRows] = await Promise.all([
      sql<StopCountRow[]>`
        SELECT COUNT(*)::int AS total
        FROM agility_so_header soh
        WHERE soh.is_deleted = false
          ${branchFilter}
          AND soh.so_status NOT IN ('C', 'X')
          AND soh.expect_date::date = ${deliveryDate}::date
      `,
      sql<RouteCountRow[]>`
        SELECT COUNT(*)::int AS count
        FROM dispatch_routes r
        WHERE r.route_date = ${deliveryDate}::date
          ${branchFilterRoutes}
      `,
      sql<TruckCountRow[]>`
        SELECT COUNT(*)::int AS count
        FROM dispatch_truck_assignments ta
        WHERE ta.assignment_date = ${deliveryDate}::date
          ${branchFilterTrucks}
      `,
    ]);

    // Unassigned = stops with no matching dispatch_route_stop for this date
    type UnassignedRow = { count: number };
    const [unassignedRows] = await sql<UnassignedRow[]>`
      SELECT COUNT(*)::int AS count
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        ${branchFilter}
        AND soh.so_status NOT IN ('C', 'X')
        AND soh.expect_date::date = ${deliveryDate}::date
        AND NOT EXISTS (
          SELECT 1
          FROM dispatch_route_stops s
          JOIN dispatch_routes r ON r.id = s.route_id
          WHERE s.so_id = soh.so_id::text
            AND r.route_date = ${deliveryDate}::date
        )
    `;

    const kpis: DispatchKpis = {
      total_stops: stopRows[0]?.total ?? 0,
      unassigned_stops: unassignedRows?.count ?? 0,
      route_count: routeRows[0]?.count ?? 0,
      trucks_out: truckRows[0]?.count ?? 0,
    };

    return NextResponse.json(kpis);
  } catch (err) {
    console.error('[dispatch/kpis GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
