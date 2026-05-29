# Pi-side dispatch route-completion reconciler

**Audience:** the agent working on `beisser-api` (Pi, `C:\Users\amcgrean\python\api`).
**Status:** LiveEdge side shipped (PR follow-up to #418). Pi side built but
**emitting on the WRONG column** — see the correction below.
**Branch suggestion:** `claude/dispatch-route-completion-reconciler` (or whatever fits your repo's convention).

---

## ⚠️ CORRECTION (2026-05-29) — read this first

The original brief below told you to detect completion via
`status_flag_delivery = 'D'`. **That column is blank (`''`) on every row in the
synced `agility_shipments` mirror** — all branches, all days. The reconciler's
completion condition therefore never becomes true, so **no real alert has ever
fired** (only manual smoke tests on 2026-05-28).

Confirmed in prod 2026-05-29: 6 routes at 20GR/25BW were fully delivered and
should have alerted, but `status_flag_delivery` was `''` on all 123 of that
day's shipments at those branches.

**Use `status_flag` instead:**

| `status_flag` | Meaning |
|---|---|
| `D` | Delivered |
| `I` | Invoiced (terminal — comes after delivered) |
| `S` | Staged (not yet delivered) |
| `L` | Loaded |

So a route group is **complete** when every row has
`TRIM(status_flag) IN ('D','I')` (delivered, or invoiced/past-delivered) and
`is_deleted = false`. Everywhere the brief below says
`status_flag_delivery = 'D'`, substitute `TRIM(status_flag) IN ('D','I')`.

**Backfill:** after the fix deploys, the next pass will detect today's already-
completed routes and POST them; LiveEdge dedupes on
`(system_id, ship_date, route_id_char, driver)` so each fires exactly once. If
you'd rather skip same-day catch-up, gate the first post-deploy run to
`ship_date >= <deploy date>`.

**Lower-priority follow-up:** `status_flag_delivery` being entirely unpopulated
is likely a `beisser_sync.py` mapping gap. Worth a look so it's not a future
trap, but the alert fix does NOT depend on it — `status_flag` is the right
signal regardless.

---

## Context

LiveEdge has an alert pipeline that emails/texts per-branch recipients the moment a dispatch route's final load is delivered, so the dispatcher can pre-stage the next load instead of catching it from a board refresh.

Today dispatchers use the **old POD system** end-to-end. They build routes and mark deliveries in the old system. LiveEdge's `public.dispatch_routes` and `public.dispatch_route_stops` are empty/stale, so the LiveEdge deliver-endpoint hook (the original PR #418 trigger) never fires. The Pi already syncs `agility_shipments` into Supabase via `beisser_sync.py`, so the Pi sees deliveries flip the moment Agility records them.

We need a Pi-side step that detects "all shipments in a load are delivered" and POSTs to a LiveEdge endpoint, which handles dedupe + notification.

## What "a route" means here

In Agility, the natural grouping is the tuple:

```
(system_id, ship_date, route_id_char, driver)
```

on `agility_shipments`. `system_id` is the branch code (`10FD`/`20GR`/`25BW`/`40CV`), `route_id_char` is the dispatcher's route label (`"07"`, `"P1"`, etc.), `driver` is the assigned driver's name. The route is **complete** when every row in that group has `TRIM(status_flag) IN ('D','I')` and `is_deleted = false`. **(See the 2026-05-29 correction at the top — do NOT use `status_flag_delivery`, it's unpopulated.)**

Credit memos count as stops — they're shipments with `sale_type = 'Credit'` and are part of the same load. Don't exclude them.

## Suggested query (Postgres)

Run this after each successful `agility_shipments` sync pass. Returns one row per recently-completed route that hasn't yet been alerted:

```sql
WITH groups AS (
  SELECT
    sh.system_id,
    CAST(sh.ship_date AS DATE)            AS ship_date,
    NULLIF(TRIM(sh.route_id_char), '')    AS route_id_char,
    NULLIF(TRIM(sh.driver), '')           AS driver,
    COUNT(*)                              AS total_shipments,
    -- Corrected 2026-05-29: status_flag_delivery is unpopulated; use status_flag.
    COUNT(*) FILTER (WHERE TRIM(sh.status_flag) IN ('D','I')) AS delivered_shipments,
    ARRAY_AGG(sh.so_id::text ORDER BY sh.so_id) AS so_ids
  FROM agility_shipments sh
  WHERE sh.is_deleted = false
    AND sh.ship_date >= CURRENT_DATE - INTERVAL '2 days'
    AND sh.system_id IN ('10FD','20GR','25BW','40CV')
  GROUP BY sh.system_id, CAST(sh.ship_date AS DATE), NULLIF(TRIM(sh.route_id_char), ''), NULLIF(TRIM(sh.driver), '')
)
SELECT
  g.system_id,
  g.ship_date,
  g.route_id_char,
  g.driver,
  g.total_shipments,
  g.so_ids
FROM groups g
WHERE g.total_shipments = g.delivered_shipments
  AND g.total_shipments >= 1
  -- Must have at least one of route_id_char or driver — otherwise the
  -- group key isn't unique enough.
  AND (g.route_id_char IS NOT NULL OR g.driver IS NOT NULL)
  -- Suppress already-alerted routes (any successful send recorded).
  AND NOT EXISTS (
    SELECT 1 FROM bids.dispatch_route_completion_log lg
    WHERE lg.route_source        = 'agility'
      AND lg.system_id           = g.system_id
      AND lg.agility_ship_date   = g.ship_date
      AND COALESCE(lg.agility_route_code, '') = COALESCE(g.route_id_char, '')
      AND COALESCE(lg.driver_name, '')        = COALESCE(g.driver, '')
      AND lg.status              IN ('sent','skipped_console')
  );
```

`bids.dispatch_route_completion_log` is the LiveEdge-managed audit table — it's safe to read for dedupe but **don't write to it directly**, LiveEdge owns the writes.

Two notes on the `EXISTS` suppression:
- It's a belt-and-suspenders check. The LiveEdge endpoint also dedupes on the same tuple, so re-POSTing a completed route is safe.
- We compare `COALESCE(..., '')` because the orchestrator treats NULL route_id_char or NULL driver as a valid key — keeping the join logic consistent here avoids surprise duplicate alerts when one of the fields is absent.

## POST contract

```
POST https://app.beisser.cloud/api/dispatch/agility-route-complete
Authorization: Bearer <LIVEEDGE_DISPATCH_SYNC_TOKEN>
Content-Type: application/json

{
  "systemId":      "20GR",
  "shipDate":      "2026-05-27",
  "routeIdChar":   "07",          // or null
  "driver":        "Joe Smith",   // or null
  "shipmentCount": 5,
  "soIds":         ["1480288","1480289","1480290","1480291","1480292"]
}
```

**Response:**
- `200 { ok: true, outcome: { triggered: true, sends: [...] } }` — alert dispatched (or dedup-skipped per channel). `outcome.sends[]` is informational.
- `200 { ok: true, outcome: { triggered: true, reason: 'no_recipients', sends: [] } }` — no recipients configured for that branch yet; treat as success, the row will get backfilled when an admin adds one. Don't retry.
- `422 { error: "..." }` — payload validation failed. Don't retry the same payload.
- `401 { error: "Unauthorized" }` — bad token. Check env vars.
- `5xx` — retry with exponential backoff (transient).

**At least one of `routeIdChar` and `driver` must be present.** The endpoint rejects payloads where both are null.

## Env var

On the Pi `.env`:

```
LIVEEDGE_DISPATCH_SYNC_TOKEN=<same value as DISPATCH_SYNC_TOKEN in Vercel>
```

Pick something random (`openssl rand -hex 32`) and set it on **both** sides:
- Vercel: `DISPATCH_SYNC_TOKEN` (production + preview)
- Pi: `LIVEEDGE_DISPATCH_SYNC_TOKEN`

## Retry semantics

The LiveEdge endpoint is fully idempotent — it pre-checks `dispatch_route_completion_log` for terminal-status rows on the same Agility tuple before invoking the email/SMS provider. So:

- **Re-POSTing a completed route is safe.** Dedup happens server-side.
- **Failed-send rows are retryable.** If Twilio rate-limits or Resend bounces, the log row gets `status='failed'`, and the next POST will retry that recipient/channel.
- **Don't loop with no backoff.** If you see `5xx`, back off (`2s, 4s, 8s, 16s`) before retrying.

## Dispatch frequency

Same as the existing `agility_shipments` sync cadence — every 2–5 minutes is fine. The user-perceived latency is "driver finishes load → up to one sync cycle → alert lands". No need to add a separate timer.

## Where to put the code

Suggest:
- `agility_api/dispatch_completion.py` — the query + POST wrapper, plus a `reconcile_completed_routes()` entry point.
- Call from `beisser_sync.py` right after `sync_shipments()` returns successfully.
- Idempotent on its own — if `reconcile_completed_routes()` runs twice in a row with no new completions, it's a no-op (no rows match the WHERE clause).

## How to test before turning it on

1. Apply LiveEdge migration `0034_dispatch_route_completion_agility.sql` (the user should do this in Supabase SQL editor — confirm with them).
2. Set `LIVEEDGE_DISPATCH_SYNC_TOKEN` on the Pi.
3. Set `DISPATCH_SYNC_TOKEN` in Vercel preview, deploy a preview build.
4. Have an admin add one recipient at `/admin/dispatch-alerts` pointing at your own email/phone.
5. Manually POST a known-completed `(system_id, ship_date, route_id_char, driver)` to the endpoint with `curl` and confirm the alert lands.
6. Wire up the reconciler in `beisser_sync.py`, deploy, watch the first real sync cycle.

## Out of scope for v1

- Don't try to mirror Agility's `status_flag_delivery` back into LiveEdge's `dispatch_route_stops`. That's a separate cleanup that only matters if/when dispatchers start using the LiveEdge dispatch board. For now, just fire the alerts off Agility data directly.
- Don't introduce a Pi-side state table for "already alerted" — the `EXISTS` check against LiveEdge's `dispatch_route_completion_log` is the source of truth. Two writers diverge.

## When you're done

Update `CLAUDE.md` in this repo (LiveEdge) under the dispatch section to note that the Agility-source path is live, link the migration, and mention the Pi-side module path so the next agent can find it. The original Pi handoff (this doc) can stay as historical context.
