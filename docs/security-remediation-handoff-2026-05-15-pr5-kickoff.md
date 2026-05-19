# Security Remediation Handoff — PR5 kickoff (2026-05-15)

## Context
PR1–PR4 are merged into `main`. The branch now moves into PR5: **Permission Governance Hardening**.

## What is already complete
- PR1 Route policy baseline + CI guard scanner.
- PR2 Service-auth standardization (cron routes) with inbound follow-up deferred.
- PR3 Scorecard layout capability gate (`requirePageAccess('sales.view')`).
- PR4 Capability catalog SSoT:
  - `CAPABILITIES_METADATA` in shared access control.
  - `GET /api/admin/capabilities` guarded by `admin.users.manage`.
  - Permissions UI catalog-driven (no hardcoded tabs).

## PR5 objective
Make admin permission updates conflict-safe and auditable with stronger safety controls.

## Required implementation scope
1. **Optimistic concurrency** for permissions updates:
   - add version marker (`updated_at` or explicit version)
   - require `if_match_version` in update payload
   - return `409 Conflict` on stale writes
2. **Governance fields** on permission changes:
   - `change_reason` (required for privileged changes)
   - `ticket_ref` (optional)
3. **Break-glass protections**:
   - prevent last-admin lockout/demotion by self-edit
4. **Richer audit metadata**:
   - persist actor, before/after capability diff, reason, ticket, timestamp

## Suggested file starting points
- `app/api/admin/users/[id]/permissions/route.ts`
- `app/admin/users/[id]/permissions/PermissionsClient.tsx`
- `src/lib/access-control-shared.ts`
- any DB migration files/tables used for user permission state and audit history

## Open risks to watch
- Do not broaden role defaults.
- Preserve existing capability validation (`ALL_CAPABILITIES`).
- Keep behavior backward-compatible where possible; document any contract changes.

## Validation checklist for PR5
- `npm run typecheck`
- `npm run check:route-guards`
- targeted validation for:
  - stale write → `409`
  - last-admin self-lockout prevention
  - governance fields persisted in audit trail

## PR note expectations
- Explicitly document new request/response contract for permission updates.
- Include migration/rollback notes.
- Include scope boundaries and deferred items.
