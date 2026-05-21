# Hubbell Daily Check Ingest — Handoff from PC agent (2026-05-20)

Original brief from the local (PC-side) Hubbell agent. Folds paid-check data
into the daily Pi ingest so month-end recon becomes a report-generation step
instead of a 90-minute portal scrape.

## Why now

Hubbell issues checks throughout the month, not just at month-end. Today:

- **Daily**: Pi scrapes new POs/WOs → uploads to `bids.hubbell_documents` ✓
- **Monthly only**: PC scrapes paid-check data + downloads ~4,600 paid-check
  PDFs over ~90 minutes, two days before EOM ✗

If checks flowed in daily, you'd get:

1. Sales/AR sees payment status update in real time — a PO they attached to
   an SO three weeks ago now shows "paid on check 015800 this morning".
2. Monthly recon goes from "wait 90 min, parse 4,600 PDFs, match, generate
   report" to "press button, generate report from existing LiveEdge data".
3. Cash-application gaps surface within 24 hours instead of waiting for EOM.
4. The 90 minutes of monthly headless-browser time on the PC goes away.

Same Pi, same systemd timer, same auth infrastructure (`eci_auth_state.json`
+ `ECI_USERNAME`/`ECI_PASSWORD` auto-login). New tables + new endpoint + ~150
lines of new scraping code.

## What's already in place (no changes needed)

- `bids.hubbell_documents` — one row per PO/WO PDF, keyed by `source_hash`
- `POST /api/admin/hubbell/upload` — accepts PDFs with metadata
- `eci_auth_state.json` + `ECI_USERNAME`/`ECI_PASSWORD` auto-login
- systemd `hubbell-daily.timer` at 06:00 EDT

The check ingest piggybacks on all of this.

## Proposed schema

> **Naming convention note:** put new tables in `bids` for now to match
> existing `bids.hubbell_documents`. **Hubbell ingest is logically its own
> domain and should eventually move to a dedicated `hubbell` schema.** Design
> new tables now so the future `ALTER SCHEMA` rename is mechanical — no FKs
> crossing into bids' actual bid/takeoff tables, no mixed views.

### `bids.hubbell_checks`

One row per Hubbell check ever scraped.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `check_number` | text NOT NULL UNIQUE | Hubbell's check number (zero-padded 6-digit) |
| `check_date` | date | Earliest invoice_date on any line (proxy for check issue date) |
| `total_amount` | numeric(14,2) | Sum of all line `payment_amount` |
| `payment_count` | int | Number of line items |
| `source_hash` | text NOT NULL UNIQUE | sha256 of normalized check-line JSON (idempotency) |
| `source_run_id` | text | e.g. `run_2026_05_21_06_00` |
| `first_seen_at` | timestamptz NOT NULL DEFAULT now() | When we first scraped it |
| `last_seen_at` | timestamptz NOT NULL DEFAULT now() | Updated each daily run (checks can grow lines retroactively) |

### `bids.hubbell_check_lines`

