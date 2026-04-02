import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/dispatch/routes?date=2026-04-02&branch=20GR
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const branchParam = searchParams.get('branch') ?? '';

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));
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

    const rows = effectiveBranch
      ? await sql<RouteRow[]>`
          SELECT r.id, r.route_date::text, r.route_name, r.branch_code,
                 r.driver_name, r.truck_id, r.status, r.notes,
                 COUNT(s.id)::int AS stop_count
          FROM dispatch_routes r
          LEFT JOIN dispatch_route_stops s ON s.route_id = r.id
          WHERE r.route_date = ${routeDate}::date AND r.branch_code = ${effectiveBranch}
          GROUP BY r.id
          ORDER BY r.route_name
        `
      : await sql<RouteRow[]>`
          SELECT r.id, r.route_date::text, r.route_name, r.branch_code,
                 r.driver_name, r.truck_id, r.status, r.notes,
                 COUNT(s.id)::int AS stop_count
          FROM dispatch_routes r
          LEFT JOIN dispatch_route_stops s ON s.route_id = r.id
          WHERE r.route_date = ${routeDate}::date
          GROUP BY r.id
          ORDER BY r.branch_code, r.route_name
        `;

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[dispatch/routes GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/dispatch/routes
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canManage =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    route_date?: string;
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
      INSERT INTO dispatch_routes (route_date, route_name, branch_code, driver_name, truck_id, notes, status, created_at, updated_at)
      VALUES (${date}::date, ${route_name.trim()}, ${branch_code.trim()},
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
