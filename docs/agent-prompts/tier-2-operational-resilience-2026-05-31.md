# Tier 2 — Operational Resilience (handoff 2026-05-31)

> **STATUS: COMPLETE (2026-06-01).** 2.1 CI gates → PR #479; 2.2 tests on the
> money paths → PR #480; 2.3 Sentry + structured logger → PR #483. Next tier:
> `docs/agent-prompts/tier-3-hardening-2026-06-01.md`. Kept for reference.

## Where this sits

This is **Tier 2** of the architecture/scalability review. The full assessment +
tiered roadmap is the owner's plan doc; the live in-repo references are the
**"Scorecard Analytics Rollups"** section of `CLAUDE.md` (Tier 1) and this file.

**Tier 1 (data-tier isolation) is COMPLETE** — every heavy `customer_scorecard_fact`
scan now reads a daily rollup MV; a daily `/api/cron/sync-health-alert` emails when
the Pi sync or a rollup goes stale. See PRs #459/#462/#468/#470/#471 and the
`scorecard-rollups-next-slice-2026-05-30.md` handoff. The only Tier-1 leftover is
hardware/ops (Pi 5 + SSD migration + recovery runbook) — owner/Pi-agent, not code.

Tier 2 is about the disciplines that separate "a big app one person holds in their
head" from "a system a team can operate safely": **CI safety gates, tests on the
money paths, and production observability.** None of this is about scale/traffic —
the stack is over-provisioned for a 4-branch internal tool. It's about not shipping
silent regressions and not debugging blind.

## The three work items (in leverage order — each can be its own PR)

### 2.1 CI safety gates (cheapest, do first)
**Finding:** the PR workflow runs `vitest` but **not** `tsc --noEmit` or `next lint`,
even though both scripts exist and pass locally. Type/lint errors can reach prod.
- Add a `typecheck` + `lint` job (or steps) to `.github/workflows/` alongside the
  existing test job. `npx tsc --noEmit` and `next lint` (or `eslint`).
- Confirm the existing security workflows still run (`codeql.yml`, `gitleaks.yml`,
  and the custom route-guard check).
- **Verify the gate works:** open a throwaway PR with a deliberate type error and
  confirm CI now fails (the plan's verification step). Revert.
- This is a ~1-file change and immediately stops a whole class of regressions.

### 2.2 Tests on the catastrophic-if-wrong paths (target ~10–15 flows, NOT coverage %)
Today there are **4 test files / 651 source files**. Don't chase a coverage number —
test the logic that has *already* caused or could cause expensive, silent damage:

| Path | Where | Why it's high-value |
|---|---|---|
| **UOM `$` math** | `extended_price` / `unshipped_extended_price` usage; `src/lib/takeoff/calculations.ts`; forecast + order-detail `lineTotal` | Already caused **10–100× overstatement** bugs (see CLAUDE.md "UOM-aware open-order $"). Pure functions — easy to unit-test, huge blast radius. |
| **Capability resolution** | `src/lib/access-control.ts` → `effectiveCapabilities(roles, granted, revoked)`, `hasCapability` | Security-critical; grant/revoke precedence + role defaults. (`capabilities-parity.test.ts` exists — extend it.) |
| **ERP write-back** | `src/lib/agility-api.ts` (`salesOrderHeaderUpdate`, `salesOrderCreate`, `podSignatureCreate`, …) | Mutates the system of record. Test payload shaping + the `headerLookupOk` / no-clobber guards (mock the REST client; don't hit Agility). |
| **Hubbell matcher** | `src/lib/hubbell/document-matcher.ts`, `jobsite-reconciler.ts` | Dense scoring/tuning logic; `check-hash.ts` + `cursor.ts` are tested, the **matchers are not**. Table-driven cases for the tuning rules (negative-ref penalty, broad-keyword half-weight, parent→sub demote, cancelled-SO, jobsite-number). |
| **Rollup ↔ fact parity** (optional, Tier-1-adjacent) | scorecard `queries.ts` | A tiny test asserting the rollup measure columns match the documented additive/distinct split, so a future schema change can't silently break the to-the-cent guarantee. |

Stack: `vitest` (already configured; tests live next to source as `*.test.ts`).
Pure-function tests need no DB. For DB/REST paths, mock the client (`getErpSql`,
the Agility fetch) — these are unit tests of logic, not integration tests against prod.

### 2.3 Observability (error tracking + structured logging)
**Finding:** 345 ad-hoc `console.*` calls, no Sentry, no structured logging/tracing.
A 500 in prod leaves only Vercel function logs.
- Add **`@sentry/nextjs`** (client + server + edge configs; wrap `instrumentation.ts`).
  Gate the DSN behind an env var so local/dev is a no-op.
- Add a **thin logger wrapper** (`src/lib/log.ts`) — `log.info/warn/error` with a
  consistent shape — and migrate the noisiest/most-load-bearing `console.*` sites
  (auth, cron routes, ERP/Agility write-back, Hubbell ingest) first. Don't do a
  big-bang replace of all 345; convert opportunistically + the critical paths.
- Confirm capture: trigger a deliberate 500 and verify it lands in Sentry.

## Conventions (same as Tier 1)
- Develop on the assigned `claude/*` branch; open a PR ready for review; keep each
  item a separate, reviewable PR (2.1 → 2.2 → 2.3).
- No secrets in the repo; new env vars (Sentry DSN, etc.) go in Vercel + documented
  in the CLAUDE.md "Environment Variables" section.
- Update CLAUDE.md when a piece lands (there's no separate status doc).
- The repo squash-merges; `origin/pi` tracks `main` (don't point it at a feature SHA).

## What comes after (for context, NOT this handoff)
- **Tier 3 — hardening:** rate-limit `/api/auth/send-otp` + OTP verify; standardize
  zod validation at route boundaries (extend the registry pattern); adopt TanStack
  Query for client fetches; opportunistic god-file splits (`ForecastClient` 1096,
  `ManageBidClient` 972, `TopNav` 956, `DispatchClient` ~2.3K) when a feature forces a touch.
- **Tier 4 — only if real growth:** per-domain `revalidateTag` taxonomy (currently one
  `'erp'` tag); `rollup_vendor_day` (deferred by measurement — vendor source ~600 MB,
  well-indexed, never the contention path).
