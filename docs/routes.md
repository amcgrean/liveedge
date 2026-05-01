# LiveEdge Route Reference

**Last audited: 2026-04-28 (scorecard, management, hubbell, jobs added)**
**API routes: ~175 | Page routes: ~95**

All API routes require a valid NextAuth session (`session?.user`) unless noted as **public**.
Branch-scoped routes respect the active branch cookie; admin users see all branches.

---

## Authentication (`/api/auth/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/auth/[...nextauth]` | GET POST | NextAuth.js handler | Public — handles OAuth callbacks and session |
| `/api/auth/send-otp` | POST | Generate + email 6-digit OTP | Public. Accepts `identifier` (username or email). Rate-limited: 3 codes / 15 min. Requires `RESEND_API_KEY`. Set `AUTH_OTP_CONSOLE=true` to print in dev |
| `/api/auth/request-otp` | POST | Alias for send-otp | Public. Same behavior — kept for backward compatibility |
| `/api/auth/set-branch` | POST | Write branch cookie | Auth required. Sets `branch_id` (httpOnly) + `branch_code` (readable) cookies |

---

## Home & Utilities

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/home` | GET | Personalized dashboard KPIs | Open bids/designs (bids schema) + open picks/WOs/orders (ERP) + top visited pages |
| `/api/dashboard` | GET | Estimating dashboard KPIs | Legacy dashboard: YTD completion, avg time, recent activity. Used by `/dashboard` |
| `/api/track-visit` | POST | Record page visit for Quick Access | Upserts `bids.page_visits`. Soft-fails if table missing |
| `/api/all-bids` | GET | Unified bid search | Merges legacy bids + estimator bids into one list |
| `/api/search` | GET | Global cross-entity search | Hits customers, bids, designs, EWP |
| `/api/designers` | GET | Designer list | Reads `bids.legacyDesigner`. Used by bid/design forms |
| `/api/files` | GET POST | File list + upload | Supports `entity_type` / `entity_id` params. Stores keys in R2 |
| `/api/files/[id]` | GET DELETE | File detail + presigned download URL | Deletes from R2 and DB |
| `/api/products` | GET | Product master list (bids schema) | Internal product catalog; distinct from ERP items |
| `/api/products/[id]` | GET PATCH DELETE | Product detail/update/delete | Admin-gated writes |

---

## Warehouse & Picking (`/api/warehouse/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/warehouse/stats` | GET | Branch dashboard stats | Open picks + open WOs count. Admin sees all branches |
| `/api/warehouse/picks` | GET | Open picks board | 30-day window from `agility_picks`. Returns SOs with handling codes + assigned picker |
| `/api/warehouse/picks/assign` | GET POST | Get / set picker assignments | `POST` with `null` picker_id unassigns |
| `/api/warehouse/picks/create-pick-file` | POST | Create pick file in Agility ERP | Requires supervisor/ops/admin role. Validates SO status (K/P/S only). Optional `print` flag |
| `/api/warehouse/open-picks` | GET | Active picks by picker | Reads local `pick` + `pickster` tables. Returns 5-day counts |
| `/api/warehouse/picker-stats` | GET | Aggregate picker performance | `?days=30` (1–365). Avg time per pick, total picks |
| `/api/warehouse/pickers` | GET POST | List / add pickers | Branch filter optional on GET |
| `/api/warehouse/pickers/[id]` | GET PATCH DELETE | Picker detail, stats, update, delete | GET includes recent picks + performance stats |
| `/api/warehouse/orders/[so_number]` | GET | Full SO detail (warehouse view) | **Public — no auth.** Header, lines, picks, shipments, assigned picker. Data from `agility_*` |
| `/api/warehouse/orders/[so_number]/release-pick` | POST | Create pick file from dispatch | Requires dispatch/ops/admin. Same logic as create-pick-file |

---

## Dispatch & Delivery (`/api/dispatch/`, `/api/delivery/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/dispatch/routes` | GET POST | List / create dispatch routes | Branch-scoped for non-admin. Date filter on GET |
| `/api/dispatch/routes/[id]` | PUT DELETE | Update / delete route | Requires dispatch/ops/admin. Cascades delete to stops |
| `/api/dispatch/routes/[id]/stops` | GET POST | Manage route stops | Maps SO numbers → delivery stops |
| `/api/dispatch/routes/[id]/stops/[stopId]` | PATCH DELETE | Update / delete individual stop | Stop-level editing |
| `/api/dispatch/routes/[id]/details` | GET | Full route manifest | Route + all stop info |
| `/api/dispatch/drivers` | GET POST | List / add drivers | Branch-scoped. `is_active` flag |
| `/api/dispatch/drivers/[id]` | PATCH DELETE | Update / delete driver | Requires dispatch/ops |
| `/api/dispatch/vehicles` | GET POST | Truck master data | Branch-scoped |
| `/api/dispatch/truck-assignments` | GET POST | Truck–route assignments | |
| `/api/dispatch/truck-assignments/copy-previous` | POST | Copy previous day's assignments | |
| `/api/dispatch/truck-assignments/[id]` | PATCH DELETE | Update / unassign truck | |
| `/api/dispatch/deliveries` | GET | Delivery stops for a date | Joins ERP + local stops. AR balance lookup is non-fatal |
| `/api/dispatch/kpis` | GET | Route / delivery KPIs | |
| `/api/dispatch/orders/[so_number]/deliver` | POST | Mark order delivered | Status update + timestamp via Agility API |
| `/api/dispatch/orders/[so_number]/lines` | GET | SO line items | ERP `agility_so_lines` |
| `/api/dispatch/orders/[so_number]/pod` | GET POST | Proof-of-delivery data | Photo + signature storage |
| `/api/dispatch/orders/[so_number]/timeline` | GET | SO event timeline | pick → ship → delivery |
| `/api/dispatch/transfers` | GET | Inter-branch transfer SOs + POs | Returns `{ outbound: TransferSO[], inbound: TransferPO[] }`. Outbound = open SOs with `sale_type='T'` from this branch. Inbound = open POs where `supplier_code` is another Beisser branch. Branch-scoped for non-admin |
| `/api/delivery/tracker` | GET | Today + overdue delivery statuses | K/P/S statuses, fleet GPS panel. Also used by `/sales/deliveries` and `/sales/tracker` |
| `/api/delivery/locations` | GET | Live vehicle GPS positions | Proxies Samsara via `SAMSARA_API_TOKEN`. Returns fleet map data |
| `/api/pod/[so]/photos` | GET POST | POD photo management | R2 upload + presigned download |

---

## Sales Hub (`/api/sales/hub`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/sales/hub` | GET | Personalized sales rep dashboard data | KPIs (open orders, will calls, quotes, designs, POs), top customers (30d), recent transactions, recent bid/design activity. Resolves rep via `agent_id` or `username` from `app_users`. Branch-scoped |

