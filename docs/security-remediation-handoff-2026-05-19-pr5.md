# Security Remediation Handoff — PR5 complete (2026-05-19)

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
