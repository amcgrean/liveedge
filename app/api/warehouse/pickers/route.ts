import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET  /api/warehouse/pickers         — list pickers; ?branch=XX filters by branch_code
// POST /api/warehouse/pickers         — add a picker { name, user_type, branch_code }
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  const branch = req.nextUrl.searchParams.get('branch');

  try {
    const sql = getErpSql();

    type PickerRow = { id: number; name: string; user_type: string | null; branch_code: string | null };

    const rows = branch
      ? await sql<PickerRow[]>`
          SELECT id, name, user_type, branch_code FROM pickster WHERE branch_code = ${branch} ORDER BY name
        `
      : await sql<PickerRow[]>`
          SELECT id, name, user_type, branch_code FROM pickster ORDER BY name
        `;

    return NextResponse.json({ pickers: rows });
  } catch (err) {
    console.error('[warehouse/pickers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireCapability('pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  let body: { name?: string; user_type?: string; branch_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const user_type = (body.user_type ?? '').trim() || null;
  const branch_code = (body.branch_code ?? '').trim() || null;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  try {
    const sql = getErpSql();

    type NewRow = { id: number; name: string; user_type: string | null; branch_code: string | null };
    const rows = await sql<NewRow[]>`
      INSERT INTO pickster (name, user_type, branch_code)
      VALUES (${name}, ${user_type}, ${branch_code})
      RETURNING id, name, user_type, branch_code
    `;

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error('[warehouse/pickers POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
