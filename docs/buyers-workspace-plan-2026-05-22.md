# Buyer Workspace — State + Plan (2026-05-22 → COMPLETE 2026-05-26)

Branch: `claude/buyers-workspace-planning-1ZMmm` (planning) → built across 7 PRs through 2026-05-26.

## Status (2026-05-26)

All seven planned phases are LIVE.

| Phase | Deliverable | PR | Status |
|---|---|---|---|
| 1 | `bids.item_planning` + `branch_planning_defaults` schema (migration 0028) | #379 | LIVE |
| 2 | `/admin/item-planning` CRUD + CSV template + import + branch defaults | #380 | LIVE |
| 3 | Replenishment engine + `/api/purchasing/replenishment` + perf indexes (migration 0029) | #382 | LIVE |
| 4 | `/purchasing/outages` page | #383 | LIVE |
| 5 | `/purchasing/suggested-buys` rebuilt on the engine; old Agility-PPO routes removed | #384 | LIVE |
| 6 | Buyer Workspace redesign (Claude Design handoff) + Recent Movement + `bids.movement_notes` (migration 0030) | #391 | LIVE |
| 7 | Item scorecard "Replenishment" card + inline override editor | ? | LIVE |

**Current CLAUDE.md section: "Buyer Workspace & Replenishment Engine (2026-05-22 → 2026-05-26)"** — that's the canonical state-of-the-codebase reference for this feature set.

**Follow-ups deferred** (none blocking; all flagged in the CLAUDE.md section as "intentional gaps"):
- Daily engine-output snapshot table → unlocks sparklines + delta-since-yesterday on hero tiles
- Per-row unit cost on engine output → `estimatedValue` on Buy Now tile + supplier $ rollup
- Invoice-vs-PO cost diff feed → price-variance exception count
- Per-line submission data → real `total_lines` / `with_discrepancy` on Pending Check-Ins
- `qty_on_hand` sync health investigation (the engine is correct; the input data is sparse)

---

The rest of this document is preserved as the historical design record (audit, engine spec, severity bucket definitions, etc.).

---

## TL;DR
- The Workspace itself is currently a near-empty shell: 3 quick-action tiles + "Upcoming POs" + "Recent Check-Ins". No surfacing of *what a buyer should do today.*
- `/purchasing/suggested-buys` reads `agility_suggested_po_*` directly. User has confirmed these are "basically worthless" → rebuild in LiveEdge using actual usage + on-hand + lead times + minimums, with LiveEdge-managed overrides for Millwork (and any other item class Agility's min/max doesn't handle correctly).
- "Potential outages" doesn't exist anywhere. Same data feed as our rebuilt suggested-buys, different framing: forward-looking risk of going OOS before the next receipt lands.
- The shape that emerges: one **replenishment engine** in LiveEdge, two views over it (Buy Now / At Risk), plus an admin surface for item-level planning overrides.

---

## 1. Current State Audit

### Pages under `/purchasing`
| Route | File | Purpose | Status |
|-------|------|---------|--------|
| `/purchasing` | `CheckinClient.tsx` | PO check-in photo workflow | LIVE |
| `/purchasing/workspace` | `WorkspaceClient.tsx` | Buyer landing | **shallow — needs rework** |
| `/purchasing/open-pos` | (open-pos client) | Open PO list, lead/min chips | LIVE |
| `/purchasing/pos/[po]` | (pos detail) | PO detail + receiving | LIVE |
| `/purchasing/suggested-buys` | `SuggestedBuysClient.tsx` | Suggested POs from ERP | **broken upstream — rebuild** |
| `/purchasing/exceptions` | `ExceptionsClient.tsx` | Overdue PO / short receive alerts | LIVE |
| `/purchasing/manage` | `CommandCenterClient.tsx` | KPI cards + by-branch overdue | LIVE |
| `/purchasing/scorecard` | (vendor scorecard) | Vendor metrics | LIVE |
| `/purchasing/review` | (review client) | Check-in submission review | LIVE |

