# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Neon Postgres, NextAuth v5). Deployed on Vercel at `beisser-takeoff.vercel.app`. Used by sales staff/estimators at four Iowa lumberyard locations.

## PDF Takeoff Engine (Phase 1 Complete)
We built a PDF measurement and markup engine replacing Bluebeam Revu ($349/seat/year). The engine handles multi-scale construction drawings with multiple viewports per page at different architectural scales.

### Architecture
- Two stacked canvas layers: pdfjs-dist v5 (bottom, read-only) + Fabric.js v7 (top, interactive)
- `pdfjs-dist` renders via WebAssembly, 100% client-side
- Fabric.js handles all measurements, markup, selection, serialization
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
  r2.ts               — Cloudflare R2 client (S3-compatible): upload, download, presigned URLs, CORS setup

src/hooks/
  useMeasurementReducer.ts — Full takeoff state (viewports, groups, measurements, pages, tools)
  useUndoRedo.ts            — Command-stack undo/redo
  useTakeoffSession.ts      — Session load/save, 2s debounced auto-save

src/components/takeoff/
  TakeoffCanvas.tsx          — Core dual-canvas component with all tool handlers
  TakeoffToolbar.tsx         — Two-row toolbar (session info + tools)
  BottomBar.tsx              — Bluebeam-style bottom bar: page nav, zoom, scroll mode toggle
  PageNavigator.tsx          — Collapsible thumbnail strip (toggled from BottomBar)
  MeasurementSidebar.tsx     — Preset panel with categories and running totals
  MeasurementInspector.tsx   — Click-to-inspect detail panel (absolute overlay on canvas)
  ViewportManager.tsx        — Viewport list/manage
  ScaleCalibration.tsx       — Scale preset picker + manual calibration
  MarkupTools.tsx            — Stamp picker

app/takeoff/                 — Session list page
app/takeoff/[sessionId]/     — Full workspace (TakeoffWorkspace.tsx orchestrates everything)

app/api/takeoff/
  sessions/                  — CRUD + list
  sessions/[sessionId]/      — Full session get/update/delete
  sessions/[sessionId]/pages/       — Page state upsert (auto-save target)
  sessions/[sessionId]/viewports/   — Viewport CRUD
  sessions/[sessionId]/groups/      — Group/preset CRUD
  sessions/[sessionId]/measurements/ — Measurement CRUD
  sessions/[sessionId]/send-to-estimate/ — Maps preset totals to bid's JobInputs
  sessions/[sessionId]/upload/      — PDF upload (GET: presigned URL, POST: server proxy, PUT: confirm)
  sessions/[sessionId]/pdf/         — PDF download (GET: ?mode=url or ?mode=download)
  assemblies/                — Assembly CRUD
