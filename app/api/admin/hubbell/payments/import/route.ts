// POST /api/admin/hubbell/payments/import
//
// Bulk-imports payment activity per Hubbell PO/WO. Idempotent: keyed on
// (doc_type, doc_number, check_number). Re-running with the same rows
// updates paid_amount / payment_date if they changed, otherwise is a no-op.
//
// Source of truth is the monthly reconciliation in
// C:\Users\amcgrean\python\hubbell test\ — it joins Hubbell portal check
// detail with AgilitySQL AR. The local agent posts a batch here after each
// run.
//
// Auth: Authorization: Bearer $HUBBELL_UPLOAD_TOKEN (same token as the upload
// endpoint — service-to-service, not user session).
//
// Body: application/json
//   {
//     "source_run_id": "monthly_recon_2026_04",
//     "payments": [
//       {
//         "doc_type": "po",
//         "doc_number": "042072",
//         "check_number": "014777",
//         "paid_amount": 1300.42,
//         "payment_date": "2026-04-22"   // optional, ISO yyyy-mm-dd
//       },
//       ...
//     ]
//   }
//
// After insert, refreshes payment rollups on every hubbell_documents row
// touched: paid_amount_total = SUM(paid_amount), last_payment_date =
// MAX(payment_date), last_check_number = check from the most recent payment,
// payment_status derived from paid_total vs extracted_total.

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../db/index';
import { normalizeDocNumber } from '../../../../../../src/lib/hubbell/po-number-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PaymentInput = {
  doc_type?: unknown;
  doc_number?: unknown;
  check_number?: unknown;
  paid_amount?: unknown;
  payment_date?: unknown;
};

type Parsed = {
  docType: 'po' | 'wo';
  docNumber: string;
  checkNumber: string;
  paidAmount: string;
  paymentDate: string | null;
};

function parseRow(row: PaymentInput): Parsed | string {
  const rawType = String(row.doc_type ?? '').toLowerCase().trim();
  if (rawType !== 'po' && rawType !== 'wo') return `invalid doc_type: ${rawType}`;
  const rawDocNumber = String(row.doc_number ?? '').trim();
  if (!rawDocNumber) return 'missing doc_number';
  const checkNumber = String(row.check_number ?? '').trim();
  if (!checkNumber) return 'missing check_number';
  const amountNum =
    typeof row.paid_amount === 'number' ? row.paid_amount : Number(row.paid_amount);
  if (!Number.isFinite(amountNum)) return `invalid paid_amount: ${row.paid_amount}`;
  let paymentDate: string | null = null;
  if (row.payment_date) {
    const d = new Date(String(row.payment_date));
    if (Number.isFinite(d.getTime())) {
      paymentDate = d.toISOString().slice(0, 10);
    }
  }
  return {
    docType: rawType,
    docNumber: normalizeDocNumber(rawDocNumber),
    checkNumber,
    paidAmount: amountNum.toFixed(2),
    paymentDate,
  };
}

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let body: { source_run_id?: unknown; payments?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.payments)) {
    return NextResponse.json({ error: '`payments` must be an array' }, { status: 400 });
  }
  const sourceRunId =
    typeof body.source_run_id === 'string' && body.source_run_id.trim()
      ? body.source_run_id.trim()
      : null;

  const parsed: Parsed[] = [];
  const rowErrors: Array<{ index: number; reason: string }> = [];
  body.payments.forEach((row, i) => {
    const r = parseRow(row as PaymentInput);
    if (typeof r === 'string') rowErrors.push({ index: i, reason: r });
    else parsed.push(r);
  });

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: 'No valid payment rows', row_errors: rowErrors },
      { status: 400 },
    );
  }

  const db = getDb();

  // Upsert payments. ON CONFLICT (doc_type, doc_number, check_number) DO UPDATE
  // so re-importing the same row with corrected amount/date overwrites the
  // earlier value.
  let inserted = 0;
  let updated = 0;
  // Batch to keep parameter counts manageable
  const BATCH = 200;
  for (let i = 0; i < parsed.length; i += BATCH) {
    const chunk = parsed.slice(i, i + BATCH);
    const results = await db
      .insert(schema.hubbellDocumentPayments)
      .values(
        chunk.map((p) => ({
          docType: p.docType,
          docNumber: p.docNumber,
          checkNumber: p.checkNumber,
          paidAmount: p.paidAmount,
          paymentDate: p.paymentDate,
          sourceRunId,
        })),
      )
      .onConflictDoUpdate({
        target: [
          schema.hubbellDocumentPayments.docType,
          schema.hubbellDocumentPayments.docNumber,
          schema.hubbellDocumentPayments.checkNumber,
        ],
        set: {
          paidAmount: dsql`EXCLUDED.paid_amount`,
          paymentDate: dsql`EXCLUDED.payment_date`,
          sourceRunId: dsql`EXCLUDED.source_run_id`,
          updatedAt: dsql`now()`,
        },
      })
      .returning({
        id: schema.hubbellDocumentPayments.id,
        createdAt: schema.hubbellDocumentPayments.createdAt,
        updatedAt: schema.hubbellDocumentPayments.updatedAt,
      });
    for (const r of results) {
      // Approximate insert vs update count: rows whose created_at == updated_at
      // are fresh inserts; otherwise existing rows that got updated.
      if (r.createdAt.getTime() === r.updatedAt.getTime()) inserted++;
      else updated++;
    }
  }

  // Link payment rows to their documents where the doc exists. Safe re-run.
  const linkResult = await db.execute(dsql`
    UPDATE bids.hubbell_document_payments AS p
       SET document_id = d.id
      FROM bids.hubbell_documents AS d
     WHERE p.document_id IS NULL
       AND d.doc_type   = p.doc_type
       AND d.doc_number = p.doc_number
  `);

  // Refresh payment rollups on every document we just touched. Aggregate from
  // hubbell_document_payments → hubbell_documents.
  await db.execute(dsql`
    WITH agg AS (
      SELECT
        p.doc_type,
        p.doc_number,
        SUM(p.paid_amount)                                   AS paid_total,
        MAX(p.payment_date)                                  AS last_date,
        (ARRAY_AGG(p.check_number ORDER BY p.payment_date DESC NULLS LAST))[1]
                                                             AS last_check
      FROM bids.hubbell_document_payments p
      GROUP BY p.doc_type, p.doc_number
    )
    UPDATE bids.hubbell_documents d
       SET paid_amount_total = a.paid_total,
           last_payment_date = a.last_date,
           last_check_number = a.last_check,
           payment_status = CASE
             WHEN d.extracted_total IS NULL OR d.extracted_total = 0 THEN NULL
             WHEN a.paid_total >= d.extracted_total                   THEN 'paid'
             WHEN a.paid_total > 0                                    THEN 'partial'
             ELSE                                                          'unpaid'
           END,
           updated_at = now()
      FROM agg a
     WHERE d.doc_type   = a.doc_type
       AND d.doc_number = a.doc_number
  `);

  return NextResponse.json({
    status: 'ok',
    inserted,
    updated,
    linked: typeof linkResult === 'object' && linkResult !== null && 'rowCount' in linkResult
      ? (linkResult as { rowCount: number | null }).rowCount ?? null
      : null,
    rejected: rowErrors,
  });
}
