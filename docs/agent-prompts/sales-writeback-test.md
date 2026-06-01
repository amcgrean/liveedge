# Sales mobile writeback — test-env validation (Phase 3)

Run this **before** flipping `SALES_MOBILE_WRITEBACK_MODE=prod`. Same caution as
the Hubbell writeback: blank/omitted character fields *may* be cleared by DMSi
business rules depending on the method, so validate in the non-prod environment
first and confirm the created records look right in the Agility UI.

## Preconditions
- `AGILITY_API_TEST_URL` set (DMSi non-prod base URL) — already in env.
- **Activate the test API in Agility** (daily activation — do this the morning of the test).
- `AGILITY_USERNAME` / `AGILITY_PASSWORD` valid for the test environment.
- Set `SALES_MOBILE_WRITEBACK_MODE=test` (Vercel preview/prod env). Default is
  `disabled`, which makes every write route return `{written:false}` and touch
  nothing.

## The routes (all `requireSessionOrMobile('sales.view')`, branch-scoped)
| Method | Route | Agility call |
|---|---|---|
| POST | `/api/sales/mobile/quotes` | `QuoteCreate` |
| POST | `/api/sales/mobile/orders/create` | `SalesOrderCreate` (+ optional `SalesOrderCreateValidate` when `validate:true`) |
| POST | `/api/sales/mobile/quotes/[id]/release` | `QuoteRelease` (promote quote → order) |

Body (quote/order create):
```jsonc
{
  "customer": "C-10428",        // Agility CustomerID (required)
  "shipToSequence": 1,           // default 1
  "saleType": "DELIVERY",        // default DELIVERY
  "reference": "test job",
  "expectDate": "2026-06-05",    // orders, yyyy-mm-dd
  "expirationDate": "2026-06-05",// quotes, yyyy-mm-dd
  "poNumber": "TEST-PO",         // orders
  "validate": true,              // orders: dry-run first
  "lines": [{ "itemId": "SPF2X4-92", "quantity": 24, "uom": "EA" }]
}
```
Price is intentionally **omitted** from lines — Agility applies the customer
pricing matrix (same as `/api/legacy-bids/[id]/push-to-erp`).

Success response: `{ written:true, mode:"test", type:"quote"|"order", erpId:"<NewOrderID>" }`.

## Test sequence
1. **Mode-disabled sanity** (before setting the env): POST a quote → expect
   `{written:false, reason:"SALES_MOBILE_WRITEBACK_MODE not enabled"}`, and
   confirm **nothing** was created in Agility.
2. Set `SALES_MOBILE_WRITEBACK_MODE=test`, redeploy.
3. **Order validate-only**: POST `/orders/create` with `validate:true` and a
   deliberately bad item → expect `422 {written:false, validated:false}`.
4. **Quote create**: POST `/quotes` with a known-good customer + item. Expect
   `written:true` + an `erpId`. **In the Agility test UI**, open that quote and
   verify: customer, ship-to, line item(s), qty/UOM all correct; no unexpected
   fields blanked.
5. **Order create**: POST `/orders/create`. Same UI verification. Specifically
   confirm `Reference`, `PONumber`, `ExpectDate` wrote and nothing else got
   cleared.
6. **Quote release**: POST `/quotes/{erpId}/release` using the quote from step 4.
   Expect `written:true` + a new order `erpId`; verify the order in the UI.
7. From the **mobile app** (with `EXPO_PUBLIC_BACKEND_URL` → the test deploy):
   run New Quote and New Order to confirm the submit handlers post correctly and
   the success screen shows the real `erpId`.

## If a test write clears other fields
Fall back to read-modify-write: read the current header/line values first, echo
them all back plus the new ones. The create methods send a minimal payload
today; only layer this in if step 4/5 shows collateral field clearing.

## Flip to prod
Only after steps 4–6 verify clean in the Agility UI: set
`SALES_MOBILE_WRITEBACK_MODE=prod`. The `useTest` flag flips off automatically
(`agilityOptions()` keys on the mode), so prod writes hit `AGILITY_API_URL`.

## Known deferrals
- **Offline auto-submit for writes** is intentionally NOT wired. The driver
  outbox/sync loop retries on reconnect; letting it re-POST an order create
  risks **double-creating orders**. Design idempotency (client-generated
  dedupe key honored server-side, or a pre-create existence check) before
  enabling offline order submission. New Order currently requires connectivity.
- The New Quote / New Order screens still seed customer + lines from the design
  mock (`DRAFT_CUSTOMER` / `DRAFT_LINES`). A real customer + item-search picker
  is the next mobile task; the submit path already posts whatever's in state.
