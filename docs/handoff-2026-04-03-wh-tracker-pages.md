# Agent Handoff — WH-Tracker Page Migration (2026-04-03)

## What Was Done This Session

Audited the WH-Tracker (Python/Flask) reference repo against LiveEdge to identify missing pages and routes, then ported the missing operational surface. All changes are on `main` (commit `c55bca7`).

### Files Added (36 new files, ~3,700 lines)

#### Sales domain
| File | Purpose |
|------|---------|
| `app/api/sales/history/route.ts` | GET invoiced/closed orders — q, customer_number, date_from/to, branch, pagination |
| `app/api/sales/products/route.ts` | GET item catalog search via `erp_mirror_item` + `erp_mirror_item_branch` (min 2 chars) |
| `app/api/sales/reports/route.ts` | GET analytics: daily_orders, by_sale_type, by_ship_via, top_customers, status_breakdown |
| `app/api/sales/customers/[code]/route.ts` | GET customer detail + open orders + history + ship-to |
| `app/sales/transactions/page.tsx` + `TransactionsClient.tsx` | Full-screen order search workspace — all statuses, date/sale type filters, customer links |
| `app/sales/history/page.tsx` + `HistoryClient.tsx` | Invoiced/closed order lookup; search-on-demand (not auto-load) |
| `app/sales/products/page.tsx` + `ProductsClient.tsx` | Item catalog search with handling code badges |
| `app/sales/reports/page.tsx` + `ReportsClient.tsx` | Analytics with mini bar charts — 7/30/90 day period picker |
| `app/sales/customers/[code]/page.tsx` + `CustomerClient.tsx` | Customer profile: address card, open/history/ship-to tabs, links back to transactions |

#### Purchasing domain
| File | Purpose |
|------|---------|
| `app/purchasing/open-pos/page.tsx` + `OpenPosClient.tsx` | Open PO list; overdue rows highlighted red; links to pos detail |
| `app/purchasing/pos/[po]/page.tsx` + `PosDetailClient.tsx` | PO detail: header meta, line items with received qty, check-in shortcut |
| `app/purchasing/review/[id]/page.tsx` + `ReviewDetailClient.tsx` | Review detail: photo grid with modal, reviewer notes textarea, mark reviewed/flagged actions |

#### Warehouse pickers domain
| File | Purpose |
|------|---------|
| `app/api/warehouse/open-picks/route.ts` | Grouped active picks from `pick` + `pickster`; counts today/5-day completions |
| `app/api/warehouse/picker-stats/route.ts` | Aggregate stats per picker: total, today, avg_minutes; configurable `?days=` |
| `app/api/warehouse/pickers/route.ts` | GET list + POST create (supervisor+ for POST) |
| `app/api/warehouse/pickers/[id]/route.ts` | GET detail+picks+stats, PATCH update, DELETE (admin only) |
| `app/warehouse/open-picks/page.tsx` + `OpenPicksClient.tsx` | Active pickers as cards + full table; 30s auto-refresh; links to picker detail |
| `app/warehouse/picker-stats/page.tsx` + `PickerStatsClient.tsx` | Perf table with progress bars and avg time; period toggle |
| `app/warehouse/pickers/page.tsx` + `PickerAdminClient.tsx` | Inline add/edit/delete picker CRUD; confirm on delete |
| `app/warehouse/pickers/[id]/page.tsx` + `PickerDetailClient.tsx` | Active picks + recent completed pick history with duration |

#### Delivery domain
| File | Purpose |
|------|---------|
| `app/api/delivery/locations/route.ts` | Thin proxy to `/api/dispatch/vehicles` — WH-Tracker URL parity |
| `app/delivery/map/page.tsx` + `MapClient.tsx` | Fleet map: vehicle cards with GPS coords, speed, address, moving/stopped; 30s auto-refresh |

#### Navigation
`src/components/nav/TopNav.tsx` — Warehouse, Sales, Purchasing, Delivery converted to dropdown sub-menus (desktop: hover dropdowns with refs; mobile: section headers). Admin menu gains Picker Admin entry.

---

## What's Still Missing

### High priority — data exists, just needs building

#### Purchasing management pages
The WH-Tracker had a full purchasing command center. The data views it relies on are:
- `app_po_header` — already used in `/api/purchasing/pos/[po]` ✅
- `app_po_detail` — already used ✅
- `app_po_search` — already used ✅
- `app_po_receiving_summary` — already used ✅

**But** the command center + buyer workspace relied on additional views/tables:
- `app_purchasing_queue` — work queue for reviewers
- `app_purchasing_approvals` — approval workflow
- `app_purchasing_tasks` — task tracking

