import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/dispatch/drivers
export async function GET() {
  const authResult = await requireCapability('dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAdmin = hasCapability(session, 'branch.all');
  const effectiveBranch = isAdmin ? '' : (session.user.branch ?? '');

  try {
    const sql = getErpSql();
    const rows = await sql`
      SELECT id, name, phone, default_truck_id, branch_code, is_active, notes,
             created_at::text, updated_at::text
      FROM dispatch_drivers
      ${effectiveBranch ? sql`WHERE branch_code = ${effectiveBranch} OR branch_code IS NULL` : sql``}
      ORDER BY name
    `;
    return NextResponse.json({ drivers: rows });
  } catch (err) {
    console.error('[dispatch/drivers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/dispatch/drivers
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as {
    name?: string;
    phone?: string;
    default_truck_id?: string;
    branch_code?: string;
    notes?: string;
    is_active?: boolean;
  };

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });

  try {
    const sql = getErpSql();
    const [row] = await sql`
      INSERT INTO dispatch_drivers (name, phone, default_truck_id, branch_code, notes, is_active)
      VALUES (
        ${name},
        ${body.phone?.trim() || null},
        ${body.default_truck_id?.trim() || null},
        ${body.branch_code?.trim() || null},
        ${body.notes?.trim() || null},
        ${body.is_active !== false}
      )
      RETURNING id, name, phone, default_truck_id, branch_code, is_active, notes,
                created_at::text, updated_at::text
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'A driver with that name already exists.' }, { status: 409 });
    }
    console.error('[dispatch/drivers POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
