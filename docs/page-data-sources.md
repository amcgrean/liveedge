# Page Data Sources

Shows every page, the API routes it calls, and where each route's data comes from.

**Last updated: 2026-04-17**

### Data source key

| Symbol | Meaning |
|--------|---------|
| 🟢 **App DB** | Bids schema (`bids.*`) — our own tables, Drizzle ORM, `getDb()` |
| 🔵 **ERP Mirror** | Synced `agility_*` / `public.*` snapshot tables in Supabase — `getErpDb()` / `getErpSql()`. Data is up to ~4h stale |
| 🔴 **DMSi API** | Live call to DMSi AgilityPublic REST API — `agilityApi.*`. Always current |
| 🟠 **R2** | Cloudflare R2 file storage (PDFs, photos, attachments) |
| ⚪ **External** | Third-party API (Samsara GPS, Resend email) |

---

## Home & Navigation

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/` Home | `/api/home` | 🟢 App DB + 🔵 ERP Mirror | Open bids/designs from bids schema; open picks/WOs/orders from agility_* mirror |
| `/search` | `/api/search` | 🟢 App DB | Customers, bids, designs, EWP from bids schema |
| `/all-bids` | `/api/all-bids` | 🟢 App DB | Merges legacy bids + estimator bids, both in bids schema |
| `/help` | — | Static | No API calls |
| `/it-issues` | `/api/it-issues` | 🟢 App DB | |
| `/it-issues/[id]` | `/api/it-issues/[id]` | 🟢 App DB | |

---

## Warehouse

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/warehouse` Picks Board | `/api/warehouse/stats` | 🟢 App DB | Open pick/WO counts from local tables |
| | `/api/warehouse/picks` | 🔵 ERP Mirror | 30-day window from `agility_picks` + `agility_so_lines` |
| `/warehouse/open-picks` | `/api/warehouse/open-picks` | 🟢 App DB | Local `pick` + `pickster` tables only |
| `/warehouse/picker-stats` | `/api/warehouse/picker-stats` | 🟢 App DB | Local `pick` table; configurable day range |
| `/warehouse/pickers` | `/api/warehouse/pickers` | 🟢 App DB | Local `pickster` table |
| `/warehouse/pickers/[id]` | `/api/warehouse/pickers/[id]` | 🟢 App DB | Picker detail + recent picks + stats |
| `/warehouse/orders/[so_number]` | `/api/warehouse/orders/[so_number]` | 🔵 ERP Mirror | Header/lines/picks/shipments from `agility_*`; assigned picker from App DB |

---

