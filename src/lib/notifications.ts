import { getDb } from '@/db/index';
import { legacyNotificationRule, legacyNotificationLog } from '@/db/schema-legacy';
import { eq, and } from 'drizzle-orm';

interface NotificationContext {
  eventType: string;
  bidId?: number;
  bidType?: string;
  branchId?: number;
  details?: {
    projectName?: string;
    customerName?: string;
    estimatorName?: string;
    planType?: string;
    dueDate?: string;
    completionDate?: string;
    submittedBy?: string;
    completedBy?: string;
    branchName?: string;
    [key: string]: unknown;
  };
}

function buildEmailHtml(context: NotificationContext): string {
  const { eventType, bidId, details = {} } = context;
  const isNew = eventType === 'new_bid';
  const bidUrl = bidId ? `https://app.beisser.cloud/legacy-bids/${bidId}` : null;

  const title = isNew ? '📋 New Bid Submitted' : '✅ Bid Completed';
  const color = isNew ? '#006834' : '#0ea5e9';
  const actionLabel = isNew ? 'View Bid' : 'View Completed Bid';

  const rows = [
    details.projectName  && ['Project',    details.projectName],
    details.planType     && ['Type',        details.planType],
    details.customerName && ['Customer',    details.customerName],
    details.estimatorName&& ['Estimator',   details.estimatorName],
    details.branchName   && ['Branch',      details.branchName],
    isNew
      ? details.dueDate        && ['Due Date',   details.dueDate]
      : details.completionDate && ['Completed',  details.completionDate],
    isNew
      ? details.submittedBy  && ['Submitted by', details.submittedBy]
      : details.completedBy  && ['Completed by', details.completedBy],
  ].filter(Boolean) as [string, string][];

  const tableRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#94a3b8;font-size:13px;white-space:nowrap">${label}</td>
      <td style="padding:6px 0;color:#f1f5f9;font-size:13px;font-weight:500">${value}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- Header -->
        <tr><td style="background:${color};border-radius:8px 8px 0 0;padding:20px 24px">
          <p style="margin:0;color:#fff;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Beisser LiveEdge</p>
          <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700">${title}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#1e293b;border-radius:0 0 8px 8px;padding:24px">
          <table cellpadding="0" cellspacing="0" width="100%">
            ${tableRows}
          </table>
          ${bidUrl ? `
          <div style="margin-top:24px">
            <a href="${bidUrl}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px">${actionLabel} →</a>
          </div>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 0 0;text-align:center">
          <p style="margin:0;color:#475569;font-size:11px">Beisser Lumber Co. · LiveEdge · <a href="https://app.beisser.cloud" style="color:#475569">app.beisser.cloud</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Process notifications for an event. Matches rules, sends via Resend if configured,
 * and logs results. Non-blocking — failures are logged but don't throw.
 */
export async function processNotification(context: NotificationContext): Promise<void> {
  try {
    const db = getDb();

    // Find matching rules
    const conditions = [eq(legacyNotificationRule.eventType, context.eventType)];
    if (context.branchId) conditions.push(eq(legacyNotificationRule.branchId, context.branchId));

    const rules = await db
      .select()
      .from(legacyNotificationRule)
      .where(and(...conditions));

    if (rules.length === 0) return;

    // Filter by bidType if applicable
    const matched = rules.filter((r) => !r.bidType || r.bidType === context.bidType);
    if (matched.length === 0) return;

    // recipientName stores email addresses
    const recipientEmails = matched
      .map((r) => r.recipientName)
      .filter(Boolean) as string[];

    if (recipientEmails.length === 0) return;

    const resendKey = process.env.RESEND_API_KEY;
    let status = 'skipped';
    let errorMessage: string | null = null;

    if (resendKey) {
      try {
        const subject = context.eventType === 'new_bid'
          ? `New Bid: ${context.details?.projectName ?? 'Untitled'}`
          : `Bid Complete: ${context.details?.projectName ?? 'Untitled'}`;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'LiveEdge <noreply@app.beisser.cloud>',
            to: recipientEmails,
            subject,
            html: buildEmailHtml(context),
          }),
        });
        status = res.ok ? 'sent' : 'failed';
        if (!res.ok) errorMessage = await res.text();
      } catch (err) {
        status = 'failed';
        errorMessage = err instanceof Error ? err.message : 'Unknown error';
      }
    }

    // Log the notification
    await db.insert(legacyNotificationLog).values({
      bidId: context.bidId ?? null,
      eventType: context.eventType,
      recipients: recipientEmails.join(', '),
      matchedRules: JSON.stringify(matched.map((r) => r.id)),
      status,
      errorMessage,
    });
  } catch (err) {
    console.error('[notifications] Failed to process:', err);
  }
}
