// POST /api/admin/hubbell/payments/import
//
// Backward-compatible wrapper around the new hubbell_checks / hubbell_check_lines
// model (introduced in migration 0026). The monthly recon agent on the PC
// still posts a flat array of (doc_type, doc_number, check_number, paid_amount,
// payment_date) rows; this route groups them by check_number and upserts each
// check via the same wipe-and-replace tx semantics used by
// /api/admin/hubbell/checks/upload.
//
// The legacy endpoint shape is preserved so the PC scripts don't need updating
// during the Phase 3 rollout. Once the Pi daily check ingest replaces the
// monthly batch (Phase 3d), this endpoint can be deprecated.
//
// Auth: Authorization: Bearer $HUBBELL_UPLOAD_TOKEN
// Body:
//   {
//     "source_run_id": "monthly_recon_2026_04",
//     "payments": [
//       {
//         "doc_type": "po",
//         "doc_number": "042072",
//         "check_number": "014777",
//         "paid_amount": 1300.42,
//         "payment_date": "2026-04-22"   // optional
//       },
//       ...
//     ]
//   }
//
// Behavior:
//   - Groups by check_number.
//   - For each check, builds a canonical line set and upserts via the same
//     INSERT / unchanged / REPLACE branches the checks/upload route uses.
//   - `payment_date` from the legacy shape becomes `invoice_date` on the
//     resulting check_lines (closest semantic equivalent — the recon agent's
//     payment_date is actually the invoice date stamped on the check line).
//   - Refreshes hubbell_documents rollups across every (doc_type, doc_number)
//     touched.
//
// Special case: empty `payments` array triggers a rollup-refresh sweep only
// (flips docs with no payments from NULL → 'unpaid'). Same semantics as
// before migration 0026.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../db/index';
import { canonicalCheckHash, type CanonicalCheckLine } from '../../../../../../src/lib/hubbell/check-hash';
import {
  refreshPaymentRollupForDocs,
  refreshPaymentRollupAll,
} from '../../../../../../src/lib/hubbell/payment-rollup';
import { normalizeDocNumber } from '../../../../../../src/lib/hubbell/po-number-parser';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  paidAmount: number;
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
    paidAmount: amountNum,
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

  // Empty payments array → rollup-refresh sweep only (legacy behavior).
  if (body.payments.length === 0) {
    const db = getDb();
    await refreshPaymentRollupAll(db);
    return NextResponse.json({
      status: 'ok',
      inserted: 0,
      replaced: 0,
      unchanged: 0,
      rejected: rowErrors,
      refresh_only: true,
    });
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: 'No valid payment rows', row_errors: rowErrors },
      { status: 400 },
    );
  }

  // Group by check_number.
  const byCheck = new Map<string, Parsed[]>();
  for (const p of parsed) {
    const arr = byCheck.get(p.checkNumber) ?? [];
    arr.push(p);
    byCheck.set(p.checkNumber, arr);
  }

  const db = getDb();

  let inserted = 0;
  let replaced = 0;
  let unchanged = 0;
  const touchedDocs: Array<{ docType: string; docNumber: string }> = [];

  for (const [checkNumber, rows] of byCheck.entries()) {
    // Deterministic line_seq from sorted (doc_type, doc_number) order. Stable
    // across re-runs so the canonical hash converges.
    const sorted = [...rows].sort(
      (a, b) =>
        a.docType.localeCompare(b.docType) ||
        a.docNumber.localeCompare(b.docNumber),
    );
    const linesWithSeq = sorted.map((r, i) => ({ ...r, lineSeq: i + 1 }));
    const canonicalLines: CanonicalCheckLine[] = linesWithSeq.map((l) => ({
      doc_type: l.docType,
      doc_number: l.docNumber,
      line_seq: l.lineSeq,
      payment_amount: l.paidAmount,
      memo: null,
      invoice_date: l.paymentDate,
      gross_amount: null,
    }));
    const sourceHash = canonicalCheckHash({
      check_number: checkNumber,
      lines: canonicalLines,
    });
    const totalAmount = linesWithSeq
      .reduce((acc, l) => acc + l.paidAmount, 0)
      .toFixed(2);
    const checkDate =
      linesWithSeq
        .map((l) => l.paymentDate)
        .filter((d): d is string => d != null)
        .sort()[0] ?? null;

    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: schema.hubbellChecks.id,
          sourceHash: schema.hubbellChecks.sourceHash,
        })
        .from(schema.hubbellChecks)
        .where(eq(schema.hubbellChecks.checkNumber, checkNumber))
        .limit(1);

      if (existing.length === 0) {
        const [created] = await tx
          .insert(schema.hubbellChecks)
          .values({
            checkNumber,
            checkDate,
            totalAmount,
            paymentCount: linesWithSeq.length,
            sourceHash,
            sourceRunId,
          })
          .returning({ id: schema.hubbellChecks.id });
        await tx.insert(schema.hubbellCheckLines).values(
          linesWithSeq.map((l) => ({
            checkId: created.id,
            docType: l.docType,
            docNumber: l.docNumber,
            invoiceDate: l.paymentDate,
            paymentAmount: l.paidAmount.toFixed(2),
            grossAmount: null,
            memo: null,
            lineSeq: l.lineSeq,
          })),
        );
        return 'inserted' as const;
      }
      const ex = existing[0];
      if (ex.sourceHash === sourceHash) {
        await tx
          .update(schema.hubbellChecks)
          .set({ lastSeenAt: dsql`now()` })
          .where(eq(schema.hubbellChecks.id, ex.id));
        return 'unchanged' as const;
      }
      await tx
        .delete(schema.hubbellCheckLines)
        .where(eq(schema.hubbellCheckLines.checkId, ex.id));
      await tx.insert(schema.hubbellCheckLines).values(
        linesWithSeq.map((l) => ({
          checkId: ex.id,
          docType: l.docType,
          docNumber: l.docNumber,
          invoiceDate: l.paymentDate,
          paymentAmount: l.paidAmount.toFixed(2),
          grossAmount: null,
          memo: null,
          lineSeq: l.lineSeq,
        })),
      );
      await tx
        .update(schema.hubbellChecks)
        .set({
          checkDate,
          totalAmount,
          paymentCount: linesWithSeq.length,
          sourceHash,
          sourceRunId,
          lastSeenAt: dsql`now()`,
        })
        .where(eq(schema.hubbellChecks.id, ex.id));
      return 'replaced' as const;
    });

    if (result === 'inserted') inserted++;
    else if (result === 'replaced') replaced++;
    else unchanged++;

    if (result !== 'unchanged') {
      for (const r of linesWithSeq) {
        touchedDocs.push({ docType: r.docType, docNumber: r.docNumber });
      }
    }
  }

  // Single bulk rollup refresh across all touched docs.
  try {
    await refreshPaymentRollupForDocs(db, touchedDocs);
  } catch (err) {
    console.error('[hubbell payments import] rollup refresh failed', err);
  }

  return NextResponse.json({
    status: 'ok',
    inserted,
    replaced,
    unchanged,
    rejected: rowErrors,
  });
}
