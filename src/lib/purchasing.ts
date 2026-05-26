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
  /**
   * Max lead-time tier 1 (days) across the items on this PO, sourced from
   * `agility_item_supplier`. NULL when no item on the PO has a supplier rule
   * configured. Using MAX so the displayed value is conservative.
   */
  lead_time_max_days: number | null;
  /**
   * True if any item on this PO has `min_ord_violation = 'Block'` for the
   * PO's supplier — i.e. the line risks failing an Agility entry guard.
   */
  has_blocking_min_violation: boolean;
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