## Dispatch & Delivery

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/dispatch/transfers` Branch Transfers | `/api/dispatch/transfers` | 🔵 ERP Mirror | Outbound: `agility_so_header` filtered by `sale_type='T'`. Inbound: `agility_po_header` where `supplier_code` is a Beisser branch code |
| `/dispatch` Dispatch Board | `/api/dispatch/deliveries` | 🔵 ERP Mirror + 🟢 App DB | Delivery stops from `agility_so_header`; route/stop assignments from App DB; AR balance lookup is non-fatal |
| | `/api/dispatch/routes` | 🟢 App DB | Route records |
| `/dispatch/drivers` | `/api/dispatch/drivers` | 🟢 App DB | |
| `/dispatch/pod/[so]` | `/api/dispatch/orders/[so_number]/pod` GET | 🟢 App DB | POD records |
| | `/api/dispatch/orders/[so_number]/pod` POST | 🔴 DMSi API + 🟢 App DB | `PODSignatureCreate` writes to Agility; photo stored in App DB |
| `/delivery` Delivery Tracker | `/api/delivery/tracker` | 🔵 ERP Mirror | K/P/S delivery statuses from `agility_so_header` |
| `/delivery/map` Fleet Map | `/api/delivery/locations` | ⚪ External | Samsara GPS API (`SAMSARA_API_TOKEN`) |
| `/driver` | `/api/dispatch/routes` | 🟢 App DB | |
| `/driver/route/[id]` | `/api/dispatch/routes/[id]/stops` | 🟢 App DB | |
| `/dispatch/orders/[so_number]` deliver action | `/api/dispatch/orders/[so_number]/deliver` | 🔴 DMSi API | `ShipmentInfoUpdate` marks delivery complete |
| `/dispatch/orders/[so_number]` timeline | `/api/dispatch/orders/[so_number]/timeline` | 🔵 ERP Mirror + 🟢 App DB | Pick/ship events from ERP; delivery timestamps from App DB |

---

## Sales

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/sales` Sales Hub | `/api/sales/metrics` | 🔵 ERP Mirror | YTD/month revenue, order counts from `agility_so_header` |
| `/sales/customers` | `/api/sales/customers` | 🔵 ERP Mirror | Searches `agility_customers` |
| `/sales/customers/[code]` | `/api/sales/customers/[code]` | 🔵 ERP Mirror | Customer detail, credit limit, ship-tos from `agility_customers` |
| | `/api/sales/customers/[code]/ar` | 🔵 ERP Mirror | Aging buckets from `agility_ar_open` |
| | `/api/sales/customers/[code]/ar-live` | 🔴 DMSi API | `CustomerOpenActivity` — live AR balance, bypasses mirror |
| | `/api/sales/customers/[code]/notes` | 🟢 App DB | Internal notes in `public.customer_notes` |
| `/sales/orders/[so_number]` | `/api/sales/orders/[so_number]` | 🔵 ERP Mirror | Header + lines from `agility_so_header` / `agility_so_lines` |
| | `/api/sales/orders/[so_number]/shipments` | 🔵 ERP Mirror | `agility_shipments` |
| `/sales/transactions` | `/api/sales/orders` | 🔵 ERP Mirror | Reuses orders endpoint — no separate transactions route |
| `/sales/tracker` | `/api/delivery/tracker` | 🔵 ERP Mirror | Same endpoint as `/delivery` page |
| `/sales/deliveries` | `/api/delivery/tracker` | 🔵 ERP Mirror | Same endpoint as `/delivery` page |
| `/sales/history` | `/api/sales/history` | 🔵 ERP Mirror | Invoiced/closed orders |
| `/sales/products` | `/api/sales/products` | 🔵 ERP Mirror | `agility_items` — stale; no live price here |
| `/sales/reports` | `/api/sales/metrics` | 🔵 ERP Mirror | |
| | `/api/sales/reports` | 🔵 ERP Mirror | |

---

