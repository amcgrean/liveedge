// POST /api/admin/hubbell/checks/upload
//
// Service-token endpoint called by the Pi daily check scraper for every
// Hubbell check found in Payment History (pgm=marwbvo). Wipes and replaces
// the check's lines inside a transaction when contents change — preserves
// the check's UUID across replaces. Re-POSTs of identical data are no-ops
// (deduped by canonical source_hash).
//
// Auth: Authorization: Bearer $HUBBELL_UPLOAD_TOKEN
// Body: application/json
//   {
//     "check_number": "015800",
//     "source_run_id": "run_2026_05_21_06_00",
//     "check_date": "2026-05-20",
//     "lines": [
//       {
//         "doc_type": "po" | "wo" | "inv",
//         "doc_number": "042150",
//         "line_seq": 1,
//         "payment_amount": 1234.56,
//         "gross_amount": 1234.56,    // optional
//         "memo": "DL00006037",       // optional
//         "invoice_date": "2026-05-15" // optional ISO date
//       }
//     ]
//   }
//
// Response: { status: 'inserted' | 'unchanged' | 'replaced', id, line_count }
//
// After insert/replace, refreshes hubbell_documents rollups for every
// (doc_type, doc_number) touched by this check.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../db/index';
import { canonicalCheckHash, type CanonicalCheckLine } from '../../../../../../src/lib/hubbell/check-hash';
import { refreshPaymentRollupForDocs } from '../../../../../../src/lib/hubbell/payment-rollup';
import { normalizeDocNumber } from '../../../../../../src/lib/hubbell/po-number-parser';

export const runtime = 'nodejs';
export const maxDuration = 30;

type LineInput = {
  doc_type?: unknown;
  doc_number?: unknown;
  line_seq?: unknown;
  payment_amount?: unknown;
  gross_amount?: unknown;
  memo?: unknown;
  invoice_date?: unknown;
};

type ParsedLine = {
  docType: 'po' | 'wo' | 'inv';
  docNumber: string;
  lineSeq: number;
  paymentAmount: number;
  grossAmount: number | null;
  memo: string | null;
  invoiceDate: string | null;
};

