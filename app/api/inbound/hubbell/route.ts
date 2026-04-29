import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getDb } from '../../../../db/index';
import { hubbellEmails, hubbellEmailCandidates } from '../../../../db/schema';
import { eq, and, or, isNotNull } from 'drizzle-orm';
import { extractEmailData } from '@/lib/hubbell/extractor';
import { matchAddress } from '@/lib/hubbell/address-matcher';
import { checkAddressCache } from '@/lib/hubbell/address-cache';
import { getErpSql } from '../../../../db/supabase';

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

// Strip HTML tags for plain-text fallback
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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

  // Only handle emails addressed to hubbell@beisser.cloud
  const toAddresses = payload.data.to ?? [];
  if (!toAddresses.some(addr => /hubbell@beisser\.cloud$/i.test(addr))) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { from, subject, text, html, messageId } = payload.data;
  const receivedAt = payload.created_at ? new Date(payload.created_at) : new Date();
  const { email: fromEmail, name: fromName } = parseFrom(from);
  const subjectText = subject ?? '(no subject)';

  // Prefer plain text; fall back to stripped HTML if text body is absent
  const bodyText = text ?? (html ? stripHtml(html) : '');

  // Extract structured data from email content
  const extracted = extractEmailData(subjectText, bodyText);

  let matchStatus: string;
  let confirmedSoId:     string | null = null;
  let confirmedCustCode: string | null = null;
  let confirmedCustName: string | null = null;
  let topConfidence:     number | null = null;
  let candidates: Awaited<ReturnType<typeof matchAddress>> = [];

  // ── Priority 1: match via agility_so_header.po_number field ──────────────
  // Starting next week, Beisser SOs will have the Hubbell WO/PO number stored
  // in the customer PO field. This gives a 100%-confidence exact match.
  type SoPoRow = { so_id: string; system_id: string; cust_code: string | null; cust_name: string | null };
  let poFieldMatch: SoPoRow | null = null;

  const poNumbers = [extracted.woNumber, extracted.poNumber].filter(Boolean) as string[];
  if (poNumbers.length > 0) {
    try {
      const erpSql = getErpSql();
      for (const poNum of poNumbers) {
        const rows = await erpSql<SoPoRow[]>`
          SELECT so_id::text, system_id, TRIM(cust_code) AS cust_code, cust_name
          FROM agility_so_header
          WHERE TRIM(po_number) = ${poNum.trim()}
            AND is_deleted = false
          LIMIT 2
        `;
        if (rows.length === 1) { poFieldMatch = rows[0]; break; }
      }
    } catch (err) {
      console.error('[inbound/hubbell] PO field match failed', err);
    }
  }

  // ── Priority 1.5: same PO/WO already confirmed in a previous email ──────────
  // Catches forwarded duplicates and follow-up emails for the same order.
  type SiblingRow = { confirmedSoId: string; confirmedCustCode: string | null; confirmedCustName: string | null };
  let siblingMatch: SiblingRow | null = null;

  if (!poFieldMatch && poNumbers.length > 0) {
    try {
      const db15 = getDb();
      const poWoConds = [
        ...(extracted.poNumber ? [eq(hubbellEmails.extractedPoNumber, extracted.poNumber)] : []),
        ...(extracted.woNumber ? [eq(hubbellEmails.extractedWoNumber, extracted.woNumber)] : []),
      ];
      const [existing] = await db15
        .select({
          confirmedSoId:     hubbellEmails.confirmedSoId,
          confirmedCustCode: hubbellEmails.confirmedCustCode,
          confirmedCustName: hubbellEmails.confirmedCustName,
        })
        .from(hubbellEmails)
        .where(and(
          eq(hubbellEmails.matchStatus, 'confirmed'),
          isNotNull(hubbellEmails.confirmedSoId),
          or(...poWoConds),
        ))
        .limit(1);
      if (existing?.confirmedSoId) siblingMatch = existing as SiblingRow;
    } catch (err) {
      console.error('[inbound/hubbell] sibling match check failed', err);
    }
  }

  // ── Priority 2: learned address cache ─────────────────────────────────────
  const cacheHit = (!poFieldMatch && !siblingMatch && extracted.address)
    ? await checkAddressCache(extracted.address).catch(() => null)
    : null;

  if (poFieldMatch) {
    matchStatus       = 'confirmed';
    confirmedSoId     = poFieldMatch.so_id;
    confirmedCustCode = poFieldMatch.cust_code;
    confirmedCustName = poFieldMatch.cust_name;
    topConfidence     = 100;
  } else if (siblingMatch) {
    matchStatus       = 'confirmed';
    confirmedSoId     = siblingMatch.confirmedSoId;
    confirmedCustCode = siblingMatch.confirmedCustCode;
    confirmedCustName = siblingMatch.confirmedCustName;
    topConfidence     = 100;
  } else if (cacheHit) {
    matchStatus       = 'confirmed';
    confirmedSoId     = cacheHit.soId;
    confirmedCustCode = cacheHit.custCode;
    confirmedCustName = cacheHit.custName;
    topConfidence     = 95;
  } else {
    // Run address matching against agility_so_header
    candidates = await matchAddress({
      address: extracted.address,
      city:    extracted.city,
      state:   extracted.state,
      zip:     extracted.zip,
    }).catch((err) => {
      console.error('[inbound/hubbell] Address match failed', err);
      return [];
    });

    const topCandidate = candidates[0] ?? null;
    const autoConfident = topCandidate !== null && topCandidate.confidence >= 85 && (
      candidates.length === 1 || topCandidate.confidence - (candidates[1]?.confidence ?? 0) >= 20
    );

    matchStatus = topCandidate === null ? 'unmatched'
      : autoConfident ? 'matched'
      : 'pending';

    if (topCandidate) {
      topConfidence = topCandidate.confidence;
      if (autoConfident) {
        confirmedSoId     = topCandidate.soId;
        confirmedCustCode = topCandidate.custCode;
        confirmedCustName = topCandidate.custName;
      }
    }
  }

  const db = getDb();

  // Insert email record — ignore exact duplicates (same Message-ID forwarded twice)
  const inserted = await db.insert(hubbellEmails).values({
    messageId:             messageId ?? null,
    fromEmail,
    fromName:              fromName ?? null,
    subject:               subjectText,
    bodyText:              bodyText || null,
    emailType:             extracted.emailType,
    extractedPoNumber:     extracted.poNumber    ?? null,
    extractedWoNumber:     extracted.woNumber    ?? null,
    extractedAddress:      extracted.address     ?? null,
    extractedCity:         extracted.city        ?? null,
    extractedState:        extracted.state       ?? null,
    extractedZip:          extracted.zip         ?? null,
    extractedAmount:       extracted.amount         != null ? String(extracted.amount)          : null,
    extractedTaxAmount:    extracted.taxAmount      != null ? String(extracted.taxAmount)        : null,
    extractedShipping:     extracted.shippingAmount != null ? String(extracted.shippingAmount)  : null,
    extractedNeedByDate:   extracted.needByDate    ?? null,
    extractedContactName:  extracted.contactName   ?? null,
    extractedContactPhone: extracted.contactPhone  ?? null,
    extractedDescription:  extracted.description   ?? null,
    matchStatus,
    confirmedSoId,
    confirmedCustCode,
    confirmedCustName,
    matchConfidence:   topConfidence != null ? String(topConfidence) : null,
    confirmedBy:       poFieldMatch ? 'po_number_field' : siblingMatch ? 'sibling_match' : cacheHit ? 'address_cache' : null,
    confirmedAt:       (poFieldMatch || siblingMatch || cacheHit) ? receivedAt : null,
    receivedAt,
  }).onConflictDoNothing().returning({ id: hubbellEmails.id });

  // Same Message-ID already stored — exact duplicate, acknowledge and return
  if (inserted.length === 0) {
    console.log(`[inbound/hubbell] Duplicate message-id ${messageId} — skipped`);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const emailId = inserted[0].id;

  // Store candidates (only when we ran the matcher, not on cache hits)
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
    `amount:${extracted.amount ?? '-'} | ` +
    `${poFieldMatch ? `po_number match SO ${poFieldMatch.so_id}` : siblingMatch ? `sibling match SO ${siblingMatch.confirmedSoId}` : cacheHit ? `cache hit SO ${cacheHit.soId}` : `top SO ${candidates[0]?.soId ?? 'none'} @ ${candidates[0]?.confidence ?? 0}%`} | ` +
    `from: ${fromEmail}`
  );

  return NextResponse.json({
    ok: true,
    emailId,
    matchStatus,
    poFieldMatch:  !!poFieldMatch,
    siblingMatch:  !!siblingMatch,
    cacheHit:      !!cacheHit,
    candidateCount: candidates.length,
    topMatch: siblingMatch
      ? { soId: siblingMatch.confirmedSoId, confidence: 100 }
      : cacheHit
      ? { soId: cacheHit.soId, confidence: 95 }
      : candidates[0] ? { soId: candidates[0].soId, confidence: candidates[0].confidence } : null,
  });
}
