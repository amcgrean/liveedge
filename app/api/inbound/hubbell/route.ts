import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getDb } from '../../../../db/index';
import { hubbellEmails, hubbellEmailCandidates } from '../../../../db/schema';
import { extractEmailData } from '@/lib/hubbell/extractor';
import { matchAddress } from '@/lib/hubbell/address-matcher';

// POST /api/inbound/hubbell
// Resend inbound webhook — fires on email.received for hubbell@beisser.cloud
// Verifies Svix signature, extracts PO/WO data, runs address match, stores results.

type ResendEmailPayload = {
  type: string;
  created_at: string;
  data: {
    from: string;
    to: string[];
    subject: string | null;
    text: string | null;
    html: string | null;
    messageId?: string;
    headers?: Record<string, string>;
  };
};

// Parse "Display Name <email@example.com>" or plain email
function parseFrom(from: string): { email: string; name: string | null } {
  const m = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  return { name: null, email: from.trim() };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_HUBBELL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[inbound/hubbell] RESEND_HUBBELL_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const rawBody = await req.text();

  let payload: ResendEmailPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      'svix-id':        req.headers.get('svix-id')        ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }) as ResendEmailPayload;
  } catch (err) {
    console.error('[inbound/hubbell] Signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (payload.type !== 'email.received') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { from, subject, text, messageId } = payload.data;
  const receivedAt = payload.created_at ? new Date(payload.created_at) : new Date();
  const { email: fromEmail, name: fromName } = parseFrom(from);
  const subjectText = subject ?? '(no subject)';

  // Extract structured data from email content
  const extracted = extractEmailData(subjectText, text ?? '');

  // Run address matching
  let candidates = await matchAddress({
    address: extracted.address,
    city:    extracted.city,
    state:   extracted.state,
    zip:     extracted.zip,
  }).catch((err) => {
    console.error('[inbound/hubbell] Address match failed', err);
    return [];
  });

  // Determine auto-match status
  const topCandidate = candidates[0] ?? null;
  const autoConfident = topCandidate !== null && topCandidate.confidence >= 85 && (
    candidates.length === 1 || topCandidate.confidence - (candidates[1]?.confidence ?? 0) >= 20
  );

  const matchStatus = topCandidate === null ? 'unmatched'
    : autoConfident ? 'matched'
    : 'pending';

  const db = getDb();

  // Insert email record
  const [emailRow] = await db.insert(hubbellEmails).values({
    messageId:            messageId ?? null,
    fromEmail,
    fromName:             fromName ?? null,
    subject:              subjectText,
    bodyText:             text ?? null,
    emailType:            extracted.emailType,
    extractedPoNumber:    extracted.poNumber   ?? null,
    extractedWoNumber:    extracted.woNumber   ?? null,
    extractedAddress:     extracted.address    ?? null,
    extractedCity:        extracted.city       ?? null,
    extractedState:       extracted.state      ?? null,
    extractedZip:         extracted.zip        ?? null,
    extractedAmount:      extracted.amount != null ? String(extracted.amount) : null,
    extractedDescription: extracted.description ?? null,
    matchStatus,
    confirmedSoId:     autoConfident ? topCandidate!.soId   : null,
    confirmedCustCode: autoConfident ? topCandidate!.custCode : null,
    confirmedCustName: autoConfident ? topCandidate!.custName : null,
    matchConfidence:   topCandidate ? String(topCandidate.confidence) : null,
    receivedAt,
  }).returning({ id: hubbellEmails.id });

  const emailId = emailRow.id;

  // Store candidates
  if (candidates.length > 0) {
    await db.insert(hubbellEmailCandidates).values(
      candidates.map((c) => ({
        emailId,
        soId:          c.soId,
        systemId:      c.systemId ?? null,
        custCode:      c.custCode ?? null,
        custName:      c.custName ?? null,
        reference:     c.reference ?? null,
        shiptoAddress: c.shiptoAddress ?? null,
        shiptoCity:    c.shiptoCity ?? null,
        shiptoState:   c.shiptoState ?? null,
        shiptoZip:     c.shiptoZip ?? null,
        confidence:    String(c.confidence),
        matchReasons:  c.matchReasons,
        rank:          c.rank,
      }))
    );
  }

  console.log(
    `[inbound/hubbell] ${matchStatus} | ${extracted.emailType.toUpperCase()} | ` +
    `PO:${extracted.poNumber ?? '-'} WO:${extracted.woNumber ?? '-'} | ` +
    `addr:"${extracted.address ?? ''} ${extracted.city ?? ''}" | ` +
    `top candidate: SO ${topCandidate?.soId ?? 'none'} @ ${topCandidate?.confidence ?? 0}% | ` +
    `from: ${fromEmail}`
  );

  return NextResponse.json({
    ok: true,
    emailId,
    matchStatus,
    candidateCount: candidates.length,
    topMatch: topCandidate ? { soId: topCandidate.soId, confidence: topCandidate.confidence } : null,
  });
}
