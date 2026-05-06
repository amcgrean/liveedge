import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// POST /api/dispatch/drivers/toggle
// Sets is_active on a dispatch_drivers row, creating the row if it doesn't exist yet.
// Uses UPDATE-or-INSERT CTE so no unique constraint is required.
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as {
    route_code?: string;
    branch_code?: string;
    is_active?: boolean;
  };

  const route_code = body.route_code?.trim() ?? '';
  const branch_code = body.branch_code?.trim() ?? '';
  if (!route_code || !branch_code) {
    return NextResponse.json({ error: 'route_code and branch_code are required.' }, { status: 400 });
  }
  const is_active = body.is_active !== undefined ? body.is_active : true;

  try {
    const sql = getErpSql();

    // Update existing row if present, otherwise insert — no unique constraint needed
    await sql`
      WITH updated AS (
        UPDATE dispatch_drivers
        SET is_active = ${is_active}, updated_at = NOW()
        WHERE route_code = ${route_code} AND branch_code = ${branch_code}
        RETURNING id
      )
      INSERT INTO dispatch_drivers (route_code, branch_code, is_active, created_at, updated_at)
      SELECT ${route_code}, ${branch_code}, ${is_active}, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM updated)
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dispatch/drivers/toggle POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
