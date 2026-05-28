# Pi-side fix: replace two `COUNT(*)` probes hammering Supabase

**Audience:** the agent working on `beisser-api` (Pi `/home/api/`, PC `C:\Users\amcgrean\python\api`).
**Status:** scoped, one-day change. Highest-leverage performance fix outstanding.
**Branch suggestion:** `claude/mgmt-api-count-probe-fix` (or your repo's convention).

## Why

LiveEdge management and scorecard pages started timing out on 2026-05-28. Supabase
flagged elevated disk I/O. Root cause traced via `pg_stat_statements`:

| Probe (verbatim) | Calls | Total DB time | Disk blocks read |
|---|---:|---:|---:|
| `select count(*) from customer_scorecard_fact` | 33,497 | **7h 20m** | 193 M (~1.5 TB) |
| `SELECT COUNT(*) FROM public.agility_so_header` | 52,947 | **4h 52m** | 1.79 B (~14 TB) |

Both have `application_name = mgmt-api`. Both run unguarded `COUNT(*)` against
multi-GB tables with no `WHERE` clause, so every call seq-scans the entire heap
(`customer_scorecard_fact` is 6.4 GB total / 4.2 M rows; `agility_so_header` is
similar order).

Cumulative effect:
- ~12 hours of cumulative DB time per measurement window.
- ~15.5 TB of disk reads — this is what tripped the Supabase disk-I/O alert.
- Buffer cache continuously evicted by the full-heap scans → legit scorecard
  aggregates fall to 70–78 s mean and trigger LiveEdge's 60 s `maxDuration`.

Replacing both probes with a planner-stat lookup is sub-millisecond, zero scan,
and resolves the symptom on its own.

## The change

Find every call site of these two queries inside `beisser-api`. Likely
suspects are health-check endpoints, sync-progress loggers, or "rows synced"
status probes. Grep for:

```
count(\\*) from customer_scorecard_fact
COUNT(\\*) FROM (public.)?agility_so_header
COUNT(\\*) FROM customer_scorecard_fact
count(\\*) from agility_so_header
```

Replace each with a `pg_class.reltuples` lookup:

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

Same swap for `agility_so_header`.

## Trade-off (important to understand, but doesn't matter here)

`reltuples` is the planner's row estimate, refreshed by autovacuum / autoanalyze.
On `customer_scorecard_fact`, `pg_stat_user_tables` shows `autoanalyze_count = 96`
and the last autoanalyze was minutes before this brief was written — i.e. the
estimate is current to within one sync cycle.

For a health probe or sync-progress display, an estimate within 0.1% is fine.
**If any caller is using this number to gate logic** (e.g. "if count >= N, do
X"), check that the gate still works with an approximate value, or have that
specific caller fall back to a real `COUNT(*)` with a `WHERE` clause that
restricts the scan. Don't reintroduce an unguarded full-table scan in a loop.

If you discover a caller that legitimately needs an exact count, the
acceptable patterns are:

```sql
-- Exact, but only over recently-synced rows (uses an index)
SELECT COUNT(*) FROM customer_scorecard_fact WHERE synced_at >= now() - interval '1 hour';

-- Or: a one-shot call gated behind an explicit flag, not in any loop
```

## How to verify the fix landed

1. Deploy the change (Pi `systemd restart`, whatever your normal flow is).
2. Wait 10 minutes for new traffic to accumulate.
3. From the same Postgres connection that issued this brief (the Supabase MCP
   in the LiveEdge agent), I'll re-run:

   ```sql
   SELECT calls, round(total_exec_time/1000.0)::int AS total_sec,
          round(mean_exec_time)::int AS mean_ms
   FROM pg_stat_statements pss JOIN pg_database pd ON pd.oid = pss.dbid
   WHERE pd.datname = current_database()
     AND (query ILIKE '%count(*) from customer_scorecard_fact%'
          OR query ILIKE '%COUNT(*) FROM public.agility_so_header%')
   ORDER BY total_exec_time DESC;
   ```

   The `calls` counter on the two old probe entries should freeze (no new calls
   accruing). A new entry for the `reltuples` query should appear with sub-1 ms
   mean time.

4. From LiveEdge, hit `/management` and `/scorecard/overview` — they should
   render in <5 s end-to-end (down from 60 s+ / timeout). Confirm via
   `pg_stat_statements`: the long scorecard aggregate queries' `mean_exec_time`
   should drop from 70-78 s back into the single-second range.

## Reset stats so the verification window is clean

When you're done deploying, run this from Supabase SQL editor (or ping the
LiveEdge agent and it can do it via MCP):

```sql
SELECT pg_stat_statements_reset();
```

Optional — gives a fresh window so the new traffic shape is unambiguous instead
of having to subtract old cumulative totals.

## Out of scope for this brief

There are two follow-ups documented in the LiveEdge investigation that are NOT
part of this change. If the disk-I/O issue isn't fully resolved after this
fix, come back for:

- **Rec 2** — add a `WHERE row_fingerprint IS DISTINCT FROM EXCLUDED.row_fingerprint`
  guard to the `customer_scorecard_fact` UPSERT's `DO UPDATE` clause. Reduces
  ~30 M updates/window to only actually-changed rows.
- **Rec 3** — serialize the `customer_scorecard_fact` UPSERT worker pool, or
  sort batches by `shipment_line_key` so concurrent workers stop blocking each
  other on the `uq_customer_scorecard_fact_key` arbiter index (Postgres log
  shows `ShareLock` waits of 1–5 s stacking up).

Ship Rec 1 first; verify; only do Rec 2/3 if metrics say they're still needed.
