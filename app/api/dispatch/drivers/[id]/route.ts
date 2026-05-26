import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// PATCH /api/dispatch/drivers/[id]
// Updates truck assignment fields. Name and branch come from ERP (delv_route) and are not editable here.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const driverId = parseInt(id, 10);
  if (isNaN(driverId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json() as {
    truck_id?: string;
    truck_name?: string;
    phone?: string;
    notes?: string;
    is_active?: boolean;
    clocked_in?: boolean;
    on_route_id?: number | null;
  };

  try {
    const sql = getErpSql();

    const updates: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.truck_id !== undefined) { updates.push(`default_truck_id = $${idx++}`); vals.push(body.truck_id.trim() || null); }
    if (body.truck_name !== undefined) { updates.push(`name = $${idx++}`); vals.push(body.truck_name.trim() || null); }
    if (body.phone !== undefined) { updates.push(`phone = $${idx++}`); vals.push(body.phone.trim() || null); }
    if (body.notes !== undefined) { updates.push(`notes = $${idx++}`); vals.push(body.notes.trim() || null); }
    if (body.is_active !== undefined) { updates.push(`is_active = $${idx++}`); vals.push(body.is_active); }
    if (body.clocked_in !== undefined) {
      updates.push(`clocked_in = $${idx++}`);
      vals.push(body.clocked_in);
      updates.push(`clocked_in_at = $${idx++}`);
      vals.push(body.clocked_in ? new Date().toISOString() : null);
    }
    if ('on_route_id' in body) { updates.push(`on_route_id = $${idx++}`); vals.push(body.on_route_id ?? null); }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });

    updates.push(`updated_at = NOW()`);

    const rows = await sql.unsafe(
      `UPDATE dispatch_drivers SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, route_code, branch_code, default_truck_id AS assigned_truck_id, name AS assigned_truck_name, phone, notes, is_active, updated_at::text`,
      [...vals, driverId] as never[]
    );

    if (!rows[0]) return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('[dispatch/drivers PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/dispatch/drivers/[id]
// Removes the truck assignment for a route (clears dispatch_drivers row).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const driverId = parseInt(id, 10);
  if (isNaN(driverId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();
    const rows = await sql`DELETE FROM dispatch_drivers WHERE id = ${driverId} RETURNING id`;
    if (!rows[0]) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dispatch/drivers DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
