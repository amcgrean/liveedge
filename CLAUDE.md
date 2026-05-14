# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, NextAuth v5). Used by sales staff/estimators at four Iowa lumberyard locations.

## Route Reference
Full API and page route inventory: **`docs/routes.md`** (last audited 2026-05-13; Hubbell email-ingest routes removed).

## Access Control — COMPLETE
Capability-based access control is fully rolled out (all 5 phases). See **`docs/access-control-plan.md`** for the full design, 28-capability vocabulary, and role-defaults table.

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

### ERP Table Layer — agility_* (2026-04-04)
All LiveEdge API routes now query the optimized `agility_*` tables instead of the old `erp_mirror_*` tables. **Never write new queries against `erp_mirror_*` — use `agility_*`.**

| agility_ table | Replaces | Key differences |
|----------------|----------|-----------------|
| `agility_so_header` | `erp_mirror_so_header` | Has `cust_name`, `cust_code`, `shipto_*` denormalized — no JOIN to customers/shipto needed. Missing `invoice_date`/`ship_date`/`terms` (now in `agility_shipments`). Date column is `created_date` (NOT `order_date`). Credit memos: `sale_type = 'Credit'`, open status = `'B'` (blank). |
| `agility_so_lines` | `erp_mirror_so_detail` | Has `item_code`, `handling_code` inline — no JOIN to items needed for most queries |
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
| `agility_item_supplier` | (new, 2026-05-13) | Item × supplier × ship-from purchasing rules. One row per `(system_id, supplier_key, item_ptr, ship_from_seq_num)`. **`is_primary` flags the primary supplier per item.** Carries `lead_time_1..5`, `lead_time_flag`, `min_ord_qty`/`min_pak` + their `*_disp_uom` + `min_*_violation` rules (`Allow` / `Allow - Question` / `Block`), `supp_uom`, `use_uom_for_{po_entry,printed_po,po_check_in,receiving}`. Join to items via `item_ptr` (NOT `item`), to suppliers via `(supplier_key, ship_from_seq → ship_from_seq_num)`. Trim `supplier_key` — source pads with leading spaces. |

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
- **Buyer Workspace** (`/purchasing/workspace`): quick-action cards + upcoming POs + recent check-ins
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

**Hubbell email ingest — REMOVED (2026-05-13).** The Resend webhook (`/api/inbound/hubbell`), Microsoft Graph dispatch branch, reprocess cron (`/api/cron/hubbell-reprocess`), admin reprocess endpoint (`/api/admin/hubbell/reprocess`), and source-agnostic `processHubbellEmail()` were all deleted. Email forwarding from Hubbell was unreliable. Going forward, PO/WO data is **scraped from the Hubbell portal locally** (same workflow already used for AR recon), normalized in a desktop tool, then **uploaded to LiveEdge via a forthcoming `POST /api/admin/hubbell/upload` endpoint** (not yet built — wire alongside `bids.hubbell_emails` insert path; reuse `extractEmailData()` is no longer needed since the local tool emits the structured fields directly). Existing `bids.hubbell_emails` rows + `bids.hubbell_email_candidates` + `bids.hubbell_address_cache` are preserved for history. Admin UI (`/admin/hubbell`, `/admin/hubbell/jobs`) and `hubbell.review` capability remain in place.

#### Nav Restructuring (2026-04-02) — COMPLETE, EXTENDED 2026-04-03
- TopNav completely rewritten 2026-04-03 — 8 domain dropdowns replacing flat links + 4 domain dropdowns
- Single `openMenu: string | null` state + single `<nav>` ref for click-outside (replaced per-domain refs)
- **Dispatch ▾**: Picks Board, Open Picks, Picker Stats, Work Orders, Supervisor, Dispatch Board, Delivery Tracker, Fleet Map
- **Sales ▾**: Sales Hub, Customers, Transactions, Purchase History, Products & Stock, Reports, RMA Credits
- **Estimating ▾**: Estimating App (`/estimating`), PDF Takeoff, Bids, EWP, Projects
- **Design** (direct link → `/designs`)
- **Service** (direct link → `/it-issues`)
- **Purchasing ▾**: Buyer Workspace, Open POs, Command Center
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

#### Hubbell PO/WO Reconciliation (2026-04-22, ingest switched 2026-05-13)

Admin tool for reconciling Hubbell supply-house POs / WO acknowledgements against LiveEdge sales orders.

