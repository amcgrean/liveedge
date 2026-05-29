# Match recent Hubbell checks against open AR (2026-05-29)

## TL;DR

The 8 most recently ingested Hubbell checks contain **~2,200 payment line
items** referencing PO/WO numbers. Only ~18% of those lines link to an
Agility sales order through LiveEdge's existing `hubbell_documents` →
`hubbell_document_sos` chain. The other ~82% are payments Hubbell sent
us for which our reconciler couldn't determine the corresponding SO.

For each unmatched payment line, try to match the **payment amount +
customer (HUBB%) + recent date** against `agility_ar_open` to find the
open invoice / SO that the payment is actually closing. This is the
"recent check → open AR" reconciliation step the user asked for.

Surface for this handoff: **PC test agent** at
`C:\Users\amcgrean\python\hubbell test\` (has `hubbell_reconciliation_v1.py`
and AgilitySQL ODBC access — exactly the right environment).

## Recent checks in the system

Pull current state from LiveEdge prod:

```sql
SELECT
  c.check_number,
  c.total_amount,
  c.payment_count,
  c.last_seen_at::date AS ingested
FROM bids.hubbell_checks c
ORDER BY c.last_seen_at DESC
LIMIT 10;
```

At writing: 8 checks, $5.78M total, 2,206 line items combined. ~18%
matched to LiveEdge's accepted document-SO links.

## Recommended flow

1. **Pull unmatched payment lines.** For each recent check, get its
   line items that don't link to an accepted hubbell_document_sos row:

   ```sql
   SELECT
     l.id,
     l.check_id,
     l.doc_type,
     l.doc_number,
     l.payment_amount,
     l.invoice_date,
     l.memo,
     l.gross_amount,
     c.check_number,
     c.last_seen_at,
     d.id AS doc_id_if_exists,
     d.extracted_address,
     d.extracted_total
   FROM bids.hubbell_check_lines l
   JOIN bids.hubbell_checks c ON c.id = l.check_id
   LEFT JOIN bids.hubbell_documents d
     ON d.doc_type = l.doc_type AND d.doc_number = l.doc_number
   WHERE c.last_seen_at >= now() - interval '7 days'
     AND l.doc_type IN ('po','wo')
     AND NOT EXISTS (
       SELECT 1 FROM bids.hubbell_document_sos s
       WHERE s.document_id = d.id
     )
   ORDER BY l.payment_amount DESC;
   ```

2. **For each unmatched payment line, query Agility AR for matching
   candidates.** Use the AgilitySQL ODBC connection
   (`hubbell_reconciliation_v1.py` has the right plumbing already).

   Match criteria:
   - `cust_code LIKE 'HUBB%'` (any Hubbell entity)
   - `open_amt` within 10% of `payment_amount` (Hubbell may pay
     slightly differently — taxes, partial pays)
   - Date proximity: invoice/SO within last 180 days
   - If the doc row exists in LiveEdge with a usable
     `extracted_address`, prefer SOs at the matching jobsite
     (resolve via `agility_customers.cust_key + seq_num`)

3. **Surface confident candidates.** A pair is high-confidence when:
   - Payment amount exactly matches (`payment_amount` ≈ `open_amt`,
     within $1 or 0.5%)
   - Customer matches the doc's expected HUBB sub-account if known
   - Jobsite matches (when address is parseable)

   Medium-confidence when amount + customer match but jobsite info
   is missing or ambiguous.

4. **Push matches back into LiveEdge.** For each high/medium
   confidence pair, POST to the suggestions endpoint with a new
   `match_source = 'payment_ar_recon'`:

   ```
   POST https://app.beisser.cloud/api/admin/hubbell/jobsites/reconcile
   ```
   OR for direct attachment if the payment_amount match is exact:

   ```
   Just call /api/admin/hubbell/documents/<id>/attach with the SO id.
   ```

   The CSV format the LiveEdge endpoint accepts is the same as the
   existing reconcile flow.

## Report back

After the run, send back:

- Count: recent-check lines processed / lines matched to AR / lines
  still unmatched
- Breakdown by check: per-check pre→post matched count
- Sample of 5 confident matches the script proposed but didn't
  auto-attach (for spot-check before bulk push)
- Any payment lines with `payment_amount > $5,000` that still couldn't
  match — those are the highest-revenue gaps and worth a manual look

## Data quality observation (worth fixing separately)

All 8 recent checks have `check_date = NULL`. The Pi-side scraper at
`/home/api/hubbell/hubbell_daily_checks.py` (or equivalent) isn't
populating it. That field should land alongside the check_number when
the daily scrape parses each check page. Not blocking — this handoff
can use `last_seen_at` as the date proxy — but worth noting for a
separate Pi-side fix.

## Env vars

```bash
LIVEEDGE_HUBBELL_TOKEN=<from Vercel: HUBBELL_UPLOAD_TOKEN>
POSTGRES_URL_NON_POOLING=<from .env.local>
AGILITY_SQL_*=<from existing hubbell_reconciliation_v1.py setup>
```

## Why this matters

- 5,197 Hubbell-paid docs across all history are unmatched to SOs
  (the bulk total)
- Of recent checks alone (8 most-recent), ~82% of payment lines
  don't connect to SOs
- Each match created closes an open AR row (or surfaces a discrepancy)
- Most matches will be straightforward customer + amount + date —
  exactly the shape AgilitySQL ODBC + the existing hubbell_reconciliation
  script is built for

## Related work

- PR #408 — backfill endpoint + restore script for R2 PDFs
- PR #424 — line_items re-extract handoff (the test-agent already
  ran this)
- This handoff — payment-AR reconciliation on top of doc-SO matching
- CLAUDE.md "Hubbell within-jobsite reconciler" — matcher architecture