---

## Sales (`/api/sales/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/sales/orders` | GET | List sales orders | Filters: status, date range, sale type, branch, customer. Pagination. Also used by `/sales/transactions` page |
| `/api/sales/orders/[so_number]` | GET | SO detail | Header + line items from `agility_*` |
| `/api/sales/orders/[so_number]/shipments` | GET | Shipment history | Invoice/ship dates from `agility_shipments` |
| `/api/sales/orders/[so_number]/push-to-erp` | POST | Manual Agility sync | Calls `agilityApi.call()` passthrough |
| `/api/sales/metrics` | GET | Branch sales KPIs | YTD/month revenue, order counts. Also used by `/sales/reports` |
| `/api/sales/reports` | GET | Custom report data | Exportable |
| `/api/sales/history` | GET | Customer purchase history | Invoiced/closed orders |
| `/api/sales/products` | GET | Item master search | Reads `agility_items`. Stale mirror — use `/api/erp/price-check` for live pricing |
| `/api/sales/customers` | GET | Customer search | Queries `agility_customers` |
| `/api/sales/customers/[code]` | GET | Customer detail | Credit limit, AR balance, ship-tos |
| `/api/sales/customers/[code]/ar` | GET | AR aging report | Aging buckets from `agility_ar_open` |
| `/api/sales/customers/[code]/ar-live` | GET | Real-time AR balance | Live Agility API call via `customerOpenActivity()` |
| `/api/sales/customers/[code]/notes` | GET POST | Customer notes | Internal notes stored in `public.customer_notes` |