**Ingest path (current — local portal scrape + upload):**
- Email ingest (Resend webhook + Graph dispatch + reprocess cron) was removed 2026-05-13 — see "Hubbell email ingest — REMOVED" note above
- PO/WO data is scraped from the Hubbell portal locally (same flow already used for AR recon), normalized, then **uploaded into `bids.hubbell_emails`** by a local tool
- Upload endpoint **not yet built**. When wiring: accept a batch of pre-normalized records (the local tool emits `poNumber`, `woNumber`, `address`, `city`, `state`, `zip`, `amount`, …), insert into `bids.hubbell_emails` with `messageId = NULL`, then run the same priority-1 PO-field match → priority-2 address cache → fallback address-matcher pipeline that the old webhook used (logic still lives in `src/lib/hubbell/{extractor,address-matcher,address-cache}.ts`)

**Pages (unchanged):**
- `/admin/hubbell` — Inbox: tabbed by match status (Pending / Matched / Confirmed / No Match / Rejected), paginated at 50/page, search by subject/sender/PO#/SO#
- `/admin/hubbell/[id]` — Detail: extracted data, match candidates sorted by confidence, confirm/reject/reset actions
- `/admin/hubbell/jobs` — Jobs index: one row per job site (customer + address), aggregates all confirmed records; paginated at 50/page; click row to view orders
- `/admin/hubbell/jobs/[soId]` — Job detail: SO header, reconciliation table (all SOs at same address vs records received), unmatched warnings

**API routes (remaining):**
- `GET /api/admin/hubbell/emails` — paginated inbox with status/search filtering
- `GET/POST /api/admin/hubbell/emails/[id]` — detail + confirm/reject/reset actions
- `GET /api/admin/hubbell/jobs` — aggregated jobs list
- `GET /api/admin/hubbell/jobs/[soId]` — per-SO detail with related SOs and records

**DB table:** `bids.hubbell_emails` (Drizzle-managed, `db/schema.ts`) — name is historical; rows now come from the local uploader, not email. `bids.hubbell_email_candidates` + `bids.hubbell_address_cache` still used by the matcher.

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

#### Geocoding Pipeline (2026-04-30 → 2026-05-01) — IN PROGRESS

Customer ship-to addresses (`public.agility_customers.address_1/city/state/zip`)
get matched against `public.geocode_index` to populate `lat`/`lon` for
dispatch/routing. Nightly cron at `/api/cron/geocode-nightly` walks unmatched
rows in batches; fixes today brought total geocoded customers from **76,538 →
~89,000+**.

**How it fits together:**
- `src/lib/geocode.ts` — shared `normalizeAddress()` + junk-address detection
  used by BOTH the loader (writes `geocode_index`) and the runner (matches
  customers). Loader/matcher MUST agree on normalization or matches miss.
- `src/lib/geocode-runner.ts` — `runGeocodeBatch()` (3-tier match: city → zip →
  state-unique) + `loadOpenAddresses()` (the OpenAddresses IA statewide
  refresh).
- `app/api/cron/geocode-nightly/route.ts` — orchestrates: refresh OA index if
  empty / >28 days old, then loop `runGeocodeBatch` until no progress for 5
  consecutive batches OR queue empty OR 60s budget exhausted.
- `geocode_index` columns: `(number_norm, street_norm, city_norm, state_norm,
  postcode, lat, lon, source, source_hash)`. Unique partial index on
  `(source, source_hash) WHERE source IS NOT NULL AND source_hash IS NOT NULL`
  for idempotent re-loads.

**Source tag convention:** `<provider>_<state>_<dataset>` —
`openaddresses_us_ia_statewide_<jobid>`, `polk_county_ia_atlas`,
`dallas_county_ia_parcels` (tbd), etc. The runner reports tier names
(`openaddresses_city/zip/state_unique`) on `agility_customers.geocode_source`,
NOT the upstream data source — to find which loader provided a match,
join on lat/lon (within ~0.0001°).

**Recent fixes (PRs):**
- **#204** — `runGeocodeBatch` was stuck on the first 500 IDs forever because
  unmatched rows kept their `geocode_source = 'failed'` status and
  re-appeared. Fix: order candidates by `geocoded_at ASC NULLS FIRST, id`
  and bump `geocoded_at` on attempted rows. Also normalize `STREET_TYPE
  DIRECTION` patterns at second-to-last position (`"DRIVE SE" → "DR SE"`).
