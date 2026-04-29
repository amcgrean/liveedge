# Claude Code Prompt — Customer Scorecard Module in LiveEdge (Beisser)

## Your role

You are building a production-quality **Customer Scorecard module** inside the Beisser **LiveEdge** app (the Next.js rebuild of WH Tracker). This replaces the Tableau-based scorecard currently powered by `analytics.vw_customer_scorecard_fact` on SQL Server. The CFO currently rebuilds this by hand in Excel every month and we are eliminating that workflow.

This scorecard is a **drill-down comparison dashboard** for one customer, many customers, or all customers across two user-selected years with a YTD or Full Year toggle. It mirrors the Tableau design (handoff docs are the authoritative spec for logic and calcs) and extends it to match the CFO's full Excel scorecard (attached handwritten reference image `/docs/scorecard-reference.jpeg`).

## Stack and environment

You are working inside the **LiveEdge** repo. Confirm the repo root before starting.

- **Framework**: Next.js 15 App Router, TypeScript, React Server Components by default
- **ORM**: Drizzle
- **Database**: Supabase (Postgres) — project `agility-api`, ID `vyatosniqboeqzadyqmr`
- **Auth**: NextAuth v5 (same pattern as Beisser Takeoff)
- **Styling**: Tailwind, shadcn/ui
- **Charts**: Recharts (install if not present)
- **Tables**: TanStack Table
- **Host**: Vercel

Read `package.json`, `drizzle.config.ts`, `src/lib/db/schema.ts` (or equivalent), and any existing route structure **before writing code**. Match the codebase's existing conventions exactly — do not invent new patterns if this repo already has one for server actions, data fetching, auth checks, or schema definitions.

## Data source strategy

All scorecard data comes from Supabase, **not** from SQL Server directly. The Pi-hosted `beisser_sync.py` watermark sync mirrors SQL Server views to Supabase tables.

### Required Supabase tables (Drizzle schema)

These must exist in Supabase, synced from the corresponding SQL Server views. **If any are missing, do NOT query SQL Server directly.** Instead:

1. Stop and report exactly which views are missing
2. Produce a list for Aaron that he can hand to the Pi sync config to add
3. Write the Drizzle schema speculatively so it's ready when the sync is updated
4. Gate the affected parts of the UI behind a feature flag that reads "data not yet synced" until the tables populate

**Primary source (required)**:
- `analytics.vw_customer_scorecard_fact` → `customer_scorecard_fact` in Supabase
  - Grain: one row per shipment/invoice line
  - Columns documented in `docs/02-sql-view-design.md` (handoff)

**Supplementary sources (check if synced; add to sync if not)**:
- `analytics.vw_customer_payments` — for Average Days to Pay
- `analytics.vw_customer_days_to_pay` — alternate source if the above is not line-grain
- `analytics.vw_customer_profile` — for customer name/ship-to metadata if not in fact view
- `analytics.vw_agility_quotes` or similar — for % Quotes Won (may not exist yet; gate behind flag)

Write the Drizzle schema to reflect the **column list in `docs/02-sql-view-design.md`** verbatim. Use `numeric` for money columns, `boolean` for flags, `date` for dates, `text` for IDs.

### Critical: CustomerID is string everywhere

Per the source views, `CustomerID` is `varchar(24)` — **treat it as a string in TypeScript and Postgres (`text`)** even though it looks numeric. This was the exact bug in Tableau and we are not repeating it.

## Feature scope — everything on the CFO's scorecard

The handwritten scorecard from the CFO includes the following. Build all of it. Items marked **(from Tableau handoff)** are already fully specified in the handoff docs — use that logic verbatim.

### Header
- Customer Name + Customer ID (e.g. "Greenland Homes — GREE1000")
- Ship-to breakdown toggle (drill into ship-to level)
- Period label (`YTD thru 2026-04-21` or `Full Year`)
- Compare title (`2026 vs 2025`)