---

## Purchasing (`/api/purchasing/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/purchasing/pos/open` | GET | Open purchase orders | Queries `agility_po_header` directly — `app_po_search` view does not exist |
| `/api/purchasing/pos/[po]` | GET | PO detail + receipt history | Line items + receiving summary |
| `/api/purchasing/pos/[po]/notes` | GET POST | PO internal notes | |
| `/api/purchasing/pos/[po]/live` | GET | Real-time PO status | Live Agility `purchaseOrderGet()` |
| `/api/purchasing/submissions` | GET POST | Check-in photo submissions | Branch-scoped. R2 image URLs |
| `/api/purchasing/submissions/[id]` | GET PUT | Review submission | Status transitions: pending → reviewed / flagged |
| `/api/purchasing/tasks` | GET POST PATCH | Purchasing workflow tasks | Reads `public.purchasing_tasks`. Queue for buyers. PATCH updates status |
| `/api/purchasing/exceptions` | GET | Late PO / qty anomalies | Alert system for buyers |
| `/api/purchasing/suggested-buys` | GET | Replenishment suggestions | Reads `agility_suggested_po_header` + `agility_suggested_po_lines` |
| `/api/purchasing/suggested-buys/[ppo_id]` | POST | Convert suggestion → PO | Calls Agility API to place order |
| `/api/purchasing/photos` | GET | Receiving yard photos | R2-backed attachments |
| `/api/purchasing/search` | GET | PO full-text search | |
| `/api/purchasing/admin/refresh-cache` | POST | Force cache invalidation | Admin only |

---

## Takeoff & Estimating (`/api/takeoff/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/takeoff/sessions` | GET POST | List / create takeoff sessions | Links to legacy bids. POST auto-seeds preset groups from bid's spec flags |
| `/api/takeoff/sessions/[sessionId]` | GET PUT DELETE | Session detail / update / delete | DELETE cascades all related records |
| `/api/takeoff/sessions/[sessionId]/pdf` | GET | Stream PDF from R2 | Falls back to `legacyBidFile` if no direct R2 key. Supports `mode=url` (direct R2) or `mode=download` (proxy) |
| `/api/takeoff/sessions/[sessionId]/upload` | GET POST PUT | PDF upload flow | GET → presign, POST → proxy (4.5 MB limit), PUT → confirm key |
| `/api/takeoff/sessions/[sessionId]/pages` | GET POST | PDF page state | Per-page viewport/zoom state |
| `/api/takeoff/sessions/[sessionId]/measurements` | GET POST PUT DELETE | Measurement entries | Linear / area / count types |
| `/api/takeoff/sessions/[sessionId]/groups` | GET POST PUT DELETE | Measurement groups | Category org. `is_preset` flag |
| `/api/takeoff/sessions/[sessionId]/viewports` | GET POST | Canvas viewport definitions | Zoom, pan, scale calibration |
| `/api/takeoff/sessions/[sessionId]/send-to-estimate` | POST | Write totals → linked bid | Maps preset `targetField` values to `JobInputs` fields |
| `/api/takeoff/assemblies` | GET POST | Reusable assembly templates | |
| `/api/takeoff/assemblies/[id]` | GET PATCH DELETE | Assembly detail / update | |

---

## Legacy Bids (`/api/legacy-bids/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/legacy-bids` | GET POST | List / create legacy bids | Branch-scoped. Search by project name or customer. POST logs activity |
| `/api/legacy-bids/[id]` | GET PUT DELETE | Bid detail / update / delete | GET includes linked `takeoffSession` summary. PUT upserts dynamic field values + logs activity |
| `/api/legacy-bids/[id]/activity` | GET | Activity log | Reads `bids.legacyBidActivity` |
| `/api/legacy-bids/[id]/files` | GET POST DELETE | Bid file attachments | POST returns presigned R2 upload URL; proxy fallback on download |
| `/api/legacy-bids/[id]/ship-tos` | GET | Customer ship-to addresses | Reads from linked ERP customer |
| `/api/legacy-bids/[id]/start-takeoff` | POST | Create linked takeoff session | Creates `bids` record + `takeoffSession`. Spec flags pre-filter which presets load |
| `/api/legacy-bids/[id]/push-to-erp` | POST | Push bid to Agility as SO or Quote | Calls `salesOrderCreate()` or `quoteCreate()`. Requires estimator role |
| `/api/legacy-bids/[id]/promote-quote` | POST | Release quote → SO in Agility | Calls `quoteRelease()`. Requires estimator role |

