# Hubbell within-jobsite reconciliation — handoff (2026-05-26)

## TL;DR

The current address-fuzzy matcher is the wrong shape for the historical backlog. It searches **the whole open-SO universe** for matches per doc, which produces lots of noise (clusters of nearby lots) AND misses real matches (historical docs whose target SOs are long since invoiced and filtered out).

Replace it with a **within-jobsite reconciliation** approach: scope to one jobsite at a time, list ALL Hubbell docs and ALL Agility SOs (any status) at that address, then pair them within that small set. Address gating becomes free; scope/PO# disambiguation becomes tractable.

This handoff is the result of a real-world run that hit the floor on the current matcher (Codex, 175 packets / 8 accepts / 510 rejects, ~1.5% accept rate, two zero-accept batches in a row). The remaining ~6,800 unmatched historical docs need this different approach to make further progress.

---

## Background — why current matcher fails on backlog

`src/lib/hubbell/document-matcher.ts` does three things:
1. **Signal A — po_number_split** (confidence 100, auto-attaches): walks open HUBB SOs, splits each `po_number` field on commas/whitespace, looks for `doc_number`. Hits ~0.1% on backlog because buyers never typed historical Hubbell doc numbers into Agility's customer-PO field.
2. **Signal A' — address_scrape** (confidence = scrape_match_ratio × 100): uses the Pi scraper's pre-resolved `(cust_code, shipto_seq_num)` to look up open SOs at the exact shipto. Helpful for fresh docs, useless for old ones (no open SO at that shipto anymore).
3. **Signal B — address fuzzy** (confidence 0-100): tokenized scoring on zip+city+street tokens. Surfaces every nearby lot.

All three filter `so_status NOT IN ('I','C','X')`. **That's the structural bug for the backlog.** A 2022 doc's target SO is in status `'I'` (invoiced) now. The matcher excludes it by construction. So every candidate it surfaces for an old doc is wrong.

The conservative review rule (address + corroborating signal) correctly rejects these wrong candidates, hence the 510 rejects. But correct rejection doesn't help — what we need is the *right* candidate to surface.

---

## The fix — within-jobsite reconciliation

Different loop, different signal set.

**Outer loop:** for each unique jobsite address `(shipto_address_1, shipto_city, shipto_state, shipto_zip)` where Hubbell docs exist.

**Inner data:**
- All `bids.hubbell_documents` rows where `bids.hubbell_normalize_address(extracted_address)` matches the jobsite (the existing `/admin/hubbell/jobs` page already does this clustering).
- All `agility_so_header` rows where `(shipto_address_1, shipto_city, shipto_state, shipto_zip)` matches the jobsite **regardless of `so_status`** (open + invoiced + closed + cancelled). Filter to `cust_code LIKE 'HUBB%'`.

**Inner matching (per jobsite):**
1. **po_number_split across all-status SOs.** Same logic as Signal A, but scoped to this jobsite's SOs (any status). Hit rate per jobsite is small but each hit is gold.
2. **Scope keyword similarity.** Tokenize the doc's `line_items` descriptions and the SO's `reference` field. Common Hubbell scope patterns: "doors", "windows", "framing", "trim", "hardware", "shingle", "locks", "lumber pkg". Compute tokenized overlap. The `reference` field is human-typed and short (e.g. "Doors #9717", "SP Windows", "Framing pkg"), so keyword presence is enough — don't need full NLP.
3. **Total amount proximity.** If `doc.extracted_total` is within 10% of `SUM(so_lines.extended_price)`, supporting signal.
4. **Date proximity.** If `doc.extracted_need_by` is within 90 days of `so.created_date`, supporting signal.

Combine into a `confidence` score and a `pairing_reasons` array. The proposed pairing surfaces as a `hubbell_document_suggestions` row with `match_source = 'jobsite_reconcile'`.

---

## Data layout — already in place

You don't need to add tables. Everything exists:

| What | Where | Notes |
|---|---|---|
| Hubbell docs clustered by jobsite | `bids.hubbell_documents` + `bids.hubbell_normalize_address(extracted_address)` helper | Used by `/admin/hubbell/jobs` page |
| Agility SOs by jobsite | `agility_so_header` filtered by `(shipto_address_1, shipto_city, shipto_state, shipto_zip)` | All statuses available |
| Doc line items | `bids.hubbell_documents.line_items` (jsonb) | Canonical shape: `[{sku, desc, qty, uom, unit_price, ext}]` per `src/lib/hubbell/metadata-normalize.ts` |
| SO line totals | `agility_so_lines.extended_price` summed per `(system_id, so_id)` | Existing `v_open_order_value` view filters to non-invoiced; you'll want raw sum at any status |
| Suggestion queue | `bids.hubbell_document_suggestions` | Existing — add new `match_source: 'jobsite_reconcile'` |
| Junction (accepted matches) | `bids.hubbell_document_sos` | Existing — accept flow unchanged |

The existing `/admin/hubbell/jobs/[soId]` page already renders docs + SOs side-by-side per jobsite (see `app/admin/hubbell/jobs/[soId]/JobDetailClient.tsx`). It just doesn't run a matcher within the jobsite — it lets a human do it manually.

---

## Proposed work

### 1. New matcher function

Add to `src/lib/hubbell/document-matcher.ts` (or sibling file):

```ts
export async function reconcileJobsite(jobsite: {
  shipto_address_1: string;
  shipto_city: string;
  shipto_state: string;
  shipto_zip: string;
}): Promise<{
  docs: Array<{doc_id, doc_type, doc_number, extracted_total, line_items, ...}>;
  sos: Array<{so_id, so_status, reference, po_number, order_total, ...}>;
  pairings: Array<{
    document_id: string;
    so_id: number;
    confidence: number;
    match_source: 'jobsite_reconcile';
    pairing_reasons: string[];  // ['po_split: doc# in SO.po_number', 'scope: doors=doors', ...]
  }>;
}>
```

Key implementation notes:
- The SO query uses `agility_so_header WHERE shipto_address_1=$1 AND shipto_city=$2 AND shipto_state=$3 AND shipto_zip=$4 AND cust_code LIKE 'HUBB%' AND is_deleted=false` — **no `so_status` filter**.
- The doc query uses `bids.hubbell_normalize_address(extracted_address)` as the join predicate to match the existing jobsite clustering (see `app/admin/hubbell/job/route.ts` for the pattern).
- Scope keyword tokenization can start with a static list: `['door', 'window', 'frame', 'trim', 'hardware', 'lock', 'shingle', 'lumber', 'truss', 'siding', 'paint']`. Lowercase, stem with a tiny suffix-stripper (`doors → door`, `windowing → window`).
- Confidence formula starting point:
  - `po_number_split` hit: 100
  - Scope keyword overlap ≥ 1: +30 per matching keyword (cap at 80)
  - Total amount within 10%: +15
  - Date within 90 days: +10
  - Tie-breaker on multiple high-confidence pairings: prefer the SO whose `reference` field has the most overlap

### 2. New endpoint

`POST /api/admin/hubbell/jobsites/reconcile` — body: `{limit?: 50, offset?: 0, only_unsuggested?: true}`.

Walks unique jobsites that have at least one Hubbell doc with no existing pending/accepted `hubbell_document_suggestions` row. For each, calls `reconcileJobsite()`, persists the pairings as `hubbell_document_suggestions` with `match_source='jobsite_reconcile'`.

Idempotent via the existing `(document_id, so_id) UNIQUE` constraint on the suggestions table.

Auth: same dual-auth pattern as `/api/admin/hubbell/documents/suggest-matches` (Bearer OR user session with `hubbell.review`).

### 3. New admin UI (optional but recommended)

