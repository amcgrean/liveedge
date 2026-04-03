import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/work-orders/assignments — list open assignments + available builders
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));
  const effectiveBranch = isAdmin ? '' : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type BuilderRow = { id: number; name: string; user_type: string; branch_code: string | null };
    type AssignmentRow = {
      id: number;
      work_order_number: string;
      sales_order_number: string;
      item_number: string | null;
      description: string | null;
      status: string;
      assigned_to_id: number;
      assigned_to_name: string | null;
      created_at: string;
      completed_at: string | null;
      notes: string | null;
    };

    const buildersQuery = effectiveBranch
      ? sql<BuilderRow[]>`
          SELECT id, name, user_type, branch_code FROM pickster
          WHERE branch_code = ${effectiveBranch} OR branch_code IS NULL
          ORDER BY name
        `
      : sql<BuilderRow[]>`
          SELECT id, name, user_type, branch_code FROM pickster ORDER BY name
        `;

    const assignmentsQuery = effectiveBranch
      ? sql<AssignmentRow[]>`
          SELECT wa.*, ps.name AS assigned_to_name
          FROM work_orders wa
          LEFT JOIN pickster ps ON ps.id = wa.assigned_to_id
          LEFT JOIN agility_wo_header wh ON wh.wo_id::text = wa.work_order_number AND wh.is_deleted = false
          LEFT JOIN agility_so_header soh ON soh.so_id = wh.source_id::text AND soh.is_deleted = false
          WHERE wa.status IN ('Open', 'Assigned')
            AND soh.system_id = ${effectiveBranch}
          ORDER BY wa.created_at DESC
        `
      : sql<AssignmentRow[]>`
          SELECT wa.*, ps.name AS assigned_to_name
          FROM work_orders wa
          LEFT JOIN pickster ps ON ps.id = wa.assigned_to_id
          WHERE wa.status IN ('Open', 'Assigned')
          ORDER BY wa.created_at DESC
        `;

    const [builders, assignments] = await Promise.all([buildersQuery, assignmentsQuery]);

    return NextResponse.json({ builders, assignments });
  } catch (err) {
    console.error('[work-orders/assignments GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/work-orders/assignments — assign a work order to a builder
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canAssign =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'warehouse'].includes(r));
  if (!canAssign) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    wo_id?: string;
    so_number?: string;
    item_number?: string;
    description?: string;
    assigned_to_id?: number;
  };

  const { wo_id, so_number, item_number, description, assigned_to_id } = body;
  if (!wo_id || !assigned_to_id) {
    return NextResponse.json({ error: 'wo_id and assigned_to_id are required' }, { status: 400 });
  }

  try {
    const sql = getErpSql();

    // Upsert: if assignment exists and not complete, update it; otherwise insert
    type ExistingRow = { id: number; status: string };
    const existing = await sql<ExistingRow[]>`
      SELECT id, status FROM work_orders WHERE work_order_number = ${wo_id} LIMIT 1
    `;

    if (existing.length > 0 && existing[0].status !== 'Complete') {
      await sql`
        UPDATE work_orders
        SET assigned_to_id = ${assigned_to_id},
            status = 'Assigned',
            sales_order_number = ${so_number ?? existing[0].toString()},
            item_number = COALESCE(${item_number ?? null}, item_number),
            description = COALESCE(${description ?? null}, description)
        WHERE id = ${existing[0].id}
      `;
      return NextResponse.json({ id: existing[0].id, updated: true });
    }

    type InsertRow = { id: number };
    const [row] = await sql<InsertRow[]>`
      INSERT INTO work_orders
        (work_order_number, sales_order_number, item_number, description, status, assigned_to_id, created_at)
      VALUES
        (${wo_id}, ${so_number ?? ''}, ${item_number ?? null}, ${description ?? null},
         'Assigned', ${assigned_to_id}, NOW())
      RETURNING id
    `;

    return NextResponse.json({ id: row.id, updated: false }, { status: 201 });
  } catch (err) {
    console.error('[work-orders/assignments POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
