import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// GET   /api/warehouse/pickers/[id]   — picker detail + recent picks
// PATCH /api/warehouse/pickers/[id]   — update name / user_type
// DELETE /api/warehouse/pickers/[id]  — delete picker (admin only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const pickerId = parseInt(id, 10);
  if (isNaN(pickerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();

    type PickerRow = { id: number; name: string; user_type: string | null; branch_code: string | null };
    type PickRow = {
      id: number;
      barcode_number: string | null;
      start_time: string | null;
      completed_time: string | null;
      pick_type_id: number | null;
    };
    type StatRow = {
      total_picks: number;
      today_picks: number;
      avg_minutes: number | null;
    };

    const [pickerRows, recentPicks, statRows] = await Promise.all([
      sql<PickerRow[]>`SELECT id, name, user_type, branch_code FROM pickster WHERE id = ${pickerId} LIMIT 1`,
      sql<PickRow[]>`
        SELECT id, barcode_number, start_time::text, completed_time::text, pick_type_id
        FROM pick
        WHERE picker_id = ${pickerId}
        ORDER BY COALESCE(completed_time, start_time) DESC
        LIMIT 50
      `,
      sql<StatRow[]>`
        SELECT
          COUNT(*)::int AS total_picks,
          COUNT(CASE WHEN completed_time::date = CURRENT_DATE THEN 1 END)::int AS today_picks,
          ROUND(AVG(EXTRACT(EPOCH FROM (completed_time - start_time)) / 60.0)::numeric, 1) AS avg_minutes
        FROM pick
        WHERE picker_id = ${pickerId} AND completed_time IS NOT NULL
      `,
    ]);

    if (!pickerRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      picker: pickerRows[0],
      recent_picks: recentPicks,
      stats: statRows[0] ?? { total_picks: 0, today_picks: 0, avg_minutes: null },
    });
  } catch (err) {
    console.error('[warehouse/pickers/[id] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const pickerId = parseInt(id, 10);
  if (isNaN(pickerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { name?: string; user_type?: string; branch_code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  const user_type = (body.user_type ?? '').trim() || null;
  const branch_code = 'branch_code' in body ? ((body.branch_code ?? '').trim() || null) : undefined;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  try {
    const sql = getErpSql();
    type Row = { id: number; name: string; user_type: string | null; branch_code: string | null };
    const rows = branch_code !== undefined
      ? await sql<Row[]>`
          UPDATE pickster SET name = ${name}, user_type = ${user_type}, branch_code = ${branch_code}
          WHERE id = ${pickerId}
          RETURNING id, name, user_type, branch_code
        `
      : await sql<Row[]>`
          UPDATE pickster SET name = ${name}, user_type = ${user_type}
          WHERE id = ${pickerId}
          RETURNING id, name, user_type, branch_code
        `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('[warehouse/pickers/[id] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const pickerId = parseInt(id, 10);
  if (isNaN(pickerId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();
    await sql`DELETE FROM pickster WHERE id = ${pickerId}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[warehouse/pickers/[id] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
