import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyITService } from '../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const issueId = parseInt(id, 10);
  if (isNaN(issueId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const rows = await db.select().from(legacyITService).where(eq(legacyITService.id, issueId)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('[it-issues/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const issueId = parseInt(id, 10);
  if (isNaN(issueId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    const allowed = ['issueType', 'description', 'status', 'notes'];
    for (const f of allowed) {
      if (f in body) updates[f] = body[f];
    }
    updates.updatedby = session.user.name ?? 'Unknown';
    updates.updatedDate = new Date();

    const [updated] = await db.update(legacyITService).set(updates).where(eq(legacyITService.id, issueId)).returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ issue: updated });
  } catch (err) {
    console.error('[it-issues/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const issueId = parseInt(id, 10);
  if (isNaN(issueId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [deleted] = await db.delete(legacyITService).where(eq(legacyITService.id, issueId)).returning({ id: legacyITService.id });
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[it-issues/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
