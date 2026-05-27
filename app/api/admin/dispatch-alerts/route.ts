import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getDb } from '../../../../db/index';
import { dispatchAlertRecipients, dispatchRouteCompletionLog } from '../../../../db/schema';
import { asc, desc } from 'drizzle-orm';
import { validateRecipient } from './_shared';

// GET /api/admin/dispatch-alerts
// Returns { recipients, recentLog }.
// recentLog = last 50 send rows for the in-page audit panel.
export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const db = getDb();
    const [recipients, recentLog] = await Promise.all([
      db.select().from(dispatchAlertRecipients).orderBy(
        asc(dispatchAlertRecipients.branchCode),
        asc(dispatchAlertRecipients.name),
      ),
      db.select().from(dispatchRouteCompletionLog)
        .orderBy(desc(dispatchRouteCompletionLog.sentAt))
        .limit(50),
    ]);
    return NextResponse.json({ recipients, recentLog });
  } catch (err) {
    console.error('[dispatch-alerts] GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/dispatch-alerts
// Body: { branchCode, name, email?, phoneE164?, notifyEmail, notifySms, isActive? }
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const validation = validateRecipient(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 422 });

  try {
    const db = getDb();
    const [row] = await db.insert(dispatchAlertRecipients).values({
      branchCode:  validation.value.branchCode,
      name:        validation.value.name,
      email:       validation.value.email,
      phoneE164:   validation.value.phoneE164,
      notifyEmail: validation.value.notifyEmail,
      notifySms:   validation.value.notifySms,
      isActive:    validation.value.isActive,
    }).returning();
    return NextResponse.json({ recipient: row }, { status: 201 });
  } catch (err) {
    console.error('[dispatch-alerts] POST', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
