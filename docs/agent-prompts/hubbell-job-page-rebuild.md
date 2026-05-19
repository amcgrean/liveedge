# Agent prompt: rebuild `/admin/hubbell/jobs/[soId]` into a full job-site work surface

## Context

The current page at `/admin/hubbell/jobs/[soId]` was scaffolded around a single Agility SO — it shows SO header, attached Hubbell docs for that one SO, sibling SOs that share a doc, and unattached docs at the same address. Decent skeleton but it reads as "what's around THIS SO" instead of "what's happening at THIS JOB SITE."

User wants the page rebuilt so the soId in the URL is just an entry point — everything below is keyed on the physical jobsite `(cust_code, shipto_address_1, shipto_city, shipto_state, shipto_zip)` derived from that SO.

## What "the job page" should be

The page is the **workflow surface** for matching Hubbell PO/WO docs to Agility sales orders + pushing those linkages back to Agility's customer-PO field. Layout (top to bottom):

### Header
- Customer name + cust_codes (`HUBB1200,HUBB1700` when both have SOs at this site)
- Full address (street, city, state, zip)
- Aggregate stats: # open SOs, total Open $, # Hubbell docs, total Hubbell $, Paid $
- Optional: dev_code/dev_name pulled from attached docs

### "Sales orders at this address"
Table of every open HUBB1200/HUBB1700 SO with this exact shipto. Filter:
```sql
agility_so_header
WHERE is_deleted = false
  AND UPPER(COALESCE(so_status,'')) NOT IN ('I','C','X')
  AND UPPER(TRIM(cust_code)) IN ('HUBB1200', 'HUBB1700')
  AND bids.hubbell_normalize_address(shipto_address_1) = bids.hubbell_normalize_address($shipto_address_1)
  AND shipto_city  IS NOT DISTINCT FROM $shipto_city
  AND shipto_state IS NOT DISTINCT FROM $shipto_state
  AND shipto_zip   IS NOT DISTINCT FROM $shipto_zip
```

Columns: SO# · Cust · Reference · Cust PO · Expect Date · Status · Order $ · Attached docs count.

Each row expandable to show docs currently attached to that SO via `bids.hubbell_document_sos`.

### "Hubbell documents at this address"
Table of every Hubbell doc whose normalized extracted_address matches this jobsite. Filter:
```sql
bids.hubbell_documents d
WHERE d.match_status <> 'rejected'
  AND bids.hubbell_normalize_address(d.extracted_address)
    = bids.hubbell_normalize_address($shipto_address_1)
```

Columns: Doc# · Type · Status · Total · Payment status (paid/partial/unpaid + $) · Attached to (SO#s) · Action.

### Match action (per doc row)
- **If unattached**: dropdown listing every SO at this address, plus a "Manual SO#" entry. Click "Attach" → calls existing `POST /api/admin/hubbell/documents/[id]/attach` with the chosen so_id. If `HUBBELL_AGILITY_WRITEBACK_MODE` is `test`/`prod`, the same call appends the Hubbell doc# to Agility's `po_number` via `SalesOrderHeaderUpdate` (PR #322 — already shipped).
- **If attached**: shows "Attached to SO#X" with detach button. The detach calls `POST /api/admin/hubbell/documents/[id]/detach`.

## Implementation plan

### Step 1 — new API endpoint
Build `GET /api/admin/hubbell/job?so_id=N`. Returns one bundle:
```ts
{
  jobsite: {
    cust_codes: 'HUBB1200,HUBB1700',
    cust_names: '...',
    shipto_address_1, shipto_city, shipto_state, shipto_zip,
    dev_code, dev_name,           // pulled from any attached doc with these set
    so_count, so_open_value,
    doc_count, hubbell_total, paid_total,
  },
  sales_orders: [
    {
      so_id, cust_code, cust_name, reference, po_number,
      expect_date, so_status, order_total,
      attached_docs: [{ document_id, doc_type, doc_number, match_source, posted_to_agility_at }]
    }, ...
  ],
  documents: [
    {
      id, doc_type, doc_number, extracted_total, payment_status,
      paid_amount_total, last_check_number, last_payment_date,
      attached_so_ids: number[],   // empty = unattached
    }, ...
  ]
}
```

The `so_id` query param resolves to a jobsite key by looking up that SO's shipto fields. The page then anchors everything on that key.

Guard with `requireCapability('hubbell.review')`.

### Step 2 — rewrite the page
Replace `app/admin/hubbell/jobs/[soId]/JobDetailClient.tsx`:
- Fetch via new endpoint
- Render the three sections above
- Wire match-action dropdown to the existing attach endpoint
- Show writeback feedback alerts (same pattern as `DocumentDetailClient`)

### Step 3 — link the doc detail page back
On `/admin/hubbell/[id]`, the existing "Manual attach by SO#" input is good, but also link the doc's "address" line to its jobsite via `/admin/hubbell/jobs/[any-so-id-at-this-address]`. The page resolves to the jobsite from any SO.

## Things to verify / preserve from the current page

- `bids.hubbell_normalize_address(text)` SQL helper (migration 0025) — use it everywhere for address comparisons. Don't reintroduce the punctuation-only normalize.
- The matcher in `src/lib/hubbell/document-matcher.ts` is the source of truth for which SOs a doc COULD attach to. The job page's "Hubbell documents at this address" is broader (any doc whose address normalizes the same), so it'll surface docs the matcher might not have surfaced as candidates. That's intentional — the job page is for direct human matching, not auto-match.
- Payment status renders via `paid` / `partial` / `unpaid` enum already on `hubbell_documents`.

## Out of scope

- Don't change the doc upload pipeline.
- Don't change the matcher's auto-attach logic.
- Don't change writeback semantics — `HUBBELL_AGILITY_WRITEBACK_MODE` flag still gates it.
- Don't touch the inbox `/admin/hubbell` page; that stays document-centric.

## Acceptance checklist

- [ ] `GET /api/admin/hubbell/job?so_id=N` returns the three sections
- [ ] `/admin/hubbell/jobs/[soId]` renders header + SOs table + docs table
- [ ] Clicking "Attach" on an unattached doc with an SO# choice calls the existing attach endpoint and refetches the bundle on success
- [ ] If `HUBBELL_AGILITY_WRITEBACK_MODE=test`, the attach also triggers a `SalesOrderHeaderUpdate` call (already wired in PR #322 — just verify the alert renders)
- [ ] Detach works in reverse
- [ ] Address normalize via `bids.hubbell_normalize_address` so `Ave` ↔ `Avenue` matches
- [ ] Empty states (no docs / no SOs) render cleanly

## Files to expect to touch

- New: `app/api/admin/hubbell/job/route.ts`
- Rewrite: `app/admin/hubbell/jobs/[soId]/JobDetailClient.tsx`
- Possibly delete: the old `/api/admin/hubbell/jobs/[soId]/route.ts` if the new endpoint subsumes it

Estimated effort: 90-120 min.
