-- 0029_replenishment_engine_indexes.sql
-- Indexes for the replenishment engine (src/lib/purchasing/replenishment.ts).
--
-- Without these, EXPLAIN ANALYZE shows ~18s for a single-branch run; with
-- both indexes + the engine's pre-aggregated CTE shape, the same query
-- comes back in ~270ms. Both are partial / expression indexes — small
-- footprint, no impact on other queries.
--
-- Apply manually in Supabase SQL editor.

-- Drives the per-item usage lookup in the LATERAL subquery: index-only
-- scan of qty_shipped over the (branch, item, date-window) range.
CREATE INDEX IF NOT EXISTS idx_csf_branch_item_date
  ON public.customer_scorecard_fact (branch_id, item_number, invoice_date)
  INCLUDE (qty_shipped)
  WHERE is_deleted = false AND is_credit_memo = false;

-- Drives the supplier-name join in the outer SELECT. agility_item_supplier
-- stores supplier_key padded with leading spaces; agility_suppliers does
-- not. The engine joins on TRIM(...) on both sides, so the matching index
-- has to be on the trimmed expression.
CREATE INDEX IF NOT EXISTS idx_agility_suppliers_trimmed_key
  ON public.agility_suppliers ((TRIM(supplier_key)), ship_from_seq)
  WHERE is_deleted = false;