### What's missing
1. **Outage / at-risk view.** Nothing today flags "this SKU will hit zero before the next PO lands."
2. **A real Workspace homepage.** Today it's marketing tiles. The buyer needs an actionable "today's queue" surface.
3. **LiveEdge-managed item planning fields.** Agility's min/max/safety-stock fields don't behave the way Beisser needs (esp. Millwork). No schema for these in `bids` today.
4. **Trustworthy suggested-buys.** Current page is a wrapper over `agility_suggested_po_*`; the upstream values are not actionable.

---

## 2. Replenishment Engine (powers Suggested Buys + Potential Outages)

Same data → two derived metrics → two views.

### Data inputs available *today* (no new sync work)
| Signal | Source | Notes |
|---|---|---|
| On-hand qty | `agility_item_branch.qty_on_hand` | Per `(system_id, item_ptr)` |
| Open demand | `agility_so_lines` open lines | `qty_ordered - COALESCE(qty_shipped,0)` for non-closed SOs |
| Open supply (inbound) | `agility_po_lines` minus `agility_receiving_lines` | Net open qty on PO, with `expect_date` / `exp_rcpt_date` |
| Usage history | `customer_scorecard_fact.qty_shipped` | Per `(branch_id, item_number, invoice_date)` — best historical demand signal we have |
| Lead time | `agility_item_supplier.lead_time_1..5` + `lead_time_flag` | Per `(system_id, supplier_key, item_ptr, ship_from_seq_num)` |
| Min order qty / pak | `agility_item_supplier.min_ord_qty`, `min_pak`, `min_ord_violation` | Same key |
| Primary supplier | `agility_item_supplier.is_primary` | Same key |
| Item active/stock | `agility_item_branch.active_flag`, `stock` | Filter — only stocked active items |
| Item meta | `agility_items` | `buyer_id`, `discontinued_item`, `product_major`, `product_minor`, `stocking_uom` |

### Data we need to **add** in LiveEdge — `bids.item_planning`

Per `(system_id, item_code)` override row. All fields nullable so a row only exists where someone has overridden Agility's defaults. Falls back to Agility on absence.

```
bids.item_planning
  id                   uuid pk
  system_id            text not null    -- branch
  item_code            text not null    -- agility_items.item
  -- Reorder policy
  min_on_hand          numeric          -- floor; below this is outage risk
  target_on_hand       numeric          -- reorder-up-to (max)
  safety_stock_days    int              -- buffer days beyond lead time
  usage_window_days    int              -- demand lookback (default 90)
  seasonality_factor   numeric          -- multiplier on baseline usage (1.0 = none)
  pack_qty             numeric          -- rounding step (overrides agility min_pak when set)
  preferred_supplier   text             -- override primary
  -- Classification
  is_critical          boolean default false   -- bumps severity in outage view
  category             text             -- 'millwork', 'lumber', etc. for filtering
  is_paused            boolean default false   -- exclude from suggestions (NPI / phasing out)
  -- Provenance
  notes                text
  updated_by           text
  updated_at           timestamptz default now()
  created_at           timestamptz default now()

UNIQUE (system_id, item_code)
INDEX (category) WHERE category IS NOT NULL
INDEX (is_critical) WHERE is_critical = true
```

Migration: `db/migrations/0028_item_planning.sql` (0027 is `report_subscriptions`). Drizzle definition in `db/schema.ts`. Lives in `bids` schema.

Also adds `bids.branch_planning_defaults` (one row per `system_id`) carrying the branch-level `usage_window_days`, `safety_stock_days`, and an optional 12-month `seasonality_profile` array — the engine falls back to these when an item doesn't override them.

### Algorithm (single function, called from both views)

