-- Management/Scorecard aggregate query performance
-- Apply in Supabase SQL editor using CONCURRENTLY (cannot be run inside a transaction).
-- Run each statement separately.
--
-- Root cause: management page runs 4 aggregate queries over 4.3M rows / 4.8 GB.
-- Each query takes ~2-3s; cold-start Vercel functions were timing out at 10s default.
-- Code fix: maxDuration = 60 added to app/management/layout.tsx + page.tsx
--
-- This index allows index-only scans for the management KPI, branch summary,
-- and sale-type aggregate queries by including all aggregated columns in the leaf.
-- Estimated index size: ~500 MB.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csf_agg_covering
  ON public.customer_scorecard_fact (invoice_date)
  INCLUDE (
    branch_id,
    customer_id,
    ship_to_id,
    sales_order_number,
    is_credit_memo,
    is_value_add_major,
    is_non_stock,
    sale_type_reporting_category,
    is_sale_type_excluded,
    sales_amount,
    gross_profit,
    weight
  )
  WHERE is_deleted = false;
