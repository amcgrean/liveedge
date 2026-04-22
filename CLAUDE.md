# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, NextAuth v5). Used by sales staff/estimators at four Iowa lumberyard locations.

## Route Reference
Full API and page route inventory: **`docs/routes.md`** (last audited 2026-04-17, 147 API routes / 77 pages).

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
| `agility_so_header` | `erp_mirror_so_header` | Has `cust_name`, `cust_code`, `shipto_*` denormalized — no JOIN to customers/shipto needed. Missing `invoice_date`/`ship_date`/`terms` (now in `agility_shipments`) |
| `agility_so_lines` | `erp_mirror_so_detail` | Has `item_code`, `handling_code` inline — no JOIN to items needed for most queries |
| `agility_customers` | `erp_mirror_cust` + `erp_mirror_cust_shipto` | One row per ship-to address (seq_num≥1). Use `GROUP BY cust_code` or `DISTINCT ON` to get one row per customer |
| `agility_items` | `erp_mirror_item` + `erp_mirror_item_branch` | Has `handling_code`, `qty_on_hand`, `default_location` inline. One row per item per branch (`system_id`) |
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
- Permissions: `app/admin/users/[id]/permissions/`
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
- **Products & Stock** (`/sales/products`): item catalog search via `erp_mirror_item` + `erp_mirror_item_branch`. API: `/api/sales/products`
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
- **Products & Stock** (`/sales/products`): search `erp_mirror_item` + `erp_mirror_item_branch`. API: `/api/sales/products`
- **Purchase History** (`/sales/history`): orders with expanded filters (status, date range, branch). Reuses `/api/sales/orders`
- **Sales Reports** (`/sales/reports`): KPI cards + status breakdown + top customers. Reuses `/api/sales/metrics`

#### Purchasing Sub-Pages (2026-04-02) — COMPLETE
- **Open POs** (`/purchasing/open-pos`): open PO list with overdue highlight. API: `/api/purchasing/pos/open` (uses `app_po_search` view)
- **Buyer Workspace** (`/purchasing/workspace`): quick-action cards + upcoming POs + recent check-ins
- **Command Center** (`/purchasing/manage`): KPI cards, POs by branch, overdue list, recent submissions

#### RMA Credits (2026-04-02) — METADATA ONLY
- **Credits Search** (`/credits`): search `public.credit_images` table by RMA# or email. API: `/api/credits`
- Note: Images in `credit_images.filepath` are local WH-Tracker filesystem paths — not viewable in LiveEdge yet

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

#### Hubbell Email Reconciliation (2026-04-22) — COMPLETE

Admin tool for reconciling Hubbell supply-house emails (PO confirmations / WO acknowledgements) against LiveEdge sales orders.

**Pages:**
- `/admin/hubbell` — Email inbox: all ingested Hubbell emails, tabbed by match status (Pending / Matched / Confirmed / No Match / Rejected), paginated at 50/page, search by subject/sender/PO#/SO#
- `/admin/hubbell/[id]` — Email detail: extracted data, match candidates sorted by confidence, confirm/reject/reset actions
- `/admin/hubbell/jobs` — Jobs index: one row per job site (customer + address), aggregates all confirmed emails; paginated at 50/page; click row to view orders
- `/admin/hubbell/jobs/[soId]` — Job detail: SO header, reconciliation table (all SOs at same address vs emails received), unmatched email warnings

**API routes:**
- `GET /api/admin/hubbell/emails` — paginated inbox with status/search filtering
- `GET/POST /api/admin/hubbell/emails/[id]` — detail + confirm/reject/reset actions
- `GET /api/admin/hubbell/jobs` — aggregated jobs list
- `GET /api/admin/hubbell/jobs/[soId]` — per-SO detail with related SOs and emails

**DB table:** `bids.hubbell_emails` (Drizzle-managed, `db/schema.ts`)

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

#### Flask Sunset — NOT STARTED
- DNS routing, archive Flask app

#### Still Missing / Deferred
- **Suggested Buys** (`/purchasing/suggested-buys`): `app_purchasing_queue` view confirmed missing. Check `agility_suggested_po_header` + `agility_suggested_po_lines` before building
- **RMA Credits images**: `credit_images.filepath` holds local WH-Tracker paths — not R2 keys yet. Metadata search at `/credits` works. Image serving requires R2 pipeline (see Pending Actions)
- **WH-Tracker kiosk/TV/smart scan**: not appropriate for LiveEdge web app pattern — intentionally deferred
- **Purchasing workflow** (tasks, approvals, exceptions, PO notes): verify `purchasing_tasks`, `purchasing_approvals`, etc. exist in `public` schema first
- **Dispatch enrichment** (driver/truck mgmt, order timeline per stop): WH-Tracker had these; LiveEdge dispatch shows basic stops only. **AR balance intentionally excluded from dispatch** — see AR Data Policy in the Agility Live API section.
- **Sales delivery board** (`/sales/tracker`, `/sales/deliveries`): WH-Tracker had sales-rep-facing delivery views not yet ported
- **Generic file management**: WH-Tracker's `files` + `file_versions` system not ported to LiveEdge
- **`app_users` admin UI**: `/admin/users` queries `public.app_users` but the create/edit UI was built for `bids."user"` fields. Should be updated to match `app_users` schema (roles JSON array, branch string, no password field).
- **Page tracking rollout**: `POST /api/track-visit` exists but not yet wired into module client components — Quick Access strip on homepage stays empty until called

## Pending Actions
1. **Apply page_visits migration**: Run `db/migrations/0004_page_visits.sql` in Supabase SQL editor to enable Quick Access tracking on homepage
2. **Extend page tracking to module clients**: Add `POST /api/track-visit` call to each module's main client component (or extract a shared `usePageTracking` hook in `src/hooks/`) so Quick Access fills with real data
3. **`app_users` admin UI**: Update `/admin/users` create/edit forms to match `public.app_users` schema (roles JSON array, branch string) — currently shows bids."user" field layout which no longer matches the auth source of truth
4. **RMA Credits image pipeline**: `credit_images.filepath` holds WH-Tracker local paths. Plan: add `r2_key TEXT` column to `public.credit_images` (WH-Tracker Alembic migration) → update `sync_email_credits.py` to upload attachments to R2 → add `GET /api/credits/[id]/image` presigned URL route → update `CreditsClient.tsx` to show thumbnails
5. **Purchasing workflow gaps**: Before building, verify tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('purchasing_tasks','purchasing_approvals','purchasing_notes','purchasing_exceptions')` — if found, build PO notes API, exceptions view, approval workflow
6. **Suggested Buys**: `app_purchasing_queue` confirmed missing. Check `agility_suggested_po_header` + `agility_suggested_po_lines` before building `/purchasing/suggested-buys`
7. **Flask sunset**: DNS cutover + archive `C:\Users\amcgrean\python\wh-tracker-fly\WH-Tracker` after user testing confirms parity

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
Current structure as of 2026-04-15 (7 domain dropdowns + user dropdown; Design is a direct link):
- **Yard ▾**: Picks Board, Open Picks, Picker Stats, Work Orders, Supervisor (all `/warehouse/*` paths, label renamed from "Warehouse")
- **Dispatch ▾**: Dispatch Board, Delivery Tracker, Fleet Map
- **Sales ▾**: Sales Hub, Customers, Transactions, Purchase History, Products & Stock, Reports, RMA Credits
- **Services ▾**: Estimating App (`/estimating`), PDF Takeoff, Bids, EWP, Projects (renamed from "Estimating")
- **Design** (direct → `/designs`)
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