```

### Database Schema (db/schema.ts)
New tables added in Phase 1:
- `assemblies` + `assembly_items` — Material assembly definitions
- `takeoff_sessions` — FK to `bids.id` (bids ARE projects)
- `takeoff_viewports` — Per-page scale regions with calibration
- `takeoff_groups` — Named measurement presets with `targetField` (maps to JobInputs path) and `isPreset` flag
- `takeoff_measurements` — Individual measurements with geometry JSON
- `takeoff_page_states` — Fabric.js canvas serialization for auto-save recovery

### Named Tool Presets (Critical Feature)
Users measure by clicking preset buttons (e.g., "1st Floor Ext 2x6 9'") which activate the right tool type with the right color. Each preset's `targetField` maps to a specific `JobInputs` field (e.g., `firstFloor.ext2x6_9ft`). "Send to Estimate" writes accumulated totals directly to the linked bid.

See `src/lib/takeoff/presets.ts` for all 49 standard presets and `bidset.pdf` for a Bluebeam-annotated example showing the real workflow.

### Existing Data Model Notes
- No "projects" table — `bids` IS the project entity
- `bids.inputs` is a JSONB field containing the full `JobInputs` object (see `src/types/estimate.ts`)
- The calculation engine is in `src/calculations/engine.ts`
- Path alias: `@/*` → `./src/*`, `@/db/*` → `./db/*` (but API routes use relative paths for db imports)
- Auth: `import { auth } from '<relative>/auth'` pattern
- DB: `import { getDb, schema } from '<relative>/db/index'` pattern

## Phase 2 — Complete

### All Items Done
1. **Drizzle migration** — Migration SQL written (`db/migrations/0001_add_takeoff_tables.sql`) for all 7 new tables. Applied directly in Neon SQL Editor.
2. **Live drawing previews** — Rubber-band dashed lines during polyline/polygon drawing. Confirmed segments render solid on click. Preview objects cleaned up on completion or Escape.
3. **Hover tooltips** — 300ms delayed tooltip showing group name + measurement value on canvas hover.
4. **Cloud markup tool** — Scalloped rectangle annotation with SVG arc paths. Two-click drawing.
5. **Annotated PDF export** — Composites Fabric.js annotations on top of PDF pages via headless canvas → transparent PNG overlay.
6. **PDF file storage** — Cloudflare R2 integration. Presigned URL upload (browser → R2 direct, bypasses Vercel 4.5MB limit) with server-side POST fallback for smaller files. Auto-loads from R2 on session reopen.
7. **Bottom navigation bar** — Bluebeam-style bottom bar with `‹ 1 of 13 ›` page nav (click number to jump), zoom controls, scroll mode toggle (zoom vs pan), and collapsible thumbnail strip.

### Deployment & Auth (Resolved)
- **Vercel deployment** working at `beisser-takeoff.vercel.app`
- **Auth** uses legacy `"user"` table via raw SQL (not Drizzle schema). Username-based login. Plain-text password comparison (legacy constraint).
- **Database env var**: `BIDS_DATABASE_URL` on Vercel (fallback in `db/index.ts` checks both `DATABASE_URL` and `BIDS_DATABASE_URL`)
- **Dev bypass**: username `admin` / password `ChangeMe123!` when no DB configured
- `createdBy` removed from session insert (legacy user IDs are serial integers, incompatible with UUID column)

### Key Implementation Details

#### PDF Upload Flow (r2.ts + upload/route.ts)
1. Client calls `GET /api/takeoff/sessions/{id}/upload?fileName=...` → gets presigned R2 URL
2. Server calls `ensureBucketCors()` (once per process) to configure R2 CORS
3. Client uploads directly to R2 via presigned PUT URL
4. Client calls `PUT /api/takeoff/sessions/{id}/upload` with `{ fileName, storageKey }` to confirm
5. Fallback: if presigned fails, client tries `POST` with FormData (server-side proxy, <4MB files only)

#### Scroll Mode (TakeoffCanvas + BottomBar)
- `scrollMode: 'zoom'` (default): scroll wheel zooms, no modifier needed
- `scrollMode: 'pan'`: scroll wheel pans canvas, Ctrl+scroll zooms
- Toggle button in bottom-right of BottomBar

#### Fabric.js v7 Breaking Change
All mouse handlers use `opt.scenePoint` (NOT `opt.pointer`). Types: `{ e: MouseEvent; scenePoint: { x: number; y: number } }`. This was a v6→v7 breaking change.

### Remaining TODO
1. **Integration testing** — Test full workflow: upload PDF, create viewports, calibrate scale, measure walls/areas, send to estimate
2. **R2 CORS verification** — The `ensureBucketCors()` call should configure CORS on first presigned URL request. Verify this works in production. If R2 rejects the PutBucketCors call, CORS must be set manually in Cloudflare dashboard (R2 > bids bucket > Settings > CORS: allow `https://beisser-takeoff.vercel.app`, methods `PUT,GET`, headers `*`).
3. **DB schema audit** — Legacy Neon DB (Alembic-managed, serial IDs, `"user"` table) vs Drizzle schema (UUID-based). Reconcile `bid` (legacy) vs `bids` (Drizzle). Audit FK references.
4. **Password security** — Legacy passwords are plain text. Plan: migrate to Supabase auth when merging with estimating app.
5. **pdfjs-dist JBIG2 warning** — Cosmetic warning about missing WASM decoder. Falls back to JS. No functional impact. Can be fixed by configuring `wasmUrl` in pdfLoader.ts if desired.

## Tech Stack
- Next.js 15.1 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3.4 (dark theme, cyan accent: brand.400/500/600)
- Drizzle ORM + Neon Postgres (serverless, neon-http driver)
- Cloudflare R2 (PDF storage via @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner)
- NextAuth v5 beta (credentials provider, JWT strategy)
- pdfjs-dist 5.6, fabric 7.x (NOT v6 — mouse event API differs), jspdf 2.x
- Lucide React icons, papaparse, zod, date-fns
- Vercel deployment with `vercel.json` (maxDuration config for upload route)

## Environment Variables (Vercel)
- `BIDS_DATABASE_URL` — Neon Postgres connection string (also checked as `DATABASE_URL`)
- `AUTH_SECRET` — NextAuth secret (falls back to dev-only value)
- `R2_ACCOUNT_ID` — Cloudflare account ID (`8674243b1f1ee370345038e0475b7d44`)
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret
- `R2_BUCKET_NAME` — R2 bucket name (defaults to `bids`)
