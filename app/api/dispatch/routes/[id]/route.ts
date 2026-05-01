import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

type Params = Promise<{ id: string }>;

// PUT /api/dispatch/routes/[id] — update route fields
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const routeId = parseInt(id, 10);
  if (isNaN(routeId)) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });

  const body = await req.json() as {
    route_name?: string;
    driver_name?: string | null;
    truck_id?: string | null;
    status?: string | null;
    notes?: string | null;
  };

  try {
    const sql = getErpSql();

    type RouteRow = { id: number; route_name: string; driver_name: string | null; truck_id: string | null; status: string | null; notes: string | null };
    const [existing] = await sql<RouteRow[]>`SELECT id, route_name, driver_name, truck_id, status, notes FROM dispatch_routes WHERE id = ${routeId}`;
    if (!existing) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    const newName = body.route_name?.trim() ?? existing.route_name;
    const newDriver = 'driver_name' in body ? (body.driver_name?.trim() || null) : existing.driver_name;
    const newTruck = 'truck_id' in body ? (body.truck_id?.trim() || null) : existing.truck_id;
    const newStatus = 'status' in body ? (body.status?.trim() || null) : existing.status;
    const newNotes = 'notes' in body ? (body.notes?.trim() || null) : existing.notes;

    const [updated] = await sql<RouteRow[]>`
      UPDATE dispatch_routes
      SET route_name = ${newName},
          driver_name = ${newDriver},
          truck_id = ${newTruck},
          status = ${newStatus},
          notes = ${newNotes},
          updated_at = NOW()
      WHERE id = ${routeId}
      RETURNING id, route_name, driver_name, truck_id, status, notes
    `;

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[dispatch/routes/[id] PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/dispatch/routes/[id] — delete route and its stops
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const routeId = parseInt(id, 10);
  if (isNaN(routeId)) return NextResponse.json({ error: 'Invalid route id' }, { status: 400 });

  try {
    const sql = getErpSql();
    await sql`DELETE FROM dispatch_route_stops WHERE route_id = ${routeId}`;
    await sql`DELETE FROM dispatch_routes WHERE id = ${routeId}`;
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[dispatch/routes/[id] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
