// Route-completion alert orchestrator.
//
// Two entry points share the same "load recipients → dedupe → send → log"
// core:
//
//   notifyRouteCompletedIfLastStop({ routeId })
//     LiveEdge-sourced. Called by
//     app/api/dispatch/orders/[so_number]/deliver/route.ts after a stop
//     flips to 'delivered' | 'skipped'. Counts remaining open stops on the
//     route; if zero, fires the alert.
//
//   notifyAgilityRouteCompleted({ systemId, agilityShipDate, agilityRouteCode,
//                                 driver, soIds, shipmentCount })
//     Agility-sourced. Called by app/api/dispatch/agility-route-complete
//     when the Pi-side reconciler detects that every shipment in a
//     (system_id, ship_date, route_id_char, driver) group is delivered in
//     Agility. NOTE: completion is judged on agility_shipments.status_flag
//     IN ('D','I') (D=delivered, I=invoiced/past-delivered) — NOT the
//     status_flag_delivery column, which is unpopulated in the mirror sync.
//     The Pi is the source of truth for "did this load complete?"; LiveEdge
//     just dedupes and sends.
//
// Dedupe: before invoking the provider we look up prior log rows keyed on
// (route_source, route identity, recipient_id, channel) and skip the channel
// if a terminal row exists ('sent' or 'skipped_console'). A previously-
// failed send is retried on the next call and appends a fresh log row,
// preserving the audit trail.

import { and, desc, eq } from 'drizzle-orm';
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
  type DispatchAlertStop,
} from '../email/send-dispatch-alert';
import { sendSms } from '../sms/send-twilio';

// ─── Public types ───────────────────────────────────────────────────────────

// Per-stop detail the Pi reconciler posts alongside the route summary. Deliveries
// and credit memos (anticipated returns) are split out in the email body.
export type AgilityRouteStop = DispatchAlertStop;

export interface NotifyRouteCompletedInput {
  routeId:             number;
  completedSoNumber?:  string | null;
}

export interface NotifyAgilityRouteInput {
  systemId:           string;       // = branch code on agility_shipments
  agilityShipDate:    string;       // 'yyyy-mm-dd'
  agilityRouteCode:   string | null;// agility_shipments.route_id_char
  driver:             string | null;// agility_shipments.driver
  soIds:              string[];     // shipments' so_ids — informational
  shipmentCount:      number;       // total shipments in the group
  stops?:             AgilityRouteStop[]; // enriched per-stop detail (may be absent)
}

export type NotifyOutcome =
  | { triggered: false; reason: 'still_open'; openStops: number }
  | { triggered: false; reason: 'route_missing' }
  | { triggered: true;  reason?: 'no_recipients'; sends: SendRecord[] };

export interface SendRecord {
  recipientId: string;
  channel:     'email' | 'sms';
  status:      'sent' | 'failed' | 'skipped_console' | 'skipped_dedupe';
  error?:      string;
}

// ─── Entry points ───────────────────────────────────────────────────────────

export async function notifyRouteCompletedIfLastStop(
  input: NotifyRouteCompletedInput,
): Promise<NotifyOutcome> {
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
  if (openStops > 0) return { triggered: false, reason: 'still_open', openStops };

  // 2. Load LiveEdge route header.
  const routeRows = await sql<{
    id: number;
    route_date: string | null;
    route_name: string | null;
    branch_code: string | null;
    driver_name: string | null;
    truck_id: string | null;
  }[]>`
    SELECT id, route_date, route_name, branch_code, driver_name, truck_id
    FROM dispatch_routes
    WHERE id = ${routeId}
    LIMIT 1
  `;
  const route = routeRows[0];
  if (!route || !route.branch_code) return { triggered: false, reason: 'route_missing' };

  // 3. Hand off to the shared sender.
  return runNotification({
    source:        'liveedge',
    routeId,
    branchCode:    route.branch_code,
    driverName:    (route.driver_name ?? '').trim() || 'Driver',
    routeName:     (route.route_name  ?? '').trim() || `Route #${route.id}`,
    routeDateLabel: route.route_date ?? new Date().toISOString().slice(0, 10),
    truckId:       route.truck_id,
    stopCount:     totalStops,
    completedSo:   completedSoNumber ?? null,
  });
}

