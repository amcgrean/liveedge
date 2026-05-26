import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db/index';
import { graphSubscriptions } from '../../../../db/schema';
import {
  getMessage,
  listAttachments,
  getItemAttachmentRaw,
  type GraphAttachment,
} from '@/lib/ms-graph';
import { processCreditEmail } from '@/lib/inbound/process-credits';
import type { NormalizedAttachment, NormalizedInboundEmail } from '@/lib/inbound/types';

// POST /api/inbound/graph
// Microsoft Graph change-notification webhook.
// Handles two distinct request shapes:
//   1. Validation handshake (subscription create) — body has ?validationToken=…;
//      MUST reply 200 text/plain with the token within 10 seconds.
//   2. Notification — JSON body { value: [{ subscriptionId, clientState, resource, resourceData: { id } }, …] }.
//      For each entry: verify clientState, fetch the message via Graph, dispatch
//      to processCreditEmail by mailbox.

const CREDITS_MAILBOX = (process.env.MS_GRAPH_CREDITS_MAILBOX ?? 'credits@beisserlumber.com').toLowerCase();

type GraphNotification = {
  subscriptionId:        string;
  clientState?:          string;
  changeType:            string;
  resource:              string;
  resourceData?:         { id?: string };
  tenantId?:             string;
  subscriptionExpirationDateTime?: string;
};

function extractMailboxFromResource(resource: string): string | null {
  // "Users/<id-or-upn>/Messages/<msg-id>"
  const m = resource.match(/^Users\/([^/]+)\/Messages\//i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

async function buildNormalizedEmail(mailbox: string, messageId: string): Promise<NormalizedInboundEmail> {
  const msg = await getMessage(mailbox, messageId);

  const fromName = msg.from?.emailAddress.name?.trim();
  const fromAddr = msg.from?.emailAddress.address ?? '';
  const fromHeader = fromName ? `${fromName} <${fromAddr}>` : fromAddr;

  const toAddresses = (msg.toRecipients ?? [])
    .map(r => r.emailAddress.address)
    .filter(Boolean);

  const bodyType = msg.body?.contentType ?? 'text';
  const bodyContent = msg.body?.content ?? '';

  const attachments: NormalizedAttachment[] = [];
  if (msg.hasAttachments) {
    let raw: GraphAttachment[] = [];
    try {
      raw = await listAttachments(mailbox, messageId);
    } catch (err) {
      console.error('[inbound/graph] listAttachments failed', mailbox, messageId, err);
    }

    for (const att of raw) {
      try {
        if (att['@odata.type'] === '#microsoft.graph.fileAttachment') {
          attachments.push({
            filename:    att.name,
            contentType: att.contentType,
            buffer:      Buffer.from(att.contentBytes, 'base64'),
            size:        att.size,
            contentId:   att.contentId ?? null,
            isInline:    att.isInline === true,
          });
        } else if (att['@odata.type'] === '#microsoft.graph.itemAttachment') {
          // Forwarded email — fetch raw RFC 822 and let the credits MIME walker handle it.
          const rawBuf = await getItemAttachmentRaw(mailbox, messageId, att.id);
          attachments.push({
            filename:      att.name || 'forwarded-email.eml',
            contentType:   'message/rfc822',
            buffer:        rawBuf,
            size:          att.size,
            isNestedEmail: true,
          });
        }
        // Skip referenceAttachment — those are OneDrive/SharePoint links, not bytes.
      } catch (err) {
        console.error('[inbound/graph] attachment fetch failed', att.name, err);
      }
    }
  }

  return {
    from:        fromHeader,
    to:          toAddresses,
    subject:     msg.subject ?? null,
    text:        bodyType === 'text' ? bodyContent : null,
    html:        bodyType === 'html' ? bodyContent : null,
    messageId:   msg.internetMessageId ?? null,
    receivedAt:  msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
    attachments,
  };
}

export async function POST(req: NextRequest) {
  // ─── 1. Validation handshake ───────────────────────────────────────────────
  // Microsoft pings POST with ?validationToken=<value> on subscription create.
  // Reply 200 text/plain with the token within 10s or the create fails.
  const validationToken = req.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  // ─── 2. Notification batch ────────────────────────────────────────────────
  let body: { value?: GraphNotification[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const notifications = body.value ?? [];
  if (notifications.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const db = getDb();

  // Cache subscription clientState lookups (most batches are single-subscription).
  const subStateCache = new Map<string, string | null>();
  async function getStoredClientState(subscriptionId: string): Promise<string | null> {
    if (subStateCache.has(subscriptionId)) return subStateCache.get(subscriptionId)!;
    const [row] = await db
      .select({ clientState: graphSubscriptions.clientState })
      .from(graphSubscriptions)
      .where(eq(graphSubscriptions.subscriptionId, subscriptionId))
      .limit(1);
    const val = row?.clientState ?? null;
    subStateCache.set(subscriptionId, val);
    return val;
  }

  let processed = 0;
  const errors: { subscriptionId: string; error: string }[] = [];

  for (const n of notifications) {
    try {
      const expected = await getStoredClientState(n.subscriptionId);
      if (!expected) {
        console.warn('[inbound/graph] notification for unknown subscription', n.subscriptionId);
        continue;
      }
      if (n.clientState !== expected) {
        console.error('[inbound/graph] clientState mismatch', n.subscriptionId);
        continue;
      }

      const mailbox = extractMailboxFromResource(n.resource);
      const messageId = n.resourceData?.id;
      if (!mailbox || !messageId) {
        console.warn('[inbound/graph] missing mailbox or messageId in', n.resource);
        continue;
      }

      const normalized = await buildNormalizedEmail(mailbox, messageId);

      if (mailbox === CREDITS_MAILBOX) {
        await processCreditEmail(normalized);
      } else {
        console.warn('[inbound/graph] notification for unconfigured mailbox', mailbox);
        continue;
      }

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[inbound/graph] notification processing failed', n.subscriptionId, msg);
      errors.push({ subscriptionId: n.subscriptionId, error: msg });
      // Don't 500 the whole batch — Microsoft retries the entire batch on non-2xx,
      // which would re-process the successful ones. Log and move on.
    }
  }

  return NextResponse.json({ ok: true, processed, errors: errors.length > 0 ? errors : undefined });
}
