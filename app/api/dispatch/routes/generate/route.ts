import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// POST /api/dispatch/routes/generate
// Bulk-creates dispatch_routes for every active ERP delv_route in the given branch/date.
// Skips routes that already exist for that date (ON CONFLICT DO NOTHING).
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

    // Fetch all active ERP routes for the branch, joined with any existing truck assignment
    type ErpRoute = {
      route_code: string;
      driver_name: string;
      truck_id: string | null;
    };

    const erpRoutes = await sql<ErpRoute[]>`
      SELECT
        dr.route_id_char  AS route_code,
        dr.description    AS driver_name,
        dd.default_truck_id AS truck_id
      FROM public.delv_route dr
      LEFT JOIN public.dispatch_drivers dd
        ON dd.route_code = dr.route_id_char
        AND dd.branch_code = dr.system_id
      WHERE dr.system_id = ${branchCode}
        AND dr.active = true
      ORDER BY dr.route_id_char
    `;

    if (erpRoutes.length === 0) {
      return NextResponse.json({ created: 0, message: 'No active ERP routes found for this branch.' });
    }

    // Bulk insert — skip any route_code already planned for this date/branch
    type InsertRow = { id: number };
    const inserted: InsertRow[] = [];
    for (const r of erpRoutes) {
      const rows = await sql<InsertRow[]>`
        INSERT INTO dispatch_routes
          (route_date, route_code, route_name, branch_code, driver_name, truck_id, status, created_at, updated_at)
        VALUES
          (${date}::date, ${r.route_code}, ${r.driver_name}, ${branchCode},
           ${r.driver_name}, ${r.truck_id ?? null}, 'planned', NOW(), NOW())
        ON CONFLICT (route_date, route_code, branch_code) DO NOTHING
        RETURNING id
      `;
      if (rows[0]) inserted.push(rows[0]);
    }

    return NextResponse.json({ created: inserted.length, total: erpRoutes.length });
  } catch (err) {
    console.error('[dispatch/routes/generate POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
