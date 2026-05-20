# Security Runbook

Operational guide for the security-sensitive parts of LiveEdge. Pairs with
the design documents in `docs/access-control-plan.md` and
`docs/security-remediation-master-plan-2026-05-14.md`.

## Permission updates (`PUT /api/admin/users/[id]/permissions`)

Every terminal branch of the route emits one structured JSON log line with
`evt: "permissions_update"` and a stable `outcome` field. Counts by outcome
tell you whether an incident is a real attack, a UI bug, or normal noise.

### Outcomes

| `outcome` | HTTP | Meaning | Expected baseline |
|---|---|---|---|
| `success` | 200 | Update committed | high |
| `validation_error` | 400 | Bad input (missing field, unknown capability code, bad JSON, non-numeric id) | low — admins use a UI, not raw API |
| `user_not_found` | 404 | Target user id doesn't exist | rare |
| `stale_write_conflict` | 409 | `if_match_version` didn't match — two-tab race or refresh-needed | rare; expected during real concurrent edits |
| `last_admin_lockout` | 409 | Self-edit would zero out `admin.users.manage` across active users | extremely rare; usually a mistake |
| `internal_error` | 500 | Unhandled exception | should be ~0 |

### Filtering logs

In Vercel logs, filter on the structured line:

```
evt:"permissions_update" outcome:"stale_write_conflict"
```

A spike of `stale_write_conflict` on the same `targetUserId` from different
`actorId`s indicates two admins editing the same user simultaneously — the
loser will see a 409 and need to reload. Not an attack.

A spike of `validation_error` with `reason:"unknown_capability"` from a
single `actorId` after a UI refresh suggests the client is sending a
capability code the server doesn't know — most likely a deploy ordering
problem (client is newer than server, or vice versa).

`last_admin_lockout` should fire essentially never. If it does, the
attempted action was *blocked* — no data lost — but somebody just tried to
remove the last admin. Reach out to the actor and ask why.

### Recovering from a lockout

If somehow no active user holds `admin.users.manage` (the route guards
against this, but a DB-side change or a bug could create it):

1. Connect to Supabase directly with a service-role key:
   ```sql
   UPDATE public.app_users
   SET granted_capabilities = COALESCE(granted_capabilities, '{}') || ARRAY['admin.users.manage']
   WHERE email = 'youremail@beisserlumber.com' AND is_active = true;
   ```
2. Have the rescued user sign **out** and back in — the JWT is computed at
   login from `app_users`, so a refresh isn't enough.
3. Audit `bids.legacy_general_audit` for recent `action='update_permissions'`
   entries to find what caused the gap.

### The "every save returns 409" failure mode

If users report that *every* permission save returns
`stale_write_conflict` (the failure mode PR5 originally shipped), check
that the optimistic-lock comparison still uses
`date_trunc('milliseconds', updated_at)` in
`app/api/admin/users/[id]/permissions/route.ts`. The bug was that
`new Date(updated_at).toISOString()` (ms precision) was being compared
directly against `timestamptz` (µs precision); always-mismatch was the
result. PR #349 fixed this; if it regresses, see that PR for context.

## CI route-guard scanner (`scripts/check-route-guards.mjs`)

CI fails on any new `app/api/**/route.ts` that lacks a guard call
(`requireCapability` / explicit auth check) or a documented exemption in
`docs/security-policy-routes.md`. Run locally:

```bash
npm run check:route-guards
```

If the scanner blocks a legitimate new route, choose ONE:

- **Preferred**: add a real `requireCapability(...)` guard at the top of
  the handler. Lookup vocabulary in `src/lib/access-control-shared.ts`.
- If the route is intentionally public (e.g. a webhook signed with a
  shared secret), add the path + the auth mechanism + the reason to
  `docs/security-policy-routes.md`. Never bypass the scanner by
  inventing a fake guard.

## Audit log

Permission changes write to `bids.legacy_general_audit` with
`action='update_permissions'`, `modelName='app_user'`, and the diff +
governance metadata (`if_match_version`, `resulting_version`,
`change_reason`, `ticket_ref`) in the `changes` JSONB column.

Read recent changes:

```sql
SELECT timestamp, user_id AS actor_id, changes
FROM bids.legacy_general_audit
WHERE action = 'update_permissions'
ORDER BY timestamp DESC
LIMIT 50;
```

`(changes->'governance'->>'change_reason')` is required on every update,
so every row should have a reason and (often) a `ticket_ref`. Rows
without one indicate a bug in the route or a direct DB write — investigate.

Retention policy is **not yet decided**. Until it is, treat audit rows as
permanent. See the open decisions list in
`docs/security-remediation-handoff-2026-05-20-finish.md`.

## Inbound webhooks (`/api/inbound/*`, `/api/webhooks/*`)

These accept POSTs from external services (Resend, etc.) and don't have
a logged-in user. They authenticate via either:

- Svix signature headers (Resend) — verified with `RESEND_WEBHOOK_SECRET`
- Bearer token in `Authorization` (internal services like the Pi
  scraper) — verified with `HUBBELL_UPLOAD_TOKEN` / `CRON_SECRET`

If you add a new inbound webhook:

1. Document it in `docs/security-policy-routes.md` (path + auth mechanism).
2. Implement signature verification BEFORE reading the body.
3. Do NOT trust any field in the payload to identify the user — webhook
   senders are external.
