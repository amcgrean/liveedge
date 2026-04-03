import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

// POST /api/dispatch/truck-assignments/copy-previous
// Body: { target_date: "2026-04-04", branch_code: "20GR" }
// Finds the most recent prior assignment date and copies all its rows to target_date.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canEdit =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch'].includes(r));
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { target_date?: string; branch_code?: string };
  const targetDate = (body.target_date ?? new Date().toISOString().slice(0, 10)).trim();
  const branchCode = (body.branch_code ?? '').trim();
  if (!branchCode) return NextResponse.json({ error: 'branch_code is required' }, { status: 400 });

  const sql = getErpSql();

  // Find the most recent prior date for this branch
  const prevRows = await sql`
    SELECT assignment_date::text AS assignment_date
    FROM dispatch_truck_assignments
    WHERE branch_code = ${branchCode}
      AND assignment_date < ${targetDate}::date
    ORDER BY assignment_date DESC
    LIMIT 1
  `;

  const prev = (prevRows as unknown as { assignment_date: string }[])[0];
  if (!prev) {
    return NextResponse.json({ error: 'No previous assignments found for this branch' }, { status: 404 });
  }

  // Copy rows from previous date to target date (skip conflicts)
  const result = await sql`
    INSERT INTO dispatch_truck_assignments
      (assignment_date, branch_code, samsara_vehicle_id, samsara_vehicle_name,
       driver_id, route_id, notes, created_by)
    SELECT
      ${targetDate}::date, branch_code, samsara_vehicle_id, samsara_vehicle_name,
      driver_id, route_id, notes, ${session.user.id ?? null}
    FROM dispatch_truck_assignments
    WHERE branch_code = ${branchCode}
      AND assignment_date = ${prev.assignment_date}::date
    ON CONFLICT (assignment_date, samsara_vehicle_id) DO NOTHING
    RETURNING id
  `;

  const count = (result as unknown as { id: number }[]).length;
  return NextResponse.json({ copied: count, from_date: prev.assignment_date, to_date: targetDate });
}
