// Route-completion alert orchestrator. Called by
// app/api/dispatch/orders/[so_number]/deliver/route.ts after a stop's
// status flips to 'delivered' | 'skipped'. If no stops remain open on the
// route, we notify the per-branch recipients configured at
// /admin/dispatch-alerts.
//
// Dedupe: before invoking the provider we look up prior log rows for
// (route_id, recipient_id, channel) and skip if any are terminal
// ('sent' or 'skipped_console'). A previously-failed send is retried on
// the next deliver POST and appends a fresh log row, preserving the audit.

import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index';
import { getErpSql } from '../../../db/supabase';
import {
  dispatchAlertRecipients,
  dispatchRouteCompletionLog,
} from '../../../db/schema';
import {
  buildDispatchAlertHtml,
  buildDispatchAlertSmsBody,
  sendDispatchAlertEmail,
} from '../email/send-dispatch-alert';
import { sendSms } from '../sms/send-twilio';

export interface NotifyRouteCompletedInput {
  routeId:             number;
  completedSoNumber?:  string | null;
}

export interface NotifyRouteCompletedResult {
  triggered: boolean;
  reason?:   'still_open' | 'route_missing' | 'no_recipients';
  routeId:   number;
  openStops?: number;
  sends?:    Array<{
    recipientId: string;
    channel:     'email' | 'sms';
    status:      'sent' | 'failed' | 'skipped_console' | 'skipped_dedupe';
    error?:      string;
  }>;
}

type RouteRow = {
  id:           number;
  route_date:   string | null;
  route_name:   string | null;
  branch_code:  string | null;
  driver_name:  string | null;
  truck_id:     string | null;
};

