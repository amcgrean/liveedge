// Payment rollup helpers — refresh hubbell_documents.{paid_amount_total,
// last_payment_date, last_check_number, payment_status} from the
// hubbell_check_lines + hubbell_checks tables.
//
// Source of truth for payment facts is hubbell_check_lines (added in
// migration 0026). Rollups live denormalized on hubbell_documents for fast
// inbox display. Callers: /api/admin/hubbell/upload (after a new doc lands),
// /api/admin/hubbell/checks/upload (after a check is inserted/replaced),
// /api/admin/hubbell/payments/import (after backward-compat bulk import),
// /api/admin/hubbell/documents/metadata-bulk (after extracted_total changes).
//
// Only ('po','wo') check_lines roll up to hubbell_documents — 'inv' lines
// reference agility_so_header directly and have no hubbell_documents row.

import { sql as dsql } from 'drizzle-orm';
import type { getDb } from '../../../db/index';

type Db = ReturnType<typeof getDb>;

// Refresh rollups for a single document (by id). Cheap — single-row update.
export async function refreshPaymentRollupForDoc(db: Db, documentId: string): Promise<void> {
  await db.execute(dsql`
    WITH agg AS (
      SELECT
        SUM(l.payment_amount)                                     AS paid_total,
        MAX(c.check_date)                                         AS last_date,
        (ARRAY_AGG(c.check_number ORDER BY c.check_date DESC NULLS LAST))[1]
                                                                  AS last_check
      FROM bids.hubbell_check_lines l
      JOIN bids.hubbell_checks c       ON c.id = l.check_id
      JOIN bids.hubbell_documents d_in ON d_in.doc_type = l.doc_type
                                      AND d_in.doc_number = l.doc_number
      WHERE d_in.id = ${documentId}::uuid
        AND l.doc_type IN ('po','wo')
    )
    UPDATE bids.hubbell_documents d
       SET paid_amount_total = a.paid_total,
           last_payment_date = a.last_date,
           last_check_number = a.last_check,
           payment_status = CASE
             WHEN d.extracted_total IS NULL OR d.extracted_total = 0
                  THEN NULL
             WHEN COALESCE(a.paid_total, 0) >= d.extracted_total
                  THEN 'paid'
             WHEN COALESCE(a.paid_total, 0) > 0
                  THEN 'partial'
             ELSE 'unpaid'
           END,
           updated_at = now()
      FROM agg a
     WHERE d.id = ${documentId}::uuid
       AND d.extracted_total IS NOT NULL
       AND d.extracted_total > 0
  `);
}

// Refresh rollups for a specific set of (doc_type, doc_number) pairs. Use
// after touching a check that affects multiple documents. Parameterized
// via drizzle's sql template (no string interpolation of caller values).
export async function refreshPaymentRollupForDocs(
  db: Db,
  docs: Array<{ docType: string; docNumber: string }>,
): Promise<void> {
  if (docs.length === 0) return;
  // Filter to po/wo here — inv lines don't roll up to hubbell_documents.
  const targets = docs.filter((d) => d.docType === 'po' || d.docType === 'wo');
  if (targets.length === 0) return;

  // De-dupe so we don't repeat (doc_type, doc_number) tuples.
  const seen = new Set<string>();
  const unique = targets.filter((d) => {
    const k = `${d.docType}|${d.docNumber}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const tupleSql = dsql.join(
    unique.map((d) => dsql`(${d.docType}::varchar, ${d.docNumber}::varchar)`),
    dsql`, `,
  );

  await db.execute(dsql`
    WITH touched(doc_type, doc_number) AS (VALUES ${tupleSql}),
    agg AS (
      SELECT
        l.doc_type,
        l.doc_number,
        SUM(l.payment_amount)                                     AS paid_total,
        MAX(c.check_date)                                         AS last_date,
        (ARRAY_AGG(c.check_number ORDER BY c.check_date DESC NULLS LAST))[1]
                                                                  AS last_check
      FROM bids.hubbell_check_lines l
      JOIN bids.hubbell_checks c ON c.id = l.check_id
      JOIN touched t ON t.doc_type = l.doc_type AND t.doc_number = l.doc_number
      WHERE l.doc_type IN ('po','wo')
      GROUP BY l.doc_type, l.doc_number
    )
    UPDATE bids.hubbell_documents d
       SET paid_amount_total = a.paid_total,
           last_payment_date = a.last_date,
           last_check_number = a.last_check,
           payment_status = CASE
             WHEN d.extracted_total IS NULL OR d.extracted_total = 0
                  THEN NULL
             WHEN COALESCE(a.paid_total, 0) >= d.extracted_total
                  THEN 'paid'
             WHEN COALESCE(a.paid_total, 0) > 0
                  THEN 'partial'
             ELSE 'unpaid'
           END,
           updated_at = now()
      FROM agg a
     WHERE d.doc_type = a.doc_type
       AND d.doc_number = a.doc_number
       AND d.extracted_total IS NOT NULL
       AND d.extracted_total > 0
  `);
}

// Sweep every document. Expensive — only call after bulk imports.
// Includes docs with no matching check_lines (LEFT JOIN to agg) so they flip
// from NULL → 'unpaid' instead of rendering as em-dash in the inbox.
export async function refreshPaymentRollupAll(db: Db): Promise<void> {
  await db.execute(dsql`
    WITH agg AS (
      SELECT
        l.doc_type,
        l.doc_number,
        SUM(l.payment_amount)                                     AS paid_total,
        MAX(c.check_date)                                         AS last_date,
        (ARRAY_AGG(c.check_number ORDER BY c.check_date DESC NULLS LAST))[1]
                                                                  AS last_check
      FROM bids.hubbell_check_lines l
      JOIN bids.hubbell_checks c ON c.id = l.check_id
      WHERE l.doc_type IN ('po','wo')
      GROUP BY l.doc_type, l.doc_number
    )
    UPDATE bids.hubbell_documents d
       SET paid_amount_total = a.paid_total,
           last_payment_date = a.last_date,
           last_check_number = a.last_check,
           payment_status = CASE
             WHEN d.extracted_total IS NULL OR d.extracted_total = 0
                  THEN NULL
             WHEN COALESCE(a.paid_total, 0) >= d.extracted_total
                  THEN 'paid'
             WHEN COALESCE(a.paid_total, 0) > 0
                  THEN 'partial'
             ELSE 'unpaid'
           END,
           updated_at = now()
      FROM (
        SELECT d2.id, agg.paid_total, agg.last_date, agg.last_check
          FROM bids.hubbell_documents d2
          LEFT JOIN agg
            ON agg.doc_type   = d2.doc_type
           AND agg.doc_number = d2.doc_number
      ) a
     WHERE d.id = a.id
       AND d.extracted_total IS NOT NULL
       AND d.extracted_total > 0
  `);
}
