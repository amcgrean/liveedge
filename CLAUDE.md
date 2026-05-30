# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, NextAuth v5). Used by sales staff/estimators at four Iowa lumberyard locations.

## Route Reference
Full API and page route inventory: **`docs/routes.md`** (last audited 2026-05-13; Hubbell email-ingest routes removed).

## Access Control — COMPLETE
Capability-based access control is fully rolled out (all 5 phases). See **`docs/access-control-plan.md`** for the full design, 28-capability vocabulary, and role-defaults table.

**Security remediation master plan** (`docs/security-remediation-master-plan-2026-05-14.md`) — **fully resolved 2026-05-20.** PR1–PR6 merged (PR5 follow-up fix in #349, PR6 in #351). The four open product/security decisions also closed (`docs/security-decisions-closed-2026-05-20.md`): scorecard stays bundled with `sales.view`, no step-up auth, indefinite audit retention, static Bearer tokens for service routes. **Don't reopen any of those without a concrete trigger.** Runbook for operating the permissions route lives at `docs/security-runbook.md`.

**Key files:**
- `src/lib/access-control.ts` — `CAPABILITIES`, `ROLE_DEFAULTS`, `effectiveCapabilities()`, `requireCapability()` (API routes), `requirePageAccess()` (server pages), `hasCapability()` (inline checks)
- `src/lib/access-control-shared.ts` — client-safe subset (`hasCapability`, `Capability` type) — import this in `'use client'` components, NOT `access-control.ts`
- `src/lib/menu-config.ts` — `MENU` array (ground-truth nav items with `requires` per item), `visibleMenu()` filter helper
- `db/migrations/0015_user_capabilities.sql` — adds `granted_capabilities text[]` and `revoked_capabilities text[]` to `public.app_users` (already applied)

**Auth flow:** `auth.ts` reads `granted_capabilities`/`revoked_capabilities` from `app_users` at login, computes the effective set via `effectiveCapabilities(roles, granted, revoked)`, and persists it on the JWT. A permission change takes effect on the user's **next sign-in**.

**Admin UI:** `/admin/users/[id]/permissions/` — 3-tab capability editor (Pages & Menus / Actions / Admin). Each row shows a 3-state toggle (Inherited / Granted / Revoked) with a live green dot for the effective resolved value. Changes are audit-logged.

**Pattern for new routes:**
```ts
// API route
const authResult = await requireCapability('sales.view');
if (authResult instanceof NextResponse) return authResult;
const session = authResult;
const isAdmin = hasCapability(session, 'branch.all');

// Server page
const session = await requirePageAccess('admin.users.manage');
```

**Deleted (Phase 5):** `src/lib/permissions.ts` and `src/lib/auth-helpers.ts` — the legacy `bids.user_security` matrix system. `legacyUserType` and `legacyUserSecurity` Drizzle table definitions removed from `db/schema-legacy.ts`.

## Architecture Overview

### Single Database — Supabase (agility-api project)
All data lives in one Supabase Postgres instance, split into two schemas:

| Schema | Owner | Contents |
|--------|-------|----------|
| `public` | WH-Tracker (Alembic) | `agility_*` optimized ERP tables (primary), legacy `erp_mirror_*` tables (being phased out), WH-Tracker app tables |
| `bids` | beisser-takeoff (Drizzle) | All beisser-takeoff tables — UUID-based new tables + migrated legacy serial-ID tables |

**Never run drizzle-kit against the `public` schema.** `drizzle.config.ts` has `schemaFilter: ['bids']` to enforce this.

### Agent MCP queries against agility-api Supabase — use `reltuples`, not `COUNT(*)`

When an agent (any agent — Claude Code, Codex, future ones) needs row counts on hot tables via the Supabase MCP, **use `pg_class.reltuples`, not unguarded `COUNT(*)`.** The Supabase MCP tags every connection `application_name='mgmt-api'`, so all agent-issued queries land in `pg_stat_statements` under that name and accumulate across sessions.

A single `select count(*) from customer_scorecard_fact` reads the full 6.4 GB heap (~788 ms, ~5.7 MB of buffer reads). Repeated across analytical sessions this evicts the buffer cache used by LiveEdge's `/management` and `/scorecard` page queries — that's what produced the 2026-05-28 timeout incident (~12 hours of accumulated DB time + ~15.5 TB of disk reads across two probe queryids, traced to MCP traffic — see `docs/agent-prompts/mgmt-api-count-probe-fix-2026-05-28.md` for the full attribution).

Hot tables to be careful about: `customer_scorecard_fact`, `agility_so_header`, `agility_so_lines`, `agility_picks`, `agility_shipments`. Pattern:

```sql
-- Ballpark row count, sub-millisecond, no scan
SELECT reltuples::bigint
FROM pg_class
WHERE oid = 'public.customer_scorecard_fact'::regclass;
```

Use exact `COUNT(*) WHERE …` only when you actually need a subset count with an indexable predicate. After a heavy analytical session, consider `SELECT pg_stat_statements_reset();` so the next investigation has a clean stat window.

### ERP Table Layer — agility_* (2026-04-04)
All LiveEdge API routes now query the optimized `agility_*` tables instead of the old `erp_mirror_*` tables. **Never write new queries against `erp_mirror_*` — use `agility_*`.**

| agility_ table | Replaces | Key differences |
|----------------|----------|-----------------|
| `agility_so_header` | `erp_mirror_so_header` | Has `cust_name`, `cust_code`, `shipto_*` denormalized — no JOIN to customers/shipto needed. Missing `invoice_date`/`ship_date`/`terms` (now in `agility_shipments`). Date column is `created_date` (NOT `order_date`). Credit memos: `sale_type = 'Credit'`, open status = `'B'` (blank). |
| `agility_so_lines` | `erp_mirror_so_detail` | Has `item_code`, `handling_code` inline. **For $ aggregates use `extended_price` / `unshipped_extended_price` — never `qty_ordered * price`** (price is per-UOM, conversion lives in `disp_price_conv`). See "UOM-aware open-order $" note below. |
| `agility_customers` | `erp_mirror_cust` + `erp_mirror_cust_shipto` | One row per ship-to address (seq_num≥1). Use `GROUP BY cust_code` or `DISTINCT ON` to get one row per customer. **`rep_1` is NOT a column here** — it lives on `agility_so_header`. |
| `agility_items` | `erp_mirror_item` + `erp_mirror_item_branch` | Item master — one row per item. Has `product_major_code`, `product_major`, `product_minor_code`, `product_minor`. Branch-specific stock data (qty_on_hand, default_location, handling_code, active_flag, stock, system_id) is in `agility_item_branch` — join on `agility_item_branch.item_code = agility_items.item`. **Do NOT filter by branch on `agility_items`** — use `agility_item_branch.system_id`. `agility_items.system_id` = company code ('00CO'), not branch. |
| `agility_shipments` | `erp_mirror_shipments_header` | Same fields. Source for `invoice_date`, `ship_date` per SO |
| `agility_wo_header` | `erp_mirror_wo_header` | `source_id` is INTEGER (cast with `::text` for joins). Has `item_code`, `description` inline |
| `agility_picks` | `erp_mirror_pick_header` + `erp_mirror_pick_detail` | Combined — one row per pick line. `tran_id` = SO number, `tran_type` = 'SO' |
| `agility_po_header` | `erp_mirror_po_header` | Use `app_po_header` matview or `app_po_search` view for enriched PO data |
| `agility_po_lines` | `erp_mirror_po_detail` | Use `app_po_detail` view for enriched lines |
| `agility_suggested_po_header` | `erp_mirror_ppo_header` | `ppo_id` is the key |
| `agility_suggested_po_lines` | `erp_mirror_ppo_detail` | Use `app_suggested_po_summary` view |
| `agility_suppliers` | `erp_mirror_suppname` + `erp_mirror_supp_ship_from` | Ship-from fields inline per row |
| `agility_receiving_header` | `erp_mirror_receiving_header` | Same structure |
| `agility_receiving_lines` | `erp_mirror_receiving_detail` | Same structure |
| `agility_ar_open` | (new) | AR open items — `cust_key`, `ref_num`, `open_amt`, `open_flag`. **`cust_key` ≠ `cust_code`** — must resolve via `agility_customers` LATERAL join first (see AR query pattern below) |
| `agility_item_supplier` | (new, 2026-05-13) | Item × supplier × ship-from purchasing rules. One row per `(system_id, supplier_key, item_ptr, ship_from_seq_num)`. **`is_primary` flags the primary supplier per item.** Carries `lead_time_1..5`, `lead_time_flag`, `min_ord_qty`/`min_pak` + their `*_disp_uom` + `min_*_violation` rules (`Allow` / `Allow - Question` / `Block`), `supp_uom`, `use_uom_for_{po_entry,printed_po,po_check_in,receiving}`. Join to items via `item_ptr` (NOT `item`), to suppliers via `(supplier_key, ship_from_seq → ship_from_seq_num)`. **Always include `system_id` in the join predicate** — branch leak otherwise; items sold across branches resolve to the wrong rule. Trim `supplier_key` — source pads with leading spaces. |

App views backed by agility_ tables (via the old erp_mirror_ as of 2026-04-04 — will be updated to point at agility_ tables):
- `app_po_search` → `app_po_header` (matview) — enriched PO list for purchasing routes
- `app_po_detail` — PO line items with item lookup
- `app_po_receiving_summary` — receipt counts/dates per PO
- `app_suggested_po_summary` — suggested PO with supplier info
- `vw_board_open_orders` → `app_mv_board_open_orders` (matview)

### Database Connections
- `db/index.ts` — App DB. Uses `postgres.js` + `drizzle-orm/postgres-js`. Resolves `BIDS_DATABASE_URL` → `POSTGRES_URL_NON_POOLING` → `POSTGRES_URL`. All tables in `bids` schema.
- `db/supabase.ts` — ERP reads. Same Supabase instance, `public` schema. Exports `getErpDb()`, `getErpSql()`, `isErpConfigured()`.

Both connections use `prepare: false` and `max: 1` (serverless-safe, pgBouncer-compatible).

### Schema Files
- `db/schema.ts` — UUID-based tables in `bids` schema. Drizzle-managed via `drizzle-kit`. Exports `bidsSchema` (the `pgSchema('bids')` instance).
- `db/schema-legacy.ts` — Legacy serial-ID tables in `bids` schema. **READ/WRITE definitions only — never run drizzle-kit push/generate against these.** Imports `bidsSchema` from `schema.ts`.
- `db/migrations/` — SQL migration files. `0003*` files must be applied manually in Supabase SQL editor.

### Key Relationships
- `legacyBid` (serial int, `bids.bid` table) = legacy flat bid tracker entry
- `bids` (UUID, `bids.bids` table) = takeoff/estimating project with JSONB `inputs`
- `takeoffSessions.bidId` → `bids.bids.id` (UUID FK)
- `takeoffSessions.legacyBidId` → `bids.bid.id` (integer FK — added via 0003c migration)
- "Start Takeoff" from a legacy bid creates a `bids` record + `takeoffSession` linked to both

### Schema Enhancements (added during Supabase migration)
- `users`: `legacy_id` (maps Flask serial user), `branch_id`, `is_estimator`, `is_designer`, `is_commercial_estimator`, `permissions` (JSONB), `last_login`, `login_count`, `deleted_at`
- `customers`: `legacy_id` (maps Flask serial customer), `deleted_at`
- `bids`, `takeoff_sessions`: `deleted_at` (soft delete)
- `customers.name`, `bids.job_name`: GIN full-text search indexes
- `general_audit.changes`: upgraded from `text` to `jsonb`
- All timestamps: `withTimezone: true`

### Auth
- NextAuth v5 beta, single credentials provider, JWT strategy (7-day sessions)
- **Fully passwordless OTP.** All users sign in with username → emailed 6-digit code.
- `auth.ts` resolves identifier via `public.app_users`, verifies `public.otp_codes`, returns roles/branch from `app_users`
- OTP email sent via `POST /api/auth/send-otp` (accepts username or email, looks up actual email in `app_users`)
- Dev bypass: any username with code `000000` when no DB env vars are set

## PDF Takeoff Engine

PDF measurement and markup engine replacing Bluebeam Revu ($349/seat/year). Multi-scale construction drawings with multiple viewports per page.

### Architecture
- Two stacked canvas layers: pdfjs-dist v5 (bottom, read-only) + Fabric.js v7 (top, interactive)
- **CRITICAL**: Fabric.js v7 uses `opt.scenePoint` (NOT `opt.pointer`) for mouse event coordinates
- Zoom uses `canvas.setZoom()` transform only (never repositions objects)
- Page state serialized to JSON on page change, restored on return

### Key Files
```
src/lib/takeoff/
  calculations.ts    — Pure functions: calcPolylineLength, calcPolygonArea, calcCount, scale presets
  presets.ts          — 49 named measurement presets mapping to JobInputs fields
  pdfLoader.ts        — pdfjs-dist v5 setup, worker config, page rendering
  fabricHelpers.ts    — Fabric.js v7 canvas setup, zoom/pan, measurement objects, annotations
  viewportDetector.ts — Viewport hit detection
  exportCsv.ts        — CSV export via papaparse
  exportPdf.ts        — Annotated PDF export via jspdf + headless Fabric canvas compositing
  r2.ts               — Cloudflare R2 client (S3-compatible): upload, download, presigned URLs

src/hooks/
  useMeasurementReducer.ts — Full takeoff state (viewports, groups, measurements, pages, tools)
  useUndoRedo.ts            — Command-stack undo/redo
  useTakeoffSession.ts      — Session load/save, 2s debounced auto-save

src/components/takeoff/
  TakeoffCanvas.tsx          — Core dual-canvas component with all tool handlers
  TakeoffToolbar.tsx         — Two-row toolbar (session info + tools)
  BottomBar.tsx              — Bluebeam-style bottom bar: page nav, zoom, scroll mode toggle
  PageNavigator.tsx          — Collapsible thumbnail strip
  MeasurementSidebar.tsx     — Preset panel with categories and running totals
  MeasurementInspector.tsx   — Click-to-inspect detail panel
  ViewportManager.tsx        — Viewport list/manage
  ScaleCalibration.tsx       — Scale preset picker + manual calibration

app/takeoff/                 — Session list with optional bid-link search
app/takeoff/[sessionId]/     — Full workspace (TakeoffWorkspace.tsx)
```

### Named Tool Presets (Critical Feature)
Users measure by clicking preset buttons (e.g., "1st Floor Ext 2x6 9'") which activate the right tool type with the right color. Each preset's `targetField` maps to a specific `JobInputs` field (e.g., `firstFloor.ext2x6_9ft`). "Send to Estimate" writes accumulated totals directly to the linked bid.

## Migration Status (Flask → Next.js)

Full migration plan in `docs/migration-plan.md`. Six phases.

### Phase 0: Foundation — COMPLETE
- `db/schema-legacy.ts`: Drizzle definitions for all legacy tables
- Auth bridge, permissions middleware, branch context

### Phase 1: Legacy Bid Tracker — COMPLETE
- **Dashboard**: `app/dashboard/` — KPI cards (open bids, open designs, YTD completed, avg completion time), activity feed, quick action links. API: `app/api/dashboard/route.ts`.
- **Legacy bid CRUD**: `app/legacy-bids/` — List (paginated, filtered, sorted), add, manage. API: `app/api/legacy-bids/route.ts` + `[id]/route.ts` + `[id]/activity/route.ts`.
- **Bid file attachments**: `app/api/legacy-bids/[id]/files/route.ts` — Presigned R2 upload + proxy fallback + delete. ManageBidClient has upload/delete UI.
- **Bid → Takeoff link**: `app/api/legacy-bids/[id]/start-takeoff/route.ts` — Creates `bids` record + `takeoffSession` from legacy bid. Spec flags (includeFraming/Siding/Shingle/Deck/Trim/Window/Door) pre-filter which measurement presets load. ManageBidClient shows "Start Takeoff" or "Open Takeoff" button.
- **Standalone takeoff link**: `app/takeoff/TakeoffSessionList.tsx` — Optional bid-link search when creating a new session. Confirms if user skips linking.
- **Schema**: `takeoff_sessions.legacy_bid_id` (integer) links to legacy bid table.

### Phase 2: Designs, EWP, Projects — COMPLETE
- EWP pages: `app/ewp/` (list, add, manage, CSV import via `app/api/ewp/import/`)
- Projects pages: `app/projects/` (list, manage)
- **Design CRUD (2A)**: `app/designs/` — list, add, manage with activity log (`legacyDesignActivity`). Plan number auto-generated as `D-YYMM-NNN`.
- **Layouts/EWP CRUD (2B)**: Full CRUD + CSV import. Activity tracked via `legacyGeneralAudit` (modelName=`'ewp'`, ewpId stored in `changes` JSONB — no dedicated ewp_activity table in legacy DB).

### Phase 3: Admin Portal Expansion — COMPLETE
- Permissions: `app/admin/users/[id]/permissions/` (rewritten in access-control Phase 2 — now edits `app_users` capabilities, not the legacy `user_security` matrix)
- Bid Fields: `app/admin/bid-fields/`
- Notifications: `app/admin/notifications/`
- Audit: `app/admin/audit/`
- IT Issues: `app/it-issues/`
- Supporting libs: `src/lib/audit.ts`, `src/lib/notifications.ts`, `src/lib/csv-utils.ts`
- CSV import/export endpoints

### Phase 4: ERP Sync — COMPLETE
- **Supabase connection**: `db/supabase.ts` (postgres.js driver, singleton, ERP public schema reads)
- **Sync engine**: `src/lib/erp-sync.ts` — Customer sync (upserts erp_mirror_cust → bids.customers), item search (joins item + item_branch, filtered by branch), ship-to lookup, raw table query for admin
- **API routes**: `/api/erp/items`, `/api/erp/customers/[code]`, `/api/erp/customers/[code]/ship-to`
- **Admin panel**: `app/admin/erp/` — Connection status, table discovery, column viewer, data preview, manual sync, sync history
- **Cron**: `/api/cron/erp-sync` — Daily at 6 AM UTC

### Phase 4.5: Supabase DB Migration — COMPLETE
- All app tables now defined in `bids` schema on Supabase (was Neon `public`)
- Driver switched from `@neondatabase/serverless` to `postgres.js` across the board
- Neon env vars removed from Vercel; app uses `POSTGRES_URL_NON_POOLING` (Supabase direct)
- Debug/diagnostic logging stripped from `auth.ts` and `db/index.ts`
- Auth supports bcrypt password hashes with automatic upgrade from plaintext on login
- `db/migrate-from-neon.ts` — one-time migration script (reference only, migration executed)
- Migration SQL files in `db/migrations/0003*` — applied in Supabase SQL editor

### Phase 5: Unification and Cleanup — COMPLETE

#### 5A: Unified Bid View — COMPLETE
- `GET /api/legacy-bids/[id]` now queries `takeoffSessions` + `bids.inputs` for the linked session and returns `takeoffSession: { id, name, updatedAt, measurements }` where `measurements` is a pre-computed summary (basement/floor ext LF, roof SF, siding SF, deck SF, window/door counts)
- `ManageBidClient` consolidates to a single GET fetch (no longer calls start-takeoff separately); shows a cyan-bordered "Takeoff Measurements" sidebar card with row-level metrics and a direct link to the takeoff workspace
- Helper `computeMeasurementSummary()` in the API route converts the raw `bids.inputs` JSONB to a flat `Record<string, number>` — safe to null-check and extend

#### 5B: Bcrypt Password Migration — COMPLETE
- `db/bulk-bcrypt-migrate.ts` — one-time Node script: queries `bids."user"` WHERE `password NOT LIKE '$2%'`, hashes in batches of 10 at cost 12, updates in-place
- Run with: `npx tsx db/bulk-bcrypt-migrate.ts` (requires `POSTGRES_URL_NON_POOLING` or `BIDS_DATABASE_URL`)
- After running: verify with `SELECT count(*) FROM bids."user" WHERE password NOT LIKE '$2%'` = 0, then remove plaintext branch from `verifyPassword()` in `auth.ts`

#### 5C: Customer-Centric Views — COMPLETE
- `app/admin/customers/[id]/CustomerDetailClient.tsx` — full customer detail page: stat cards (bid/design/EWP/takeoff counts), bids list, designs list, EWP list, estimator bids list; each row links to its manage page
- `app/api/customers/[id]/designs/route.ts` — GET designs for a legacy customer ID (joins `legacyDesigner`)
- `app/api/customers/[id]/ewp/route.ts` — GET EWP records for a legacy customer ID
- `app/api/customers/[id]/bids/route.ts` already existed and returns both legacy + UUID bids
- `CustomersClient.tsx` — added ExternalLink icon button on each row to `/admin/customers/[id]`

### Phase 6: Polish and Sunset — PARTIALLY COMPLETE

#### Polish — COMPLETE
- **Viewport meta tag**: added `export const viewport: Viewport` to `app/layout.tsx` (was missing, broke mobile layout)
- **Mobile nav**: `TopNav.tsx` refactored — desktop nav hidden below `lg:`, hamburger button (`Menu`/`X`) toggles a full-width drawer at mobile breakpoints; closes on route change
- **Print CSS**: already comprehensive in `app/globals.css` (lines 63–130) — hides nav/buttons, white bg, page-break handling
- **Error boundaries**: `app/error.tsx` + 6 route-level `error.tsx` files already in place; no additional work needed

#### Services Nav Consolidation (2026-04-24) — COMPLETE
Branches: `claude/fix-deployment-error-gVa5I` (deploy fix, PR #141 merged) + `claude/consolidate-services-nav-bids` (PR #143)

**Deploy fix (PR #141):** The WIP commit `26e7640` stubbed `/estimating/page.tsx` to import a `./EstimatingHubClient` that was never committed, breaking production builds with `Module not found`. Reverted `/estimating/page.tsx` to render `TakeoffApp` with `?bid=` search param. The new `/estimating/[bidId]` route added in `26e7640` is preserved.

**Bids consolidation (PR #143):** Services dropdown went from 9 items to 6 by collapsing 4 separate bid list entries into a single tabbed `/bids` hub:
- `/bids` — `BidsHubClient.tsx` with 4 tabs, driven by `?tab=` query param (default `open`)
  - **Open** — embeds `LegacyBidsClient` (legacy Incomplete, `/api/legacy-bids`)
  - **Completed** — embeds `CompletedBidsClient` (legacy Complete + turnaround days)
  - **All** — embeds `AllBidsClient` (unified legacy + estimator, `/api/all-bids`)
  - **Projects** — embeds `BidsListClient` (estimator UUID bids with draft→submitted→won/lost/archived workflow buttons, `/api/bids`)
- Each of the 4 list clients gained an `embedded?: boolean` prop: when true, they skip their own `<TopNav>` and outer wrapper so the hub mounts them as tab panels
- Old list pages now redirect:
  - `/legacy-bids/page.tsx` → `/bids?tab=open`
  - `/legacy-bids/completed/page.tsx` → `/bids?tab=completed`
  - `/all-bids/page.tsx` → `/bids?tab=all`
- Detail and add routes (`/legacy-bids/[id]`, `/legacy-bids/add`) are **untouched** — internal links like `href={`/legacy-bids/${bid.id}`}` still work
- Design is now inside Services (not a direct top-level link as the old CLAUDE.md suggested). Services dropdown: Estimating App · PDF Takeoff · Bids · EWP · Projects · Design

#### Nav + Branding Overhaul (2026-04-15) — COMPLETE
Branch: `claude/update-navbar-menu-cgiYe` (merged to `main`)

**Navigation restructure:**
- **Warehouse → Yard**: domain key `warehouse` → `yard`, label "Warehouse" → "Yard", all `/warehouse/*` paths unchanged
- **Estimating → Services**: label "Estimating" → "Services" (covers bids, EWP, designs, takeoff)
- **Service direct link removed**: `/it-issues` moved into user dropdown (see below)
- **Receiving merged into Purchasing**: PO Check-In + Review Queue now appear as items inside the Purchasing dropdown; separate Receiving domain removed
- **User dropdown** added under logged-in username (chevron toggle): Report an Issue (`/it-issues`), Help & Docs (`/help`), Sign Out. Sign Out button moved here from top-level nav.
- **Admin dropdown** reorganized into 4 labeled sections: General, Services, Users, System (see Admin Portal section)

**Branding:**
- App name: **Beisser LiveEdge** (Beisser Lumber Co. + LiveEdge app)
- Logo files committed to `public/icons/` (Beisser B mark, full-color RGB PNG)
- `app/layout.tsx`: title `'Beisser LiveEdge'`, favicon → `/icons/beisser_B_full_color_RGB.png`, themeColor `#006834`
- `public/manifest.webmanifest`: name/short_name updated, `theme_color: "#006834"`, icons updated
- Tailwind: `cyan-*` already remapped to Beisser green (#006834) in `tailwind.config.mjs`; `gold-*` custom palette added (#9e8635)

**Branch switcher:**
- Always visible on all screen sizes — removed `hidden sm:block` wrapper
- Per-branch color dot always shown (no fallback MapPin); `BRANCH_COLORS` constant in `TopNav.tsx`:
  - `''` (All) → violet/lavender
  - `10FD` Fort Dodge → red
  - `20GR` Grimes → cyan (Beisser green)
  - `25BW` Birchwood → gold
  - `40CV` Coralville → slate/black

**Help page** (`/help`):
- `app/help/page.tsx` — server component with `auth()` guard
- Wiki-style `<details>`/`<summary>` accordion sections: Yard, Dispatch, Sales, Services, Purchasing, Admin
- Common workflows with numbered steps; navigation access table; CTA to `/it-issues`

#### Admin Portal Overhaul (2026-04-15) — COMPLETE

**Layout & mobile:**
- `app/admin/AdminLayoutClient.tsx` — full rewrite: sticky mobile header + hamburger → slide-in drawer (`sidebarOpen` state); desktop sidebar `hidden lg:block`; content area `min-w-0 p-4 sm:p-6`
- All admin data tables wrapped in `<div className="overflow-x-auto">` for horizontal scroll on mobile (AuditClient, ProductsClient, CustomersClient, UsersClient)

**Sidebar sections:**
```
General:     Dashboard · Customers · Products/SKUs · Formulas
Services:    Bid Fields
Users:       Users · Notifications
Operations:  Job Review
System:      Audit Log · ERP Sync · Page Analytics
```
- `app/admin/page.tsx` rewritten — sectioned overview cards matching the 4 groups

#### Job Review (2026-04-17) — COMPLETE

Admin-only view for reviewing ERP sales order jobs with GPS match status.

- **List page** (`/admin/jobs`): paginated at 50/page, search (SO#, customer, reference, PO#), customer code filter, branch/status/GPS/sort dropdowns
- **Quick filter chips**: Recently Created · Recently Matched GPS · Missing GPS · Has GPS Match — each sets a preset combination of `gps` + `sort` filters
- **GPS match status**: badge per row — green "GPS" (coordinates on file) / amber "No GPS" (missing from `agility_customers`)
- **Detail page** (`/admin/jobs/[so_id]`): customer card, order details card, GPS coordinates card, Leaflet map pinned to ship-to address (or "no coordinates" state)
- **API**: `GET /api/admin/jobs` (list + count) · `GET /api/admin/jobs/[so_id]` (detail) — both admin-only
- **Data source**: `agility_so_header` JOIN `agility_customers` on `cust_key + shipto_seq_num` for GPS coords (lat/lon)
- **Map component**: `src/components/admin/JobLocationMap.tsx` — single-marker Leaflet map, same pattern as `DispatchMap` without vehicles/routes
- **Future**: write-back to Agility API for tax code + address corrections (detail page already displays these fields)

**Cleanup & security:**
- `/admin/app-users/` directory **deleted** — `AppUsersClient.tsx` was dead code (461 lines); `page.tsx` was a redirect stub. Auth unification consolidated all users under `/admin/users`
- `app/admin/customers/[id]/page.tsx` — added explicit admin role guard (`if (role !== 'admin') redirect('/')`) matching all other admin pages

#### WH-Tracker Migration — COMPLETE (2026-04-02), Extended (2026-04-03)
Full WH-Tracker (Python/Flask) migration into LiveEdge. All modules ported:
- **Warehouse Board** (`/warehouse`): stats cards, picks board, 60s refresh. API: `/api/warehouse/stats`, `/api/warehouse/picks`
- **Open Picks** (`/warehouse/open-picks`): active picks by picker, daily/5-day counts. API: `/api/warehouse/open-picks`
- **Picker Stats** (`/warehouse/picker-stats`): aggregate performance per picker with configurable period. API: `/api/warehouse/picker-stats`
- **Picker Admin** (`/warehouse/pickers`): add/edit/delete pickers (supervisor+ only). API: `/api/warehouse/pickers`, `/api/warehouse/pickers/[id]`
- **Picker Detail** (`/warehouse/pickers/[id]`): recent pick history + stats per picker
- **Work Orders** (`/work-orders`): open WO board, barcode SO search, assignments with Mark Complete. API: `/api/work-orders/open`, `/api/work-orders/search`, `/api/work-orders/assignments`, `/api/work-orders/assignments/[id]`
- **Dispatch Board** (`/dispatch`): delivery stops from ERP, route planning CRUD, Samsara GPS proxy. API: `/api/dispatch/deliveries`, `/api/dispatch/routes`, `/api/dispatch/routes/[id]/stops`, `/api/dispatch/vehicles`
- **Driver Availability** (`/dispatch/drivers`): toggle driver availability for routing. Uses dedicated `POST /api/dispatch/drivers/toggle` endpoint (PR #339, 2026-05-19) — split out from the generic upsert to avoid an `ON CONFLICT` constraint mismatch on `driver_availability`.
- **Delivery Tracker** (`/delivery`): today + overdue K/P/S statuses, status label logic, fleet GPS panel. API: `/api/delivery/tracker`
- **Fleet Map** (`/delivery/map`): live vehicle cards with GPS, speed, address. API: `/api/delivery/locations` (proxies dispatch/vehicles)
- **Sales Hub** (`/sales`): KPI dashboard + order status table. API: `/api/sales/metrics`, `/api/sales/orders`
- **Sales Transactions** (`/sales/transactions`): full-screen order search workspace — all statuses, date range, sale type
- **Purchase History** (`/sales/history`): invoiced/closed order lookup with customer filter. API: `/api/sales/history`
- **Products & Stock** (`/sales/products`): product major/minor tile browse + FTS item search. Tiles from `agility_items` (product hierarchy); stock data from `agility_item_branch` (JOIN on item_code). Branch scoped via nav cookie. API: `/api/sales/products`, `/api/sales/products/groups`, `/api/sales/products/majors`
- **Sales Reports** (`/sales/reports`): daily orders chart, top customers, by sale type/ship via, status breakdown. API: `/api/sales/reports`
- **Customer Profile** (`/sales/customers/[code]`): open orders, history, ship-to addresses in tabs. API: `/api/sales/customers/[code]`
- **Supervisor Dashboard** (`/supervisor`): picker status board (active/assigned/idle), 30s refresh. API: `/api/supervisor/pickers`
- **Ops Delivery Reporting** (`/ops/delivery-reporting`): ERP analytics, bar chart by date, CSV export. API: `/api/ops/delivery-reporting`
- **PO Check-In** (`/purchasing`): multi-step receiving workflow with photo upload
- **Open POs** (`/purchasing/open-pos`): open PO list with overdue highlighting; links to detail
- **PO Detail** (`/purchasing/pos/[po]`): PO header, line items with received qty, check-in shortcut
- **Review Queue** (`/purchasing/review`): submission list with status/branch/date filters
- **Review Detail** (`/purchasing/review/[id]`): photo viewer, reviewer notes, mark reviewed/flagged
- **Auth**: OTP-based via `otp_codes` + `app_users` tables, `roles[]` array + `branch` in JWT

#### Sales Sub-Pages (2026-04-02) — COMPLETE
- **Customer Search** (`/sales/customers`): search `erp_mirror_cust`, link to profile. API: `/api/sales/customers`
- **Customer Profile** (`/sales/customers/[code]`): details, 90-day orders, ship-to addresses. API: `/api/sales/customers/[code]`
- **Customer Notes** (`/sales/customers/[code]` Notes tab): read/write from `public.customer_notes` table via `getErpSql()`. API: `/api/sales/customers/[code]/notes`
- **Products & Stock** (`/sales/products`): product major/minor tile browse + FTS search. See WH-Tracker migration section for full detail.
- **Purchase History** (`/sales/history`): orders with expanded filters (status, date range, branch). Reuses `/api/sales/orders`
- **Sales Reports** (`/sales/reports`): KPI cards + status breakdown + top customers. Reuses `/api/sales/metrics`

#### Purchasing Sub-Pages (2026-04-02) — COMPLETE
- **Open POs** (`/purchasing/open-pos`): open PO list with overdue highlight. API: `/api/purchasing/pos/open` (uses `app_po_search` view)
- **Buyer Workspace** (`/purchasing/workspace`): quick-action cards + upcoming POs + recent check-ins. **Rebuilt 2026-05-26 as a six-tile dashboard backed by the replenishment engine — see "Buyer Workspace & Replenishment Engine (2026-05-22 → 2026-05-26)" section below for the current shape.**
- **Command Center** (`/purchasing/manage`): KPI cards, POs by branch, overdue list, recent submissions

#### RMA Credits (2026-04-02, rewritten 2026-04-22, extended 2026-05-01) — LIVE (ERP-driven, email pipeline active)

**Credits page** (`/credits`):
- `GET /api/credits` — queries `agility_so_header` WHERE `sale_type = 'Credit'` AND `so_status NOT IN ('I','C')` AND `is_deleted = false`
- Branch-scoped: non-admins see only their branch (`system_id`); admins see all or can filter by branch param
- Paginated at 25/page; search across SO#, customer name/code, reference, PO#
- LEFT JOINs `public.credit_images` on `ci.rma_number = soh.so_id::text` for doc count per CM
- **Customer name fallback**: uses `COALESCE(NULLIF(TRIM(soh.cust_name), ''), ac.cust_name)` with a `LEFT JOIN LATERAL` to `agility_customers` — some CM records have blank `cust_name` on the SO header even though the customer exists; `ac.cust_name` must be in GROUP BY
- Columns: CM #, Customer, Reference/PO, Location, Status, Branch, Docs, Created
- **All 8 columns sortable** — click header to sort desc, click again for asc; active column shows cyan arrow; sort state persists across pagination; API accepts `sort` + `dir` params; `SORT_SQL` whitelist in `route.ts` prevents injection
- Status badge: `B` (blank) = Open (cyan), `S` = Staged (yellow), others = gray
- Shared types in `app/api/credits/_shared.ts`: `CreditMemo`, `ALLOWED_SORTS`, `SortCol` — import from there; do NOT export from `route.ts` (Next.js 15 forbids non-handler exports from route files). Use two separate import lines to avoid TypeScript type-erasure: `import { ALLOWED_SORTS } from './_shared'; import type { CreditMemo, SortCol } from './_shared'`
- Performance indexes: `db/migrations/0014_credits_performance_indexes.sql` — apply in Supabase SQL editor (no `CONCURRENTLY`; Supabase wraps statements in a transaction)

**Key ERP facts for `agility_so_header` credits:**
- `sale_type = 'Credit'` — NOT `'CM'`; credit memos use the full word
- `so_status = 'B'` = open/blank (no status set). Exclude `'I'` (invoiced) and `'C'` (cancelled)
- Date column is `created_date` — NOT `order_date` (does not exist)
- `is_deleted` column DOES exist on this table
- `@/` path alias maps to `src/` — import types from API routes using relative paths (e.g. `../api/credits/_shared`)

**Inbound email webhook** (`POST /api/inbound/credits`):
- Receives Resend `email.received` events for `credits@beisser.cloud` and `*@rma.beisser.cloud` (both accepted)
- TO address guard: skips events not addressed to either address
- **Attachment capture**: fetches bytes via `GET /emails/receiving/{emailId}/attachments/{id}` → `download_url` (Resend no longer sends `content` inline)
- **Inline skip logic**: only skips parts with BOTH `content_id` AND `content_disposition: inline` AND `size < 20000` — Outlook sets `content_id` on real forwarded attachments so the old `if (content_id) skip` was too aggressive
- **Nested email support**: `message/rfc822` attachments (forwarded `.eml` files) are parsed by `extractPartsFromRawEmail()` — zero-dependency recursive MIME walker that handles `multipart/*` boundaries, base64/binary encoding, skips parts < 5 KB
- **Address-based RMA matching**: when subject has no CM#, extracts a street address fragment via regex and queries `agility_so_header.shipto_address_1 ILIKE '%fragment%'` against open Credit CMs; narrows by Iowa city name when multiple match; falls back to `UNKNOWN` only if ambiguous
- Uploads to R2 at `credits/{rmaNumber}/{timestamp}-{filename}`; upserts `public.credit_images` row with `r2_key`
- Resend attachment fields are snake_case: `content_type`, `content_disposition`, `content_id` (NOT camelCase)
- Env var: `RESEND_WEBHOOK_SECRET` (Svix signature secret from Resend dashboard)
- Webhook URL must be set to `https://app.beisser.cloud/api/inbound/credits` (not the Vercel preview URL — Resend does not follow redirects)

**Hubbell email ingest — REMOVED (2026-05-13). Daily portal scrape + LiveEdge upload — LIVE (2026-05-18).** Email ingest (Resend webhook, Graph dispatch, reprocess cron) was killed in May 2026; the rewrite is now complete. See **Hubbell PO/WO Daily Ingest** below for the live architecture. The legacy `bids.hubbell_emails` / `hubbell_email_candidates` / `hubbell_address_cache` tables were dropped in migration `0021_hubbell_documents.sql` (no email-era data retained — the schema-clarity gain outweighed losing the address-cache learning).

#### Nav Restructuring (2026-04-02) — COMPLETE, EXTENDED 2026-04-03
- TopNav completely rewritten 2026-04-03 — 8 domain dropdowns replacing flat links + 4 domain dropdowns
- Single `openMenu: string | null` state + single `<nav>` ref for click-outside (replaced per-domain refs)
- **Dispatch ▾**: Picks Board, Open Picks, Picker Stats, Work Orders, Supervisor, Dispatch Board, Delivery Tracker, Fleet Map
- **Sales ▾**: Sales Hub, Customers, Transactions, Purchase History, Products & Stock, Reports, RMA Credits
- **Estimating ▾**: Estimating App (`/estimating`), PDF Takeoff, Bids, EWP, Projects
- **Design** (direct link → `/designs`)
- **Service** (direct link → `/it-issues`)
- **Purchasing ▾**: Buyer Workspace, Open POs, Command Center *(historical snapshot — see "## Navigation Structure" near the bottom of this file for the current dropdown contents, which now include Suggested Buys, Potential Outages, Recent Movement, and Exceptions)*
- **Receiving ▾**: PO Check-In, Review Queue
- **Admin ▾** (admin role only): all admin pages + delivery report + picker admin

#### Personalized Homepage (2026-04-03) — COMPLETE
- `/` is now the personalized dashboard (`HomeClient.tsx`); old TakeoffApp moved to `/estimating`
- `/dashboard` redirects to `/`
- Sections: greeting + date + branch, 5 KPI tiles, Quick Access strip (top pages), 8 module cards, recent activity
- `GET /api/home` — aggregates open bids/designs (bids schema) + open picks/WOs/orders (ERP) + top pages
- Page visit tracking: `POST /api/track-visit` upserts `bids.page_visits (user_id, path, visit_count)`
- **`db/migrations/0004_page_visits.sql` must be applied manually in Supabase SQL editor**

#### Sales Order Detail (2026-04-03) — COMPLETE
- `GET /api/sales/orders/[so_number]` — header (joins `erp_mirror_cust`) + line items (joins `erp_mirror_item`)
- `/sales/orders/[so_number]` — `OrderDetailClient.tsx`: header card, line items table, estimated total
- SO numbers in SalesClient orders table now link here; customer names link to `/sales/customers/[code]`

#### Auth Unification (2026-04-15) — COMPLETE
Branch: `claude/auth-unification-FelEf` (merged to `main`)

**Fully passwordless.** Single `/login` for all users — username → emailed 6-digit code → signed in. No passwords on the web side. Sessions last 7 days.

- **`auth.ts`**: single OTP credentials provider — accepts `identifier` (username or email), resolves to `app_users` email, verifies `otp_codes` table. No password branch.
- **`app/login/page.tsx`**: 2-step UI (username → OTP code entry). No password field, no `/ops-login` link.
- **`app/ops-login/page.tsx`**: redirects to `/login`
- **`app/api/auth/send-otp/route.ts`**: accepts `identifier` (username OR email), looks up actual email in `app_users`, generates 6-digit OTP, stores in `otp_codes`, emails via Resend (`RESEND_API_KEY` required in prod). Set `AUTH_OTP_CONSOLE=true` to print codes to server console in dev. Rate-limited to 3 codes per 15 min per email.
- **Admin users** (`app/api/admin/users/`, `app/admin/users/UsersClient.tsx`): queries `public.app_users` via `getErpSql()` — single source of truth for user management
- **51 server components**: `redirect('/ops-login')` → `redirect('/login')`
- **`db/migrate-users-to-app-users.ts`**: reference only — documents the SQL backfill that was run directly

**DB steps applied in Supabase (2026-04-15)**:
1. `public.app_users` already had `username` + `password_hash` columns (added by prior migration) with 70 rows populated from WH-Tracker
2. Hashed all plaintext passwords in `bids."user"` via `UPDATE bids."user" SET password = crypt(password, gen_salt('bf', 12)) WHERE password NOT LIKE '$2%'`
3. Backfilled `password_hash` in `app_users` via `UPDATE public.app_users SET password_hash = u.password FROM bids."user" u WHERE estimating_user_id = u.id` (69/70 — `po-test` is OTP-only, no estimating user)
4. `password_hash` column is now inert — auth no longer reads it

#### Hubbell PO/WO Daily Ingest (2026-05-18 → 2026-05-19) — LIVE

Daily PO/WO scrape from Hubbell's `hub.ihmsweb.com` portal → LiveEdge inbox → reviewer matches docs to Agility SOs → optional Agility writeback. Replaces the unreliable email-ingest pipeline that was removed 2026-05-13.

**Architecture:**
```
Pi (agility-api, /home/api/hubbell, systemd 06:00 daily)
  hubbell_daily_fetch.py  →  PDF parse  →  uploader.py
                                              │
                                              ▼ POST multipart, Bearer auth
LiveEdge: POST /api/admin/hubbell/upload  →  R2 (PDF)
                                          →  bids.hubbell_documents (insert)
                                          →  matcher (3 signals)
                                          →  bids.hubbell_document_sos (junction)
                                          →  auto-link orphan payments by doc#
```

Monthly reconciliation (payment matching, AR cross-check) stays on the PC at `C:\Users\amcgrean\python\hubbell test\`.

**Tables (apply migrations 0021/0022/0023/0024/0025 in Supabase SQL editor):**
- `bids.hubbell_documents` — one row per PO/WO PDF. `source_hash` (sha256 of bytes) for idempotent re-upload. Columns include `doc_type / doc_number / r2_key`, extracted `address/city/state/zip/total/need_by/line_items`, scrape hints (`scrape_cust_code / scrape_seq_num / scrape_match_ratio`, migration 0022), job context (`dev_code / dev_name / house_number / block_lot / model_elevation`, migration 0023), payment rollups (`paid_amount_total / last_payment_date / last_check_number / payment_status`, migration 0024), `match_status` ('unmatched'|'auto_matched'|'confirmed'|'rejected').
- `bids.hubbell_document_sos` — junction (one document × one Agility SO). `match_source` ('po_number_split'|'address'|'address_scrape'|'manual'), `confidence`, `match_reasons`, `confirmed_by`, `posted_to_agility_at` (set when the writeback succeeds).
- `bids.hubbell_document_payments` — one row per `(doc_type, doc_number, check_number)`. Payments can land before docs and get linked when the matching doc arrives via the `/upload` route's auto-link.
- `bids.hubbell_normalize_address(text)` — IMMUTABLE SQL helper (migration 0025). Lowercases, expands street-type abbreviations (ave→avenue, st→street, dr→drive, etc.), strips non-alphanumerics. Use it everywhere an SO's `shipto_address_1` is compared to a doc's `extracted_address`. `1000 Featherstone Ave NE` matches `1000 Featherstone Avenue NE`.

**Many-to-many:** one Hubbell doc → N Agility SOs; one Agility SO → N Hubbell docs. Sales types Hubbell PO/WO numbers into Agility's customer-PO field by hand, **comma-separated** when multiple apply. `parsePoNumberField()` splits on `[,;|/\s]+`.

**Matcher (`src/lib/hubbell/document-matcher.ts`):**
All three signals are scoped to `cust_code LIKE 'HUBB%'` to keep non-Hubbell SOs out of candidates.
1. **Signal A — `po_number_split`** (confidence 100, auto-attach, exclusive return when hit): split open SOs' `po_number`, look for the Hubbell doc number. Authoritative — buyer typed it in.
2. **Signal A' — `address_scrape`** (confidence = scrape_match_ratio × 100): local agent's `best_job_match` already resolved the PDF address to a `(cust_code, shipto_seq_num)` pre-upload. When that hint resolves to an open SO at the exact ERP shipto, return as candidate (not auto-attach — a single shipto can host concurrent SOs).
3. **Signal B — `address`** (server-side fuzzy, confidence 0-100): zip+city+street tokenized scoring. Signals A' and B union by `so_id` keeping highest confidence — so HUBB1200 main + HUBB1700 trim at the same physical address both surface.

The matcher runs at ingest time AND on document-detail page open. Doc-page candidate table columns: SO# / Customer / Reference / Cust PO / Address / Expect / Order $ (UOM-aware `SUM(extended_price)`, system_id scoped) / Status / Attach. **No Reasons column** — confused the UX since the candidates table reads as a related-orders list.

**Jobs page (`/admin/hubbell/jobs`):**
- One row per physical jobsite, keyed `(shipto_address_1, shipto_city, shipto_state, shipto_zip)`.
- Restricted to `cust_code IN ('HUBB1200','HUBB1700')` — the operational pair. HUBB1000/HUBB1400/legacy excluded.
- HUBB1200 main and HUBB1700 trim at the same physical address collapse to one row; customer cell shows both codes (`STRING_AGG(DISTINCT cust_code)`) and names slash-joined.
- Columns: Customer · Address · SOs · Open $ · Docs · Hubbell $.
- Sourced from `agility_so_header` directly — a jobsite appears whether or not it has docs attached yet.
- Docs map to jobsites by **normalized address** (`bids.hubbell_normalize_address`), NOT via the SO junction — docs land on their job as soon as the address matches, regardless of attach status.

**Pages:**
- `/admin/hubbell` — `DocumentsClient.tsx`. Tabbed inbox (Unmatched/Auto-matched/Confirmed/Rejected/All), search, type filter. Columns include payment status badge (paid/partial $X/unpaid).
- `/admin/hubbell/[id]` — `DocumentDetailClient.tsx`. View-PDF button, extracted address with local-agent match chip, **Job context card** (dev_code, house_number, block_lot, model_elevation), Totals + payment block, line items, attached SOs, candidate SOs, manual attach by SO#, Reject.
- `/admin/hubbell/jobs/[soId]` — `JobDetailClient.tsx`. **Jobsite-anchored** (the `soId` is just a lookup key; everything keys on `(shipto_address_1 normalized, city, state, zip)`). Sections: jobsite header with rollups, SOs at this address (expandable to attached docs), docs at this address (expandable per-doc to show line items + dev/house/block-lot/model). Inline attach/detach with slide-out PDF preview panel (`src/components/hubbell/PdfPreviewPanel.tsx`).
- `/admin/hubbell/status` — last_document_at, 24h counts, status totals.

**API routes:**
- `POST /api/admin/hubbell/upload` — service-token Bearer auth (`HUBBELL_UPLOAD_TOKEN`). Idempotent via sha256. Auto-links orphan payments matching this doc's `(doc_type, doc_number)`. Normalizes `line_items` via `src/lib/hubbell/metadata-normalize.ts` (accepts aliases like `description/unit/ext_price` and maps to canonical `desc/uom/ext`).
- `GET /api/admin/hubbell/documents` / `[id]` — list + detail (matcher re-runs live).
- `POST /api/admin/hubbell/documents/[id]/attach` — junction insert; optional Agility writeback (see Phase 2 below).
- `POST /api/admin/hubbell/documents/[id]/detach` / `/reject` / `GET .../pdf`.
- `GET /api/admin/hubbell/job?so_id=N` — jobsite bundle (replaces older `/jobs/[soId]`): returns `{jobsite, sales_orders, documents}` keyed on normalized address+city+state+zip5.
- `GET /api/admin/hubbell/jobs` — paginated jobs list.
- `POST /api/admin/hubbell/documents/metadata-bulk` — service-token. **Backfill endpoint.** Body `{items: [{doc_type, doc_number, metadata}, ...]}` (up to 500/req). Looks up each doc by `(doc_type, doc_number)`, partial-updates only fields present in metadata, normalizes `line_items`, recomputes `payment_status` rollup when `total` changes. Use for re-running improved extractors against existing docs without re-uploading PDFs.
- `GET /api/admin/hubbell/documents/needs-extraction` — service-token. Lists docs with empty `line_items` and returns 1-hour R2 presigned URLs so a backfill agent can pull PDFs without re-auth. `?limit=200&offset=0&type=po|wo`.
- `POST /api/admin/hubbell/documents/rematch` — service-token. Re-runs the SO matcher on a batch of docs (default: `match_status='unmatched'`) and auto-attaches new `po_number_split` matches. Use after a metadata backfill that may have improved `extracted_address` for previously-unmatched docs. Body: `{limit?, offset?, only_unmatched?, doc_ids?[]}`. Idempotent (skips junction rows already present).
- `POST /api/admin/hubbell/documents/suggest-matches` — service-token (migration `0027_hubbell_document_suggestions.sql`). Walks unmatched docs in batches, runs `matchDocumentToSos()`, and persists every candidate into `bids.hubbell_document_suggestions` (a review queue, NOT a direct attach). Body: `{limit?, offset?, only_unmatched?, min_confidence?, doc_ids?[]}`. Default limit 200 (max 500), default `min_confidence=30`, default `only_unmatched=true`. Returns `{run_id, processed, candidates_inserted, candidates_skipped_existing}`. Idempotent — `(document_id, so_id)` UNIQUE preserves prior accept/reject decisions across re-runs. Use this (instead of `/rematch`) when the buyer-side `po_number` field is empty so `po_number_split` won't fire — surfaces address-based candidates for human review.
- `GET /api/admin/hubbell/suggestions` — user-session (`hubbell.review`). Returns pending/accepted/rejected suggestions joined with doc + SO details. Query: `?status=pending|accepted|rejected|all&min_confidence=30&limit=50&offset=0&doc_type=po|wo`. Powers the `/admin/hubbell/suggestions` review page.
- `POST /api/admin/hubbell/suggestions/[id]/review` — user-session (`hubbell.review`). Body `{action: 'accept'|'reject'}`. On accept, atomically inserts a `hubbell_document_sos` row (skipping if the pair already exists), marks the suggestion `'accepted'`, and bumps the doc's `match_status` from `unmatched|auto_matched` to `confirmed`. On reject, marks the suggestion `'rejected'` (the `(doc, so)` pair won't be re-suggested by future runs of the suggester). Refuses to flip already-terminal suggestions (409) so the audit trail is clean.
- `POST /api/admin/hubbell/documents/ai-review` — user-session (`hubbell.review`) OR Bearer `HUBBELL_UPLOAD_TOKEN`. Batches pending suggestions by doc, fetches each PDF from R2, sends to Claude Opus 4.7 with the candidate SOs, parses per-candidate `{action: accept|reject|skip, confidence}` decisions, and writes them via the same junction-table semantics as the human-review endpoint (`matchSource` prefixed `ai_` and `confirmedBy='ai_review:<user>'` so AI-attached rows are distinguishable). Low-confidence accepts auto-degrade to skip (leaves pending for human follow-up). Body: `{limit?: 5, doc_ids?: string[]}` (default 5, max 20 — capped by 300s `maxDuration`). System prompt uses `cache_control: ephemeral` to cut per-call cost ~80% on subsequent runs. Requires `ANTHROPIC_API_KEY` env var; uses structured outputs via `output_config.format` so decisions are guaranteed-parseable JSON. Powers the "AI review" button on `/admin/hubbell/suggestions`.
- **Local review CLI** at `scripts/hubbell-review/` (TypeScript, runs via `tsx`). For agents that run on the user's machine (Codex, Claude Code) under existing subscriptions — no Anthropic API tokens consumed. `npx tsx scripts/hubbell-review pull --limit 10 --dir ./hubbell-queue` pulls a batch of pending suggestions, downloads each PDF, and writes `packets/<doc_id>/{doc.pdf, packet.json, decisions.json}` to disk. The agent reads each packet (looking at `doc.pdf` and the candidate SOs in `packet.json`), fills in `decisions.json`, then `npx tsx scripts/hubbell-review apply --reviewer codex` POSTs each decision back via `/api/admin/hubbell/suggestions/[id]/review` (Bearer + `X-Reviewer` header sets `reviewed_by`). Processed packets move to `applied/`. Re-pulls of the same doc (when prior batch all-rejected and a re-run surfaces new candidates) land at `<uuid>__pass2/`. Requires `LIVEEDGE_HUBBELL_TOKEN` env var; full agent prompt in `scripts/hubbell-review/README.md`. **The PDF route (`/api/admin/hubbell/documents/[id]/pdf`), suggestions list, and review endpoint all accept the same Bearer token in addition to user session** to support this CLI.

- **Address-fuzzy floor (Codex run, 2026-05-26)**: ~6,800 historical Hubbell PO/WO docs were uploaded before any matcher pass and had no SO links. Codex ran the suggester (2 passes, ~1,500 candidates inserted total) and reviewed 175 docs across 8 batches via the CLI. Final: **8 accepts, 510 rejects, ~1.5% accept rate.** Two zero-accept batches in a row signaled the floor. False-positive pattern was consistent across all batches: address-fuzzy clusters every SO at a development/neighborhood, but most are wrong street number or wrong scope (framing PO vs trim WO vs hardware WO at the same lot). The conservative reject rule — **accept only when address matches AND at least one corroborating signal (SO reference, dev_code+house_number, or scope/phase)** — held the false-positive rate at ~0. The 8 accepts all had a matching SO reference (e.g. "Doors #9717", "SP Windows") on top of the address. **Don't re-run this exercise** — the remaining ~6,800 unmatched docs need different signals: (a) Phase 3c daily check ingest going forward so buyers can type Hubbell doc numbers into Agility's customer-PO field, or (b) full PDF vision against the actual document content (not just extracted address). Address-fuzzy alone has exhausted what it can find.
- `POST /api/admin/hubbell/payments/import` — service-token. Bulk-imports payments per `(doc_type, doc_number, check_number)`. Empty `payments:[]` body triggers rollup refresh only (sets `payment_status='unpaid'` on docs with `extracted_total>0` and no payment rows).
- `GET /api/admin/hubbell/status` — health dashboard.
- `GET /api/cron/hubbell-stale-check` — daily 14:00 UTC.

**Canonical `line_items` JSON shape** (per row, stored on `bids.hubbell_documents.line_items`):
```jsonc
{ "sku": "...", "desc": "...", "qty": 1, "uom": "EA", "unit_price": 12.50, "ext": 12.50 }
```
`normalizeLineItems()` in `src/lib/hubbell/metadata-normalize.ts` accepts aliases `description/unit/u_m/ext_price/extension/amount/price/product_code/code/quantity` and maps them to canonical. The UI in `JobDetailClient.tsx` reads canonical only.

**Local scraper:**
- Pi: `/home/api/hubbell/` (systemd `hubbell-daily.timer` at 06:00 EDT). `hubbell_daily_fetch.py` + `uploader.py` + Playwright + Chromium ARM64.
- PC: `C:\Users\amcgrean\python\hubbell test\` — monthly recon (AgilitySQL ODBC, stays here), historical PDF backfill via `backfill_local_pdfs.py` (extracts job context + scrape hints), payments push via `monthly_recon_*.py`.
- Tooling on PC at `C:\Users\amcgrean\python\api\scripts\`: `hubbell_pi_*.py` (deploy, smoke test, status, redeploy, log tail, backfill, payment rollup refresh).

**ECI auth — credential auto-login (2026-05-20):** `hubbell_checks_to_pdfs_po_and_wo.py` (deployed at `/home/api/hubbell/`) supports unattended re-auth. Three-tier flow in `open_authenticated_context()`: (1) try saved `eci_auth_state.json`, (2) if expired → `_try_credential_login()` reads `ECI_USERNAME` / `ECI_PASSWORD` from env and submits the login form (probes common selectors — `input[name="username"|"userid"|"user"]` / `input[type="password"]` / `button[type="submit"]`, first hit wins), (3) if creds missing or auto-login fails → `SystemExit` with a clear error (replaces the misleading `EOFError` from the old `input("Press ENTER...")` fallback under systemd). After successful auto-login the fresh session is saved back so subsequent runs reuse it. **Required on Pi `.env` and PC `.env`: `ECI_USERNAME`, `ECI_PASSWORD`.** Any deploy automation (`hubbell_pi_deploy.py`) must merge — not overwrite — `.env` so these aren't clobbered, and must keep `hubbell_checks_to_pdfs_po_and_wo.py` in sync with the PC source-of-truth copy. If ECI ever refreshes their login form, append new selectors to `user_selectors` / `pw_selectors` in `_try_credential_login()`. Sanity check on stale-cron alerts: "ECI auto-login failed → check `ECI_USERNAME`/`ECI_PASSWORD` in `/home/api/hubbell/.env`" (the old "session expired" case should no longer occur).

**Env vars (Vercel):**
- `HUBBELL_UPLOAD_TOKEN` — bearer for upload + payments-import endpoints. Mirrors `LIVEEDGE_HUBBELL_TOKEN` on PC + Pi `.env`.
- `AGILITY_API_URL` — DMSi production base URL.
- `AGILITY_API_TEST_URL` — DMSi non-prod URL (used by writeback when mode=test).
- `HUBBELL_AGILITY_WRITEBACK_MODE` — `disabled` | `test` | `prod`. Default `disabled`. Gates the `Orders/SalesOrderHeaderUpdate` call on each attach.

**Phase 2 — Agility write-back (code LIVE, flag-gated, NOT YET VALIDATED in test):**
- `agilityApi.salesOrderHeaderUpdate(orderId, customerPo, { useTest })` in `src/lib/agility-api.ts` — minimal payload (only OrderID + CustomerPurchaseOrder, line-item arrays omitted).
- Attach route reads current `agility_so_header.po_number`, parses via `parsePoNumberField()`, only writes when the Hubbell doc# isn't already a token. **Refuses to write if the mirror lookup fails** (`headerLookupOk` guard) so a stale/missing mirror can never clobber a real customer-PO value.
- `posted_to_agility_at` is set when ReturnCode == 0; NULL on failure so re-attach re-attempts.
- **Per DMSi docs, blank/null character fields MAY be cleared depending on the method's internal business rules. The minimal-payload approach assumes omitted fields are no-change — REQUIRES validation in test against AGILITY_API_TEST_URL before flipping to prod.** Test procedure at `docs/agent-prompts/hubbell-agility-writeback-test.md`. If test wipes other fields, fall back to read-modify-write (read current header values, echo all back plus the new CustomerPurchaseOrder).

**Backfill state (as of 2026-05-20):**
- 6,714 total docs in `bids.hubbell_documents`.
- **6,020 (89.7%) have non-empty `line_items`** — after the hubbell-test agent rewrote `parse_line_items()` in `hubbell_daily_fetch.py` to use pdfplumber + per-doc-type parsers (PO uses `Product Code | Description | U/M | Quantity | Price | Extension` table; WO uses the cost-code / option-code layout). First-pass backfill via `/metadata-bulk` covered the 4,652 docs with local PDFs on PC.
- **6,040 (90.0%) have house_number / block_lot / model_elevation** populated from the same rewrite.
- **6,713 (99.99%) have dev_code.**
- The remaining ~700-doc gap is Pi-only docs (PDF in R2, not on PC). Closed via `/needs-extraction` + new R2-driven backfill in `backfill_from_r2.py`.
- `parseDateOrNull` returns `YYYY-MM-DD` string (not `Date`) so Drizzle's pg `date` column accepts it — fixes silent failures on `extracted_need_by`.
- ~4,879 payment rows imported from the agent's recon workbook; auto-link in upload route (PR #333) closes the loop as PDFs land.
- Forward-going: every Pi daily run + every monthly-recon payment push are now self-healing.

**Hubbell-test agent handoff:** [`C:\Users\amcgrean\python\hubbell test\LIVEEDGE_BACKFILL_REQUEST_2026-05-19.md`](file:///C:/Users/amcgrean/python/hubbell%20test/LIVEEDGE_BACKFILL_REQUEST_2026-05-19.md) — complete brief for the PC-side agent covering PDF backfill, payment data push, and the eventual read endpoint for monthly recon consumption.

**Phase 3 — Daily check ingest (Phase 3a/b/d LIVE 2026-05-21):** Original brief at `docs/agent-prompts/hubbell-daily-check-ingest-2026-05-20.md`, resolved decisions in `docs/agent-prompts/hubbell-daily-check-ingest-addendum-2026-05-20.md`. Migration 0026 applied; new tables + write + read endpoints live. Phase 3a/b shipped:

1. **Migration `0026_hubbell_checks.sql`** — creates `bids.hubbell_checks` + `bids.hubbell_check_lines`, backfills both from the existing `hubbell_document_payments` (one check row per distinct check_number, one line row per payment, `memo`/`gross_amount`/`invoice_date` NULL until a future re-scrape populates them), refreshes `hubbell_documents` rollups, then DROPs `hubbell_document_payments`. Includes a `DO $$ … RAISE EXCEPTION` sanity check that fails the migration if backfill row count drifts from source. Backfilled checks get a synthetic `source_hash` (`'backfill:' || sha256(check_number)`) that the next canonical re-POST naturally supersedes.
2. **Schema** (`db/schema.ts`): `hubbellChecks` + `hubbellCheckLines` added; `hubbellDocumentPayments` removed. Key shape:
   - `bids.hubbell_checks` — `check_number` UNIQUE (HUBB1000/1200/1400/1700 are Beisser-side AR accounts for work type, NOT separate Hubbell payer entities — all checks come from one vendor stream via `vendornumber=000658`, sequential numbering confirms one issuance stream), `source_hash` UNIQUE for idempotent re-POST. **No `payer_entity` column.**
   - `bids.hubbell_check_lines` — FK `check_id` → `hubbell_checks(id) ON DELETE CASCADE`. `doc_type` (`'po'`|`'wo'`|`'inv'`), `doc_number`, `invoice_date`, `payment_amount` (numeric, can be negative for credits), `gross_amount`, `memo`, `line_seq`. Index `(doc_type, doc_number)` for joining to `hubbell_documents`.
3. **`POST /api/admin/hubbell/checks/upload`** — Bearer `HUBBELL_UPLOAD_TOKEN`. Body `{check_number, source_run_id, check_date, lines:[...]}`. Canonical `source_hash` via `src/lib/hubbell/check-hash.ts` (sort lines by `(doc_type, doc_number, line_seq)`, convert all $ to integer cents, fixed key order in `JSON.stringify`, then sha256 — immune to float drift + JSON key-ordering non-determinism). Wipe-and-replace inside a transaction when `source_hash` differs. Response: `{status: 'inserted' | 'unchanged' | 'replaced', id, lineCount}`. After insert/replace, refreshes `hubbell_documents` rollups for every `(doc_type, doc_number)` the check touched (po/wo only; `inv` lines reference `agility_so_header` directly).
4. **`POST /api/admin/hubbell/payments/import`** — rewritten as a backward-compat wrapper. Same flat input shape the PC monthly recon agent already posts, but server-side it groups by `check_number` and upserts each via the same wipe-and-replace tx as `/checks/upload`. Empty `payments: []` still triggers a rollup-refresh sweep (flips docs with no payment lines from NULL → `'unpaid'`). Returns `{status, inserted, replaced, unchanged, rejected}`.
5. **Rollup helpers** (`src/lib/hubbell/payment-rollup.ts`): `refreshPaymentRollupForDoc(db, docId)` (single doc), `refreshPaymentRollupForDocs(db, [{docType, docNumber}…])` (bulk, parameterized via `dsql.join`), `refreshPaymentRollupAll(db)` (sweep). All read from `hubbell_check_lines` + `hubbell_checks`. The orphan-link block in `/api/admin/hubbell/upload` is gone — check lines can land before docs and are picked up automatically by `(doc_type, doc_number)` join on rollup recompute. `/api/admin/hubbell/documents/metadata-bulk` also uses the new helper.

**Read endpoints (Phase 3d, LIVE 2026-05-21):**
- `GET /api/hubbell/docs?since=YYYY-MM-DD&cursor=<opaque>&limit=200` — Bearer-protected (reuses `HUBBELL_UPLOAD_TOKEN`). Returns `{docs[], next_cursor, count}` where each doc carries `attached_so_ids` (array of so_id from `hubbell_document_sos`), payment rollup fields, scrape hints, dev_code, match_status. Cursor encodes `(updated_at, id)`. `since` filters on `hubbell_documents.updated_at` (every rollup recompute bumps it — that's the "has this changed" signal).
- `GET /api/hubbell/checks?since=YYYY-MM-DD&cursor=<opaque>&limit=200` — Bearer-protected. Returns `{checks[], next_cursor, count}` with lines nested under each check. **Two-path SO resolver** per line: po/wo lines join `hubbell_documents → hubbell_document_sos` (`resolution_path: 'document'`); inv lines resolve `doc_number::int` against `agility_so_header.so_id` (`resolution_path: 'ar_invoice'`); unmatched lines get `resolution_path: 'unmatched'` and empty `attached_so_ids`. Consumer (PC `hubbell_reconciliation_v1.py --mode liveedge`) never branches on `doc_type`.
- Cursor helpers in `src/lib/hubbell/cursor.ts` (base64url-wrapped JSON; tests in `cursor.test.ts`).
- `limit` defaults to 200, max 1000.

**Still pending (Phase 3c, 3e):**

6. **Pi-side scraper (Phase 3c)** — new `hubbell_daily_checks.py` invoked from the same systemd service after the PO/WO scrape. Hits `https://hub.ihmsweb.com/cgi-bin/ihmsweb.exe?pgm=marwbvo`, reuses `parse_checks_from_marwbvo()` + per-check detail parser from `hubbell_checks_to_pdfs_po_and_wo.py` / `export_portal_invoice_table_v8_full.py`. Default `--max_checks 6` (≈1 month); `--max_checks 0` for one-time historical backfill that populates `memo`/`gross_amount`/`invoice_date` on the existing backfilled rows. Shares ECI session + dev-list cache with the PO/WO scrape.
7. **Schema-move sequencing (Phase 3e)**: `bids → hubbell` rename **deferred until after PC scripts retire**. Otherwise we do the Drizzle codebase rewrite twice. Compatibility view trick doesn't help Drizzle (targets a specific schema at codegen). Plan: `ALTER SCHEMA` + Drizzle codegen update in one focused PR with no external consumers left.

**Schema hygiene note for new Hubbell work:** Hubbell ingest is logically its own domain (no relation to bids/takeoffs beyond sharing Supabase). All new Hubbell tables should be designed for an eventual `ALTER TABLE bids.hubbell_* SET SCHEMA hubbell` cutover — no FKs into bids' actual bid/takeoff tables, no views mixing Hubbell + bids data. Mention the eventual schema move in any new migration's header comment.

**AR balance query pattern** — `agility_ar_open.cust_key` is NOT the same as `agility_so_header.cust_code`. Always resolve via `agility_customers` first:
```sql
LEFT JOIN LATERAL (
  SELECT cust_key FROM agility_customers
  WHERE TRIM(cust_code) = TRIM(soh.cust_code) AND is_deleted = false
  LIMIT 1
) ac ON true
LEFT JOIN (
  SELECT cust_key, SUM(open_amt) AS balance
  FROM agility_ar_open
  WHERE is_deleted = false AND open_flag = true
  GROUP BY cust_key
) ar ON ar.cust_key = ac.cust_key
```

#### Hubbell within-jobsite reconciler (2026-05-26 → 2026-05-27) — LIVE

Second-generation matcher targeting the ~6,800-doc historical Hubbell backlog the existing `document-matcher.ts` couldn't recover. Lives in `src/lib/hubbell/jobsite-reconciler.ts`. PRs #402–#419.

**Why this exists separate from `document-matcher.ts`:**
- `document-matcher.ts` filters `agility_so_header` to `so_status NOT IN ('I','C','X')`. For historical Hubbell docs the matching SO is almost always already invoiced (`I`) — the existing matcher excludes the right answer by construction.
- Address-fuzzy fallback can't recover them because **99.8% of HUBB SOs have NULL `shipto_address_1`** on the header (43,254 / 43,354 in prod). The physical address lives in `agility_customers` and is reached via `(cust_key, shipto_seq_num=seq_num)`.

**Per-jobsite design:** outer loop is one jobsite (one normalized resolved address); inner data is ALL unmatched docs at that jobsite + ALL HUBB SOs at that jobsite **across every status**. Within that small set, the matcher pairs docs to SOs via four signals.

##### Matcher signals & confidence math

| Signal | Source | Weight | Notes |
|---|---|---|---|
| A — `po_number_split` | doc# token appears in `agility_so_header.po_number` | **100** (auto-attach) | Buyer-typed, authoritative |
| S — scope keyword | overlap between extracted line-item descriptions and SO.reference | +30/keyword, cap 80 | Tokenized + stemmed via `SCOPE_KEYWORDS` |
| T — amount | doc total within 10% of `SUM(extended_price)` | +15 | UOM-correct via the `extended_price` column |
| D — date | doc need-by within 90d of SO `created_date` | +10 | |

Floor: `minConfidence = 30`. Below floor → suppressed.

##### Tuning rules (each driven by a Codex review-batch pattern)

Documented in the constants block at the top of `jobsite-reconciler.ts`. **All hard-won from real review batches — don't relax without an equivalent data set behind the change.**

1. **Negative reference penalty** (`NEGATIVE_REF_PATTERN` / `NEGATIVE_REF_PENALTY = 30`).
   SOs whose ref contains `credit | cred | replacement | repl | vpo | added` are partial-scope SOs that almost never match a full doc on scope-only matching. Apply −30 **unless** amount also matches within 10% (then the doc really is for the small partial-scope amount).
   - Source: first 3 Codex batches consistently rejected `Trim Credit`, `Deck Credit`, `REplacement Trim VPO`, `added trim`.
2. **Broad keyword half-weight** (`BROAD_SCOPE_KEYWORDS = {frame, lumber}`).
   These keywords appear in too many unrelated docs to count at full weight on their own.
   - Full weight (+30) when paired with another non-broad keyword in the overlap.
   - Half weight (+15) when overlap is broad-only AND the doc is also broad-only (legit framing-pkg ↔ framing-pkg).
   - **Zero contribution** when overlap is broad-only AND the doc carries a specific keyword like `joist` — the doc is about something specific the SO doesn't share, so "frame ↔ frame" is incidental.
   - Source: floor-joist WO ↔ "Roof Framing" SO false positives.
3. **Parent → sub-component demote** (`PARENT_TO_SUBS = {door: [hardware, lock], window: [screen]}`).
   When the doc's line items carry a sub-component keyword that the candidate's overlap doesn't include, but the overlap contains a parent of that sub-component, the parent token contributes 0.
   - Catches "Door Hardware Set" doc ↔ "ext door" SO false positives.
   - Source: 4+ Codex batches flagged the same trap.
4. **Cancelled-SO penalty** (`CANCELLED_SO_STATUSES = {C, X}`, −25).
   Applies to **all** match sources including Signal A (the demotion sits AFTER the Signal A guard — Codex P1 #411). Live data showed 0/33 accepted for C-status candidates across the queue's lifetime.
5. **Jobsite-number mismatch** (`JOBSITE_NUMBER_PENALTY = 20`).
   Parses leading street number from doc's `extracted_address` and ALL 3+ digit tokens from `so.reference`. If the doc's street # doesn't appear in any of the ref's tokens, −20.
   - Catches "Trim load #9124" SO for doc at "9108 Robinson Dr" — duplex/cluster neighbor wrong match.
   - Multi-number refs ("Doors #9124 9132") are correctly handled.

##### R2 keying bug (2026-05-26) — root cause + fix

The Pi uploader keyed R2 by `(doc_type, doc_number)` only. When Hubbell reused a doc number for a different job (measured at 378 occurrences in prod), the second upload **silently overwrote** the prior PDF. The older `hubbell_documents` row retained its correct original metadata but its `r2_key` now resolved to a different PDF — reviewers saw a PDF that didn't match the suggestion's reasoning.

**PR #407 fix:** `buildHubbellKey` appends the first 12 hex chars of `source_hash` to the key. Each unique PDF body lands on a distinct R2 object; identical re-uploads are idempotent because they share a hash. Pre-2026-05-27 rows still use the un-suffixed key shape and remain readable on the old keys.

```
Old: hubbell/2026/wo/768.pdf
New: hubbell/2026/wo/768-a20c5d652921.pdf
```

##### Supersession skip (post-fix gate for backlog)

`fetchJobsiteData()` and `listJobsiteQueue()` skip any doc where a **later** row exists at the same `r2_key` with a different `source_hash` AND **different metadata** across the four matcher inputs (`extracted_address`, `extracted_total`, `extracted_need_by`, `line_items`). Codex P2 #409 caught the original predicate missing `line_items`/`need_by`.

Tie-break on equal `received_at` via `(received_at, id) > (d.received_at, d.id)` — Codex P1 #405 caught the silent leak under batched same-`now()` inserts.

Stale-**identical** rows (later sibling with same metadata, just byte-drift in re-extraction) are NOT skipped — their R2 file still describes the same job they expect, so the matcher can use them. Pre-tightening (#405 only) over-filtered ~1,000 of these.

##### Backfill recovery flow

`POST /api/admin/hubbell/backfill { document_id, pdf }` — bearer-auth endpoint. Re-verifies `sha256(bytes) == row.source_hash`, writes the bytes to R2 under the new hashed key (PR #407 shape), updates `r2_key` on the row. Idempotent.

`scripts/hubbell-restore-pdfs.ts` — local Node script. Pulls stale-divergent rows via direct postgres connection, walks the local Hubbell cache at `C:\Users\amcgrean\python\hubbell test\` (`HUBBELL_LOCAL_CACHE` env override), sha256-indexes ~7K PDFs in seconds, POSTs matches to the backfill endpoint. Flags: `--dry-run`, `--limit N`, `--concurrency N`.

**Prod recovery results (2026-05-26):** 290 of 378 stale-divergent rows restored (77%) from local cache. The remaining 86 are pre-cache historicals — a one-off Hubbell portal re-scrape is handed off via `docs/agent-prompts/hubbell-stale-divergent-rescrape-2026-05-27.md` + CSV target list.

##### Coverage trajectory & accept-rate trend

Doc backlog reachability (out of 6,813 unmatched at start):

| Filter | Reachable jobsites | Reachable docs | % |
|---|---|---|---|
| Old matcher (header shipto, open-only) | 35 | 345 | 5% |
| + `agility_customers` cust_key resolution | 314 | 3,943 | 58% |
| + USPS suffix table + duplex `(,&-)` expansion | 520 | 6,447 | 94.6% |
| + directional-suffix fallback (matcher layer) | — | 6,527 | 95.8% |

Cumulative Codex review accept rate after 14 batches (167 accepted / 62 rejected = 73%). Per-batch trend showing the tuning land:

```
45 → 38 → 47 → 62 → 91 → 72 → 93 → 87 → 100 → 87 → 93 → 94 → 100 → 100 → 100
```

##### Operational learnings (worth re-using elsewhere)

1. **Tuning rules don't retroactively re-score pending candidates.** Every time a new rule lands, do a targeted DB wipe of the pending candidates the rule would now suppress. SQL pattern matches the rule's logic:
   ```sql
   DELETE FROM bids.hubbell_document_suggestions
   WHERE match_source='jobsite_reconcile' AND status='pending'
     AND <rule's filter predicate>
   ```
   Doing this kept Codex from re-swatting the same false positives across batches. Cleanup counts so far: 748 pre-tuning credit/VPO + 41 stale-divergent + 234 door-hardware + 31 + 24 C-status + 282 jobsite-number = ~1,400 noise candidates wiped operationally.
2. **Codex's CLI caches packets locally.** When you DB-wipe in the middle of a batch, the packets Codex pulled before the wipe still apply correctly (the suggestion IDs exist as soft-deleted rows or get harmlessly missed). The wipe only affects the *next* `pull`.
3. **Reviewer feedback loop converts noise to rules at ~1 rule per 2-3 batches.** Each rule reduces review burden by 5–20% of subsequent batches. The compound effect is the trend above.
4. **Codex P-comments on PRs catch real bugs in this work** (cancelled-SO inside Signal A guard, missing tie-break, incomplete divergence check). Run the Codex reviewer on every reconciler PR — the matcher's logic is subtle enough that even careful tuning misses edge cases.

##### Recurring "this is real revenue, not noise" examples Codex worked through

- **"Dunnage Doors"** — sounds like packing lumber, but in Hubbell context means rough-opening door material. Accept when amount + scope corroborate.
- **"Replace damaged bypass door" VPO** — the `replacement` keyword triggers the `neg_ref` penalty, but it's waived when amount matches → correctly surfaces and gets accepted.
- **Unit-numbered trim refs** (`Trim load #6519` vs `#6529`) — the matcher's jobsite-number-mismatch rule auto-rejects neighbor mismatches.
- **Status I vs C duplicates at same jobsite** — the cancelled-SO penalty auto-rejects C; I surfaces normally.

#### AR / Agility API Cleanup (2026-04-17) — COMPLETE
Branch: `claude/review-customer-route-api-jVgJG`

- Reviewed Agility live API vs mirror table usage — documented correct pattern (see Agility Live API section)
- Removed AR balance data from all operational screens: dispatch board, stop detail panel, delivery table, sales customer list, sales customer profile, admin customer detail
- Stripped AR sub-queries from `GET /api/dispatch/deliveries` and `GET /api/dispatch/orders/[so_number]/timeline`
- Removed `balance`/`credit_limit` from `GET /api/sales/customers` list query
- `/api/sales/customers/[code]/ar` and `/ar-live` routes preserved for future accounting view

#### Products & Stock Redesign (2026-04-28) — COMPLETE
Branch: `claude/product-group-tiles-kWvWT` (PR #154)

- **`/sales/products`** redesigned to auto-load product major tiles on page open, drill down to minor tiles, then item list. FTS search still works across all items regardless of browse position.
- **Data sources**: product hierarchy (`product_major_code`, `product_major`, `product_minor_code`, `product_minor`) from `agility_items`; stock data (qty_on_hand, default_location, handling_code, active_flag, stock) from `agility_item_branch` joined on `item_code = item`.
- **Branch scoping**: nav cookie (`beisser-branch`) read server-side via `getSelectedBranchCode()` — no branch input on the page. Branch filter goes on `agility_item_branch.system_id` (NOT `agility_items.system_id` which is always the company code `'00CO'`).
- **Tile query pattern**: `SELECT product_major_code FROM agility_items WHERE item IN (SELECT item_code FROM agility_item_branch WHERE system_id=$1 AND active_flag=true AND stock=true AND is_deleted=false) GROUP BY product_major_code`
- **Item list pattern**: `JOIN agility_item_branch bi ON bi.item_code = ai.item AND bi.system_id=$1` — branch + active/stock conditions in JOIN ON clause; product hierarchy + FTS conditions in WHERE on `ai.*`.
- **Indexes applied** (`db/migrations/0005_products_search_indexes.sql`): GIN FTS on `agility_items`; `(product_major_code, product_minor_code)` on `agility_items`; `(system_id, item_code)` on `agility_item_branch`.
- **Key files**: `app/sales/products/ProductsClient.tsx`, `app/api/sales/products/_shared.ts`, `app/api/sales/products/groups/route.ts`, `app/api/sales/products/majors/route.ts`, `app/api/sales/products/route.ts`.

#### Flask Sunset — NOT STARTED
- DNS routing, archive Flask app

#### Interactive Charts (2026-04-27) — COMPLETE
PRs #159 (phase 1), #160 (phase 2), #161 (phase 3) — all merged into `main`.

Adds **Recharts** (`recharts@^2.15`) and a small set of opinionated dark-theme chart wrappers in `src/components/charts/`. Tables stay alongside as the export source of truth — charts go above each section.

**Components in `src/components/charts/`** (all `'use client'`, types exported from `index.ts`):
- `ChartCard` — shared frame: `bg-slate-800/40` border, title/subtitle, `print:break-inside-avoid`
- `TimeSeriesChart` — bars over time, optional `referenceY`, optional `Brush`, optional stacked-by-series (used for daily orders, deliveries-by-branch, forecast)
- `ComboBarLineChart` — bars (left $ axis) + line (right % axis); the 3-year sales+GM% chart
- `ComparisonBarChart` — paired horizontal bars (base vs compare year) with delta % chips
- `ParetoChart` — descending bars + cumulative-% line + 80% reference line
- `MixDonut` — donut with `topN + Other` rollup, total in center, prior-year delta in tooltip
- `StatusFunnelBar` — pure CSS stacked bar in fixed pipeline order (`O/B → K → S → P → D → I`); not recharts
- `HeatmapGrid` — pure CSS row × col grid with intensity shading; not recharts
- `ProductTreemap` — recharts `<Treemap>` for product-major mix, hover surfaces GM%
- `DaysToPayBullet` — pure CSS bullet bar with prior-year tick + threshold (red/green flip); not recharts
- `theme.ts` — central `CHART_COLORS` palette (Beisser green = base year, Beisser gold = cumulative/reference, slate-500 = compare); branch + status colors mirror existing inline maps in `TopNav`/`ReportsClient`

**Wired into:**
- `/management` — 3-yr combo + branch comparison + sale-type Pareto
- `/sales/reports` — daily order time-series with prior-yr ref line + Brush on 90d, sale-type donut, status pipeline funnel (replaces the custom HTML `DailyBars`)
- `/ops/delivery-reporting` — stacked-by-branch daily time series + sale-type × branch heatmap + carrier donut (replaces the custom HTML `DailyBars` and `BreakdownRow` carrier list)
- `/management/forecast` — open-orders Pareto + stacked-by-branch forecast time series
- `/scorecard/overview` — 3-yr combo + branch contribution Pareto + product treemap + sale-type Pareto
- `/scorecard/branch/[branchId]` — 3-yr combo + top-customers Pareto + product treemap + sale-type Pareto
- `/scorecard/rep` — assigned-book vs written-up sales bars (top 12 reps)
- `/scorecard/rep/[repCode]` — 3-yr combo + product treemap rendered per dual section (Assigned/Written)
- `/scorecard/product` — product-mix treemap + product-concentration Pareto side-by-side
- `/scorecard/[customerId]` — 3-yr combo + product treemap + days-to-pay bullet + sale-type Pareto

**Server/client boundary pattern**: pages stay server components and pass already-resolved data to a `'use client'` adapter:
- `app/management/_components/ManagementCharts.tsx` — accepts `threeYear`, `branchSummaries`, `saleTypes` props
- `app/scorecard/_components/ScorecardCharts.tsx` — exports per-use-case adapters (`<ThreeYearChart>`, `<TopCustomersPareto>`, `<ProductMixTreemap>`, `<RepComparisonChart>`, `<DaysToPayCard>`, etc.)

**API change**: `GET /api/ops/delivery-reporting` now returns `by_sale_type_branch: { sale_type, system_id, count }[]` aggregate (derived from the same `uniq` CTE — no extra query) for the heatmap pivot.

**Print CSS** added in `app/globals.css` so recharts SVGs render with white background + dark gridlines on printed reports.

**Conventions when adding charts:**
- Use `e.sales !== 0` (not `e.sales > 0`) when computing GM% for time-series — match the table convention so years with negative net sales (credits exceed sales) show their actual ratio rather than collapsing to 0%
- Normalize blank `so_status` (`''`) to `'B'` when building counts for `<StatusFunnelBar>` since the API uses `UPPER(COALESCE(so_status, ''))` and the codebase treats blank as Open
- Keep tables alongside charts — they remain the CSV-export source of truth; chart components don't have export buttons
- For pages already `'use client'`, import chart components directly. For server-component pages, create an `_components/<X>Charts.tsx` client adapter that accepts plain serializable props.

**Out of scope (intentional):**
- KPI sparklines on tiles — would need monthly history aggregation we don't expose yet
- SVG download button on `<ChartCard>`

#### Geocoding Pipeline (2026-04-30 → 2026-05-20) — CONSOLIDATED ON PI

**TL;DR: LiveEdge no longer geocodes.** All matching now happens on the Pi
(`agility-api-sync.service` → `agility_api/geocoder_sqlite.py` against a
local SQLite parcel index at `/home/api/geocode.db`). The Vercel cron and
Supabase `geocode_index` table were removed 2026-05-18 (LiveEdge PR #319/#321;
beisser-api PR #35 — matcher fix, PR #36 — chmod fix). Reason: the index
ballooned to 666 MB / 1.66M rows on Supabase, and running two matchers against
the same `agility_customers` rows produced dueling writes + row-lock contention.

**Current data flow:**
1. Pi has a local SQLite DB at `/home/api/geocode.db` (~9.9 GB, 74M rows:
   73.8M TIGER + 172K Polk County atlas + 28K Dallas County parcels).
2. `beisser_sync.py` syncs customer ship-tos from Agility SQL Server into
   Supabase `public.agility_customers`.
3. `SqliteGeocoder.geocode()` runs 3-tier match (`sqlite_city` → `sqlite_zip`
   → `sqlite_state_fuzzy`) and writes `lat`/`lon`/`geocode_source` back to
   Supabase via the same sync worker.
4. LiveEdge reads `agility_customers.lat/lon` directly for dispatch/maps.

**The 2026-05-18 incident (root cause of the move):**
- Vercel-side `runGeocodeBatch` tier-3 (`openaddresses_state_unique`)
  accepted any `(number_norm, street_norm)` that was unique in IA, ignoring
  city/zip. Numbered streets ("52nd St") match many IA towns; customers
  ended up placed 9–141 mi off. 1,338 rows poisoned.
- Pi-side `SqliteGeocoder` tier-3 had the same bug (closest house number
  on `street_norm + state_norm`, no city/zip check). 77 rows poisoned as
  `sqlite_state_fuzzy`.
- Both matchers tightened to require zip-3 prefix OR city corroboration
  before a state-fuzzy match fires. See LiveEdge PR #319 for the algorithm.
- 1,415 poisoned rows reset via `db/migrations/0016_reset_unsafe_geocode_matches.sql`.

**The 2026-05-19/20 follow-up (Polk + Dallas data on Pi):**
- Polk County atlas (~172K parcels) and Dallas County (~28K parcels) loaded
  into the Pi's local SQLite via Python loaders (beisser-api repo,
  `scripts/load_polk_county_into_index.py` + `load_dallas_county_into_index.py`).
- Added `(street_norm, state_norm)` index on the SQLite — without it, tier-3
  queries were full-scanning all 74M rows on every fall-through (60 rows/hr).
  After index: 21 rows/sec. 38-min one-time build cost.
- Bulk rematch against the 6,966 reset Polk + Dallas customers placed **1,929
  newly matched** (50.4% match rate); 1,898 still failed — direction-prefix
  mismatches and addresses genuinely missing from any source.

**Source-tag legend on `agility_customers.geocode_source`:**
| Tag | Writer | Confidence |
|---|---|---|
| `local_geojson_exact` | Pi `ShipToGeocoder` (main `beisser_sync.py`) | High |
| `local_geojson_fuzzy_zip` | Pi `ShipToGeocoder` | High |
| `local_geojson_fuzzy_city` | Pi `ShipToGeocoder` | Medium |
| `sqlite_city` | Pi `SqliteGeocoder` | High |
| `sqlite_zip` | Pi `SqliteGeocoder` | High |
| `sqlite_state_fuzzy` | Pi `SqliteGeocoder` (post-fix) | Medium — zip3/city-gated |
| `nominatim` | Pi fallback | Variable |
| `openaddresses_*` | **Vercel (deprecated, never write new)** | n/a — table dropped |
| `failed` | Either matcher attempted, no hit | — |

**Pi geocode.db schema** (different from the dropped Supabase version):
```
CREATE TABLE geocode_index (
    number_norm TEXT NOT NULL, street_norm TEXT NOT NULL,
    city_norm TEXT, state_norm TEXT, postcode TEXT,
    lat REAL NOT NULL, lon REAL NOT NULL, source TEXT NOT NULL,
    source_hash TEXT  -- added 2026-05-19, used by ON CONFLICT for idempotent loaders
)
-- indexes: (source, source_hash) UNIQUE WHERE source_hash NOT NULL,
--          (number_norm, street_norm, city_norm), (number_norm, street_norm, postcode),
--          (street_norm, state_norm)  ← added 2026-05-19 for tier-3
```

**Files (still in LiveEdge repo, currently inert):**
- `src/lib/geocode.ts` / `src/lib/geocode-runner.ts` — matcher logic kept
  as reference for the algorithm. Not called by anything anymore.
- `app/api/cron/geocode-nightly/route.ts` — short-circuited to a no-op
  200 response. Re-enable steps in route header.
- `db/migrations/0014_geocode_index.sql` / `0015_*` / `0016_*` — applied.
  `geocode_index` table itself has been dropped from Supabase.
- `scripts/snapshot-polk-county-atlas.ts` / `load-polk-county-into-index.ts`
  / `load-dallas-into-index.ts` / `inspect-dallas-shp.ts` — TS loaders that
  wrote to Supabase. **Not used post-consolidation.** Reference only.
- `scripts/reset-geocode-attempts.ts` — chunked utility to push specific
  cities back to the front of the matcher queue (writes NULL `geocoded_at`
  in 200-row chunks to dodge Supabase's 60s statement timeout). Still useful
  if you need to force a Pi rematch of a specific city set.

**Pi-side files (in `C:\Users\amcgrean\python\api`, beisser-api repo):**
- `agility_api/geocoder.py` — main `ShipToGeocoder` (in-memory GeoJSON,
  4-tier with Nominatim fallback). Used by `beisser_sync.py`.
- `agility_api/geocoder_sqlite.py` — `SqliteGeocoder` (3-tier, parcel
  index). Tier-3 fix landed in beisser-api PR #35 (2026-05-18).
- `scripts/run_geocoding_bulk.py` — bulk rematch worker. Filters
  `WHERE geocoded_at IS NULL`, so to reprocess a city, reset those rows
  to NULL first (see LiveEdge `scripts/reset-geocode-attempts.ts`).
- `scripts/load_polk_county_into_index.py` — Polk County loader (Python).
  Reads NDJSON snapshots from `/home/api/geocode-snapshots/polk/`.
- `scripts/load_dallas_county_into_index.py` — Dallas County loader.
  Reads shapefile + CSV from `/home/api/geocode-snapshots/dallas/`. Needs
  `pyproj` + `pyshp` (`pyproj` installed on Pi venv 2026-05-19).

**Unmatched ship-tos by county (2026-05-20 snapshot):**
~10K IA customers still without `lat`/`lon`. Top remaining (after Polk + Dallas
land):
| County | Approx unmatched | Public data | Action |
|---|---:|---|---|
| Webster | ~1,700 | Beacon-only | Deferred (needs scraping) |
| Polk (direction-prefix mismatches) | ~3,300 | Atlas loaded — fuzzy match needed | 4th-tier fuzzy work |
| Johnson | ~560 | REST endpoint identified | Build Pi loader |
| Warren / Story / Madison / Marion / others | ~2,500 combined | Mostly Beacon | Deferred |

Public data-source availability per county:
- **REST endpoints:** Polk (loaded), Johnson (pending Python loader)
- **Shapefile only:** Dallas (loaded)
- **Beacon-only (no public data):** Webster, Warren, Story, many others —
  would require Beacon scraping work; out of scope until a need surfaces.

**Known data-quality wall:** direction-prefix mismatches. Customer record
says `"613 Grimes Street"` but the Polk atlas has `"613 E Grimes St"`.
`_split` keeps directionals as part of the street core, so these miss
tier-1/2. A 4th-tier fuzzy matcher (strip directionals, Levenshtein on
street name) would recover an estimated 1,500–2,500 of the still-failed
rows. Highest-leverage follow-up.

**Pi storage state (2026-05-20):**
- `/home/api/geocode.db` — 9.9 GB
- Pi SD card — 29 GB total, ~21 GB used (74%), ~8 GB free
- Plans: migrate to Pi 5 + USB SSD (existing 500 GB/1 TB SSD on-hand) for
  IOPS + write endurance. Current SD card has ~2-3 year write-cycle clock
  under sustained sync writes. SSD migration is separate cutover.

#### Scorecard Drill-Downs (2026-05-13) — COMPLETE

Expansion of the scorecard suite to add product (major/minor/item) and vendor drill-down pages with reciprocal cross-links and a back-stack hint so navigating between scorecards always returns to the originating page. PRs #263, #265, #266, #271.

**New pages:**
- `/scorecard/product/major/[majorCode]` · `/scorecard/product/minor/[majorCode]/[minorCode]` · `/scorecard/product/item/[itemCode]` — 3-Year chart, KPIs, top customers, branch mix, drill-down breakdown table, sale-type pareto, detail metrics. Item page also has a Primary Supplier card + full Suppliers section (lead times, min order/pak, violations, supplier UOM, UOM-step flags).
- `/scorecard/vendor` + `/scorecard/vendor/[supplierKey]` — vendor list + standalone scorecard mirroring branch-scorecard layout (3-year receipts, KPIs, branch chart, product treemap, top items, rebate programs, risk flags).

**Query layer:**
- `src/lib/scorecard/product-drill-queries.ts` — `fetchProductHeader`, `fetchProductKpis`, `fetchProductThreeYear`, `fetchProductTopCustomers`, `fetchProductBranchMix`, `fetchProductSaleTypes`, `fetchItemPrimarySupplier`, `fetchItemSuppliers`. All cached via `erpCache()`. All read `customer_scorecard_fact` except the supplier ones which read `agility_item_supplier`.
- `src/lib/vendor-scorecard/queries.ts` — extended with `fetchVendorThreeYear`, `fetchVendorTopItems`, `fetchVendorBranchSummary`, `computeDerivedRiskFlags` (pure helper). `fetchVendorList` now populates real `riskFlagCount` from derived signals.
- `src/lib/scorecard/types.ts` — new `ProductFilter`, `ProductDrillParams`, `ProductHeader`, `ProductBranchMixRow`, `ProductTopCustomerRow`, `ItemPrimarySupplier`, `ItemSupplierRow` types.

**Back-stack convention:** every cross-link passes `?from=<origin>` (e.g. `customer:1234`, `vendor:LMC1000`, `product-major:LBR`, `product-minor:LBR|2X6`, `product-item:ABC123`). `ScorecardBreadcrumb` (`src/components/scorecard/ScorecardBreadcrumb.tsx`) parses it and renders "← Back to {origin}" with a sane fallback when missing. Used in all new drill-down page headers.

**Critical gotchas — read before touching scorecard code:**
- `customer_scorecard_fact` SKU column is **`item_number`**, NOT `item_code`. Only `agility_items` has `item_code` (alias for `item`). Indexes / queries on the fact table use `item_number`.
- `agility_receiving_header` has **no `supplier_key` column** — the supplier lives on the joined `agility_po_header`. Vendor scorecard queries always join through PO header for the supplier predicate.
- **LMC1000 multi-ship-from routing**: the vendor scorecard namespaces those suppliers as `<supplier_key>::<ship_from_seq>`. `fetchVendorList` constructs the composite key, `fetchVendorDetail` parses it back via `indexOf('::')`. **Always use `buildVendorRouteKey()` in `product-drill-queries.ts`** when constructing a `/scorecard/vendor/[supplierKey]` link from `agility_item_supplier` data — passing the raw `supplier_key` drops the ship-from and routes to the wrong page.
- `agility_item_supplier.supplier_key` is left-padded with spaces (e.g. `"     515"`). Always `TRIM()` it in joins and before exposing it on URLs.
- `agility_items` may or may not have `primary_supplier` / `primary_supplier_key` columns depending on sync build. **Don't query them** — the source of truth is `agility_item_supplier.is_primary`. Migration 0020 dropped the obsolete indexes on those columns.

**Indexes (apply manually in Supabase SQL editor):**
- `db/migrations/0019_scorecard_drilldown_indexes.sql` — 8 indexes: `idx_csf_{item,major,major_minor,branch_item}_date` (note: **`item_number`** not `item_code`), `idx_agility_recv_header_{date,branch_date}`, `idx_agility_recv_lines_po`, `idx_agility_po_header_supplier_status`. The trailing `idx_agility_items_primary_supplier{,_key}` indexes are wrapped in a `DO/EXECUTE` block that no-ops when those columns don't exist on the target schema — they're also dropped by migration 0020, so they're effectively cruft. New work should rely on `agility_item_supplier` indexes (already created by the sync worker) instead.
- `db/migrations/0020_drop_obsolete_primary_supplier_indexes.sql` — drops the now-unused `idx_agility_items_primary_supplier{,_key}` (DROP IF EXISTS, safe re-run). Both 0020 files (`_dispatch_driver_availability.sql` and `_drop_obsolete_primary_supplier_indexes.sql`) coexist on disk; the numbering is just a sort key, not a sequence.

**Bug fixes from /purchasing/scorecard:**
- Branch & Mix tab was rendering em-dashes — now hydrated from new `fetchVendorBranchSummary` (vendor count + spend YTD/PY + fill/OTD per branch).
- Risk flag count was hard-coded to 0 — now computed from low-fill-rate (<90), low-OTD (<85), no-recent-receipts (>60d w/ open POs), missed-rebate-pacing.
- Each leaderboard row gets an `ExternalLink` icon → standalone `/scorecard/vendor/[supplierKey]`.

**Vendors tab in `ScorecardTabs`** added between Sales Reps and Product Groups (`app/scorecard/_components/ScorecardTabs.tsx`).

#### Open POs + PO Detail supplier rules (2026-05-14) — COMPLETE
PR [#278](https://github.com/amcgrean/liveedge/pull/278). Joined `agility_item_supplier` to PO queries so buyers see lead time, min-order-qty, and violation rule inline.

- **`/purchasing/open-pos`** — added two PO-level columns via `LEFT JOIN LATERAL` aggregating across the PO's items:
  - **Lead**: `MAX(ims.lead_time_1)` (conservative — surfaces the worst case)
  - **Min**: amber **Block** chip when any line has `ims.min_ord_violation = 'Block'`
- **`/purchasing/pos/[po]`** — added three per-line columns: Lead (`lead_time_1`), Min Ord (`min_ord_qty` + `min_ord_qty_disp_uom`, amber when violation = `'Block'`), Supp UOM (`supp_uom`).
- Join predicate (mandatory `TRIM` on supplier_key — `agility_item_supplier.supplier_key` is left-padded; **branch scoping** added by PR [#299](https://github.com/amcgrean/liveedge/pull/299) — `agility_item_supplier` is keyed by `(system_id, supplier_key, item_ptr, ship_from_seq_num)`, and without the `system_id` predicate an item sold across branches can resolve to a rule row from the wrong branch):
  ```sql
  ON ims.item_ptr = pl.item_ptr
  AND ims.system_id = pl.system_id        -- mandatory; without it, cross-branch leak
  AND TRIM(ims.supplier_key) = TRIM(ph.supplier_key)
  AND ims.ship_from_seq_num = ph.shipfrom_seq
  AND ims.is_deleted = false
  ```
- `OpenPO` type in `src/lib/purchasing.ts` extended with `lead_time_max_days` and `has_blocking_min_violation`.
- No new indexes — `idx_agility_item_supplier_supplier (supplier_key, ship_from_seq_num)` covers the lookup.

#### Suggested Buys supplier rules + primary mismatch (2026-05-14) — SUPERSEDED 2026-05-26
**This section describes the PPO-based viewer that was replaced by the replenishment engine in PR #384 (2026-05-26). The `/api/purchasing/suggested-buys` and `/[ppo_id]` routes referenced below were deleted in that PR. Kept for historical context only — the current page reads `/api/purchasing/replenishment?view=suggested`. See the "Buyer Workspace & Replenishment Engine" section.**

PR [#296](https://github.com/amcgrean/liveedge/pull/296). The `/purchasing/suggested-buys` page already existed as a read-only viewer of `agility_suggested_po_header/lines`; this PR enriched the expanded-row detail with `agility_item_supplier` rules and a primary-supplier mismatch signal.

- **API (`/api/purchasing/suggested-buys/[ppo_id]`)** — two LATERAL joins on the lines query:
  - `ims_sup` — looks up the rule row for `(this item × the suggested PO's supplier)` by resolving the suggested `supplier_code` to a `supplier_key` via `agility_suppliers`. Returns `lead_time_1`, `min_ord_qty + display UOM`, `min_ord_violation`, `supp_uom`.
  - `ims_primary` — looks up `is_primary = true` for the item independently, returns its `supplier_code` + name for client-side mismatch comparison.
  - Both LATERALs use `LEFT JOIN … ON true` so lines without rules still render.
- **UI** — 4 new columns on the expanded line table: Lead / Min Ord / Supp UOM / Primary. Amber background on Min Ord when violation = `'Block'`. Primary column shows an amber `AlertTriangle` chip when the item's primary supplier differs from the suggested PO's supplier. Item codes are now `Link`s to `/scorecard/product/item/[itemCode]?from=purchasing-suggested-buys`.
- **`ScorecardBreadcrumb`** — added `'purchasing-suggested-buys'` origin kind → "Back to Suggested Buys".
- **Override dropdown deferred**: the handoff prompt called for an inline dropdown to override the suggested supplier per line, but the page is a read-only ERP viewer (no Agility write-back wire-up yet), so a non-functional override control would be misleading. Surfacing the mismatch chip + linking out to the item scorecard accomplishes the same intent: a buyer can see at a glance that a non-primary supplier was suggested and click through to investigate before approving. Build the override dropdown only when an Agility write-back endpoint exists for `agility_suggested_po_lines.supplier_code` mutation.
- **Branch scoping** (added in-PR after Codex P2 review): both LATERALs filter `ims.system_id = spl.system_id`. Without it, an item sold across multiple branches with branch-specific purchasing rules could resolve to the wrong row.
- No new indexes — `(item_ptr)` and `(supplier_key, ship_from_seq_num)` already cover both LATERAL lookups.

#### Forecast dashboard ($ + drill) (2026-05-14 → 2026-05-15) — COMPLETE
The `/management/forecast` page now has UOM-correct $ and clickable drill-through on every KPI/horizon/branch tile. PRs #306, #310, #311, #312.

- **API**: `app/api/management/forecast/route.ts` sums `extended_price` / `unshipped_extended_price` from `agility_so_lines` (UOM-aware — see "UOM-aware open-order $" note above). Returns `kpis`, `horizons` (7 buckets: overdue / next_7 / next_8_30 / next_31_90 / next_91_plus / far_future / unscheduled), `far_future_orders` (top 20), `overdue_orders` (top 5), per-day forecast with branch + ship_via breakdowns, and the coverage gate (`dollars_coverage_pct` + `dollars_ready`).
- **Drill API**: `app/api/management/forecast/drill/route.ts` — `GET ?bucket=<b>&branch=<code>` where `bucket` is `'open'` | `'far_future_unscheduled'` | any `HorizonKey`. Returns top 200 SOs sorted by `unshipped_extended_price` DESC with cust_name/code/rep/expect/status/sale_type/$ — all derived from the same UOM-aware columns. 1-min cache + 5-min SWR.
- **Client** (`app/management/forecast/ForecastClient.tsx`): hero KPI strip (open count + ordered $ + unshipped $ + no-date count), per-branch KPI mini-strip, 7-tile horizon row, far-future "Data Hygiene" drill table, sale-type × branch pivot with $ columns, daily forecast SVG chart with branch-stacked bars + count line overlay.
- **Drill modal** (`DrillModal` in ForecastClient): triggered by any tile click. Filterable list (search by SO#, customer, code, rep), totals strip in header updates live, SO# links to `/sales/orders/[so_number]`, ESC + backdrop close, top-200 cap with truncation warning. Honors `dollarsReady` — hides $ columns + totals when coverage gate ever flips back on.
- **Empty buckets**: disabled (opacity-50, cursor-not-allowed) so users can't open empty modals.

#### App Performance Audit (2026-05-26) — PRs #386 + #387 MERGED

Three-Explore-agent audit on `claude/app-performance-issues-Hgx9B`. Plan in `/root/.claude/plans/how-does-our-app-floating-hedgehog.md`. Three fix PRs landed in the original audit; two more follow-up PRs landed 2026-05-27 (see "Landed 2026-05-27" below).

**Landed in PR #386:**
- **ERP-read caching on the hot paths.** Two new modules wrap `agility_*` reads in `erpCache()`:
  - `src/lib/home/queries.ts::fetchHomeErpKpis(branchScope)` — 5 queries (open picks, open WOs, open orders, invoiced-30d, recent-15-orders) used by `/api/home`. Bids-schema queries (open bids/designs/activity/page-visits) stay uncached because they read per-user mutable state.
  - `src/lib/sales/hub-queries.ts::fetchHubErpData(rep, branch)` — 8 queries (my open orders, written orders, 3× will-call counts, branch POs, top customers, recent transactions) used by `/api/sales/hub`. Keyed on `(rep, branch)` so admin-vs-rep views never collide. Bids-schema quotes/designs/service queries stay uncached.
  - **Pattern rule for new ERP-cached helpers:** do NOT use per-query `.catch(() => fallback)` inside the cached function. If any query throws, let `Promise.all` reject so `unstable_cache` doesn't store a partially-zeroed payload for 5 min (Codex P2 caught this on the home extraction — fix in same PR). Outer route handler applies the fallback so the failing request still returns; the next request retries from cache miss.
- **`/api/dashboard` parallelized.** Not an ERP route — reads `bids` schema only. Four sequential `await db.select()` calls collapsed into one `Promise.all`. Bids-schema mutations (open bids, designs, etc.) shouldn't be cached, so the win here is just round-trip count.
- **`usePageTracking` debounce.** `src/hooks/usePageTracking.ts` adds a 1 s `setTimeout` cleanup so rapid client-side nav coalesces to one `POST /api/track-visit` per destination. `page_visits` is an upsert, so coalescing is safe. Cuts request volume noticeably when a user hops between sibling tabs in `/bids`, scorecard, etc.
- **Polling visibility gates.** `src/components/dispatch/DispatchMap.tsx:352` (15 s vehicle poll) and `app/delivery/map/MapClient.tsx:65` (30 s fleet poll) now check `document.visibilityState === 'visible'` before firing. Matches the established pattern in `SupervisorClient` / `SalesTrackerClient`. Background tabs no longer hit `/api/dispatch/vehicles`.
- **`scorecard/overview` Suspense boundary.** `app/scorecard/overview/page.tsx` — extracted the data-dependent body into an inner async `OverviewContent` and wrapped with `<Suspense>` + a layout-matched skeleton. Header, breadcrumb, tabs, title block, and filter bar paint synchronously from URL params; the five `Promise.allSettled` aggregates suspend underneath. On cold cache the user sees the page shell + skeleton instead of a blank screen for 1–3 s.
- **Lazy-load thumbnail images.** `app/dispatch/DispatchClient.tsx` POD-photo thumbnails and `app/purchasing/review/[id]/ReviewDetailClient.tsx` photo grid get `loading="lazy" decoding="async"` on the raw `<img>` tags. `next/image` was considered and skipped — R2 presigned URLs rotate query params and `next.config.js` has no `images.remotePatterns`; the lazy-load attrs get most of the user-visible defer-load benefit with zero config risk.

**Landed in PR #387 (CI hardening, orthogonal):**
- `.github/workflows/codeql.yml` — `security-and-quality` queries on `javascript-typescript`, runs on PR + push to main + Mondays at 06:27 UTC.
- `.github/workflows/gitleaks.yml` — full-history scan on every PR + push to main.

**Disconfirmed claims from the original audit (don't re-flag these):**
- `/api/home` was NOT a sequential waterfall — `app/api/home/route.ts:241` already wraps both buckets (bids + ERP) in an outer `Promise.all`. The Explore agent was wrong; only caching was missing.
- The Hubbell `needs-extraction` "N+1 R2 fetches" is `getPresignedUrl()` local SDK signing with no network round-trip, wrapped in `Promise.all`. Not a perf concern at any reasonable batch size.
- `/api/credits` LATERAL + GROUP BY is real but already indexed by `db/migrations/0014_credits_performance_indexes.sql`. Don't touch unless `EXPLAIN ANALYZE` says otherwise.

**Landed 2026-05-27 (follow-up PRs):**
- **PR #406 — `DispatchClient.tsx` presentational extraction.** `PodPhotoViewer` → `src/components/dispatch/PodPhotoViewer.tsx`; `StopTimeline` → `src/components/dispatch/StopTimeline.tsx`. All state, fetching, and `useEffect` logic stayed in `DetailPanel`. Pure prop-driven renderers extracted. −79 lines in DispatchClient.tsx.
- **PR #401 — UOM `extended_price` on order-detail routes.** Fixed `qty_ordered * price` overstatement (10–100× on lumber lines) in `/api/sales/orders/[so_number]/route.ts`, `/api/dispatch/orders/[so_number]/lines/route.ts`, `/api/warehouse/orders/[so_number]/route.ts`. Client-side `lineTotal` math in both `OrderDetailClient.tsx` files also updated.
- **PR #420 — ERP cache audit.** Wrapped `fetchSalesReports` (`src/lib/sales/reports-query.ts`), `fetchDeliveryReport` (`src/lib/ops/delivery-reporting-query.ts`), and new `fetchPickerStats` (`src/lib/warehouse/picker-stats-query.ts`) in `erpCache()`. Routes deliberately NOT cached (real-time operational data): `/api/dispatch/init`, `/kpis`, `/deliveries`, `/api/supervisor/pickers`, `/api/work-orders/open`, `/api/warehouse/stats`.

**Deferred / dropped (with rationale — don't reopen speculatively):**
- **Virtualization on `JobsClient` + `TransactionsClient`** — DROPPED. Both already paginate server-side at 50 rows. 50 `<tr>` elements is well below where the DOM cost matters; `@tanstack/react-virtual` would add bundle weight for no real-world win. Reopen only if page-size ever climbs above ~150.
- **`<Suspense>` on `forecast` / `sales/reports` / `ops/delivery-reporting`** — NOT APPLICABLE. Each `page.tsx` renders a `'use client'` component that manages its own loading state; no server-side fetch to suspend.
- **`next/image` migration** — deferred. Requires `images.remotePatterns` for the R2 host(s) in `next.config.js` + careful presigned-URL query-string rotation handling. Lazy-load attrs (PR #386) get most of the win; revisit only if photo galleries grow past ~20 thumbnails.
- **Per-domain `revalidateTag` taxonomy** — deferred. Only one tag (`'erp'`), three invalidation sites (all in `app/management/rebates/actions.ts`). Build only when a real "stale dashboard after my own write" complaint surfaces.
- **Composite index audit on `agility_so_header(system_id, so_status, sale_type)`** — deferred. Likely already covered by `0013_erp_performance_indexes.sql` + `0016_scorecard_management_indexes.sql`. Run `EXPLAIN ANALYZE` before adding anything.
- **`ForecastClient.tsx` (1096 LOC), `ManageBidClient.tsx` (972), `TopNav.tsx` (956) god-file splits** — deferred until a feature change forces a touch. Skip `TakeoffCanvas.tsx` (988) — has an active bug-fix branch.

**Pattern reminders for future ERP-route refactors:**
- New `/api/*` routes that read `agility_*` for non-mutating dashboard purposes should default to wrapping the query function in `erpCache()` keyed on every input that affects the result (branch, rep, date range).
- Always partition cache keys on per-user scoping inputs. Two reps hitting `/api/sales/hub` must NOT share a cached payload.
- The Codex P2 lesson: never put `.catch(() => fallback)` inside an `erpCache`-wrapped function — let it throw, apply the fallback at the call site.

#### Scorecard Analytics Rollups (2026-05-30) — Tier 1 data-tier, IN PROGRESS

Architecture-review Tier 1: **isolate analytical load from operational load.** Every scorecard/management dashboard load aggregates over `public.customer_scorecard_fact` (~4.4M rows, **6.4 GB** = 2.5 GB heap + **3.9 GB indexes**). Those analytical scans compete with operational reads for the single Supabase instance's shared-buffer cache — root cause of the 2026-05-28 timeout incident, and the project shows a live "exhausting resources" banner. Fix: pre-aggregated **daily** rollup materialized views in `bids` that the hot scans read instead of the fact.

**Slice 1 LIVE (PR #459, migration `0035_scorecard_rollups.sql`):**
- **`bids.rollup_customer_day`** — daily-grain (`d = invoice_date::date`), pre-split-measure MV over the fact. **505,472 rows / 89 MB** (~0.7% of the 12 GB DB) replaces 6.4 GB scans. Refreshed nightly via **pg_cron** `REFRESH MATERIALIZED VIEW CONCURRENTLY` (jobid 7, `10 9 * * *` UTC ≈ 04:10 Central, off-hours).
- Rewired `_fetchCustomerList` + `_fetchAllCustomersAvg` in `src/lib/scorecard/queries.ts` to read the MV. The other functions still read the fact.
- **`GET /api/admin/sync-health`** (`admin.config.manage`) — cheap Pi-sync + rollup freshness monitor. Uses indexed `MAX()` on the fact (only `customer_scorecard_fact` indexes `synced_at`/`source_updated_at`), `cron.job_run_details` for rollup refresh, `pg_class.reltuples` for operational-table row sanity. No full scans.

**Design rules (the pattern — follow for every new rollup):**
- **Daily grain, not monthly.** Live queries filter `invoice_date::date <= cutoff` (day-level YTD); monthly grain would be wrong for the partial current month. `EXTRACT(YEAR)=y AND date<=cutoff` → `d >= make_date(y,1,1) AND d <= cutoff::date`.
- **Pre-split measure columns** (`sales_va`, `sales_ns`, `sales_cm`, …), never boolean-flags-as-grain — avoids row explosion.
- MV filters `is_deleted=false AND invoice_date IS NOT NULL` (keeps the unique index — required by CONCURRENTLY — NULL-free; changes no result since consumers filter dates).
- **Rule for new heavy scorecard $ aggregates: read the rollup, not the fact** — except the paths that genuinely can't: single-customer (`_fetchKpis`, `_fetchThreeYear` — already indexed, cheap, need exact distinct counts), distinct-count-exact paths, `_searchCustomers`, `_fetchDaysToPay`, `_fetchProductOrders`, item-level product drill (item grain ≈ fact cardinality), and **rep-scoped aggregates** (`_fetchAggregateKpis` joins `agility_so_header` on `rep_1`/`rep_3`; `rep` isn't in the fact, so a customer/product rollup can't serve rep scope — split company/branch vs rep).
- **Validation bar: match the live fact to the cent** via bounded MCP diffs (one branch/year + a partial-month YTD cross-year case), all deltas `0.0000`, before merging. Keep slices bounded (no unguarded `COUNT(*)` on the fact).
- Migrations applied manually in Supabase **off-hours** (initial `CREATE … WITH DATA` does one full fact scan). The "destructive operation" warning is expected — it's the `DROP MATERIALIZED VIEW IF EXISTS` (derived cache) + `cron.unschedule`; nothing touches source data.

**Remaining (next slices — handoff at `docs/agent-prompts/scorecard-rollups-next-slice-2026-05-30.md`):** `rollup_product_day` + `rollup_saletype_day` (fact-sourced; rewire `_fetchProductMajors/Minors`, `_fetchSaleTypes`, major/minor product-drill funcs); aggregate management paths (company/branch only — rep stays live); `rollup_vendor_day` (reads `agility_receiving_*`+`agility_po_header`, not the fact — most care); alerting on `/api/admin/sync-health`.

#### Dispatch route-completion alerts (2026-05-27 → 2026-05-28) — LIVE

Email + SMS alert fires the moment a dispatch route's final stop is delivered, so dispatch can pre-stage the next load instead of catching it from a board refresh. Two trigger paths share one recipient table, one Resend/Twilio integration, and one audit log:

| Source | Trigger | Hook |
|---|---|---|
| `liveedge` | `dispatch_route_stops.status` flips to `'delivered'` / `'skipped'` via the dispatch board | `POST /api/dispatch/orders/[so_number]/deliver` calls `notifyRouteCompletedIfLastStop()` after the UPDATE — PR #418 |
| `agility` | Every shipment in an Agility `(system_id, ship_date, route_id_char, driver)` group is delivered — judged on `agility_shipments.status_flag IN ('D','I')` (D=delivered, I=invoiced/past-delivered), **NOT** `status_flag_delivery` which is unpopulated in the mirror sync (corrected 2026-05-29, PR #451) | Pi-side `agility_api/dispatch_completion.py::reconcile_completed_routes()` POSTs to `/api/dispatch/agility-route-complete` after each `agility_shipments` sync — PR #426 |

The Agility path is what's actually in use today — dispatchers build routes in the **old POD system**, not the LiveEdge dispatch board, so `public.dispatch_route_stops` is empty/stale and the LiveEdge-source trigger never fires for real loads. The LiveEdge path exists for when/if dispatch starts using the LiveEdge board.

**Recipients per branch** at `/admin/dispatch-alerts` (`admin.config.manage` capability). One row = one person/phone/inbox, with independent email + SMS toggles. Test-send button per row fires a sample alert without waiting for a real route. **UI save behavior (PR #448):** the page applies the POST/PATCH response optimistically and background-reconciles, so a transient GET failure can no longer make a just-saved recipient silently disappear (which previously led users to retry and create duplicate rows). Delete is optimistic with restore-on-failure; refresh failures surface an amber banner instead of a stale list.

**Pi-side trigger fix (PR #451, done by Pi 2026-05-29):** the reconciler was keying completion on the always-blank `status_flag_delivery`; corrected to `status_flag IN ('D','I')` in `agility_api/dispatch_completion.py`. Before the fix, no real Agility-sourced alert had ever fired (only manual smoke tests). `status_flag_delivery` being unpopulated in the mirror is a known `beisser_sync.py` gap — not blocking, since `status_flag` is the right signal.

**Enriched payload — deliveries / anticipated-returns split (2026-05-29, LiveEdge PR #453, live; activates once beisser-api PR #46 lands on the Pi):** the Agility POST now carries an optional `stops[]` array (`{ soId, saleType, customer, address1, city, state, zip }`, capped at 200 — `agility-route-complete/route.ts` trims + string-coerces every field, 422s on a non-array). When present, the email renders a **Deliveries** table (green, columns SO / Customer / Address) and, below it, a separate amber **Anticipated returns** table for stops where `saleType.toLowerCase() === 'credit'` (case-insensitive) — those are inbound returns the dispatcher should expect, not real deliveries. `formatStopAddress()` joins `address1 · city, state zip` and drops missing pieces so there's no stray comma. When `stops` is absent/empty (older Pi builds, or the `liveedge`-source path which has no enriched data), the email falls back to the header-only layout with the first-5-SO "Final SO" line. SMS stays count-only but appends `· N credits` when any. `DispatchAlertStop` type lives in `src/lib/email/send-dispatch-alert.ts` (re-exported as `AgilityRouteStop` from `route-completion.ts`).

**Schema (bids):**
- `dispatch_alert_recipients` (migration 0033) — `branch_code`, `name`, `email`, `phone_e164`, `notify_email`, `notify_sms`, `is_active`. CHECK constraint requires email present when email channel is on, phone present when SMS is on.
- `dispatch_route_completion_log` (migration 0033 + 0034) — one row per send attempt. Columns: `route_source` ('liveedge' | 'agility'), LiveEdge identity (`route_id`), Agility identity (`system_id`, `agility_route_code`, `agility_ship_date`, `shipment_count`), `recipient_id`, `channel`, `status` ('sent' | 'failed' | 'skipped_console'), `provider_message_id`, `error`. Migration 0034 made `route_id` nullable and added a CHECK that enforces "one source identity must be present".

**Dedupe** is purely audit-log lookup, no unique constraint:
- LiveEdge source: `WHERE route_source='liveedge' AND route_id=$1`
- Agility source: `WHERE route_source='agility' AND system_id=$1 AND agility_ship_date=$2 AND COALESCE(agility_route_code,'')=COALESCE($3,'') AND COALESCE(driver_name,'')=COALESCE($4,'')`

Skip when any prior row for `(recipient_id, channel)` is `'sent'` or `'skipped_console'`. `'failed'` rows are retried on the next call. The Pi pre-checks the same tuple before POSTing to avoid unnecessary round-trips; LiveEdge double-checks server-side as belt-and-suspenders.

**Env vars (Vercel):**
- `RESEND_API_KEY` — reused from auth.
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` — bring-your-own Twilio account, E.164 sender.
- `DISPATCH_ALERTS_EMAIL_FROM` — defaults to `'LiveEdge Dispatch <noreply@app.beisser.cloud>'`.
- `DISPATCH_ALERTS_CONSOLE=true` — dev fallback that logs payloads to server console instead of sending. Mirrors `AUTH_OTP_CONSOLE` / `REPORTS_EMAIL_CONSOLE`.
- `DISPATCH_SYNC_TOKEN` — bearer for `/api/dispatch/agility-route-complete`. Matches `LIVEEDGE_DISPATCH_SYNC_TOKEN` in the Pi `.env`.

**Pi-side handoff doc:** `docs/agent-prompts/dispatch-agility-route-completion-pi.md` — the brief used to wire up `agility_api/dispatch_completion.py`. Reference for future Pi-coupled features.

**Pi topology (verified 2026-05-28 during the dispatch reconciler deploy — capture so future Pi-coupled features don't repeat the discovery):**
- Env file: `/home/api/beisser-api/.env`
- Worker: systemd `agility-api-sync.service` → `run_repo_worker.sh` → `python3 -m agility_api.worker --agility --exclude-family document`
- Autodeploy: `scripts/pi_autodeploy.sh` via `api-user` cron `* * * * *`, hard-resets `/home/api/beisser-api` to `origin/pi` and restarts the worker
- Deploy primitive: **moving `origin/pi` IS the deploy.** Worker restart is implicit. `systemctl restart` is unnecessary.
- Branch tracking: `origin/pi` typically follows `main`. **Do not point `origin/pi` at a feature branch SHA** — the next autodeploy cycle would advance it and we'd lose track of what's deployed. Merge to main first, then `origin/pi` follows.

#### Still Missing / Deferred
- **WH-Tracker kiosk/TV/smart scan**: not appropriate for LiveEdge web app pattern — intentionally deferred
- **Purchasing workflow** (tasks, approvals, exceptions, PO notes): verify `purchasing_tasks`, `purchasing_approvals`, etc. exist in `public` schema first
- **Dispatch enrichment** (driver/truck mgmt, order timeline per stop): WH-Tracker had these; LiveEdge dispatch shows basic stops only. **AR balance intentionally excluded from dispatch** — see AR Data Policy in the Agility Live API section.
- **Sales delivery board** (`/sales/tracker`, `/sales/deliveries`): WH-Tracker had sales-rep-facing delivery views not yet ported
- **Generic file management**: WH-Tracker's `files` + `file_versions` system not ported to LiveEdge
- **UOM-aware open-order $ on `agility_so_lines`** (2026-05-14): beisser-api PR #32 added three pre-computed columns + a rebuilt `v_open_order_value` view to fix 10–100× $ overstatement on lumber lines (the previous naive `qty_ordered * price` math ignored that `price` is denominated in a UOM identified by `price_uom_ptr` — e.g. per-MBF — with no conversion factor in Supabase). New columns:
  - **`agility_so_lines.disp_price_conv`** numeric — UOM conversion factor (1.0 for Each, 1000 for BF→MBF, 187.51 for 1x4-16' Pine, etc.)
  - **`agility_so_lines.extended_price`** numeric — `qty_ordered * price / disp_price_conv` (with NULL/0 fallback to naive math)
  - **`agility_so_lines.unshipped_extended_price`** numeric — same formula with `(qty_ordered - COALESCE(qty_shipped, 0))`
  - **`agility_so_lines.qty_shipped`** numeric — now actually populated from `dbo.shipments_detail` via OUTER APPLY (the 2026-05-05 PR #16 had a broken column reference that left it 100% NULL until PR #32)
  - **`agility_so_lines.item_code` / `description`** — now populate (the join to `dbo.item` was previously gated on `system_id` matching, but `dbo.item` is corporate `'00CO'` while line `system_id` is branch — gate removed in PR #32; ~361,832 of 362,131 lines resolve)
  - **`v_open_order_value`** view rebuilt — exposes `(system_id, branch_code, so_id, so_status, sale_type, expect_date, ordered_value, unshipped_value, line_count)`. Filter is `so_status NOT IN ('I','C','X')` only; HOLD/XINSTALL still need to be excluded by the caller. Perf: per-SO join ~9 ms; cross-system aggregate without `system_id` filter is slow (~22 s) — always filter by `system_id` before aggregating.
  - **First consumer** is `app/api/management/forecast/route.ts` which sums these columns directly. The route also runs a `COUNT(*) FILTER (WHERE extended_price IS NOT NULL) * 100 / COUNT(*)` coverage check in parallel and returns `dollars_coverage_pct` + `dollars_ready` so the client can auto-hide $ during any partial sync state. **Currently `DOLLARS_COVERAGE_THRESHOLD = -1` (always-on)** since coverage is steady-state ~95-96% and the remaining ~4% gap is structural (SO lines with NULL/0 price or qty that can never compute an `extended_price`). The check + flag are kept in code as an emergency lever — bump the threshold to e.g. 90 if a real sync outage materially distorts totals, and the banner/hide logic kicks in without further code work.
  - **Rule for new $ aggregates anywhere in LiveEdge**: never use `qty_ordered * price` on `agility_so_lines`. Always `SUM(extended_price)` for ordered $ or `SUM(unshipped_extended_price)` for backlog. Spot-check against Agility ERP's "Ext" column on the same SO — should match to the cent.
- **Vendor scorecard "Items I primarily supply"** (2026-05-13): add a section on `/scorecard/vendor/[supplierKey]` listing items where `is_primary = true` for this supplier. Parse `<key>::<seq>` first to preserve LMC1000 ship-from. Each row links to `/scorecard/product/item/[itemCode]?from=vendor:<supplierKey>`.
- **Item scorecard "Inbound POs" section** (2026-05-13): on `/scorecard/product/item/[itemCode]`, query open POs containing this item via `agility_po_lines.item_ptr → agility_po_header WHERE po_status NOT IN ('CLOSED','CANCELED','COMPLETE','RECEIVED') AND canceled = false`. Helpful for slow-mover review.
- **Vendor scorecard fact table** (2026-05-13, deferred): only build if `/scorecard/vendor/[supplierKey]` 3-year query is slow (>2s) at scale. Would need a sync-worker matview keyed `(supplier_key, ship_from_seq, system_id, year, month)` with pre-aggregated spend/lines/receipts/on-time-count. Don't start LiveEdge work without the matview landing first.

## Open Branches Audit (2026-05-20)

Snapshot of unmerged `claude/*` and `codex/*` branches with a hint about whether they're active work, deferred, stale, or likely superseded by something already in `main`. **Verify before reusing or deleting** — squash merges leave branches looking "ahead of main" even after their changes landed.

### Superseded — needs GitHub-UI deletion (harness git creds can't delete refs)
- **`codex/continue-work-on-security-upgrade-plan`** — Codex's P1/P2 fix attempt with its own follow-up issues. Both bugs were fixed in `main` via PR #349.
- **`claude/fix-permissions-update-error-yizvY`** — roles-cast fix; already addressed in `main`.
- **`codex/continue-work-on-security-remediation`** — status doc only, no longer needed (CLAUDE.md + `docs/security-decisions-closed-2026-05-20.md` are the live references).

### Active feature work (likely safe, owner-driven)
- **`claude/eager-cerf-b5b272`** (2 commits, 28h) — "docs: geocoding pipeline consolidated on the Pi (handoff for next agent)." 195-line CLAUDE.md refactor + cron tweak + handoff doc. **Conflicts with this file** — anyone merging needs to reconcile the Open Branches Audit section.
- **`claude/hubbell-docs-update`** (3 files, 5h) — Hubbell docs refresh + follow-up agent prompts. Possibly subsumed by PR #335 ("docs: refresh Hubbell section + add follow-up agent prompts") which is already in main. Diff before merging.
- **`claude/loving-chatelet-e3363c`** (3 files, 5h) — "Address Codex review on jobsite work surface." Follow-up on the PR #338/#340 Hubbell jobsite rebuild. Check whether the Codex comments it addresses are still open.
- **`claude/hubbell-jobs-pdf-preview`** (4h) — "expand doc rows to show PDF line items + job context." Likely follow-on to PR #340. Verify against current main before merging.
- **`claude/hubbell-doc-context`** (5 files, 22h) — `system_id` scope on candidate order_total LATERAL subqueries. Real branch-leak fix; check whether the same scoping was already applied in another merged PR.
- **`claude/hubbell-payments-import`** (7 files, 11h) — "Mark docs unpaid when import has no payment row for them." Touches the payments-import route.
- **`claude/hubbell-payment-autolink`** (8h) — "Auto-link orphan payments + fix linked-count reporting." **Likely already merged via PR #333** ("Auto-link orphan payments + fix linked-count reporting"). Confirm before deleting.
- **`claude/hubbell-job-detail-address-match`** (3 files, 8h) — "Expand street-type abbreviations in Hubbell address normalize." **Likely already merged via PR #332** ("Claude/hubbell job detail address match"). Confirm before deleting.
- **`claude/hubbell-jobs-address-only`** / **`claude/hubbell-jobs-source-from-agility`** (21h) — earlier iterations of the jobs-page rewrite that landed as PR #338. Almost certainly superseded.

### Deferred / pending per existing Pending Actions list
- **`claude/dallas-county-loader`** (47 commits, 2w) — Dallas County IA parcel loader. See Pending Action #7. Real outstanding work, not stale.

### Probable squash-merged duplicates (safe to delete after confirming)
- **`claude/lucid-thompson-d7f94e`** — merged via PR #339.
- **`claude/merge-admin-permissions-prs-nJDm6`** — last-touched by PR #341 (docs commit). Underlying security work also merged.
- **`claude/purchasing-suggested-buys-rules`** (1 file, 5d) — branch-scope for suggested-buys LATERALs. Per CLAUDE.md the fix landed via PR #299 / #296 — almost certainly superseded.
- **`claude/docs-purchasing-supplier-rules-followup`** (1 file, 5d) — same area as above.
- **`claude/hardcore-dirac-8d92f4`** (1 file, 7d) — `active_flag=true` filter in suggested-buys detail. Spot-check whether this exact line landed via #296/#299/#306.
- **`claude/keen-mcnulty-c72043`** (3 files, 5d, 1110+/737-) — forecast UI port. Forecast dashboard landed via PRs #306-#312; verify whether this branch was the source or a parallel attempt.

### Stale base / investigate before touching
- **`claude/fix-gps-job-loading-IAYiF`** (654 commits ahead of main, 3w) — the commit count means the branch base is way out of date; the actual fix is small but a rebase will be painful. Check if the same fix is already in main before rebasing.

### General hygiene for the next agent
- **Never** force-push or rebase any of the codex/* branches without coordinating — they're owned by another agent.
- Before deleting a "merged" branch, search `git log origin/main` for the commit subject — squash merges rewrite the SHA, so `git branch --merged` won't find them.
- If you reconcile this list (e.g. delete superseded branches), update this section in the same commit — leaving a stale audit is worse than no audit.

## Pending Actions
1. ~~**Apply page_visits migration**~~ — DONE. `bids.page_visits` is live; homepage Quick Access reads from it.
2. ~~**Extend page tracking to module clients**~~ — DONE (PR #359, 2026-05-20). `usePageTracking` hook in `src/hooks/usePageTracking.ts` is called from all 49 top-level module clients. HomeClient's pre-existing inline `track-visit` effect was replaced by the hook in the same PR to avoid double-tracking.
3. ~~**RMA Credits thumbnails**~~ — DONE. `GET /api/credits/[id]/images` exists, `CreditsClient.tsx` has an inline expandable `ImagesPanel` with upload + presigned-URL viewing per CM.
4. **Purchasing workflow gaps**: Before building, verify tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('purchasing_tasks','purchasing_approvals','purchasing_notes','purchasing_exceptions')` — if found, build PO notes API, exceptions view, approval workflow
5. ~~**Suggested Buys**~~ — REBUILT 2026-05-26 (PR #384). The original PPO-based viewer described here (rollup chips, primary-mismatch filter, etc. landed in PR #360) was entirely replaced by a new view over the LiveEdge replenishment engine. The Agility `agility_suggested_po_*` data was confirmed unactionable for Beisser's mix; LiveEdge now owns the planning policy via `bids.item_planning`. See the "Buyer Workspace & Replenishment Engine (2026-05-22 → 2026-05-26)" section for the current architecture. The old `/api/purchasing/suggested-buys` and `/api/purchasing/suggested-buys/[ppo_id]` routes were deleted in the same PR.
6. **Flask sunset**: DNS cutover + archive `C:\Users\amcgrean\python\wh-tracker-fly\WH-Tracker` after user testing confirms parity
7. **County parcel loaders — MOVED TO PI (2026-05-20)**: Polk + Dallas now loaded on the Pi (see "Geocoding Pipeline" section above). Remaining: **Johnson County** loader — REST at `https://gis.johnsoncountyiowa.gov/arcgis/rest/services/LandRecords/Land_Records/MapServer` (layers 4 + 9), same template as Polk. Expected uplift ~560 customers. Owner: **Pi agent** (`C:\Users\amcgrean\python\api`). The TS loaders in `scripts/load-*.ts` are inert reference only; build the Python version in beisser-api's `scripts/`.
8. **4th-tier fuzzy matcher (highest single-uplift remaining)**: Add a fuzzy fallback to `agility_api/geocoder_sqlite.py` that strips leading/trailing directionals from `street_norm` and retries the city/zip lookup. Tag as `sqlite_fuzzy_dir` so the relaxation is visible in `geocode_source`. Keep it gated on city OR zip-3 corroboration to avoid re-introducing the wild-misplacement bug. Expected uplift: ~1,500–2,500 rows currently blocked on direction-prefix mismatches (e.g. customer "613 Grimes St" vs atlas "613 E Grimes St").
10. ~~**Audit other `qty_ordered * price` usages and swap to `extended_price`**~~ — DONE (2026-05-27). All three confirmed-broken routes fixed: `app/api/sales/orders/[so_number]/route.ts`, `app/api/dispatch/orders/[so_number]/lines/route.ts`, `app/api/warehouse/orders/[so_number]/route.ts`. Both server-side SQL SELECTs and client-side `lineTotal` math updated. Spot-check against Agility "Ext" column to verify.
11. **Hubbell daily check ingest** (Phase 3a/b/d LIVE 2026-05-21): Migration 0026 applied. Server-side write endpoints (`POST /api/admin/hubbell/checks/upload`, rewritten `/payments/import`) and read endpoints (`GET /api/hubbell/docs`, `GET /api/hubbell/checks`) all live. Phase 3c (Pi `hubbell_daily_checks.py` scraper) is owned by the PC/test agent — needs to be built and deployed to `/home/api/hubbell/` on the Pi. Phase 3e (`ALTER SCHEMA bids.hubbell_* → hubbell`) deferred until PC scripts retire. See the Hubbell PO/WO Daily Ingest section above for full detail.
12. ~~**Apply 0027_report_subscriptions migration**~~ — DONE (2026-05-22). `bids.report_subscriptions` + `bids.report_subscription_log` are live. Hourly `/api/cron/report-subscriptions` cron is now sweeping. See "Report Email Subscriptions" section below.
13. ~~**Perf — god-file splits (deferred from PR #386)**~~ — DONE (2026-05-27). `PodPhotoViewer` extracted to `src/components/dispatch/PodPhotoViewer.tsx` and `StopTimeline` to `src/components/dispatch/StopTimeline.tsx`. `DispatchClient.tsx` calls both via props. No state or fetching logic moved — pure presentational extraction. `ForecastClient.tsx` (1096), `ManageBidClient.tsx` (972), `TopNav.tsx` (956) still lower priority — only touch if forced by a feature change. Skip `TakeoffCanvas.tsx` (988) — it has an active bug-fix branch.
14. ~~**Perf — cache audit on remaining ERP routes**~~ — DONE (2026-05-27). Full audit of all `getErpSql()` / `getErpDb()` callers completed. **Wrapped in `erpCache`**: `fetchSalesReports` (`src/lib/sales/reports-query.ts`), `fetchDeliveryReport` (`src/lib/ops/delivery-reporting-query.ts`), `fetchPickerStats` (new `src/lib/warehouse/picker-stats-query.ts`). **Deliberately NOT cached** (real-time operational data that refreshes every 30–60s): `/api/dispatch/init` (route/stop/truck assignments change as dispatchers manage the board), `/api/dispatch/kpis` (same), `/api/dispatch/deliveries` (driver stop status changes as deliveries happen), `/api/supervisor/pickers` (30s refresh, real-time picker status), `/api/work-orders/open` (assignment status changes in real-time), `/api/warehouse/stats` (warehouse board 60s refresh, open pick counts). Don't reopen unless a confirmed performance complaint surfaces on one of those routes.
15. **Perf — `revalidateTag` taxonomy**: split the single `'erp'` tag into per-domain tags (`erp:scorecard`, `erp:home`, `erp:sales-hub`, etc.) once a real "stale dashboard after my own write" complaint surfaces. Currently three invalidation call sites, all in `app/management/rebates/actions.ts`. Adding finer tags lets bid/design/service mutations invalidate just the affected cache instead of nuking everything. Don't build speculatively.
16. ~~**Perf — UOM `$` audit (consolidates with item 10)**~~ — DONE (2026-05-27, same PR as item 10).
17. **Replenishment follow-ups** (2026-05-26): all 7 phases of the buyer-workspace plan shipped. Four follow-ups intentionally deferred and documented at `docs/agent-prompts/replenishment-handoff-2026-05-26.md` in leverage order: (a) daily engine-output snapshot table → unlocks sparklines + delta-since-yesterday on workspace hero tiles, (b) per-row unit cost on engine output → unlocks `estimatedValue` + supplier $ rollup on Buy Now tile, (c) `qty_on_hand` sync health investigation (operational, not code — 16/1366 stocked items at 20GR had positive QOH at build time), (d) item scorecard Replenishment card surfacing live engine output alongside override state. **Don't build speculatively** — wait for a real complaint after the user spends time with the live system.

## Buyer Workspace & Replenishment Engine (2026-05-22 → 2026-05-26)

LiveEdge-owned replenishment policy + a SQL engine that drives Suggested Buys, Potential Outages, and the rebuilt Buyer Workspace dashboard. The whole plan and the resolved design decisions live at **`docs/buyers-workspace-plan-2026-05-22.md`**.

**Why this exists:** Agility's `agility_suggested_po_*` (Suggested POs) and per-item min/max fields don't produce actionable suggestions for Beisser's mix — especially Millwork. LiveEdge owns the planning policy (`bids.item_planning`) and uses Agility purely as the source of truth for stock, demand, supply, lead times, and minimums.

### Schema

- **`bids.item_planning`** (migration 0028) — sparse per-`(system_id, item_code)` override row. All policy fields nullable so a row can carry just one override. Columns: `min_on_hand`, `target_on_hand`, `safety_stock_days`, `usage_window_days`, `seasonality_factor`, `seasonality_profile` (jsonb 12-month multipliers), `pack_qty`, `preferred_supplier`, `is_critical`, `category` (`millwork|lumber|siding|shingles|trim|decking|windows|doors|other`), `is_paused`, `notes`, `source` (`manual|csv_import|admin_suggestion`).
- **`bids.branch_planning_defaults`** (migration 0028) — one row per `system_id` with `usage_window_days` (default 90), `safety_stock_days` (default 7), optional `seasonality_profile`. Engine falls back here when an item has no override, then to hardcoded defaults.
- **`bids.movement_notes`** (migration 0030) — one row per `(system_id, item_code, week_starting)` for buyer-written annotations on velocity-changing SKUs (e.g. "Spring framing rush"). Surfaces in `/purchasing/movement` and the workspace's Recent Movement tile.

### Engine

`src/lib/purchasing/replenishment.ts` — one CTE-based query reads on-hand, usage, open demand, open supply, lead times, and overrides, then emits per-item severity + suggested qty. **Severity thresholds (lead-time-driven)**:

- **red** = `coverage_days <= lead_time_1` (will OOS before next PO can land)
- **amber** = `coverage_days <= lead_time_1 + safety_stock_days`
- **yellow** = `coverage_days <= lead_time_1 + safety_stock_days + 14`
- **green** = otherwise (items breaching `min_on_hand` without usage history go amber)

`suggested_qty = max(min_ord_qty, ceil(gap / pack_qty) * pack_qty)` where gap = `target_on_hand` (if set) − effective on hand, else `(lead+safety+14) days of demand` − effective on hand.

**Perf — single-branch query ~270ms with the two indexes in migration 0029:**
- `idx_csf_branch_item_date` — drives the per-item usage LATERAL subquery (index-only scan with `qty_shipped` INCLUDE).
- `idx_agility_suppliers_trimmed_key` — expression index `(TRIM(supplier_key), ship_from_seq)` so the supplier-name join in the outer SELECT uses an index lookup.

Before optimization the same query ran 18s — beware of pulling the supplier-name join back into `supplier_rules`, the optimizer can't push the `system_id`/`item_ptr`/`is_primary` predicates through it.

### Movement engine

`src/lib/purchasing/movement.ts` — 7-day vs trailing-30-day `qty_shipped` per `(branch_id, item_number)` from `customer_scorecard_fact`. Filters items where prior daily ≥ 0.25 (avoids enormous % from near-zero baselines) and `|pct change| >= min_pct` (default 25). Joins `bids.movement_notes` for the latest annotation per item.

### API surface

```
GET  /api/purchasing/replenishment              ?view=suggested|outages|all &branch &category &supplier &critical &q &limit
GET  /api/purchasing/workspace                  six-feed aggregator for /purchasing/workspace
GET  /api/purchasing/movement                   ?direction=up|down|all &min_pct &branch
GET  /api/purchasing/movement/notes             list (filter by branch and/or item)
POST /api/purchasing/movement/notes             upsert by (sys, item, week)
DELETE /api/purchasing/movement/notes?id=…      delete

GET    /api/admin/item-planning                 list with filters
POST   /api/admin/item-planning                 create override
GET    /api/admin/item-planning/[id]
PATCH  /api/admin/item-planning/[id]            partial update
DELETE /api/admin/item-planning/[id]
GET    /api/admin/item-planning/template        CSV download
POST   /api/admin/item-planning/import          CSV upsert by (sys, item)
GET    /api/admin/branch-planning-defaults      all branches with synthesized defaults
PUT    /api/admin/branch-planning-defaults      upsert by systemId
```

Branch resolution: `purchasing.view` users without `branch.all` get pinned to `session.user.branch`. `branch.all` users may pass `?branch=ALL` (or omit) for company-wide aggregation.

### Pages

- **`/purchasing/workspace`** — full redesign matching the Claude Design handoff (bundle at `docs/agent-prompts/buyer-workspace-dashboard-design.md`). Six tiles: Buy Now (hero green) · Outage Risk (hero red) · Overdue POs · Pending Check-Ins · PO Exceptions · Recent Movement. Quick Actions strip below. Sticky branch selector + live as-of indicator. One fetch to `/api/purchasing/workspace`.
- **`/purchasing/suggested-buys`** — rebuilt on the engine. Grouped by supplier so a buyer can assemble one PO per vendor. CSV export.
- **`/purchasing/outages`** — sorted by days-to-zero, critical items called out. Per-branch breakdown card for `branch.all` users.
- **`/purchasing/movement`** — table of velocity-changing items with inline modal note editor.
- **`/admin/item-planning`** — full CRUD for overrides + CSV template download + import. Branch Defaults modal.
- **`/scorecard/product/item/[itemCode]`** — gained a "Replenishment" card (PR #397, 2026-05-26) showing per-branch override state for the item. Inline edit modal opens for users with `admin.config.manage`; others get a read-only view + deep link to `/admin/item-planning?q=<item>`.

### Pages NOT updated and intentional gaps

- **Sparklines on the workspace hero tiles** — design accommodates them but they need a daily snapshot of the engine output (a 14-day trend table). Code paths render only when `spark[]` is non-empty, so dropping a snapshot table later wires them in automatically. Same for `deltaYesterday` / `deltaWeek` on every tile — currently always 0.
- **`estimatedValue` on Buy Now + `value` on supplier rollup** — the engine doesn't track per-row unit cost. Wire-up requires joining unit-cost data per item into the engine row (one new LATERAL or pre-aggregated view). Returns 0 today; UI conditionally hides the dollar columns.
- **Price-variance exceptions** — `byKind.priceVariance` returns 0 because PO-cost vs invoice-cost diff isn't derivable from mirror tables. Would need an invoice-vs-PO-cost feed.
- **Pending Check-Ins `total_lines` / `with_discrepancy`** — `bids.po_submissions` carries no per-line data. `total_lines` returns 0; `with_discrepancy` uses `priority='high'` as a proxy. Real per-line tracking is a separate scope.
- **Quick Actions: New PO** is disabled with a "coming soon" hint. SKU lookup routes to `/sales/products`. Receive shipment was removed from the strip — `/purchasing` (PO Check-In) covers that path.

### Data quality flag (not a bug in this code)

On 20GR, only **16 of 1366 stocked-active items** had positive `qty_on_hand` at the time the engine was built. The engine is correct given that input; most items will surface as red/amber until the QOH sync is healthier. Investigate the ERP→`agility_item_branch.qty_on_hand` sync separately if the volume of red rows feels wrong.

### Capability matrix

| Capability | Effect |
|---|---|
| `purchasing.view` | Read `/purchasing/workspace`, `/suggested-buys`, `/outages`, `/movement`, all replenishment + movement APIs |
| `branch.all` | Cross-branch view in all of the above (admin / lead buyer) |
| `admin.config.manage` | Write item planning overrides + branch defaults via `/admin/item-planning` or the inline editor on the item scorecard |
| `sales.view` | Read item scorecard (which surfaces the Replenishment card) — no editing |

### Where to look next

- `docs/buyers-workspace-plan-2026-05-22.md` — the original plan + resolved design decisions
- `docs/agent-prompts/buyer-workspace-dashboard-design.md` — the brief that produced the Claude Design handoff
- `docs/agent-prompts/replenishment-handoff-2026-05-26.md` — most recent handoff with state + immediate follow-ups

## Report Email Subscriptions (2026-05-22)

Users can subscribe to three reports for email delivery (daily / weekly / monthly, PDF or Excel). All sends go through Resend. Self-service only — each user manages their own subscriptions.

**Subscribable reports (the registry is the source of truth — `src/lib/reports/registry.ts`):**
- `sales-reports` (`/sales/reports`) — KPIs · daily series · top customers · sale-type & status breakdowns
- `delivery-reports` (`/ops/delivery-reporting`) — KPIs · daily series · per-branch breakdown · by-ship-via · detail (Excel only)
- `scorecard-overview` (`/scorecard/overview`) — 3-year comparison · KPIs · branch breakdown (skips product-mix/sale-type drill tables intentionally — interactive-only)

**Architecture:**
- `bids.report_subscriptions` — one row per (user, report, params, cadence). `next_run_at` indexed for the cron sweep.
- `bids.report_subscription_log` — one row per send attempt (status, error, resend_message_id, duration_ms).
- Hourly Vercel cron at `/api/cron/report-subscriptions` (in `vercel.json`) picks active subscriptions where `next_run_at <= now()`, renders, sends, advances. `BATCH_LIMIT=100` per tick. Per-subscription failures are isolated (Promise.allSettled).
- Schedule math in `src/lib/reports/schedule.ts` is timezone-aware (Intl.DateTimeFormat-driven offset lookup; correctly handles DST transitions). `computeNextRunAt()` is the only place that decides "when next".
- PDF render uses **jspdf + jspdf-autotable** — banner header, KPI tiles, simple bar chart, jspdf-autotable tables. No headless browser. Helpers in `src/lib/reports/pdf.ts`.
- Excel render uses **exceljs** — one "Summary" sheet + one sheet per breakdown. No charts in v1 (raw tables only). Helpers in `src/lib/reports/excel.ts`.
- Email send wraps the raw-fetch Resend pattern at `src/lib/email/send-report.ts`. Standard branded HTML body via `buildReportEmailHtml()`. From-address: `LiveEdge Reports <noreply@app.beisser.cloud>` (overridable via `REPORTS_EMAIL_FROM`).
- Data fetch is **shared with the live API routes** — `src/lib/sales/reports-query.ts` and `src/lib/ops/delivery-reporting-query.ts` were extracted from their respective `route.ts` files; both the route and the digest call the same function. Scorecard digests reuse the existing `fetchAggregateKpis` / `fetchAggregateThreeYear` / `fetchBranchSummaries` helpers from `src/lib/scorecard/queries.ts`.

**Key files:**
- `src/lib/reports/registry.ts` — `REPORT_KEYS`, per-report zod param schemas, descriptors with capability + page path. **Add new reports here.**
- `src/lib/reports/dispatch.ts` — `renderDigest(key, params, format, generatedAt)` — central switch. New digest = add a case here.
- `src/lib/reports/digests/{sales-reports,delivery-reports,scorecard-overview}.ts` — per-report digest renderers (fetch + render PDF/Excel).
- `app/api/report-subscriptions/route.ts` + `[id]/route.ts` — CRUD (self-scoped; can't see or edit other users' subs).
- `app/api/cron/report-subscriptions/route.ts` — the hourly sweep. Auth via `verifyCronSignature()`.
- `src/components/reports/SubscribeButton.tsx` + `SubscriptionModal.tsx` — UI dropped into the three report pages. Pass `reportKey`, `reportLabel`, current `params`, and a `paramsSummary` string.
- `app/account/subscriptions/` — manage-all page (pause / edit / delete, linked from the user dropdown in `TopNav.tsx`).

**Adding a new subscribable report:**
1. Add the key to `REPORT_KEYS` + a descriptor (with param schema + capability) to `REPORTS` in `registry.ts`.
2. Create `src/lib/reports/digests/<key>.ts` exporting a `render*Digest({ params, format, generatedAt })` function that returns `{ buffer, filename, mimeType, highlights, rangeLabel, isEmpty }`.
3. Add a case to `renderDigest()` in `dispatch.ts`.
4. Drop `<SubscribeButton reportKey="..." reportLabel="..." paramsSummary="..." params={...} />` into the report page client.

**Env vars added:**
- `REPORTS_EMAIL_FROM` (optional, defaults to `LiveEdge Reports <noreply@app.beisser.cloud>`)
- `REPORTS_EMAIL_CONSOLE` (optional, dev only; `true` prints sends to server console instead of failing on missing `RESEND_API_KEY`)
- Reuses existing `RESEND_API_KEY` + `CRON_SECRET` + `NEXT_PUBLIC_APP_URL`.

**Intentionally NOT subscribable in v1** (per plan — interactive-only drill-downs):
- Branch / customer / rep / product / vendor scorecard pages. Revisit only when a real user asks.

## Takeoff Debugging (in progress, 2026-04-14)

Branch: `claude/debug-taokeoff-errors-NngpH` (merged to `main`)

### Fixes landed on main
| Commit | Fix |
|--------|-----|
| `3b3e648` | Upload error banner, manifest icon 404 |
| `003283f` | Existing-session PDFs now recover via `legacyBidFile` fallback in `/api/takeoff/sessions/[id]/pdf`; client prefers mode=url (direct R2 fetch) over mode=download |
| `7e6a770` | Replaced `next/dynamic({ ssr:false })` with hand-rolled mount gate in `TakeoffWorkspaceLoader` — fixes React #418 text-node hydration mismatch |
| `14c6f38` | Wheel listener switched to capture phase with `stopPropagation` |
| `0eb55fc` | `TakeoffCanvas` root changed from `relative flex-1` → `absolute inset-0` (parent wasn't `display:flex`, so `flex-1` was a no-op and container collapsed to content height, leaving a 240px dead zone where wheel events didn't reach the listener). Also added Fabric `mouse:wheel` backup listener. |
| `4b725db` | Preset tool activation (type normalization `'polyline'↔'linear'`, `'polygon'↔'area'`) + default fit-to-page zoom via `zoom:0` sentinel + explicit fit in `renderCurrentPage` |

### Infra action already taken
- **R2 CORS configured** by user in Cloudflare dashboard to allow `https://app.beisser.cloud` for PUT/GET/HEAD.

### Open bugs — next agent should tackle in order

1. **Scroll/pan still not working without a markup selected** (primary). User reports: wheel-zoom only works while a Fabric object is selected. When nothing selected, wheel does nothing. The layout fix (`0eb55fc`) and capture-phase listener should have resolved it but haven't. Next steps:
   - Ask user to open DevTools on `/takeoff/[sessionId]` on app.beisser.cloud, scroll, and report: (a) any console errors, (b) computed dimensions of `div.takeoff-canvas` vs its parent, (c) element under cursor (`document.elementFromPoint`) when scrolling.
   - Hypothesis to verify: `div.takeoff-canvas` has `pointer-events: none` or is being covered by a sibling with higher z-index when no selection exists.
   - Consider attaching wheel listener at `document` or `window` level with a descendant check, bypassing any layering issues.

2. **PDF canvas may not fully stretch**. Playwright test (done locally, not in CI) showed `pdf-canvas` sizing to 300×150 (canvas default intrinsic) despite `absolute inset-0`. After `renderPage` sets `canvas.width/height` to viewport dims, behavior may differ. Verify in real browser and add explicit `style={{ width: '100%', height: '100%' }}` on the canvas elements if needed.

3. **Default viewport scale = 1/4"=1'** (feature ask, not a bug). User wants new viewports to default-calibrate to 1/4" scale. Currently they're created uncalibrated. See `src/components/takeoff/ScaleCalibration.tsx` + `src/lib/takeoff/calculations.ts` for scale presets. Likely fix: auto-set `pixelsPerUnit` + `scaleName` when a viewport is first created in `TakeoffCanvas.tsx` viewport tool handler.

### Debugging tooling available locally
- Playwright + headless Chromium are installed: `/opt/pw-browsers/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell`. Useful for DOM-level wheel-event and layout repros. Example pattern:
  ```js
  import { chromium } from 'playwright';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/...' });
  // serve node_modules over http so you can `import { Canvas } from '/fabric/dist/index.mjs'`
  ```
  This lets you test the exact Fabric v7 DOM reshuffle behavior without running the full Next.js app. Past test confirmed capture-phase wheel listener fires correctly when container fills its parent.

### Key files for takeoff work
- `app/takeoff/[sessionId]/page.tsx` — async server component, auth gate
- `app/takeoff/[sessionId]/TakeoffWorkspaceLoader.tsx` — manual mount gate (replaces `next/dynamic`)
- `app/takeoff/[sessionId]/TakeoffWorkspace.tsx` — workspace shell, PDF load/upload, layout
- `src/components/takeoff/TakeoffCanvas.tsx` — dual-canvas (pdfjs + Fabric), wheel/pan/zoom, tool handlers
- `src/hooks/useMeasurementReducer.ts` — state shape, `SET_ACTIVE_PRESET` tool mapping
- `src/hooks/useTakeoffSession.ts` — session load/save, group-type normalizer
- `src/lib/takeoff/fabricHelpers.ts` — `initFabricCanvas`, `setCanvasZoom`, `panCanvas`
- `src/lib/takeoff/pdfLoader.ts` — pdfjs-dist v5 worker setup
- `src/lib/r2.ts` — R2 presigned URL helpers (CORS docs in header comment)
- `app/api/takeoff/sessions/[sessionId]/pdf/route.ts` — PDF download/URL endpoint with `legacyBidFile` fallback
- `app/api/takeoff/sessions/[sessionId]/upload/route.ts` — GET presign, POST proxy (4.5MB limit), PUT confirm
- `app/api/legacy-bids/[id]/start-takeoff/route.ts` — seeds presets with correct `type` values now

## Agility Live API (DMSi AgilityPublic REST)

Separate from the `agility_*` mirror tables — this is a direct REST client to the DMSi AgilityPublic API (v619) for write-back operations and live lookups that can't wait for the sync.

### Client
`src/lib/agility-api.ts` — singleton `agilityApi` exported. POST-based RPC; sessions cached per-branch in module memory (3.5h TTL, auto re-login on expiry or 401).

**Env vars required:**
- `AGILITY_API_URL` — full base URL e.g. `https://api-1390-1.dmsi.com/AgilityPublic/rest/`
- `AGILITY_USERNAME` — must include company domain suffix e.g. `leapi.beisser` (NOT `leapi`)
- `AGILITY_PASSWORD`
- `AGILITY_BRANCH` — default branch code (optional, falls back to login default)

**Branch map:** `BRANCH_MAP` in `agility-api.ts` — all four Beisser branches use identity mapping (`10FD→10FD`, `20GR→20GR`, etc.). Verified via BranchList.

### Methods on `agilityApi`
| Method | Agility Service/Method | Used by |
|--------|------------------------|---------|
| `itemPriceAndAvailability()` | `Inventory / ItemPriceAndAvailabilityList` | `/api/erp/price-check` |
| `salesOrderCreate()` | `SalesOrder / SalesOrderCreate` | `/api/legacy-bids/[id]/push-to-erp` |
| `salesOrderCancel()` | `SalesOrder / SalesOrderCancel` | `/api/sales/orders/[so_number]/push-to-erp` |
| `quoteCreate()` | `SalesOrder / QuoteCreate` | `/api/legacy-bids/[id]/push-to-erp` |
| `quoteRelease()` | `SalesOrder / QuoteRelease` | `/api/legacy-bids/[id]/promote-quote` |
| `podSignatureCreate()` | `Dispatch / PODSignatureCreate` | `/api/dispatch/orders/[so_number]/pod` |
| `shipmentInfoUpdate()` | `Dispatch / ShipmentInfoUpdate` | `/api/dispatch/orders/[so_number]/deliver` |
| `purchaseOrderGet()` | `Purchasing / PurchaseOrderGet` | `/api/purchasing/pos/[po]/live` |
| `pickFileCreate()` | `Warehouse / PickFileCreate` | `/api/warehouse/orders/[so_number]/release-pick`, `/api/warehouse/picks/create-pick-file` |
| `customerOpenActivity()` | `Customer / CustomerOpenActivity` | `/api/sales/customers/[code]/ar-live` |
| `fetchBranchList()` | `System / BranchList` | admin test only |
| `fetchVersion()` | `System / AgilityVersion` | admin test only |
| `call()` | generic passthrough | `/api/sales/orders/[so_number]/push-to-erp` |

Methods built but not yet wired to routes: `salesOrderList`, `salesOrderCreateValidate`, `shipmentsList`, `itemsList`, `customersList`, `customerBilltoBalancesList`, `dispatchGet`, `purchaseOrderCreate`.

### Agility API vs Mirror Table Usage Pattern
**Rule of thumb — confirmed 2026-04-17:**
| Data type | Use | Reason |
|-----------|-----|--------|
| Stable profile data (customer detail, addresses, SO history) | Mirror tables (`agility_*`) | Fast, no external dep, denormalized |
| Time-sensitive AR balance / open invoices | Live API (`customerOpenActivity`) | Balance changes in real-time |
| All write-back / mutations | Live API | Must write to source of truth |
| Real-time price & availability | Live API (`itemPriceAndAvailability`) | Inventory changes constantly |

Do **not** add new read routes against the Agility live API just to avoid the mirror tables — the mirror tables are the correct read layer for stable ERP data.

### AR Data Policy
AR balance and accounting data is **intentionally excluded from all operational screens** (dispatch, picking, warehouse, sales customer list). It belongs in a dedicated accounting/credit view that has not been built yet.

- `/api/sales/customers/[code]/ar` — mirror table AR detail. Preserved, not surfaced in UI.
- `/api/sales/customers/[code]/ar-live` — live Agility AR + mirror fallback. Preserved, not surfaced in UI.
- `customerBilltoBalancesList()` — built in `agility-api.ts`, unwired. Wire alongside `customerOpenActivity` when building the accounting view.

When the accounting AR view is built, add it under a dedicated route (e.g. `/accounting` or `/admin/ar`) — do **not** re-add AR data to dispatch or picking views.

### Admin Connectivity Routes
- `GET /api/admin/agility/status` — checks env var presence, no network call
- `POST /api/admin/agility/test` — live 4-step test: Login → Version → BranchList → Logout. Accepts optional `{ branch: "20GR" }` body.

### Helper
`paginateAll<T>()` exported from `agility-api.ts` — pages through list responses automatically using `RecordCount` + `StartingRecord` pattern common across Agility list methods.

## API Route Patterns
- **Legacy tables**: Import from `'<relative>/db/schema-legacy'`, use `legacyBid`, `legacyCustomer`, etc. (all now in `bids` schema — queries work transparently via Drizzle)
- **New tables**: Import from `'<relative>/db/index'` as `{ getDb, schema }`
- **ERP queries** (read from mirror tables): Import from `'<relative>/db/supabase'` as `{ getErpDb }`
- **Agility live API** (write-back + live lookups): `import { agilityApi } from '@/lib/agility-api'`
- **Auth**: `import { auth } from '<relative>/auth'`
- **Branch context**: `import { getSelectedBranchId } from '@/lib/branch-context'`
- API route `params` in Next.js 15 are `Promise<{ id: string }>` — must `await params`

## Tech Stack
- Next.js 15.1 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3.4 (dark theme; `cyan-*` remapped to Beisser green #006834; `gold-*` custom palette #9e8635)
- Drizzle ORM + Supabase Postgres (`bids` schema, postgres.js driver)
- Supabase Postgres (ERP reads via `public` schema, same instance)
- Cloudflare R2 (file storage via @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner)
- NextAuth v5 beta (credentials provider, JWT strategy)
- pdfjs-dist 5.6, fabric 7.x (NOT v6 — mouse event API differs), jspdf 2.x
- Recharts 2.15 (route-scoped, ~95 KB gz; SVG-based for crisp printing) — wrappers in `src/components/charts/`
- Lucide React icons, papaparse, zod, date-fns

## Environment Variables

### Database / Auth
- `BIDS_DATABASE_URL` — Supabase direct connection string (port 5432, **not** pooler 6543). Primary app DB. Currently not set; app uses `POSTGRES_URL_NON_POOLING` via Vercel Supabase integration.
- `POSTGRES_URL_NON_POOLING` — Vercel Supabase integration direct URL (active primary connection)
- `POSTGRES_URL` — Vercel Supabase integration pooled URL (last resort fallback)
- `AUTH_SECRET` — NextAuth secret

### Storage
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret
- `R2_BUCKET_NAME` — R2 bucket name (defaults to `bids`)
- `CRON_SECRET` — Bearer token for cron endpoint auth

### Samsara GPS (WH-Tracker modules — all set in Vercel as of 2026-04-02)
- `SAMSARA_API_TOKEN` — Samsara fleet API token
- `SAMSARA_BRANCH_TAGS_JSON` — JSON map of branch code → Samsara tag names array (e.g. `{"20GR":["grimes"],...}`)
- `SAMSARA_VEHICLE_BRANCH_MAP` — JSON map of Samsara vehicle ID → branch code (e.g. `{"281474997057684":"25BW",...}`)
- `SAMSARA_CACHE_TTL` — Vehicle location cache TTL in seconds (default 30; set to 15 in Vercel)

### Anthropic API (for AI-assisted Hubbell review)
- `ANTHROPIC_API_KEY` — Required for `POST /api/admin/hubbell/documents/ai-review`. Without it the endpoint 500s with "ANTHROPIC_API_KEY not configured". Uses Claude Opus 4.7 with PDF vision.

### Email / OTP
- `RESEND_API_KEY` — **Required.** Resend.com API key for sending sign-in codes. Without this nobody can log in.
- `OTP_EMAIL_FROM` — Sender address for OTP emails (defaults to `noreply@beisserlumber.com`)
- `OTP_APP_NAME` — App name shown in OTP emails (defaults to `Beisser LiveEdge`)
- `AUTH_OTP_CONSOLE` — Print OTP codes to server console instead of emailing (`true`/`false`). Use in local dev when Resend isn't configured.
- `SESSION_COOKIE_SECURE` — Secure flag on session cookie (`true` in prod, `false` in dev)

## Navigation Structure
Current structure as of 2026-05-26 (6 domain dropdowns + user dropdown; Design is inside Services):
- **Yard ▾**: Picks Board, Open Picks, Picker Stats, Work Orders, Supervisor (all `/warehouse/*` paths, label renamed from "Warehouse")
- **Dispatch ▾**: Dispatch Board, Delivery Tracker, Fleet Map
- **Sales ▾**: Sales Hub, Customers, Transactions, Purchase History, Products & Stock, Reports, RMA Credits
- **Services ▾**: Estimating App (`/estimating`), PDF Takeoff, **Bids** (tabbed hub at `/bids`), EWP, Projects, Design (6 items; bid list entries consolidated 2026-04-24)
- **Purchasing ▾**: Buyer Workspace, Open POs, Suggested Buys, Potential Outages, Recent Movement, Exceptions, Command Center, PO Check-In, Review Queue (Receiving merged in; the four bold entries land in the dropdown ordered as listed — see `src/components/nav/TopNav.tsx`)
- **Admin ▾** (admin role only): Customers, Products/SKUs, Formulas, Bid Fields, Users, Notifications, Item Planning, Audit Log, ERP Sync, Page Analytics, Delivery Report, Picker Admin
- **User dropdown** (under logged-in username + chevron): Report an Issue (`/it-issues`), Help & Docs (`/help`), Sign Out
- Component: `src/components/nav/TopNav.tsx`
- Single `openMenu: string | null` state + one `<nav>` ref for click-outside
- `isActive()` per domain handles path prefix matching
- `BRANCH_COLORS` constant maps branch codes to Tailwind color tokens; dot indicator always shown (no MapPin fallback)

## Mobile App — Driver POD (2026-05-28 → 2026-05-29) — PHASES 1–4 LIVE

New Expo SDK 54 React Native app at `mobile-app/` (top-level dir, intentionally independent from the Next.js web app). Built for Beisser delivery drivers to capture proof-of-delivery photos + mark deliveries from the field with full offline support. PRs #445 + #454 merged to main.

**Working today (dev mode only, no real backend yet):**
- 11 screens — Splash, Login, OTP, Branch picker, Route list, Delivery details, Camera, Customer sheet, Route complete, Sync queue, Profile
- Dev auth: any username + code `000000` (gated on `IS_DEV_MODE = !process.env.EXPO_PUBLIC_BACKEND_URL`)
- Persistent POD photos via `expo-file-system/legacy` to `documentDirectory/pod-photos/`
- AsyncStorage outbox with 5-attempt exponential backoff `[1s, 5s, 30s, 60s, 5m]`
- Sync engine triggers: NetInfo offline→online flip, outbox enqueue, 30s heartbeat
- Toast notifications, real online/offline state via `@react-native-community/netinfo`
- Real Sync Queue UI with Retry/Retry All (resets `attempts` to 0)/Discard
- Successful sync deletes photo files + outbox record (no disk leak)

**Architecture rules — preserve these in Phase 5+:**
- `src/storage/{outbox,sync,photoFS}.ts` are React-free — never import context into storage modules
- Token plumbing must go through a standalone `src/api/authToken.ts` module (Phase 5 to build) — AuthContext writes, dispatch/sync reads
- `EXPO_PUBLIC_*` env prefix is mandatory (Expo strips others from device bundles)
- Mobile and Next.js web TS configs are separated: root `tsconfig.json` excludes `"mobile-app"` so the Vercel build never typechecks RN code. **Don't remove that exclude** — RN globals (`global.__DEV__`) and modules (`expo-camera`, etc.) break Next.js typecheck.

**Phase 5 (real backend wiring) prompt:** `docs/agent-prompts/mobile-app-phase-5-real-backend.md` — self-contained, hand to next agent. Covers: new `/api/auth/mobile/verify-otp` JWT endpoint + Bearer middleware on web side, mobile token plumbing, `useDriverRoute()` hook + `routeMapper`, two-phase POD upload (presigned PUT → POST deliver) with resumable photo state. **Drivers may need `dispatch.view` capability granted** — verify via `ROLE_DEFAULTS` before Phase 5.

**Deferred features** (also noted in `mobile-app/README.md`): rich per-job site contacts table (Agility doesn't carry foreman/gate-code data; needs a new `job_contacts` table in LiveEdge web for estimators to fill in per SO), real maps, signature capture, barcode scan.

## Key Conventions
- Path alias: `@/*` → `./src/*`, `@/db/*` → `./db/*` (but API routes use relative paths for db imports)
- Legacy table column names match Flask/SQLAlchemy models exactly (e.g., `customerCode` not `customer_code`)
- All tables (new + legacy) are in the `bids` schema — Drizzle handles schema qualification transparently
- Admin customers page uses `legacyCustomer` (serial IDs), NOT `schema.customers` (UUID)
- `createdBy` omitted from takeoff session inserts (legacy serial user IDs incompatible with UUID FK)
- `general_audit.changes` is `jsonb` (not `text`) — Drizzle types it as `unknown`; cast or handle accordingly in consuming code