- **#205** — first fix only bumped `geocoded_at` on rows that passed
  `normalizeAddress()`; non-parseable rows (e.g. `"Highway 80 Lot 5"`)
  kept old timestamps and choked the queue. Now bumps every candidate.
- **#211** — re-normalize the existing 74,580 OA index rows in-place to
  match the new `STREET_TYPE DIRECTION` collapse rules. Per-street-type
  UPDATEs (one combined CTE timed out at 60s on 74K rows). Migration:
  `db/migrations/0015_geocode_index_renormalize.sql`. Already applied.
- **#217** — Polk County IA atlas loader. Pulls
  `https://atlas.polkcountyiowa.gov/server/Attribute_Query/FeatureServer`
  layers 0/3/4 (Tax Parcel Points / Tax Parcels / ParcelTaxAttributes),
  joins on `parcel_number`, normalizes via `normalizeAddress()`, inserts
  ~172K rows. **Already loaded to prod.** Polk fields exposed via
  `PrimarySitus` JSON: `StreetNumber, PreDirection, Name, Type,
  PostDirection, CityName, StateName, PostalCode, Unit`.

**Loader scripts (in `scripts/`):**
- `snapshot-polk-county-atlas.ts` — pulls Polk REST → NDJSON locally.
- `load-polk-county-into-index.ts` — NDJSON → DB via postgres-js (direct).
- `build-polk-load-sql.ts` — NDJSON → batched INSERT SQL (no DB conn).
- `inspect-dallas-shp.ts` — schema discovery for shapefiles (Dallas, future
  county-shapefile-only sources). Uses `shapefile` npm package.
- (Pending) `load-dallas-into-index.ts` — Dallas County shapefile loader.
  Branch: `claude/dallas-county-loader`. Field mapping TBD pending
  inspector output.

**`CRON_SECRET` env var:** set on Vercel; cron route accepts EITHER
`Authorization: Bearer $CRON_SECRET` OR Vercel's auto-injected
`x-vercel-cron` header. If `CRON_SECRET` is set in env but a deploy
hasn't picked it up, the scheduled cron will return 401 (mismatch).
Manual curl with the bearer token works. Reset the value via Vercel
Settings → Environment Variables, then redeploy.

**Top still-unmatched IA cities** (after Polk load, ~12,700 remaining):
Waukee 1,077, Ankeny 804, Grimes 740, Des Moines 411, West Des Moines
353, Norwalk 325, Clive 311, Fort Dodge 276, Johnston 265, Adel 247.
Waukee + Adel = Dallas County (next loader). Norwalk = Warren County
(Beacon-only, no public REST). Fort Dodge = Webster (Beacon-only).
Iowa City / Coralville / North Liberty / Tiffin = Johnson County
(REST endpoint at `gis.johnsoncountyiowa.gov/arcgis/rest/services/`,
LandRecords/Land_Records MapServer has `Parcels` + `House Numbers`
layers — pending loader).

**Useful MCP query for unmatched-customer triage** (3-bucket classification:
real-OA-gap / fuzzy-candidate / bad-data):
```sql
-- See db/migrations/0015 + docs/geocode-unmatched-2026-05-01/README.md
-- for the full classification recipe + Excel export.
```

**Out of scope this round:**
- 4th-tier fuzzy matcher (drop trailing direction, Levenshtein on street
  name) — would recover ~1,500-2,500 rows that have minor typos.
- Automated nightly refresh of county loaders — currently manual. Once
  Dallas + Johnson land, add to cron.
- Out-of-state customer cleanup — small pile of NE/IL/MN/MO addresses
  tagged `state='IA'` in customer records. Data-quality issue at the
  ERP source, not a matcher problem.

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
- Join predicate (mandatory `TRIM` on supplier_key — `agility_item_supplier.supplier_key` is left-padded):
  ```sql
  ON ims.item_ptr = pl.item_ptr
  AND TRIM(ims.supplier_key) = TRIM(ph.supplier_key)
  AND ims.ship_from_seq_num = ph.shipfrom_seq
  AND ims.is_deleted = false
  ```
- `OpenPO` type in `src/lib/purchasing.ts` extended with `lead_time_max_days` and `has_blocking_min_violation`.
- No new indexes — `idx_agility_item_supplier_supplier (supplier_key, ship_from_seq_num)` covers the lookup.

