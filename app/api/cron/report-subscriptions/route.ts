import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { verifyCronSignature } from '../../../../src/lib/service-auth';
import { getDb } from '../../../../db/index';
import { reportSubscriptions, reportSubscriptionLog } from '../../../../db/schema';
import { getReport, type ReportKey } from '../../../../src/lib/reports/registry';
import { computeNextRunAt } from '../../../../src/lib/reports/schedule';
import { renderDigest } from '../../../../src/lib/reports/dispatch';
import { sendReportEmail, buildReportEmailHtml } from '../../../../src/lib/email/send-report';

// Hourly cron — sweeps subscriptions due for delivery, renders + emails them,
// then advances next_run_at. Hard-caps the batch so one tick never times out
// the function. Per-subscription failures are isolated; the rest of the batch
// still ships.

const BATCH_LIMIT = 100;

export const maxDuration = 300; // 5 minutes; one render can take a few seconds

export async function GET(req: NextRequest) {
  const guard = verifyCronSignature(req);
  if (guard) return guard;
  return run();
}

export async function POST(req: NextRequest) {
  const guard = verifyCronSignature(req);
  if (guard) return guard;
  return run();
}

async function run() {
  const db = getDb();
  const now = new Date();

  // Pick due, active subscriptions. We don't lock — the worst case of a
  // double-tick is a duplicate email, which is preferable to a silent skip.
  const due = await db
    .select()
    .from(reportSubscriptions)
    .where(
      and(
        eq(reportSubscriptions.isActive, true),
        lte(reportSubscriptions.nextRunAt, now),
      ),
    )
    .limit(BATCH_LIMIT);

  const results = await Promise.allSettled(due.map((sub) => processOne(sub, now)));

  let sent = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value === 'sent') sent++;
      else if (r.value === 'skipped') skipped++;
      else failed++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    examined: due.length,
    sent, failed, skipped,
    nextSweepIn: 'hourly',
  });
}

type ProcessOutcome = 'sent' | 'failed' | 'skipped';

async function processOne(
  sub: typeof reportSubscriptions.$inferSelect,
  now: Date,
): Promise<ProcessOutcome> {
  const db = getDb();
  const started = Date.now();

  const report = getReport(sub.reportKey);
  if (!report) {
    await logSend(sub.id, 'failed', `Unknown report key: ${sub.reportKey}`, null, Date.now() - started);
    // Advance next_run_at to avoid hot-looping on this row.
    await advanceSchedule(sub, now);
    return 'failed';
  }

  try {
    const rendered = await renderDigest(
      sub.reportKey as ReportKey,
      sub.params ?? {},
      sub.format as 'pdf' | 'excel',
      now,
    );

    const summaryParams = (() => {
      try { return report.formatParamsSummary(sub.params); }
      catch { return ''; }
    })();

    const cadenceLabel = sub.cadence === 'daily'   ? 'Daily report'
                        : sub.cadence === 'weekly' ? 'Weekly report'
                        : 'Monthly report';

    const subject = `${report.label} — ${cadenceLabel} — ${rendered.rangeLabel}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.beisser.cloud';
    const manageUrl = `${appUrl}/account/subscriptions`;

    const html = buildReportEmailHtml({
      reportLabel:    report.label,
      cadenceLabel,
      paramsSummary:  summaryParams,
      rangeLabel:     rendered.rangeLabel,
      highlights:     rendered.highlights,
      unsubscribeUrl: manageUrl, // self-service unsubscribe — pause/delete on the manage page
      manageUrl,
    });

    const emailResult = await sendReportEmail({
      to:      sub.email,
      subject,
      html,
      attachment: {
        filename:      rendered.filename,
        contentBase64: rendered.buffer.toString('base64'),
        contentType:   rendered.mimeType,
      },
    });

    const duration = Date.now() - started;

    if (emailResult.ok) {
      await logSend(sub.id, 'sent', null, emailResult.messageId, duration);
      await markSent(sub, now);
      return 'sent';
    } else {
      await logSend(sub.id, 'failed', emailResult.error, null, duration);
      await advanceSchedule(sub, now);
      return 'failed';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron/report-subscriptions] subscription ${sub.id} failed:`, err);
    await logSend(sub.id, 'failed', msg, null, Date.now() - started);
    await advanceSchedule(sub, now);
    return 'failed';
  }
}

async function logSend(
  subscriptionId:   string,
  status:           'sent' | 'failed' | 'skipped',
  errorMessage:     string | null,
  resendMessageId:  string | null,
  durationMs:       number,
) {
  const db = getDb();
  await db.insert(reportSubscriptionLog).values({
    subscriptionId,
    status,
    errorMessage,
    resendMessageId,
    durationMs,
  });
}

async function markSent(sub: typeof reportSubscriptions.$inferSelect, now: Date) {
  const nextRunAt = computeNextRunAt(
    {
      cadence:  sub.cadence as 'daily' | 'weekly' | 'monthly',
      sendDow:  sub.sendDow,
      sendDom:  sub.sendDom,
      sendHour: sub.sendHour,
      timezone: sub.timezone,
    },
    now,
  );

  const db = getDb();
  await db.update(reportSubscriptions)
    .set({ lastSentAt: now, nextRunAt, updatedAt: now })
    .where(eq(reportSubscriptions.id, sub.id));
}

// Same as markSent but doesn't update lastSentAt — used when delivery failed
// to ensure we don't busy-loop on this row.
async function advanceSchedule(sub: typeof reportSubscriptions.$inferSelect, now: Date) {
  const nextRunAt = computeNextRunAt(
    {
      cadence:  sub.cadence as 'daily' | 'weekly' | 'monthly',
      sendDow:  sub.sendDow,
      sendDom:  sub.sendDom,
      sendHour: sub.sendHour,
      timezone: sub.timezone,
    },
    now,
  );

  const db = getDb();
  await db.update(reportSubscriptions)
    .set({ nextRunAt, updatedAt: now })
    .where(eq(reportSubscriptions.id, sub.id));
}
