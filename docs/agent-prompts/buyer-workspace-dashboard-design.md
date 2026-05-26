# Claude Design prompt — Buyer Workspace dashboard

**When to fire this:** After Phase 3-5 of the buyer-workspace plan ship (replenishment engine + `/purchasing/outages` + rebuilt `/purchasing/suggested-buys` are live and producing real data). Until then there is no data behind the tiles, so a design now would be styling over a mock.

Hand this prompt to Claude Design (or the design-focused agent) verbatim. It is self-contained — the recipient has not been part of this conversation.

---

## Project context

LiveEdge is Beisser Lumber Co.'s internal app (Next.js 15, React 19, TypeScript, Tailwind 3.4 dark theme, brand green `#006834`). Dark UI throughout, Beisser-green primaries, Beisser-gold accents (`#9e8635`), data-dense tables, Recharts wrappers for charts. Repo conventions:

- `'use client'` components for any interactivity.
- Pages live under `app/`. Route-scoped clients live in the same directory.
- Charts: use existing wrappers in `src/components/charts/` (`ChartCard`, `TimeSeriesChart`, `ComboBarLineChart`, `ParetoChart`, `MixDonut`, `StatusFunnelBar`, `HeatmapGrid`). Don't reach into Recharts directly.
- Status colors: red = critical/overdue, amber = warning, yellow = heads-up, green = healthy, cyan = neutral/branding.
- Branch colors: see `BRANCH_COLORS` in `src/components/nav/TopNav.tsx` — keep consistent if branches appear.
- Always wrap data tables with `overflow-x-auto` for mobile.

## What you are designing

`/purchasing/workspace` — the **Buyer Workspace homepage**. Today it is a near-empty page (3 quick-action tiles + 2 small data lists). It should become a real "today's queue" surface for buyers: glance, prioritize, drill.

Six data feeds are now backed by real APIs (built in Phase 3-5 of `docs/buyers-workspace-plan-2026-05-22.md`):

| Feed | API | What it provides |
|---|---|---|
| Buy Now | `GET /api/purchasing/replenishment?view=suggested` | Items at red/amber severity grouped by supplier. Has `count`, `estimated_value`, `supplier_rollup[]`. |
| Outage Risk | `GET /api/purchasing/replenishment?view=outages` | Items at risk of OOS this week. Has `count`, `critical_count`, top items by days-until-zero. |
| Overdue POs | `GET /api/purchasing/pos/open` (filter `expect_date < today`) | Existing endpoint — list of past-expect-date POs. |
| Pending Check-Ins | `GET /api/purchasing/submissions?status=pending` | Existing — receiving submissions awaiting review. |
| PO Exceptions | `GET /api/purchasing/exceptions?severity=high` | Existing — overdue / short-receive / no-receipt alerts. |
| Recent Movement | `GET /api/purchasing/replenishment/movement` (new — to be designed) | Items whose 7-day usage velocity changed >25% vs. trailing 30. |

All endpoints accept `?branch=<systemId>` and respect the user's branch from session for non-admin users. Admin/main-buyer users see "All branches" by default; others see their branch only.

## Design constraints

1. **One screen, no scroll on desktop 1440×900.** Buyers glance at this and act. Anything past the fold gets ignored.
2. **Mobile-first works too** — buyers carry phones on the yard. Tiles should reflow to a single column gracefully.
3. **Click anywhere on a tile** to drill to its source page (`/purchasing/suggested-buys`, `/purchasing/outages`, `/purchasing/open-pos`, `/purchasing/review`, `/purchasing/exceptions`, etc.). Don't make users hunt for a "View All" link.
4. **Show a number + a delta + a sample of items per tile** — not just a number. A buyer looking at "12 items to buy" needs to know what.
5. **Critical-item callouts.** Items flagged `is_critical = true` in `bids.item_planning` should be visually distinct in the Outage Risk tile (the user has confirmed Millwork criticals are the main reason this workspace exists).
6. **Branch selector for admin/main-buyer users.** All-branch view should be the default for those users; single-branch users don't need the picker.
7. **No tabs.** This is a dashboard. Drill to dedicated pages for depth, don't nest.
8. **Recharts sparkines OK on tiles** if helpful — keep them small and unaxed.

## Deliverable

A single React client component at `app/purchasing/workspace/WorkspaceClient.tsx` plus any extracted sub-components in `app/purchasing/workspace/_components/`. Server page wrapper (`page.tsx`) already exists and pulls `userBranch` + `userName` + role — don't change the page wrapper.

Replace the existing `WorkspaceClient.tsx` entirely. The old quick-action strip can survive as a thin row at the bottom, or be absorbed into tile click-throughs — your call.

## Tone

Beisser's buyers know lumber, not software. Labels should be operational ("Buy now", "Outage risk this week", "POs past due"), not technical ("Replenishment queue", "Coverage delta"). Numbers always show units when ambiguous (qty vs. $).

## Out of scope (do not design)

- The drill-through pages themselves (`/purchasing/outages` etc.) — they exist already and are styled.
- The admin item-planning CRUD (`/admin/item-planning`) — that's separate.
- Mobile-only kiosk/TV variants. Standard responsive is fine.

## Acceptance check

A buyer arriving at `/purchasing/workspace` on a Tuesday morning can answer these in under 10 seconds, without scrolling:

1. "Do I have items I need to buy today?" (and roughly how many / how much $)
2. "Will any critical item go out of stock this week?"
3. "Are any of my open POs late?"
4. "Is there anything waiting for me to review?"

If they can't, the design isn't done.
