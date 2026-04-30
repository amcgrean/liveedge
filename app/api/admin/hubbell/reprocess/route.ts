import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { hubbellEmails, hubbellEmailCandidates } from '../../../../../db/schema';
import { eq, inArray, and, or, isNotNull } from 'drizzle-orm';
import { extractEmailData } from '@/lib/hubbell/extractor';
import { matchAddress } from '@/lib/hubbell/address-matcher';
import { checkAddressCache } from '@/lib/hubbell/address-cache';
import { getErpSql } from '../../../../../db/supabase';

// POST /api/admin/hubbell/reprocess
// Re-extracts + re-matches unmatched (and optionally pending) emails.
// Processes in batches of 50 to stay within serverless time limits.
// Body: { statuses?: string[]; limit?: number }

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const statuses: string[] = body.statuses ?? ['unmatched'];
  const batchLimit: number = Math.min(body.limit ?? 200, 500);

  const db = getDb();

  const rows = await db
    .select({
      id:        hubbellEmails.id,
      subject:   hubbellEmails.subject,
      bodyText:  hubbellEmails.bodyText,
      extractedPoNumber: hubbellEmails.extractedPoNumber,
      extractedWoNumber: hubbellEmails.extractedWoNumber,
    })
    .from(hubbellEmails)
    .where(inArray(hubbellEmails.matchStatus, statuses))
    .limit(batchLimit);

  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, matched: 0, pending: 0, stillUnmatched: 0 });
  }

  const erpSql = getErpSql();
  type SoPoRow = { so_id: string; system_id: string; cust_code: string | null; cust_name: string | null };

  let matched = 0;
  let pending = 0;
  let stillUnmatched = 0;

  for (const row of rows) {
    try {
      const subject = row.subject ?? '';
      const bodyText = row.bodyText ?? '';

      // Re-extract with updated parser (catches Service Order numbers + addresses)
      const extracted = extractEmailData(subject, bodyText);

      const poNumbers = [extracted.woNumber, extracted.poNumber].filter(Boolean) as string[];

      // Priority 1: PO field match
      let poFieldMatch: SoPoRow | null = null;
      for (const poNum of poNumbers) {
        const hits = await erpSql<SoPoRow[]>`
          SELECT so_id::text, system_id, TRIM(cust_code) AS cust_code, cust_name
          FROM agility_so_header
          WHERE TRIM(po_number) = ${poNum.trim()} AND is_deleted = false
          LIMIT 2
        `;
        if (hits.length === 1) { poFieldMatch = hits[0]; break; }
      }

      // Priority 1.5: sibling match
      type SiblingRow = { confirmedSoId: string; confirmedCustCode: string | null; confirmedCustName: string | null };
      let siblingMatch: SiblingRow | null = null;
      if (!poFieldMatch && poNumbers.length > 0) {
        const poWoConds = [
          ...(extracted.poNumber ? [eq(hubbellEmails.extractedPoNumber, extracted.poNumber)] : []),
          ...(extracted.woNumber ? [eq(hubbellEmails.extractedWoNumber, extracted.woNumber)] : []),
        ];
        const [existing] = await db
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
      }

      // Priority 2: address cache
      const cacheHit = (!poFieldMatch && !siblingMatch && extracted.address)
        ? await checkAddressCache(extracted.address).catch(() => null)
        : null;

      let newStatus: string;
      let confirmedSoId:     string | null = null;
      let confirmedCustCode: string | null = null;
      let confirmedCustName: string | null = null;
      let topConfidence:     number | null = null;
      let confirmedBy:       string | null = null;
      let candidates: Awaited<ReturnType<typeof matchAddress>> = [];

      if (poFieldMatch) {
        newStatus       = 'confirmed';
        confirmedSoId   = poFieldMatch.so_id;
        confirmedCustCode = poFieldMatch.cust_code;
        confirmedCustName = poFieldMatch.cust_name;
        topConfidence   = 100;
        confirmedBy     = 'po_number_field';
      } else if (siblingMatch) {
        newStatus       = 'confirmed';
        confirmedSoId   = siblingMatch.confirmedSoId;
        confirmedCustCode = siblingMatch.confirmedCustCode;
        confirmedCustName = siblingMatch.confirmedCustName;
        topConfidence   = 100;
        confirmedBy     = 'sibling_match';
      } else if (cacheHit) {
        newStatus       = 'confirmed';
        confirmedSoId   = cacheHit.soId;
        confirmedCustCode = cacheHit.custCode;
        confirmedCustName = cacheHit.custName;
        topConfidence   = 95;
        confirmedBy     = 'address_cache';
      } else {
        candidates = await matchAddress({
          address: extracted.address,
          city:    extracted.city,
          state:   extracted.state,
          zip:     extracted.zip,
        }).catch(() => []);

        const top = candidates[0] ?? null;
        const autoConfident = top !== null && top.confidence >= 85 && (
          candidates.length === 1 || top.confidence - (candidates[1]?.confidence ?? 0) >= 20
        );

        newStatus = top === null ? 'unmatched' : autoConfident ? 'matched' : 'pending';
        if (top) {
          topConfidence = top.confidence;
          if (autoConfident) {
            confirmedSoId   = top.soId;
            confirmedCustCode = top.custCode;
            confirmedCustName = top.custName;
          }
        }
      }

      const now = new Date();

      // Update the email record with re-extracted fields + new match result
      await db.update(hubbellEmails).set({
        emailType:             extracted.emailType,
        extractedPoNumber:     extracted.poNumber    ?? null,
        extractedWoNumber:     extracted.woNumber    ?? null,
        extractedAddress:      extracted.address     ?? null,
        extractedCity:         extracted.city        ?? null,
        extractedState:        extracted.state       ?? null,
        extractedZip:          extracted.zip         ?? null,
        extractedAmount:       extracted.amount         != null ? String(extracted.amount)         : null,
        extractedTaxAmount:    extracted.taxAmount      != null ? String(extracted.taxAmount)       : null,
        extractedShipping:     extracted.shippingAmount != null ? String(extracted.shippingAmount) : null,
        extractedNeedByDate:   extracted.needByDate    ?? null,
        extractedContactName:  extracted.contactName   ?? null,
        extractedContactPhone: extracted.contactPhone  ?? null,
        extractedDescription:  extracted.description   ?? null,
        matchStatus:      newStatus,
        matchConfidence:  topConfidence != null ? String(topConfidence) : null,
        confirmedSoId,
        confirmedCustCode,
        confirmedCustName,
        confirmedBy,
        confirmedAt: (poFieldMatch || siblingMatch || cacheHit) ? now : null,
        updatedAt: now,
      }).where(eq(hubbellEmails.id, row.id));

      // Replace candidates if we re-ran the matcher
      if (candidates.length > 0) {
        await db.delete(hubbellEmailCandidates).where(eq(hubbellEmailCandidates.emailId, row.id));
        await db.insert(hubbellEmailCandidates).values(
          candidates.map((c) => ({
            emailId:       row.id,
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

      if (newStatus === 'matched' || newStatus === 'confirmed') matched++;
      else if (newStatus === 'pending') pending++;
      else stillUnmatched++;
    } catch (err) {
      console.error(`[hubbell/reprocess] error on email ${row.id}`, err);
      stillUnmatched++;
    }
  }

  return NextResponse.json({
    processed:     rows.length,
    matched,
    pending,
    stillUnmatched,
  });
}
