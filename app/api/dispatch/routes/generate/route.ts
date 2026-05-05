import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// POST /api/dispatch/routes/generate
// Bulk-creates dispatch_routes for every active ERP delv_route in the given branch/date.
// Uses NOT EXISTS to skip routes already planned for that date — no unique constraint needed.
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const body = await req.json() as { date?: string; branch_code?: string };

  const isAdmin = hasCapability(session, 'branch.all');
  const branchCode = isAdmin
    ? (body.branch_code?.trim() ?? '')
    : (session.user.branch ?? '');

  if (!branchCode) {
    return NextResponse.json({ error: 'branch_code is required' }, { status: 400 });
  }

  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  try {
    const sql = getErpSql();

    type InsertRow = { id: number; route_code: string };

    // Single INSERT … SELECT — skips routes already planned for this date/branch
    const inserted = await sql<InsertRow[]>`
      INSERT INTO dispatch_routes
        (route_date, route_code, route_name, branch_code, driver_name, truck_id, status, created_at, updated_at)
      SELECT
        ${date}::date,
        dr.route_id_char,
        dr.description,
        ${branchCode},
        dr.description,
        dd.default_truck_id,
        'planned',
        NOW(),
        NOW()
      FROM public.delv_route dr
      LEFT JOIN public.dispatch_drivers dd
        ON dd.route_code = dr.route_id_char
        AND dd.branch_code = dr.system_id
      WHERE dr.system_id = ${branchCode}
        AND dr.active = true
        AND NOT EXISTS (
          SELECT 1 FROM dispatch_routes ex
          WHERE ex.route_date = ${date}::date
            AND ex.route_code  = dr.route_id_char
            AND ex.branch_code = ${branchCode}
        )
      ORDER BY dr.route_id_char
      RETURNING id, route_code
    `;

    return NextResponse.json({ created: inserted.length });
  } catch (err) {
    console.error('[dispatch/routes/generate POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
