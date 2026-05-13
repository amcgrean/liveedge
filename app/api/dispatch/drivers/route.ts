import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

export type DriverRoute = {
  route_code: string;
  driver_name: string;
  branch_code: string;
  id: number | null;
  assigned_truck_id: string | null;
  assigned_truck_name: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean | null; // null = no dispatch_drivers row (treated as active)
  clocked_in: boolean | null;
  clocked_in_at: string | null;
  on_route_id: number | null;
  on_route_name: string | null;
};

// GET /api/dispatch/drivers?branch=20GR
// Returns ERP delivery routes from delv_route merged with dispatch_drivers truck assignments.
// If delv_route is not yet synced to Supabase, returns { drivers: [], synced: false }.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAdmin = hasCapability(session, 'branch.all');
  const branchParam = req.nextUrl.searchParams.get('branch') ?? '';
  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');

  try {
    const sql = getErpSql();
    const rows = await sql<DriverRoute[]>`
      SELECT
        dr.route_id_char            AS route_code,
        dr.description              AS driver_name,
        dr.system_id                AS branch_code,
        dd.id,
        dd.default_truck_id         AS assigned_truck_id,
        dd.name                     AS assigned_truck_name,
        dd.phone,
        dd.notes,
        dd.is_active,
        COALESCE(dd.clocked_in, false)   AS clocked_in,
        dd.clocked_in_at::text           AS clocked_in_at,
        dd.on_route_id,
        dr2.route_name                   AS on_route_name
      FROM public.delv_route dr
      LEFT JOIN public.dispatch_drivers dd
        ON dd.route_code = dr.route_id_char
        AND dd.branch_code = dr.system_id
      LEFT JOIN public.dispatch_routes dr2
        ON dr2.id = dd.on_route_id
      WHERE (${effectiveBranch} = '' OR dr.system_id = ${effectiveBranch})
        AND dr.active = true
        AND dr.system_id <> '30CD'
      ORDER BY dr.system_id, dr.route_id_char
    `;
    return NextResponse.json({ drivers: rows, synced: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    // delv_route not yet synced to Supabase
    if (msg.includes('delv_route') || msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ drivers: [], synced: false });
    }
    console.error('[dispatch/drivers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/dispatch/drivers
// Upserts a Samsara truck assignment for a route_code + branch_code.
// The driver name is ERP-managed (from delv_route); only truck mapping is stored here.
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as {
    route_code?: string;
    branch_code?: string;
    truck_id?: string;
    truck_name?: string;
    phone?: string;
    notes?: string;
    is_active?: boolean;
  };

  const route_code = body.route_code?.trim() ?? '';
  const branch_code = body.branch_code?.trim() ?? '';
  if (!route_code || !branch_code) {
    return NextResponse.json({ error: 'route_code and branch_code are required.' }, { status: 400 });
  }

  const isActive = body.is_active !== undefined ? body.is_active : true;

  try {
    const sql = getErpSql();
    const [row] = await sql`
      INSERT INTO dispatch_drivers (route_code, branch_code, name, default_truck_id, phone, notes, is_active)
      VALUES (
        ${route_code},
        ${branch_code},
        ${body.truck_name?.trim() || null},
        ${body.truck_id?.trim() || null},
        ${body.phone?.trim() || null},
        ${body.notes?.trim() || null},
        ${isActive}
      )
      ON CONFLICT (route_code, branch_code) WHERE route_code IS NOT NULL DO UPDATE SET
        name             = EXCLUDED.name,
        default_truck_id = EXCLUDED.default_truck_id,
        phone            = COALESCE(EXCLUDED.phone, dispatch_drivers.phone),
        notes            = COALESCE(EXCLUDED.notes, dispatch_drivers.notes),
        is_active        = EXCLUDED.is_active,
        updated_at       = NOW()
      RETURNING id, route_code, branch_code, default_truck_id, name, phone, notes, is_active
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[dispatch/drivers POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