```
usage_per_day(item, branch, window_days) =
  SUM(csf.qty_shipped) / window_days
  WHERE csf.item_number = item.item_code
    AND csf.branch_id   = branch
    AND csf.invoice_date >= now() - window_days days
    AND csf.is_credit_memo = false
    AND csf.is_deleted = false

effective_on_hand = qty_on_hand
                  + open_po_qty   -- net of receivings, only those expected within horizon
                  - open_so_qty   -- unshipped SO commitments

coverage_days = effective_on_hand / NULLIF(usage_per_day * seasonality_factor, 0)

reorder_point_days = lead_time_1 + COALESCE(safety_stock_days, 7)

severity:
  red    = coverage_days <= lead_time_1                   (will go OOS before next receipt)
  amber  = coverage_days <= reorder_point_days            (need to act now)
  yellow = coverage_days <= reorder_point_days + 14       (heads-up window)
  green  = otherwise

suggested_qty:
  base   = max(0, target_on_hand - effective_on_hand)              -- if target set
        or max(0, (reorder_point_days + 14) * usage_per_day - effective_on_hand)
  rounded= ceil(base / COALESCE(pack_qty, min_pak, 1)) * COALESCE(pack_qty, min_pak, 1)
  bumped = max(rounded, min_ord_qty)                                -- respect Agility floor

drop the row if:
  is_paused = true
  OR discontinued_item is non-null
  OR active_flag = false OR stock = false
  OR usage_per_day <= 0 AND coverage_days is infinite AND min_on_hand is null  -- no history, no target
```

Compute path: pure SQL CTE (one query per branch, no row-by-row JS). Reuses indexes already on `customer_scorecard_fact` from PR #265 (`idx_csf_branch_item_date`).

### Two views over this engine

**A. Suggested Buys (replacement page)** — `severity in (red, amber)` ordered by `coverage_days asc, severity desc`. Grouped by preferred/primary supplier so a buyer can build one PO per vendor.

**B. Potential Outages** — `severity in (red, amber, yellow)` filtered to items with `usage_per_day > 0`, sorted by days-until-zero. This is the early-warning surface that the existing Exceptions page doesn't cover (Exceptions watches POs after they're placed; Outages watches items before any PO exists).

