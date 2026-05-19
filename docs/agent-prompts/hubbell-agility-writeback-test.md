# Agent prompt: validate the Hubbell → Agility writeback in test, then flip to prod

## Context

PR #322 shipped `Orders/SalesOrderHeaderUpdate` integration. When a reviewer attaches a Hubbell doc to an Agility SO in `/admin/hubbell/[id]`, LiveEdge can append the Hubbell doc# to that SO's `CustomerPurchaseOrder` field via the live DMSi API. Behavior is gated by env var:

- `HUBBELL_AGILITY_WRITEBACK_MODE=disabled` (or unset) → no Agility call, only LiveEdge junction insert
- `HUBBELL_AGILITY_WRITEBACK_MODE=test`              → call `AGILITY_API_TEST_URL` (non-prod DMSi env)
- `HUBBELL_AGILITY_WRITEBACK_MODE=prod`              → call `AGILITY_API_URL` (production)

We have NOT yet validated this end-to-end. **DMSi's documentation explicitly warns** that for `SalesOrderHeaderUpdate`, blank/null character fields *may* be cleared depending on the method's internal business rules — and they recommend testing in non-prod before flipping prod. Our implementation sends a **minimal payload** (only `OrderID` + `CustomerPurchaseOrder`), so blank fields aren't explicitly passed — but we don't know with certainty whether the missing fields are treated as "no change" or "set to blank."

This task is the end-to-end test against `AGILITY_API_TEST_URL`. If clean, flip to prod.

## Prerequisites

Verify these are already true on Vercel:
- [ ] `AGILITY_API_URL` is set to the PRODUCTION DMSi endpoint
- [ ] `AGILITY_API_TEST_URL` is set to the non-prod DMSi endpoint
- [ ] `AGILITY_USERNAME` / `AGILITY_PASSWORD` are set (same credentials work for both envs per the DMSi docs)
- [ ] `HUBBELL_AGILITY_WRITEBACK_MODE` is currently `test` (or set it now)
- [ ] The Agility test environment has been refreshed from prod data recently (user said this happens overnight on schedule — confirm test data is current)

## Test procedure

### 1. Pick a disposable test SO

In Agility test environment Web UI, find an SO that:
- Is under HUBB1200 or HUBB1700 customer
- Is status `O` (open) or `B` (blank) — not invoiced/cancelled
- Has a known current `CustomerPurchaseOrder` value (ideally a real one like `042072,038679` — multi-token is most realistic) OR is empty (also fine — tests append-from-empty)
- Won't be confused with real workflow if its `CustomerPurchaseOrder` gets modified

Take screenshots of the full SO header in Agility test BEFORE the writeback call. Capture every field — TransactionReference, OrderedBy, ShipVia, SaleType, RouteID, ExpectedDate, all MiscField* values, all SalesAgent* values, ship-to fields, etc. **This is the key reference.** We need byte-exact comparison post-call.

Record: `OrderID = $TEST_SO_ID`

### 2. Pick a Hubbell doc to attach

Open `/admin/hubbell` in LiveEdge. Pick any unmatched/unattached doc whose extracted_address looks plausibly close to the test SO's shipto address. Doesn't need to match exactly — we're testing the write-back mechanic, not the matcher.

Record: `document_id = $DOC_ID`, `doc_number = $HUBBELL_DOC#`

### 3. Trigger the attach with writeback

Open `/admin/hubbell/[$DOC_ID]`. Use the **"Manual attach by SO#"** input — enter `$TEST_SO_ID`, click Attach.

Watch the browser alert that pops up. Expected shape:
```
Attached SO $TEST_SO_ID.
Agility (test): wrote po_number = <existing>,<HUBBELL_DOC#>
```

If you see `Agility writeback (test) FAILED: ...` — record the error text and STOP. Don't flip to prod.

### 4. Verify in Agility test UI

Refresh the SO in Agility test. Compare against the pre-call screenshots:

