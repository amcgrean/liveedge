import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// PATCH /api/dispatch/drivers/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const driverId = parseInt(id, 10);
  if (isNaN(driverId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json() as {
    name?: string;
    phone?: string;
    default_truck_id?: string;
    branch_code?: string;
    notes?: string;
    is_active?: boolean;
  };

  try {
    const sql = getErpSql();

    const updates: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { updates.push(`name = $${idx++}`); vals.push(body.name.trim()); }
    if (body.phone !== undefined) { updates.push(`phone = $${idx++}`); vals.push(body.phone.trim() || null); }
    if (body.default_truck_id !== undefined) { updates.push(`default_truck_id = $${idx++}`); vals.push(body.default_truck_id.trim() || null); }
    if (body.branch_code !== undefined) { updates.push(`branch_code = $${idx++}`); vals.push(body.branch_code.trim() || null); }
    if (body.notes !== undefined) { updates.push(`notes = $${idx++}`); vals.push(body.notes.trim() || null); }
    if (body.is_active !== undefined) { updates.push(`is_active = $${idx++}`); vals.push(body.is_active); }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });

    updates.push(`updated_at = NOW()`);

    const rows = await sql.unsafe(
      `UPDATE dispatch_drivers SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, name, phone, default_truck_id, branch_code, is_active, notes, updated_at::text`,
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
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const driverId = parseInt(id, 10);
  if (isNaN(driverId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();
    const rows = await sql`DELETE FROM dispatch_drivers WHERE id = ${driverId} RETURNING id`;
    if (!rows[0]) return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dispatch/drivers DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
