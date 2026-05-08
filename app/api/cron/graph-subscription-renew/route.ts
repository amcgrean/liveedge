import { NextRequest, NextResponse } from 'next/server';
import { eq, lt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getDb } from '../../../../db/index';
import { graphSubscriptions } from '../../../../db/schema';
import {
  renewSubscription,
  createSubscription,
  maxSubscriptionExpiration,
} from '@/lib/ms-graph';

// GET /api/cron/graph-subscription-renew
// Renews each Graph subscription whose expirationDateTime is within 24 hours.
// If renewal fails (e.g. subscription was deleted upstream), recreates it.
//
// Mail subscriptions max out at ~4230 minutes (≈ 70.5 h). Running daily keeps
// each subscription with > 1 day of headroom.

const RENEW_WITHIN_HOURS = 24;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (!req.headers.get('x-vercel-cron')) {
    return NextResponse.json({ error: 'Missing CRON_SECRET or Vercel cron header' }, { status: 401 });
  }

  const db = getDb();
  const cutoff = new Date(Date.now() + RENEW_WITHIN_HOURS * 3600 * 1000);

  const due = await db
    .select()
    .from(graphSubscriptions)
    .where(lt(graphSubscriptions.expirationDateTime, cutoff));

  const notificationUrl =
    process.env.MS_GRAPH_NOTIFICATION_URL
    ?? `${req.nextUrl.origin}/api/inbound/graph`;

  const results: {
    mailbox: string;
    subscriptionId: string;
    action: 'renewed' | 'recreated' | 'failed';
    error?: string;
  }[] = [];

  for (const row of due) {
    const newExpiration = maxSubscriptionExpiration();
    try {
      const renewed = await renewSubscription(row.subscriptionId, newExpiration);
      await db.update(graphSubscriptions)
        .set({
          expirationDateTime: new Date(renewed.expirationDateTime),
          lastRenewedAt:      new Date(),
        })
        .where(eq(graphSubscriptions.id, row.id));
      results.push({
        mailbox:        row.mailbox,
        subscriptionId: row.subscriptionId,
        action:         'renewed',
      });
    } catch (renewErr) {
      console.warn(`[cron/graph-renew] renew failed for ${row.subscriptionId}, recreating`, renewErr);
      try {
        const clientState = randomBytes(32).toString('hex');
        const fresh = await createSubscription({
          resource:           row.resource,
          notificationUrl,
          clientState,
          expirationDateTime: newExpiration,
          changeType:         'created',
        });
        await db.update(graphSubscriptions)
          .set({
            subscriptionId:     fresh.id,
            clientState,
            expirationDateTime: new Date(fresh.expirationDateTime),
            lastRenewedAt:      new Date(),
          })
          .where(eq(graphSubscriptions.id, row.id));
        results.push({
          mailbox:        row.mailbox,
          subscriptionId: fresh.id,
          action:         'recreated',
        });
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr);
        console.error(`[cron/graph-renew] recreate failed for ${row.mailbox}`, msg);
        results.push({
          mailbox:        row.mailbox,
          subscriptionId: row.subscriptionId,
          action:         'failed',
          error:          msg,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    candidates: due.length,
    results,
  });
}
