import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../../db/supabase';

type Params = Promise<{ id: string; stopId: string }>;

// PATCH /api/dispatch/routes/[id]/stops/[stopId]
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id, stopId } = await params;
  const routeId = parseInt(id, 10);
  const stopRowId = parseInt(stopId, 10);

  if (isNaN(routeId) || isNaN(stopRowId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json() as {
    time_window_start?: string | null;
    time_window_end?: string | null;
    eta_minutes?: number | null;
    notes?: string | null;
    bay_number?: string | null;
    wc_notified_at?: string | null;
    status?: string | null;
  };

  try {
    const sql = getErpSql();
    await sql`
      UPDATE dispatch_route_stops SET
        time_window_start = COALESCE(${body.time_window_start ?? null}, time_window_start),
        time_window_end   = COALESCE(${body.time_window_end ?? null}, time_window_end),
        eta_minutes       = COALESCE(${body.eta_minutes ?? null}::integer, eta_minutes),
        notes             = COALESCE(${body.notes ?? null}, notes),
        bay_number        = COALESCE(${body.bay_number ?? null}, bay_number),
        wc_notified_at    = COALESCE(${body.wc_notified_at ?? null}::timestamptz, wc_notified_at),
        status            = COALESCE(${body.status ?? null}, status)
      WHERE id = ${stopRowId} AND route_id = ${routeId}
    `;
    return NextResponse.json({ updated: true });
  } catch (err) {
    console.error('[dispatch/routes/[id]/stops/[stopId] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/dispatch/routes/[id]/stops/[stopId]
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id, stopId } = await params;
  const routeId = parseInt(id, 10);
  const stopRowId = parseInt(stopId, 10);

  if (isNaN(routeId) || isNaN(stopRowId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const sql = getErpSql();
    await sql`
      DELETE FROM dispatch_route_stops
      WHERE id = ${stopRowId} AND route_id = ${routeId}
    `;
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[dispatch/routes/[id]/stops/[stopId] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
