import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb } from '../../../../../../db/index';
import { hubbellEmails } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getErpSql } from '../../../../../../db/supabase';

type Params = Promise<{ soId: string }>;

// GET /api/admin/hubbell/jobs/[soId]
// Returns confirmed emails for a sales order (deduplicated by PO/WO number),
// the SO header, and all related SOs from ERP at the same customer + address
// for the reconciliation view.
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { soId } = await params;
  const db  = getDb();
  const erpSql = getErpSql();

  type SoHeader = {
    so_id: string;
    cust_code: string | null;
    cust_name: string | null;
    reference: string | null;
    po_number: string | null;
    sale_type: string | null;
    so_status: string | null;
    salesperson: string | null;
    expect_date: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
  };

  // Run emails (bids DB) and SO header (ERP) in parallel — they're independent.
  const [allEmails, soHeaderRows] = await Promise.all([
    db.select({
      id:                   hubbellEmails.id,
      fromEmail:            hubbellEmails.fromEmail,
      fromName:             hubbellEmails.fromName,
      subject:              hubbellEmails.subject,
      emailType:            hubbellEmails.emailType,
      matchStatus:          hubbellEmails.matchStatus,
      matchConfidence:      hubbellEmails.matchConfidence,
      extractedPoNumber:    hubbellEmails.extractedPoNumber,
      extractedWoNumber:    hubbellEmails.extractedWoNumber,
      extractedAmount:      hubbellEmails.extractedAmount,
      extractedDescription: hubbellEmails.extractedDescription,
      extractedAddress:     hubbellEmails.extractedAddress,
      extractedCity:        hubbellEmails.extractedCity,
      receivedAt:           hubbellEmails.receivedAt,
    })
      .from(hubbellEmails)
      .where(eq(hubbellEmails.confirmedSoId, soId))
      .orderBy(desc(hubbellEmails.receivedAt)),

    erpSql<SoHeader[]>`
      SELECT
        so_id::text,
        TRIM(cust_code)   AS cust_code,
        cust_name,
        reference,
        TRIM(po_number)   AS po_number,
        sale_type,
        so_status,
        salesperson,
        expect_date::text AS expect_date,
        shipto_address_1,
        shipto_city,
        shipto_state,
        shipto_zip
      FROM agility_so_header
      WHERE so_id::text = ${soId}
        AND is_deleted = false
      LIMIT 1
    `.catch((err) => { console.error('[hubbell/jobs] SO header fetch failed', err); return [] as SoHeader[]; }),
  ]);

  const soHeader: SoHeader | null = soHeaderRows[0] ?? null;

  // Deduplicate emails by PO/WO number — keep the most recently received per unique order number.
  type EmailRow = (typeof allEmails)[0];
  const seenKeys = new Set<string>();
  const emails: EmailRow[] = [];
  let duplicateCount = 0;

  for (const email of allEmails) {
    const key = email.extractedPoNumber ?? email.extractedWoNumber ?? null;
    if (key) {
      if (seenKeys.has(key)) { duplicateCount++; continue; }
      seenKeys.add(key);
    }
    emails.push(email);
  }

  // Related SOs: same cust_code, same shipto_address_1 (exact match — faster than LIKE).
  type RelatedSo = SoHeader;
  let relatedSOs: RelatedSo[] = [];

  if (soHeader?.cust_code) {
    const addr = (soHeader.shipto_address_1 ?? '').trim();
    relatedSOs = await erpSql<RelatedSo[]>`
      SELECT
        so_id::text,
        TRIM(cust_code)   AS cust_code,
        cust_name,
        reference,
        TRIM(po_number)   AS po_number,
        sale_type,
        so_status,
        salesperson,
        expect_date::text AS expect_date,
        shipto_address_1,
        shipto_city,
        shipto_state,
        shipto_zip
      FROM agility_so_header
      WHERE TRIM(cust_code) = ${soHeader.cust_code.trim()}
        AND TRIM(shipto_address_1) = ${addr}
        AND is_deleted = false
      ORDER BY so_id DESC
      LIMIT 50
    `.catch((err) => { console.error('[hubbell/jobs] Related SOs fetch failed', err); return [] as RelatedSo[]; });
  }

  // Summary stats — amounts counted once per unique PO/WO
  const totalAmount = emails.reduce((sum, e) => sum + (parseFloat(e.extractedAmount ?? '0') || 0), 0);
  const poCount = emails.filter((e) => e.emailType === 'po').length;
  const woCount = emails.filter((e) => e.emailType === 'wo').length;

  return NextResponse.json({
    soId,
    soHeader,
    emails,
    relatedSOs,
    summary: { totalAmount, poCount, woCount, emailCount: emails.length, duplicateCount },
  });
}
