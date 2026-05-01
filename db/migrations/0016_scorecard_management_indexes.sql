-- Performance indexes for Scorecard KPI and Management Dashboard queries
-- Apply manually in Supabase SQL editor — NOT via drizzle-kit (public schema)
-- Note: Supabase wraps statements in a transaction, so omit CONCURRENTLY.

-- ─── customer_scorecard_fact ──────────────────────────────────────────────────
-- All scorecard/management KPI queries filter on (customer_id, invoice_date)
-- or (branch_id, customer_id, invoice_date). Currently zero indexes on this table.

CREATE INDEX IF NOT EXISTS idx_customer_scorecard_fact_customer_date
  ON public.customer_scorecard_fact (customer_id, invoice_date DESC NULLS LAST)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_customer_scorecard_fact_branch_date
  ON public.customer_scorecard_fact (branch_id, customer_id, invoice_date DESC NULLS LAST)
  WHERE is_deleted = false;

-- ─── agility_so_header — created_date ────────────────────────────────────────
-- Home dashboard "invoiced last 30 days" and recent orders queries filter on
-- (so_status, created_date). The existing idx_agility_so_header_picks index
-- does not include created_date, forcing an in-memory sort.

CREATE INDEX IF NOT EXISTS idx_agility_so_header_status_date
  ON public.agility_so_header (so_status, created_date DESC NULLS LAST, system_id)
  WHERE is_deleted = false;

-- ─── agility_so_header — expect_date ─────────────────────────────────────────
-- Management forecast query groups by expect_date across a 14–60 day window.
-- No existing index covers expect_date; this query does a full table scan.

CREATE INDEX IF NOT EXISTS idx_agility_so_header_forecast
  ON public.agility_so_header (expect_date, so_status, sale_type, system_id)
  WHERE is_deleted = false AND expect_date IS NOT NULL;
