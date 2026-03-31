import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyProject, legacyCustomer, legacyUser } from '../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const projId = parseInt(id, 10);
  if (isNaN(projId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const rows = await db
      .select({
        project: legacyProject,
        customerName: legacyCustomer.name,
        salesRepName: legacyUser.username,
      })
      .from(legacyProject)
      .leftJoin(legacyCustomer, eq(legacyProject.customerId, legacyCustomer.id))
      .leftJoin(legacyUser, eq(legacyProject.salesRepId, legacyUser.id))
      .where(eq(legacyProject.id, projId))
      .limit(1);

    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { project, customerName, salesRepName } = rows[0];
    return NextResponse.json({ ...project, customerName, salesRepName });
  } catch (err) {
    console.error('[projects/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const projId = parseInt(id, 10);
  if (isNaN(projId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    const allowed = [
      'contractor', 'projectAddress', 'customerId', 'contractorPhone', 'contractorEmail',
      'includeFraming', 'includeSiding', 'includeShingles', 'includeDeck',
      'includeDoors', 'includeWindows', 'includeTrim', 'notes',
    ];
    for (const f of allowed) {
      if (f in body) updates[f] = body[f];
    }
    updates.lastUpdatedBy = session.user.name ?? 'Unknown';
    updates.lastUpdatedAt = new Date();

    const [updated] = await db.update(legacyProject).set(updates).where(eq(legacyProject.id, projId)).returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (err) {
    console.error('[projects/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const projId = parseInt(id, 10);
  if (isNaN(projId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [deleted] = await db.delete(legacyProject).where(eq(legacyProject.id, projId)).returning({ id: legacyProject.id });
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[projects/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
