# Hubbell `line_items` re-extraction (2026-05-27)

## TL;DR

2,608 rows in `bids.hubbell_documents` (~38% of the backlog) have
`line_items` jsonb that's identical to at least one other row at a
different address. Pattern: the Pi line-items extractor produced a
template / default output instead of parsing the actual PDF bytes.
Worst case: 20 different addresses share one identical line_items
value with the same dollar amount.

Re-extract `line_items` from the actual R2 PDF bytes for these rows
and POST the corrected metadata via the existing
`/api/admin/hubbell/documents/metadata-bulk` endpoint.

Surface for this handoff: **PC test-agent** at
`C:\Users\amcgrean\python\hubbell test\` (or the Pi if more
convenient).

## Discovery context

Codex flagged WO 679 in a review batch: packet line_items said
"Framing Mat. - 1st Floor Deck" → matcher generated a `scope:deck`
candidate against a Deck Pack SO. Codex opened the PDF and saw
Windows content. Investigation found:

- WO 679 had three rows (one stale, one current, one backfill-restored)
- All three had **identical** line_items: `[{sku: 290-03, desc:
  "Framing Mat. - 1st Floor Deck", ext: 1489.30}]`
- Despite different addresses (Garland Ave vs Linden St) and
  different totals ($1,593 vs $1,801)

Broader probe:

```sql
WITH grp AS (
  SELECT line_items::text AS li_str,
    COUNT(DISTINCT extracted_address) AS distinct_addrs,
    COUNT(*) AS row_count
  FROM bids.hubbell_documents
  WHERE line_items IS NOT NULL
    AND extracted_address IS NOT NULL
    AND jsonb_array_length(line_items) >= 1
  GROUP BY 1
)
SELECT
  COUNT(*) FILTER (WHERE distinct_addrs >= 2) AS shared_2plus,
  MAX(distinct_addrs) AS worst_case,
  SUM(row_count) FILTER (WHERE distinct_addrs >= 2) AS total_rows_affected
FROM grp;
```

Result: 781 distinct line_items values shared across 2+ addresses,
covering 2,608 rows. Top: one line_items value (Framing Mat. -
Floor Joist System / $4,309.90) appears across 20 addresses.

Sampled values look like template/fallback output — same SKU, same
desc, same exact dollar amount across many unrelated jobs. Real data
would vary by quantity / total per job.

## Target query

```sql
-- Doc rows whose line_items value appears against ≥2 distinct addresses.
-- These are the rows to re-extract.
WITH suspect AS (
  SELECT line_items::text AS li_str
  FROM bids.hubbell_documents
  WHERE line_items IS NOT NULL AND extracted_address IS NOT NULL
    AND jsonb_array_length(line_items) >= 1
  GROUP BY 1
  HAVING COUNT(DISTINCT extracted_address) >= 2
)
SELECT d.id::text, d.doc_type, d.doc_number, d.r2_key,
       d.extracted_address, d.extracted_total::text,
       d.source_hash
FROM bids.hubbell_documents d
JOIN suspect s ON s.li_str = d.line_items::text;
-- Expected: ~2,608 rows
```

Save to CSV and feed into the re-extract loop.

## Re-extract flow

For each row in the target CSV:

```
1. Pull PDF bytes from R2.
   - The presigned-URL helper is `/api/admin/hubbell/documents/needs-extraction`
     (returns 1-hour presigned URLs in batches up to 500).
   - OR download directly from R2 if the test-agent has S3-compatible
     credentials.

2. Run the corrected `parse_line_items()` from
   `hubbell_daily_fetch.py` against the actual PDF bytes.
   - That's the rewritten pdfplumber-based parser from 2026-05-19
     that landed the original 89.7% coverage.
   - Per-doc-type logic: PO uses `Product Code | Description | U/M |
     Quantity | Price | Extension` table; WO uses cost-code layout.

3. POST the corrected metadata via the bulk endpoint:

   POST https://app.beisser.cloud/api/admin/hubbell/documents/metadata-bulk
   Authorization: Bearer $LIVEEDGE_HUBBELL_TOKEN
   Content-Type: application/json
   Body: {
     "items": [
       {
         "doc_type": "wo",
         "doc_number": "679",
         "metadata": {
           "line_items": [
             {sku: ..., desc: ..., qty: ..., uom: ..., unit_price: ..., ext: ...}
           ]
         }
       },
       ... up to 500 items per request
     ]
   }

   Endpoint normalizes line_items via `normalizeLineItems()` in
   `src/lib/hubbell/metadata-normalize.ts` so accepted alias keys
   (description/quantity/unit_price/u_m/extension/amount/price/
   product_code/code) all map to the canonical shape.
```

## After the re-extract

The next reconcile run picks up corrected line_items automatically:
- `pairDocsToSos()` re-reads `d.line_items` from the table each invocation
- `extractScopeTokens()` produces accurate scope tokens
- Matcher candidates align with the actual PDF Codex will see

No further LiveEdge code change needed. Just rerun a reconcile sweep
after the bulk-update completes:

```
POST /api/admin/hubbell/jobsites/reconcile { "limit": 100 }
```

Repeat until Codex's queue stabilizes near 100% accept rate on the
re-extracted rows.

## Reporting

After the run, tell me:

- Rows attempted vs corrected vs unchanged (where re-extraction
  produced the same output as before — those rows had correct
  line_items all along, just happened to share strings with the
  affected ones)
- Errored rows + reasons (PDF not readable, parser fallback fired
  again, etc.)
- Sample 5 corrected line_items so we can spot-check the new shape

## Env vars

```bash
LIVEEDGE_HUBBELL_TOKEN=<from Vercel: HUBBELL_UPLOAD_TOKEN>
POSTGRES_URL_NON_POOLING=<from .env.local>
```

## Related work

- PR #408 — backfill endpoint + restore script for R2 PDFs (the
  "stale-divergent" class). That work restored PDFs; this work
  re-extracts metadata from PDFs that were already correctly stored.
- CLAUDE.md "Hubbell within-jobsite reconciler" section — full
  matcher architecture + signals + tuning rules.
