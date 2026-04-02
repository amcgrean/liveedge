# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, NextAuth v5). Used by sales staff/estimators at four Iowa lumberyard locations.

## Architecture Overview

### Single Database — Supabase (agility-api project)
All data lives in one Supabase Postgres instance, split into two schemas:

| Schema | Owner | Contents |
|--------|-------|----------|
| `public` | WH-Tracker (Alembic) | ERP mirror tables (`erp_mirror_*`), WH-Tracker app tables |
| `bids` | beisser-takeoff (Drizzle) | All beisser-takeoff tables — UUID-based new tables + migrated legacy serial-ID tables |

**Never run drizzle-kit against the `public` schema.** `drizzle.config.ts` has `schemaFilter: ['bids']` to enforce this.

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
- NextAuth v5 beta, credentials provider, JWT strategy
- Legacy `bids."user"` table (serial IDs). Passwords are plaintext but auto-upgrade to bcrypt on successful login. Bulk bcrypt migration planned for Phase 5.
- `auth.ts` queries `bids."user"` via Drizzle ORM
- Dev bypass: username `admin` / password `ChangeMe123!`

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

#### WH-Tracker Migration — COMPLETE (2026-04-02)
Full WH-Tracker (Python/Flask) migration into LiveEdge. All modules ported:
- **Warehouse Board** (`/warehouse`): stats cards, picks board, 60s refresh. API: `/api/warehouse/stats`, `/api/warehouse/picks`
- **Work Orders** (`/work-orders`): open WO board, barcode SO search, assignments with Mark Complete. API: `/api/work-orders/open`, `/api/work-orders/search`, `/api/work-orders/assignments`, `/api/work-orders/assignments/[id]`
- **Dispatch Board** (`/dispatch`): delivery stops from ERP, route planning CRUD, Samsara GPS proxy. API: `/api/dispatch/deliveries`, `/api/dispatch/routes`, `/api/dispatch/routes/[id]/stops`, `/api/dispatch/vehicles`
- **Delivery Tracker** (`/delivery`): today + overdue K/P/S statuses, status label logic, fleet GPS panel. API: `/api/delivery/tracker`
- **Sales Hub** (`/sales`): KPI dashboard + order status table. API: `/api/sales/metrics`, `/api/sales/orders`
- **Supervisor Dashboard** (`/supervisor`): picker status board (active/assigned/idle), 30s refresh. API: `/api/supervisor/pickers`
- **Ops Delivery Reporting** (`/ops/delivery-reporting`): ERP analytics, bar chart by date, CSV export. API: `/api/ops/delivery-reporting`
- **Auth**: OTP-based via `otp_codes` + `app_users` tables, `roles[]` array + `branch` in JWT

#### Flask Sunset — NOT STARTED
- DNS routing, archive Flask app

## Pending Actions
1. **Bug testing**: Users testing 2026-04-03. Known risk areas: WH-Tracker public schema table access (pick, pickster, pick_assignments, work_orders tables), Samsara vehicle GPS
2. **Phase 6 Flask sunset**: DNS cutover, archive Flask app after testing confirms parity

## API Route Patterns
- **Legacy tables**: Import from `'<relative>/db/schema-legacy'`, use `legacyBid`, `legacyCustomer`, etc. (all now in `bids` schema — queries work transparently via Drizzle)
- **New tables**: Import from `'<relative>/db/index'` as `{ getDb, schema }`
- **ERP queries**: Import from `'<relative>/db/supabase'` as `{ getErpDb }`
- **Auth**: `import { auth } from '<relative>/auth'`
- **Branch context**: `import { getSelectedBranchId } from '@/lib/branch-context'`
- API route `params` in Next.js 15 are `Promise<{ id: string }>` — must `await params`

## Tech Stack
- Next.js 15.1 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3.4 (dark theme, cyan accent: brand.400/500/600)
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

### Email / OTP (set in Vercel; OTP flow not yet implemented in LiveEdge)
- `RESEND_API_KEY` — Resend.com API key for transactional email
- `OTP_EMAIL_FROM` — Sender address for OTP emails (e.g. `noreply@beisser.cloud`)
- `OTP_APP_NAME` — App name shown in OTP emails (e.g. `Beisser Ops`)
- `AUTH_REQUIRED` — Whether OTP auth is enforced (`true`/`false`); currently `false` (NextAuth handles auth)
- `AUTH_OTP_CONSOLE` — Print OTP codes to server console instead of emailing (`true`/`false`)
- `SESSION_COOKIE_SECURE` — Secure flag on session cookie (`true` in prod, `false` in dev)

## Navigation Structure
- **Top nav**: Dashboard, Bids, Designs, EWP, Projects, IT Issues, Purchasing, Warehouse, Work Orders, Dispatch, Delivery, Sales, Supervisor, Estimating, PDF Takeoff
- **Admin dropdown** (admin role only): Dashboard, Customers, Products/SKUs, Formulas, Users, Bid Fields, Notifications, Audit Log, ERP Sync, PO Review, Delivery Report
- Component: `src/components/nav/TopNav.tsx`

## Key Conventions
- Path alias: `@/*` → `./src/*`, `@/db/*` → `./db/*` (but API routes use relative paths for db imports)
- Legacy table column names match Flask/SQLAlchemy models exactly (e.g., `customerCode` not `customer_code`)
- All tables (new + legacy) are in the `bids` schema — Drizzle handles schema qualification transparently
- Admin customers page uses `legacyCustomer` (serial IDs), NOT `schema.customers` (UUID)
- `createdBy` omitted from takeoff session inserts (legacy serial user IDs incompatible with UUID FK)
- `general_audit.changes` is `jsonb` (not `text`) — Drizzle types it as `unknown`; cast or handle accordingly in consuming code
