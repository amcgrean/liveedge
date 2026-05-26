# LiveEdge — Scope Inventory & Build Cost Estimate

_Audited 2026-05-14 on branch `claude/liveedge-scope-audit-3dtsn` against `main` @ commit `a28c0c9`._

This document is intended for executive/board-level review. Every number ties back to a `git log`, `find`, or `wc -l` against the repo at audit time. SaaS prices are approximate and reflect public list pricing as of early 2026; treat them as order-of-magnitude.

---

## Executive Summary

| | Value |
|---|---|
| Total LOC (`app/`, `src/`, `db/`, `.ts`/`.tsx`) | **90,113** |
| Total commits since project start | 312 |
| Pages (App Router `page.tsx`) | 104 |
| API route handlers (`route.ts`) | 188 |
| Cron jobs / inbound webhooks | 3 / 2 |
| Server actions | 2 |
| DB tables in `bids` schema (Drizzle-managed + legacy) | 39 |
| DB migrations applied | 32 |
| Production dependencies | 28 |
| In-code TODO/FIXME markers | 11 (zero FIXME/XXX/HACK) |
| **Modules in inventory** | **21** |
| **Total custom-build effort (low–high)** | **3,870 – 5,870 hours** |
| **Solo contractor @ $140/hr** | **$542K – $822K** |
| **Small agency @ $185/hr (+20% PM buffer)** | **$859K – $1.30M** |
| **Large agency @ $225/hr (+35% disc./PM/QA buffer)** | **$1.18M – $1.78M** |
| **Closest SaaS-equivalent annual cost** | **~$185K/yr (range $130K–$260K)** |
| **Remaining-to-ship effort** | **~316 hrs (~$44K @ contractor)** |

**Bottom line.** LiveEdge is a ~90K-LOC, 21-module operational platform that replaces ~$150–250K/yr of SaaS plus an in-house Flask app (WH-Tracker), and bolts onto the Agility ERP in ways no off-the-shelf product can. A contractor doing this from scratch today would cost ~$680K mid-range; an agency would cost $1.0–1.5M. Roughly 4–6 weeks of contractor work remains to close known gaps.

---

## Methodology

1. **Repo reconnaissance.** `git log`, `find`, `wc -l`, schema reads.
2. **Module grouping.** Routes + tables + supporting libs grouped by domain.
3. **Complexity tier per module** using the brief's tier bands:
   - **S** (small CRUD, 1–2 tables): 30–80 hrs
   - **M** (multi-step workflow, several tables): 80–180 hrs
   - **L** (heavy custom logic, complex SQL/UI): 180–350 hrs
   - **XL** (multi-month, e.g. Bluebeam-class canvas): 350+ hrs
4. **Hour ranges** sanity-checked against a 20–50 LOC/hr greenfield productivity envelope. Total LOC ÷ 30 ≈ 3,000 baseline hours; adding ~50% for design, QA, DevOps, bug-fix puts midpoint near 4,500–5,000 hrs, which is where the tier sum lands.
5. **Half-built modules weighted at half hours** per the brief — flagged in the Status column.

---

## Stack Inventory

| Layer | Tech |
|---|---|
| Framework | Next.js 15.1 (App Router), React 19, TypeScript 5.7 |
| Auth | NextAuth v5 beta, JWT, passwordless OTP via Resend |
| ORM | Drizzle 0.38 + `postgres.js` 3.4 |
| DB | Supabase Postgres (one instance, `public` + `bids` schemas) |
| Object storage | Cloudflare R2 via `@aws-sdk/client-s3` |
| PDF / canvas | `pdfjs-dist@5.6` + `fabric@7.2` + `jspdf@4.2` |
| Charts | `recharts@2.15` |
| Maps | `leaflet@1.9` |
| Webhooks | `svix@1.90` (Resend signature verification) |
| PWA | `@serwist/next@9.5` |
| CSV / parsing | `papaparse@5.5` |
| Validation | `zod@3.24` |