`/admin/hubbell/jobsites/reconcile` — paginated jobsite list. Each row expands to show docs vs SOs side-by-side + proposed pairings with accept/reject buttons. Similar in spirit to `/admin/hubbell/suggestions` but jobsite-grouped.

Less critical if the CLI suffices — the existing `scripts/hubbell-review/` CLI works with whatever `hubbell_document_suggestions` rows exist, regardless of which signal generated them. So the new matcher could ship without a new UI; agents just see jobsite-reconcile suggestions appear in the existing queue.

### 4. CLI update (optional)

Update `scripts/hubbell-review/pull` to surface `match_source` in the packet metadata so the reviewing agent knows which signal generated each candidate. Currently a free field already in `match_source`, just needs to flow through to the agent prompt.

---

## Yield expectations

Rough math:
- ~6,800 unmatched docs across maybe ~800 unique jobsites (rough guess — actual count via `SELECT COUNT(DISTINCT bids.hubbell_normalize_address(extracted_address)) FROM bids.hubbell_documents WHERE NOT EXISTS (SELECT 1 FROM bids.hubbell_document_sos s WHERE s.document_id = id)`)
- Per jobsite, typically 5-15 docs and 3-8 SOs (any status)
- Expected accept rate: probably 30-50% — much higher than address-fuzzy's 1.5% — because:
  - po_number_split hits per jobsite are common when scoped to all-status (buyers DID type some PO#s, just for SOs that closed and got excluded by the matcher's status filter)
  - Scope keyword overlap on `reference` text is high signal when you only have to choose among ~5 SOs

If the matcher's `confidence ≥ 80` cases auto-attach (po_number_split hit at any-status SO), expect a few hundred immediate accepts. The 30-79 cases go through review.

---

## Validation

Before shipping wide, sanity-check on 5 known-good jobsites:
- The 9717 Regatta Lane jobsite (already has a confirmed match: PO 5179 → SO 1460615 "Doors #9717"). New matcher should re-find this with high confidence.
- The 1658 22nd Ave SE jobsite (confirmed: WO 14539 → SO 1481231 "SP Windows"). New matcher should re-find.
- Pick three more from the 510 historical rejects where the reviewer noted "would have matched if SO weren't closed".

If the new matcher hits all 5, ship the endpoint. If it misses any, debug before going broad.

---

## What NOT to do

- **Don't re-run the existing `suggest-matches` endpoint.** The address-fuzzy floor is reached. Codex's 175-packet run captured everything that signal can find. See `CLAUDE.md` "Address-fuzzy floor (Codex run, 2026-05-26)".
- **Don't drop the `cust_code LIKE 'HUBB%'` filter.** Even for all-status SOs, restrict to Hubbell customers. Other customers' SOs at the same address would be noise.
- **Don't auto-attach below confidence 100.** po_number_split hits at any-status SO are safe to auto-attach. Anything scope-based goes to human review. The conservative bar still applies.
- **Don't add a new schema.** The suggestions/junction tables already handle this. Just add a new value to `match_source`.

---

## File touchpoints

| File | Change |
|---|---|
| `src/lib/hubbell/document-matcher.ts` | Add `reconcileJobsite()` export OR new sibling file `jobsite-reconciler.ts` |
| `app/api/admin/hubbell/jobsites/reconcile/route.ts` | New endpoint |
| `app/admin/hubbell/jobsites/reconcile/page.tsx` + `ReconcileClient.tsx` | New admin UI (optional) |
| `scripts/hubbell-review/index.ts` | Surface `match_source` in packet metadata so the reviewing agent sees `jobsite_reconcile` tag |
| `CLAUDE.md` | Update Hubbell section to describe the new matcher signal |

No migration needed. No new tables. No new beta headers.

---

## Estimated effort

- New matcher function: ~3 hours
- Endpoint wiring: ~1 hour
- Admin UI: ~3 hours
- Testing against the 5 sanity-check jobsites: ~1 hour

Total: **half a working day** if done in one focused session.
