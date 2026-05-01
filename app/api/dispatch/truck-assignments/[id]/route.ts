import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// PATCH /api/dispatch/truck-assignments/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const assignId = parseInt(id, 10);
  if (isNaN(assignId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json() as {
    driver_id?: number | null;
    route_id?: number | null;
    notes?: string;
    samsara_vehicle_name?: string;
  };

  try {
    const sql = getErpSql();

    const updates: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if ('driver_id' in body) { updates.push(`driver_id = $${idx++}`); vals.push(body.driver_id ?? null); }
    if ('route_id' in body) { updates.push(`route_id = $${idx++}`); vals.push(body.route_id ?? null); }
    if (body.notes !== undefined) { updates.push(`notes = $${idx++}`); vals.push(body.notes.trim() || null); }
    if (body.samsara_vehicle_name !== undefined) { updates.push(`samsara_vehicle_name = $${idx++}`); vals.push(body.samsara_vehicle_name.trim() || null); }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    updates.push(`updated_at = NOW()`);

    const rows = await sql.unsafe(
      `UPDATE dispatch_truck_assignments SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, assignment_date::text, branch_code, samsara_vehicle_id,
                 samsara_vehicle_name, driver_id, route_id, notes`,
      [...vals, assignId] as never[]
    );

    if (!rows[0]) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('[dispatch/truck-assignments PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/dispatch/truck-assignments/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const assignId = parseInt(id, 10);
  if (isNaN(assignId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();
    const rows = await sql`DELETE FROM dispatch_truck_assignments WHERE id = ${assignId} RETURNING id`;
    if (!rows[0]) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dispatch/truck-assignments DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
