# Tier 3 — Hardening & Maintainability (handoff 2026-06-01)

## Where this sits

Tiers 1 and 2 of the architecture/scalability review are **done**:
- **Tier 1 (data-tier isolation)** — every heavy `customer_scorecard_fact` scan
  reads a daily rollup MV; Pi-sync + rollup staleness alerting live. PRs
  #459/#462/#468/#471/#489. The fact-contention objective is met.
- **Tier 2 (operational resilience)** — CI `tsc`+`lint` gates (#479), unit tests
  on the catastrophic-if-wrong paths (#480), Sentry + structured logger
  `src/lib/log.ts` (#483).

**Tier 3 is the hardening tail.** None of it is urgent or scale-driven — it's
about removing sharp edges before more hands touch the codebase. Do the security
item first; the rest are incremental and partly opportunistic. **Each is its own
PR.** Don't big-bang.

## Work items (leverage order)

### 3.1 OTP rate limiting — issuance **and** verify (security — do first)
**Finding (two gaps):**
1. **Issuance limiter is effectively a no-op.** `app/api/auth/send-otp/route.ts`
   *looks* rate-limited (max N unused codes per email per 15-min window) but the
   count filters `used = false` (line ~116) while line ~127 marks **all** prior
   unused codes `used = true` immediately before inserting the new one. So after
   every request there's exactly one unused code — the count never climbs past 1
   and the `>= MAX` threshold never trips for sequential requests. An attacker can
   spam unlimited OTP emails (cost + targeted-user harassment). **Fix:** count
   issuances by `created_at` within the window **regardless of `used`** (i.e. drop
   the `used = false` predicate from the rate-limit `COUNT`), so repeated sends
   actually accumulate. (The separate `UPDATE … used = true` invalidation of old
   codes is fine to keep — just don't let it reset the rate counter.)
2. **Verify path has no limit or lockout** — a 6-digit code (1e6 space) is
   brute-forceable:
   - `auth.ts` — the NextAuth credentials provider verifies `otp_codes` with no
     attempt ceiling.
   - `app/api/auth/mobile/verify-otp/route.ts` — same, for the mobile JWT path.

**Build:** fix the issuance count (above), and add a per-identifier (ideally
also per-IP) failed-attempt limiter on verify. Serverless has no shared memory, so
it must be **DB-backed** — e.g. a `bids.auth_attempts` table (`identifier`, `kind`,
`created_at`, `success`) or an `attempts` column on `otp_codes`. Lock or 429 after
N failures (e.g. 5) in a window; clear on success. Keep the user-enumeration-safe
generic responses send-otp already uses. No Redis/Upstash needed unless the owner
wants it. Apply the verify limiter to both `auth.ts` and the mobile verify route
(extract a shared helper in `src/lib/`).

### 3.2 Zod validation at route boundaries (incremental)
**Finding:** only ~5 files import `zod`; most `/api/*` routes hand-parse
`searchParams.get(...)` / `await req.json()` and coerce by hand — easy to drift.
The pattern to extend already exists: `src/lib/reports/registry.ts` defines zod
param schemas per report.

**Build:** a tiny boundary helper (e.g. `src/lib/http/validate.ts`) —
`parseQuery(searchParams, schema)` / `parseBody(req, schema)` returning typed data
or a 400 `NextResponse`. Then convert routes **incrementally**, highest-traffic /
most-parameter-heavy first (scorecard, forecast, sales, purchasing replenishment).
Don't try to convert all 226 routes in one PR — land the helper + a first batch,
leave a follow-up list. Mutating/write-back routes (Agility, Hubbell upload,
dispatch) are the highest-value to validate.

### 3.3 God-file splits (opportunistic — only when a feature forces a touch)
Current worst offenders (LOC): `app/dispatch/DispatchClient.tsx` **2407**,
`src/lib/scorecard/queries.ts` **2546**, `app/management/forecast/ForecastClient.tsx`
1096, `src/components/takeoff/TakeoffCanvas.tsx` 988, `src/components/nav/TopNav.tsx`
957, `app/legacy-bids/[id]/ManageBidClient.tsx` 972.

**Rule:** do NOT do a refactor-only sweep. Split a file **when you're already
editing it** for a feature/fix, extracting the obvious presentational or
pure-helper seams (the dispatch work has precedent — `PodPhotoViewer` /
`StopTimeline` were pulled out of DispatchClient in PR #406). Caveats:
`scorecard/queries.ts` is a query module — splitting risks the to-the-cent rollup
guarantees, so only carve cohesive query families and re-validate; **skip
`TakeoffCanvas.tsx`** if it still has an active bug-fix branch.

### 3.4 TanStack Query for client fetches (largest lift — pilot, don't sweep)
**Finding:** client data fetching is raw `fetch` in `useEffect` everywhere — no
dedup, no shared cache, manual loading/error state. `@tanstack/react-query` is not
installed.

**Build:** add the dep + a single `QueryClientProvider` at the app root, then
**migrate ONE page family as a pilot** (a polling dashboard benefits most —
dispatch/fleet/supervisor already gate polling on visibility; React Query would
replace that hand-rolled logic cleanly). Measure the ergonomics, then expand
opportunistically. This is a behavior change to every converted screen — do not
convert broadly in one PR.

## Conventions (same as Tiers 1–2)
- Develop on the assigned `claude/*` branch; one reviewable PR per item; ready for
  review (not draft). CI now runs `tsc` + `lint` + `vitest` — keep all three green.
- New env vars → Vercel + the CLAUDE.md "Environment Variables" section. New
  `bids` tables → a `00XX_*.sql` migration applied manually in the Supabase SQL
  editor (off-hours if it scans a hot table); document the apply step in the PR.
- Update CLAUDE.md when a piece lands.
- Use the structured logger (`src/lib/log.ts`) for new log sites, not `console.*`.

## Tier 4 — only if real growth materializes (context, NOT this handoff)
- Per-domain `revalidateTag` taxonomy (currently one `'erp'` tag; 3 invalidation
  sites in `app/management/rebates/actions.ts`). Build when a "stale dashboard
  after my own write" complaint surfaces.
- `rollup_vendor_day` — deferred by measurement (vendor source ~600 MB,
  well-indexed, never the contention path). Build only if vendor scorecard pages
  measurably slow.
