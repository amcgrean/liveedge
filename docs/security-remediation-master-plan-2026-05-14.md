# Security & Permissions Remediation Master Plan — 2026-05-14 (revised)

> **Revision note.** This replaces the initial six-PR plan. The original plan
> was correct about the gaps but mis-sequenced: it deferred the live data
> exposure (scorecard) behind a CI lint, lumped three different webhook
> threat models into one helper, and missed two higher-impact bug classes
> (branch-scope IDOR and stale-JWT permission persistence). This revision
> compresses the work to **three executable PRs** with concrete file paths
> and acceptance criteria. Items the prior plan included that are
> intentionally dropped or deferred are listed in **Out of Scope** at the
> bottom — do not re-introduce them without explicit approval.

---

## Executive Summary

Capability primitives in `src/lib/access-control.ts` are sound. The gaps
are in (a) which routes/pages actually call them, (b) cross-branch data
leakage that capabilities don't model, and (c) revocation latency caused
by long-lived JWTs. Close those three, then add structural enforcement
so regressions can't slip in.

---

## Findings (grounded in current code)

1. **Scorecard layout is auth-only** — `app/scorecard/layout.tsx:9` calls
   `auth()` and redirects on missing session but performs no capability
   check. Every page under `/scorecard/**` (customer revenue, GM%,
   vendor spend, rep performance) is exposed to any authenticated user
   including drivers, warehouse pickers, and the `viewer` role.

2. **~75 API routes have no capability guard.** Grep of
   `app/api/**/route.ts` for `requireCapability` returns no match in
   ~75 of ~188 route files (full list in PR1 task notes). The set
   includes financially sensitive endpoints:
   `/api/sales/customers/[code]`, `/api/sales/orders/[so_number]/push-to-erp`,
   `/api/legacy-bids/[id]/push-to-erp`, `/api/credits/[id]/*`,
   `/api/purchasing/pos/[po]/*`, `/api/takeoff/sessions/[sessionId]/*`.

3. **Branch-scope IDOR is unmodeled.** The capability vocabulary has
   exactly one branch-related cap (`branch.all`). Most data routes
   filter via the user-controlled `beisser-branch` cookie
   (`getSelectedBranchId()`) but do **not** verify the requested
   record's `system_id` against the caller's branch when the caller
   lacks `branch.all`. A sales user at Grimes can call
   `GET /api/sales/customers/FD12345` (a Fort Dodge customer) and get
   data back. This is a higher-severity class than guard inconsistency
   and the prior plan did not mention it.

4. **Cron auth is duplicated, not centralized.** All three of
   `app/api/cron/erp-sync/route.ts`, `geocode-nightly/route.ts`, and
   `graph-subscription-renew/route.ts` reimplement the same
   `CRON_SECRET || x-vercel-cron` block. Webhook signature
   verification is already correct in `inbound/credits/route.ts`
   (Svix); the remaining inbound `graph/route.ts` uses Microsoft's
   `clientState`. Three patterns, not one "service-auth" helper.

5. **Permission changes take up to 7 days to revoke.** Capabilities are
   read once at login and persisted on the JWT for the 7-day session
   TTL. A revoked user keeps their permissions until next sign-in.
   `auth.ts` does this by design (documented in `CLAUDE.md`), but it
   is the real governance gap — not optimistic concurrency on the
   permissions PUT endpoint.

6. **Capability catalog drift in admin UI.**
   `app/admin/users/[id]/permissions/PermissionsClient.tsx` hardcodes
   capability lists in three tabs. New capabilities added to
   `CAPABILITIES` in `access-control-shared.ts` do not appear in the
   admin UI until someone manually edits the tabs.

---

## Delivery Plan — 3 PRs

### PR1 — Page Guards + Branch-Scope Audit (highest impact, ship first)

**Branch name:** `codex/security-pr1-page-guards`

**Why first.** Closes the live data exposures. Everything else is
prevention; this is the actual fix.

**Tasks**

