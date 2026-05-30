-- 0035_scorecard_rollups.sql
-- Tier 1 (architecture review): isolate analytical load from operational load.
--
-- WHY: every scorecard / management dashboard load aggregates over
-- public.customer_scorecard_fact (≈4.4M rows, 6.4 GB — 2.5 GB heap + 3.9 GB
-- indexes). Those analytical scans compete with operational reads for the same
-- shared-buffer cache; the 2026-05-28 timeout incident traced to exactly this
-- contention. This migration introduces a pre-aggregated DAILY rollup so the
-- heavy "all customers over a year range" scans read a small, isolated
-- relation (~460K narrow rows) instead of the 6.4 GB fact.
--
-- GRAIN = daily (invoice_date::date). Daily — not monthly — because the live
-- queries filter on a day-level cutoff (`invoice_date::date <= cutoff`) for YTD
-- views; a monthly grain would be wrong for the partial current month. Measures
-- are PRE-SPLIT into columns (sales_va, sales_ns, …) rather than carrying the
-- boolean flags as grain, so there is no row explosion.
--
-- Validated to the cent against the live fact (branch 20GR, FY2024):
--   rollup sales = live sales = 85,471,558.4982 ; rollup gp = live gp ; Δ = 0.
--
-- SCHEMA HYGIENE: lives in `bids`, reads `public.customer_scorecard_fact`
-- read-only, no FKs into ERP mirror tables — consistent with the eventual
-- analytics-schema move. Only NON-NULL invoice_date rows are included (every
-- consuming query filters invoice_date, so this changes no result and keeps the
-- unique index — required by REFRESH … CONCURRENTLY — clean of NULLs).
--
-- APPLY MANUALLY in the Supabase SQL editor, and prefer an OFF-HOURS window:
-- the initial CREATE MATERIALIZED VIEW … WITH DATA does one full scan of the
-- 6.4 GB fact (that is the cost we are moving off the request path — once
-- nightly instead of on every dashboard load).

-- ---------------------------------------------------------------------------
-- rollup_customer_day — per (branch, customer, day) pre-split measure columns
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS bids.rollup_customer_day;

CREATE MATERIALIZED VIEW bids.rollup_customer_day AS
SELECT
  branch_id,
  customer_id,
  invoice_date::date                                            AS d,
  MAX(customer_name)                                            AS customer_name,
  SUM(sales_amount)                                             AS sales_amount,
  SUM(gross_profit)                                             AS gross_profit,
  SUM(weight)                                                   AS weight,
  SUM(sales_amount) FILTER (WHERE is_value_add_major)           AS sales_va,
  SUM(sales_amount) FILTER (WHERE is_non_stock)                 AS sales_ns,
  SUM(gross_profit) FILTER (WHERE is_non_stock)                 AS gp_ns,
  SUM(sales_amount) FILTER (WHERE NOT is_credit_memo)           AS sales_gross,
  SUM(sales_amount) FILTER (WHERE is_credit_memo)               AS sales_cm,
  SUM(weight)       FILTER (WHERE NOT is_credit_memo)           AS weight_noncm,
  COUNT(*)                                                      AS line_count
FROM public.customer_scorecard_fact
WHERE is_deleted = false
  AND invoice_date IS NOT NULL
GROUP BY branch_id, customer_id, invoice_date::date
WITH DATA;

-- UNIQUE index over the full grain — mandatory for REFRESH … CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS rollup_customer_day_pk
  ON bids.rollup_customer_day (branch_id, customer_id, d);

-- Date-range scans (the "all customers in a year range" workload).
CREATE INDEX IF NOT EXISTS rollup_customer_day_d
  ON bids.rollup_customer_day (d);

-- Branch-scoped date-range scans.
CREATE INDEX IF NOT EXISTS rollup_customer_day_branch_d
  ON bids.rollup_customer_day (branch_id, d);

-- ---------------------------------------------------------------------------
-- Nightly refresh via pg_cron (already installed; cron.database_name=postgres).
-- CONCURRENTLY does not block readers. ~09:10 UTC ≈ 04:10 America/Chicago —
-- off-hours, after the morning ERP sync. Re-running this migration replaces the
-- job rather than duplicating it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'refresh_rollup_customer_day';
EXCEPTION WHEN OTHERS THEN
  -- no existing job / pg_cron not present in this environment: ignore
  NULL;
END $$;

SELECT cron.schedule(
  'refresh_rollup_customer_day',
  '10 9 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY bids.rollup_customer_day$$
);
