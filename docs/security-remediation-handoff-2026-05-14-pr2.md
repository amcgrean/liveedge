# Security Remediation Handoff — PR2 complete (2026-05-14)

## What was completed
- PR1 baseline created:
  - `docs/security-policy-routes.md`
  - `scripts/check-route-guards.mjs`
  - `.github/workflows/route-guards.yml`
  - `npm run check:route-guards`
- PR2 service-auth standardization (cron routes):
  - Added `src/lib/service-auth.ts` with:
    - `verifyCronSignature(req)`
    - `verifyInternalToken(req)`
  - Refactored cron endpoints to use shared helper:
    - `app/api/cron/erp-sync/route.ts`
    - `app/api/cron/geocode-nightly/route.ts`
    - `app/api/cron/graph-subscription-renew/route.ts`
  - Narrowed `serviceAuthLegacy` policy entries to inbound routes only.

## Current status vs. master plan
- ✅ PR1 — Route Policy Baseline + CI Guard Scanner
- ✅ PR2 — Service-auth Standardization (cron subset complete)
- ⏳ PR3 — Page Guard Consistency (next recommended)
- ⏳ PR4 — Capability Catalog SSoT
- ⏳ PR5 — Permission Governance Hardening
- ⏳ PR6 — Security Tests + Observability

## Known gaps intentionally deferred
1. `app/api/inbound/**/route.ts` still classified under `serviceAuthLegacy`.
   - `inbound/credits` already validates Svix webhook signatures.
   - `inbound/graph` validates Graph subscription `clientState` and handshake semantics.
   - Decision needed: migrate these to standardized internal token checks, or formally document provider-native verification as approved service-auth mechanism.
2. Several kiosk and special-case routes remain in `unguardedAllowed` in route policy and need product/security sign-off.

## Recommended next PR (PR3)
1. Update scorecard route-group layout guard:
   - `app/scorecard/layout.tsx` should require capability-based page access (per master plan).
2. Validate all section layouts are capability-gated intentionally.
3. Keep route policy file aligned with any auth behavior changes.

## Quick start commands for next agent
- `npm run check:route-guards`
- `npm run typecheck`
- `rg -n "requirePageAccess\(|auth\(" app/scorecard app/**/layout.tsx`
- `rg -n "serviceAuthLegacy|unguardedAllowed" docs/security-policy-routes.md`

## Validation expectations for next PR
- Lint/typecheck/route-guard checks run and reported.
- Any auth behavior change reflected in `docs/security-policy-routes.md`.
- PR notes include scope boundaries + rollback notes.
