import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/purchasing/tasks?po=&status=&limit=50
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view', 'purchasing.review');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const po     = searchParams.get('po') ?? '';
  const status = searchParams.get('status') ?? '';
  const limit  = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10) || 50);

  try {
    const sql = getErpSql();
    type Row = {
      id: number; title: string; description: string | null;
      po_number: string | null; system_id: string | null;
      assignee_user_id: number | null; created_by_user_id: number | null;
      status: string; priority: string;
      due_at: string | null; completed_at: string | null; created_at: string;
    };

    const rows = await sql<Row[]>`
      SELECT id, title, description, po_number, system_id,
             assignee_user_id, created_by_user_id, status, priority,
             due_at::text, completed_at::text, created_at::text
      FROM purchasing_tasks
      WHERE 1=1
        ${po     ? sql`AND po_number = ${po}`       : sql``}
        ${status ? sql`AND status = ${status}`       : sql``}
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ tasks: rows });
  } catch (err) {
    console.error('[purchasing/tasks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/purchasing/tasks — create a task (from exception or manual)
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view', 'purchasing.review');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const body = await req.json() as {
    title: string;
    description?: string;
    po_number?: string;
    system_id?: string;
    priority?: string;
    due_at?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const userId = session.user.id ? parseInt(session.user.id, 10) : null;

  try {
    const sql = getErpSql();
    type InsertRow = { id: number };
    const [row] = await sql<InsertRow[]>`
      INSERT INTO purchasing_tasks
        (title, description, po_number, system_id, created_by_user_id, status, priority, due_at, created_at, updated_at)
      VALUES
        (${body.title.trim()},
         ${body.description?.trim() || null},
         ${body.po_number?.trim() || null},
         ${body.system_id?.trim() || null},
         ${userId},
         'open',
         ${body.priority ?? 'medium'},
         ${body.due_at || null},
         NOW(), NOW())
      RETURNING id
    `;
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[purchasing/tasks POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/purchasing/tasks — mark complete / update status
export async function PATCH(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view', 'purchasing.review');
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json() as { id: number; status: string };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }

  try {
    const sql = getErpSql();
    await sql`
      UPDATE purchasing_tasks
      SET status = ${body.status},
          completed_at = ${body.status === 'complete' ? sql`NOW()` : sql`NULL`},
          updated_at = NOW()
      WHERE id = ${body.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[purchasing/tasks PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
