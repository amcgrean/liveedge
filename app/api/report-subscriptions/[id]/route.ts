import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { reportSubscriptions } from '../../../../db/schema';
import { computeNextRunAt } from '../../../../src/lib/reports/schedule';

const patchSchema = z.object({
  cadence:  z.enum(['daily', 'weekly', 'monthly']).optional(),
  sendDow:  z.number().int().min(1).max(7).nullable().optional(),
  sendDom:  z.number().int().min(1).max(28).nullable().optional(),
  sendHour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().min(1).max(64).optional(),
  format:   z.enum(['pdf', 'excel']).optional(),
  isActive: z.boolean().optional(),
});

function userIdFromSession(session: Session | null): number | null {
  if (!session?.user?.id) return null;
  const parsed = parseInt(session.user.id, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = (await auth()) as Session | null;
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userIdFromSession(session);
  if (userId === null) return NextResponse.json({ error: 'Invalid session' }, { status: 400 });

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const db = getDb();
  const existing = await db
    .select()
    .from(reportSubscriptions)
    .where(and(eq(reportSubscriptions.id, id), eq(reportSubscriptions.userId, userId)))
    .limit(1);
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const current = existing[0];

  // Apply patch
  const cadence  = input.cadence  ?? current.cadence as 'daily' | 'weekly' | 'monthly';
  const sendDow  = input.sendDow  !== undefined ? input.sendDow  : current.sendDow;
  const sendDom  = input.sendDom  !== undefined ? input.sendDom  : current.sendDom;
  const sendHour = input.sendHour ?? current.sendHour;
  const timezone = input.timezone ?? current.timezone;
  const format   = input.format   ?? current.format as 'pdf' | 'excel';
  const isActive = input.isActive ?? current.isActive;

  // Whenever schedule fields change, re-compute next_run_at.
  const scheduleChanged =
    input.cadence !== undefined || input.sendDow !== undefined ||
    input.sendDom !== undefined || input.sendHour !== undefined ||
    input.timezone !== undefined || (input.isActive === true && !current.isActive);

  const nextRunAt = scheduleChanged
    ? computeNextRunAt({ cadence, sendDow, sendDom, sendHour, timezone }, new Date())
    : current.nextRunAt;

  const updated = await db
    .update(reportSubscriptions)
    .set({
      cadence,
      sendDow:  cadence === 'weekly'  ? sendDow : null,
      sendDom:  cadence === 'monthly' ? sendDom : null,
      sendHour,
      timezone,
      format,
      isActive,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(and(eq(reportSubscriptions.id, id), eq(reportSubscriptions.userId, userId)))
    .returning();

  return NextResponse.json({ subscription: updated[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = (await auth()) as Session | null;
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userIdFromSession(session);
  if (userId === null) return NextResponse.json({ error: 'Invalid session' }, { status: 400 });

  const { id } = await params;

  const db = getDb();
  const deleted = await db
    .delete(reportSubscriptions)
    .where(and(eq(reportSubscriptions.id, id), eq(reportSubscriptions.userId, userId)))
    .returning({ id: reportSubscriptions.id });

  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