### Top-line comparison table (3-year rolling)

Three columns side-by-side like the CFO's scorecard:

|                    | CY YTD       | 12/31/prior1 | 12/31/prior2 |
|--------------------|--------------|--------------|--------------|
| Sales              | $5,433,673   | $5,750,873   | $8,367,251   |
| Gross Profit       | $1,189,548   | $1,077,061   | $1,312,177   |
| GP%                | 21.89%       | 18.73%       | 15.68%       |

The year columns should be **driven by the Base Year parameter** — show Base YTD, prior full year, and prior-prior full year.

### Product Mix table (CY Sales / CY GP / CY GP% / LY Sales / LY GP / LY GP%)

One row per **Product Major**. All majors listed, including zero-dollar ones, so the CFO can see what's missing. From the handwritten scorecard, known majors include:

- Floor/Roof Trusses
- Lumber
- Building Materials Misc
- Panels
- EWP
- Decking-Composite
- Siding
- Windows-Vinyl
- Interior Trim
- Windows-Premium
- Interior Doors
- Exterior Doors
- Nails, Screws, Anchors
- Labor
- Roofing Materials
- Insulation Drywall
- Hardware
- Decking-Cedar/Treated
- Exterior Finish Materials
- Discontinued Items
- Total row (bold, tied to KPIs above)

Columns: `CY Sales`, `CY GP`, `CY GP%`, `LY Sales`, `LY GP`, `LY GP%`.
Sparkline or mini bar chart column comparing CY vs LY sales is a nice-to-have.

### KPI Tiles Row **(from Tableau handoff)**

Five tiles, each showing Base value, Compare value, Delta, and colored sign indicator (Up=green ▲, Down=red ▼, Flat=gray —):

1. **Sales** — `Sales - Base` / `Sales - Compare`
2. **Gross Profit** — `GP - Base` / `GP - Compare`
3. **Gross Margin %** — `GM% - Base` / `GM% - Compare`
4. **Value Add %** — `Value Add % - Base` / `Value Add % - Compare`
5. **Non-Stock %** — `Non-Stock % - Base` / `Non-Stock % - Compare`

See `docs/04-calculated-fields-reference.md` for exact formulas. Port each to SQL (prefer) or TypeScript.

### Bottom metrics table (CFO's additional KPIs)

From the handwritten scorecard:

- Gross Sales B4 CM's (Sales before Credit Memos)
- CM's (Credit Memo dollars)
- CM's as a % of Sales
- # of Sales Orders
- # of CM's
- # CM's / # SO's (ratio)
- Avg Sales Order $
- Avg Sales Order Weight
- Non-Stock Sales $
- Non-Stock GP $
- Non-Stock GP %
- Average Days to Pay (from `vw_customer_payments` if synced; else show "Not available" with tooltip)
- % Quotes Won (gate behind feature flag; show "Not yet available" if quote view not synced)
- High GP% / Value Added Products % of Sales & GP

Each row should show **CY** and **LY** columns.

### Sales by Sale Type table **(from Tableau handoff)**

Rows: `SaleTypeReportingCategory` (Delivery, Will Call, Direct, Credit, Service, Install, Other — exclude `'exclude'` rows by default, with a toggle).
Columns: `Sales - Base`, `Sales - Compare`, `GP - Base`, `GP - Compare`, `GM% - Base`, `GM% - Compare`.

### Drill-down: Product Major → Product Minor → Item

Clicking a Product Major row expands to show Product Minors.
Clicking a Product Minor expands to show individual items with `ItemNumber`, `ItemDescription`, `QtyShipped`, `SalesAmount`, `GrossProfit`, `GrossMarginPct` for both Base and Compare periods.

Use TanStack Table with expanding rows. Server-side aggregation — do **not** ship raw line items to the client for the rollup view.

### Ship-to breakdown view

Toggle at the top that switches from "Customer rollup" to "By Ship-to." In ship-to mode, the KPI tiles and Product Major table reaggregate at `ShipToID` granularity with each ship-to as its own column or a selectable list.

