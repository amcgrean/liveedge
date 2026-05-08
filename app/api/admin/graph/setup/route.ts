import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { graphSubscriptions } from '../../../../../db/schema';
import {
  createSubscription,
  deleteSubscription,
  maxSubscriptionExpiration,
} from '@/lib/ms-graph';

// POST /api/admin/graph/setup
// Bootstrap (or re-bootstrap) Graph mail-change subscriptions for both shared mailboxes.
//
// For each mailbox in MAILBOXES:
//   - Delete any prior subscription row + the upstream Graph subscription
//   - Generate a fresh clientState (random hex)
//   - POST /subscriptions with our /api/inbound/graph webhook URL
//   - Store the result in bids.graph_subscriptions for the renewal cron

const MAILBOXES = [
  { env: 'MS_GRAPH_CREDITS_MAILBOX', fallback: 'credits@beisserlumber.com' },
  { env: 'MS_GRAPH_HUBBELL_MAILBOX', fallback: 'hubbell@beisserlumber.com' },
];

function getNotificationUrl(req: NextRequest): string {
  // Prefer explicit override (useful for previews / tunnels).
  const override = process.env.MS_GRAPH_NOTIFICATION_URL;
  if (override) return override;
  // Fall back to the request origin — assumes prod is canonical.
  const origin = req.nextUrl.origin;
  return `${origin}/api/inbound/graph`;
}

export async function POST(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();
  const notificationUrl = getNotificationUrl(req);
  const expiration = maxSubscriptionExpiration();

  const results: {
    mailbox: string;
    subscriptionId?: string;
    expirationDateTime?: string;
    error?: string;
  }[] = [];

  for (const cfg of MAILBOXES) {
    const mailbox = (process.env[cfg.env] ?? cfg.fallback).toLowerCase();
    try {
      // Delete any existing subscription for this mailbox (cascade upstream + locally).
      const existing = await db
        .select()
        .from(graphSubscriptions)
        .where(eq(graphSubscriptions.mailbox, mailbox));

      for (const row of existing) {
        try { await deleteSubscription(row.subscriptionId); }
        catch (err) { console.warn(`[graph/setup] delete upstream ${row.subscriptionId}`, err); }
        await db.delete(graphSubscriptions).where(eq(graphSubscriptions.id, row.id));
      }

      const clientState = randomBytes(32).toString('hex');
      const resource = `/users/${mailbox}/messages`;

      const sub = await createSubscription({
        resource,
        notificationUrl,
        clientState,
        expirationDateTime: expiration,
        changeType: 'created',
      });

      await db.insert(graphSubscriptions).values({
        subscriptionId:     sub.id,
        mailbox,
        resource,
        clientState,
        expirationDateTime: new Date(sub.expirationDateTime),
      });

      results.push({
        mailbox,
        subscriptionId:     sub.id,
        expirationDateTime: sub.expirationDateTime,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[graph/setup] failed for ${mailbox}`, msg);
      results.push({ mailbox, error: msg });
    }
  }

  return NextResponse.json({ ok: true, notificationUrl, results });
}

// GET /api/admin/graph/setup — list current subscription rows
export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();
  const rows = await db.select().from(graphSubscriptions);
  return NextResponse.json({ subscriptions: rows });
}