export async function notifyAgilityRouteCompleted(
  input: NotifyAgilityRouteInput,
): Promise<NotifyOutcome> {
  const { systemId, agilityShipDate, agilityRouteCode, driver, soIds, shipmentCount, stops } = input;

  const driverName = (driver ?? '').trim() || 'Driver';
  // route_id_char is e.g. "07" or "P1". Render with a label that's useful in
  // the recipient's inbox: "Route 07 · 25BW · 2026-05-27".
  const routeName  = agilityRouteCode
    ? `Route ${agilityRouteCode}`
    : `Driver ${driverName}`;

  return runNotification({
    source:           'agility',
    branchCode:       systemId, // system_id IS the branch code on agility_shipments
    driverName,
    routeName,
    routeDateLabel:   agilityShipDate,
    truckId:          null,
    stopCount:        shipmentCount,
    completedSo:      soIds.slice(0, 5).join(', ') || null,
    systemId,
    agilityShipDate,
    agilityRouteCode: agilityRouteCode ?? null,
    stops,
  });
}

// ─── Shared core ────────────────────────────────────────────────────────────

interface RunNotificationContext {
  source:           'liveedge' | 'agility';
  branchCode:       string;
  driverName:       string;
  routeName:        string;
  routeDateLabel:   string;
  truckId:          string | null;
  stopCount:        number;
  completedSo:      string | null;
  // LiveEdge identity (source='liveedge')
  routeId?:         number;
  // Agility identity (source='agility')
  systemId?:        string;
  agilityShipDate?: string;
  agilityRouteCode?: string | null;
  // Enriched per-stop detail (agility source only; absent on liveedge path)
  stops?:           AgilityRouteStop[];
}

async function runNotification(ctx: RunNotificationContext): Promise<NotifyOutcome> {
  const db = getDb();

  // 1. Recipients for this branch.
  const recipients = await db
    .select()
    .from(dispatchAlertRecipients)
    .where(and(
      eq(dispatchAlertRecipients.branchCode, ctx.branchCode),
      eq(dispatchAlertRecipients.isActive, true),
    ));
  if (recipients.length === 0) {
    return { triggered: true, reason: 'no_recipients', sends: [] };
  }

  // 2. Existing terminal log rows for this route — used to dedupe.
  const existing = await loadExistingLogRows(ctx);

  const isResolved = (recipientId: string, channel: 'email' | 'sms') =>
    existing.some((r) =>
      r.recipientId === recipientId &&
      r.channel === channel &&
      (r.status === 'sent' || r.status === 'skipped_console'),
    );

  // 3. Compose payloads.
  const completedAtLocal = formatLocal(new Date().toISOString());
  const creditCount = (ctx.stops ?? []).filter(
    (s) => s.saleType.trim().toLowerCase() === 'credit',
  ).length;
  const html = buildDispatchAlertHtml({
    driverName:    ctx.driverName,
    routeName:     ctx.routeName,
    routeDateLabel:ctx.routeDateLabel,
    branchCode:    ctx.branchCode,
    truckId:       ctx.truckId,
    completedSo:   ctx.completedSo,
    stopCount:     ctx.stopCount,
    completedAt:   completedAtLocal,
    stops:         ctx.stops,
  });
  const smsBody = buildDispatchAlertSmsBody({
    driverName: ctx.driverName,
    routeName:  ctx.routeName,
    branchCode: ctx.branchCode,
    truckId:    ctx.truckId,
    stopCount:  ctx.stopCount,
    creditCount,
  });
  const subject = `Route complete: ${ctx.driverName} · ${ctx.routeName} (${ctx.branchCode})`;

  // 4. Send + log per (recipient, channel).
  const sends: SendRecord[] = [];

  for (const r of recipients) {
    if (r.notifyEmail && r.email) {
      if (isResolved(r.id, 'email')) {
        sends.push({ recipientId: r.id, channel: 'email', status: 'skipped_dedupe' });
      } else {
        const result = await sendDispatchAlertEmail({ to: r.email, subject, html });
        const status = result.consoleOnly ? 'skipped_console' : result.ok ? 'sent' : 'failed';
        await writeLog(ctx, {
          recipientId:       r.id,
          recipientLabel:    `${r.name} <${r.email}>`,
          channel:           'email',
          status,
          providerMessageId: result.messageId,
          error:             result.error,
        });
        sends.push({
          recipientId: r.id,
          channel:     'email',
          status,
          ...(result.error ? { error: result.error } : {}),
        });
      }
    }

    if (r.notifySms && r.phoneE164) {
      if (isResolved(r.id, 'sms')) {
        sends.push({ recipientId: r.id, channel: 'sms', status: 'skipped_dedupe' });
      } else {
        const result = await sendSms({ to: r.phoneE164, body: smsBody });
        const status = result.consoleOnly ? 'skipped_console' : result.ok ? 'sent' : 'failed';
        await writeLog(ctx, {
          recipientId:       r.id,
          recipientLabel:    `${r.name} <${r.phoneE164}>`,
          channel:           'sms',
          status,
          providerMessageId: result.messageId,
          error:             result.error,
        });
        sends.push({
          recipientId: r.id,
          channel:     'sms',
          status,
          ...(result.error ? { error: result.error } : {}),
        });
      }
    }
  }

  return { triggered: true, sends };
}

