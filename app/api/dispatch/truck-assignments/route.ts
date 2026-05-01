import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/dispatch/truck-assignments?date=2026-04-03&branch=20GR
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAdmin = hasCapability(session, 'branch.all');
  const effectiveBranch = isAdmin
    ? (req.nextUrl.searchParams.get('branch') ?? '')
    : (session.user.branch ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const date = req.nextUrl.searchParams.get('date') ?? today;

  try {
    const sql = getErpSql();
    const rows = await sql`
      SELECT
        ta.id, ta.assignment_date::text, ta.branch_code,
        ta.samsara_vehicle_id, ta.samsara_vehicle_name,
        ta.driver_id, dd.name AS driver_name, dd.phone AS driver_phone,
        ta.route_id, dr.route_name,
        ta.notes,
        ta.created_at::text
      FROM dispatch_truck_assignments ta
      LEFT JOIN dispatch_drivers dd ON dd.id = ta.driver_id
      LEFT JOIN dispatch_routes dr ON dr.id = ta.route_id
      WHERE ta.assignment_date = ${date}::date
        ${effectiveBranch ? sql`AND ta.branch_code = ${effectiveBranch}` : sql``}
      ORDER BY ta.branch_code, ta.samsara_vehicle_name
    `;
    return NextResponse.json({ assignments: rows });
  } catch (err) {
    console.error('[dispatch/truck-assignments GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/dispatch/truck-assignments — upsert (date+vehicle is unique)
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as {
    assignment_date?: string;
    branch_code?: string;
    samsara_vehicle_id?: string;
    samsara_vehicle_name?: string;
    driver_id?: number | null;
    route_id?: number | null;
    notes?: string;
  };

  const date = (body.assignment_date ?? new Date().toISOString().slice(0, 10));
  const vehicleId = (body.samsara_vehicle_id ?? '').trim();
  const branchCode = (body.branch_code ?? '').trim();

  if (!vehicleId || !branchCode) {
    return NextResponse.json({ error: 'samsara_vehicle_id and branch_code are required.' }, { status: 400 });
  }

  try {
    const sql = getErpSql();
    const [row] = await sql`
      INSERT INTO dispatch_truck_assignments
        (assignment_date, branch_code, samsara_vehicle_id, samsara_vehicle_name,
         driver_id, route_id, notes)
      VALUES (
        ${date}::date, ${branchCode}, ${vehicleId},
        ${body.samsara_vehicle_name?.trim() || null},
        ${body.driver_id ?? null}, ${body.route_id ?? null},
        ${body.notes?.trim() || null}
      )
      ON CONFLICT (assignment_date, samsara_vehicle_id) DO UPDATE SET
        branch_code = EXCLUDED.branch_code,
        samsara_vehicle_name = EXCLUDED.samsara_vehicle_name,
        driver_id = EXCLUDED.driver_id,
        route_id = EXCLUDED.route_id,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id, assignment_date::text, branch_code, samsara_vehicle_id,
                samsara_vehicle_name, driver_id, route_id, notes, created_at::text
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[dispatch/truck-assignments POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
