# Sales mobile app — phased build plan

Companion to `mobile-app-sales-backend.md`. Tracks the rollout of the Sales
experience (`mobile-app/src/app/(sales)/`) from the design scaffold (LIVE,
mock-backed) to a fully wired app. Written so the mechanical phases can be
handed to Codex as standalone tickets.

## Data-source policy (the deliberate departure for Sales mobile)

The web app is **mirror-first** (`agility_*` tables) — see CLAUDE.md. The Sales
**mobile** app is different: its workload is fast single-record, time-sensitive
lookups, not big analytical scans. So we lean on the **live Agility API** for
the freshness-critical reads and all writes, and keep the **mirror** for
search/list-across-everything (where Agility's `*List` endpoints paginate
poorly and have no FTS).

| Access pattern | Source | Why |
|---|---|---|
| Type-ahead search (customers, items) | **Mirror** (`agility_*`, GIN/ILIKE) | Agility list endpoints have no FTS; would be slow + rate-limit-risky |
| One order's live status + lines | **Live Agility** (mirror acceptable v1) | Status changes in real time |
| One item's price + per-branch on-hand | **Live Agility** (`itemPriceAndAvailability`) | Inventory/price change constantly |
| A customer's order list / profile | **Mirror** v1 → live if staleness bites | Bounded, denormalized on `agility_so_header` |
| All writes (quote/order/promote) | **Live Agility** | Must hit the source of truth |
| Job notes, templates | **LiveEdge** (`bids` schema) | Our data, not in Agility |

**Rule for new Sales-mobile endpoints:** search/list = mirror; single-record
freshness-critical = live Agility; writes = live Agility; LiveEdge-native
features (notes/templates) = `bids` schema. Don't add live-API reads for
search, don't add mirror reads for price/availability.

## Auth & route-guard conventions (already established)

- Every `app/api/sales/mobile/**/route.ts` guards with
  `requireSessionOrMobile(req, 'sales.view')` (from `src/lib/mobile-auth.ts`)
  — accepts the mobile Bearer JWT **or** a NextAuth cookie. This is a
  recognized `guardPattern` in `docs/security-policy-routes.md`, so the
  `check-route-guards` CI gate passes with no policy edits.
- Branch scoping: `hasCapability(session, 'branch.all')` → may pass `?branch=`;
  otherwise pinned to `session.user.branch`.
- Mobile client: `src/api/client.ts` (axios, Bearer interceptor, `IS_DEV_MODE`
  = no `EXPO_PUBLIC_BACKEND_URL`). Screens fall back to `salesMock.ts` fixtures
  in dev mode.

## Phases

### Phase 0 — Foundations (us) — prerequisite checks
- [ ] Confirm `ROLE_DEFAULTS` (`src/lib/access-control.ts`) grants `sales.view`
      to sales/estimator/management roles, and `dispatch.view` for dual-role.
- [ ] Confirm the mobile Bearer middleware enforces capability (it does:
      `requireSessionOrMobile` calls `hasCapability`).
- [ ] Stand up the writeback **test-env** path (`AGILITY_API_TEST_URL`) before
      Phase 3.

### Phase 1 — Read endpoints + client wiring  ← **IN PROGRESS (this PR)**
**Owner: us.** Mirror-backed reads + replace the mobile mock seam.

Web routes (all `requireSessionOrMobile(req,'sales.view')`, branch-scoped):
- `GET /api/sales/mobile/customers?q=&limit=` — mirror search
- `GET /api/sales/mobile/customers/[code]` — profile + open orders
- `GET /api/sales/mobile/orders?q=&status=&limit=` — order list
- `GET /api/sales/mobile/orders/[so]` — header + UOM-aware lines + derived
  fulfillment timeline
- `GET /api/sales/mobile/items?q=&limit=` — item search + per-branch on-hand
  (price deferred to Phase 2)

Shared: `app/api/sales/mobile/_shared.ts` — `deriveMobileStatus()` (so_status
→ open/picking/staged/delivery/invoiced) + response types.

Mobile: `src/api/sales.ts` (axios calls + response→shape mappers); `salesMock.ts`
`fetch*` helpers delegate to the API when `!IS_DEV_MODE`, else return fixtures.

**Acceptance:** with `EXPO_PUBLIC_BACKEND_URL` set, every Sales screen renders
live data for a real branch; with it unset, dev mocks still render.

### Phase 2 — Live Agility reads
**Owner: us → Codex.** Overlay live price/availability + refine status.
- `GET /api/sales/mobile/items/[code]/availability?branch=` — live
  `agilityApi.itemPriceAndAvailability()` (price + per-branch on-hand).
- Enrich order status/timeline from `agility_picks` / `agility_shipments`
  (picking/staged/out-for-delivery), not just the header code.
- Mobile item detail + list overlay live price onto the Phase 1 on-hand.

### Phase 3 — Quote & order writeback
**Owner: us (irreversible — high blast radius).**
- Map mobile draft → `agilityApi.quoteCreate` / `salesOrderCreate` /
  `quoteRelease` (promote). Reference: `/api/legacy-bids/[id]/push-to-erp`.
- **Validate against `AGILITY_API_TEST_URL` first** (same caution as the
  Hubbell writeback — blank fields can clobber). Flag-gate prod.
- Wire writes through the mobile offline outbox (enqueue on submit, optimistic
  UI, resumable so retries don't double-post). `submitted.tsx` already renders
  confirmed + offline-queued outcomes.

### Phase 4 — Job Notes (new feature)  ← **Codex handoff: `sales-job-notes-codex.md`**
**Owner: Codex (self-contained, LiveEdge-owned, no Agility risk).**
- `bids.sales_job_notes` migration + LiveEdge CRUD API + R2 photo upload.
- Mobile screens: notes list, add note (text + photos + type), attach to
  customer/SO; surface on customer + order detail.
- A note must exist **before** any SO (jobsite walk / showroom spec meeting),
  so it's keyed on customer/address with optional SO link.
- Include a `fields jsonb` column from day one — the forward-compat seam for
  Phase 5 templates (no later migration needed).

### Phase 5 — Quick-quote templates (future)
**Owner: us + Codex.** Template builder (named field schemas) + form-fill UI →
prefilled quote/order draft mapping `fields` → line items. Builds on Phase 3
(writeback) + Phase 4 (`fields jsonb`).

## Sequencing / handoff summary

```
Phase 0 (us, checks)
   └─ Phase 1 (us, this PR) ──┬─ Phase 2 (us→codex)
                              ├─ Phase 4 (CODEX, parallel — no dep on 2/3)
                              └─ Phase 3 (us) ── Phase 5 (us+codex)
```

Phase 4 (Job Notes) has **no dependency on the Agility wiring** — it's the
cleanest parallel Codex hand-off and can start as soon as Phase 1's auth +
client plumbing lands.
