import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getErpSql } from '../../../../../../db/supabase';

type NoteRow = {
  id: number;
  body: string;
  is_internal: boolean;
  created_by_user_id: number | null;
  created_at: string;
};

// GET /api/purchasing/pos/[po]/notes
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ po: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { po } = await params;
  const sql = getErpSql();

  const rows = await sql`
    SELECT id, body, is_internal, created_by_user_id, created_at::text
    FROM purchasing_notes
    WHERE po_number = ${po}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ notes: rows as unknown as NoteRow[] });
}

// POST /api/purchasing/pos/[po]/notes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ po: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { po } = await params;
  const body = await req.json() as { body?: string; is_internal?: boolean; system_id?: string };
  const text = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 });

  const sql = getErpSql();
  const userId = typeof session.user.id === 'number' ? session.user.id : null;

  const [note] = await sql`
    INSERT INTO purchasing_notes
      (entity_type, entity_id, po_number, system_id, body, is_internal, created_by_user_id, created_at)
    VALUES
      ('po', ${po}, ${po}, ${body.system_id ?? null}, ${text},
       ${body.is_internal ?? false}, ${userId}, NOW())
    RETURNING id, body, is_internal, created_by_user_id, created_at::text
  `;

  return NextResponse.json(note, { status: 201 });
}
