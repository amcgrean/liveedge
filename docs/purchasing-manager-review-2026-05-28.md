# Purchasing Manager Review — Buyer Workspace Walkthrough

Print or open side-by-side. Two parts: a one-page cheat sheet for the manager, and a demo script you read from.

---

## Part 1 — One-page cheat sheet (hand to manager)

### What changed

**LiveEdge now owns replenishment planning, not Agility.** Agility's Suggested POs are no longer in the workflow. LiveEdge runs its own engine that reads stock, demand, supply, lead times, and minimums from Agility, then applies *your* policy on top.

### Where policy lives

| Layer | Where | Who edits |
|---|---|---|
| Per-item override | `/admin/item-planning` | You + buyers |
| Branch defaults | `/admin/item-planning` → Branch Defaults | You |
| Hardcoded fallback | code | Aaron |

Order of precedence: item → branch → fallback. Override fields are all optional — an item row can carry just `min_on_hand`, or just `pack_qty`, etc.

### How severity is decided

For every stocked item, every branch:

- **Red** = will run out before next PO can land (`coverage ≤ lead time`)
- **Amber** = will run out within safety stock (`coverage ≤ lead + safety days`)
- **Yellow** = warning zone (`coverage ≤ lead + safety + 14 days`)
- **Green** = healthy

Defaults: 90-day usage window, 7 safety days, +14 yellow buffer. All editable per branch or per item.

### Suggested quantity formula

`max(min_order_qty, ceil(gap / pack_qty) × pack_qty)`

Where gap = target on hand − effective on hand. If no target is set, gap = (lead + safety + 14) days of demand − on hand.

### The six workspace tiles

1. **Buy Now** — red items grouped by supplier
2. **Outage Risk** — sorted by days-to-zero
3. **Overdue POs** — past expected receive date
4. **Pending Check-Ins** — PO submissions awaiting review
5. **PO Exceptions** — receiving discrepancies (price-variance not wired yet)
6. **Recent Movement** — 7-day vs 30-day velocity changes

### What you can do today

- Browse `/purchasing/workspace`, `/suggested-buys`, `/outages`, `/movement`
- Add per-item overrides via `/admin/item-planning`
- Bulk-load overrides via CSV import (template downloadable)
- Annotate velocity-changing items on `/purchasing/movement`
- View per-branch override state on any item scorecard

### Known gaps (not bugs)

- No sparklines or "since yesterday" deltas yet — needs daily snapshots
- No dollar values on Buy Now / supplier rollup yet — needs unit-cost data
- "Create PO" button is disabled — POs still go into Agility
- `qty_on_hand` accuracy depends on Agility sync — flag any items that look wrong

### Three questions for you

1. Are the severity thresholds (`lead`, `+safety`, `+14`) right for **Millwork** specifically?
2. What are the 10 items you'd override first?
3. If we could ship one improvement in two weeks, what is it?

---

## Part 2 — Demo script (your copy)

### Setup (before he walks in)

- Tabs open in this order, all on 20GR:
  1. `/purchasing/workspace`
  2. `/admin/item-planning`
  3. `/purchasing/suggested-buys`
  4. `/purchasing/outages`
  5. `/purchasing/movement`
  6. `/scorecard/product/item/<an-item-he-knows>`
- Have the CSV template downloaded to desktop
- Pre-check each branch's workspace for absurd numbers — if 25BW shows 1200 red items, know that going in

### Opening (2 min)

> "Before I show you screens — the big shift is that LiveEdge is now deciding what to buy, not Agility. Agility's Suggested POs are out of the workflow. The reason is they weren't actionable for Millwork. We're using Agility for the data — on-hand, demand, supply, lead times — and LiveEdge for the policy on top. Sound right?"

Wait for buy-in. If he pushes back, stop and have the conversation — don't demo on top of disagreement.

### Tile 1: Buy Now (5 min) — `/purchasing/workspace`

> "This is what I'd want you to see Monday morning. Red items, grouped by supplier so you can assemble one PO per vendor."

