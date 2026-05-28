# Pi-side fix: mgmt-api I/O storm on the agility-api Supabase

**Audience:** the agent working on `beisser-api` (Pi `/home/api/`, PC `C:\Users\amcgrean\python\api`).
**Status:** scoped, one-day change. Highest-leverage performance work outstanding.
**Branch suggestion:** `claude/mgmt-api-io-storm` (or your repo's convention).

## What we observed

LiveEdge `/management` and `/scorecard/*` pages started timing out on 2026-05-28.
Supabase flagged elevated disk I/O. Investigation via `pg_stat_statements`
on the `agility-api` project (`vyatosniqboeqzadyqmr`) traced ~95% of the
load to two unguarded `COUNT(*)` probes from `application_name = mgmt-api`:

| Probe (verbatim) | queryid | Calls | Total DB time | Disk reads |
|---|---|---:|---:|---:|
| `select count(*) from customer_scorecard_fact` | `-2186310581588620979` | 33,515 | **7h 20m** | 193 M blocks (~1.5 TB) |
| `SELECT COUNT(*) FROM public.agility_so_header` | `-3014666078659518893` | 52,961 | **4h 52m** | 1.79 B blocks (~14 TB) |

Combined: **~12 hours of DB time + ~15.5 TB of disk reads** in the stat
window. Buffer cache eviction from the seq-scans drives the legit scorecard
aggregates to 70–78 s mean and triggers LiveEdge's 60 s `maxDuration`.

The `agility-api` user also flagged that two duplicate worker processes
were running on the Pi at the time of the incident
(PIDs 1691587/1691590 and 1691602/1691604, both started 10:48). That's
the **PR #29 duplicate-worker bug recurring** — likely caused by an
autodeploy thrash racing the killer. **Almost everything below assumes
that hypothesis is correct.** Step 0 verifies it before any other work.

## Step 0 — Verify single vs duplicate worker (do this first)

If two `mgmt-api` workers are racing, the I/O numbers above are ~2x
inflated AND Rec 3 below becomes the right starting point instead of
Rec 1 / 2. Do not skip this step.

On the Pi:

```bash
# How many copies of the sync worker are currently running?
sudo systemctl status agility-api-sync.service
ps -ef | grep -E "(runtime_sync|beisser_sync|mgmt[-_]api)" | grep -v grep
```

Expected = 1 main + N child workers from a single supervisor. If you see
two independent process trees with overlapping start times (the way
PR #29 manifested), you're in the duplicate-worker case.

You can also cross-check from Supabase. Two distinct PIDs running the
same sync queries from the same `client_addr` is the signature:

```sql
SELECT pid, application_name, client_addr::text, backend_start, state,
       left(query, 80) AS q
FROM pg_stat_activity
WHERE application_name = 'mgmt-api'
   OR backend_type = 'client backend'
ORDER BY backend_start;
```

### Branching from Step 0

| State | Do next |
|---|---|
| One worker tree, no duplicates | Skip to Rec 1 |
| Two worker trees overlapping | Start with Rec 3 (kill duplicates), then re-measure before deciding on Rec 1/2 |

## Rec 3 (promoted) — kill the duplicate worker, harden the killer

This is the cheapest fix if Step 0 confirms duplicates: it doesn't touch
sync logic at all.

1. Kill one of the two worker trees (whichever is younger / clearly the
   duplicate). The PR #29 fix already implemented the killer; the
   regression is that the killer raced the autodeploy forward → rollback
   → forward cycle.
2. Reproduce PR #29's fix and harden it:
   - Take an `flock` or `pidfile` lock on `systemd start`, so a second
     start attempt is rejected synchronously before any DB connection.
   - Make the killer idempotent and wait for full process-group death
     (use `kill -- -PGID` + a poll loop) before returning so a
     follow-up autodeploy can't sneak in.
3. Add a Supabase-side guard: at sync-worker startup, abort if more
   than one row with `application_name = 'mgmt-api'` exists in
   `pg_stat_activity` for this worker's `client_addr`. Cheap belt-and-
   braces.

After landing, re-run the LiveEdge agent's `pg_stat_statements` query
(below) and confirm `agility_so_header` probe call rate drops by ~50%.
If the new rate is acceptable and the disk-I/O alert clears, Rec 1 and
Rec 2 become optional polish, not urgent fixes.

## Rec 1 (conditional on Rec 3 not being sufficient) — swap probes for reltuples

If duplicates were never the issue, OR if Rec 3 didn't drop the I/O
enough, swap the two probes for a `pg_class.reltuples` lookup.

### Pin the call sites before swapping

The user's suspect is `PostgresMirrorWriter.count_target_rows()` in
`agility_api/runtime_sync.py`, called after every merge to log row
counts. Confirm by grepping for the exact strings and counting hits:

```bash
cd /home/api  # or your local checkout
grep -rn --include='*.py' -E 'count\(\*\)\s+FROM\s+(public\.)?customer_scorecard_fact' .
grep -rn --include='*.py' -E 'count\(\*\)\s+FROM\s+(public\.)?agility_so_header' .
grep -rn --include='*.py' 'count_target_rows' .
```

**Exclude `dashboard_stats` and any filtered-count site from this swap.**
`reltuples` only works for full-table counts. Calls like
`COUNT(*) FROM agility_picks WHERE print_status NOT IN (...)` are
legitimately scanning a subset; leave them alone. They're not in the
`pg_stat_statements` top offenders.

If grep turns up something more surprising than `count_target_rows()`
(e.g. a heartbeat in `dashboard_stats`, a `verification.py` reconciliation
loop, an undocumented `/healthz` endpoint), document where the call lives
in the PR description so the next agent sees it.

### The swap

```python
# Before
cur.execute("SELECT count(*) FROM customer_scorecard_fact")
total = cur.fetchone()[0]

# After
cur.execute("""
    SELECT reltuples::bigint
    FROM pg_class
    WHERE oid = 'public.customer_scorecard_fact'::regclass
""")
total = cur.fetchone()[0]
```

Same pattern for `agility_so_header`. `reltuples` is the planner's row
estimate, refreshed by autoanalyze (currently at ~96 runs on
`customer_scorecard_fact` per `pg_stat_user_tables` — fresh enough).
For a post-merge log message, approximate is fine.

If a caller turns out to gate logic on the count (e.g. "if count >= N
do X"), that caller needs to either tolerate an estimate, or fall back
to a `COUNT(*)` with a `WHERE` that restricts the scan. Don't reintroduce
an unguarded full-table scan in a loop.

## Rec 2 (defer unless metrics still bad) — fingerprint guard on the UPSERT

`pg_stat_user_tables` shows **30 M updates on 4.4 M rows** for
`customer_scorecard_fact` (~7× table rewrite). The table already carries
a `row_fingerprint varchar` column the sync writes but doesn't read.

If after Rec 3 (and possibly Rec 1) the disk-I/O alert recurs, add a
fingerprint guard to the existing `ON CONFLICT DO UPDATE`:

```sql
ON CONFLICT (shipment_line_key) DO UPDATE SET
  shipment_date = EXCLUDED.shipment_date,
  ... (existing 50-column SET list)
WHERE customer_scorecard_fact.row_fingerprint IS DISTINCT FROM EXCLUDED.row_fingerprint
```

Unchanged rows become true no-ops (no WAL, no autovacuum churn, no
buffer dirtying). The conflict arbiter still claims the row lock, the
constraint still holds — only the heap write is skipped. Logged
`rowcount` will drop to the count of actually-changed rows; that's the
correct number, not a regression.

## How to verify (LiveEdge agent will run these for you)

After deploy, ping the LiveEdge agent (session
`session_01Xzna5Mb297YcPUvBWmyqNw`) and ask it to re-run the
verification block. It maps to these SQL queries on the
`agility-api` Supabase project (`vyatosniqboeqzadyqmr`):

```sql
-- 1. Did the old probes stop accruing calls?
SELECT queryid, calls, round(total_exec_time/1000.0)::int AS total_sec,
       round(mean_exec_time)::int AS mean_ms
FROM pg_stat_statements pss JOIN pg_database pd ON pd.oid = pss.dbid
WHERE pd.datname = current_database()
  AND queryid IN (-2186310581588620979, -3014666078659518893);
-- expect: calls frozen at ~33,515 / ~52,961 (or no rows if you reset
-- stats post-deploy)

-- 2. Did a new reltuples query appear with sub-1ms mean?
SELECT calls, round(mean_exec_time, 2) AS mean_ms, query
FROM pg_stat_statements pss JOIN pg_database pd ON pd.oid = pss.dbid
WHERE pd.datname = current_database()
  AND query ILIKE '%reltuples%'
  AND (query ILIKE '%customer_scorecard_fact%'
       OR query ILIKE '%agility_so_header%');

-- 3. Did the scorecard aggregates' mean drop back to single-second?
SELECT calls, round(mean_exec_time)::int AS mean_ms,
       round(total_exec_time/1000.0)::int AS total_sec,
       left(query, 100) AS q
FROM pg_stat_statements pss JOIN pg_database pd ON pd.oid = pss.dbid
WHERE pd.datname = current_database()
  AND query ILIKE '%customer_scorecard_fact%'
  AND query ILIKE '%agility_so_header%'
ORDER BY total_exec_time DESC LIMIT 5;
-- expect mean_ms to drop from 70-78s into the single-second range

-- 4. Are concurrent ShareLock waits gone? (specifically for Rec 3)
SELECT count(*) FILTER (WHERE wait_event = 'transactionid') AS lock_waits,
       count(*) FILTER (WHERE wait_event = 'DataFileRead') AS io_waits
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

End-user check: hit `/management` and `/scorecard/overview` from
LiveEdge prod. Both should render in <5 s.

## Optional — reset stats for a clean window

If you want unambiguous post-deploy numbers instead of having to subtract
cumulative totals:

```sql
SELECT pg_stat_statements_reset();
```

Run this in Supabase SQL editor after the new code is verified live.
Asks the LiveEdge agent to drop a marker timestamp in this doc when it
re-measures, so the window is anchored.

## Rollout order recap

1. **Step 0** — `ps`/`pg_stat_activity` check for duplicate workers.
2. If duplicated → **Rec 3** (kill + harden killer) → re-measure → stop if I/O drops enough.
3. If not duplicated, or Rec 3 wasn't enough → **Rec 1** (probes → reltuples), call sites pinned via grep first.
4. If I/O storm still recurs after Rec 1 → **Rec 2** (fingerprint guard).

No LiveEdge code changes required at any step. If end-user timeouts
recur during the window between Step 0 and the deploy, ping the
LiveEdge agent — it can land a 300 s `maxDuration` band-aid on the
scorecard routes as an interim, but only if asked.
