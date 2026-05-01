-- Performance indexes for the RMA Credits page (/credits)
-- Apply manually in Supabase SQL editor — NOT via drizzle-kit
--
-- The credits list query does:
--   FROM agility_so_header WHERE is_deleted=false AND sale_type='Credit'
--     AND UPPER(COALESCE(so_status,'')) NOT IN ('I','C')
--     AND system_id = $branch    ← branch-scoped users
--   LEFT JOIN credit_images ON rma_number = so_id::text
--   GROUP BY ... ORDER BY created_date DESC / cust_name / city / etc.
--
-- Without these indexes every page load scans the full agility_so_header
-- (all sale types) and seq-scans credit_images to aggregate doc counts.

-- ─── agility_so_header ───────────────────────────────────────────────────────

-- Partial index for credits page: pre-filters to Credit/non-deleted rows,
-- leading column is system_id for branch-scoped queries, then created_date
-- for the default sort. The status exclusion (NOT IN I/C) applies as a
-- post-filter on the small number of matched rows.
CREATE INDEX IF NOT EXISTS idx_agility_so_header_credits
  ON public.agility_so_header (system_id, created_date DESC NULLS LAST, so_id DESC)
  WHERE is_deleted = false AND sale_type = 'Credit';

-- Secondary index for admin all-branch view ordered by customer name or city.
-- Covers ORDER BY cust_name / shipto_city when no branch filter is applied.
CREATE INDEX IF NOT EXISTS idx_agility_so_header_credits_cust
  ON public.agility_so_header (cust_name, so_id DESC)
  WHERE is_deleted = false AND sale_type = 'Credit';

-- ─── credit_images (public schema, WH-Tracker managed) ───────────────────────

-- The LEFT JOIN aggregates doc count per CM via:
--   LEFT JOIN credit_images ci ON ci.rma_number = soh.so_id::text
-- Without an index on rma_number this is a full-table scan on every page load.
CREATE INDEX IF NOT EXISTS idx_credit_images_rma_number
  ON public.credit_images (rma_number);

-- Supporting index for the per-CM images list (/api/credits/[id]/images)
-- and the detail page upload confirm queries.
CREATE INDEX IF NOT EXISTS idx_credit_images_rma_received
  ON public.credit_images (rma_number, received_at DESC NULLS LAST);
