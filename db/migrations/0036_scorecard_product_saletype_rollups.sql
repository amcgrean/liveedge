-- 0036_scorecard_product_saletype_rollups.sql
-- Tier 1 scorecard rollups, Slice 2a.
--
-- Extends the 0035 daily-rollup pattern to product and sale-type analytical
-- paths. These are derived caches over public.customer_scorecard_fact; they do
-- not mutate source / ERP data. Apply manually in Supabase SQL editor during an
-- off-hours window because the initial CREATE MATERIALIZED VIEW ... WITH DATA
-- scans the live fact once.

-- ---------------------------------------------------------------------------
-- rollup_product_day
--
-- Daily product rollup with separate major and minor rows. Keeping the level in
-- the grain avoids inflated order counts when a major contains multiple minors.
-- Customer columns are included because customer scorecards and product top
-- customer drilldowns need them; item-level drilldowns intentionally stay live.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS bids.rollup_product_day;

CREATE MATERIALIZED VIEW bids.rollup_product_day AS
SELECT
  branch_id,
  customer_id,
  MAX(customer_name)                                            AS customer_name,
  'major'::text                                                 AS product_level,
  COALESCE(product_major_code, '')                              AS product_major_code,
  COALESCE(MAX(product_major), 'Unknown')                       AS product_major,
  ''::text                                                      AS product_minor_code,
  'All'::text                                                   AS product_minor,
  invoice_date::date                                            AS d,
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
  COALESCE(product_major_code, ''),
  invoice_date::date

UNION ALL

SELECT
  branch_id,
  customer_id,
  MAX(customer_name)                                            AS customer_name,
  'minor'::text                                                 AS product_level,
  COALESCE(product_major_code, '')                              AS product_major_code,
  COALESCE(MAX(product_major), 'Unknown')                       AS product_major,
  COALESCE(product_minor_code, '')                              AS product_minor_code,
  COALESCE(MAX(product_minor), 'Unknown')                       AS product_minor,
  invoice_date::date                                            AS d,
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
  COALESCE(product_major_code, ''),
  COALESCE(product_minor_code, ''),
  invoice_date::date
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
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS bids.rollup_saletype_day;

CREATE MATERIALIZED VIEW bids.rollup_saletype_day AS
SELECT
  'customer'::text                                              AS rollup_scope,
  branch_id,
  customer_id,
  ''::text                                                      AS product_major_code,
  ''::text                                                      AS product_minor_code,
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
  COALESCE(sale_type, ''),
  COALESCE(sale_type_reporting_category, ''),
  COALESCE(is_sale_type_excluded, false),
  invoice_date::date

UNION ALL

SELECT
  'product_major'::text                                         AS rollup_scope,
  branch_id,
  NULL::text                                                    AS customer_id,
  COALESCE(product_major_code, '')                              AS product_major_code,
  ''::text                                                      AS product_minor_code,
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
  COALESCE(product_major_code, ''),
  COALESCE(sale_type, ''),
  COALESCE(sale_type_reporting_category, ''),
  COALESCE(is_sale_type_excluded, false),
  invoice_date::date

UNION ALL

SELECT
  'product_minor'::text                                         AS rollup_scope,
  branch_id,
  NULL::text                                                    AS customer_id,
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
  COALESCE(product_major_code, ''),
  COALESCE(product_minor_code, ''),
  COALESCE(sale_type, ''),
  COALESCE(sale_type_reporting_category, ''),
  COALESCE(is_sale_type_excluded, false),
  invoice_date::date
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