#### Still Missing / Deferred
- **Suggested Buys** (`/purchasing/suggested-buys`): `app_purchasing_queue` view confirmed missing. Check `agility_suggested_po_header` + `agility_suggested_po_lines` before building. Once built, default-select the primary supplier per item from `agility_item_supplier WHERE is_primary` and let the user override.
- **RMA Credits thumbnails**: email pipeline, doc counts, address-based matching, and nested email support are all live. Next: add `GET /api/credits/[id]/images` presigned URL route + thumbnail previews in CreditsClient so users can view uploaded docs inline without leaving the page.
- **WH-Tracker kiosk/TV/smart scan**: not appropriate for LiveEdge web app pattern — intentionally deferred
- **Purchasing workflow** (tasks, approvals, exceptions, PO notes): verify `purchasing_tasks`, `purchasing_approvals`, etc. exist in `public` schema first
- **Dispatch enrichment** (driver/truck mgmt, order timeline per stop): WH-Tracker had these; LiveEdge dispatch shows basic stops only. **AR balance intentionally excluded from dispatch** — see AR Data Policy in the Agility Live API section.
- **Sales delivery board** (`/sales/tracker`, `/sales/deliveries`): WH-Tracker had sales-rep-facing delivery views not yet ported
- **Generic file management**: WH-Tracker's `files` + `file_versions` system not ported to LiveEdge
- **Page tracking rollout**: `POST /api/track-visit` exists but not yet wired into module client components — Quick Access strip on homepage stays empty until called
- **Open order value metrics** (2026-05-05): Sync worker PR #16 added `v_open_order_value` to Supabase — a view exposing `ordered_value` and `unshipped_value` per open order (`so_status = 'K'`), grouped by `(system_id, branch_code, so_id, ...)`. No LiveEdge UI consumes it yet. Best candidates: (1) Management/Forecast page — already groups by branch and sale type, adding value columns is natural; (2) Home KPI strip — could surface a company-wide open order dollar total; (3) Sales Hub KPI cards. Query with `SELECT branch_code, SUM(ordered_value), SUM(unshipped_value) FROM v_open_order_value WHERE system_id = 'AUS' GROUP BY branch_code`.
- **`qty_shipped` now populated** (2026-05-05): Sync worker PR #16 also updated `dbo.vw_agility_so_lines` to aggregate `qty_shipped` from `dbo.shipments_detail`. The `agility_so_lines.qty_shipped` column already exists in Supabase and is already selected by `app/api/warehouse/orders/[so_number]/route.ts` and `app/api/dispatch/orders/[so_number]/lines/route.ts` — those screens will now show real shipped quantities automatically after a sync cycle. No LiveEdge code changes needed; noting here in case future features (e.g. backorder highlighting, unshipped value per line) want to build on it.
- **Vendor scorecard "Items I primarily supply"** (2026-05-13): add a section on `/scorecard/vendor/[supplierKey]` listing items where `is_primary = true` for this supplier. Parse `<key>::<seq>` first to preserve LMC1000 ship-from. Each row links to `/scorecard/product/item/[itemCode]?from=vendor:<supplierKey>`.
- **Item scorecard "Inbound POs" section** (2026-05-13): on `/scorecard/product/item/[itemCode]`, query open POs containing this item via `agility_po_lines.item_ptr → agility_po_header WHERE po_status NOT IN ('CLOSED','CANCELED','COMPLETE','RECEIVED') AND canceled = false`. Helpful for slow-mover review.
- **Vendor scorecard fact table** (2026-05-13, deferred): only build if `/scorecard/vendor/[supplierKey]` 3-year query is slow (>2s) at scale. Would need a sync-worker matview keyed `(supplier_key, ship_from_seq, system_id, year, month)` with pre-aggregated spend/lines/receipts/on-time-count. Don't start LiveEdge work without the matview landing first.

