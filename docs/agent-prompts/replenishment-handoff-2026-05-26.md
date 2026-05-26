# Replenishment + Buyer Workspace — Handoff (2026-05-26)

You're picking up after Phases 1–7 of the buyer-workspace plan have all shipped. The full feature set is live in production. This doc covers state + what's worth doing next + landmines to know about.

**Read these first:**
1. `CLAUDE.md` § "Buyer Workspace & Replenishment Engine (2026-05-22 → 2026-05-26)" — the canonical state-of-the-codebase doc
2. `docs/buyers-workspace-plan-2026-05-22.md` — the original plan + resolved design decisions
3. `docs/agent-prompts/buyer-workspace-dashboard-design.md` — the design brief that produced the workspace

## What's live

```
/admin/item-planning                    full CRUD + CSV template + import + branch defaults editor
/purchasing/workspace                   six-tile redesigned dashboard (Claude Design handoff)
/purchasing/suggested-buys              rebuilt on the engine; grouped by supplier
/purchasing/outages                     days-to-zero risk view
/purchasing/movement                    velocity-change list with buyer notes
/scorecard/product/item/[itemCode]      gained an inline Replenishment card

Tables in bids:
  item_planning              per-(system_id, item_code) override row
  branch_planning_defaults   one row per branch
  movement_notes             buyer annotations per (sys, item, week_starting)
```

Engine perf: ~270ms for a single branch with the two indexes from migration 0029 (`idx_csf_branch_item_date` + `idx_agility_suppliers_trimmed_key`). Single fetch for the workspace page (`/api/purchasing/workspace`).

## Recommended next steps, in order of leverage

### 1. Daily engine-output snapshot (highest UX leverage)

The workspace hero tiles render `Sparkline` and `Delta` components but with empty data — they hide automatically. A daily snapshot of the engine output (one row per `(system_id, severity, view, date)` with a count) unlocks both:

- 14-day sparkline on the Buy Now / Outage Risk tiles
- "▲ +4 since yesterday" deltas on every tile

**Sketch:**
```sql
CREATE TABLE bids.replenishment_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  system_id text NOT NULL,
  metric text NOT NULL,    -- 'buy_now_count', 'outage_count', 'overdue_pos_count', etc.
  value numeric NOT NULL,
  UNIQUE (snapshot_date, system_id, metric)
);
```

Cron at `/api/cron/replenishment-snapshot` invokes the engine for each branch, writes one row per metric. The workspace aggregator then queries the last 14 days for sparklines + yesterday's row for delta.

Effort: 1 PR, ~3-4 hours. Mechanical once the table exists. Don't compromise the engine itself — keep all the snapshot logic in a new module.

### 2. Per-row unit cost on the engine (moderate leverage)

Buy Now's `estimatedValue` and the supplier-rollup `value` columns are 0 today because the engine doesn't carry unit cost. Surfacing dollars makes the workspace more decision-useful for the lead buyer.

Two options:
- **Simplest**: pre-aggregate average cost per `(system_id, item_code)` from `agility_po_lines` (last received cost or 90-day average) into a view, JOIN that into the engine `computed` CTE
- **Closer to truth**: add an `item_cost_basis` column to `agility_item_branch` via the sync worker (PO check-in cost)

Either way the UI changes are tiny — the conditional `data.estimatedValue > 0` checks already exist on the tile and start showing values automatically.

### 3. `qty_on_hand` sync health (operational, not code work)

The data-quality flag in CLAUDE.md is real: 16 of 1366 stocked items at 20GR have positive `qty_on_hand`. The engine is correct given the input; the problem is upstream. Likely root causes (in rough order of likelihood):
- ERP→Supabase sync only updates `qty_on_hand` on certain triggers and most items never tick over
- Agility-side qty is itself stale because the warehouse doesn't cycle-count
- A delete-and-re-sync that ran while everyone was actively shipping

Not a code task for you — but mention it to the user when discussing how the engine output looks, because it will dominate any conversation about "are these red items real?"

### 4. Item scorecard Replenishment card — surface engine output (small)

The card landed in Phase 7 but only shows the *override* state. Buyers viewing the item scorecard would benefit from seeing the *engine's current severity + suggested qty* alongside their override. One-off engine query per item (the engine supports a single-item filter via `&q=<item_code>`, which the page can call server-side). Maybe 1-2 hours.

