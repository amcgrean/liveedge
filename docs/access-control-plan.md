# Access Control Upgrade — Plan & Status

Capability-based authorization for LiveEdge. Replaces the patchwork of
hardcoded role lists scattered across API routes, layouts, and `TopNav.tsx`
with a single capability vocabulary admins can grant or revoke per user.

**Branch**: `claude/improve-access-control-b8Le1`

---

## Why

Current state (pre-Phase-1):

- `public.app_users.roles` is a `text[]` source of truth.
- ~150 inline checks across routes / layouts / nav. Two flavors mixed:
  - `session.user.role === 'admin'` (scalar, brittle)
  - `roles.some(r => ['admin','supervisor','ops','warehouse',...].includes(r))` (hardcoded list per route)
- The admin Users page only edits a single `role` dropdown.
- `app/admin/users/[id]/permissions/` exists but writes the legacy
  `bids.user_security` matrix that auth never reads.
- Concrete pain point: a sales user can't release picks because
  `app/api/warehouse/orders/[so_number]/release-pick/route.ts:33` hardcodes
  the allowed role list with no `'sales'`. Today the only way is to
  re-type the user as `supervisor`/`ops` — overkill.

Goal: roles stay as coarse presets; per-user `granted_capabilities` and
`revoked_capabilities` arrays let admins fine-tune access without
inventing new role types.

---

## Design

### Effective set

```
effective = (∪ ROLE_DEFAULTS[role] for role in roles) ∪ granted − revoked
```

Computed once at login in `auth.ts` and persisted on the JWT for the
session lifetime (7 days). An admin permission change therefore takes
effect on the user's **next sign-in**.

### Capability vocabulary (28 codes)

Defined in `src/lib/access-control.ts` as the `CAPABILITIES` const. Grouped:

| Group | Capabilities |
|-------|-------------|
| Operations / Yard | `picks.release`, `pickers.manage`, `workorders.assign`, `yard.view` |
| Dispatch | `dispatch.view`, `dispatch.manage` |
| Sales / Orders | `sales.view`, `customers.notes.write`, `orders.push_to_erp`, `quotes.manage` |
| Estimating | `bids.manage`, `designs.manage`, `ewp.manage`, `projects.manage` |
| Purchasing | `purchasing.view`, `purchasing.receive`, `purchasing.review` |
| Credits / Accounting | `credits.view`, `credits.manage`, `ar.view` |
| Admin / System | `admin.users.manage`, `admin.audit.view`, `admin.config.manage`, `admin.jobs.review`, `admin.products.view`, `admin.customers.view`, `hubbell.review` |
| Cross-cutting | `branch.all` |

### Role defaults

`ROLE_DEFAULTS` in `src/lib/access-control.ts` maps every existing role
(`admin`, `management`, `sales`, `supervisor`, `ops`, `warehouse`,
`dispatch`, `driver`, `estimator`, `estimating`, `designer`,
`purchasing`, `receiving_yard`, `hubbell`, `viewer`) to its default
capability set. Defaults match today's hardcoded role lists so existing
users see no behavior change after Phase 1 ships.

### Schema

`db/migrations/0015_user_capabilities.sql`:

```sql
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS granted_capabilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS revoked_capabilities text[] NOT NULL DEFAULT '{}';
```

No index — capabilities are read into the JWT once at login, never
queried for filtering.

---

## Phased Rollout

### Phase 1 — Foundation ✅ COMPLETE

Purely additive. No behavior change for any existing user.

- `db/migrations/0015_user_capabilities.sql` — adds the two `text[]` columns
- `src/lib/access-control.ts` — `CAPABILITIES`, `ROLE_DEFAULTS`,
  `effectiveCapabilities()`, `hasCapability()`, `sessionCapabilities()`,
  `requireCapability()` (API route guard, returns 401/403 NextResponse),
  `requirePageAccess()` (server-component guard, redirects)
- `src/lib/menu-config.ts` — `MENU` array (ground-truth nav), `visibleMenu()`
- `auth.ts` — reads `granted_capabilities` / `revoked_capabilities` from
  `app_users`, computes effective set in `authorize()`, persists on JWT
  + session, handles backfill for tokens minted before the field existed
- Type augmentation: `Session.user.capabilities: string[]`

