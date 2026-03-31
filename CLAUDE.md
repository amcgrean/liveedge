# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Neon Postgres, NextAuth v5). Deployed on Vercel at `beisser-takeoff.vercel.app`. Used by sales staff/estimators at four Iowa lumberyard locations.

## Architecture Overview

### Dual Database Setup
- **Neon Postgres** (app DB): All application tables — legacy Alembic-managed + new Drizzle-managed. Connected via `@neondatabase/serverless`.
- **Supabase Postgres** (ERP DB): Read-only ERP mirror tables (`erp_mirror_*`). Connected via `postgres.js` driver. Large tables (items: 156K, item_branch: 1.4M, ship-to: 145K) queried live; customers (4,925 rows) synced daily to Neon.

### Dual Schema System
- `db/schema.ts` — New UUID-based tables (bids, users, customers, takeoff_*, assemblies, products, multipliers, branches). Drizzle-managed.
- `db/schema-legacy.ts` — Legacy serial-ID tables (user, customer, bid, design, estimator, etc.). Alembic-managed, READ-ONLY Drizzle definitions. **NEVER run drizzle-kit push/generate against these.**
- `db/supabase.ts` — Supabase ERP connection. Exports `getErpDb()`, `getErpSql()`, `isErpConfigured()`.

### Key Relationships
- `legacyBid` (serial int, `bid` table) = bid tracker entry
- `bids` (UUID, `bids` table) = takeoff/estimating project with JSONB `inputs`
- `takeoffSessions.bidId` → `bids.id` (UUID FK)
- `takeoffSessions.legacyBidId` → `bid.id` (integer, no FK constraint — cross-schema)
- "Start Takeoff" from a legacy bid creates a `bids` record + `takeoffSession` linked to both

### Auth
- NextAuth v5 beta, credentials provider, JWT strategy
- Legacy `"user"` table (serial IDs, plain-text passwords)
- `auth.ts` does raw SQL against `"user"` table
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
- EWP pages: `app/ewp/` (list, add, manage)
- Projects pages: `app/projects/` (list, manage)
- Design management still needs full CRUD (2A) and Layouts (2B)

### Phase 3: Admin Portal Expansion — COMPLETE
- Permissions: `app/admin/users/[id]/permissions/`
- Bid Fields: `app/admin/bid-fields/`
- Notifications: `app/admin/notifications/`
- Audit: `app/admin/audit/`
- IT Issues: `app/it-issues/`
- Supporting libs: `src/lib/audit.ts`, `src/lib/notifications.ts`, `src/lib/csv-utils.ts`
- CSV import/export endpoints

### Phase 4: ERP Sync — COMPLETE
- **Supabase connection**: `db/supabase.ts` (postgres.js driver, singleton)
- **Sync engine**: `src/lib/erp-sync.ts` — Customer sync (upserts erp_mirror_cust → Neon customer table), item search (joins item + item_branch, filtered by branch), ship-to lookup, raw table query for admin
- **API routes**: `/api/erp/items`, `/api/erp/customers/[code]`, `/api/erp/customers/[code]/ship-to`
- **Admin panel**: `app/admin/erp/` — Connection status, table discovery, column viewer, data preview, manual sync, sync history
- **Cron**: `/api/cron/erp-sync` — Daily at 6 AM UTC (Vercel Hobby plan limit)

### Phase 5: Unification and Cleanup — NOT STARTED
- Unified bid view (legacy flat + JSONB takeoff bids in combined display)
- Password security (bcrypt migration)
- Customer-centric views (all bids for a customer)

### Phase 6: Polish and Sunset — NOT STARTED
- Print-optimized CSS, responsive audit, error boundaries
- Flask app sunset, DNS routing, archive

## Pending Migration Actions
1. **Apply migration SQL**: Run `db/migrations/0002_takeoff_legacy_bid_link.sql` in Neon SQL Editor
2. **Design management (2A)**: Full CRUD for designs with activity log
3. **Layouts management (2B)**: Full CRUD for layouts/EWP with CSV import
4. **Phase 5**: Unified bid view, bcrypt password migration, customer-centric views
5. **Phase 6**: Polish, Flask sunset

## API Route Patterns
- **Legacy tables**: Import from `'<relative>/db/schema-legacy'`, use `legacyBid`, `legacyCustomer`, etc.
- **New tables**: Import from `'<relative>/db/index'` as `{ getDb, schema }`
- **ERP queries**: Import from `'<relative>/db/supabase'` as `{ getErpDb }`
- **Auth**: `import { auth } from '<relative>/auth'`
- **Branch context**: `import { getSelectedBranchId } from '@/lib/branch-context'`
- API route `params` in Next.js 15 are `Promise<{ id: string }>` — must `await params`

## Tech Stack
- Next.js 15.1 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3.4 (dark theme, cyan accent: brand.400/500/600)
- Drizzle ORM + Neon Postgres (serverless, neon-http driver)
- Supabase Postgres (ERP DB via postgres.js + drizzle-orm/postgres-js)
- Cloudflare R2 (file storage via @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner)
- NextAuth v5 beta (credentials provider, JWT strategy)
- pdfjs-dist 5.6, fabric 7.x (NOT v6 — mouse event API differs), jspdf 2.x
- Lucide React icons, papaparse, zod, date-fns
- Vercel deployment with `vercel.json` + `.github/workflows/deploy.yml`

## Environment Variables (Vercel)
- `BIDS_DATABASE_URL` — Neon Postgres connection string (also checked as `DATABASE_URL`)
- `AUTH_SECRET` — NextAuth secret
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret
- `R2_BUCKET_NAME` — R2 bucket name (defaults to `bids`)
- `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL` / `SUPABASE_DB_URL` — Supabase ERP DB connection
- `CRON_SECRET` — Bearer token for cron endpoint auth
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — GitHub Actions deploy secrets

## Navigation Structure
- **Top nav**: Dashboard, Bids, Designs, EWP, Projects, IT Issues, Estimating, PDF Takeoff
- **Admin dropdown** (admin role only): Dashboard, Customers, Products/SKUs, Formulas, Users, Bid Fields, Notifications, Audit Log, ERP Sync
- Component: `src/components/nav/TopNav.tsx`

## Key Conventions
- Path alias: `@/*` → `./src/*`, `@/db/*` → `./db/*` (but API routes use relative paths for db imports)
- Legacy table column names match Flask/SQLAlchemy models exactly (e.g., `customerCode` not `customer_code`)
- Admin customers page uses `legacyCustomer` (serial IDs), NOT `schema.customers` (UUID)
- `createdBy` omitted from takeoff session inserts (legacy serial user IDs incompatible with UUID FK)
