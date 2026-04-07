/**
 * Shared types and SQL fragments for purchasing API routes.
 *
 * Routes that query agility_po_header should import OpenPO and
 * RECEIPT_COUNT_SUBQUERY from here to stay in sync.
 */

/** Shape returned by all open-PO list endpoints. */
export interface OpenPO {
  po_number: string;
  supplier_name: string | null;
  supplier_code: string | null;
  system_id: string | null;
  expect_date: string | null;
  order_date: string | null;
  po_status: string | null;
  receipt_count: number | null;
}

/**
 * Raw SQL subquery for LEFT-JOINing receipt counts onto agility_po_header.
 *
 * Usage (postgres.js tagged template):
 *   LEFT JOIN ${sql.unsafe(RECEIPT_COUNT_SUBQUERY)} rh
 *     ON rh.system_id = ph.system_id AND rh.po_id = ph.po_id
 */
export const RECEIPT_COUNT_SUBQUERY = `(
  SELECT system_id, po_id, COUNT(*)::int AS receipt_count
  FROM agility_receiving_header
  WHERE is_deleted = false
  GROUP BY system_id, po_id
)` as const;

/** Statuses treated as closed/complete — excluded from open-PO queries. */
export const CLOSED_PO_STATUSES = `('CLOSED','COMPLETE','CANCELLED','CANCELED','VOID','RECEIVED')` as const;
