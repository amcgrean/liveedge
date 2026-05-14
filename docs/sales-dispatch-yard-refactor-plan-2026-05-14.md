# Sales, Dispatch, and Yard Refactor Plan (Performance + Reuse)

## Findings

The three modules currently duplicate the same patterns:
- Repeated status badge mappings (`O/K/S/D/I/C/P`) with slightly different labels/styles.
- Repeated data-fetch life cycles (`loading/error/refresh`) and local polling logic.
- Repeated table/card render patterns for order-centric records.
- Separate API endpoints that re-assemble similar order/customer/product context.

This causes:
- More JS shipped than needed.
- More network requests per page transition.
- Higher maintenance overhead (same bug fixed in 3 places).

## Target Architecture

## 1) Shared domain package for order-flow
Create a shared `src/modules/order-flow/` area used by Sales/Dispatch/Warehouse:
- `status.ts` (single source of truth for SO status labels/colors/step indexes)
- `format.ts` (shared date/currency/CT formatting)
- `links.ts` (route builders for order/customer/product pages)
- `types.ts` (shared `OrderSummary`, `OrderLineLite`, `CustomerLite`, `ProductLite`)

## 2) Shared data hooks and API contracts
Converge module data access around common hooks:
- `useOrderList(params)`
- `useOrderDetail(so, branch)`
- `useOrderLines(so, branch)`
- `useOrderTimeline(so, branch)`

Use a query library cache strategy (SWR or TanStack Query) with:
- Stale-while-revalidate.
- Request deduping.
- Background refresh on visibility/focus.

## 3) Shared UI primitives
Extract reusable components into `src/components/order-flow/`:
- `StatusBadge`
- `OrderLinkCell`, `CustomerLinkCell`, `ProductLinkCell`
- `OrderLinesTable`
- `KpiTile`
- `PanelShell` (loading/error/empty states)

## 4) BFF/API consolidation
Create normalized endpoints that serve all 3 modules without each module recomputing joins:
- `GET /api/order-flow/orders`
- `GET /api/order-flow/orders/:so`
- `GET /api/order-flow/orders/:so/lines`
- `GET /api/order-flow/orders/:so/timeline`

Keep legacy endpoints temporarily; migrate client-by-client with contract tests.

## 5) Performance work to make navigation feel instant
- Prefetch next likely views/records (top 10 visible orders).
- Virtualize large tables and cards.
- Split heavy components (map/complex drawers) by route-level dynamic import.
- Reduce polling to smart refresh rules (focus/visibility/websocket events where possible).
- Add server-side cache + short TTL for list endpoints.
- Trim payload fields for list screens (summary only), lazy-load detail panels.

## 6) Observability and quality gates
Add metrics before/after:
- TTFB (API), client hydration time, route transition time, and JS payload per module.
- p95 list load time and p95 detail-open time.
- Error-rate and request-count per page.

Set success gates:
- p95 module route transition < 400ms (warm navigation).
- First meaningful list render < 1.0s on standard internal network.
- 30-40% fewer duplicated UI lines in module clients.

## Rollout Plan

### Phase 0 (1-2 days): Baseline + map overlap
- Inventory duplicated constants/components/hooks across three modules.
- Record baseline metrics and API call counts.

### Phase 1 (3-4 days): Shared status/links/components
- Land `status.ts`, `links.ts`, `StatusBadge`, link-cell components.
- Swap into Dispatch and Warehouse first, then Sales.

### Phase 2 (4-6 days): Shared data hooks + caching
- Introduce query cache layer and refactor module fetch logic.
- Reduce duplicate calls on selection change and page switches.

### Phase 3 (4-6 days): API normalization
- Build order-flow API layer and migrate UI consumers behind feature flag.
- Keep endpoint compatibility until all pages moved.

### Phase 4 (2-3 days): Final performance pass
- Virtualization, bundle split checks, prefetch tuning.
- Compare metrics versus baseline and remove old dead code.

## Linking requirements (orders/customers/products)

Implemented now:
- Dispatch order lines now link item codes to the general Sales Products page with the item prefilled in query.
- Dispatch detail header now links SO number to general Sales Order detail.
- Dispatch detail header now links customer name to general Sales Customer profile when customer code is available.
- Warehouse board and table SO numbers now link to general Sales Order detail.

Recommended follow-up:
- Add shared route-builder helper to remove hard-coded paths in tables.
