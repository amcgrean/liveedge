import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getDb } from '../../../../../../db/index';
import { hubbellEmails } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getErpSql } from '../../../../../../db/supabase';

type Params = Promise<{ soId: string }>;

export type SoRow = {
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
  ar_total: string | null;
};

// GET /api/admin/hubbell/jobs/[soId]
// Single-pass: emails (bids DB) + ERP CTE (header + related SOs + AR per SO) run in parallel.
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { soId } = await params;
  const db     = getDb();
  const erpSql = getErpSql();

  // Both queries run in parallel — DB emails and the ERP CTE are independent.
  const [allEmails, relatedRows] = await Promise.all([
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

    // Single CTE: anchor SO → all SOs at same address → AR open per SO.
    // Eliminates the sequential header-then-related-SOs pattern.
    erpSql<SoRow[]>`
      WITH anchor AS (
        SELECT
          TRIM(cust_code)        AS cust_code,
          TRIM(shipto_address_1) AS addr
        FROM agility_so_header
        WHERE so_id::text = ${soId}
          AND is_deleted = false
        LIMIT 1
      )
      SELECT
        soh.so_id::text                AS so_id,
        TRIM(soh.cust_code)            AS cust_code,
        soh.cust_name,
        soh.reference,
        TRIM(soh.po_number)            AS po_number,
        soh.sale_type,
        soh.so_status,
        soh.salesperson,
        soh.expect_date::text          AS expect_date,
        soh.shipto_address_1,
        soh.shipto_city,
        soh.shipto_state,
        soh.shipto_zip,
        ar.ar_total
      FROM agility_so_header soh
      JOIN anchor a
        ON  TRIM(soh.cust_code)        = a.cust_code
        AND TRIM(soh.shipto_address_1) = a.addr
      LEFT JOIN LATERAL (
        SELECT SUM(ar.open_amt)::text AS ar_total
        FROM agility_shipments sh
        JOIN agility_ar_open ar
          ON ar.ref_num = sh.shipment_num::text
         AND ar.is_deleted = false
         AND ar.open_flag  = true
        WHERE sh.so_id::text = soh.so_id::text
          AND sh.is_deleted  = false
      ) ar ON true
      WHERE soh.is_deleted = false
      ORDER BY soh.so_id DESC
      LIMIT 50
    `.catch((err) => {
      console.error('[hubbell/jobs] ERP CTE failed', err);
      return [] as SoRow[];
    }),
  ]);

  const relatedSOs = relatedRows;
  const soHeader: SoRow | null = relatedRows.find((r) => r.so_id === soId) ?? null;

  // Deduplicate emails by PO/WO number — keep the most recently received per unique key.
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

  const totalAmount = emails.reduce((sum, e) => sum + (parseFloat(e.extractedAmount ?? '0') || 0), 0);
  const poCount     = emails.filter((e) => e.emailType === 'po').length;
  const woCount     = emails.filter((e) => e.emailType === 'wo').length;

  return NextResponse.json({
    soId,
    soHeader,
    emails,
    relatedSOs,
    summary: { totalAmount, poCount, woCount, emailCount: emails.length, duplicateCount },
  });
}
