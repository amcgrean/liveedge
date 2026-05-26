import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { movementNotes } from '../../../../../db/schema';
import { and, eq, sql } from 'drizzle-orm';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

// GET /api/purchasing/movement/notes?branch=20GR&item=ABC
//   List the most recent note per (system_id, item_code) within scope.
//   If `item` is provided, returns the full history for that item.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;

  const sp = req.nextUrl.searchParams;
  const branch = sp.get('branch');
  const item   = sp.get('item');

  try {
    const db = getDb();
    const where = [];
    if (branch) where.push(eq(movementNotes.systemId, branch));
    if (item)   where.push(eq(movementNotes.itemCode, item));

    const rows = await db
      .select()
      .from(movementNotes)
      .where(where.length ? and(...where) : undefined)
      .orderBy(sql`week_starting DESC, updated_at DESC`)
      .limit(500);

    return NextResponse.json({ rows });
  } catch (err) {
    console.error('[purchasing/movement/notes GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/purchasing/movement/notes
//   { systemId, itemCode, weekStarting?: 'YYYY-MM-DD', note, dir? }
//   weekStarting defaults to this week's Monday.
//   Upserts on (systemId, itemCode, weekStarting).
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const systemId = String(body.systemId ?? '').trim();
  const itemCode = String(body.itemCode ?? '').trim();
  const note     = String(body.note ?? '').trim();
  const dir      = body.dir === 'up' || body.dir === 'down' ? body.dir : null;
  const weekStarting = String(body.weekStarting ?? '').trim() || mondayOf(new Date());

  if (!systemId || !BRANCHES.includes(systemId)) {
    return NextResponse.json({ error: `systemId must be one of ${BRANCHES.join(', ')}` }, { status: 422 });
  }
  if (!itemCode) return NextResponse.json({ error: 'itemCode is required' }, { status: 422 });
  if (!note)     return NextResponse.json({ error: 'note is required'     }, { status: 422 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStarting)) {
    return NextResponse.json({ error: 'weekStarting must be YYYY-MM-DD' }, { status: 422 });
  }

  try {
    const db = getDb();
    const [row] = await db.insert(movementNotes).values({
      systemId, itemCode, weekStarting, note, dir,
      createdBy: session.user?.name ?? null,
    }).onConflictDoUpdate({
      target: [movementNotes.systemId, movementNotes.itemCode, movementNotes.weekStarting],
      set: {
        note,
        dir,
        createdBy: session.user?.name ?? null,
        updatedAt: sql`now()`,
      },
    }).returning();
    return NextResponse.json({ row });
  } catch (err) {
    console.error('[purchasing/movement/notes POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/purchasing/movement/notes?id=<uuid>
export async function DELETE(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 422 });

  try {
    const db = getDb();
    await db.delete(movementNotes).where(eq(movementNotes.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[purchasing/movement/notes DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function mondayOf(d: Date): string {
  const day = d.getUTCDay();        // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().slice(0, 10);
}
