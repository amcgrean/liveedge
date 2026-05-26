# Security Remediation Handoff — PR5 complete (2026-05-19)

## Status update — 2026-05-20

Two live bugs introduced by PR5 in `app/api/admin/users/[id]/permissions/route.ts`
are now fixed on `claude/security-remediation-handoff-aQu3b`:

- **P1 — optimistic lock**: the `if_match_version` round-trip was passing the
  stored `updated_at` through `new Date(...).toISOString()` (ms precision),
  but the UPDATE compared against `timestamptz` (µs precision). Every save
  returned 409. Fixed by truncating both sides to milliseconds via
  `date_trunc('milliseconds', updated_at)` in the WHERE clause.
- **P2 — last-admin race**: the precheck (read all active admins, compute
  `adminsAfter`) was unsynchronized with the UPDATE. Two concurrent admin
  self-edits could both pass and commit, leaving zero admins. Fixed by
  wrapping the precheck + UPDATE in a `sql.begin(...)` transaction with
  `SELECT ... FOR UPDATE` on the active-users read so concurrent writers
  serialize.

Verification path (manual):
1. Sign in as admin, save any permission toggle on `/admin/users/[id]/permissions` — should succeed (previously always 409'd).
2. Two-tab concurrency: tab A saves, tab B (now stale) saves; B returns 409 `stale_write_conflict`.
3. Self-edit removing the last `admin.users.manage` returns 409 `last_admin_lockout`.

## What was completed
- Added optimistic concurrency to admin permission updates using `if_match_version` bound to `app_users.updated_at`.
  - `GET /api/admin/users/:id/permissions` now returns `permissions_version`.
  - `PUT /api/admin/users/:id/permissions` now requires `if_match_version` and returns `409` on stale writes.
- Extended governance contract for permission changes:
  - `change_reason` is now required.
  - `ticket_ref` is optional and persisted in audit metadata.
- Added break-glass protection:
  - Blocks self-updates that would remove `admin.users.manage` from the last remaining active admin-capable user.
- Expanded audit payload for permission changes:
  - includes `if_match_version`, `resulting_version`, `change_reason`, and `ticket_ref`.

## Scope boundaries
- No role default changes.
- No access broadening.
- No schema migration required (reuse existing `updated_at`).

## Rollback notes
- To rollback PR5 behavior, revert API/client changes in permissions route/client and redeploy.
- No database schema rollback is needed.

## Current status vs. master plan
- ✅ PR1 — Route Policy Baseline + CI Guard Scanner
- ✅ PR2 — Service-auth Standardization (cron subset complete)
- ✅ PR3 — Page Guard Consistency
- ✅ PR4 — Capability Catalog SSoT
- ✅ PR5 — Permission Governance Hardening
- ⏳ PR6 — Security Tests + Observability

## Recommended next PR (PR6)
1. Add focused tests around permission conflict handling and break-glass behavior.
2. Add structured security telemetry for permission update failures (`stale_write_conflict`, `last_admin_lockout`).
3. Extend route-guard CI visibility for high-risk admin endpoints.
