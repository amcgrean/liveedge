# Scorecard Analytics Rollups — Next Slice (handoff 2026-05-30)

## Context

This is **Tier 1** of the architecture/scalability review (full plan was written
for the owner; the live reference is the "Scorecard Analytics Rollups" section in
`CLAUDE.md`). Goal: **isolate analytical load from operational load** so heavy
scorecard/management scans stop competing with operational reads for the shared
buffer cache on the single Supabase instance (root cause of the 2026-05-28
timeout incident; the project also shows a live "exhausting resources" banner).

**Slice 1 is DONE and merged (PR #459, migration `0035_scorecard_rollups.sql`):**
- `bids.rollup_customer_day` — a **daily-grain**, **pre-split-measure** materialized
  view over `public.customer_scorecard_fact` (505,472 rows / 89 MB vs the 6.4 GB
  fact). Nightly `pg_cron` `REFRESH MATERIALIZED VIEW CONCURRENTLY` (jobid 7, `10 9 * * *`).
- Rewired `_fetchCustomerList` + `_fetchAllCustomersAvg` in `src/lib/scorecard/queries.ts`
  to read it. Validated to the cent against the live fact (incl. partial-month YTD).
- `GET /api/admin/sync-health` — cheap freshness monitor for the Pi sync + rollup.

**Use slice 1 as the exact template.** Read migration `0035` and the two rewired
functions before starting.

## Status (updated 2026-05-30)

- **Slice 2a — DONE & LIVE (PR #462, migration `0036`).** `rollup_product_day` +
  `rollup_saletype_day` built; customer + product-drill major/minor functions
  rewired. `_fetchProductKpis` distinct counts stay on a bounded live query
  (can't SUM per-day distincts).
- **Slice 2b — DONE & LIVE (PR #468, no new migration).** Aggregate/management
  company-branch functions rewired; rep scope stays live. `_fetchAggregateKpis`
  splits additive→rollup / distinct→bounded-live via `fetchAggregateDistinctCounts`.
- **0036 was rewritten to single-scan** (one `MATERIALIZED` CTE per MV; coarser
  grains derived from it) — the original UNION form did 5 full fact scans and
  timed out. **The Supabase MCP has a hard 60s cap; apply these in the SQL
  editor / direct psql with `statement_timeout=0`, off-hours.**
- **Remaining: Slice 2c (vendor) + sync-health alerting only.**

## Your task — extend the same pattern

Build the remaining fact-sourced rollups and rewire the additive query functions.
Recommended order (each is its own PR, smallest/lowest-risk first):

### Slice 2a — product + sale-type rollups (fact-sourced, low risk) — ✅ DONE (PR #462)
1. **`bids.rollup_product_day`** — grain `(branch_id, product_major_code,
   product_minor_code, d)`. Measures: `sales_amount`, `gross_profit`, `weight`,
   `qty_shipped`, plus any flag-split columns the consumers need (mirror the
   `_fetchProductMajors`/`Minors` FILTERs). Measured ~600K rows.
2. **`bids.rollup_saletype_day`** — grain `(branch_id, sale_type,
   sale_type_reporting_category, is_sale_type_excluded, d)`. Measures:
   `sales_amount`, `gross_profit`. The grain MUST carry both `sale_type` and
   `sale_type_reporting_category` + `is_sale_type_excluded` because
   `_fetchSaleTypes`/`_fetchAggregateSaleTypes` apply a CASE
   (`'HOLD'`/`'DOORHOLD'` literal else reporting_category) and a
   `BOOL_OR(is_sale_type_excluded)`. Tiny (~45K rows).
3. Rewire in `src/lib/scorecard/queries.ts`: `_fetchProductMajors`,
   `_fetchProductMinors`, `_fetchSaleTypes`.
4. Rewire the **major/minor-level** functions in
   `src/lib/scorecard/product-drill-queries.ts`: `fetchProductThreeYear`,
   `fetchProductBranchMix`, `fetchProductTopCustomers`, `fetchProductSaleTypes`,
   `fetchProductKpis` — **only the variants filtered by `product_major_code` or
   `product_major_code + product_minor_code`.** The `item_number`-filtered
   variants (item scorecard) CANNOT use a major/minor rollup — leave them live
   (item grain ≈ fact cardinality, no win).

### Slice 2b — aggregate management dashboards (fact-sourced) — ✅ DONE (PR #468)
Rewire the company/branch aggregate functions: `_fetchAggregateThreeYear`,
`_fetchAggregateProductMajors`, `_fetchAggregateProductMinors`,
`_fetchAggregateSaleTypes`, and the **company/branch scope of**
`_fetchAggregateKpis`.

**⚠️ The hardest gotcha — rep-scoped paths stay LIVE.** `_fetchAggregateKpis`
(and friends) join `agility_so_header` on `rep_1`/`rep_3` for the **rep
scorecard**. `rep` is NOT a column on `customer_scorecard_fact`, so a
customer/product rollup cannot serve rep-scoped queries. Split the function:
company/branch scope → rollup; rep scope → unchanged live fact+join. Do not
break the rep scorecard.

### Slice 2c — vendor rollup (DIFFERENT source, most care) — ⏳ NOT STARTED
`src/lib/vendor-scorecard/queries.ts` reads `agility_receiving_*` +
`agility_po_header`, **NOT** `customer_scorecard_fact`. A `rollup_vendor_day`
would group `(system_id, supplier_key, ship_from_seq, d=receive_date)` with
`cost`/`qty`/`qty_ordered`/`receipt`/`on_time` measures. Watch:
- `agility_receiving_header` has **no `supplier_key`** — it comes from the joined
  `agility_po_header`.
- `supplier_key` is left-padded with spaces — `TRIM()` everywhere.
- LMC1000 multi-ship-from namespacing (`<key>::<seq>`) — preserve it.
Lower priority; only do this after 2a/2b land and if vendor pages are slow.

## Non-negotiable rules (from slice 1)

- **Daily grain, not monthly** — live queries filter `invoice_date::date <= cutoff`
  (day-level YTD). `d = invoice_date::date`; `EXTRACT(YEAR)=y AND date<=cutoff`
  becomes `d >= make_date(y,1,1) AND d <= cutoff::date`.
- **Pre-split measure columns**, never flags-as-grain (avoids row explosion).
- **`WHERE is_deleted=false AND invoice_date IS NOT NULL`** in the MV (keeps the
  unique index clean for CONCURRENTLY; changes no result since consumers filter dates).
- **`customer_scorecard_fact` SKU column is `item_number`, NOT `item_code`.**
- **Stays LIVE, do not rewrite:** single-customer (`_fetchKpis`, `_fetchThreeYear`),
  distinct-count-exact paths, `_searchCustomers`, `_fetchDaysToPay`,
  `_fetchProductOrders`, item-level product drill, rep-scoped aggregates.
- Keep the query functions wrapped in `erpCache()` (they already are).
- Schema hygiene: rollups live in `bids`, read `public` read-only, no FKs into
  ERP mirror tables (eventual `analytics` schema move).

## Validation protocol (do this BEFORE merging — it's how slice 1 was proven)

Supabase project id: **`vyatosniqboeqzadyqmr`** (MCP `execute_sql`, read-only).

1. Diff the rollup projection vs the live fact on **bounded slices** (one branch,
   one year, and crucially a **partial-month YTD cross-year** case). All
   additive-measure deltas must be `0.0000`. Keep slices bounded to respect the
   `reltuples`-not-`COUNT(*)` rule — never run unguarded `COUNT(*)` on the fact.
2. `tsc --noEmit` clean + `npx vitest run` (39 tests) green.
3. After the owner applies the migration **off-hours** (initial
   `CREATE MATERIALIZED VIEW … WITH DATA` does one full 6.4 GB scan), run `ANALYZE`
   on the new MV, verify row count/size, and `EXPLAIN (ANALYZE, BUFFERS)` a
   rewired query reads the MV (KB–MB), not the fact.

## pg_cron schedule pattern (copy from 0035)

```sql
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh_<name>';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('refresh_<name>', '15 9 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY bids.<name>$$);
```
Stagger schedules a few minutes apart (customer is `10 9`; use `15 9`, `20 9`, …).

## Migration / apply notes

- Next migration number: **`0036_*`** (0035 is taken).
- The owner applies migrations manually in the Supabase SQL editor, off-hours.
- The "destructive operation" warning on apply is expected — it's the
  `DROP MATERIALIZED VIEW IF EXISTS` (a derived cache) + `cron.unschedule`.
  Nothing touches source/ERP data.

## Branch / PR

Develop on the assigned `claude/*` branch, push, open a PR ready for review.
Subscribe to PR activity if asked to babysit CI.
