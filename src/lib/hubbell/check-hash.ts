// Canonical source_hash for hubbell_checks payloads.
//
// Per the design addendum (docs/agent-prompts/hubbell-daily-check-ingest-addendum-2026-05-20.md §3),
// a raw sha256(JSON.stringify(...)) is fragile: JSON key ordering isn't
// guaranteed across runtimes, and float drift on `payment_amount` would churn
// the hash on identical re-scrapes. This helper produces a deterministic hash
// by sorting lines, converting amounts to integer cents, and stringifying
// keys in a fixed order.

import crypto from 'node:crypto';

export type CanonicalCheckLine = {
  doc_type: string;
  doc_number: string;
  line_seq: number;
  payment_amount: number;
  memo?: string | null;
  invoice_date?: string | null;
  gross_amount?: number | null;
};

export type CanonicalCheck = {
  check_number: string;
  lines: CanonicalCheckLine[];
};

export function canonicalCheckHash(check: CanonicalCheck): string {
  const sorted = [...check.lines].sort(
    (a, b) =>
      a.doc_type.localeCompare(b.doc_type) ||
      a.doc_number.localeCompare(b.doc_number) ||
      a.line_seq - b.line_seq,
  );

  const normLines = sorted.map((l) => ({
    doc_type: l.doc_type,
    doc_number: l.doc_number,
    line_seq: l.line_seq,
    payment_cents: Math.round(l.payment_amount * 100),
    gross_cents:
      l.gross_amount != null && Number.isFinite(l.gross_amount)
        ? Math.round(l.gross_amount * 100)
        : null,
    memo: l.memo ?? null,
    invoice_date: l.invoice_date ?? null,
  }));

  const canonical = JSON.stringify({
    check_number: check.check_number,
    lines: normLines,
  });

  return crypto.createHash('sha256').update(canonical).digest('hex');
}
