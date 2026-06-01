-- 0037_fix_rollup_refresh_concurrently.sql
-- Fix: the nightly REFRESH for rollup_product_day and rollup_saletype_day has
-- FAILED every night since 0036 created them (caught 2026-06-01 by the
-- sync-health alert on its first real run). The MVs held data frozen at their
-- 0036 create time.
--
-- ROOT CAUSE: `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a UNIQUE index
-- that is **plain columns only** — no expressions, no WHERE clause. The 0036
-- unique indexes use expressions (`(COALESCE(branch_id,''))`, …), and
-- rollup_saletype_day additionally carries `NULL` customer_id by design (the
-- product_major / product_minor UNION scopes), so a plain NULL-free unique index
-- isn't even possible without a sentinel-value recreate. Postgres therefore
-- rejects the concurrent refresh instantly ("cannot refresh ... concurrently").
-- rollup_customer_day has a plain `(branch_id, customer_id, d)` unique index, so
-- it refreshes concurrently fine — that's why only the other two failed.
--
-- FIX: refresh product/saletype NON-concurrently. A non-concurrent REFRESH has
-- no unique-index requirement and is NULL/expression-agnostic. The trade-off is
-- an ACCESS EXCLUSIVE lock on the MV for the refresh duration (~1–3 min), but
-- these run at 09:15 / 09:20 UTC ≈ 04:15 / 04:20 America/Chicago — off-hours,
-- when scorecard/management dashboards are effectively idle. rollup_customer_day
-- stays CONCURRENTLY (its plain index supports it).
--
-- LEARNING for future rollups: if a rollup needs CONCURRENTLY refresh, give it a
-- plain-column, NULL-free, non-partial UNIQUE index. Multi-scope UNION rollups
-- (NULL dimensions per scope) can't satisfy that without sentinel values — use
-- non-concurrent refresh for those.
--
-- APPLY in the Supabase SQL editor (off-hours): the two REFRESH statements below
-- each do one full scan of the 6.4 GB fact, so they exceed the 60s MCP/gateway
-- cap. The cron.schedule calls are instant; the REFRESH calls freshen the
-- now-stale data immediately (otherwise it self-heals on the next nightly run).

-- Reschedule (cron.schedule upserts by jobname) to non-concurrent refresh.
SELECT cron.schedule(
  'refresh_rollup_product_day',
  '15 9 * * *',
  $$REFRESH MATERIALIZED VIEW bids.rollup_product_day$$
);

SELECT cron.schedule(
  'refresh_rollup_saletype_day',
  '20 9 * * *',
  $$REFRESH MATERIALIZED VIEW bids.rollup_saletype_day$$
);

-- One-time freshen of the data that's been frozen since the 0036 create
-- (every concurrent nightly run failed). Off-hours; each scans the fact once.
REFRESH MATERIALIZED VIEW bids.rollup_product_day;
REFRESH MATERIALIZED VIEW bids.rollup_saletype_day;