## Purchasing

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/purchasing` PO Check-In | `/api/purchasing/submissions` | 🟢 App DB | Photo submissions stored locally |
| `/purchasing/open-pos` | `/api/purchasing/pos/open` | 🔵 ERP Mirror | `app_po_search` view backed by `agility_po_header` |
| `/purchasing/pos/[po]` | `/api/purchasing/pos/[po]` | 🔵 ERP Mirror | PO header + lines + receipt history |
| | `/api/purchasing/pos/[po]/notes` | 🟢 App DB | Internal PO notes |
| | `/api/purchasing/pos/[po]/live` | 🔴 DMSi API | `PurchaseOrderGet` — live PO status, bypasses mirror |
| `/purchasing/review` | `/api/purchasing/submissions` | 🟢 App DB | |
| `/purchasing/review/[id]` | `/api/purchasing/submissions/[id]` | 🟢 App DB | |
| `/purchasing/suggested-buys` | `/api/purchasing/suggested-buys` | 🔵 ERP Mirror | `agility_suggested_po_header` + `agility_suggested_po_lines` |
| | `/api/purchasing/suggested-buys/[ppo_id]` POST | 🔴 DMSi API | Converts suggestion → PO via Agility |
| `/purchasing/exceptions` | `/api/purchasing/exceptions` | 🔵 ERP Mirror | Late PO / qty anomalies |
| `/purchasing/workspace` | `/api/purchasing/pos/open` | 🔵 ERP Mirror | |
| | `/api/purchasing/submissions` | 🟢 App DB | |
| | `/api/purchasing/tasks` | 🔵 ERP Mirror | `public.purchasing_tasks` table (ERP schema) |
| `/purchasing/manage` | `/api/purchasing/pos/open` | 🔵 ERP Mirror | |
| | `/api/purchasing/exceptions` | 🔵 ERP Mirror | |

---

## Estimating & Takeoff

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/estimating` | Legacy AJAX | 🟢 App DB | Flask-era estimating interface |
| `/bids` | `/api/bids` | 🟢 App DB | UUID-based estimator bids |
| `/legacy-bids` | `/api/legacy-bids` | 🟢 App DB | |
| `/legacy-bids/add` | `/api/legacy-bids` POST | 🟢 App DB | |
| `/legacy-bids/completed` | `/api/legacy-bids` | 🟢 App DB | Filtered by status |
| `/legacy-bids/[id]` | `/api/legacy-bids/[id]` GET | 🟢 App DB | Includes linked takeoff session summary |
| | `/api/legacy-bids/[id]` PUT | 🟢 App DB | |
| | `/api/legacy-bids/[id]/activity` | 🟢 App DB | |
| | `/api/legacy-bids/[id]/files` | 🟢 App DB + 🟠 R2 | Metadata in DB; files in R2 |
| | `/api/legacy-bids/[id]/ship-tos` | 🔵 ERP Mirror | Ship-to addresses from `agility_customers` |
| | `/api/legacy-bids/[id]/start-takeoff` | 🟢 App DB | Creates takeoff session |
| | `/api/legacy-bids/[id]/push-to-erp` | 🔴 DMSi API | `SalesOrderCreate` or `QuoteCreate` |
| | `/api/legacy-bids/[id]/promote-quote` | 🔴 DMSi API | `QuoteRelease` → converts quote to SO |
| `/takeoff` Sessions | `/api/takeoff/sessions` | 🟢 App DB | |
| `/takeoff/[sessionId]` Workspace | `/api/takeoff/sessions/[sessionId]` | 🟢 App DB | |
| | `/api/takeoff/sessions/[sessionId]/pdf` | 🟠 R2 | PDF streamed from R2; fallback to `legacyBidFile` |
| | `/api/takeoff/sessions/[sessionId]/upload` | 🟠 R2 + 🟢 App DB | Presigned R2 upload; key stored in DB |
| | `/api/takeoff/sessions/[sessionId]/pages` | 🟢 App DB | |
| | `/api/takeoff/sessions/[sessionId]/measurements` | 🟢 App DB | |
| | `/api/takeoff/sessions/[sessionId]/groups` | 🟢 App DB | |
| | `/api/takeoff/sessions/[sessionId]/viewports` | 🟢 App DB | |
| | `/api/takeoff/sessions/[sessionId]/send-to-estimate` | 🟢 App DB | Writes totals to linked bid's `inputs` JSONB |
| `/projects` | `/api/projects` | 🟢 App DB | |
| `/projects/[id]` | `/api/projects/[id]` | 🟢 App DB | |

---

## Designs & EWP

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/designs` | `/api/designs` | 🟢 App DB | |
| `/designs/[id]` | `/api/designs/[id]` | 🟢 App DB | |
| `/designs/add` | `/api/designs` POST | 🟢 App DB | |
| `/ewp` | `/api/ewp` | 🟢 App DB | |
| `/ewp/[id]` | `/api/ewp/[id]` | 🟢 App DB | |
| `/ewp/add` | `/api/ewp` POST | 🟢 App DB | |

---

## Credits, Work Orders & Ops

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/credits` RMA Credits | `/api/credits` | 🔵 ERP Mirror | `public.credit_images` table. Image filepaths are legacy local paths — not R2 yet |
| `/work-orders` | `/api/work-orders/open` | 🔵 ERP Mirror | `agility_wo_header` |
| | `/api/work-orders/assignments` | 🟢 App DB | Local assignment records |
| `/supervisor` | `/api/supervisor/pickers` | 🟢 App DB | Picker status board |
| `/ops/delivery-reporting` | `/api/ops/delivery-reporting` | 🔵 ERP Mirror | ERP delivery analytics |
| `/customers/[id]/bids` | `/api/customers/[id]/bids` | 🟢 App DB | |

---

