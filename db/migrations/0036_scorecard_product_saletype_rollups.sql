-- 0036_scorecard_product_saletype_rollups.sql
-- Tier 1 scorecard rollups, Slice 2a.
--
-- Extends the 0035 daily-rollup pattern to product and sale-type analytical
-- paths. These are derived caches over public.customer_scorecard_fact; they do
-- not mutate source / ERP data. Apply manually in Supabase SQL editor during an
-- off-hours window.
--
-- SINGLE-SCAN CONSTRUCTION (revised 2026-05-30): the first draft of this
-- migration built each MV as a UNION ALL of independent fact aggregations —
-- 2 full scans of the 6.4 GB fact for rollup_product_day and 3 for
-- rollup_saletype_day. Five full scans in two statements blew the statement /
-- gateway timeout (0035, a single scan, applies fine). Both MVs are now built
-- from ONE MATERIALIZED CTE at the finest grain each consumer needs; the coarser
-- grains are derived by re-aggregating that small CTE instead of re-scanning the
-- fact. This makes each CREATE ≈ one fact scan and also cuts the nightly
-- REFRESH MATERIALIZED VIEW CONCURRENTLY cost 2–3×. Proven equivalent to the
-- original UNION definition to the cent (all measure deltas 0.0000, identical
-- row counts) on bounded slices before applying.

-- ---------------------------------------------------------------------------
-- rollup_product_day
--
-- Daily product rollup with separate major and minor rows. Keeping the level in
-- the grain avoids inflated order counts when a major contains multiple minors.
-- Customer columns are included because customer scorecards and product top
-- customer drilldowns need them; item-level drilldowns intentionally stay live.
--
-- Built from a single minor-grain scan; the 'major' rows are the same numbers
-- re-aggregated up from the minor CTE (every measure is additive). The major
-- display label prefers a real product_major name over the 'Unknown' placeholder
-- (NULLIF guard) so a major whose name is present on some lines is not relabelled
-- 'Unknown' just because a sibling minor lacked it.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS bids.rollup_product_day;

CREATE MATERIALIZED VIEW bids.rollup_product_day AS
WITH base AS MATERIALIZED (
  SELECT
    branch_id,
    customer_id,
    invoice_date::date                                            AS d,
    COALESCE(product_major_code, '')                              AS product_major_code,
    COALESCE(product_minor_code, '')                              AS product_minor_code,
    MAX(customer_name)                                            AS customer_name,
    COALESCE(MAX(product_major), 'Unknown')                       AS product_major,
    COALESCE(MAX(product_minor), 'Unknown')                       AS product_minor,
    SUM(sales_amount)                                             AS sales_amount,
    SUM(gross_profit)                                             AS gross_profit,
    SUM(weight)                                                   AS weight,
    SUM(qty_shipped)                                              AS qty_shipped,
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
  GROUP BY
    branch_id,
    customer_id,
    invoice_date::date,
    COALESCE(product_major_code, ''),
    COALESCE(product_minor_code, '')
)
SELECT
  branch_id,
  customer_id,
  customer_name,
  'minor'::text                                                   AS product_level,
  product_major_code,
  product_major,
  product_minor_code,
  product_minor,
  d,
  sales_amount,
  gross_profit,
  weight,
  qty_shipped,
  sales_va,
  sales_ns,
  gp_ns,
  sales_gross,
  sales_cm,
  weight_noncm,
  line_count
FROM base

UNION ALL

SELECT
  branch_id,
  customer_id,
  MAX(customer_name)                                              AS customer_name,
  'major'::text                                                   AS product_level,
  product_major_code,
  COALESCE(MAX(NULLIF(product_major, 'Unknown')), 'Unknown')      AS product_major,
  ''::text                                                        AS product_minor_code,
  'All'::text                                                     AS product_minor,
  d,
  SUM(sales_amount)                                               AS sales_amount,
  SUM(gross_profit)                                               AS gross_profit,
  SUM(weight)                                                     AS weight,
  SUM(qty_shipped)                                                AS qty_shipped,
  SUM(sales_va)                                                   AS sales_va,
  SUM(sales_ns)                                                   AS sales_ns,
  SUM(gp_ns)                                                      AS gp_ns,
  SUM(sales_gross)                                                AS sales_gross,
  SUM(sales_cm)                                                   AS sales_cm,
  SUM(weight_noncm)                                               AS weight_noncm,
  SUM(line_count)                                                 AS line_count
FROM base
GROUP BY
  branch_id,
  customer_id,
  product_major_code,
  d
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS rollup_product_day_pk
  ON bids.rollup_product_day (
    (COALESCE(branch_id, '')),
    (COALESCE(customer_id, '')),
    product_level,
    product_major_code,
    product_minor_code,
    d
  );

CREATE INDEX IF NOT EXISTS rollup_product_day_d
  ON bids.rollup_product_day (d);

CREATE INDEX IF NOT EXISTS rollup_product_day_branch_d
  ON bids.rollup_product_day (branch_id, d);

CREATE INDEX IF NOT EXISTS rollup_product_day_customer_d
  ON bids.rollup_product_day (customer_id, d);