function parseLine(row: LineInput, idx: number): ParsedLine | string {
  const rawType = String(row.doc_type ?? '').toLowerCase().trim();
  if (rawType !== 'po' && rawType !== 'wo' && rawType !== 'inv') {
    return `line[${idx}]: invalid doc_type "${rawType}" (expected po|wo|inv)`;
  }
  const rawDocNumber = String(row.doc_number ?? '').trim();
  if (!rawDocNumber) return `line[${idx}]: missing doc_number`;
  const lineSeqNum =
    typeof row.line_seq === 'number' ? row.line_seq : Number(row.line_seq);
  if (!Number.isInteger(lineSeqNum) || lineSeqNum < 0) {
    return `line[${idx}]: invalid line_seq "${row.line_seq}"`;
  }
  const paymentNum =
    typeof row.payment_amount === 'number'
      ? row.payment_amount
      : Number(row.payment_amount);
  if (!Number.isFinite(paymentNum)) {
    return `line[${idx}]: invalid payment_amount "${row.payment_amount}"`;
  }
  let grossAmount: number | null = null;
  if (row.gross_amount != null && row.gross_amount !== '') {
    const g = typeof row.gross_amount === 'number' ? row.gross_amount : Number(row.gross_amount);
    if (Number.isFinite(g)) grossAmount = g;
  }
  const memo =
    typeof row.memo === 'string' && row.memo.trim() ? row.memo.trim() : null;
  let invoiceDate: string | null = null;
  if (row.invoice_date) {
    const d = new Date(String(row.invoice_date));
    if (Number.isFinite(d.getTime())) {
      invoiceDate = d.toISOString().slice(0, 10);
    }
  }
  // PO/WO doc numbers normalize through the same helper as document upload
  // (strips leading zeros consistently). 'inv' numbers stay raw — they're
  // Agility ref_nums and need to match agility_so_header verbatim.
  const docNumber =
    rawType === 'inv' ? rawDocNumber : normalizeDocNumber(rawDocNumber);
  return {
    docType: rawType,
    docNumber,
    lineSeq: lineSeqNum,
    paymentAmount: paymentNum,
    grossAmount,
    memo,
    invoiceDate,
  };
}

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let body: {
    check_number?: unknown;
    source_run_id?: unknown;
    check_date?: unknown;
    lines?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const checkNumber = String(body.check_number ?? '').trim();
  if (!checkNumber) {
    return NextResponse.json({ error: 'missing check_number' }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'lines must be a non-empty array' }, { status: 400 });
  }
  const sourceRunId =
    typeof body.source_run_id === 'string' && body.source_run_id.trim()
      ? body.source_run_id.trim()
      : null;
  let checkDate: string | null = null;
  if (body.check_date) {
    const d = new Date(String(body.check_date));
    if (Number.isFinite(d.getTime())) {
      checkDate = d.toISOString().slice(0, 10);
    }
  }

  const parsed: ParsedLine[] = [];
  const rowErrors: string[] = [];
  body.lines.forEach((row, i) => {
    const r = parseLine(row as LineInput, i);
    if (typeof r === 'string') rowErrors.push(r);
    else parsed.push(r);
  });
  if (rowErrors.length > 0) {
    return NextResponse.json({ error: 'invalid lines', details: rowErrors }, { status: 400 });
  }

  // Canonical hash — sort + cents-int + fixed key order. Identical across
  // runtimes; immune to JSON key ordering and float drift.
  const canonicalLines: CanonicalCheckLine[] = parsed.map((l) => ({
    doc_type: l.docType,
    doc_number: l.docNumber,
    line_seq: l.lineSeq,
    payment_amount: l.paymentAmount,
    memo: l.memo,
    invoice_date: l.invoiceDate,
    gross_amount: l.grossAmount,
  }));
  const sourceHash = canonicalCheckHash({
    check_number: checkNumber,
    lines: canonicalLines,
  });

  const totalAmount = parsed
    .reduce((acc, l) => acc + l.paymentAmount, 0)
    .toFixed(2);
  const paymentCount = parsed.length;

  const db = getDb();

  // Single transaction: lookup existing → insert/no-op/replace.
  type UpsertResult = {
    status: 'inserted' | 'unchanged' | 'replaced';
    id: string;
    lineCount: number;
  };
  const result: UpsertResult = await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: schema.hubbellChecks.id,
        sourceHash: schema.hubbellChecks.sourceHash,
      })
      .from(schema.hubbellChecks)
      .where(eq(schema.hubbellChecks.checkNumber, checkNumber))
      .limit(1);

    if (existing.length === 0) {
      // INSERT path
      const [created] = await tx
        .insert(schema.hubbellChecks)
        .values({
          checkNumber,
          checkDate,
          totalAmount,
          paymentCount,
          sourceHash,
          sourceRunId,
        })
        .returning({ id: schema.hubbellChecks.id });
      await tx.insert(schema.hubbellCheckLines).values(
        parsed.map((l) => ({
          checkId: created.id,
          docType: l.docType,
          docNumber: l.docNumber,
          invoiceDate: l.invoiceDate,
          paymentAmount: l.paymentAmount.toFixed(2),
          grossAmount: l.grossAmount != null ? l.grossAmount.toFixed(2) : null,
          memo: l.memo,
          lineSeq: l.lineSeq,
        })),
      );
      return { status: 'inserted', id: created.id, lineCount: paymentCount };
    }

    const ex = existing[0];
    if (ex.sourceHash === sourceHash) {
      // No-op: same canonical content. Bump last_seen_at for freshness.
      await tx
        .update(schema.hubbellChecks)
        .set({ lastSeenAt: dsql`now()` })
        .where(eq(schema.hubbellChecks.id, ex.id));
      return { status: 'unchanged', id: ex.id, lineCount: paymentCount };
    }

    // REPLACE path: wipe and re-insert the line set, keep the check UUID.
    await tx
      .delete(schema.hubbellCheckLines)
      .where(eq(schema.hubbellCheckLines.checkId, ex.id));
    await tx.insert(schema.hubbellCheckLines).values(
      parsed.map((l) => ({
        checkId: ex.id,
        docType: l.docType,
        docNumber: l.docNumber,
        invoiceDate: l.invoiceDate,
        paymentAmount: l.paymentAmount.toFixed(2),
        grossAmount: l.grossAmount != null ? l.grossAmount.toFixed(2) : null,
        memo: l.memo,
        lineSeq: l.lineSeq,
      })),
    );
    await tx
      .update(schema.hubbellChecks)
      .set({
        checkDate,
        totalAmount,
        paymentCount,
        sourceHash,
        sourceRunId,
        lastSeenAt: dsql`now()`,
      })
      .where(eq(schema.hubbellChecks.id, ex.id));
    return { status: 'replaced', id: ex.id, lineCount: paymentCount };
  });

  // Refresh rollups on every hubbell_documents row touched by this check.
  // Helper filters to po/wo (inv lines reference agility_so_header directly,
  // not hubbell_documents). Don't fail the request on rollup error — the
  // check is already persisted; rollup can be re-driven by re-POSTing.
  if (result.status !== 'unchanged') {
    try {
      await refreshPaymentRollupForDocs(
        db,
        parsed.map((l) => ({ docType: l.docType, docNumber: l.docNumber })),
      );
    } catch (err) {
      console.error('[hubbell checks upload] rollup refresh failed', err);
    }
  }

  return NextResponse.json(result);
}
