# Security Remediation — Finish Handoff (2026-05-20)

Prompt for the next Claude agent. Picks up where the master plan
(`docs/security-remediation-master-plan-2026-05-14.md`) and the PR5 handoff
(`docs/security-remediation-handoff-2026-05-19-pr5.md`) left off.

## Where things stand
- PR1–PR5 of the master plan are merged. PR6 is not started.
- PR5 (#337) shipped two live bugs in `app/api/admin/users/[id]/permissions/route.ts`
  that Codex flagged on PR #341 but were never fixed.
- Three related branches are still open and pre-existing:
  - `codex/continue-work-on-security-upgrade-plan` — Codex's own attempt at the
    P1/P2 fix. Codex flagged additional issues in its own work; not safe to
    merge as-is.
  - `claude/fix-permissions-update-error-yizvY` — a different small fix for a
    500 (roles cast). Touches the same route. Conflicts likely.
  - `codex/continue-work-on-security-remediation` — status doc only.
- PR4 parity test, PR2 inbound-webhook auth, and four product/security
  decisions from the master plan are all still open.

## Priorities

### P0 — Fix PR5 bugs in main
Both bugs are in `app/api/admin/users/[id]/permissions/route.ts` on `main`.

**P0.1 — Optimistic lock is broken.**
The `permissions_version` handed to clients is `new Date(updated_at).toISOString()`
(millisecond precision, line 71). The DB's `updated_at` is `timestamptz` with
microsecond precision. The PUT predicate `WHERE updated_at = ${ifMatchVersion}::timestamptz`
(lines 193, 201) effectively never matches — every save returns 409.

Fix: compare at a precision both sides can produce. Two safe options:
- Round both sides to millisecond precision by casting in SQL: `WHERE date_trunc('milliseconds', updated_at) = ${ifMatchVersion}::timestamptz`. Cheap, minimal blast radius, but you also need to truncate the `permissions_version` you return so the round-trip is stable.
- Or introduce an explicit integer/string version column (`permissions_version bigint default 0`, bumped per update) and stop comparing timestamps entirely. Cleaner but adds a migration. Master plan PR5 spec mentioned this as an alternative — it's the more correct long-term shape.

Recommend option 1 for the surgical fix, with a TODO comment pointing at option 2 if anyone cares to migrate later. Don't pick option 2 unilaterally without confirming.

**P0.2 — Last-admin lockout check is racy.**
Lines 166–176 do a read-then-compute-then-write to decide whether the caller's edit would zero out admins. No `SELECT FOR UPDATE`, no transaction wrapping the read and the subsequent UPDATE. Two concurrent admin self-edits can both pass and both commit.

Fix: wrap the precheck + UPDATE in a single transaction using `sql.begin(...)`, and within it `SELECT … FROM app_users WHERE is_active = true FOR UPDATE` (or at minimum `FOR SHARE`). Verify postgres.js supports `sql.begin` in this codebase — it does (used in other routes — grep for it). Re-run the `adminsAfter` computation inside the txn before issuing the UPDATE.

**Out of scope for the P0 PR:**
- Don't broaden role defaults.
- Don't change the audit payload shape.
- Don't refactor the route structure.
- Don't merge `codex/continue-work-on-security-upgrade-plan`. Treat that branch
  as superseded by your fix; close or delete it when you're done.

**Coordination with `claude/fix-permissions-update-error-yizvY`:**
- Check whether that branch's cast fix is already in main (commit `c0d54eb` —
  PR #327). If it is, the branch is stale and can be deleted.
- If not in main, port the one-line cast change into your P0 PR so both
  problems land together.

### P1 — Resolve the open codex/* branches
Once your P0 PR lands:
- Close `codex/continue-work-on-security-upgrade-plan` without merging. Comment with a link to your PR explaining why.
- Close or merge `codex/continue-work-on-security-remediation` — it's a status note. If it's stale, delete.
- Update `docs/security-remediation-handoff-2026-05-19-pr5.md` to mark P1/P2 fixed and point at your PR.

### P2 — Start PR6 (security tests + observability)
Master plan PR6 is the only remaining phase. Suggested split:

1. **Unit tests for capability composition** (`src/lib/access-control.ts`):
   `effectiveCapabilities(roles, granted, revoked)` and any-of checks. Cover
   default-role expansion, grant-overrides-default, revoke-overrides-grant,
   empty-role-set.
2. **Integration tests for the permissions PUT route:**
   - Happy path with valid `if_match_version`.
   - Stale-version returns 409 with `stale_write_conflict`.
   - Last-admin self-lockout returns 409 with `last_admin_lockout`.
   - Missing `change_reason` returns 400.
   - Unknown capability code returns 400.
   - Concurrent self-edit scenario (after the P0.2 fix is in) — both writers
     can't pass.
3. **Telemetry:** in the permissions route, count by error code
   (`stale_write_conflict`, `last_admin_lockout`, etc.) and log structured
   events. Pick whatever logging primitive the rest of the app uses — don't
   introduce a new dependency.
4. **Runbook:** short `docs/security-runbook.md` covering: what to do when CI
   guard scanner fails, how to handle a `last_admin_lockout` (use a DB-side
   admin to unstick), how to read the permission-change audit log.

### P3 — Cleanup items the master plan left open
- **PR2 inbound webhook auth:** `serviceAuthLegacy` is still in use for inbound
  webhook routes. Decide on signature vs. static-token auth per route, then
  migrate. Affected: `/api/inbound/credits` and any other `/api/inbound/*` or
  `/api/webhooks/*` routes. Check `docs/security-policy-routes.md` for the
  current allowlist.
- **PR4 parity test:** the master plan called for an automated test that the
  capability catalog exposed by `GET /api/admin/capabilities` matches what the
  admin UI renders. Add it as part of PR6's test work.
- **Four open product/security decisions** (master plan §"Open decisions"):
  - `scorecard.view` vs `sales.view`
  - step-up approval for admin permission changes
  - audit retention period
  - signature vs. static token for service routes

  Don't decide unilaterally. Ask the user to weigh in before writing code that
  depends on the answer.

## Working notes

### How to verify the fix locally
1. Apply the patch.
2. Sign in as an admin, open `/admin/users/<some-id>/permissions`.
3. Click any toggle, save. Should succeed (currently 409s every time).
4. Open two browser tabs to the same user's permission page. In tab A, change
   something and save. In tab B (which now has a stale version), change
   something and save. B should 409 with `stale_write_conflict`.
5. Try to remove `admin.users.manage` from your own account when no other
   admins exist. Should 409 with `last_admin_lockout`.

### Why not just merge the codex branch
Codex's own follow-up reviews (on PRs #341 and earlier) flagged the same P1/P2
bugs in `codex/continue-work-on-security-upgrade-plan`. Merging that branch
would not fix the issues — it introduced them. The catalog-driven UI piece
from that branch *was* the part that landed cleanly in PR #337; the governance
hardening shipped without the concurrency primitives the spec called for.

### Files to read first
- `app/api/admin/users/[id]/permissions/route.ts` — the route with both bugs.
- `app/admin/users/[id]/permissions/PermissionsClient.tsx` — caller; uses the
  `permissions_version` field; verify the fix doesn't break it.
- `src/lib/access-control.ts` — capability primitives, target of P2 unit
  tests.
- `docs/security-remediation-master-plan-2026-05-14.md` — original spec.
- `docs/security-remediation-handoff-2026-05-19-pr5.md` — last handoff (now
  partially stale — P1/P2 are not actually resolved).

### PR shape suggestion
- **PR A:** P0.1 + P0.2 + audit log update + handoff doc update. Keep narrow.
  Title: `fix(admin/permissions): correct optimistic lock + race in last-admin check`.
- **PR B:** PR6 tests + telemetry + runbook. Larger, but no behavior change.
  Title: `feat(security): PR6 — tests, telemetry, runbook`.
- **PR C** *(optional, only if user confirms direction):* inbound webhook
  auth migration.

Treat each as independently revertable.

## Definition of done for this handoff
- [ ] P0.1 fixed in main, verified by manual save test.
- [ ] P0.2 fixed in main, verified by the two-tab concurrency test.
- [ ] `codex/continue-work-on-security-upgrade-plan` closed without merge.
- [ ] `claude/fix-permissions-update-error-yizvY` either merged or closed.
- [ ] `docs/security-remediation-handoff-2026-05-19-pr5.md` updated to reflect
      reality.
- [ ] PR6 tests + runbook landed (or explicitly deferred with a follow-up
      doc).
- [ ] Open branches audit in `CLAUDE.md` reconciled.