Both views need:
- Branch filter (defaults to user's branch, admin sees all)
- Category filter (so Millwork can be reviewed as its own queue)
- Supplier filter
- "Critical only" toggle
- CSV export
- Click row → drill to item scorecard with planning-override editor inline

---

## 3. New / Changed Routes

### API
| Route | Methods | Purpose |
|---|---|---|
| `/api/purchasing/replenishment` | GET | Engine output. Params: `branch`, `category`, `supplier`, `severity_min`, `view=suggested|outages`. Returns rows + supplier rollup. |
| `/api/purchasing/replenishment/[itemCode]` | GET | Single-item drill: history, open supply/demand, computed metrics, current overrides. |
| `/api/admin/item-planning` | GET POST | List + upsert overrides (admin-managed). |
| `/api/admin/item-planning/[id]` | PATCH DELETE | Per-row edit. |
| `/api/admin/item-planning/import` | POST | CSV bulk import (Millwork seed). |

### Pages
| Route | New/Changed | Purpose |
|---|---|---|
| `/purchasing/workspace` | **redesign** | Real action queue (see Section 4) |
| `/purchasing/suggested-buys` | **rebuild** | LiveEdge engine. Keep route, swap data source. |
| `/purchasing/outages` | **new** | At-risk SKUs ahead of stockout |
| `/admin/item-planning` | **new** | CRUD for overrides; CSV import |
| `/scorecard/product/item/[itemCode]` | **extend** | Add "Replenishment" card with current metrics + edit overrides button |

### Nav
Add `Potential Outages` to the Purchasing dropdown (between Suggested Buys and Exceptions). Add `Item Planning` to Admin → Operations section.

---

## 4. Buyer Workspace Redesign

Tile grid replacing the current shallow page. All tiles deep-link to a filtered list.

```
+-----------------------------+-----------------------------+
| BUY NOW (red+amber)         | OUTAGE RISK (this week)     |
| N items / $X est            | N items / N critical        |
| top 3 supplier rollups      | top 3 by days-until-zero    |
+-----------------------------+-----------------------------+
| OVERDUE POs (today)         | PENDING CHECK-INS           |
| existing data               | existing data               |
+-----------------------------+-----------------------------+
| PO EXCEPTIONS (high sev)    | RECENT MOVEMENT             |
| from /exceptions            | item velocity changes       |
+-----------------------------+-----------------------------+

[ Quick actions strip: PO Check-In · Open POs · Review Queue · Vendor Scorecard ]
```

Each tile is a small server-rendered summary. Click → filtered destination page.

---

## 5. Phased Rollout

| Phase | Deliverable | Effort | Notes |
|---|---|---|---|
| 1 | `bids.item_planning` schema + Drizzle + migration | S | Land first so admin UI can be built |
| 2 | `/admin/item-planning` CRUD + CSV import | M | User can seed Millwork overrides before engine matters |
| 3 | Replenishment engine SQL + `/api/purchasing/replenishment` | L | Pure SQL; benchmark per-branch query |
| 4 | `/purchasing/outages` page | M | First consumer of the engine — lowest UI risk |
| 5 | Rebuild `/purchasing/suggested-buys` on engine | M | Keep existing URL; flip data source |
| 6 | Workspace redesign (Section 4) | M | Pulls engine summaries + existing tiles |
| 7 | Item scorecard "Replenishment" section + override editor | S | Inline edit path |
| 8 | Decommission Agility-PPO read on suggested-buys | S | Delete `/api/purchasing/suggested-buys/[ppo_id]` if no other consumer |

Estimate band: **~120-180 hrs total** depending on how much CSV-import/admin polish vs. minimum-viable. Phases 1-2 unblock Beisser to start populating overrides while Phase 3 is built.

---

## 6. Design Decisions (resolved 2026-05-22)

1. **Usage window** — Branch-configurable, default **90 days**, with seasonality baked in. Schema carries `branch_planning_defaults.usage_window_days` + `seasonality_profile` (jsonb 12-month multipliers). Items can override either via `item_planning.usage_window_days` and `item_planning.seasonality_profile` / `seasonality_factor`.
2. **Millwork seed strategy** — No existing spreadsheet. Plan ships in two steps: (a) downloadable CSV template the buyer fills out, (b) `POST /api/admin/item-planning/import` accepts the file. After seed, items are managed via admin UI; engine emits "suggested override" diagnostics for buyers/admins to review (e.g. "this item has 30 days of usage history but no min_on_hand set"). Future-phase: an admin review queue for those suggestions.
3. **Open PO horizon** — Inbound POs counted into `effective_on_hand` only when `expect_date` is within `lead_time_days` of today (per-item, from `agility_item_supplier.lead_time_1`). POs further out don't help today's decision. Receivings already landed are netted out of `qty_ordered` via `agility_receiving_lines`.
4. **Branch behavior** — Default view is the user's branch (`session.user.branch`). Admins and "main buyer" capability holders get an **all-branches** mode that aggregates across branches so they can pool a single PO that ships to multiple yards. A future phase will write multi-branch POs back to Agility — schema carries `system_id` on every row so the cross-branch query is just a `GROUP BY item_code` over the engine output.
5. **Severity thresholds** — Lead-time-driven:
   - **red** = `coverage_days <= lead_time_1` (will go OOS before any new PO can land)
   - **amber** = `coverage_days <= lead_time_1 + safety_stock_days`
   - **yellow** = `coverage_days <= lead_time_1 + safety_stock_days + 14`
   - **green** = otherwise
   This makes 4-6 week lead-time suppliers (some Millwork) behave correctly — items needed in 30 days are red, not amber.
6. **Workspace tiles** — Deferred to a Claude Design pass when the engine + APIs are stable. Engine and data first; dashboard composition second. Prompt drafted at `docs/agent-prompts/buyer-workspace-dashboard-design.md` — fire after Phases 3-5 ship.

---

## Appendix A — Why Agility's suggested POs are broken (user report)
The user confirms `agility_suggested_po_*` does not produce actionable suggestions for Beisser's mix — especially Millwork, where Agility's per-item min/max either aren't maintained or don't reflect actual selling velocity by branch. Rather than fight the ERP's planning module, LiveEdge takes ownership of the planning policy (`bids.item_planning`) and uses Agility purely as a system of record for stock, demand, and supply data.

## Appendix B — Why "Outages" is its own view, not just a severity filter on Suggested Buys
- **Audience.** Suggested Buys is for the buyer placing a PO. Potential Outages is also useful to branch managers, sales, dispatch ("don't promise this in the next 5 days").
- **Sort key.** Suggested Buys sorts by supplier (to assemble a PO). Outages sorts by days-until-zero (to triage).
- **Action.** Suggested Buys → "create PO." Outages → "expedite existing PO / transfer from another branch / call customer."
- **Inclusion.** Outages should include items with an open PO that will arrive too late (where Suggested Buys would correctly say "nothing to order").