## Filter controls (top bar)

1. **Customer selector** — typeahead multi-select. Supports 1, many, or "All Customers"
2. **Branch filter** — multi-select: Grimes, Coralville, Fort Dodge, Johnston/Birchwood
3. **Base Year** — year picker, default = current year
4. **Compare Year** — year picker, default = prior year
5. **Period** — `YTD` or `Full Year` toggle, default YTD
6. **YTD Cutoff Date** — defaults to today; overridable for historical comparisons
7. **Ship-to breakdown** — toggle

Persist filter state in the URL as search params so the view is linkable and shareable. Use Next.js `searchParams` in server components.

## Architecture

### Routes

```
/scorecard                         — list of customers (search/filter)
/scorecard/[customerId]            — scorecard view for a customer
/scorecard/[customerId]/ship-to/[shipToId]   — drill into a ship-to
```

All filters live in search params on these routes.

### Data layer

Create `src/lib/scorecard/queries.ts` with **server-only** query functions. Each function:

- Is an `async` function returning typed results
- Takes a typed params object (customer IDs, years, period, cutoff, branch IDs)
- Returns aggregated data — **no raw line items** to the client for rollups
- Uses Drizzle with SQL aggregations (`SUM`, `CASE WHEN` for Base/Compare period filtering)
- Is cacheable (use `unstable_cache` with appropriate tags; bust on `scorecard-fact` sync completion if possible)

Port each Tableau calculated field to SQL. Example for `Sales - Base`:

```ts
// In a Drizzle query
sql`SUM(CASE
  WHEN EXTRACT(YEAR FROM ${customerScorecardFact.invoiceDate}) = ${baseYear}
   AND (${period} = 'Full Year' OR ${customerScorecardFact.invoiceDate} <= ${baseCutoff}::date)
  THEN ${customerScorecardFact.salesAmount}
  ELSE 0
END)`.as('sales_base')
```

Do this once in a helper that takes `baseYear`, `compareYear`, `period`, `cutoff` and returns reusable SQL fragments for all the Base/Compare measures.

### Server components vs client components

- Filters, layout, tables, KPI tiles → **server components** where possible
- Typeahead customer picker → client component (needs onChange)
- Expanding table rows → client component
- URL state management → use `next/navigation` from a small client wrapper that updates `searchParams`

### Caching

- `unstable_cache` each query with tags like `scorecard:${customerId}:${baseYear}:${compareYear}:${period}`
- Cache TTL: 15 minutes default; the sync runs on its own cadence, so staleness is acceptable
- Provide a "Refresh data" button in the UI that calls `revalidateTag` via a server action

### Auth

Gate the entire `/scorecard` route group behind NextAuth session check. Use the same middleware pattern as the rest of LiveEdge. No role restrictions for v1 — any authenticated Beisser user can view any customer. We'll add RLS later.

## UI / UX requirements

