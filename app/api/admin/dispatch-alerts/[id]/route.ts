import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { dispatchAlertRecipients } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { validateRecipient } from '../_shared';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const validation = validateRecipient(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 422 });

  try {
    const db = getDb();
    const [row] = await db.update(dispatchAlertRecipients)
      .set({
        branchCode:  validation.value.branchCode,
        name:        validation.value.name,
        email:       validation.value.email,
        phoneE164:   validation.value.phoneE164,
        notifyEmail: validation.value.notifyEmail,
        notifySms:   validation.value.notifySms,
        isActive:    validation.value.isActive,
        updatedAt:   new Date(),
      })
      .where(eq(dispatchAlertRecipients.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ recipient: row });
  } catch (err) {
    console.error('[dispatch-alerts/PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  try {
    const db = getDb();
    const [row] = await db.delete(dispatchAlertRecipients)
      .where(eq(dispatchAlertRecipients.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dispatch-alerts/DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