## Admin

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/admin` | Multiple | 🟢 App DB | Overview cards |
| `/admin/users` | `/api/admin/users` | 🔵 ERP Mirror | `public.app_users` table lives in ERP (public) schema, managed by WH-Tracker |
| `/admin/users/[id]/permissions` | `/api/admin/users/[id]/permissions` | 🔵 ERP Mirror | Same `public.app_users` |
| `/admin/customers` | `/api/customers` | 🟢 App DB | `bids.legacyCustomer` table |
| `/admin/customers/[id]` | `/api/customers/[id]` | 🟢 App DB | |
| | `/api/customers/[id]/bids` | 🟢 App DB | |
| | `/api/customers/[id]/designs` | 🟢 App DB | |
| | `/api/customers/[id]/ewp` | 🟢 App DB | |
| `/admin/products` | `/api/products` | 🟢 App DB | Internal product catalog |
| `/admin/formulas` | Internal | 🟢 App DB | |
| `/admin/bid-fields` | `/api/admin/bid-fields` | 🟢 App DB | |
| `/admin/notifications` | `/api/admin/notifications` | 🟢 App DB | |
| `/admin/audit` | `/api/admin/audit` | 🟢 App DB | `bids.generalAudit` |
| `/admin/erp` ERP Sync | `/api/admin/erp/status` | 🟢 App DB | Sync metadata |
| | `/api/admin/erp/sync` | 🔵 ERP Mirror + 🟢 App DB | Pulls from ERP mirror, writes to App DB |
| | `/api/admin/erp/introspect` | 🔵 ERP Mirror | Schema metadata query |
| | `/api/admin/erp/query` | 🔵 ERP Mirror | Raw SQL passthrough — debug only |
| | `/api/admin/agility/status` | — | Env-var check only, no network call |
| | `/api/admin/agility/test` | 🔴 DMSi API | Live Login → Version → BranchList → Logout |
| `/admin/analytics` | `/api/admin/analytics` | 🟢 App DB | `bids.page_visits` + activity |

---

## Floor Displays

| Page | API Route | Data Source | Notes |
|------|-----------|-------------|-------|
| `/kiosk/[branch]` | `/api/kiosk/picks` | 🔵 ERP Mirror + 🟢 App DB | Pick queue from ERP; assignments from App DB |
| | `/api/kiosk/pickers` | 🟢 App DB | |
| | `/api/kiosk/work-orders` | 🔵 ERP Mirror | `agility_wo_header` |
| | `/api/kiosk/smart-scan` | 🟢 App DB | Pick completion, scan validation |
| `/tv/[branch]` | `/api/tv/picks` | 🔵 ERP Mirror + 🟢 App DB | Public display — no auth |

---

## ERP Integration & Price Check (API only — no dedicated page)

| Route | Data Source | Notes |
|-------|-------------|-------|
| `/api/erp/price-check` | 🔴 DMSi API | `ItemPriceAndAvailabilityList` — live pricing. Used from bid forms |
| `/api/erp/items` | 🔵 ERP Mirror | `agility_items` — stale item list |
| `/api/erp/customers/[code]` | 🔵 ERP Mirror | `agility_customers` |
| `/api/erp/customers/[code]/ship-to` | 🔵 ERP Mirror | Ship-to addresses |

---

## Summary by data source

| Source | Primary pages |
|--------|--------------|
| 🔴 **DMSi API only** | None — always combined with other sources |
| 🔴 **DMSi API involved** | `/legacy-bids/[id]` (push/promote), `/dispatch/pod/[so]` (signature), `/dispatch` (deliver action), `/sales/customers/[code]` (live AR), `/purchasing/pos/[po]` (live PO), `/purchasing/suggested-buys` (convert to PO), `/admin/erp` (connectivity test) |
| 🔵 **ERP Mirror only** | `/delivery`, `/sales/tracker`, `/sales/deliveries`, `/sales/transactions`, `/sales/history`, `/sales/products`, `/sales/reports`, `/credits`, `/work-orders`, `/ops/delivery-reporting` |
| 🟢 **App DB only** | All Designs, EWP, Takeoff, Projects, `/warehouse/open-picks`, `/warehouse/picker-stats`, `/supervisor`, `/admin/*` (most), `/driver/*` |
| 🔵 + 🟢 **Both** | `/warehouse` board, `/dispatch` board, `/sales/customers/[code]`, `/purchasing/pos/[po]`, `/warehouse/orders/[so_number]`, `/kiosk/[branch]` |
| ⚪ **External only** | `/delivery/map` (Samsara GPS) |