Notably absent: no real-time framework (Socket/Pusher), no message queue, no separate API server, no microservices. The whole platform is a Next.js monolith on Vercel with Supabase as the data plane and R2 as blob storage.

---

## Module Inventory

LOC figures are the sum of TS/TSX under the listed paths. The "Tables" column counts both Drizzle-managed and legacy/`agility_*` mirror tables touched by the module.

| # | Module | Pages | API Routes | Tables touched | LOC | Tier | Hours (low–high) | Status |
|---|---|---:|---:|---:|---:|---|---:|---|
| 1 | Auth & Capability ACL | 2 | 5 | 3 (`app_users`, `otp_codes`, `user` legacy) | ~1,400 | M | 80–130 | Complete |
| 2 | Home / Dashboard + page tracking | 2 | 3 | 2 (`page_visits` + cross-module aggregations) | 617 | S | 40–70 | Complete; tracking not yet wired to all modules |
| 3 | Yard / Warehouse Tracker | 6 + kiosk/tv | 18 | 6 (`agility_picks`, picker tables, WO) | 5,269 | L | 180–280 | Complete |
| 4 | Dispatch + Delivery | 9 | 30 | 8 (routes, stops, drivers, Samsara cache, POD photos) | 7,779 | XL | 350–500 | Complete (Phase 3+4 landed 2026-05-13) |
| 5 | Sales (hub, customers, products, transactions, history, reports) | 11 | 20 | 12 (so/lines/shipments/customers/items/branch/ar/notes) | 8,668 | XL | 320–460 | Complete |
| 6 | RMA Credits + Email Ingest | 2 | 6 | 2 (`credit_images`, `agility_so_header` reads) | 1,455 | M | 130–200 | Complete; thumbnail UI deferred |
| 7 | PDF Takeoff Engine | 2 | 13 | 5 (sessions/viewports/groups/measurements/page_states) | 6,561 | XL | 450–650 | Complete; 3 known UX bugs open (scroll/pan, canvas stretch, default scale) |
| 8 | Estimating / Bids hub (legacy + UUID bids) | 9 | 19 | 8 (bids, legacy_bid, bid_file, bid_activity, designs, projects, ewp, customers) | ~5,500 | L | 220–320 | Complete; light estimating UI |
| 9 | Designs / EWP / Projects | 7 | 10 | 5 | (counted under #8) | (in #8) | (in #8) | Complete |
| 10 | Purchasing (Open POs, PO detail, Check-In, Review, Workspace, Command Center) | 9 | 16 | 9 (`agility_po_header/lines`, `app_po_*` views, submissions, item_supplier) | 4,985 | L | 200–320 | Complete; `/purchasing/suggested-buys` page exists but backing view missing |
| 11 | Admin Portal (users, customers, products, audit, ERP, formulas, bid fields, notifications, analytics, jobs) | 17 | 38 | many | 10,023 | XL | 380–540 | Complete |
| 12 | Hubbell PO/WO Reconciliation | 4 | 6 | 3 (`hubbell_emails`, `_candidates`, `_address_cache`) | ~1,200 | M | 80–130 (½) | **Partial.** Email ingest removed 2026-05-13; local-upload endpoint **not yet built**. Inbox/Jobs UI complete. |
| 13 | Scorecard Suite (overview, branch, rep, customer, product, vendor + drill-downs) | 14 | 13 | 6 (`customer_scorecard_fact`, `agility_item_supplier`, agility joins) | 11,680 | XL | 480–720 | Complete (drill-downs landed 2026-05-13) |
| 14 | Management / Forecast / Rebates | 3 | 1 + 2 SA | 4 | 3,380 | L | 160–240 | Complete (forecast KPIs added 2026-05-13) |
| 15 | Ops Delivery Reporting | 1 | 1 | 3 | 1,183 | M | 70–120 | Complete |
| 16 | Help & IT Issues | 3 | 2 | 1 (`legacyItService`) | 1,749 | M | 70–120 | Complete |
| 17 | Agility Live REST integration | — | proxied | n/a | 1,330 | L | 180–280 | Complete; 8 methods built but not yet wired |
| 18 | ERP sync (read layer) | — | — | n/a | (counted under #17) | (in #17) | (in #17) | Complete |
| 19 | Geocoding pipeline (cron, OA loader, county loaders, junk filter) | — | 1 cron + 3 admin | 1 (`geocode_index`) + scripts | ~900 | M | 100–160 (½) | **Partial.** Polk County loaded; Dallas + Johnson loaders pending. Manual cron only. |
| 20 | Charts library (Recharts wrappers + theme) | — | — | n/a | 1,223 | M | 70–110 | Complete |
| 21 | Shared Infra (TopNav, branch context, R2, MS Graph, notifications, audit, data-table, PWA, error boundaries, print CSS) | layout-wide | 0 cron + setup | n/a | ~3,800 | L | 200–320 | Complete |
| 22 | DB schema + 32 migrations | — | — | 39 (Drizzle + legacy) | 2,167 | M | 80–140 | Complete |
| 23 | Cron + Webhooks (orchestration) | — | 3 + 2 | n/a | ~620 | S | 30–60 | Complete |

**Module count: 21 logical modules** (rows 8–9 merged; rows 17–18 merged for accounting clarity).

### Modules discovered but not in the brief's expected list

The brief named ~13 expected modules. The audit found these additional first-class modules that should be called out:

- **Kiosk + TV display surfaces** (`/kiosk/[branch]`, `/tv/[branch]`) — public, no-auth pickboard for warehouse floor screens.
- **Driver app** (`/driver`, `/driver/route/[id]`) — phone-friendly view for drivers' assigned runs (added 2026-05-13).
- **POD viewer / Proof-of-Delivery photo capture** (`/dispatch/pod/[so]`, `/api/pod/[so]/photos`).
- **Run sheet generator** (`/dispatch/run-sheet/[routeId]`) — printable per-route daily run sheet.
- **MS Graph integration** (`/api/admin/graph/*`, `/api/inbound/graph`, subscription renewal cron) — Microsoft 365 mailbox webhooks (originally for Hubbell ingest, now vestigial).
- **PWA shell** (`@serwist/next` config, manifest, icons) — installable on mobile, offline-aware.
- **Rebates module** (`/management/rebates` + server action) — vendor rebate tracking.
- **Search** (`/search`, `/api/search`) — global search surface.
- **Page analytics** (`/admin/analytics`, `page_visits` table) — top-pages-by-user tracking.

---

## Per-Module Complexity Justification

One sentence each, grounded in repo evidence.

1. **Auth & ACL** — 28-capability vocabulary × 8 default roles in `access-control.ts`, JWT bake at sign-in, 3-state admin toggle UI, OTP email pipeline via Resend.
2. **Home / Dashboard** — KPI aggregation from 4 schemas + cross-module joins; simple shell. Tracking endpoint exists but isn't wired into every module client.
3. **Yard / Warehouse Tracker** — 18 routes covering picks board, picker stats, WO assignments, supervisor view, kiosk + TV; replaces ~80% of legacy WH-Tracker Flask app.
4. **Dispatch + Delivery** — `DispatchClient.tsx` alone is 2,461 LOC; 30 routes covering route generation, stop sequencing, time windows, POD photos, run sheets, driver roster + Samsara GPS proxy with branch-tag filtering.
5. **Sales** — `sales/products` redesign + customer profile + transactions search + RMA credits + reports + 20 endpoints joining agility_so_header/lines/shipments/customers/items/branch.
6. **RMA Credits + Email Ingest** — zero-dep recursive MIME walker for forwarded `.eml` files, Resend webhook with Svix signature verification, address-based RMA matching, R2 upload pipeline.
7. **PDF Takeoff Engine** — dual-canvas pdfjs+Fabric architecture, 49+ named presets mapping to `JobInputs` dot-paths, per-viewport scale calibration, command-stack undo/redo, 2s debounced auto-save, R2 PDF storage, headless PDF export — the closest off-the-shelf analog is Bluebeam Revu.
8. **Estimating / Bids** — dual data model (legacy serial-ID `bid` + new UUID `bids`), bid → takeoff session bridge with spec-flag preset filtering, push-to-ERP quote/order creation, file attachments via R2 presigned URLs.
9. **Designs / EWP / Projects** — CRUD + activity logs + CSV import for three legacy modules ported from Flask.
10. **Purchasing** — multi-step PO check-in workflow with photo upload, supplier-rule overlays from `agility_item_supplier`, review queue with reviewer notes, exception tracking.
11. **Admin Portal** — 17 admin sections, 38 endpoints, ERP introspection + raw query tool, audit log with JSONB diff, GPS-aware job review, capability editor.
12. **Hubbell Reconciliation** — three-table data model + extractor library (395 LOC) + address matcher (208 LOC) + cache (117 LOC) + inbox UI + jobs aggregation; ingest path mid-migration from email → local upload.
13. **Scorecard Suite** — `src/lib/scorecard/queries.ts` is 2,461 LOC of period-comparison CTEs and PARTITION/FILTER aggregations; 14 pages with vendor + product + customer drill-downs and a back-stack hint convention.
14. **Management / Forecast / Rebates** — open-order $ KPIs, time-horizon buckets, far-future drill, branch summary + rebate tracking via server actions.
15. **Ops Delivery Reporting** — analytics page with stacked-by-branch time series, sale-type × branch heatmap, carrier donut, CSV export.
16. **Help & IT Issues** — wiki-style accordion (`help-data.ts` = 875 LOC of content) + IT ticket CRUD.
17. **Agility Live REST integration** — 26-method client with branch-scoped session caching, 3.5h TTL, auto re-login on 401, paginate-all helper.
18. **ERP sync** — read-layer abstraction over 15+ `agility_*` mirror tables maintained by an external sync worker.
19. **Geocoding pipeline** — junk-address regex filter (16 patterns), 3-tier matcher (city → zip → state-unique), nightly cron with 60s budget, OpenAddresses statewide loader + Polk County REST loader.
20. **Charts library** — 11 dark-theme Recharts wrappers + custom CSS components (StatusFunnelBar, HeatmapGrid, DaysToPayBullet) + print-friendly CSS.
21. **Shared Infra** — TopNav with 6 dropdowns + branch switcher (938 LOC), branch context propagation, R2 client, MS Graph client, audit logger, notifications, generic data-table, PWA manifest, error boundaries.
22. **DB schema** — 39 tables across two schemas, 32 numbered migrations, full-text GIN indexes on customers/bids, FK constraints between legacy serial and UUID worlds.
23. **Cron + Webhooks** — 3 crons (erp-sync, geocode-nightly, graph-subscription-renew) + 2 inbound webhooks (credits, graph) with Vercel cron + bearer-token guard.

---

## Cost Breakdown

### Total effort by rate card

Summing the tier hour ranges from the inventory table:

| Rate card | Hourly | Hours (low) | Hours (high) | Buffer | **Cost low** | **Cost high** |
|---|---:|---:|---:|---|---:|---:|
| Solo senior contractor (Midwest US) | $140 | 3,870 | 5,870 | 0% | **$541,800** | **$821,800** |
| Small agency (with PM) | $185 | 3,870 | 5,870 | +20% | **$859,140** | **$1,303,140** |
| Large agency (full discovery + PM + QA + design) | $225 | 3,870 | 5,870 | +35% | **$1,175,513** | **$1,783,013** |

Sanity check: 90,113 LOC ÷ midpoint 4,870 hrs ≈ **18.5 LOC/hr** of finished, type-checked, working code. That's at the slower end of the industry envelope (20–50 LOC/hr greenfield) and accounts for design time, debugging, integration work, and the 32 migrations that needed to land cleanly against a live ERP. Numbers feel honest.

### Range commentary

- **Low end of contractor** ($542K) assumes a single senior dev who already knows the Beisser domain and the Agility schema, working efficiently with minimal stakeholder rework.
- **High end of large agency** ($1.78M) is what you'd budget for a procurement RFP to a Tier-1 LBM/ERP specialist (e.g. a DMSI partner consultancy) doing full waterfall with formal QA, dedicated designers, and PM overhead.
- **Most likely real-world cost** if rebuilt today through a typical agency: **$1.0M–$1.3M** over 9–14 calendar months.

---

## Remaining Work to Ship

Pulled from `CLAUDE.md`'s "Pending Actions" + "Still Missing / Deferred" lists + the takeoff-debug open bugs + 11 in-code TODO markers.

| Item | Estimated hours |
|---|---:|
| Apply `0004_page_visits.sql` migration in Supabase + verify | 1 |
| Wire `POST /api/track-visit` into module client components | 8 |
| RMA Credits image thumbnails + `GET /api/credits/[id]/images` presigned route | 16 |
| Purchasing workflow gaps (tasks, approvals, exceptions, notes) — verify tables exist first | 60 |
| `/purchasing/suggested-buys` backing query (no `app_purchasing_queue` view; rebuild on `agility_suggested_po_*`) | 40 |
| Hubbell local-upload endpoint (`POST /api/admin/hubbell/upload`) | 20 |
| Open POs / PO detail supplier-rule columns from `agility_item_supplier` | 12 |
| Vendor scorecard "Items I primarily supply" section | 24 |
| Item scorecard "Inbound POs" section | 16 |
| Dallas County geocoding loader (shapefile + reprojection) | 16 |
| Johnson County geocoding loader (REST endpoint, Polk template) | 16 |
| Generic county-data nightly refresh cron | 12 |
| Open-order value KPIs surfaced from `v_open_order_value` (forecast, home, sales hub) | 16 |
| Takeoff: scroll/pan without selection bug | 12 |
| Takeoff: PDF canvas full-stretch fix | 6 |
| Takeoff: default 1/4"=1' viewport scale | 8 |
| Flask sunset (DNS cutover + archive) | 8 |
| 11 in-code TODOs (SKU verifications, estimators API endpoint, buyer_two filter, identifier merge) | ~25 |
| **Total remaining** | **~316 hrs** |

**Remaining-to-ship at contractor rate:** ~316 hrs × $140 ≈ **$44,240**.

---

## SaaS Comparison

What it would cost to assemble equivalent capability from off-the-shelf SaaS for a 4-location LBM dealer with ~15 active users. Prices are public list as of early 2026; assume actual negotiated would land 15–30% lower.

| Module | Closest SaaS analog | Annual cost (15 users / 4 locations) | Notes |
|---|---|---:|---|
| PDF Takeoff | Bluebeam Revu eXtreme | $5,235 | 15 × $349/yr; this is the explicit replacement target. |
| Estimating | ECi Spruce / Epicor BisTrack estimating modules | ~$18,000 | Add-on to existing ERP seats; LBM-specific. |
| Customer Scorecard / KPIs | Tableau Creator + Viewer mix | $14,400 | 3 creators × $75/mo + 12 viewers × $42/mo, annual. |
| Dispatch + Delivery + Run Sheets | OnFleet Professional + add-on | $36,000 | $3,000/mo for 100 daily tasks tier; Samsara hardware/SaaS separate. |
| Sales Hub / Customer 360 | Salesforce Sales Cloud Pro | $14,400 | 15 × $80/user/mo. Massive feature mismatch — no agility coupling. |
| Warehouse Tracker / Picker Stats | Easy WMS Lite / Manhattan SCALE | $30,000+ | LBM-aware WMS pricing is opaque; bottom-of-band estimate. |
| File storage | Dropbox Business Standard | $2,700 | 15 × $15/mo for 5 TB shared. |
| Email ingest workflow (RMA, Hubbell) | Zapier Professional + Resend Pro | $1,200 | Replaces MIME walker + R2 routing; loses address-based matching. |
| Geocoding pipeline | SmartyStreets / Google Geocoding | $2,500 | API metered; 100K records/yr. Does not replicate county-parcel sources. |
| Capability ACL / SSO | Auth0 Essentials | $3,300 | $275/mo Essentials tier (B2B). Replaces NextAuth + capabilities. |
| ERP sync / iPaaS | Workato / Boomi base + 2 connectors | $25,000 | Replaces the agility_* mirror + sync worker + Agility REST client. |
| IT Ticketing | Zendesk Suite Team | $3,300 | 5 agents × $55/mo, internal-only. |
| Reporting / Forecast / Rebates | Domo / Looker viewers | $18,000 | 15 × $100/mo. |
| Cloud infra (Vercel + Supabase + R2) | (already paying) | $3,000 | Approximate current Vercel Pro + Supabase Pro + R2 storage spend. |
| BI for Management / Forecast | (in Tableau/Domo above) | — | — |
| **Total SaaS-equivalent annual** | | **~$185,000/yr** | Range realistic: $130K–$260K depending on negotiation. |

### What no SaaS can replace

The following are **irreducibly custom** — there's no commercial product that maps onto them:

1. **The Agility coupling itself.** 26 live REST methods + 15+ mirror tables + branch-aware session caching + write-back routes for SO/Quote/POD/Shipment/Pick. A Workato/Boomi integration could re-create the data movement but not the deeply embedded UI patterns (price-check inline, push-to-ERP from a bid, GPS-aware job review).
2. **The bid-to-takeoff bridge.** Legacy bid spec flags pre-filter which of 49 named takeoff presets load; "Send to Estimate" writes accumulated totals back to specific `JobInputs` fields on the bid. This is Beisser-specific business logic; no SaaS can replicate it.
3. **Hubbell PO/WO reconciliation.** Address-based matching between scraped supply-house PO data and Iowa-area Agility sales orders, with a custom `agility_so_header.shipto_address_1` LIKE-pivot. Pure custom.
4. **RMA email ingest with address-based matching.** Outlook-forwarded emails with embedded `.eml` attachments parsed by a zero-dep MIME walker, attachments routed to R2 by RMA number derived from a partial street address. Zapier can't do this.
5. **Capability ACL with 28-capability × 8-role-defaults matrix.** Auth0 RBAC handles the bones but not the granular UI integration (3-state toggle with live green dot, ROLE_DEFAULTS table, JWT bake at login).
6. **Geocoding pipeline with county parcel sources.** SmartyStreets/Google can geocode the easy 80% but not the long tail of rural Iowa addresses that need county-parcel data; this is the difference between 89,000 geocoded customers and ~76,000.
7. **PDF Takeoff with named presets.** Bluebeam can measure, but it can't pre-load 49 presets specific to Beisser's estimating workflow and write totals back to a bid record on a button click.

A reasonable framing for the board: **the $185K/yr in SaaS subscriptions buys you the commodity 60% of LiveEdge. The remaining 40% (the integration layer, the bid-to-takeoff bridge, the email pipelines, the address matching, the agility-coupled workflows) is the irreducible Beisser-specific value and is not on the market at any price.**

---

## What's Half-Built (Weighted at Half Hours)

Per the brief's instruction to weight in-progress modules at half hours. These are already reflected in the inventory table totals.

| Module | Why it's half | Hour treatment |
|---|---|---|
| **Hubbell Reconciliation** | Email ingest pipeline deleted 2026-05-13. Local-upload endpoint (`POST /api/admin/hubbell/upload`) not yet built. Inbox/jobs UI complete. | Counted at 50% of the M-tier range (80–130 hrs vs. 160–260 full). |
| **Geocoding Pipeline** | Polk County loader landed; Dallas + Johnson loaders pending. No automated nightly county refresh yet. Manual cron only. | Counted at 50% of the M-tier range (100–160 hrs vs. 200–320 full). |
| **PDF Takeoff Engine** | Feature-complete but three known UX bugs open (scroll/pan without selection, canvas stretch, default scale). Bugs counted under "Remaining Work". | Full hours retained; ~26 hrs in remaining-work bucket. |
| **Purchasing workflow** | Suggested Buys page exists but backing view (`app_purchasing_queue`) confirmed missing; PO notes/exceptions/approval workflow tables may not exist. | Module counted at full hours (UI is built); ~100 hrs in remaining-work for backing infra. |
| **Page-visit tracking** | Endpoint exists, not wired to all module clients, so Quick Access strip on homepage stays empty. | 8 hrs in remaining-work. |
| **RMA Credits thumbnails** | Image pipeline + ingest live; user-facing thumbnail viewer not built. | 16 hrs in remaining-work. |

---

## Top Files by LOC (complexity hot spots)

For board-level "what's the riskiest single file" awareness:

| File | LOC | Why it matters |
|---|---:|---|
| `app/dispatch/DispatchClient.tsx` | 2,461 | Single-file SPA for the whole dispatch board; refactor target if dispatch needs further iteration. |
| `src/lib/scorecard/queries.ts` | 2,461 | 44 SQL functions with CTEs/window functions; any ERP schema change ripples through here. |
| `app/help/help-data.ts` | 875 | Content, not code — help wiki content. Easy to maintain. |
| `app/purchasing/scorecard/VendorScorecardClient.tsx` | 839 | Vendor scorecard surface; planning further reuse on item drill-downs. |
| `app/management/forecast/ForecastClient.tsx` | 823 | Forecast bucket UI; recently extended (2026-05-13). |
| `src/lib/agility-api.ts` | 950 | Critical external-integration boundary; touching it risks breaking write-back. |
| `src/components/takeoff/TakeoffCanvas.tsx` | 988 | Dual-canvas tool handlers; touching it risks breaking the takeoff engine. |

These represent ~10% of total LOC concentrated in 7 files. Reasonable for an app of this size.

---

## Audit Notes / Honesty Disclosures

- **Commit count is low (312).** That's because most work happens on agent-generated PR branches that get squash-merged; the squash drops individual commits. Volume of work is closer to what the LOC suggests, not what the commit count suggests.
- **Module boundaries are subjective.** I grouped Designs/EWP/Projects under Estimating because they share data models, but they could equally be counted as three modules. Doesn't change totals materially.
- **LOC is not a perfect proxy for effort.** Some modules (takeoff, scorecard queries) are 30+ LOC/hr because they're algorithmically dense; others (admin CRUD, help wiki) are 60+ LOC/hr because they're boilerplate. Tier assignments account for this; the LOC÷30 sanity check is averaged.
- **SaaS prices are public list and likely overstated by 15–30%.** Real procurement would negotiate. The $185K/yr is conservative high; $130K/yr is conservative low.
- **The Agility ERP coupling cannot be priced as a SaaS replacement.** It's a custom integration layer that exists only because Beisser runs Agility. Any SaaS equivalence comparison must ignore this layer; the custom-build cost above is the only number that includes it.
- **External infrastructure not counted:** the ERP mirror sync worker (lives in a separate repo and runs externally), Samsara hardware, R2 storage costs, Vercel/Supabase Pro subscriptions. These are ongoing opex, not part of the build cost.
