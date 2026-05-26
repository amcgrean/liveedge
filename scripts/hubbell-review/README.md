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

## Agent prompt

A copy-paste prompt for the agent, after running `pull`:

> The directory `./hubbell-queue/packets/` contains Hubbell PO/WO documents that
> need to be matched to Agility ERP sales orders. For each packet directory
> under `packets/`:
>
> 1. Read `packet.json` — it contains the document's extracted fields and 1-N
>    candidate sales orders.
> 2. Open `doc.pdf` — visually verify the address and scope of work.
> 3. For each candidate, decide:
>    - **accept** — the doc and SO clearly refer to the same physical jobsite
>      AND the same scope (e.g. both framing-stage, or both trim-stage)
>    - **reject** — different address, different city, or clearly wrong scope
>    - **skip** — genuine ambiguity (partial address match, missing data)
> 4. Write your decisions to `decisions.json` in this format:
>    ```json
>    {
>      "decisions": [
>        {
>          "suggestion_id": "<uuid from packet.json>",
>          "action": "accept" | "reject" | "skip",
>          "confidence": "high" | "medium" | "low",
>          "reasoning": "one or two sentences"
>        }
>      ]
>    }
>    ```
>
> Be cautious. False positives corrupt accounting records. The bar for "accept"
> is "I'd stake my reputation on this match", not "probably right".
> Low-confidence accepts will be auto-degraded to skip server-side.