## Pending Actions
1. **Apply page_visits migration**: Run `db/migrations/0004_page_visits.sql` in Supabase SQL editor to enable Quick Access tracking on homepage
2. **Extend page tracking to module clients**: Add `POST /api/track-visit` call to each module's main client component (or extract a shared `usePageTracking` hook in `src/hooks/`) so Quick Access fills with real data
3. **RMA Credits thumbnails**: Email pipeline, doc counts, address-based RMA matching, and nested `.eml` parsing are live. Next: add `GET /api/credits/[id]/images` presigned URL route + thumbnail previews in CreditsClient so users can view docs inline.
4. **Purchasing workflow gaps**: Before building, verify tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('purchasing_tasks','purchasing_approvals','purchasing_notes','purchasing_exceptions')` — if found, build PO notes API, exceptions view, approval workflow
5. **Suggested Buys**: `app_purchasing_queue` confirmed missing. Check `agility_suggested_po_header` + `agility_suggested_po_lines` before building `/purchasing/suggested-buys`
6. **Flask sunset**: DNS cutover + archive `C:\Users\amcgrean\python\wh-tracker-fly\WH-Tracker` after user testing confirms parity
7. **Dallas County loader**: shapefile extracted to user's `./tmp/dallas`, inspector script committed to `claude/dallas-county-loader` branch. Need to (a) run inspector to discover dbf field names, (b) write `scripts/load-dallas-into-index.ts` based on Polk template + shapefile reading + `proj4` reprojection (Iowa State Plane → WGS84), (c) load to prod, (d) re-run cron. Expected uplift ~1,400 customers (Waukee + Adel). See section "Geocoding Pipeline" above for context.
8. **Johnson County loader**: REST endpoint confirmed at `https://gis.johnsoncountyiowa.gov/arcgis/rest/services/LandRecords/Land_Records/MapServer` — layers 4 (House Numbers, Point) + 9 (Parcels, Polygon). Same template as Polk loader. Expected uplift ~360 customers (Iowa City / Coralville / North Liberty / Tiffin).
9. **Generic county-data nightly refresh**: once Dallas + Johnson land, add `/api/cron/county-data-refresh` that re-runs all REST-based county loaders weekly (or monthly). `ON CONFLICT (source, source_hash) DO NOTHING` makes re-runs no-ops for unchanged parcels; new construction picked up automatically.

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

### Email / OTP
- `RESEND_API_KEY` — **Required.** Resend.com API key for sending sign-in codes. Without this nobody can log in.
- `OTP_EMAIL_FROM` — Sender address for OTP emails (defaults to `noreply@beisserlumber.com`)
- `OTP_APP_NAME` — App name shown in OTP emails (defaults to `Beisser LiveEdge`)
- `AUTH_OTP_CONSOLE` — Print OTP codes to server console instead of emailing (`true`/`false`). Use in local dev when Resend isn't configured.
- `SESSION_COOKIE_SECURE` — Secure flag on session cookie (`true` in prod, `false` in dev)

## Navigation Structure
Current structure as of 2026-04-24 (6 domain dropdowns + user dropdown; Design is inside Services):
- **Yard ▾**: Picks Board, Open Picks, Picker Stats, Work Orders, Supervisor (all `/warehouse/*` paths, label renamed from "Warehouse")
- **Dispatch ▾**: Dispatch Board, Delivery Tracker, Fleet Map
- **Sales ▾**: Sales Hub, Customers, Transactions, Purchase History, Products & Stock, Reports, RMA Credits
- **Services ▾**: Estimating App (`/estimating`), PDF Takeoff, **Bids** (tabbed hub at `/bids`), EWP, Projects, Design (6 items; bid list entries consolidated 2026-04-24)
- **Purchasing ▾**: Buyer Workspace, Open POs, Command Center, PO Check-In, Review Queue (Receiving merged in)
- **Admin ▾** (admin role only): Customers, Products/SKUs, Formulas, Bid Fields, Users, Notifications, Audit Log, ERP Sync, Page Analytics, Delivery Report, Picker Admin
- **User dropdown** (under logged-in username + chevron): Report an Issue (`/it-issues`), Help & Docs (`/help`), Sign Out
- Component: `src/components/nav/TopNav.tsx`
- Single `openMenu: string | null` state + one `<nav>` ref for click-outside
- `isActive()` per domain handles path prefix matching
- `BRANCH_COLORS` constant maps branch codes to Tailwind color tokens; dot indicator always shown (no MapPin fallback)

## Key Conventions
- Path alias: `@/*` → `./src/*`, `@/db/*` → `./db/*` (but API routes use relative paths for db imports)
- Legacy table column names match Flask/SQLAlchemy models exactly (e.g., `customerCode` not `customer_code`)
- All tables (new + legacy) are in the `bids` schema — Drizzle handles schema qualification transparently
- Admin customers page uses `legacyCustomer` (serial IDs), NOT `schema.customers` (UUID)
- `createdBy` omitted from takeoff session inserts (legacy serial user IDs incompatible with UUID FK)
- `general_audit.changes` is `jsonb` (not `text`) — Drizzle types it as `unknown`; cast or handle accordingly in consuming code
