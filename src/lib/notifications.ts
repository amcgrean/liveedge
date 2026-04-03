import { getDb } from '@/db/index';
import { legacyNotificationRule, legacyNotificationLog } from '@/db/schema-legacy';
import { eq, and } from 'drizzle-orm';

interface NotificationContext {
  eventType: string;
  bidId?: number;
  bidType?: string;
  branchId?: number;
  details?: Record<string, unknown>;
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

    const recipients = matched
      .map((r) => r.recipientName)
      .filter(Boolean)
      .join(', ');

    // Try sending via Resend if API key is configured
    const resendKey = process.env.RESEND_API_KEY;
    let status = 'skipped';
    let errorMessage: string | null = null;

    if (resendKey && recipients) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'LiveEdge <noreply@app.beisser.cloud>',
            to: recipients.split(', '),
            subject: `[LiveEdge] ${context.eventType}${context.details?.projectName ? ': ' + context.details.projectName : ''}`,
            text: `Event: ${context.eventType}\n${JSON.stringify(context.details ?? {}, null, 2)}`,
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
      recipients,
      matchedRules: JSON.stringify(matched.map((r) => r.id)),
      status,
      errorMessage,
    });
  } catch (err) {
    console.error('[notifications] Failed to process:', err);
  }
}