---

## Estimator Bids (`/api/bids/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/bids` | GET POST | List / create estimator bids | UUID-based. Status filter: draft/submitted/won. Non-admin sees own bids only |
| `/api/bids/[id]` | GET PUT DELETE | Bid detail / update / delete | JSONB `inputs` field. Version tracking |

---

## Designs (`/api/designs/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/designs` | GET POST | List / create designs | Branch-scoped. Plan number auto-generated as `D-YYMM-NNN` on POST |
| `/api/designs/[id]` | GET PUT DELETE | Design detail / update / delete | Writes activity log on mutation |

---

## EWP (`/api/ewp/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/ewp` | GET POST | List / create EWP records | Branch-scoped. Activity tracked via `legacyGeneralAudit` |
| `/api/ewp/[id]` | GET PATCH DELETE | EWP detail / update / delete | |
| `/api/ewp/import` | POST | Bulk import from CSV | Admin only |

---

## Customers (Internal) (`/api/customers/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/customers` | GET POST | List / add legacy customers | Serial-ID `bids.legacyCustomer` table. Not the ERP customer table |
| `/api/customers/[id]` | GET PUT | Customer detail / update | |
| `/api/customers/[id]/bids` | GET | Customer's legacy bids | |
| `/api/customers/[id]/designs` | GET | Customer's designs | |
| `/api/customers/[id]/ewp` | GET | Customer's EWP records | |

---

## ERP Integration (`/api/erp/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/erp/items` | GET | Item master search | Reads `agility_items` mirror. Stale — use `/api/erp/price-check` for live |
| `/api/erp/price-check` | POST | Real-time item pricing + availability | Calls Agility `ItemPriceAndAvailabilityList`. Max 100 items per request |
| `/api/erp/customers/[code]` | GET | ERP customer detail | Reads `agility_customers` |
| `/api/erp/customers/[code]/ship-to` | GET | Ship-to addresses | Multi-location support |

---

## Credits / RMA (`/api/credits/`, `/api/inbound/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/credits` | GET POST | List / create RMA credit records | Reads `public.credit_images`. Image filepaths are legacy WH-Tracker local paths — not R2 yet |
| `/api/credits/[id]/image` | GET POST | Credit memo photo | R2-backed |
| `/api/inbound/credits` | POST | Webhook: inbound RMA from external system | Validates webhook secret. Inserts into `public.credit_images` |

---

## Work Orders (`/api/work-orders/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/work-orders/open` | GET | Open work orders | Reads `agility_wo_header`. Department filter available |
| `/api/work-orders/search` | GET | WO search | Full-text against ERP |
| `/api/work-orders/assignments` | GET POST | WO assignments | Assigns WO to picker / technician |
| `/api/work-orders/assignments/[id]` | PATCH DELETE | Update / unassign | Status tracking |

---

## IT Issues (`/api/it-issues/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/it-issues` | GET POST | List / create IT issues | |
| `/api/it-issues/[id]` | GET PATCH DELETE | Issue detail / update / close | |

---

## Projects (`/api/projects/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/projects` | GET POST | List / create projects | |
| `/api/projects/[id]` | GET PATCH DELETE | Project detail / update | |

---

## Kiosk & TV Displays (`/api/kiosk/`, `/api/tv/`)

