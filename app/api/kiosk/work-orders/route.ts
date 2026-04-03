import { NextRequest, NextResponse } from 'next/server';
import { getErpSql } from '../../../../db/supabase';

// GET /api/kiosk/work-orders?picker_id=5&branch=20GR
//   — open work orders for a picker at a branch (no picker_id = all unassigned + picker's)
// POST /api/kiosk/work-orders { wo_id, picker_id, action: 'start' | 'complete' }
//   — start or complete a work order
// No auth — kiosk devices are trusted in-store

type WorkOrderRow = {
  wo_id: string;
  so_number: string;
  description: string | null;
  wo_status: string;
  branch_code: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  assignment_id: number | null;
  assignment_status: string | null;
  created_at: string | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const pickerIdParam = searchParams.get('picker_id');
  const branch = searchParams.get('branch') ?? '';

  if (!branch) {
    return NextResponse.json({ error: 'branch required' }, { status: 400 });
  }

  const pickerId = pickerIdParam ? parseInt(pickerIdParam, 10) : null;
  const sql = getErpSql();

  try {
    // Join agility_wo_header with agility_so_header for branch filtering,
    // then left-join the work_orders assignment table and pickster for names.
    // Show WOs that are either unassigned OR assigned to the requesting picker.
    const rows = (await sql`
      SELECT
        wh.wo_id::text                                   AS wo_id,
        wh.source_id::text                               AS so_number,
        COALESCE(wh.description, sol.description)        AS description,
        wh.wo_status,
        soh.system_id                                    AS branch_code,
        wa.assigned_to_id                                AS assigned_to,
        ps.name                                          AS assigned_to_name,
        wa.id                                            AS assignment_id,
        wa.status                                        AS assignment_status,
        wh.created_at::text                              AS created_at
      FROM agility_wo_header wh
      LEFT JOIN agility_so_lines sol
        ON sol.so_id = wh.source_id::text AND sol.sequence = wh.source_seq
           AND sol.is_deleted = false
      LEFT JOIN agility_so_header soh
        ON soh.so_id = wh.source_id::text AND soh.is_deleted = false
      LEFT JOIN work_orders wa
        ON wa.work_order_number = wh.wo_id::text
           AND wa.status NOT IN ('Complete', 'completed')
      LEFT JOIN pickster ps
        ON ps.id = wa.assigned_to_id
      WHERE wh.is_deleted = false
        AND UPPER(COALESCE(wh.wo_status, '')) NOT IN ('COMPLETED', 'CANCELED', 'C')
        AND soh.system_id = ${branch}
        ${
          pickerId !== null
            ? sql`AND (wa.assigned_to_id = ${pickerId} OR wa.assigned_to_id IS NULL)`
            : sql``
        }
      ORDER BY wh.wo_id DESC
      LIMIT 200
    `) as unknown as WorkOrderRow[];

    return NextResponse.json({ work_orders: rows });
  } catch (err) {
    console.error('[kiosk/work-orders GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type PostBody = {
  wo_id?: string;
  picker_id?: number;
  action?: 'start' | 'complete';
};

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wo_id, picker_id, action } = body;
  if (!wo_id) return NextResponse.json({ error: 'wo_id required' }, { status: 400 });
  if (!action || (action !== 'start' && action !== 'complete')) {
    return NextResponse.json({ error: 'action must be start or complete' }, { status: 400 });
  }

  const sql = getErpSql();
  const now = new Date();

  try {
    if (action === 'start') {
      // Upsert a work_orders assignment row for this wo_id / picker
      const existing = (await sql`
        SELECT id FROM work_orders
        WHERE work_order_number = ${wo_id}
          AND status NOT IN ('Complete', 'completed')
        LIMIT 1
      `) as unknown as { id: number }[];

      if (existing.length > 0) {
        // Update the existing assignment
        await sql`
          UPDATE work_orders
          SET assigned_to_id = ${picker_id ?? null},
              status = 'In Progress'
          WHERE id = ${existing[0].id}
        `;
      } else {
        // Insert a new assignment row
        await sql`
          INSERT INTO work_orders (work_order_number, sales_order_number, assigned_to_id, status, created_at)
          VALUES (${wo_id}, ${wo_id}, ${picker_id ?? null}, 'In Progress', ${now})
        `;
      }

      // Audit
      await sql`
        INSERT INTO audit_events (event_type, entity_type, entity_id, so_number, actor_id, occurred_at)
        VALUES ('wo_started', 'work_order', NULL, ${wo_id}, ${picker_id ?? null}, ${now})
      `;

      return NextResponse.json({ ok: true, action: 'start', wo_id });
    }

    // action === 'complete'
    const updated = (await sql`
      UPDATE work_orders
      SET status = 'Complete',
          completed_at = ${now}
      WHERE work_order_number = ${wo_id}
        AND status NOT IN ('Complete', 'completed')
      RETURNING id
    `) as unknown as { id: number }[];

    if (updated.length === 0) {
      // No active assignment row — insert a completed one
      await sql`
        INSERT INTO work_orders (work_order_number, sales_order_number, assigned_to_id, status, created_at, completed_at)
        VALUES (${wo_id}, ${wo_id}, ${picker_id ?? null}, 'Complete', ${now}, ${now})
      `;
    }

    // Audit
    await sql`
      INSERT INTO audit_events (event_type, entity_type, entity_id, so_number, actor_id, occurred_at)
      VALUES ('wo_completed', 'work_order', NULL, ${wo_id}, ${picker_id ?? null}, ${now})
    `;

    return NextResponse.json({ ok: true, action: 'complete', wo_id });
  } catch (err) {
    console.error('[kiosk/work-orders POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