CREATE INDEX IF NOT EXISTS rollup_product_day_major_d
  ON bids.rollup_product_day (product_level, product_major_code, d);

CREATE INDEX IF NOT EXISTS rollup_product_day_minor_d
  ON bids.rollup_product_day (product_level, product_major_code, product_minor_code, d);

-- ---------------------------------------------------------------------------
-- rollup_saletype_day
--
-- Daily sale-type rollup with explicit scopes for customer scorecards and
-- product major/minor drilldowns. The raw sale_type is kept so HOLD/DOORHOLD
-- can remain literal buckets while all other rows use reporting_category.
--
-- Built from one finest-grain scan (branch × customer × major × minor ×
-- sale_type). The three scopes are re-aggregations of that CTE:
--   customer      → drop product (keeps customer_id)
--   product_major → drop customer + minor (customer_id NULL)
--   product_minor → drop customer (customer_id NULL)
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS bids.rollup_saletype_day;

CREATE MATERIALIZED VIEW bids.rollup_saletype_day AS
WITH base AS MATERIALIZED (
  SELECT
    branch_id,
    customer_id,
    COALESCE(product_major_code, '')                              AS product_major_code,
    COALESCE(product_minor_code, '')                              AS product_minor_code,
    COALESCE(sale_type, '')                                       AS sale_type,
    COALESCE(sale_type_reporting_category, '')                   AS sale_type_reporting_category,
    COALESCE(is_sale_type_excluded, false)                        AS is_sale_type_excluded,
    invoice_date::date                                            AS d,
    SUM(sales_amount)                                             AS sales_amount,
    SUM(gross_profit)                                             AS gross_profit,
    COUNT(*)                                                      AS line_count
  FROM public.customer_scorecard_fact
  WHERE is_deleted = false
    AND invoice_date IS NOT NULL
  GROUP BY
    branch_id,
    customer_id,
    COALESCE(product_major_code, ''),
    COALESCE(product_minor_code, ''),
    COALESCE(sale_type, ''),
    COALESCE(sale_type_reporting_category, ''),
    COALESCE(is_sale_type_excluded, false),
    invoice_date::date
)
SELECT
  'customer'::text                                                AS rollup_scope,
  branch_id,
  customer_id,
  ''::text                                                        AS product_major_code,
  ''::text                                                        AS product_minor_code,
  sale_type,
  sale_type_reporting_category,
  is_sale_type_excluded,
  d,
  SUM(sales_amount)                                               AS sales_amount,
  SUM(gross_profit)                                               AS gross_profit,
  SUM(line_count)                                                 AS line_count
FROM base
GROUP BY
  branch_id,
  customer_id,
  sale_type,
  sale_type_reporting_category,
  is_sale_type_excluded,
  d

UNION ALL

SELECT
  'product_major'::text                                           AS rollup_scope,
  branch_id,
  NULL::text                                                      AS customer_id,
  product_major_code,
  ''::text                                                        AS product_minor_code,
  sale_type,
  sale_type_reporting_category,
  is_sale_type_excluded,
  d,
  SUM(sales_amount)                                               AS sales_amount,
  SUM(gross_profit)                                               AS gross_profit,
  SUM(line_count)                                                 AS line_count
FROM base
GROUP BY
  branch_id,
  product_major_code,
  sale_type,
  sale_type_reporting_category,
  is_sale_type_excluded,
  d

UNION ALL

SELECT
  'product_minor'::text                                           AS rollup_scope,
  branch_id,
  NULL::text                                                      AS customer_id,
  product_major_code,
  product_minor_code,
  sale_type,
  sale_type_reporting_category,
  is_sale_type_excluded,
  d,
  SUM(sales_amount)                                               AS sales_amount,
  SUM(gross_profit)                                               AS gross_profit,
  SUM(line_count)                                                 AS line_count
FROM base
GROUP BY
  branch_id,
  product_major_code,
  product_minor_code,
  sale_type,
  sale_type_reporting_category,
  is_sale_type_excluded,
  d
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS rollup_saletype_day_pk
  ON bids.rollup_saletype_day (
    rollup_scope,
    (COALESCE(branch_id, '')),
    (COALESCE(customer_id, '')),
    product_major_code,
    product_minor_code,
    sale_type,
    sale_type_reporting_category,
    is_sale_type_excluded,
    d
  );

CREATE INDEX IF NOT EXISTS rollup_saletype_day_d
  ON bids.rollup_saletype_day (d);

CREATE INDEX IF NOT EXISTS rollup_saletype_day_customer_d
  ON bids.rollup_saletype_day (rollup_scope, customer_id, d);

CREATE INDEX IF NOT EXISTS rollup_saletype_day_product_major_d
  ON bids.rollup_saletype_day (rollup_scope, product_major_code, d);

CREATE INDEX IF NOT EXISTS rollup_saletype_day_product_minor_d
  ON bids.rollup_saletype_day (rollup_scope, product_major_code, product_minor_code, d);

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'refresh_rollup_product_day';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh_rollup_product_day',
  '15 9 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY bids.rollup_product_day$$
);

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'refresh_rollup_saletype_day';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh_rollup_saletype_day',
  '20 9 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY bids.rollup_saletype_day$$
);