- **Dense, data-first layout**. This is a BI dashboard, not a marketing site. Use the existing LiveEdge design system — match it exactly. Do not invent a new visual language.
- **Print-ready**. A `Print` button in the top-right should produce a clean PDF-ready layout (hide filters, expand all drill-downs, fit to letter). Use a `@media print` stylesheet and/or a `?print=1` query param that swaps the layout.
- **Number formatting**: Always `$` and thousands separators for money. Percentages with 2 decimals. Deltas show sign explicitly (`+$12,450` or `−$3,200`).
- **Empty states**: Zero-dollar Product Major rows render with `—` not `$0.00` so they visually recede. Missing data (Days to Pay, Quotes Won when not synced) shows "Not yet available" with a tooltip explaining why.
- **Loading states**: Skeletons for KPI tiles, tables. Suspense boundaries per section so the header and filters appear first.
- **Mobile**: Readable on tablet (10"+), acknowledged-degraded on phone. CFO and sales managers will use this on desktop or iPad.

## Validation requirements

Before declaring the scorecard done, run these checks and include the results in the PR description.

### Parity with Tableau
1. Pick 3 real customers (one large, one mid, one small — use whatever top customers show in the fact data)
2. For each, capture from Tableau: Sales CY, GP CY, GM% CY, Sales LY, GP LY, GM% LY for both YTD and Full Year
3. Compare to Next.js output — must match to the dollar (or within $1 rounding)

### Sale type normalization
1. Query `SELECT order_type, sale_type_raw, sale_type, sale_type_reporting_category, SUM(sales_amount) FROM customer_scorecard_fact GROUP BY 1,2,3,4 ORDER BY 1,2`
2. Confirm `CM / WILLCALL` → `CREDIT / Credit` with negative total
3. Confirm `SO / WILLCALL` → `WILLCALL / Will Call` with positive total

### Product Major totals
1. Sum of Product Major table Sales column must equal KPI Sales card (both Base and Compare)
2. If it doesn't, there's a filter mismatch — fix it

### Edge cases
1. Customer with only Base-year activity (no Compare) — renders without NaN
2. Customer with only Compare-year activity (no Base) — renders without NaN
3. Date range where Base Year == Compare Year — logic holds (Delta = 0)
4. Leap-year cutoff (Feb 29 base, non-leap compare) — clamp day to end-of-month

## Deliverables

1. `/scorecard` route group fully functional
2. Drizzle schema for `customer_scorecard_fact` and any supplementary tables
3. `src/lib/scorecard/queries.ts` with all server-side query functions and the Base/Compare SQL helper
4. `src/lib/scorecard/types.ts` with shared TypeScript types
5. Reusable components: `KpiTile`, `ComparisonTable`, `ProductMajorTable` (with drill-down), `SaleTypeTable`, `CustomerPicker`, `YearPicker`, `PeriodToggle`
6. Print stylesheet
7. README section in `/docs/scorecard.md` documenting:
   - The data dependencies (which Supabase tables must be synced)
   - Any Pi sync additions needed
   - How to validate against Tableau
   - Feature flags for not-yet-synced data sources

## Sync gap report (do this FIRST)

Before writing any code, run through the column requirements and compare against what's already in Supabase. Produce a file `/docs/scorecard-sync-gaps.md` listing:

- Which required views/tables are already synced ✓
- Which need to be added to `beisser_sync.py` ✗
- For each missing one: view name, required columns, suggested Supabase table name, grain

Aaron will use this to update the Pi sync. Do not proceed to full UI build until this gap report is reviewed.

## Non-goals for v1

- RLS / per-user-customer restrictions (will add in v2)
- Export to Excel (PDF print is enough for v1)
- Scheduled email delivery of scorecards (v2)
- Quote win % (gated behind sync availability)
- Mobile-first layout (desktop-first is fine)
- Replacing Tableau entirely — Tableau stays live in parallel until this is validated

## Reference files (in repo at `/docs/scorecard/`)

Place these from the handoff zip:
- `README.md`
- `01-project-overview.md`
- `02-sql-view-design.md` (authoritative column list)
- `03-tableau-scorecard-build.md`
- `04-calculated-fields-reference.md` (port every calc to SQL or TS)
- `05-open-items-and-validation.md`
- `06-current-view-sql.md` (sale type normalization logic)
- `scorecard-reference.jpeg` (CFO's handwritten scorecard — source of truth for what to display)

## Start here

1. Confirm you're in the LiveEdge repo root
2. Read `package.json` and existing `src/` structure; summarize back the stack and conventions you're matching
3. Check existing Drizzle schema for any already-synced Agility/analytics tables
4. Produce `/docs/scorecard/scorecard-sync-gaps.md` as described above
5. **Stop and wait for Aaron's review of the gap report before building the UI**

Do not proceed past step 5 without confirmation. The sync gap determines what's buildable now vs what's blocked on Pi sync changes.