### 5. Other screens in the design bundle

The Claude Design handoff included designs for ~12 screens:
```
home, picks, sales, takeoff, mobile, management, scorecard, dispatch,
fleetmap, vendor, forecast, workspace (DONE)
```
Each is a separate phase if the user wants any of them. Read `LiveEdge.html` + the per-screen JSX in `/tmp/...` (if still available — otherwise the user has the original zip).

## Landmines

### Don't touch
- **The supplier-name join shape in `replenishment.ts`.** It's deliberately deferred to the outer SELECT after severity filtering. Pulling it back into `supplier_rules` regresses the query from 270ms → 5s+ because the optimizer can't push the trim-expression predicate through it. There's a clear comment block warning about this.
- **The LATERAL usage subquery.** The index `idx_csf_branch_item_date` is an INDEX-ONLY scan with `qty_shipped` INCLUDE. If you change the subquery shape to a JOIN/GROUP BY the optimizer drops to seq scan and you'll lose ~15s.

### Watch out
- **`agility_items.system_id = '00CO'`** — the master table is keyed by the company code, not branch. The engine join needs this explicit predicate to use `idx_agility_items_item`. If anyone "simplifies" by dropping it the query goes back to seq scanning 178k items.
- **`agility_items.discontinued_item` is `'No'` / `'no'` / `'Yes'`** — not null/empty. The engine filters `LOWER(...) NOT IN ('yes', 'y')`. Don't use IS NULL.
- **`agility_so_lines.item_code` can be NULL** (~0.1%) — the engine joins via `item_ptr` not `item_code` to avoid the gap.
- **`bids.movement_notes` upsert key is `(system_id, item_code, week_starting)`** — weekStarting must be a Monday (the POST handler normalizes the default; clients passing a custom date should pre-normalize too).

### Don't reopen these decisions
- **CSV import doesn't validate against the item universe.** The `/api/admin/item-planning/import` accepts any `(systemId, itemCode)` pair. Reasoning: the buyer is the source of truth, and we don't want to block a row just because the item isn't yet in `agility_items` (could be a brand-new SKU not synced yet). This was deliberate.
- **`source` column on `item_planning`** is set at write time and never updated. Even when a buyer edits a CSV-imported row through the admin UI, the source stays as `csv_import` so audit/diagnostics can answer "what came from the May 2026 Millwork seed file?" If a user complains, change the policy explicitly.
- **Quick Actions: New PO is disabled.** There's no "create PO via LiveEdge" flow today — POs go into Agility. The button is in the design because that's where it should be when the flow exists; leave it disabled until then.

## Branches

After this handoff, only the merged trunk matters. The plan's own planning branch + each phase's branch were all squash-merged. If you're auditing open branches, `git log origin/main --grep="replenishment\|workspace\|item-planning"` finds the merge history.

## How to validate work

Spot-check the engine output makes sense:
```bash
curl /api/purchasing/replenishment?view=outages&branch=20GR&limit=10
# Should return red+amber+yellow rows ordered by coverage_days ascending,
# with realistic on-hand / demand / supply / usage numbers.
```

Or in Supabase SQL editor:
```sql
-- pick any row from the engine output and verify the math:
SELECT ai.item, ib.qty_on_hand,
  (SELECT SUM(qty_shipped) FROM customer_scorecard_fact
   WHERE branch_id='20GR' AND item_number=ai.item
     AND invoice_date >= now() - interval '90 days') AS qty_90d
FROM agility_items ai
JOIN agility_item_branch ib ON ib.item_code=ai.item
WHERE ai.system_id='00CO' AND ai.item='<some-item>' AND ib.system_id='20GR';
```

Workspace page: load `/purchasing/workspace`, switch branches, click each tile, verify drill-through lands on the right page with the right filter.

## Where the user is in their head

After Phase 6 merged the user said "yes go ahead and get another phase of work done and then update agent docs and plan and do a handoff." This handoff is the handoff. They're going to:

1. Spend time using the workspace in production
2. See what the engine output actually looks like with real branch data
3. Probably ask for one of the four follow-ups above based on what they hit first

Don't pre-build any of the follow-ups speculatively. Wait for a real complaint.
