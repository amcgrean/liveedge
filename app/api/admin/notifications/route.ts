import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyNotificationRule, legacyBranch } from '../../../../db/schema-legacy';
import { eq, desc } from 'drizzle-orm';

function requireAdmin(session: { user: { role?: string } } | null) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  return null;
}

export async function GET() {
  const session = await auth();
  const err = requireAdmin(session);
  if (err) return err;

  try {
    const db = getDb();
    const rules = await db
      .select({
        id: legacyNotificationRule.id,
        eventType: legacyNotificationRule.eventType,
        recipientType: legacyNotificationRule.recipientType,
        recipientId: legacyNotificationRule.recipientId,
        recipientName: legacyNotificationRule.recipientName,
        branchId: legacyNotificationRule.branchId,
        bidType: legacyNotificationRule.bidType,
        createdAt: legacyNotificationRule.createdAt,
        branchName: legacyBranch.branchName,
      })
      .from(legacyNotificationRule)
      .leftJoin(legacyBranch, eq(legacyNotificationRule.branchId, legacyBranch.branchId))
      .orderBy(desc(legacyNotificationRule.createdAt));

    return NextResponse.json({ rules });
  } catch (err) {
    console.error('[notifications API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const adminErr = requireAdmin(session);
  if (adminErr) return adminErr;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const eventType = body.eventType as string;
  const recipientType = body.recipientType as string;
  if (!eventType || !recipientType) return NextResponse.json({ error: 'eventType and recipientType are required' }, { status: 422 });

  try {
    const db = getDb();
    const [rule] = await db.insert(legacyNotificationRule).values({
      eventType,
      recipientType,
      recipientId: (body.recipientId as number) ?? null,
      recipientName: (body.recipientName as string) ?? null,
      branchId: (body.branchId as number) ?? null,
      bidType: (body.bidType as string) ?? null,
    }).returning();
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    console.error('[notifications API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
