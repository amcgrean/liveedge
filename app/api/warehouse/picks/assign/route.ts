import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

/**
 * GET /api/warehouse/picks/assign
 * Returns all current pick assignments as { so_number → { picker_id, picker_name } }.
 */
export async function GET() {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const sql = getErpSql();

    type AssignRow = { so_number: string; picker_id: number; picker_name: string };
    const rows = await sql<AssignRow[]>`
      SELECT pa.so_number, pa.picker_id, ps.name AS picker_name
      FROM pick_assignments pa
      JOIN pickster ps ON ps.id = pa.picker_id
      ORDER BY pa.so_number
    `;

    const map: Record<string, { picker_id: number; picker_name: string }> = {};
    for (const r of rows) {
      map[r.so_number] = { picker_id: r.picker_id, picker_name: r.picker_name };
    }

    return NextResponse.json({ assignments: map });
  } catch (err) {
    console.error('[warehouse/picks/assign GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/warehouse/picks/assign
 * Assign or unassign a picker to a sales order.
 *
 * Body:
 *   { so_number: string, picker_id: number | null }
 *
 * - picker_id = number  → create or update assignment
 * - picker_id = null    → remove assignment (unassign)
 *
 * Mirrors Flask WH-Tracker's warehouse.assign_picker() logic.
 * pick_assignments table: picker_id, so_number, assigned_at
 */
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as { so_number?: string; picker_id?: number | null };
  const { so_number, picker_id } = body;

  if (!so_number) {
    return NextResponse.json({ error: 'so_number is required' }, { status: 400 });
  }

  try {
    const sql = getErpSql();

    type ExistingRow = { picker_id: number };
    const existing = await sql<ExistingRow[]>`
      SELECT picker_id FROM pick_assignments WHERE so_number = ${so_number} LIMIT 1
    `;

    // Unassign: picker_id is null or 0
    if (!picker_id) {
      if (existing.length > 0) {
        await sql`DELETE FROM pick_assignments WHERE so_number = ${so_number}`;
        return NextResponse.json({ action: 'removed' });
      }
      return NextResponse.json({ action: 'noop' });
    }

    // Assign or reassign
    if (existing.length > 0) {
      await sql`
        UPDATE pick_assignments
        SET picker_id   = ${picker_id},
            assigned_at = NOW()
        WHERE so_number = ${so_number}
      `;
      return NextResponse.json({ action: 'updated' });
    }

    await sql`
      INSERT INTO pick_assignments (so_number, picker_id, assigned_at)
      VALUES (${so_number}, ${picker_id}, NOW())
    `;
    return NextResponse.json({ action: 'created' }, { status: 201 });
  } catch (err) {
    console.error('[warehouse/picks/assign POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
