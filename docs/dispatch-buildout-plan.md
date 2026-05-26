# Dispatch Board — Full Buildout Plan

_Last updated: 2026-05-12_

---

## Current State (as of PR #264)

- Map mode: stop pins (color by type/status), live trucks via Samsara poll (code exists in `DispatchMap.tsx`, may need verification)
- Board mode: 5-column card grid, right detail panel, RoutesDrawer slide-over
- StopCard: status badge, expected date, reference + ship_via chip
- DetailPanel: order lines (eager load), timeline/activity, actions (POD capture, Deliver, Load/Unload)
- Toolbar: date, branch, search, ship-via filter, will-call toggle, sort/group, view toggle
- Route management: create/delete routes, assign stops via button

---

## Phase 1 — Dispatcher Can See the Board (this session)

### 1a. Live Truck Positions on Map ✅ (code exists, needs verification)

**Status:** `DispatchMap.tsx` already polls `/api/dispatch/vehicles?branch=` every 15 s and renders `makeTruckIcon()` SVG markers. Likely bug: trucks visible only when map mode is active and branch has Samsara-mapped vehicles.

**Action:**
- Add a "trucks online" counter badge to the toolbar (e.g. "3 trucks") so dispatcher sees Samsara is live even when they're in board mode
- Surface vehicle fetch errors with a yellow banner on the map
- Verify branch filter matches `SAMSARA_BRANCH_TAGS_JSON` env var format
- Add truck name/speed/last-update to the existing tooltip

**Files:** `src/components/dispatch/DispatchMap.tsx`, `app/dispatch/DispatchClient.tsx`

---

### 1b. Overdue Flag

**Status:** Not implemented. Purely client-side — no API changes needed.

**Definition:** `expect_date < today (local) AND status_flag not in ['D', 'I']`

**Action:**
- StopCard: red left border + "OVERDUE" pill when overdue
- BoardCardGrid: overdue cards get red tint
- RoutesDrawer route columns: overdue stop count badge on column header

**Files:** `app/dispatch/DispatchClient.tsx`

---

### 1c. Route Load Bar

**Status:** Not implemented. No weight data in ERP query — use stop count proxy for now.

**Logic:** `loadPct = routeStops.length / MAX_STOPS_PER_ROUTE` (configurable, default 12)

**Action:**
- RoutesDrawer: add capacity bar under each route header (green <70%, amber <90%, red ≥90%)
- Display as "X / 12 stops · 65%"
- Add a `MAX_STOPS_PER_ROUTE` constant (easy to tune later when we have weight)

**Future upgrade:** When `agility_so_lines.qty_ordered` × item weight is available, replace stop-count proxy with real weight.

**Files:** `app/dispatch/DispatchClient.tsx`

---

## Phase 2 — Dispatcher Can Work the Board

### 2a. Customer Phone in Detail Panel

**Status:** `agility_customers.cust_phone` confirmed present. Just need to add to deliveries query JOIN.

**Action:**
- Add `ac.cust_phone` to `SELECT` in `GET /api/dispatch/deliveries`
- Add `cust_phone: string | null` to `DeliveryStop` interface
- Show in DetailPanel header under customer name with a click-to-call `tel:` link

**Files:** `app/api/dispatch/deliveries/route.ts`, `app/dispatch/DispatchClient.tsx`

---

### 2b. Time Windows per Stop

**Status:** No time-of-day window exists on `agility_so_header`. `expect_date` is a date only.

**Plan:** Add `time_window_start` + `time_window_end` (text, e.g. "10:00"/"12:00") to `dispatch_route_stops` table via Drizzle migration. Dispatcher sets window when assigning a stop to a route. ETA calculated client-side as cumulative drive time estimate (rough: 30 min/stop average or manual entry).

**Migration:** `db/migrations/0016_dispatch_time_windows.sql`
```sql
ALTER TABLE dispatch_route_stops
  ADD COLUMN time_window_start text,
  ADD COLUMN time_window_end   text,
  ADD COLUMN eta_minutes       integer;
```

**UI:** Stop card shows "10:00–12:00" window chip. Detail panel shows ETA field (editable). RoutesDrawer shows cumulative timeline.

**Files:** `db/migrations/0016_dispatch_time_windows.sql`, `app/api/dispatch/routes/[id]/stops/route.ts`, `app/dispatch/DispatchClient.tsx`

---

### 2c. Stop Notes / Special Instructions

**Status:** No notes field in current schema.