export async function notifyRouteCompletedIfLastStop(
  input: NotifyRouteCompletedInput,
): Promise<NotifyRouteCompletedResult> {
  const { routeId, completedSoNumber } = input;
  const sql = getErpSql();

  // 1. Any remaining open stops?
  const counts = await sql<{ open_stops: number; total_stops: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('delivered','skipped'))::int AS open_stops,
      COUNT(*)::int AS total_stops
    FROM dispatch_route_stops
    WHERE route_id = ${routeId}
  `;
  const openStops  = counts[0]?.open_stops  ?? 0;
  const totalStops = counts[0]?.total_stops ?? 0;
  if (openStops > 0) {
    return { triggered: false, reason: 'still_open', routeId, openStops };
  }

  // 2. Load route header.
  const routeRows = await sql<RouteRow[]>`
    SELECT id, route_date, route_name, branch_code, driver_name, truck_id
    FROM dispatch_routes
    WHERE id = ${routeId}
    LIMIT 1
  `;
  const route = routeRows[0];
  if (!route || !route.branch_code) {
    return { triggered: false, reason: 'route_missing', routeId };
  }

  const driverName    = (route.driver_name ?? '').trim() || 'Driver';
  const routeName     = (route.route_name  ?? '').trim() || `Route #${route.id}`;
  const routeDateLabel= route.route_date ?? new Date().toISOString().slice(0, 10);
  const branchCode    = route.branch_code;

  // 3. Recipients for this branch.
  const db = getDb();
  const recipients = await db
    .select()
    .from(dispatchAlertRecipients)
    .where(and(
      eq(dispatchAlertRecipients.branchCode, branchCode),
      eq(dispatchAlertRecipients.isActive, true),
    ));

  if (recipients.length === 0) {
    return { triggered: true, reason: 'no_recipients', routeId, openStops: 0 };
  }

  // 4. Existing log rows for this route — used to dedupe across deliver retries.
  const existing = await db
    .select({
      recipientId: dispatchRouteCompletionLog.recipientId,
      channel:     dispatchRouteCompletionLog.channel,
      status:      dispatchRouteCompletionLog.status,
    })
    .from(dispatchRouteCompletionLog)
    .where(eq(dispatchRouteCompletionLog.routeId, routeId));

  // Only treat 'sent' and 'skipped_console' as terminal — keep retrying 'failed'.
  const isResolved = (recipientId: string, channel: 'email' | 'sms') =>
    existing.some((r) =>
      r.recipientId === recipientId &&
      r.channel === channel &&
      (r.status === 'sent' || r.status === 'skipped_console'),
    );

  const completedAtIso = new Date().toISOString();
  const completedAtLocal = formatLocal(completedAtIso);

  const html = buildDispatchAlertHtml({
    driverName,
    routeName,
    routeDateLabel,
    branchCode,
    truckId:     route.truck_id,
    completedSo: completedSoNumber ?? null,
    stopCount:   totalStops,
    completedAt: completedAtLocal,
  });
  const smsBody = buildDispatchAlertSmsBody({
    driverName,
    routeName,
    branchCode,
    truckId:   route.truck_id,
    stopCount: totalStops,
  });
  const subject = `Route complete: ${driverName} · ${routeName} (${branchCode})`;

  const sends: NotifyRouteCompletedResult['sends'] = [];

  for (const r of recipients) {
    if (r.notifyEmail && r.email) {
      if (isResolved(r.id, 'email')) {
        sends.push({ recipientId: r.id, channel: 'email', status: 'skipped_dedupe' });
      } else {
        const result = await sendDispatchAlertEmail({ to: r.email, subject, html });
        await writeLog({
          routeId,
          branchCode,
          driverName,
          routeName,
          completedSo: completedSoNumber ?? null,
          recipientId: r.id,
          recipientLabel: `${r.name} <${r.email}>`,
          channel: 'email',
          status: result.consoleOnly ? 'skipped_console' : result.ok ? 'sent' : 'failed',
          providerMessageId: result.messageId,
          error: result.error,
        });
        sends.push({
          recipientId: r.id,
          channel: 'email',
          status: result.consoleOnly ? 'skipped_console' : result.ok ? 'sent' : 'failed',
          ...(result.error ? { error: result.error } : {}),
        });
      }
    }

    if (r.notifySms && r.phoneE164) {
      if (isResolved(r.id, 'sms')) {
        sends.push({ recipientId: r.id, channel: 'sms', status: 'skipped_dedupe' });
      } else {
        const result = await sendSms({ to: r.phoneE164, body: smsBody });
        await writeLog({
          routeId,
          branchCode,
          driverName,
          routeName,
          completedSo: completedSoNumber ?? null,
          recipientId: r.id,
          recipientLabel: `${r.name} <${r.phoneE164}>`,
          channel: 'sms',
          status: result.consoleOnly ? 'skipped_console' : result.ok ? 'sent' : 'failed',
          providerMessageId: result.messageId,
          error: result.error,
        });
        sends.push({
          recipientId: r.id,
          channel: 'sms',
          status: result.consoleOnly ? 'skipped_console' : result.ok ? 'sent' : 'failed',
          ...(result.error ? { error: result.error } : {}),
        });
      }
    }
  }

  return { triggered: true, routeId, openStops: 0, sends };
}

interface WriteLogInput {
  routeId:           number;
  branchCode:        string;
  driverName:        string;
  routeName:         string;
  completedSo:       string | null;
  recipientId:       string;
  recipientLabel:    string;
  channel:           'email' | 'sms';
  status:            'sent' | 'failed' | 'skipped_console';
  providerMessageId: string | null;
  error:             string | null;
}

async function writeLog(input: WriteLogInput): Promise<void> {
  const db = getDb();
  try {
    await db.insert(dispatchRouteCompletionLog).values({
      routeId:            input.routeId,
      branchCode:         input.branchCode,
      driverName:         input.driverName,
      routeName:          input.routeName,
      completedSoNumber:  input.completedSo,
      recipientId:        input.recipientId,
      recipientLabel:     input.recipientLabel,
      channel:            input.channel,
      status:             input.status,
      error:              input.error,
      providerMessageId:  input.providerMessageId,
    });
  } catch (err) {
    console.error('[route-completion] log insert failed:', err);
  }
}

function formatLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