| Route | Methods | Purpose | Auth | Notes |
|-------|---------|---------|------|-------|
| `/api/kiosk/picks` | GET | Kiosk pick queue | Optional | Warehouse floor display format |
| `/api/kiosk/pickers` | GET | Available pickers list | Optional | For kiosk assignment UI |
| `/api/kiosk/work-orders` | GET | Kiosk WO queue | Optional | Department-scoped |
| `/api/kiosk/smart-scan` | POST | Barcode scan processor | Optional | Pick completion + SKU validation |
| `/api/tv/picks` | GET | TV-formatted pick list | **Public** | No auth. Public display format |

---

## Supervisor (`/api/supervisor/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/supervisor/pickers` | GET | Picker status board | Active / assigned / idle states. 30s refresh cadence expected |

---

## Ops (`/api/ops/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/ops/delivery-reporting` | GET POST | Delivery analytics + overrides | Requires ops/admin. Bar chart data + CSV export. POST for manual overrides |

---

## Management & Scorecard (`/api/management/`, `/api/scorecard/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/management` | GET | Management dashboard KPIs | 3-year revenue/GM%, branch comparison, sale-type breakdown. Admin/management/ops/supervisor |
| `/api/management/forecast` | GET | Open-order forecast data | Aggregated by branch + date. Requires admin/management |
| `/api/scorecard` | GET | Customer scorecard list | All customers with YTD sales, GM%, VA%, Non-Stock%. Sortable |
| `/api/scorecard/overview` | GET | Company-level aggregate scorecard | All branches combined, 3-year comparison |
| `/api/scorecard/branch/[branchId]` | GET | Branch scorecard | Per-branch 3-year KPIs + top customers + product mix |
| `/api/scorecard/rep` | GET | All-rep scorecard | Assigned book vs written-up sales per rep |
| `/api/scorecard/rep/[repCode]` | GET | Rep detail scorecard | Per-rep 3-year + product mix. `repCode` = ERP rep code (uppercase) |
| `/api/scorecard/product` | GET | Product group scorecard | Product-mix treemap + concentration Pareto. All customers |
| `/api/scorecard/[customerId]` | GET | Customer detail scorecard | 3-year KPIs, product mix, days-to-pay, sale-type breakdown |

---

## Admin Jobs & Hubbell (`/api/admin/jobs/`, `/api/admin/hubbell/`, `/api/inbound/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/admin/jobs` | GET | Job review list | Paginated SO list with GPS match status. Search + filter by branch/status/GPS. Admin only |
| `/api/admin/jobs/[so_id]` | GET | Job detail | SO header, customer card, GPS coordinates, ship-to address. Admin only |
| `/api/admin/hubbell/emails` | GET | Hubbell email inbox | Tabbed by match status (Pending/Matched/Confirmed/No Match/Rejected). Paginated 50/page |
| `/api/admin/hubbell/emails/[id]` | GET POST | Email detail + actions | POST body: `{ action: 'confirm' | 'reject' | 'reset', soId? }` |
| `/api/admin/hubbell/jobs` | GET | Hubbell jobs list | One row per job site, aggregates confirmed emails |
| `/api/admin/hubbell/jobs/[soId]` | GET | Hubbell job detail | SO header, reconciliation table, unmatched email warnings |
| `/api/inbound/hubbell` | POST | Hubbell inbound email webhook | Resend `email.received` events to `hubbell@beisser.cloud`. Stores in `bids.hubbell_emails` |
| `/api/inbound/credits` | POST | RMA credits inbound email webhook | Resend events to `*@rma.beisser.cloud`. Uploads attachments to R2, upserts `public.credit_images` |

---

