import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { poSubmissions } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = getDb();
  const [sub] = await db.select().from(poSubmissions).where(eq(poSubmissions.id, id)).limit(1);
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(sub);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Review actions require supervisor or admin
  const canReview = session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['supervisor', 'ops', 'admin'].includes(r));
  if (!canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