1. **Scorecard guard.** Edit `app/scorecard/layout.tsx`:
   - Replace the `auth()`+redirect with
     `const session = await requirePageAccess('scorecard.view');`
   - Pass `session.user.name` / role to `TopNav` as before.
   - **Add a new `scorecard.view` capability** to
     `src/lib/access-control-shared.ts`. Reusing `sales.view` does not
     work here because the `viewer` role already has `sales.view`
     (`access-control-shared.ts:164-166`), and the whole point of the
     scorecard fix is to keep viewer-only accounts away from customer
     revenue, GM%, vendor spend, and rep performance.
   - Update `ROLE_DEFAULTS` to grant `scorecard.view` to `admin`
     (already gets everything via `ALL`), `management`, and `sales`.
     Do **not** grant it to `viewer`, `driver`, `warehouse`, `dispatch`,
     `purchasing`, `estimator`, or `designer`.
   - Add the new code to `CAPABILITIES_METADATA` in PR2 (high-risk
     category: `sales`).

2. **Page-guard sweep.** For each route group below, change the layout
   (or page if no layout) to use `requirePageAccess(<cap>)`:
   | Path | Capability |
   |------|------------|
   | `app/management/layout.tsx` | `sales.view` |
   | `app/scorecard/layout.tsx` | `scorecard.view` (new — see step 1) |
   | `app/sales/layout.tsx` (if exists, else each `page.tsx`) | `sales.view` |
   | `app/purchasing/**/page.tsx` | `purchasing.view` |
   | `app/credits/page.tsx` | `credits.view` |
   | `app/warehouse/**/page.tsx` | `yard.view` |
   | `app/dispatch/**/page.tsx` | `dispatch.view` |
   | `app/admin/**` | leave existing admin guards in place; verify each `page.tsx` has either a layout-level guard or its own `requirePageAccess` |

3. **API route guard sweep.** For every file in `app/api/**/route.ts` not
   already calling `requireCapability` and not on the allowlist below,
   add the appropriate `requireCapability(<cap>)` at the top of each
   exported HTTP method. The full target list lives in
   `docs/security-policy-routes.md` (created in this PR). Map by URL
   prefix:
   | Prefix | Capability |
   |--------|------------|
   | `/api/sales/**` | `sales.view` (GET) / context-dependent for writes |
   | `/api/dispatch/**` | `dispatch.view` (GET) / `dispatch.manage` (POST/PUT/DELETE) |
   | `/api/warehouse/**`, `/api/work-orders/**` | `yard.view` / `picks.release` / `workorders.assign` per current usage |
   | `/api/credits/**` | `credits.view` (GET) / `credits.manage` (writes) |
   | `/api/purchasing/**` | `purchasing.view` / `purchasing.receive` / `purchasing.review` |
   | `/api/bids/**`, `/api/legacy-bids/**`, `/api/designs/**`, `/api/ewp/**`, `/api/projects/**`, `/api/takeoff/**` | `bids.manage` / `designs.manage` / `ewp.manage` / `projects.manage` |
   | `/api/admin/**` | existing admin caps; do not change |
   | `/api/erp/**` | `sales.view` (reads); writes use `orders.push_to_erp` / `quotes.manage` |
   | `/api/home`, `/api/dashboard`, `/api/track-visit`, `/api/auth/**`, `/api/it-issues/**` | session-only is acceptable; add to **allowlist** in `scripts/check-route-guards.mjs` (see PR3) |
   | `/api/files/**` | **NOT session-only.** See step 6 below — these routes have an existing IDOR and must not be allowlisted. |

   Walk each route file individually — do not bulk-edit. Some files
   have route-specific writes that need a stronger capability than the
   prefix default.

