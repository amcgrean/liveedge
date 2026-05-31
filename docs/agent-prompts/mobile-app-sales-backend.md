# Mobile App — Sales backend wiring (handoff)

**Status:** UI scaffold LIVE (mock-backed). This doc covers the real
backend wiring for the Sales experience in `mobile-app/`.

The Sales screens (`mobile-app/src/app/(sales)/`) currently read the mock
layer in `mobile-app/src/data/salesMock.ts`. Every screen consumes the
`fetch*` helper shapes there — swap those for real calls and the UI lights up
with no screen changes. This mirrors how the driver app shipped Phases 1–4 on
mocks, then wired the real backend in Phase 5
(`docs/agent-prompts/mobile-app-phase-5-real-backend.md`).

## Design intent: lean on the live Agility API for Sales reads

Sales is mostly **fast single-record lookups** (one order's status, one
customer's open orders, one item's live price/availability) — not the big
analytical pulls that power `/scorecard` and `/management`. That makes the
**live Agility AgilityPublic REST client** (`src/lib/agility-api.ts`, the
`agilityApi` singleton) the right read layer for the time-sensitive pieces,
alongside the `agility_*` mirror tables for stable profile data. Follow the
existing read/write split (CLAUDE.md → "Agility API vs Mirror Table Usage"):

| Sales need | Source | Notes |
|---|---|---|
| Customer search + profile, order history | `agility_*` mirror | Fast, denormalized, no external dep |
| **One order's live status + lines** | mirror first; live `agilityApi` if staleness bites | `agility_so_header` + `agility_so_lines` (UOM-aware `extended_price`) |
| **Item live price & per-branch availability** | live `agilityApi.itemPriceAndAvailability()` | Inventory/price change constantly — already wired at `/api/erp/price-check` |
| Quote creation | live `agilityApi.quoteCreate()` | Already used by `/api/legacy-bids/[id]/push-to-erp` |
| Order creation | live `agilityApi.salesOrderCreate()` | Same |
| Promote quote → order | live `agilityApi.quoteRelease()` | `/api/legacy-bids/[id]/promote-quote` |

`salesOrderList`, `itemsList`, `customersList` are already built in
`agility-api.ts` but unrouted — they're the natural backends for the list
screens. **Don't add new mirror-table read routes just to avoid the live API,
and don't add new live-API reads where the mirror is the correct layer.**

## Work items

### 1. Web side — mobile-scoped Sales API routes (Bearer auth)

Reuse the mobile Bearer-token middleware the driver app added in Phase 5
(JWT from `/api/auth/mobile/verify-otp`). Gate on `sales.view`. New routes:

- `GET /api/sales/mobile/customers?q=` → search (mirror)
- `GET /api/sales/mobile/customers/[code]` → profile + open orders (mirror)
- `GET /api/sales/mobile/orders?q=&status=` → order list (mirror)
- `GET /api/sales/mobile/orders/[so]` → header + lines + fulfillment timeline
- `GET /api/sales/mobile/items?q=` → item search (mirror hierarchy)
- `GET /api/sales/mobile/items/[code]/availability?branch=` → **live** price &
  per-branch on-hand via `agilityApi.itemPriceAndAvailability()`
- `POST /api/sales/mobile/quotes` → `agilityApi.quoteCreate()`
- `POST /api/sales/mobile/orders` → `agilityApi.salesOrderCreate()`
- `POST /api/sales/mobile/quotes/[id]/release` → `agilityApi.quoteRelease()`

Branch scoping: pin non-`branch.all` users to `session.user.branch`. Respect
the **AR data policy** — no balance/credit on these screens.

### 2. Mobile side — replace the mock seam

- Add a `src/api/sales.ts` client (mirror `src/api/dispatch.ts`): Bearer via
  `authToken.ts`, `EXPO_PUBLIC_BACKEND_URL` base, maps responses to the
  `salesMock.ts` shapes (`SalesCustomer` / `SalesOrder` / `SalesItem`).
- Swap the `fetch*` helpers in `salesMock.ts` (or introduce a `useSales*` hook
  layer like `useDriverRoute`) so screens call real endpoints. Keep the mock as
  the `IS_DEV_MODE` fallback (`!process.env.EXPO_PUBLIC_BACKEND_URL`).
- Quote/order **writes go through the existing offline outbox** — enqueue on
  submit, optimistic UI, sync on reconnect. The `submitted.tsx` screen already
  renders both the confirmed and offline-queued outcomes; wire `new-order`'s
  online check to actually enqueue when offline.

### 3. Capability check before rollout

Sales users need `sales.view`; dual-role driver+sales users also need
`dispatch.view`. Verify `ROLE_DEFAULTS` in `src/lib/access-control.ts` grants
these to the relevant roles before enabling the mobile login for sales staff.

## Files touched by the UI scaffold (for reference)

- `mobile-app/src/context/RoleContext.tsx` — role entitlement + active-role persistence
- `mobile-app/src/app/index.tsx`, `role-switch.tsx` — role-based entry
- `mobile-app/src/app/(sales)/**` — the Sales stack (tabs + detail + create)
- `mobile-app/src/components/sales/kit.tsx` — sales component kit
- `mobile-app/src/data/salesMock.ts` — **the mock seam to replace**
- `mobile-app/src/theme/colors.ts` (`S` palette), `src/components/ui/Icon.tsx` (sales glyphs)
