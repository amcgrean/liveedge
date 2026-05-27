# Hubbell stale-divergent re-scrape (2026-05-27)

## TL;DR

86 `hubbell_documents` rows have an R2 PDF that's been overwritten by a later
upload at the same `(doc_type, doc_number)` key. Their `extracted_*` metadata
correctly describes a real Hubbell PDF, but the R2 object now contains a
different doc's content. We want to re-fetch the original PDF from the
Hubbell portal and call `/api/admin/hubbell/backfill` to restore it.

Target list: [`hubbell-stale-divergent-targets-2026-05-27.csv`](hubbell-stale-divergent-targets-2026-05-27.csv)
(86 rows, columns: `document_id, doc_type, doc_number, source_hash,
extracted_address, extracted_total`).

This handoff is for the **PC test-agent** at `C:\Users\amcgrean\python\hubbell test\`
(or the **Pi scraper** at `/home/api/hubbell/`) — whichever owns the
Hubbell portal scraping logic with valid `ECI_USERNAME`/`ECI_PASSWORD`
credentials.

## Why the originals matter

Across 11 review batches Codex (via the LiveEdge `/admin/hubbell` suggestions
queue) has reconciled 122 docs at a 67% accept rate. The remaining unmatched
backlog is ~2,000 docs, most reachable through normal reconcile + Codex
review. These 86 are the only ones the LiveEdge-side reconciler **must
skip** because the R2 file the reviewer would see doesn't match the
suggestion's metadata.

Restoring even half of them (43 docs) would unblock matching for jobsites
like 1479/1485/1497/1501 Foxtail Dr SE (a duplex cluster), 1216-1228 Granite
St NE (six houses), 1613-1621 Garland Ave, etc.

## Probable outcomes

Hubbell may have reused these doc numbers for unrelated new jobs (the
overwriting upload was just one day later, on 2026-05-19, suggesting a same-
week portal change). For each doc:

- **Best case**: the portal still serves the original PDF under that
  `(doc_type, doc_number)` → sha256 of the fetched bytes equals the
  `source_hash` in the CSV → we can restore.
- **Likely case**: the portal serves the new content under the same number
  → sha256 mismatches → we can't restore from the portal. The original is
  lost.
- **Unknown**: there's a separate Hubbell portal endpoint for historical
  versions / document revisions we haven't found yet.

This is a cheap experiment regardless — any recovery is upside.

## Recovery flow

For each row in the CSV:

```
1. Fetch PDF from Hubbell portal by (doc_type, doc_number).
   - Use the existing scraper logic (hubbell_daily_fetch.py or equivalent).
   - If the portal returns nothing for that doc#, skip and log "not on portal".

2. sha256(bytes) → compare to the row's `source_hash`.
   - If they match: this is the original PDF we want to restore. Continue.
   - If they don't match: portal now serves a different PDF for this doc#.
     Skip. Log as "portal updated".

3. POST the matching PDF to `/api/admin/hubbell/backfill`:

   POST https://app.beisser.cloud/api/admin/hubbell/backfill
   Authorization: Bearer $LIVEEDGE_HUBBELL_TOKEN
   Content-Type: multipart/form-data
   - document_id: <row's document_id>
   - pdf: <PDF bytes>

   Endpoint behavior (verified):
   - Re-verifies sha256(bytes) == row's stored source_hash (refuses with 409 if not).
   - Uploads to R2 under the new hashed key shape (PR #407): `hubbell/{year}/{type}/{num}-{hash12}.pdf`
   - Updates `bids.hubbell_documents.r2_key` for the row.
   - Returns `{status: "restored", new_r2_key, document_id}` on success.

4. Log result per doc.
```

## Reporting

After the run, tell me / post back:

- Count: attempted / restored / portal-mismatch / portal-missing / errored
- Sample of 3-5 "portal-mismatch" responses if any (so we can confirm the
  hypothesis that Hubbell reused the numbers)
- Any error patterns (auth, rate limit, etc.)

## What happens after restore

LiveEdge side already handles the post-restore state automatically:

- Restored rows get a unique R2 key under the new hash-suffixed shape.
- The reconciler's supersession skip (`src/lib/hubbell/jobsite-reconciler.ts`)
  filters by `(r2_key, received_at, source_hash, address, total)` — once a
  restored row has its own unique r2_key, it's no longer a "later sibling at
  the same key" so the skip predicate stops applying.
- Next reconcile run will produce suggestions for the restored docs, and
  Codex (or the human reviewer) sweeps them up through the normal queue.

No further LiveEdge code changes needed once you've POSTed the PDFs.

## Env vars

```bash
LIVEEDGE_HUBBELL_TOKEN=<from Vercel: HUBBELL_UPLOAD_TOKEN>
# Plus whatever ECI_USERNAME/ECI_PASSWORD the existing Hubbell scraper needs
```

## Notes

- The CSV is in `docs/agent-prompts/hubbell-stale-divergent-targets-2026-05-27.csv`.
- Be conservative with rate limits — 86 docs is small enough that a
  serial fetch with 1-2s spacing should be fine.
- The backfill endpoint is idempotent — re-running on a row that's already
  restored returns `status: "already_correct"` instead of re-uploading.
- If the portal is paginated, the doc numbers in the CSV are the canonical
  Hubbell numbers — same as what the daily scrape uses.
