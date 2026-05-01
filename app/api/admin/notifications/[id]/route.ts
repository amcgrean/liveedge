import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { legacyNotificationRule } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, context: RouteContext) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await context.params;
  const ruleId = parseInt(id, 10);
  if (isNaN(ruleId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    const allowed = ['eventType', 'recipientType', 'recipientId', 'recipientName', 'branchId', 'bidType'];
    for (const f of allowed) {
      if (f in body) updates[f] = body[f];
    }

    const [updated] = await db.update(legacyNotificationRule).set(updates).where(eq(legacyNotificationRule.id, ruleId)).returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ rule: updated });
  } catch (err) {
    console.error('[notifications/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await context.params;
  const ruleId = parseInt(id, 10);
  if (isNaN(ruleId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [deleted] = await db.delete(legacyNotificationRule).where(eq(legacyNotificationRule.id, ruleId)).returning({ id: legacyNotificationRule.id });
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notifications/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
