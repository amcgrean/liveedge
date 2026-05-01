import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { poSubmissions } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const authResult = await requireCapability('purchasing.receive', 'purchasing.review', 'purchasing.view');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await context.params;
  const db = getDb();
  const [sub] = await db.select().from(poSubmissions).where(eq(poSubmissions.id, id)).limit(1);
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(sub);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await requireCapability('purchasing.review');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { id } = await context.params;
  const body = await req.json() as {
    status?: string;
    priority?: string;
    reviewer_notes?: string;
  };

  const validStatuses = ['pending', 'reviewed', 'flagged'];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const db = getDb();
  const [sub] = await db.select().from(poSubmissions).where(eq(poSubmissions.id, id)).limit(1);
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Partial<typeof poSubmissions.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.status) updates.status = body.status;
  if (body.priority !== undefined) updates.priority = body.priority?.trim().toLowerCase() || null;
  if (body.reviewer_notes !== undefined) updates.reviewerNotes = body.reviewer_notes?.trim() || null;

  updates.reviewedBy = session.user.id;
  updates.reviewedAt = new Date();

  const [updated] = await db
    .update(poSubmissions)
    .set(updates)
    .where(eq(poSubmissions.id, id))
    .returning();

  return NextResponse.json(updated);
}
