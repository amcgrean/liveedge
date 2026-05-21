-- 0026_hubbell_checks.sql
-- ----------------------------------------------------------------------------
-- Daily Hubbell check ingest (Phase 3a of the Hubbell pipeline).
--
-- Replaces bids.hubbell_document_payments with a richer two-table model so
-- the Pi can post per-check scrapes daily (instead of waiting for the
-- monthly PC reconciliation). hubbell_check_lines becomes the canonical
-- source of payment facts; the hubbell_documents rollup columns now refresh
-- from it.
--
-- Design notes (full brief in docs/agent-prompts/hubbell-daily-check-ingest-2026-05-20.md
-- and docs/agent-prompts/hubbell-daily-check-ingest-addendum-2026-05-20.md):
--   * check_number alone is UNIQUE. HUBB1000/1200/1400/1700 are
--     Beisser-side AR accounts for work type, not separate Hubbell payer
--     entities — all checks come from one vendor stream (vendornumber=000658)
--     with sequential numbering.
--   * source_hash is a canonical sha256 (cents-int + fixed key order +
--     line-sorted) so re-POSTs of identical data are no-ops. Backfilled
--     rows synthesize a synthetic source_hash from check_number alone; the
--     next legitimate daily POST will compute the real canonical hash and
--     trigger the wipe-and-replace path naturally.
--   * Schema-portable for an eventual ALTER SCHEMA bids.hubbell_*
--     SET SCHEMA hubbell rename (Phase 3e). No FKs cross into bids' actual
--     bid/takeoff tables.
--
-- Apply manually in Supabase SQL editor. Steps run inside an implicit
-- transaction (Supabase wraps); no CONCURRENTLY indexes.
-- ----------------------------------------------------------------------------

-- 1. hubbell_checks: one row per Hubbell check ever scraped.
CREATE TABLE IF NOT EXISTS bids.hubbell_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_number    varchar(50) NOT NULL,
  check_date      date,
  total_amount    numeric(14, 2),
  payment_count   integer,
  source_hash     varchar(64) NOT NULL,
  source_run_id   varchar(100),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hubbell_checks_check_number_uq
  ON bids.hubbell_checks (check_number);

CREATE UNIQUE INDEX IF NOT EXISTS hubbell_checks_source_hash_uq
  ON bids.hubbell_checks (source_hash);

CREATE INDEX IF NOT EXISTS hubbell_checks_check_date_idx
  ON bids.hubbell_checks (check_date);

-- 2. hubbell_check_lines: one row per line on a check.
--    doc_type 'po'|'wo' → joins to bids.hubbell_documents on (doc_type, doc_number).
--    doc_type 'inv'     → joins to public.agility_so_header via ref_num (no FK).
CREATE TABLE IF NOT EXISTS bids.hubbell_check_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        uuid NOT NULL REFERENCES bids.hubbell_checks(id) ON DELETE CASCADE,
  doc_type        varchar(10) NOT NULL,
  doc_number      varchar(100) NOT NULL,
  invoice_date    date,
  payment_amount  numeric(14, 2) NOT NULL,
  gross_amount    numeric(14, 2),
  memo            text,
  line_seq        integer NOT NULL
);

CREATE INDEX IF NOT EXISTS hubbell_check_lines_check_id_idx
  ON bids.hubbell_check_lines (check_id);

CREATE INDEX IF NOT EXISTS hubbell_check_lines_doc_idx
  ON bids.hubbell_check_lines (doc_type, doc_number);

-- 3. Backfill hubbell_checks from existing hubbell_document_payments.
--    One row per DISTINCT check_number. Synthetic source_hash so the UNIQUE
--    constraint holds; will be overwritten by the first canonical re-POST.
INSERT INTO bids.hubbell_checks (
  check_number,
  check_date,
  total_amount,
  payment_count,
  source_hash,
  source_run_id,
  first_seen_at,
  last_seen_at
)
SELECT
  check_number,
  MAX(payment_date)                      AS check_date,
  SUM(paid_amount)                       AS total_amount,
  COUNT(*)                               AS payment_count,
  'backfill:' || encode(sha256(check_number::bytea), 'hex')
                                         AS source_hash,
  (ARRAY_AGG(source_run_id ORDER BY created_at DESC NULLS LAST))[1]
                                         AS source_run_id,
  MIN(created_at)                        AS first_seen_at,
  MAX(updated_at)                        AS last_seen_at
FROM bids.hubbell_document_payments
GROUP BY check_number
ON CONFLICT (check_number) DO NOTHING;

-- 4. Backfill hubbell_check_lines (1:1 with hubbell_document_payments).
--    line_seq deterministic via ROW_NUMBER for stable ordering on re-scrape.
--    invoice_date / gross_amount / memo are NULL — the old payments table
--    didn't carry them. Optional future re-scrape can populate them via
--    POST /api/admin/hubbell/checks/upload (wipe-and-replace).
INSERT INTO bids.hubbell_check_lines (
  check_id,
  doc_type,
  doc_number,
  invoice_date,
  payment_amount,
  gross_amount,
  memo,
  line_seq
)
SELECT
  c.id                                  AS check_id,
  p.doc_type,
  p.doc_number,
  NULL::date                            AS invoice_date,
  p.paid_amount                         AS payment_amount,
  NULL::numeric                         AS gross_amount,
  NULL::text                            AS memo,
  ROW_NUMBER() OVER (
    PARTITION BY p.check_number
    ORDER BY p.doc_type, p.doc_number, p.id
  )                                     AS line_seq
FROM bids.hubbell_document_payments p
JOIN bids.hubbell_checks c ON c.check_number = p.check_number;

-- 5. Sanity check — fail loudly if backfill row count drifts from source.
DO $$
DECLARE
  src_count integer;
  dst_count integer;
BEGIN
  SELECT COUNT(*) INTO src_count FROM bids.hubbell_document_payments;
  SELECT COUNT(*) INTO dst_count FROM bids.hubbell_check_lines;
  IF src_count <> dst_count THEN
    RAISE EXCEPTION 'Backfill mismatch: hubbell_document_payments=% vs hubbell_check_lines=%',
      src_count, dst_count;
  END IF;
END $$;

-- 6. Refresh hubbell_documents rollups from the new tables.
--    Same logic as the rollup query in src/lib/hubbell/payment-rollup.ts —
--    kept inline here so the migration is self-contained.
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
   AND d.extracted_total > 0;

-- 7. Drop the old table. check_lines is now the canonical source.
DROP TABLE bids.hubbell_document_payments;