**Action needed**: Run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE 'app_purchasing%'` in Supabase SQL editor to confirm which of these views exist. If they do, build:

| Route | WH-Tracker source | Description |
|-------|-------------------|-------------|
| `/purchasing/manage` | `Routes/purchasing/views.py` → `manager_dashboard()` | Command center — work queue, exceptions, approvals |
| `/purchasing/workspace` | `purchasing/views.py` → `buyer_dashboard()` | Buyer workspace — assigned POs, tasks |
| `/purchasing/suggested-buys` | `purchasing/views.py` → `suggested_buys()` | Purchasing recommendations |

API routes needed:
- `GET /api/purchasing/manage/dashboard` — manager metrics (mirrors WH `purchasing/api.py` → `/api/dashboard/manager`)
- `GET /api/purchasing/workspace/dashboard` — buyer workspace data
- `GET /api/purchasing/suggested-buys` — suggestions list

### Medium priority — needs new table in bids schema

#### Customer Notes
WH-Tracker had `/sales/customer-notes/<customer_number>` with GET+POST for notes per customer. It stored in a `CustomerNote` model that does not exist in the `bids` schema.

**Action needed**: Create migration + Drizzle schema entry for `customer_notes` table, then add:
- `GET/POST /api/sales/customers/[code]/notes`
- Notes tab inside `app/sales/customers/[code]/CustomerClient.tsx` (tab slot is already there)

#### Customer Statement
`/sales/customer-statement/<customer_number>` — separate page showing open vs invoiced orders side by side. The data already exists in `/api/sales/customers/[code]` (open_orders + history arrays). Just needs a dedicated page or a Statement tab added to the customer profile.

### Low priority — separate domain, infrastructure dependency

#### RMA Credits (`/credits`)
WH-Tracker's credit module stored uploaded images in a `CreditImage` table populated by an email ingestion service (IMAP scanning for attachments). The images were served from a local uploads directory.

In LiveEdge, this would need:
- `credit_images` table in `bids` schema (or public schema)
- Cloudflare R2 for image storage (the infrastructure already exists via `src/lib/takeoff/r2.ts`)
- Either a cron job or webhook to process incoming email attachments
- Pages: `/credits` (search), `/credits/[rma]` (detail + upload)

This is a significant infrastructure piece. Defer unless there's a specific user request.

---

## Architecture Notes for Next Agent

### ERP query patterns (established, follow these)
```typescript
// Auth check
const session = await auth();
if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// Branch filtering pattern
const isAdmin = session.user.role === 'admin' ||
  (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));
const effectiveBranch = isAdmin ? (searchParams.get('branch') ?? '') : (session.user.branch ?? '');

// ERP query
const sql = getErpSql();  // from 'relative/db/supabase'
const rows = await sql<RowType[]>`
  SELECT ... FROM erp_mirror_so_header
  ${effectiveBranch ? sql`WHERE system_id = ${effectiveBranch}` : sql``}
`;
```

### Local table queries (pick, pickster, work_orders, etc.)
Same `getErpSql()` — these tables live in the `public` schema on the same Supabase instance as the ERP mirror tables. NOT managed by Drizzle.

### Session shape (JWT)
```typescript
session.user.role     // 'admin' | 'estimator' | 'viewer'
session.user.roles    // string[] — WH-Tracker roles e.g. ['purchasing', 'warehouse', 'supervisor']
session.user.branch   // string | null — ERP branch code e.g. '20GR'
session.user.branchId // number | null — legacy numeric branch ID
```

### Role check patterns by domain
| Domain | Required roles |
|--------|----------------|
| Warehouse pages | warehouse, supervisor, ops, admin |
| Purchasing pages | purchasing, warehouse, supervisor, ops, admin |
| Purchasing review | supervisor, ops, admin |
| Picker admin (write) | supervisor, admin |
| Picker admin (delete) | admin only |
| Sales pages | sales, ops, supervisor, admin |
| Delivery/Dispatch | delivery, dispatch, ops, supervisor, admin |

### Page structure convention
```
app/domain/page/
  page.tsx            ← server component: auth check, pass isAdmin+branch as props
  DomainClient.tsx    ← 'use client': all fetch/state/UI
```

### Nav dropdown pattern
Each domain with sub-pages uses a dropdown in `src/components/nav/TopNav.tsx`. Each dropdown has its own `ref` + `open` state. The `WAREHOUSE_LINKS`, `SALES_LINKS`, `PURCHASING_LINKS`, `DELIVERY_LINKS` arrays at the top of TopNav define sub-items. To add a new domain dropdown, follow the same pattern — add a links array and a dropdown block in both the desktop and mobile sections.

---

## Known Issues / Technical Debt

1. **`/api/warehouse/pickers` routes use `getErpSql()`** — these write to the `pickster` table in the public schema. This is correct (pickster is a WH-Tracker app table in public schema, not a Drizzle-managed table), but it's worth noting it's a mix of ERP mirror reads and app table writes through the same connection.

2. **`/api/delivery/locations`** is a server-side HTTP proxy to `/api/dispatch/vehicles`. This adds a network round-trip. If performance is a concern, inline the Samsara logic instead.

3. **Sales transactions page** uses the existing `/api/sales/orders` endpoint which defaults to status `O` (open). The `TransactionsClient` sets default status to `'O'` but passes the user's selection. If users want to see all statuses by default, change the default `status` state from `'O'` to `''`.

4. **Picker stats `avg_minutes`** is computed as `AVG(EXTRACT(EPOCH FROM (completed_time - start_time)) / 60.0)`. If picks have NULL `start_time` or `completed_time`, those rows are excluded from the average (correct behavior, but worth noting).

5. **Fleet map** shows vehicle cards with GPS coordinates but no actual map tile rendering. To add a real map, embed a Leaflet or MapLibre component using the `latitude`/`longitude` fields already in the `Vehicle` interface in `MapClient.tsx`. The map placeholder comment marks the spot.