**Plan:** Add `notes text` to `dispatch_route_stops`. For unassigned stops, notes live on the stop card as a tooltip (sourced from `agility_so_header.reference` or a new `dispatch_stop_notes` table).

**Migration:** Add to 0016 migration above:
```sql
ALTER TABLE dispatch_route_stops ADD COLUMN notes text;
```

**UI:** Stop card shows a 📝 icon when notes exist (hover to read). Detail panel has an editable notes textarea that PATCH-saves to the route stop.

**Files:** Same as 2b migration + stops route

---

### 2d. Drag-to-Assign (Unassigned Pool → Route)

**Status:** "Assign Route" button exists but is not functional end-to-end. No drag.

**Plan:** Use `@hello-pangea/dnd` (already used elsewhere? check) or native HTML5 drag-and-drop. Unassigned pool on left (map mode) or in RoutesDrawer becomes draggable. Route columns in RoutesDrawer are drop targets.

**Note:** Check if `@hello-pangea/dnd` is in `package.json` before adding. If not, use native `draggable` + `onDrop` to avoid a new dependency.

**Auto-route suggestion:** After drag, show a hint like "Suggest adding to R-202 (nearest, 2 stops)" based on city/geocode proximity. Simple: find route whose stops are closest average lat/lon to dragged stop.

**Files:** `app/dispatch/DispatchClient.tsx`, potentially new `src/components/dispatch/DraggablePool.tsx`

---

### 2e. Global Activity Feed

**Status:** Not built. No dedicated event stream exists. Events can be inferred from `dispatch_route_stops.updated_at` + `status` changes.

**Plan:** Add a new collapsible sidebar panel (right side, board mode only) or a bottom drawer. Poll `GET /api/dispatch/feed?branch=&since=` every 30 s. API queries:
- `dispatch_route_stops` WHERE `updated_at > since` — status changes, assignments
- `agility_shipments` WHERE `ship_date = today AND loaded_date IS NOT NULL` — loading events

**Files:** `app/api/dispatch/feed/route.ts` (new), `app/dispatch/DispatchClient.tsx`

---

## Phase 3 — Dispatcher Can Close the Day

### 3a. POD Viewer

**Status:** "POD Capture" button exists. `/api/dispatch/orders/[so_number]/pod` route exists. No viewer for completed PODs.

**Plan:** In DetailPanel, when `driver_stop_status = 'delivered'`, show POD thumbnail (signature image from R2 if stored) or a "POD on file" badge. Link to full POD view.

**Files:** `app/dispatch/DispatchClient.tsx`, `app/api/dispatch/orders/[so_number]/pod/route.ts`

---

### 3b. Driver Manifest / Run Sheet

**Status:** Global print CSS exists. No route-scoped print view.

**Plan:** "Print Run Sheet" button in RoutesDrawer route header. Opens `/dispatch/run-sheet/[routeId]` in a new tab — a print-optimized page showing route header (driver, truck, date), stop list with address/customer/items/notes/time window, signature line.

**Files:** `app/dispatch/run-sheet/[routeId]/page.tsx` (new server component, no auth redirect)

---

### 3c. Truck & Driver Assignment UI

**Status:** Route records have `driver_name` + `truck_id` fields. The create-route form has them but they're text inputs — no lookup from `dispatch_drivers`.

**Plan:** In RoutesDrawer "New Route" form, replace `driver_name` text input with a dropdown populated from `GET /api/dispatch/drivers` (filtered by branch). Show driver name + phone. Truck_id stays as text for now (no truck registry table yet).

**Future:** Add `dispatch_trucks` table with capacity (weight, length, type: flatbed/boom/van) for real load calculation.

**Files:** `app/dispatch/DispatchClient.tsx`

---

### 3d. Driver Availability Panel

**Status:** `dispatch_drivers` table has `is_active`, `route_code`, `name`, `phone`. No clock-in/out state.

**Plan:** Add `clocked_in boolean DEFAULT false` + `on_route_id int` to `dispatch_drivers` (or compute from assigned routes). Show in RoutesDrawer as a driver roster: Available / On Route / Off.

**Files:** `db/migrations/0017_driver_availability.sql`, `app/api/dispatch/drivers/route.ts`

---

### 3e. Bay / Dock for Staged Orders

**Status:** No bay/dock field anywhere. Staged status (`status_flag = 'S'`) shows on cards.

**Plan:** Add `bay_number text` to `dispatch_route_stops`. Supervisor sets bay when staging. StopCard shows bay chip when staged.