- [ ] `CustomerPurchaseOrder` updated to include `$HUBBELL_DOC#` (appended to any existing value, comma-separated)
- [ ] **Every other field unchanged** — TransactionReference, OrderedBy, ShipVia, SaleType, RouteID, ExpectedDate, MiscField1-12, MiscDate1-2, SalesAgent1-6 and their pct fields, ship-to fields, every line item
- [ ] If ANY other field changed, **STOP**. We need to switch to the read-modify-write pattern before going to prod. Don't flip the flag.

### 5. Test idempotency

Detach the doc from the SO in LiveEdge (`/admin/hubbell/[$DOC_ID]` → click X on the attached row). Then re-attach via the same Manual SO# input.

Expected: alert says `doc_number already in po_number` and the SO in Agility shows the same `CustomerPurchaseOrder` value (no duplicate `$HUBBELL_DOC#` token).

### 6. Test failure modes (optional but recommended)

Verify that when Agility is unreachable or returns RC ≠ 0, the LiveEdge junction insert still succeeds and the alert surfaces the Agility error. Easiest way to simulate: temporarily set `AGILITY_API_TEST_URL` to a bogus URL on Vercel, redeploy, attach a doc, observe the alert says "Agility writeback (test) FAILED: ..." and the junction is still there. Reset the env var after.

### 7. Flip to prod

Only after #4 confirms zero unintended side effects:
1. On Vercel, change `HUBBELL_AGILITY_WRITEBACK_MODE=prod`
2. Trigger a rebuild (empty-commit PR, same pattern we've used) so the env var is picked up
3. Pick a low-stakes real SO + doc and repeat the attach. Eyeball Agility prod's `CustomerPurchaseOrder` field.
4. If clean, announce to the user. The writeback is live.

## What "clean" looks like — the safety contract

For every field other than `CustomerPurchaseOrder` on the SO header:
- Field is non-blank pre-call → field is **the same non-blank value** post-call
- Field is blank pre-call → field is blank post-call (no spontaneous changes)

For line items + components: **nothing changes**. Item count, item codes, quantities, prices, descriptions, all identical pre/post.

If any of the above breaks: we need to switch to **read-modify-write**. That'd require adding a `getSalesOrderHeader` method to `src/lib/agility-api.ts` (DMSi has one — probably `Orders/SalesOrderList` filtered by OrderID, or a dedicated `SalesOrderHeaderGet`), fetching the current header before each writeback, and echoing every current field back along with the updated `CustomerPurchaseOrder`. The Phase-2 design doc anticipated this fallback.

## Files / references

- Writeback wiring: `app/api/admin/hubbell/documents/[id]/attach/route.ts` lines ~150-230
- Agility client: `src/lib/agility-api.ts` — `salesOrderHeaderUpdate()` function
- DMSi field-data-type guide: see the user's prior message from 2026-05-18 — the bit about "double quote or null may clear character fields"
- The append-not-replace logic: `parsePoNumberField()` in `src/lib/hubbell/po-number-parser.ts`

## Rollback

If the prod test goes sideways:
1. Vercel env: set `HUBBELL_AGILITY_WRITEBACK_MODE=disabled`
2. Trigger rebuild
3. Existing `posted_to_agility_at` timestamps on `hubbell_document_sos` aren't reverted (we can't un-write Agility), but no NEW writes happen.

Junction rows stay. Reviewer attaches still work in LiveEdge UI — they just don't push to Agility until the flag flips back.

## Acceptance checklist

- [ ] First test call against AGILITY_API_TEST_URL succeeds (RC 0, alert shows new po_number)
- [ ] Pre/post Agility UI comparison shows only `CustomerPurchaseOrder` changed
- [ ] Re-attach is idempotent (no duplicate doc# in po_number)
- [ ] Flag flipped to `prod` only after test passes byte-comparison
- [ ] One prod test call succeeds, verified in Agility prod UI

Estimated effort: 30-45 min including screenshots and verification.