4. **Branch-scope guard helper.** Add `src/lib/branch-guard.ts`:
   ```ts
   import type { Session } from 'next-auth';
   import { hasCapability } from './access-control-shared';
   import { getSelectedBranchId } from './branch-context';

   /**
    * True if the session may access records belonging to `recordBranch`.
    * Admin and any user with branch.all sees every branch. Otherwise the
    * record's system_id must match the user's currently selected branch.
    */
   export function canAccessBranch(
     session: Session | null | undefined,
     recordBranch: string | null | undefined,
   ): boolean {
     if (!session?.user) return false;
     if (hasCapability(session, 'branch.all')) return true;
     if (!recordBranch) return true; // unbranched records are public-within-app
     const userBranch = getSelectedBranchId();
     return userBranch === recordBranch;
   }
   ```
   Apply at the top of every `[code]`, `[so_number]`, `[id]`, `[po]`
   dynamic route under `/api/sales`, `/api/dispatch`,
   `/api/warehouse/orders`, `/api/credits`, `/api/purchasing/pos`. For
   each: after looking up the record's `system_id`, immediately call
   `canAccessBranch(session, record.system_id)` and return 404 (not
   403 — don't leak record existence) on false.

5. **Files routes — IDOR fix (do not allowlist).**
   `app/api/files/route.ts` currently accepts caller-supplied
   `entity_type`/`entity_id` and lists all files for that entity with
   no ownership check. `app/api/files/[id]/route.ts` returns a
   presigned R2 URL for any file UUID with only authentication. Both
   need either:
   - **Option A (preferred):** require the caller to hold the
     entity's owning capability (e.g. files attached to a `legacy_bid`
     require `bids.manage`; files attached to an `it_issue` require
     the issue creator's user_id to match `session.user.id`).
     Implement a small `assertFileAccess(session, entityType, entityId)`
     helper that switches on `entity_type` and returns 404 on mismatch.
   - **Option B (interim, if the entity-type universe is large):**
     gate the routes behind `bids.manage` as a coarse stand-in until
     per-entity ownership is wired up. Document this as interim in
     `docs/security-policy-routes.md` so PR3's scanner doesn't
     permanently bless the gap.
   Apply the same treatment to
   `app/api/legacy-bids/[id]/files/route.ts` and any
   `app/api/legacy-bids/[id]/download-all/route.ts` paths — confirm
   the caller has access to the parent legacy bid before returning
   presigned URLs. **The route-policy doc must not list any file
   route as `session-only`.**

6. **JWT staleness shortcut.** In `auth.ts`, drop the session
   `maxAge` from 7 days to **8 hours** for now. Document the
   tradeoff in the JWT block comment: revocation latency vs. login
   friction. Do not implement a per-request DB check or refresh-token
   flow in this PR — that is PR3 work. Eight-hour TTL closes the
   1-week revocation window enough to ship.

**Acceptance**

- `app/scorecard/**` returns 302 to `/` for sessions without
  `scorecard.view`. A `viewer`-role session (which has `sales.view`
  but not `scorecard.view`) is redirected.
- A user with role `driver` (only `dispatch.view`) hitting
  `/api/sales/customers/00001` returns 403.
- A Grimes-only sales user (no `branch.all`) hitting a Fort Dodge SO
  returns 404.
- `GET /api/files?entity_type=legacy_bid&entity_id=<id>` returns 404
  when the caller cannot access that legacy bid; same for
  `GET /api/files/[id]` against a file UUID belonging to a record the
  caller cannot reach.
- Manual smoke: existing admin and sales users can still load every
  screen they used before.
- Sessions older than 8h require re-login.

**Out of scope for this PR**

- Additional new capabilities beyond `scorecard.view`. Do not split
  `sales.view` further; do not invent new branch capabilities.
- The CI scanner (PR3).
- Catalog refactor (PR2). (`scorecard.view` itself only needs the
  vocabulary entry + role-defaults change in PR1; its
  `CAPABILITIES_METADATA` row lands with the rest of the catalog in
  PR2.)

---

### PR2 — Catalog Single Source of Truth + Admin UI Hardening

**Branch name:** `codex/security-pr2-capability-catalog`

**Tasks**

1. **Catalog with metadata.** In `src/lib/access-control-shared.ts`,
   add adjacent to `CAPABILITIES`:
   ```ts
   export type CapabilityCategory =
     | 'yard' | 'dispatch' | 'sales' | 'estimating'
     | 'purchasing' | 'credits' | 'admin' | 'cross-cutting';
   export type CapabilityRisk = 'low' | 'medium' | 'high';

   export const CAPABILITIES_METADATA: Record<Capability, {
     label: string;
     description: string;
     category: CapabilityCategory;
     risk: CapabilityRisk;
   }> = {
     'picks.release': { label: 'Release Picks', description: '…', category: 'yard', risk: 'medium' },
     // … one entry per capability in CAPABILITIES
   };
   ```
   Add a TS-compile-time exhaustiveness check (e.g. a `satisfies`
   clause or a `const _check: Record<Capability, ...>` line) so adding
   a new capability without metadata fails the typecheck.

2. **Catalog endpoint.** Add `app/api/admin/capabilities/route.ts`:
   - GET handler guarded by `requireCapability('admin.users.manage')`.
   - Returns `{ capabilities: [{ code, label, description, category, risk }] }`.

3. **Refactor permissions UI.** Edit
   `app/admin/users/[id]/permissions/PermissionsClient.tsx`:
   - Remove all hardcoded capability arrays.
   - Fetch `/api/admin/capabilities` on mount.
   - Render rows grouped by `category`; sort within group by `code`.
   - Keep the 3-state toggle behavior (Inherited / Granted / Revoked)
     and live effective-dot indicator unchanged.

4. **Last-admin lockout guard.** In
   `app/api/admin/users/[id]/permissions/route.ts` PUT handler, before
   committing the update:
   ```ts
   // Count remaining admins after applying this change.
   const wouldLockOutLastAdmin = await checkLastAdmin(userId, nextRoles, nextRevoked);
   if (wouldLockOutLastAdmin) {
     return NextResponse.json(
       { error: 'Cannot remove admin from the last active admin user.' },
       { status: 409 },
     );
   }
   ```
   Implement `checkLastAdmin` by counting active `app_users` rows
   whose effective caps include `admin.users.manage` after the
   pending change is applied. Block both role removal and explicit
   revocation of `admin.users.manage`.

5. **Audit diff.** The existing `legacyGeneralAudit` insert already
   runs; extend the `changes` JSONB payload to include
   `{ before: { roles, granted, revoked }, after: { roles, granted, revoked }, effective_diff: [...] }`
   so the audit row is reviewable without joining anything.

**Acceptance**

- Adding a new code to `CAPABILITIES` without adding to
  `CAPABILITIES_METADATA` fails `npm run typecheck`.
- Admin UI renders every capability defined in code; no hardcoded
  arrays remain in `PermissionsClient.tsx`.
- Attempting to revoke `admin.users.manage` from the last admin
  returns 409 with an actionable error message.
- Audit row for a permission change includes the effective diff.

**Out of scope**

- `if_match_version`, `change_reason`, `ticket_ref` fields. Skip
  them. Existing audit trail + last-admin guard cover the realistic
  threat model for a 4-yard internal app.
- New DB migration. Reuse existing columns.

---

### PR3 — Structural Enforcement + Service-Auth DRY

**Branch name:** `codex/security-pr3-enforcement`

**Tasks**

1. **`withCapability` wrapper.** Add to
   `src/lib/access-control.ts`:
   ```ts
   import type { NextRequest } from 'next/server';
   type Handler<C> = (req: NextRequest, ctx: C, session: Session) => Promise<Response>;
   export function withCapability<C = unknown>(
     ...required: Capability[]
   ): (handler: Handler<C>) => (req: NextRequest, ctx: C) => Promise<Response> {
     return (handler) => async (req, ctx) => {
       const result = await requireCapability(...required);
       if (result instanceof NextResponse) return result;
       return handler(req, ctx, result);
     };
   }
   ```
   Migrate the routes touched in PR1 to use this wrapper. The wrapper
   form is greppable (`withCapability(`) and structurally tied to the
   exported handler, which makes the scanner in step 3 actually
   meaningful.

2. **Three named service-auth helpers, not one.** Add
   `src/lib/service-auth.ts`:
   ```ts
   export function verifyVercelCron(req: NextRequest): NextResponse | null { … }
   export async function verifyResendWebhook(req: NextRequest, rawBody: string): Promise<NextResponse | null> { … }
   export function verifyGraphSubscription(req: NextRequest, expectedClientState: string): NextResponse | null { … }
   ```
   - `verifyVercelCron`: extract the duplicated logic from the three
     cron routes verbatim. Return `null` on pass, `NextResponse.json({error}, {status: 401})` on fail.
   - `verifyResendWebhook`: lift the Svix verification block from
     `app/api/inbound/credits/route.ts:286-310` as-is.
   - `verifyGraphSubscription`: extract the `clientState` check from
     `app/api/inbound/graph/route.ts`.
   Update all five callers (3 cron + 2 inbound) to delegate.

3. **Route-policy doc + scanner.** Add `docs/security-policy-routes.md`
   enumerating each route under `app/api/**/route.ts` with its policy
   class:
   - `capability:<cap>` (uses `withCapability` or `requireCapability`)
   - `service:vercel-cron`, `service:resend`, `service:graph`
   - `session-only:<reason>` (explicit allowlist — see PR1 step 3)
   - `public:<reason>` (e.g. NextAuth route)

   Add `scripts/check-route-guards.mjs`:
   - Parse every `app/api/**/route.ts`.
   - For each exported HTTP method (GET/POST/PUT/DELETE/PATCH), assert
     the body contains exactly one of:
     `withCapability(`, `requireCapability(`, `verifyVercelCron(`,
     `verifyResendWebhook(`, `verifyGraphSubscription(`, or the route
     path is on the `session-only` / `public` allowlist in
     `docs/security-policy-routes.md`.
   - Exit non-zero with the list of offending routes if any check
     fails.
   - Add `"check:route-guards": "node scripts/check-route-guards.mjs"`
     to `package.json` scripts.
   - Wire into the existing CI workflow alongside lint/typecheck.

4. **OTP send rate-limit hardening.** `app/api/auth/send-otp/route.ts`
   already rate-limits inline ("3 codes per 15 min per email"). Move
   the limiter into `src/lib/rate-limit.ts` so the same primitive is
   available for future webhook IP-rate-limiting work. Do not add new
   limiters in this PR.

**Acceptance**

- `npm run check:route-guards` passes on the current tree.
- Removing `requireCapability(...)` from any non-allowlisted route
  causes CI to fail with a pointing error.
- The three cron routes' `route.ts` files are < 80% of their current
  size (the duplicated auth block is gone).
- `app/api/inbound/credits/route.ts` imports the Svix verifier from
  `service-auth.ts` rather than constructing it inline.

**Out of scope**

- Middleware-level deny-by-default. Considered, but the wrapper +
  scanner combo is sufficient and avoids the cold-start cost of
  running `auth()` in `middleware.ts` on every request.
- Telemetry / log drain. There is no log sink currently wired up;
  do not add unwired observability code.

---

## Execution rules (read before starting any PR)

1. **One concern per PR.** Do not bundle PR2 work into PR1, etc.
2. **Run before opening:** `npm run lint`, `npm run typecheck`,
   `npm run build`, and (after PR3) `npm run check:route-guards`.
3. **Test manually as a non-admin.** Sign in as a `driver`,
   `warehouse`, and `viewer` role. Verify each role still sees the
   pages it was meant to see, and is denied where appropriate.
4. **Branch & commit naming.** Use the branch names listed above.
   Commit messages: `security: <PRn> <short summary>`. Do not include
   model identifiers in commit messages or PR bodies.
5. **No new capabilities** unless explicitly listed in a task. PR1
   reuses existing capabilities deliberately to avoid scope creep on
   the role-defaults table.
6. **Branch-scope check returns 404, not 403.** Don't leak record
   existence to unauthorized callers.

---

## Out of Scope — Do Not Implement

The following were in the prior version of this plan or are tempting
additions. **Skip them unless explicitly re-authorized:**

- `if_match_version`, `change_reason`, `ticket_ref` on the permissions
  PUT contract. Optimistic concurrency on permission edits is solving
  a problem that hasn't bitten a 4-yard internal tool.
- ~~New `scorecard.view` capability. Reuse `sales.view`.~~
  **Revised:** `scorecard.view` is required in PR1. Reusing
  `sales.view` does not exclude the `viewer` role, which has
  `sales.view` by default. See PR1 step 1.
- Per-request DB capability lookup or refresh-token rotation. The 8h
  JWT TTL in PR1 is the chosen compromise; revisit only if a stronger
  revocation guarantee is requested.
- Middleware-level `/api/**` deny-by-default. Wrapper + scanner is
  sufficient.
- Telemetry, Sentry, log drains, 401/403 trend dashboards. No sink
  exists; defer until one is selected.
- Broadening any `ROLE_DEFAULTS` entry. Do not touch this table in
  any of the three PRs.
- IP allowlisting on webhooks. Resend and Microsoft Graph publish IP
  ranges but they rotate; signature verification is the durable
  control and is already in place.

---

## Sequencing Rationale

- **PR1 first** because scorecard exposure + branch IDOR are live
  bugs leaking data today. Every day spent on lint scaffolding is a
  day those gaps stay open.
- **PR2 second** because catalog drift makes future capability work
  unreviewable. Doing this before PR3 means the route-policy doc PR3
  generates can reference real metadata.
- **PR3 last** because the wrapper + scanner are only useful once
  the routes they enforce have been migrated. Building the lint
  before the cleanup creates noise.

---

## Success Metrics

- Zero unguarded routes under `app/api/**` after PR3 (verified by CI).
- Zero capability codes defined in `CAPABILITIES` without a
  corresponding `CAPABILITIES_METADATA` entry (verified by typecheck).
- Cross-branch dynamic-route lookups return 404 for users lacking
  `branch.all` (verified by manual test in PR1 acceptance).
- Permission revocation takes effect within 8 hours of the change.
- Last-admin lockout returns 409, not silent success.
