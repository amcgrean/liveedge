# Hubbell Review CLI

A small local toolkit for processing the Hubbell suggested-match queue with **any** agent that can read PDFs (Codex, Claude Code, etc.) — no Anthropic API tokens consumed; the agent runs under your existing subscription.

## Setup

You need two environment variables:

```bash
export LIVEEDGE_HUBBELL_TOKEN=<value from Vercel: HUBBELL_UPLOAD_TOKEN>
export LIVEEDGE_BASE_URL=https://app.beisser.cloud   # optional, defaults to this
```

Place these in a `.env` file at the project root, or your shell rc — your call.

## Workflow

Three commands, one work directory. The flow:

```
1.  npx tsx scripts/hubbell-review pull --limit 10 --dir ./hubbell-queue
                            ↓
       (creates ./hubbell-queue/packets/<doc_id>/{doc.pdf, packet.json, decisions.json})

2.  Run your agent inside ./hubbell-queue/.
       Tell it: "Process every packet under packets/. For each one, open doc.pdf,
       compare to the candidates in packet.json, and write your decisions to
       decisions.json. The format and instructions are in REVIEW.md."

3.  npx tsx scripts/hubbell-review apply --dir ./hubbell-queue
                            ↓
       (POSTs each decision to LiveEdge, moves processed packets to ./hubbell-queue/applied/)
```

You can re-run `pull` to grab another batch — packets already on disk are skipped
unless you delete the queue directory first.

## Commands

### `pull`

```
npx tsx scripts/hubbell-review pull [options]

  --limit <n>        Max docs to pull (default 10)
  --dir <path>       Work directory (default ./hubbell-queue)
  --min-confidence <n>  Drop suggestions below this (default 30)
  --source <name>    Filter by match_source (e.g. jobsite_reconcile,
                     address_scrape, address, po_number_split). Omit to
                     pull from all matchers.
```

For each unique document with pending suggestions, writes:

- `packets/<doc_id>/doc.pdf` — the Hubbell PDF
- `packets/<doc_id>/packet.json` — the doc fields + all candidate SOs for this doc
- `packets/<doc_id>/decisions.json` — empty template the agent fills in

### `apply`

```
npx tsx scripts/hubbell-review apply [options]

  --dir <path>       Work directory (default ./hubbell-queue)
  --reviewer <name>  Reviewer tag for the audit trail (default "codex")
  --dry-run          Print what would be sent without POSTing
```

Scans `packets/<doc_id>/decisions.json` for each packet, POSTs to the review
endpoint, and moves successfully-processed packets to `applied/`. Packets with
empty / unparseable decisions are skipped.

## Training corpus

Every decision is now persisted centrally to `bids.hubbell_match_labels`
(source `cli_review`) — not just on your disk. The `reason_code`, `signals`,
`confidence`, and `reasoning` fields you fill in are forwarded by `apply` to the
review endpoint and stored there, so they aggregate across reviewers and feed
the keyword-mining + match-classifier work. Fill them in consistently.

## Agent prompt

A copy-paste prompt for the agent, after running `pull`:

> The directory `./hubbell-queue/packets/` contains Hubbell PO/WO documents that
> need to be matched to Agility ERP sales orders. You are building a TRAINING
> CORPUS, so record your reasoning structurally, not just accept/reject. For
> each packet directory under `packets/`:
>
> 1. Read `packet.json` — it contains the document's extracted fields and 1-N
>    candidate sales orders.
> 2. Open `doc.pdf` — visually verify the address and scope of work.
> 3. For each candidate, decide:
>    - **accept** — address matches AND at least one corroborating signal fires.
>      Address-alone is NEVER enough (a development clusters many SOs at one
>      street; most are wrong scope or wrong unit number).
>    - **reject** — different address/city, wrong number, or wrong scope.
>    - **skip** — genuine ambiguity (partial address match, missing data).
> 4. Write `decisions.json`:
>    ```json
>    {
>      "decisions": [
>        {
>          "suggestion_id": "<uuid from packet.json>",
>          "action": "accept" | "reject" | "skip",
>          "confidence": "high" | "medium" | "low",
>          "reason_code": "<see lists below>",
>          "signals": {
>            "address": true,
>            "ref_match": false,
>            "dev_house": false,
>            "scope_phase": true,
>            "amount": false
>          },
>          "reasoning": "one or two sentences"
>        }
>      ]
>    }
>    ```
>
> **Corroborating signals** (set the ones that fired): `ref_match` (a token in
> the SO reference matches the doc — unit/lot number, "Doors #9717"),
> `dev_house` (dev_code + house_number agree), `scope_phase` (same construction
> stage — both framing, both trim), `amount` (doc total within ~10% of SO total).
>
> **accept reason_code**: the corroborator you relied on (`ref_match` /
> `dev_house` / `scope_phase` / `amount`).
> **reject reason_code**: `wrong_address` | `wrong_number` | `wrong_scope` |
> `parent_vs_sub` | `partial_scope` | `cancelled_so` | `no_corroboration`.
>
> Be cautious. False positives corrupt accounting records. The bar for "accept"
> is "I'd stake my reputation on this match", not "probably right".
> Low-confidence accepts will be auto-degraded to skip server-side.
