# Beisser Takeoff — Development Context

## Project Overview
Beisser Lumber Co. internal estimating app (Next.js 15, TypeScript, Tailwind, Drizzle ORM, Neon Postgres, NextAuth v5). Deployed on Vercel. Used by sales staff/estimators at four Iowa lumberyard locations.

## PDF Takeoff Engine (Phase 1 Complete)
We built a PDF measurement and markup engine replacing Bluebeam Revu ($349/seat/year). The engine handles multi-scale construction drawings with multiple viewports per page at different architectural scales.

### Architecture
- Two stacked canvas layers: pdfjs-dist v5 (bottom, read-only) + Fabric.js v6 (top, interactive)
- `pdfjs-dist` renders via WebAssembly, 100% client-side
- Fabric.js handles all measurements, markup, selection, serialization
- Zoom uses `canvas.setZoom()` transform only (never repositions objects)
- Page state serialized to JSON on page change, restored on return

### Key Files
```
src/lib/takeoff/
  calculations.ts    — Pure functions: calcPolylineLength, calcPolygonArea, calcCount, scale presets
  presets.ts          — 49 named measurement presets mapping to JobInputs fields
  pdfLoader.ts        — pdfjs-dist v5 setup, worker config, page rendering
  fabricHelpers.ts    — Fabric.js v6 canvas setup, zoom/pan, measurement objects, annotations
  viewportDetector.ts — Viewport hit detection
  exportCsv.ts        — CSV export via papaparse
  exportPdf.ts        — Annotated PDF export via jspdf (basic — needs refinement)

src/hooks/
  useMeasurementReducer.ts — Full takeoff state (viewports, groups, measurements, pages, tools)
  useUndoRedo.ts            — Command-stack undo/redo
  useTakeoffSession.ts      — Session load/save, 2s debounced auto-save

src/components/takeoff/
  TakeoffCanvas.tsx          — Core dual-canvas component with all tool handlers
  TakeoffToolbar.tsx         — Two-row toolbar (info + tools)
  PageNavigator.tsx          — Thumbnail strip with lazy rendering
  MeasurementSidebar.tsx     — Preset panel with categories and running totals
  MeasurementInspector.tsx   — Click-to-inspect detail panel
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

## Phase 2 Progress

### Completed
1. **Drizzle migration** — Migration SQL written (`db/migrations/0001_add_takeoff_tables.sql`) for all 7 new tables (assemblies, assembly_items, takeoff_sessions, takeoff_viewports, takeoff_groups, takeoff_measurements, takeoff_page_states). Run `npx drizzle-kit push` to deploy to Neon.
2. **Live drawing previews** — Rubber-band dashed lines now show from the last placed point to cursor during polyline/polygon drawing. Confirmed segments render as solid lines immediately on click. All preview objects cleaned up on completion or Escape.
3. **Hover tooltips** — 300ms delayed tooltip showing group name + measurement value when hovering canvas objects. Positioned near cursor, auto-clears on mouse out.
4. **Cloud markup tool** — Scalloped rectangle annotation tool fully implemented. Uses SVG arc paths along all four edges with 16px scallop radius. Two-click drawing (opposite corners). Available in toolbar.
5. **Annotated PDF export refinement** — Export now composites Fabric.js annotations on top of PDF pages using a headless Fabric canvas. Creates transparent PNG overlays from saved page state JSON.
6. **PDF file storage** — Cloudflare R2 integration via S3-compatible API. PDFs auto-upload on file select, auto-load from R2 when reopening sessions. Upload endpoint at `api/takeoff/sessions/[sessionId]/upload`, download at `api/takeoff/sessions/[sessionId]/pdf`. R2 client in `src/lib/r2.ts`. Env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

### Remaining TODO
1. **Integration testing** — Test full workflow with bidset.pdf: upload, create viewports, calibrate, measure walls/areas, send to estimate

## Tech Stack
- Next.js 15.1 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3.4 (dark theme, cyan accent: brand.400/500/600)
- Drizzle ORM + Neon Postgres (serverless)
- Cloudflare R2 (PDF storage via @aws-sdk/client-s3)
- NextAuth v5 beta (credentials provider, JWT strategy)
- pdfjs-dist 5.6, fabric 6.x, jspdf 2.x
- Lucide React icons, papaparse, zod, date-fns
