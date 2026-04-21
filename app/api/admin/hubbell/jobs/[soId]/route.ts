import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb } from '../../../../../../db/index';
import { hubbellEmails } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getErpSql } from '../../../../../../db/supabase';

type Params = Promise<{ soId: string }>;

// GET /api/admin/hubbell/jobs/[soId]
// Returns confirmed emails for a sales order, deduplicated by PO/WO number.
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { soId } = await params;
  const db = getDb();

  // All emails confirmed/matched to this SO, newest first
  const allEmails = await db.select({
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
    .orderBy(desc(hubbellEmails.receivedAt));

  // Deduplicate by PO/WO number — keep the most recently received email per unique order number.
  // Emails with no PO or WO number are kept as-is (they may be general job correspondence).
  type EmailRow = (typeof allEmails)[0];
  const seenKeys = new Set<string>();
  const emails: EmailRow[] = [];
  let duplicateCount = 0;

  for (const email of allEmails) {
    const key = email.extractedPoNumber ?? email.extractedWoNumber ?? null;
    if (key) {
      if (seenKeys.has(key)) {
        duplicateCount++;
        continue;
      }
      seenKeys.add(key);
    }
    emails.push(email);
  }

  // Fetch SO header from ERP for context
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

  let soHeader: SoHeader | null = null;
  try {
    const erpSql = getErpSql();
    const [row] = await erpSql<SoHeader[]>`
      SELECT
        so_id::text,
        TRIM(cust_code)  AS cust_code,
        cust_name,
        reference,
        po_number,
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
    `;
    soHeader = row ?? null;
  } catch (err) {
    console.error('[hubbell/jobs] SO header fetch failed', err);
  }

  // Summary stats — amounts counted once per unique PO/WO (deduplicated set)
  const totalAmount = emails.reduce((sum, e) => sum + (parseFloat(e.extractedAmount ?? '0') || 0), 0);
  const poCount = emails.filter((e) => e.emailType === 'po').length;
  const woCount = emails.filter((e) => e.emailType === 'wo').length;

  return NextResponse.json({
    soId,
    soHeader,
    emails,
    summary: { totalAmount, poCount, woCount, emailCount: emails.length, duplicateCount },
  });
}
