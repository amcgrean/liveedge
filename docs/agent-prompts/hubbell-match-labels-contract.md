# Hubbell match-label corpus — contract (2026-06-01)

Central training-label store for the Hubbell doc → Agility-SO matcher. Two
human-review loops feed it; both write through this contract so labels
aggregate cross-reviewer instead of living on someone's disk.

| Loop | Tool | Writes via |
|---|---|---|
| Matcher-correctness ("is this suggestion right?") | `scripts/hubbell-review` CLI + `/admin/hubbell/suggestions` UI | `POST /api/admin/hubbell/suggestions/[id]/review` (rationale forwarded → label) |
| Cash-application ("which SO gets this payment?") | local streamlit GUI | `POST /api/admin/hubbell/labels` (via a translator) |

## Table: `bids.hubbell_match_labels`

Migration `db/migrations/0037_hubbell_match_labels.sql` (apply manually in the
Supabase SQL editor — off-hours not required; it's a small empty table).

Key columns: `document_id` (uuid → `hubbell_documents.id`), `so_id` (int),
`label` (`accept|reject|skip`), `source`, `reason_code`, `signals` (jsonb),
`confidence` (`high|medium|low`), `reasoning`, `reviewer`, `apply_amount`
(cash-app dollars, NULL for matcher loop), `suggestion_id` (soft link).

**UNIQUE (`document_id`, `so_id`, `source`)** — scoped by source on purpose, so
the matcher loop and the cash-app loop can each hold a viewpoint on the same
pair (e.g. CLI rejected a suggestion the cash-app human confirmed). Both are
signal. Upsert overwrites within a source.

## Endpoint: `POST /api/admin/hubbell/labels`

Auth: `Bearer HUBBELL_UPLOAD_TOKEN` (PC/local) **or** session `hubbell.review`.
`X-Reviewer` header sets the default reviewer. Body is batch or single:

```jsonc
{ "labels": [ {
  "document_id": "<uuid>",        // OR doc_type + doc_number
  "doc_type": "po" | "wo",
  "doc_number": "1612",
  "ship_to_address_hint": "1618 Garland Ave", // optional — disambiguates reused
                                  //   doc numbers (see below)
  "so_id": 16028,                 // required
  "label": "accept"|"reject"|"skip",  // required
  "source": "cash_app_gui",       // required
  "reason_code": "scope_phase",
  "signals": { "address": true, "ref_match": false, "scope_phase": true },
  "confidence": "high"|"medium"|"low",
  "reasoning": "<verbatim note>",
  "reviewer": "aaron",
  "apply_amount": 1234.56,
  "suggestion_id": "<uuid>"
} ] }
```

Up to 1000 labels/request. Response: `{ ok, failed, warnings, results: [{ index,
status, document_id?, so_id?, error?, warning? }] }`. 422 only when *every* row
failed; partial failures return 200 with per-row errors.

### Doc-number reuse & `ship_to_address_hint`

Hubbell recycles doc numbers across jobs, so `(doc_type, doc_number)` can map to
several historical `hubbell_documents` rows. Resolution:

1. Pass `document_id` when you have it — exact, no ambiguity.
2. Else `(doc_type, doc_number)`:
   - unique → resolves directly.
   - ambiguous **with** `ship_to_address_hint` → narrows by matching each
     candidate's `extracted_address` via `bids.hubbell_normalize_address`
     (`Dr↔Drive`, `Cir↔Circle`, directionals preserved). Exactly one match →
     resolves. Multiple identical-address duplicates → collapses to the earliest
     received (with a `warning`).
   - ambiguous **without** a hint → row errors (`supply document_id or
     ship_to_address_hint`).
   - hint matches **none** of the candidate addresses → row errors with the list
     of candidate addresses. **This is a feature, not a miss**: it means the doc
     our system holds under that number is a *different job* than the SO the
     payment hit, so labeling it would poison the corpus. Investigate instead of
     forcing.
3. A resolved row whose provided hint *disagrees* with the doc's address still
   saves but returns a `warning` for review.

So always send `ship_to_address_hint` from the cash-app side — it both recovers
reused-number docs and guards against wrong-job matches.

## Translator mapping (streamlit `manual_matches_check_*.json` → labels)

Per the cash-app agent's plan — encode each applied/no-match decision as a label:

| label field | derived from |
|---|---|
| `label: accept` | `decision: apply` + the picked SO id |
| `label: reject` | `decision: no_match`, or applied SO ≠ a matcher-suggested one |
| `source` | `"cash_app_gui"` |
| `signals.address` | always true (resolved seq required) |
| `signals.ref_match` | regex on `ar_so_reference` for memo digits / unit numbers |
| `signals.scope_phase` | cost-code prefix family aligns w/ so_reference (`cc_score ≥ 1` after `cross_penalty`) |
| `signals.dev_house` | memo prefix family (BE/HT/RP/GW…) matches so_reference `#NNNN` |
| `signals.amount` | `|so_outstanding − apply_amount| / payment ≤ 0.10` |
| `reason_code` | `cancelled_so` if status C/X; `partial_scope` if `PARTIAL_SCOPE_RE`; scope mismatch via cross-family penalty; else the firing corroborator |
| `confidence` | `confidence_v5` bucketed to high/med/low |
| `reasoning` | the `notes` field verbatim |
| `apply_amount` | the dollars applied to that SO |

The translator must resolve each decision to a Hubbell `document_id` (or a
unique `doc_type`+`doc_number`). Cash-app rows that resolve only to an `inv`
line (direct SO, no PO/WO doc) are NOT doc→SO matcher training data — skip them.

## Joint-corpus query (Tier-1 keyword mine + classifier)

Positives = `label='accept'`; negatives = `label='reject'`, across both sources.
Pull doc line-item text (`hubbell_documents.line_items`) + SO `reference` per
labeled pair, then run the weighted log-odds keyword mine and/or train the
meta-classifier on the `signals` vectors.

## Glossary seed (from cash-app v5 `COSTCODE_KEYWORDS`, validate before hardcoding)

`TJI` (i-joist floor; 290-07 → 1TJI/2TJI) · `LVL` (laminated veneer lumber; 290) ·
`LS`/`EBD`/`Cas Truss` (truss suppliers; 295) · `SP Windows` (window brand pkg,
not southern pine) · `dunnage door` (rough-opening / construction-stage door) ·
`Prehung #NNNN` · `Trim Load #NNNN` · `Hardware/Locks` (415-03) · `Roof load`
(roof framing) · `Steel Beam` · `LL-1st Walls` (lower/1st-floor wall framing).

Per CLAUDE.md's "don't relax matcher rules without a data set behind the change"
rule, fold these into `jobsite-reconciler.ts` `SCOPE_KEYWORDS` only after the
log-odds mine confirms they're discriminative on the joint corpus.