One row per line item on a check. Links to `hubbell_documents` by
`(doc_type, doc_number)`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `check_id` | uuid NOT NULL REFERENCES hubbell_checks(id) ON DELETE CASCADE | |
| `doc_type` | text NOT NULL | `'po'` \| `'wo'` \| `'inv'` (fallback when Hubbell pays our SO# instead of PO/WO#) |
| `doc_number` | text NOT NULL | Doc number from the portal `invoice_number` field |
| `invoice_date` | date | From portal row |
| `payment_amount` | numeric(14,2) NOT NULL | Can be negative (credits) |
| `gross_amount` | numeric(14,2) | Pre-discount amount, when portal provides it |
| `memo` | text | e.g. `WT00006070`, `TT00004026` |
| `line_seq` | int | Position on the check (for ordering) |

Indexes:
- `(check_id)` (covered by FK)
- `(doc_type, doc_number)` — for joining to `hubbell_documents`
- `(memo)` — for the house-code reverse lookup

### Optional denormalized view

```sql
CREATE VIEW bids.hubbell_check_application AS
SELECT
  c.check_number, c.check_date, c.total_amount,
  l.doc_type, l.doc_number, l.payment_amount, l.memo,
  d.id AS document_id, d.extracted_address, d.scrape_cust_code, d.scrape_seq_num,
  (SELECT array_agg(so.so_id) FROM bids.hubbell_document_sos so WHERE so.document_id = d.id) AS attached_so_ids
FROM bids.hubbell_checks c
JOIN bids.hubbell_check_lines l ON l.check_id = c.id
LEFT JOIN bids.hubbell_documents d
  ON d.doc_type = l.doc_type AND d.doc_number = l.doc_number;
```

This is what the monthly-recon read endpoint (below) will ultimately serve.

## Upload endpoint contract

```
POST /api/admin/hubbell/checks/upload
  Authorization: Bearer $HUBBELL_UPLOAD_TOKEN
  Content-Type: application/json

  Body:
  {
    "check_number": "015800",
    "source_run_id": "run_2026_05_21_06_00",
    "check_date": "2026-05-20",
    "lines": [
      {
        "doc_type": "po",
        "doc_number": "042150",
        "invoice_date": "2026-05-15",
        "payment_amount": 1234.56,
        "gross_amount": 1234.56,
        "memo": "DL00006037",
        "line_seq": 1
      }
    ]
  }
```

Server computes `source_hash = sha256(JSON.stringify(check_number + sorted(lines)))`.

**Responses:**
- `200 {status: 'inserted', id, line_count}` — new check
- `200 {status: 'updated', id, line_count, added_lines}` — same check_number,
  different source_hash (new lines appeared)
- `200 {status: 'unchanged', id}` — same source_hash, no-op
- `400 / 401 / 500` — as with the doc upload endpoint

**Idempotency:** the Pi script can safely re-POST the same check every day.
`last_seen_at` updates, but no duplicates accumulate.

## Daily Pi script changes

Add a new step to `hubbell_daily_fetch.py` (or, cleaner, a sibling script
`hubbell_daily_checks.py` invoked from the same systemd service after the
PO/WO scrape):

1. Hit `https://hub.ihmsweb.com/cgi-bin/ihmsweb.exe?pgm=marwbvo` (Payment History)
2. Reuse `parse_checks_from_marwbvo()` from `hubbell_checks_to_pdfs_po_and_wo.py`
3. For each check NOT yet in `hubbell_checks` (or whose `last_seen_at` < today):
   - Pull the per-check detail page
   - Reuse `export_portal_invoice_table_v8_full.py`'s parsing logic to extract line items
4. POST to `/api/admin/hubbell/checks/upload`
5. Optional: also download any per-check PDFs that aren't already in
   `hubbell_documents` (this is the PO/WO PDF stream we already do daily,
   so usually a no-op)

**Schedule in the same systemd service** so PO/WO and check scrapes run
back-to-back from one timer fire. ECI session and dev-list cache shared.

**Limit historical backfill** — when first deployed, pull only the N most
recent checks (configurable, default 6 → ~1 month). For one-time historical
backfill, run with `--max_checks 0` from the PC.

## Read endpoints for the monthly recon

```
GET /api/hubbell/docs?since=YYYY-MM-DD
  Authorization: Bearer $HUBBELL_READ_TOKEN (or reuse upload token)

Returns: array of {
  doc_number, doc_type, erp_cust_code, erp_seq_num,
  ship_to_address, pdf_total,
  attached_so_ids: [...],
  uploaded_at
}
```

```
GET /api/hubbell/checks?since=YYYY-MM-DD

Returns: array of {
  check_number, check_date, total_amount,
  lines: [{
    doc_type, doc_number, payment_amount, memo, invoice_date,
    document_id, scrape_cust_code, scrape_seq_num,
    attached_so_ids
  }]
}
```

With both endpoints, the monthly recon collapses from "scrape + parse + match
+ generate" to "fetch + generate." That's the prize.

## Schema hygiene — move out of `bids` eventually

`bids.hubbell_documents` lives in `bids` because that's where the takeoff/
bidding data already lived when it was stood up. **Hubbell ingest has no
relationship to bids/takeoffs except sharing the same Supabase project.**

Recommended future migration (no rush, but plan for it):

1. `CREATE SCHEMA hubbell;`
2. `ALTER TABLE bids.hubbell_documents SET SCHEMA hubbell;` (and the rest)
3. Recreate views and grants
4. Update Drizzle schema definitions and route imports
5. Keep `bids.hubbell_documents` as a compatibility view for one release if
   any external integration depends on it

**For work now**: design tables to be schema-portable — no FKs into bids'
actual bid/takeoff tables, no mixed views, mention the eventual schema move
in any new migration's header comment.

## Coordination with the existing daily PO/WO ingest

Both scrapes hit the same ECI session.

- Run PO/WO scrape first (cheaper, fewer pages)
- Then check scrape (heavier, but Payment History caches aggressively portal-side)
- Share the cached dev-list HTML (`/home/api/hubbell/hubbell_inbox/_dev_list_cache.html`)
- Single `hubbell_docs_seen.json` is fine; check scrape has its own state, or
  relies on server-side `source_hash` dedupe

## PC-side cutover plan

1. Add a `--mode liveedge` flag to `hubbell_reconciliation_v1.py` that pulls
   data from the two read endpoints instead of scraping.
2. Keep the scrape path as fallback (historical runs before LiveEdge had
   data, or if the service is unreachable on a recon day).
3. Drop the 90-minute monthly portal-scrape step from `hubbell_run.py`
   entirely once a few months of LiveEdge-sourced runs validate.

The monthly orchestrator on the PC stays — it still needs to pull AR from
AgilitySQL (local network, not Supabase) and run matching + report
generation. It just stops being the data-collection bottleneck.

## TL;DR for the LiveEdge agent

1. Add `bids.hubbell_checks` + `bids.hubbell_check_lines` tables
   (migration 0026 designed for eventual `hubbell` schema move)
2. Add `POST /api/admin/hubbell/checks/upload` endpoint (idempotent by
   `source_hash`, atomic check+lines write)
3. Add a Pi-side scraper module that scrapes `marwbvo` daily and POSTs
   to the new endpoint
4. (Eventually) add `GET /api/hubbell/docs` + `GET /api/hubbell/checks`
   read endpoints so the monthly recon stops scraping
5. (Eventually) `ALTER SCHEMA` the Hubbell tables out of `bids` into a
   dedicated `hubbell` schema

The auth token, scheduling, and Pi infrastructure are all in place — this is
purely additive.
