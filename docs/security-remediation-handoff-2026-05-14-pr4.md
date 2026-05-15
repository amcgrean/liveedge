# Security Remediation Handoff — PR4 complete (2026-05-14)

## What was completed
- PR3 page guard consistency
  - Updated `app/scorecard/layout.tsx` to use `requirePageAccess('sales.view')`.
  - Removed redundant post-guard login redirect logic in layout.
- PR4 capability catalog SSoT (backend + UI wiring)
  - Added typed capability catalog metadata in `src/lib/access-control-shared.ts`:
    - `CapabilityMetadata`
    - `CAPABILITIES_METADATA`
    - compile-time coverage guard via `satisfies Record<Capability, ...>`
  - Added protected admin catalog endpoint:
    - `GET /api/admin/capabilities`
    - file: `app/api/admin/capabilities/route.ts`
    - guard: `requireCapability('admin.users.manage')`
  - Refactored admin permissions UI to consume catalog API:
    - file: `app/admin/users/[id]/permissions/PermissionsClient.tsx`
    - removed hardcoded capability tabs
    - dynamic tab grouping by metadata `category`
    - displays capability `risk` from catalog


## Scorecard access tightening (explicit note)
- Previous behavior (`auth()` check) allowed any authenticated user into `/scorecard/*`.
- Current behavior (`requirePageAccess('sales.view')`) requires both authentication and the `sales.view` capability.
- This is an intentional least-privilege tightening aligned with sales data sensitivity and existing scorecard API guards.
- Roles that include `sales.view` by default in `ROLE_DEFAULTS`: `admin`, `management`, `sales`, `supervisor`, `ops`, `viewer`.
- Roles that do **not** include `sales.view` by default (and now require explicit grant if scorecard access is needed): `warehouse`, `dispatch`, `driver`, `estimator`, `estimating`, `designer`, `purchasing`, `receiving_yard`, `hubbell`.
- Operational note: permission changes apply on next sign-in / token refresh.

## Current status vs. master plan
- ✅ PR1 — Route Policy Baseline + CI Guard Scanner
- ✅ PR2 — Service-auth Standardization (cron subset complete)
- ✅ PR3 — Page Guard Consistency
- ✅ PR4 — Capability Catalog SSoT (metadata + endpoint + permissions UI catalog-driven)
- ⏳ PR5 — Permission Governance Hardening (next recommended)
- ⏳ PR6 — Security Tests + Observability

## Known gaps intentionally deferred
1. PR2 follow-up: inbound webhooks still tracked as `serviceAuthLegacy` in policy pending final auth decision.
2. PR4 follow-up: add explicit parity test coverage for catalog→permissions UI rendering.
3. Open product/security decision still pending: whether to introduce dedicated `scorecard.view` capability.

## Recommended next PR (PR5)
1. Add optimistic concurrency to admin permissions updates:
   - add `version`/`updated_at` strategy
   - return `409 Conflict` on stale writes
2. Extend permissions PUT contract with governance fields:
   - `if_match_version`
   - `change_reason`
   - `ticket_ref`
3. Add break-glass protections:
   - prevent last-admin self-lockout/demotion
4. Persist richer audit metadata for permission changes.

## Quick start commands for next agent
- `npm run check:route-guards`
- `npm run typecheck`
- `rg -n "CAPABILITIES_METADATA|CapabilityMetadata|/api/admin/capabilities" src app`
- `rg -n "granted_capabilities|revoked_capabilities|permissions" app/api/admin/users/[id]/permissions app/admin/users/[id]/permissions`

## Validation expectations for next PR
- Lint/typecheck/route-guard checks run and reported.
- API contract changes documented in PR notes.
- Concurrency conflict and governance behaviors validated with targeted tests or scripted checks.
- PR notes include scope boundaries + rollback notes.