**Files:** Add to 0016 or 0017 migration

---

### 3f. Will-Call Readiness State

**Status:** Will-call orders filtered off by default toggle. No "customer notified" state.

**Plan:** For will-call stops (when toggle is off), add a `wc_notified_at timestamp` to `dispatch_route_stops`. Show as a "Called ✓" / "Not called" chip on the stop card with a one-click "Mark called" button.

**Files:** Migration + stops route + DispatchClient

---

## Phase 4 — Polish

| Item | Notes | Complexity |
|------|-------|------------|
| Keyboard shortcuts (A=assign, U=unassign, L=lock) | Pure client-side, `useEffect` on `keydown` | Low |
| Date picker wired | Already functional — `date` state triggers refetch. Verify UI label shows selected date | Verify only |
| "Open in Agility" deep link | `https://api-1390-1.dmsi.com/...` URL — ask Aaron for the correct deep-link format | Blocked on URL |
| Hide-delivered toggle in toolbar | `hideDelivered` state exists but no UI button — add alongside Will-Call toggle | Low |
| Map zoom/pan buttons | Leaflet has built-in zoom control; `L.control.zoom()` add on init | Low |
| Stop sequence numbers on route | Show "Stop 1 of 8" on card when assigned to a route | Low |
| Arrival / departure timestamps | Add `arrived_at`, `departed_at` to `dispatch_route_stops` | Migration |

---

## Schema Migration Summary

| Migration | Changes |
|-----------|---------|
| `0016_dispatch_time_windows.sql` | `dispatch_route_stops`: `time_window_start`, `time_window_end`, `eta_minutes`, `notes`, `bay_number` |
| `0017_driver_availability.sql` | `dispatch_drivers`: `clocked_in`, `on_route_id`; `dispatch_route_stops`: `wc_notified_at`, `arrived_at`, `departed_at` |

Both to be applied in Supabase SQL editor (not via drizzle-kit — these are `public` schema ERP-adjacent tables).

Wait — `dispatch_routes` and `dispatch_route_stops` are in `public` schema (queried via `getErpSql()`). Confirm: yes, these were created by WH-Tracker migration and live in `public`. Apply migrations manually.

---

## API Route Inventory (current + planned)

| Route | Method | Status | Notes |
|-------|--------|--------|-------|
| `/api/dispatch/deliveries` | GET | ✅ live | Add `cust_phone` (Phase 2a) |
| `/api/dispatch/init` | GET | ✅ live | Routes + route stops + trucks |
| `/api/dispatch/kpis` | GET | ✅ live | Stop/route counts |
| `/api/dispatch/routes` | POST/DELETE | ✅ live | Create/delete routes |
| `/api/dispatch/routes/[id]/stops` | POST/DELETE | ✅ live | Add `time_window`, `notes`, `bay_number` (Phase 2b/3e) |
| `/api/dispatch/vehicles` | GET | ✅ live | Samsara proxy, 15 s poll |
| `/api/dispatch/orders/[so]/lines` | GET | ✅ live | Returns `qty_on_hand` |
| `/api/dispatch/orders/[so]/pod` | POST | ✅ live | POD signature capture |
| `/api/dispatch/orders/[so]/deliver` | POST | ✅ live | Mark delivered |
| `/api/dispatch/orders/[so]/timeline` | GET | ✅ live | Activity events |
| `/api/dispatch/drivers` | GET/POST | ✅ live | Driver roster |
| `/api/dispatch/feed` | GET | 🔲 planned | Global activity stream (Phase 2e) |
| `/dispatch/run-sheet/[routeId]` | page | 🔲 planned | Print manifest (Phase 3b) |

---

## Implementation Order

```
Phase 1 (now)
  ├── 1a: Truck counter badge + error surface
  ├── 1b: Overdue flag (red border + pill)
  └── 1c: Route load bar in RoutesDrawer

Phase 2 (next session)
  ├── 2a: Customer phone in detail panel
  ├── 2b+2c: Time windows + notes (migration 0016)
  ├── 2d: Drag-to-assign
  └── 2e: Global activity feed

Phase 3 (after)
  ├── 3a: POD viewer
  ├── 3b: Run sheet page
  ├── 3c: Driver dropdown in route form
  ├── 3d+3e+3f: Availability / bay / will-call (migration 0017)

Phase 4 (polish)
  └── Keyboard shortcuts, hide-delivered toggle, map zoom buttons, sequence numbers
```
