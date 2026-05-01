import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../../db/supabase';

type Params = Promise<{ id: string; stopId: string }>;

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