**Manual step required before Phase 2 ships**: apply the migration in the
Supabase SQL editor (same pattern as `0004_page_visits.sql` — Drizzle
isn't run against `public` schema).

### Phase 2 — Admin UI (NEXT)

See "Phase 2 Handoff" section below.

### Phase 3 — Switch the renderer

- `TopNav.tsx`: replace `roles.includes(...)` checks with
  `visibleMenu(session)` from `src/lib/menu-config.ts`. Drop hardcoded
  visibility logic for each dropdown.
- `app/HomeClient.tsx`: filter module cards via `visibleMenu(session)`.
- This is the visible flip. Sales reps with no extra grants see the
  same menu they see today (because role defaults match). New grants
  show up immediately on next login.

### Phase 4 — Sweep route guards

One PR per domain. Each is independently shippable because the old
role checks still work alongside the new capability checks.

- **First PR / immediate gap**: convert `app/api/warehouse/orders/[so_number]/release-pick/route.ts`
  + `app/api/warehouse/picks/create-pick-file/route.ts` to
  `requireCapability('picks.release')`. Now any sales user with that
  grant can release picks without becoming `supervisor`.
- Then sweep: warehouse → dispatch → sales → purchasing → admin.
- Pattern: `if (session.user.role !== 'admin') redirect('/')` →
  `await requirePageAccess('admin.foo.view')`. For API routes:
  `const auth = await requireCapability('foo.bar'); if (auth instanceof NextResponse) return auth;`

### Phase 5 — Cleanup

- Delete legacy `bids.user_security` matrix tables + the orphaned
  PermissionsClient that reads them.
- Optionally drop the derived scalar `role` from session if all checks
  have moved to capabilities. (Probably keep — useful for nav presets
  and the "primary role" admin badge.)

---

## Phase 2 Handoff

Goal: rebuild `/admin/users/[id]/permissions/` against `app_users` so
admins can grant/revoke capabilities per user.

### Files to touch

- `app/admin/users/[id]/permissions/page.tsx` — server component, reads
  user + capabilities, gates with `requirePageAccess('admin.users.manage')`
- `app/admin/users/[id]/permissions/PermissionsClient.tsx` — full
  rewrite. Today this reads `bids.user_security`; replace with the
  3-tab capability editor described below
- `app/api/admin/users/[id]/permissions/route.ts` — replace the legacy
  user_security read/write with `app_users.granted_capabilities` /
  `revoked_capabilities` updates. Audit-log every change to
  `general_audit` (use `src/lib/audit.ts`)
- `app/admin/users/UsersClient.tsx` — change the role dropdown to
  multi-select (writes `roles[]` instead of `[role]`). Today's API
  already accepts an array — see `app/api/admin/users/route.ts:119–127`

### UI shape

Three tabs grouping the 28 capabilities by intent:

1. **Pages & Menus** — `*.view` capabilities + `branch.all`
   (yard.view, dispatch.view, sales.view, ar.view, credits.view,
    admin.audit.view, admin.products.view, admin.customers.view, branch.all)
2. **Actions** — operational verbs
   (picks.release, pickers.manage, workorders.assign, dispatch.manage,
    customers.notes.write, orders.push_to_erp, quotes.manage,
    bids.manage, designs.manage, ewp.manage, projects.manage,
    purchasing.receive, purchasing.review, credits.manage)
3. **Admin** — privileged
   (admin.users.manage, admin.config.manage, admin.jobs.review,
    hubbell.review)

For each capability row: a 3-state toggle —
**Inherited** (granted by current roles) / **Granted** (in
granted_capabilities) / **Revoked** (in revoked_capabilities) — with
an "Effective" green/red dot showing the resolved value computed via
`effectiveCapabilities(roles, granted, revoked)`.

Save writes all three: `roles[]`, `granted_capabilities[]`,
`revoked_capabilities[]`. Per-row UI state maps to grants/revokes:

- "Inherited" → not in either array
- "Granted" → in `granted_capabilities` (and removed from `revoked_capabilities` if present)
- "Revoked" → in `revoked_capabilities` (and removed from `granted_capabilities` if present)

Don't store redundant grants (capability is already in role defaults)
or redundant revokes (capability isn't in any role default) —
normalize on save.

### API contract

`GET /api/admin/users/[id]/permissions` →
```json
{
  "roles": ["sales"],
  "granted_capabilities": ["picks.release"],
  "revoked_capabilities": [],
  "effective_capabilities": ["sales.view","customers.notes.write","orders.push_to_erp","quotes.manage","credits.view","picks.release"],
  "role_defaults": { "sales": [...], "...": [...] }
}
```

`PUT /api/admin/users/[id]/permissions` body:
```json
{ "roles": [...], "granted_capabilities": [...], "revoked_capabilities": [...] }
```

Validate: every code in the two arrays must be in `ALL_CAPABILITIES`.
Reject unknown codes with 400. Audit-log the diff.

### Acceptance criteria

- An admin can open `/admin/users/[id]/permissions/` and see capabilities
  grouped by tab with current state per row
- Toggling a capability and saving writes to `app_users.*_capabilities`
- Re-login by the affected user surfaces the new effective set on
  `session.user.capabilities`
- The page itself is gated by `requirePageAccess('admin.users.manage')`
- Audit log captures who changed what (`changes` JSONB in `general_audit`)

### Out of scope for Phase 2

- Wiring `visibleMenu()` into `TopNav.tsx` (Phase 3)
- Converting any inline role checks to `requireCapability()` (Phase 4)
- Per-branch capability scoping (deferred — revisit if asked)
- Time-bounded grants (deferred)

### Tips for the Phase 2 agent

- Read `src/lib/access-control.ts` end-to-end before starting; the helpers
  there (`effectiveCapabilities`, `ALL_CAPABILITIES`, `CAPABILITIES`) are
  the building blocks
- Existing audit helper: `src/lib/audit.ts` — use it for the `PUT` route
- The legacy `PermissionsClient.tsx` has the visual pattern for a
  permission matrix; lift the layout but throw away the data model
- Nothing in Phase 2 should change behavior for unaffected users —
  only the page being edited writes to the new columns

---

## Files Inventory (Phase 1)

| File | Purpose |
|------|---------|
| `db/migrations/0015_user_capabilities.sql` | DDL — apply manually in Supabase SQL editor |
| `src/lib/access-control.ts` | Single source of truth: capabilities, role defaults, all helpers |
| `src/lib/menu-config.ts` | Menu structure + `visibleMenu()` filter |
| `auth.ts` | Reads/computes capabilities; persists on JWT + session |
| `docs/access-control-plan.md` | This document |

## Smoke Tests (run during Phase 1, all green)

```
admin                     → 28 caps (all)
sales (no overrides)      → 5 caps  (sales.view, customers.notes.write, orders.push_to_erp, quotes.manage, credits.view)
sales + picks.release     → 6 caps  ✅ adds picks.release
supervisor − pickers.manage → 6 caps ✅ drops pickers.manage
viewer                    → 1 cap   (sales.view)
warehouse + dispatch      → 5 caps  (multi-role union works)
unknown role              → 0 caps  (safe default)
empty roles + grant only  → 1 cap   ✅ grant works without a role
unknown capability grant  → ignored ✅ silently filtered
```