Click into Buy Now. Pick one red row.

> "Walk me through this with me. On-hand is X. We've shipped Y over the last 90 days, so daily demand is Y÷90. Lead time on this item is Z days. Coverage is on-hand÷daily-demand. That's less than lead, so it's red."

**Ask:** *"Would you have ordered this earlier or later than this?"*

His answer is gold. If "earlier" → safety stock is too low for this category. If "later" → too high. Note the category.

### Tile 2: Outage Risk (3 min)

> "Same data, different cut — sorted by days-to-zero. Critical-flagged items called out at the top."

**Ask:** *"How do you triage today? Is days-to-zero the right sort?"*

### Tiles 3–6 (5 min, fast)

For each: 30 seconds of "here's what it shows" then *"useful or noise?"*

- Overdue POs
- Pending Check-Ins
- PO Exceptions — flag that price-variance returns 0
- Recent Movement

If he says "noise" on any tile, don't defend it. Note it.

### Severity thresholds (10 min)

Open one Millwork red row.

> "Right now the engine uses 7 safety days and a 14-day yellow buffer for every branch. Same numbers for Millwork as for Lumber. Should those be different?"

This is where you'll learn the most. He likely has different mental models for different categories. Capture exact numbers per category if he gives them.

### Overrides (10 min) — `/admin/item-planning`

> "When you want to override the defaults for a specific item, this is where it lives."

Show:
- Create a fake override (you can delete after)
- Show the 3-state nature (any field nullable)
- Show CSV template + import flow

**Ask:** *"Name me 5 items off the top of your head you'd override today."*

If he rattles them off → schedule a seed-file session. If he stalls → the data isn't structured in his head and you should help him think through categories first.

Show Branch Defaults editor.

### Movement notes (3 min) — `/purchasing/movement`

> "When something's moving fast or slow, buyers can drop a note explaining why. Like 'spring framing rush' or 'duplex job done'."

Add a note live. Delete it.

**Ask:** *"Will buyers actually do this, or am I building something nobody'll use?"*

### Item scorecard card (3 min)

Open the item scorecard tab. Scroll to Replenishment card.

> "Wherever you're looking at an item, you can see its override state for every branch and edit it in place."

### Data quality — `qty_on_hand` (5 min)

**Don't dodge this.**

> "One thing I need to surface. At 20GR, 16 of 1366 stocked items have positive on-hand in the data we're reading. The engine's correct given that input — but it means most items will look red until the underlying sync gets healthier. Two questions: is Agility's on-hand itself trustworthy, and is the warehouse cycle-counting?"

His answer determines whether the engine output is trustworthy at all. Listen carefully.

### What's deliberately missing (3 min)

Run through the four follow-ups quickly so they're not surprises:

- Sparklines + deltas → snapshot table
- Dollar values → unit-cost data
- Create PO from LiveEdge → not built; POs still go to Agility
- Price-variance exceptions → not derivable from current data

> "All four are queued. They're not built because I wanted you to use this first and tell me which of them actually matters before I burn time on the wrong one."

### Closing (5 min)

> "If I could ship one thing in the next two weeks, what is it? Give me three, ranked."

Write down all three exactly as he says them. That's your next sprint.

End with: *"What didn't I show you that you expected to see?"* — that catches the things you didn't think to demo.

### After the meeting

- Update `CLAUDE.md` "Pending Actions" with his ranked three
- If he gave you category-specific severity numbers, draft a branch defaults seed
- If he named override items, schedule a CSV-build session within a week (momentum matters)

### Phrases to avoid

- "It's easy to add" — commits you
- "I can do that this afternoon" — same
- "The engine is correct" — sounds defensive even when true
- "That's deferred" — sounds like you're brushing him off; say "queued behind X" instead

### Phrases to use

- "Tell me more about that"
- "Would you do it that way today, without the system?"
- "If I built X, would you actually use it?"
- "What would make you stop trusting this?"
