# Next Agent Prompt — Security Remediation PR5 (2026-05-15)

Use this exact prompt to continue work in the next session:

---
You are continuing the LiveEdge security remediation stream.

## Read first
1. `docs/security-remediation-master-plan-2026-05-14.md`
2. `docs/security-remediation-handoff-2026-05-14-pr4.md`
3. `docs/security-policy-routes.md`

## Current state (already merged)
- PR1 complete: route policy + route-guard scanner + CI.
- PR2 complete (cron scope): standardized service-auth for cron; inbound remains `serviceAuthLegacy` follow-up.
- PR3 complete: `app/scorecard/layout.tsx` now capability-gated with `requirePageAccess('sales.view')`.
- PR4 complete: capability metadata catalog + protected endpoint + catalog-driven permissions UI.

## Your target scope: PR5 — Permission Governance Hardening
Implement one focused PR that introduces conflict-safe permission updates + stronger governance.

### Required tasks
1. Add optimistic concurrency to admin permissions update flow:
   - Introduce a version marker (or `updated_at`) on permission-bearing records.
   - Require client to pass `if_match_version` (or equivalent) on write.
   - Return `409 Conflict` for stale updates.
2. Extend permissions update contract with governance fields:
   - `change_reason` (required for privileged changes)
   - `ticket_ref` (optional but persisted when provided)
3. Add break-glass protection:
   - Prevent last-admin self-lockout / last-admin capability removal.
4. Persist richer audit metadata for permission changes.

### Hard constraints
- Keep role defaults unchanged unless explicitly necessary.
- Do not broaden user access.
- Keep API behavior backward-compatible where possible (if breaking, document migration in PR notes).

### Validation commands
Run and report:
- `npm run typecheck`
- `npm run check:route-guards`
- targeted tests/scripts for:
  - stale update conflict behavior
  - last-admin protection behavior

### Deliverables
- Code + migration notes (if schema touched).
- Updated docs/handoff with:
  - what changed
  - scope boundaries
  - rollback notes
- PR notes must explicitly call out conflict semantics and admin safety controls.
---
