// Source-agnostic Hubbell email processor.
// Behavior matches /api/inbound/hubbell/route.ts.

import { eq, and, or, isNotNull } from 'drizzle-orm';
import { getDb } from '../../../db/index';
import { hubbellEmails, hubbellEmailCandidates } from '../../../db/schema';
import { extractEmailData } from '@/lib/hubbell/extractor';
import { matchAddress } from '@/lib/hubbell/address-matcher';
import { checkAddressCache } from '@/lib/hubbell/address-cache';
import { getErpSql } from '../../../db/supabase';
import type { NormalizedInboundEmail } from './types';

function parseFrom(from: string): { email: string; name: string | null } {
  const m = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  return { name: null, email: from.trim() };
}

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

export type HubbellProcessResult = {
  emailId:         string | null;
  matchStatus:     string;
  poFieldMatch:    boolean;
  siblingMatch:    boolean;
  cacheHit:        boolean;
  candidateCount:  number;
  topMatch:        { soId: string; confidence: number } | null;
  duplicate:       boolean;
};

export async function processHubbellEmail(email: NormalizedInboundEmail): Promise<HubbellProcessResult> {
  const { from, subject, text, html, messageId, receivedAt } = email;
  const { email: fromEmail, name: fromName } = parseFrom(from);
  const subjectText = subject ?? '(no subject)';
  const bodyText = text ?? (html ? stripHtml(html) : '');

  const extracted = extractEmailData(subjectText, bodyText);

  let matchStatus: string;
  let confirmedSoId:     string | null = null;
  let confirmedCustCode: string | null = null;
  let confirmedCustName: string | null = null;
  let topConfidence:     number | null = null;
  let candidates: Awaited<ReturnType<typeof matchAddress>> = [];

  // Priority 1: PO field match
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
      console.error('[process-hubbell] PO field match failed', err);
    }
  }

  // Priority 1.5: same PO/WO already confirmed
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
      console.error('[process-hubbell] sibling match check failed', err);
    }
  }

  // Priority 2: address cache
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
    candidates = await matchAddress({
      address: extracted.address,
      city:    extracted.city,
      state:   extracted.state,
      zip:     extracted.zip,
    }).catch((err) => {
      console.error('[process-hubbell] Address match failed', err);
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

  if (inserted.length === 0) {
    console.log(`[process-hubbell] Duplicate message-id ${messageId} — skipped`);
    return {
      emailId:        null,
      matchStatus,
      poFieldMatch:   !!poFieldMatch,
      siblingMatch:   !!siblingMatch,
      cacheHit:       !!cacheHit,
      candidateCount: 0,
      topMatch:       null,
      duplicate:      true,
    };
  }

  const emailIdRow = inserted[0].id;

  if (candidates.length > 0) {
    await db.insert(hubbellEmailCandidates).values(
      candidates.map((c) => ({
        emailId:       emailIdRow,
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
    `[process-hubbell] ${matchStatus} | ${extracted.emailType.toUpperCase()} | ` +
    `PO:${extracted.poNumber ?? '-'} WO:${extracted.woNumber ?? '-'} | ` +
    `addr:"${extracted.address ?? ''} ${extracted.city ?? ''}" | ` +
    `from: ${fromEmail}`
  );

  return {
    emailId:        emailIdRow,
    matchStatus,
    poFieldMatch:   !!poFieldMatch,
    siblingMatch:   !!siblingMatch,
    cacheHit:       !!cacheHit,
    candidateCount: candidates.length,
    topMatch: siblingMatch
      ? { soId: siblingMatch.confirmedSoId, confidence: 100 }
      : cacheHit
      ? { soId: cacheHit.soId, confidence: 95 }
      : candidates[0] ? { soId: candidates[0].soId, confidence: candidates[0].confidence } : null,
    duplicate: false,
  };
}
