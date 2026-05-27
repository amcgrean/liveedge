import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getDb } from '../../../../../../db/index';
import { dispatchAlertRecipients } from '../../../../../../db/schema';
import { eq } from 'drizzle-orm';
import {
  buildDispatchAlertHtml,
  buildDispatchAlertSmsBody,
  sendDispatchAlertEmail,
} from '../../../../../../src/lib/email/send-dispatch-alert';
import { sendSms } from '../../../../../../src/lib/sms/send-twilio';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/admin/dispatch-alerts/[id]/test
// Fires a sample alert to the given recipient — used by the admin UI's
// "Test send" button. Does NOT write to dispatch_route_completion_log
// (it's a smoke test, not a real route event).
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await ctx.params;
  const db = getDb();
  const [recipient] = await db.select().from(dispatchAlertRecipients)
    .where(eq(dispatchAlertRecipients.id, id))
    .limit(1);
  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

  const completedAt = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric', minute: '2-digit', hour12: true,
    month: 'short', day: 'numeric',
  });
  const html = buildDispatchAlertHtml({
    driverName: 'Test Driver',
    routeName:  'Test Route',
    routeDateLabel: new Date().toISOString().slice(0, 10),
    branchCode: recipient.branchCode,
    truckId:    'TEST-01',
    completedSo:'1000000',
    stopCount:  4,
    completedAt,
  });
  const smsBody = buildDispatchAlertSmsBody({
    driverName: 'Test Driver',
    routeName:  'Test Route',
    branchCode: recipient.branchCode,
    truckId:    'TEST-01',
    stopCount:  4,
  });

  const results: Array<{ channel: 'email' | 'sms'; ok: boolean; messageId?: string | null; error?: string | null }> = [];

  if (recipient.notifyEmail && recipient.email) {
    const r = await sendDispatchAlertEmail({
      to: recipient.email,
      subject: '[TEST] LiveEdge route-complete alert',
      html,
    });
    results.push({ channel: 'email', ok: r.ok, messageId: r.messageId, error: r.error });
  }
  if (recipient.notifySms && recipient.phoneE164) {
    const r = await sendSms({ to: recipient.phoneE164, body: `[TEST] ${smsBody}` });
    results.push({ channel: 'sms', ok: r.ok, messageId: r.messageId, error: r.error });
  }

  if (results.length === 0) {
    return NextResponse.json({ error: 'Recipient has no enabled channels with a destination' }, { status: 422 });
  }

  return NextResponse.json({ results });
}