// ─── Dedupe lookup ──────────────────────────────────────────────────────────

interface ExistingLogRow {
  recipientId: string | null;
  channel:     string;
  status:      string;
}

async function loadExistingLogRows(ctx: RunNotificationContext): Promise<ExistingLogRow[]> {
  const db = getDb();
  if (ctx.source === 'liveedge') {
    if (ctx.routeId == null) return [];
    return db
      .select({
        recipientId: dispatchRouteCompletionLog.recipientId,
        channel:     dispatchRouteCompletionLog.channel,
        status:      dispatchRouteCompletionLog.status,
      })
      .from(dispatchRouteCompletionLog)
      .where(and(
        eq(dispatchRouteCompletionLog.routeSource, 'liveedge'),
        eq(dispatchRouteCompletionLog.routeId, ctx.routeId),
      ))
      .orderBy(desc(dispatchRouteCompletionLog.sentAt));
  }

  // Agility-sourced lookup.
  if (!ctx.systemId || !ctx.agilityShipDate) return [];
  const conditions = [
    eq(dispatchRouteCompletionLog.routeSource, 'agility'),
    eq(dispatchRouteCompletionLog.systemId, ctx.systemId),
    eq(dispatchRouteCompletionLog.agilityShipDate, ctx.agilityShipDate),
  ];
  if (ctx.agilityRouteCode != null) {
    conditions.push(eq(dispatchRouteCompletionLog.agilityRouteCode, ctx.agilityRouteCode));
  }
  if (ctx.driverName) {
    conditions.push(eq(dispatchRouteCompletionLog.driverName, ctx.driverName));
  }
  return db
    .select({
      recipientId: dispatchRouteCompletionLog.recipientId,
      channel:     dispatchRouteCompletionLog.channel,
      status:      dispatchRouteCompletionLog.status,
    })
    .from(dispatchRouteCompletionLog)
    .where(and(...conditions))
    .orderBy(desc(dispatchRouteCompletionLog.sentAt));
}

// ─── Log writer ─────────────────────────────────────────────────────────────

interface WriteLogInput {
  recipientId:       string;
  recipientLabel:    string;
  channel:           'email' | 'sms';
  status:            'sent' | 'failed' | 'skipped_console';
  providerMessageId: string | null;
  error:             string | null;
}

async function writeLog(ctx: RunNotificationContext, send: WriteLogInput): Promise<void> {
  const db = getDb();
  try {
    await db.insert(dispatchRouteCompletionLog).values({
      routeSource:        ctx.source,
      routeId:            ctx.source === 'liveedge' ? ctx.routeId ?? null : null,
      branchCode:         ctx.branchCode,
      driverName:         ctx.driverName,
      routeName:          ctx.routeName,
      completedSoNumber:  ctx.completedSo,
      systemId:           ctx.source === 'agility' ? ctx.systemId ?? null : null,
      agilityRouteCode:   ctx.source === 'agility' ? ctx.agilityRouteCode ?? null : null,
      agilityShipDate:    ctx.source === 'agility' ? ctx.agilityShipDate ?? null : null,
      shipmentCount:      ctx.source === 'agility' ? ctx.stopCount : null,
      recipientId:        send.recipientId,
      recipientLabel:     send.recipientLabel,
      channel:            send.channel,
      status:             send.status,
      error:              send.error,
      providerMessageId:  send.providerMessageId,
    });
  } catch (err) {
    console.error('[route-completion] log insert failed:', err);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
