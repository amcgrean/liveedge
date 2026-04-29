# Scorecard Sync Gap Report

**Generated:** 2026-04-22  
**Audited against:** Supabase project `vyatosniqboeqzadyqmr` (agility-api)  
**Purpose:** Determine what Pi sync additions are needed before the Customer Scorecard UI can be built.

---

## TL;DR

**The scorecard is blocked on Pi sync.** The primary fact table (`customer_scorecard_fact`) does not exist in Supabase. It must be synced from SQL Server's `analytics.vw_customer_scorecard_fact` before any scorecard UI is buildable.

In addition, three structural columns required by the fact view are not present in any currently-synced table: **cost/GP data**, **product group (major/minor) lookup**, and **`linked_tran_type`** for non-stock detection. These will be resolved automatically once the fact view is synced, since that view computes them on the SQL Server side.

---

## Primary Source — MISSING ✗

### `analytics.vw_customer_scorecard_fact` → `customer_scorecard_fact`

| Field | Status |
|-------|--------|
| Exists in Supabase | **NO** |
| Analytics schema exists at all | **NO** |
| Reconstructable from existing tables | **No — see note below** |

**This is the single blocker.** Every scorecard KPI, product major table, sale type table, and drill-down depends on this fact view.

**Why not reconstruct from existing tables?**  
The raw tables for SO headers, shipment headers, and line items *are* partially available in Supabase (`agility_so_header`, `agility_shipments`, `erp_mirror_so_detail`, `erp_mirror_shipments_detail`). However, three critical columns are missing from all synced tables:

1. **`cost_amount` / `gross_profit`** — Neither `erp_mirror_so_detail` nor `erp_mirror_shipments_detail` contains cost or GP data. The SQL Server view computes these from purchase cost and standard cost tables that are not synced. Without GP, the GM%, Value Add %, and every margin calculation is impossible.

2. **Product major / minor codes** — `erp_mirror_item.pg_ptr` and `link_product_group` reference a product group master table (`erp_item_pg` or similar) that does not exist in Supabase. Without it, there is no way to map items to the product major categories the scorecard requires (Floor/Roof Trusses, Lumber, EWP, etc.).

3. **`linked_tran_type`** — Used to detect non-stock lines (`linked_tran_type = 'PO'`). Not present in any Supabase table. Required for the Non-Stock % KPI.

**Recommendation:** Sync `analytics.vw_customer_scorecard_fact` from SQL Server as a flat table. Do not attempt to reconstruct it in Postgres — the view already has all the allocation logic, normalization, and flag calculations validated and working.

**Pi sync config to add:**

```python
# beisser_sync.py — add to sync targets
{
    "source_view": "analytics.vw_customer_scorecard_fact",
    "dest_table": "public.customer_scorecard_fact",
    "primary_key": "ShipmentLineKey",          # unique per shipment line
    "watermark_column": "InvoiceDate",          # use for incremental sync
    "grain": "one row per invoice/shipment line",
    "estimated_row_count": "high — multi-year history",
    "sync_strategy": "watermark incremental (rolling 3-year window recommended)",
}
```

**Required columns** (from `docs/scorecard/02-sql-view-design.md`):

| Column | Type | Notes |
|--------|------|-------|
| `ShipmentLineKey` | text | Primary key |
| `ShipmentDate` | date | |
| `InvoiceDate` | date | Watermark column |
| `SalesOrderNumber` | text | |
| `OrderDate` | date | |
| `ShipmentNumber` | text | |
| `ShipmentSequence` | integer | |
| `CustomerID` | text | **varchar(24) — treat as text, never cast to int** |
| `CustomerName` | text | |
| `ShipToID` | text | |
| `ShipToName` | text | |
| `BranchID` | text | |
| `BranchName` | text | |
| `OrderType` | text | `'SO'` or `'CM'` — drives sale type normalization |
| `SaleTypeRaw` | text | Raw value before normalization |
| `SaleType` | text | Normalized |
| `SaleTypeReportingCategory` | text | Delivery / Will Call / Direct / Credit / Service / Install / Other / exclude |
| `IsSaleTypeExcluded` | boolean | |
| `IsCredit` | boolean | |
| `IsCreditMemo` | boolean | |
| `LineID` | text | |
| `ItemNumber` | text | |
| `ItemDescription` | text | |
| `ProductMajorCode` | text | e.g. `'200'` |
| `ProductMinorCode` | text | |
| `ProductMajor` | text | e.g. `'Engineered Wood Products'` |
| `ProductMinor` | text | |
| `QtyShipped` | numeric | |
| `SalesAmount` | numeric | Allocated/billed amount |
| `CostAmount` | numeric | |
| `GrossProfit` | numeric | |
| `GrossMarginPct` | numeric | |
| `Weight` | numeric | |
| `IsStock` | boolean | |
| `IsNonStock` | boolean | |
| `IsValueAddMajor` | boolean | |
| `AsOfDate` | date | |
| `CutoffCY` | date | |
| `CutoffLY` | date | |
| `IsCYTD` | boolean | Legacy field, keep for compat |
| `IsLYTD` | boolean | Legacy field, keep for compat |

---

