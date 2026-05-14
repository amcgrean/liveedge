# Security & Permissions Remediation Master Plan — 2026-05-14

## Executive Summary
This document merges the prior audit and implementation planning into one execution-ready source of truth. The app already has strong capability primitives, but enforcement is inconsistent across pages/API routes and admin-permission governance needs hardening.

This plan delivers a professional SaaS-grade authorization posture through six incremental PRs, with CI guardrails and explicit acceptance criteria.

---

## Scope
- App pages: `app/**/page.tsx` and route-group layouts.
- API handlers: `app/**/route.ts`.
- Access-control core:
  - `src/lib/access-control.ts`
  - `src/lib/access-control-shared.ts`
- Admin + permissions surfaces:
  - `app/admin/**`
  - `app/api/admin/**`
  - `app/admin/users/[id]/permissions/PermissionsClient.tsx`
  - `app/api/admin/users/[id]/permissions/route.ts`

---

## Key Findings
1. **Capability model is solid, enforcement is inconsistent**
   - Good: central capability vocabulary and role defaults.
   - Gap: mixed guard patterns (`requireCapability` vs auth-only checks).
2. **Scorecard section is auth-gated but not capability-gated**
   - Inconsistent with other sections (sales/warehouse/dispatch/purchasing/management).
3. **API protection is uneven**
   - Some routes use capability guards consistently; others rely only on session presence.
4. **Admin permissions UI is not full-catalog driven**
   - Hardcoded lists can drift from backend capability definitions.
5. **Permission-change governance is incomplete**
   - Missing robust concurrency handling and structured change rationale.

---

## Target State (Definition of Done)
- All protected pages use explicit capability-based guards.
- All non-public API routes have explicit auth policy (capability or service-auth).
- Route-policy enforcement is codified and CI-enforced.
- Admin permissions UI manages 100% of defined capabilities from a single source of truth.
- Permission updates are conflict-safe, auditable, and reasoned.

---

## Phased Delivery Plan

### PR 1 — Route Policy Baseline + CI Guard Scanner
**Objective:** make route authorization explicit and enforceable.

**Tasks**
1. Add `docs/security-policy-routes.md` with route classes:
   - Public
   - Service-auth
   - Capability-protected
2. Add `scripts/check-route-guards.mjs`:
   - Scan `app/api/**/route.ts`
   - Fail if route lacks recognized guard and is not allowlisted
3. Add npm script:
   - `check:route-guards`
4. Add CI job for guard check.

**Acceptance**
- CI blocks newly introduced unguarded non-public API routes.

---

### PR 2 — Service-auth Standardization
**Objective:** secure non-user entrypoints consistently.

**Tasks**
1. Add `src/lib/service-auth.ts`:
   - `verifyCronSignature(req)`
   - `verifyInternalToken(req)`
2. Apply helper to cron/inbound/integration routes.
3. Map every service route to auth mechanism in policy doc.

**Acceptance**
- Service routes return 401/403 for invalid callers.

---

### PR 3 — Page Guard Consistency
**Objective:** eliminate auth-only guarding for protected app sections.

**Tasks**
1. Update `app/scorecard/layout.tsx` to `requirePageAccess('sales.view')` (or `scorecard.view` if introduced).
2. Optionally add `scorecard.view` capability and role defaults.
3. Validate other route-group layouts remain intentional and capability-based.

**Acceptance**
- Scorecard pages are capability-gated.

---

### PR 4 — Capability Catalog Single Source of Truth
**Objective:** remove UI/backend capability drift.

**Tasks**
1. Add `CAPABILITIES_METADATA` (code, label, description, category, risk).
2. Add `GET /api/admin/capabilities` endpoint.
3. Refactor permissions UI to render from API catalog (remove hardcoded capability tabs).
4. Add parity test between server catalog and UI-rendered controls.

**Acceptance**
- Admin can manage every defined capability.

---

### PR 5 — Permission Governance Hardening
**Objective:** make permission changes safe and accountable.

**Tasks**
1. DB migration for `updated_at` and/or explicit version.
2. Extend permissions PUT contract:
   - `if_match_version`
   - `change_reason`
   - `ticket_ref`
3. Return 409 on stale updates.
4. Add break-glass protections:
   - Prevent last-admin self lockout/demotion.
5. Persist richer audit metadata.

**Acceptance**
- No silent overwrite of concurrent edits.
- Sensitive permission changes require rationale and are attributable.

---

### PR 6 — Security Tests + Observability
**Objective:** keep the posture durable.

**Tasks**
1. Unit tests for capability composition and any-of checks.
2. Integration tests for critical admin and privileged endpoints.
3. Telemetry for 401/403 trends + permission change events.
4. Operational runbook for policy exceptions and guard-check failures.

**Acceptance**
- CI validates authorization behavior and catches regressions.

---

## Execution Checklist (for Codex, every PR)
1. Keep one concern per PR.
2. Run relevant checks:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run check:route-guards` (post-PR1)
   - targeted unit/integration tests
3. Include:
   - migration notes (if schema touched)
   - rollback plan
   - route policy deltas (if auth behavior changes)

---

## Risk Controls
- Separate route hardening from permission-schema/UI refactor.
- Do not broaden role defaults without explicit approval.
- Feature-flag optional new capabilities where business mapping is uncertain.
- Prefer deny-by-default wrappers for new route implementations.

---

## Suggested Timeline
- Week 1: PR1 + PR2
- Week 2: PR3 + PR4
- Week 3: PR5
- Week 4: PR6 + cleanup

---

## Success Metrics
- 0 unguarded non-public API routes in CI.
- 100% capability catalog parity between backend and admin UI.
- 0 silent permission-overwrite incidents.
- Reduced unauthorized errors from missing/incorrect guards.