## Admin (`/api/admin/`)

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/admin/users` | GET POST PATCH DELETE | Full user management | Reads/writes `public.app_users`. Authoritative for auth. Supports role array, branch, active flag |
| `/api/admin/users/[id]` | GET PATCH DELETE | User detail / update / delete | bcrypt password hashing via `bcryptjs` |
| `/api/admin/users/[id]/permissions` | GET PATCH | Role management | Array-based roles: admin, estimator, purchasing, dispatch, ops, warehouse, supervisor |
| `/api/admin/users/export` | GET | Export user list | CSV / JSON |
| `/api/admin/users/rehash-passwords` | POST | Batch upgrade bcrypt rounds | One-time utility |
| `/api/admin/app-users` | GET PUT | OTP user list / upsert | **Likely unused** — frontend page `/admin/app-users` was deleted (2026-04-17). `/api/admin/users` covers the same table with full CRUD |
| `/api/admin/app-users/[id]` | PATCH | Update individual OTP user | **Likely unused** — same as above |
| `/api/admin/bid-fields` | GET POST | Custom bid field definitions | |
| `/api/admin/bid-fields/[id]` | PATCH DELETE | Update / delete bid field | |
| `/api/admin/notifications` | GET POST | Create notifications | Push / in-app |
| `/api/admin/notifications/[id]` | PATCH DELETE | Update / delete notification | |
| `/api/admin/multipliers` | GET POST | Pricing multipliers | Branch / customer-level |
| `/api/admin/analytics` | GET | System usage analytics | Page visits, module activity |
| `/api/admin/audit` | GET | Audit log | System-wide activity from `bids.generalAudit` |
| `/api/admin/customers/import` | POST | Batch customer import | CSV / JSON ingest |
| `/api/admin/customers/export` | GET | Export customer list | |
| `/api/admin/agility/status` | GET | Agility API env-var check | No network call — checks vars present only |
| `/api/admin/agility/test` | POST | Live Agility API test | 4-step: Login → Version → BranchList → Logout. Accepts optional `{ branch }` body |
| `/api/admin/erp/status` | GET | ERP sync status | Last sync time, queue depth |
| `/api/admin/erp/sync` | POST | Trigger manual ERP sync | Async job; calls `runErpSync()` |
| `/api/admin/erp/introspect` | GET | ERP schema inspection | Table + column discovery |
| `/api/admin/erp/query` | POST | Direct ERP SQL passthrough | **Debug only.** Requires admin. No allowlisting — restrict or remove in production |

---

## Cron Jobs

| Route | Methods | Purpose | Notes |
|-------|---------|---------|-------|
| `/api/cron/erp-sync` | GET | Scheduled ERP sync | Vercel cron — runs daily at 06:00 UTC. Auth via `Authorization: Bearer {CRON_SECRET}` |

---

## Page Routes

### Public / Auth
| Page | Route | Notes |
|------|-------|-------|
| Login | `/login` | 2-step OTP form (username → code). Replaces all legacy login pages |
| Ops Login (redirect) | `/ops-login` | Redirects to `/login` |

### Home & Navigation
| Page | Route | API Used |
|------|-------|----------|
| Home / Dashboard | `/` | `/api/home` |
| Legacy Dashboard (redirect) | `/dashboard` | Redirects to `/` |
| Management Dashboard | `/management` | `/api/management` |
| Management Forecast | `/management/forecast` | `/api/management/forecast` |
| Global Search | `/search` | `/api/search` |
| All Bids | `/all-bids` | `/api/all-bids` |
| Help | `/help` | Static content, no API |
| IT Issues | `/it-issues` | `/api/it-issues` |
| IT Issue Detail | `/it-issues/[id]` | `/api/it-issues/[id]` |

### Warehouse (all at `/warehouse/*`)
| Page | Route | API Used |
|------|-------|----------|
| Picks Board | `/warehouse` | `/api/warehouse/stats`, `/api/warehouse/picks` |
| Open Picks | `/warehouse/open-picks` | `/api/warehouse/open-picks` |
| Picker Stats | `/warehouse/picker-stats` | `/api/warehouse/picker-stats` |
| Picker Management | `/warehouse/pickers` | `/api/warehouse/pickers` |
| Picker Detail | `/warehouse/pickers/[id]` | `/api/warehouse/pickers/[id]` |
| SO Detail (warehouse) | `/warehouse/orders/[so_number]` | `/api/warehouse/orders/[so_number]` |

### Dispatch & Delivery
| Page | Route | API Used |
|------|-------|----------|
| Branch Transfers | `/dispatch/transfers` | `/api/dispatch/transfers` |
| Dispatch Board | `/dispatch` | `/api/dispatch/deliveries`, `/api/dispatch/routes` |
| Driver Management | `/dispatch/drivers` | `/api/dispatch/drivers` |
| POD Viewer | `/dispatch/pod/[so]` | `/api/dispatch/orders/[so_number]/pod` |
| Delivery Tracker | `/delivery` | `/api/delivery/tracker` |
| Fleet Map | `/delivery/map` | `/api/delivery/locations` |
| Driver Mobile View | `/driver` | `/api/dispatch/routes` |
| Active Route | `/driver/route/[id]` | `/api/dispatch/routes/[id]/stops` |

### Sales
| Page | Route | API Used |
|------|-------|----------|
| Sales Hub | `/sales` | `/api/sales/hub` |
| Customers | `/sales/customers` | `/api/sales/customers` |
| Customer Detail | `/sales/customers/[code]` | `/api/sales/customers/[code]`, AR, notes |
| Sales Orders | `/sales/orders/[so_number]` | `/api/sales/orders/[so_number]` |
| Transactions | `/sales/transactions` | `/api/sales/orders` (shared) |
| Order Tracker | `/sales/tracker` | `/api/delivery/tracker` |
| Deliveries | `/sales/deliveries` | `/api/delivery/tracker` |
| Purchase History | `/sales/history` | `/api/sales/history` |
| Products & Stock | `/sales/products` | `/api/sales/products` |
| Reports | `/sales/reports` | `/api/sales/metrics`, `/api/sales/reports` |

### Purchasing
| Page | Route | API Used |
|------|-------|----------|
| PO Check-In | `/purchasing` | `/api/purchasing/submissions` |
| Open POs | `/purchasing/open-pos` | `/api/purchasing/pos/open` |
| PO Detail | `/purchasing/pos/[po]` | `/api/purchasing/pos/[po]` |
| Review Queue | `/purchasing/review` | `/api/purchasing/submissions` |
| Review Detail | `/purchasing/review/[id]` | `/api/purchasing/submissions/[id]` |
| Suggested Buys | `/purchasing/suggested-buys` | `/api/purchasing/suggested-buys` |
| Exceptions | `/purchasing/exceptions` | `/api/purchasing/exceptions` |
| Buyer Workspace | `/purchasing/workspace` | `/api/purchasing/pos/open`, `/api/purchasing/submissions` |
| Command Center | `/purchasing/manage` | `/api/purchasing/pos/open`, `/api/purchasing/exceptions` |

### Customer Scorecard
| Page | Route | API Used |
|------|-------|----------|
| Scorecard List | `/scorecard` | `/api/scorecard` |
| Company Overview | `/scorecard/overview` | `/api/scorecard/overview` |
| Branch Scorecard | `/scorecard/branch/[branchId]` | `/api/scorecard/branch/[branchId]` |
| All-Rep Scorecard | `/scorecard/rep` | `/api/scorecard/rep` |
| Rep Detail | `/scorecard/rep/[repCode]` | `/api/scorecard/rep/[repCode]` |
| Product Scorecard | `/scorecard/product` | `/api/scorecard/product` |
| Customer Detail | `/scorecard/[customerId]` | `/api/scorecard/[customerId]` |

### Estimating & Takeoff
| Page | Route | API Used |
|------|-------|----------|
| Estimating App (legacy) | `/estimating` | Legacy AJAX (Flask-era) |
| Bids Hub (tabbed) | `/bids` | `/api/legacy-bids`, `/api/bids`, `/api/all-bids` |
| Legacy Bids (redirects) | `/legacy-bids` | Redirects to `/bids?tab=open` |
| Legacy Bid Detail | `/legacy-bids/[id]` | `/api/legacy-bids/[id]` |
| Add Legacy Bid | `/legacy-bids/add` | `/api/legacy-bids` |
| Completed Bids | `/legacy-bids/completed` | `/api/legacy-bids?status=completed` |
| Takeoff Sessions | `/takeoff` | `/api/takeoff/sessions` |
| Takeoff Workspace | `/takeoff/[sessionId]` | All `/api/takeoff/sessions/[sessionId]/*` routes |
| Projects | `/projects` | `/api/projects` |
| Project Detail | `/projects/[id]` | `/api/projects/[id]` |

### Designs & EWP
| Page | Route | API Used |
|------|-------|----------|
| Designs | `/designs` | `/api/designs` |
| Design Detail | `/designs/[id]` | `/api/designs/[id]` |
| Add Design | `/designs/add` | `/api/designs` |
| EWP List | `/ewp` | `/api/ewp` |
| EWP Detail | `/ewp/[id]` | `/api/ewp/[id]` |
| Add EWP | `/ewp/add` | `/api/ewp` |

### Credits & Other
| Page | Route | API Used |
|------|-------|----------|
| RMA Credits | `/credits` | `/api/credits` |
| Work Orders | `/work-orders` | `/api/work-orders/open` |
| Supervisor | `/supervisor` | `/api/supervisor/pickers` |
| Ops Delivery Report | `/ops/delivery-reporting` | `/api/ops/delivery-reporting` |
| Customer Bids | `/customers/[id]/bids` | `/api/customers/[id]/bids` |

### Admin
| Page | Route | API Used |
|------|-------|----------|
| Admin Home | `/admin` | Multiple admin APIs |
| Users | `/admin/users` | `/api/admin/users` |
| User Permissions | `/admin/users/[id]/permissions` | `/api/admin/users/[id]/permissions` |
| Customers | `/admin/customers` | `/api/customers` |
| Customer Detail | `/admin/customers/[id]` | `/api/customers/[id]`, bids, designs, EWP |
| Products/SKUs | `/admin/products` | `/api/products` |
| Formulas | `/admin/formulas` | Internal |
| Bid Fields | `/admin/bid-fields` | `/api/admin/bid-fields` |
| Notifications | `/admin/notifications` | `/api/admin/notifications` |
| Audit Log | `/admin/audit` | `/api/admin/audit` |
| ERP Sync | `/admin/erp` | `/api/admin/erp/*`, `/api/admin/agility/*` |
| Analytics | `/admin/analytics` | `/api/admin/analytics` |
| Job Review | `/admin/jobs` | `/api/admin/jobs` |
| Job Detail | `/admin/jobs/[so_id]` | `/api/admin/jobs/[so_id]` |
| Hubbell Inbox | `/admin/hubbell` | `/api/admin/hubbell/emails` |
| Hubbell Email Detail | `/admin/hubbell/[id]` | `/api/admin/hubbell/emails/[id]` |
| Hubbell Jobs | `/admin/hubbell/jobs` | `/api/admin/hubbell/jobs` |
| Hubbell Job Detail | `/admin/hubbell/jobs/[soId]` | `/api/admin/hubbell/jobs/[soId]` |

### Floor Displays (low/no auth)
| Page | Route | Auth | Notes |
|------|-------|------|-------|
| Kiosk | `/kiosk/[branch]` | Optional | Warehouse floor pick assignment terminal |
| TV Board | `/tv/[branch]` | **None** | Public pick list display |

---

## Known Issues & Notes

### `admin/app-users` is largely redundant
`/api/admin/app-users` (GET/PUT) and `/api/admin/app-users/[id]` (PATCH) read/write `public.app_users` but are not called by any frontend page. The `/api/admin/users` routes cover the same table with full CRUD. These can be removed if confirmed unused by external tooling.

### `admin/erp/query` is a raw SQL passthrough
`POST /api/admin/erp/query` executes arbitrary SQL against the ERP database with no allowlisting. It is admin-gated but should be audited or removed before any external exposure.

### `warehouse/orders/[so_number]` has no auth
Intentionally public to support kiosk/scanner flows. Confirm the data returned is non-sensitive before widening access.

### `sales/transactions` page shares the orders API
`/sales/transactions` uses `/api/sales/orders` directly — there is no separate `/api/sales/transactions` route and none is needed.

### Credits images are not yet in R2
`/api/credits` returns `filepath` values that are legacy WH-Tracker local filesystem paths. Image serving requires the R2 pipeline described in CLAUDE.md Pending Actions.

### `purchasing_tasks` table must exist in `public` schema
`/api/purchasing/tasks` queries `public.purchasing_tasks`. Verify the table exists before using `/purchasing/workspace` or `/purchasing/manage` pages that may surface tasks.