## Supplementary Sources — ALL MISSING ✗

### `analytics.vw_customer_payments` → `customer_payments`

| Field | Status |
|-------|--------|
| Exists in Supabase | **NO** |

**Used for:** Average Days to Pay KPI  
**Impact:** This KPI will show "Not yet available" until synced.

**Pi sync config:**

```python
{
    "source_view": "analytics.vw_customer_payments",
    "dest_table": "public.customer_payments",
    "primary_key": "PaymentKey",              # adjust to actual PK
    "watermark_column": "PaymentDate",
    "grain": "one row per AR payment event",
}
```

**Minimum required columns:**

| Column | Type |
|--------|------|
| `CustomerID` | text |
| `InvoiceDate` | date |
| `PaymentDate` | date |
| `DaysToPay` | integer |
| `InvoiceAmount` | numeric |

---

### `analytics.vw_customer_days_to_pay` → `customer_days_to_pay`

| Field | Status |
|-------|--------|
| Exists in Supabase | **NO** |

**Used for:** Average Days to Pay (alternate source if `vw_customer_payments` is not line-grain)  
**Impact:** Same as above — gate behind feature flag.

> If `vw_customer_payments` is synced and works, this view is not needed separately.

---

### `analytics.vw_agility_quotes` or equivalent → `customer_quotes`

| Field | Status |
|-------|--------|
| Exists in Supabase | **NO** |
| Source view name confirmed | **Unknown — verify in SQL Server** |

**Used for:** % Quotes Won KPI  
**Impact:** This KPI will show "Not yet available" — gated behind feature flag in v1 per spec.

**Minimum required columns (if synced later):**

| Column | Type |
|--------|------|
| `CustomerID` | text |
| `QuoteDate` | date |
| `QuoteStatus` | text | `'Won'` / `'Lost'` / `'Open'` |
| `QuoteAmount` | numeric |

---

## What IS Available (no sync changes needed)

These existing Supabase tables can support **non-financial** portions of the scorecard (customer picker, branch filter, ship-to display), but cannot support any GP or product breakdown calculations:

| Table | Available data | Scorecard use |
|-------|---------------|---------------|
| `agility_so_header` | SO#, sale_type, cust_code, cust_name, ship-to, branch, created_date | Customer list, branch filter |
| `agility_customers` | cust_code, cust_name, ship-to address, lat/lon | Customer typeahead picker |
| `agility_shipments` | invoice_date, ship_date | Date headers only |
| `erp_mirror_so_detail` | item_ptr, qty_ordered, price | Revenue estimate only (no cost) |
| `erp_mirror_shipments_detail` | qty (shipped), price | Revenue estimate only (no cost) |
| `erp_mirror_item` | item description, pg_ptr, link_product_group | Item descriptions (no major/minor names) |
| `erp_mirror_item_branch` | weight, handling_code | Weight estimate |

**None of the above are sufficient to build scorecard KPIs.** They are listed here only to confirm they exist for supporting UI elements (customer picker, branch filter dropdowns).

---

## Recommended Pi Sync Additions (Priority Order)

| Priority | View to sync | Supabase table | Unblocks |
|----------|-------------|----------------|---------|
| **1 — Critical** | `analytics.vw_customer_scorecard_fact` | `customer_scorecard_fact` | Entire scorecard |
| **2 — High** | `analytics.vw_customer_payments` | `customer_payments` | Avg Days to Pay KPI |
| **3 — Low / deferred** | `analytics.vw_agility_quotes` (verify name) | `customer_quotes` | % Quotes Won KPI (v2) |

---

## Build Strategy While Awaiting Sync

The following can be built **now** without any sync changes:

1. **Route scaffolding** — `/scorecard`, `/scorecard/[customerId]` pages with auth gates
2. **Filter UI** — Customer typeahead (from `agility_customers`), branch filter, year pickers, period toggle, URL search params
3. **Drizzle schema** — Speculative schema for `customer_scorecard_fact` ready for when the table populates
4. **Query functions** — All of `src/lib/scorecard/queries.ts` written against the speculative schema, gated behind a `SCORECARD_DATA_AVAILABLE` feature flag
5. **KPI tiles** — Component shells with "Data not yet synced — pending Pi sync" state
6. **Product Major table** — Component shell with empty/pending state
7. **Print stylesheet** — Can be built independently

**What cannot be built until sync completes:**
- Any live data in the scorecard
- Validation against Tableau numbers

---

## How to Verify After Sync

Once `customer_scorecard_fact` is populated, run this query to confirm grain and sale type normalization:

```sql
SELECT
  "OrderType",
  "SaleTypeRaw",
  "SaleType",
  "SaleTypeReportingCategory",
  SUM("SalesAmount") AS total_sales
FROM public.customer_scorecard_fact
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2
LIMIT 20;
```

Expected spot-check result (from `docs/scorecard/05-open-items-and-validation.md`):

| OrderType | SaleTypeRaw | SaleType | SaleTypeReportingCategory | Sales |
|-----------|-------------|----------|--------------------------|-------|
| CM | WILLCALL | CREDIT | Credit | (large negative) |
| SO | WILLCALL | WILLCALL | Will Call | (positive) |
