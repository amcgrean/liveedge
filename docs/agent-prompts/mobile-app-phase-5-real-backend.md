# Phase 5 — Mobile App: Real Backend Integration

You are picking up Phase 5 of the LiveEdge driver mobile app. Phases 1–4 are **already merged to `main`** (PRs #445 and #454). Start a fresh branch from current `main`.

> Self-contained brief — you don't need to read prior chat history. Other supporting docs to scan if you want more context: `mobile-app/PHASE_5_HANDOFF.md` (Codex's prior gameplan), `mobile-app/README.md`, `mobile-app/PHASE_4_HANDOFF.md` (for the outbox/sync architecture you must preserve).

---

## TL;DR

Connect the Expo driver app to the real LiveEdge backend for:
- **Auth** — replace dev-mode OTP mocking with real OTP verification + JWT
- **Route list / details** — fetch today's real route from `/api/dispatch/routes?date=…&branch=…` instead of `MOCK_STOPS`
- **POD upload + delivery sync** — make the outbox actually call the backend (currently the dispatch.ts call is a 800ms timeout + 15% random failure)

**Hard requirement:** the offline-first outbox in `src/storage/outbox.ts` and the sync engine in `src/storage/sync.ts` are **not optional**. All Mark Delivered / Skip actions must continue to enqueue locally and survive cold-start + no-signal. You're swapping out the *transport*, not removing the queue.

---

## Current state (don't redo)

| Layer | File | Status |
|---|---|---|
| Auth UI | `mobile-app/src/app/(auth)/{login,otp,branch-select}.tsx` | ✅ Working, dev mode |
| Auth context | `mobile-app/src/context/AuthContext.tsx` | ✅ Persists session to SecureStore |
| Auth API client | `mobile-app/src/api/auth.ts` | 🟡 Dev mock; real path is a TODO stub |
| HTTP client | `mobile-app/src/api/client.ts` | ✅ Axios w/ `EXPO_PUBLIC_BACKEND_URL`, exports `IS_DEV_MODE` |
| Dispatch API client | `mobile-app/src/api/dispatch.ts` | 🟡 Dev mock with 800ms + 15% failure |
| Mock route data | `mobile-app/src/data/mockRoute.ts` | 🟡 To be wrapped by mapper |
| Route list / details / customer sheet | `mobile-app/src/app/(app)/...` | ✅ Reads from `findStop()`; will swap source |
| Camera + photo store | `mobile-app/src/app/(app)/[soNumber]/camera.tsx` + `src/data/photoStore.ts` + `src/storage/photoFS.ts` | ✅ Persists to documentDirectory |
| **Outbox + sync engine** | `mobile-app/src/storage/{outbox,sync}.ts` | ✅ AsyncStorage outbox, 5-attempt backoff, cleanup-on-success — **DO NOT BYPASS** |
| Sync queue UI | `mobile-app/src/app/(app)/sync-queue.tsx` | ✅ Reads `useOutbox()`, retry/discard works |
| Toast | `mobile-app/src/context/ToastContext.tsx` | ✅ `useToast().show()` |
| Online detector | `mobile-app/src/hooks/useOnline.ts` | ✅ NetInfo wrapper |

**Dev mode is preserved by `IS_DEV_MODE = !process.env.EXPO_PUBLIC_BACKEND_URL`.** Any Phase 5 wiring you do must keep the dev-mode fallbacks working so the next agent can still hack offline with `000000`.

---

## Backend research (done — use these exact paths)

The LiveEdge web app uses **NextAuth credentials provider → session cookie**. That doesn't work for mobile. You need to add **new backend routes** that return a bearer token instead. Here's the existing surface and what's missing:

### Existing routes (reuse where possible)

| Method | Path | Notes |
|---|---|---|
| `POST /api/auth/send-otp` | accepts `{ identifier }` (username or email), inserts code in `otp_codes` table, emails via Resend. Returns `{ ok: true }`. **Reuse this for mobile** — the OTP infra is already shared. |
| `GET /api/dispatch/routes?date=YYYY-MM-DD&branch=20GR` | Returns `{ routes: [{ id, route_date, route_name, branch_code, driver_name, truck_id, status, stops: [...] }] }`. Requires `dispatch.view` capability. Branch-scoped for non-admins. |
| `POST /api/dispatch/orders/[so_number]/deliver` | Marks delivered/skipped. Triggers route-completion notifier. |
| `POST /api/dispatch/orders/[so_number]/pod` | Accepts POD photo manifest. |

### Routes you need to ADD (mobile-only, server-side work)

Create **`app/api/auth/mobile/verify-otp/route.ts`**:
- Accepts `{ identifier, code }`.
- Validates code against `otp_codes` table (same rules as the web side).
- On success, signs a JWT with `AUTH_SECRET`. Payload: `{ sub: userId, email, name, roles, branch, exp: now + 7d }`. Library suggestion: `jose` (already used in the repo, see `auth.ts`).
- Returns `{ user: {...}, token: string, expiresIn: number }`.
- **Does not interact with NextAuth cookies** — pure JWT.

Create **`src/lib/mobile-auth.ts`** (helper):
- `verifyMobileToken(req: NextRequest): Promise<MobileSession | null>` — reads `Authorization: Bearer <jwt>`, verifies signature, returns user payload or null.
- `requireMobileAuth(req: NextRequest): Promise<MobileSession | NextResponse>` — convenience wrapper for route handlers; mirrors `requireCapability()` pattern.

Update existing dispatch routes (`routes`, `deliver`, `pod`) to **also accept Bearer tokens** via the new helper, falling back to the existing NextAuth session check. That lets web + mobile share endpoints without duplicating handler logic.

> **Important:** keep these changes minimal and isolated. Don't refactor the existing NextAuth setup. The goal is mobile gets a JWT path that lives alongside the web cookie path.

---

## Implementation order

### Step 1 — Backend: mobile auth endpoint + middleware

Files to create/modify on the Next.js side:

- `app/api/auth/mobile/verify-otp/route.ts` — NEW
- `src/lib/mobile-auth.ts` — NEW (token sign + verify helpers)
- `app/api/dispatch/routes/route.ts` — accept Bearer token
- `app/api/dispatch/orders/[so_number]/deliver/route.ts` — accept Bearer token
- `app/api/dispatch/orders/[so_number]/pod/route.ts` — accept Bearer token

Smoke test with curl:
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"someuser"}'
# Console-logged code (with AUTH_OTP_CONSOLE=true)

curl -X POST http://localhost:3000/api/auth/mobile/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"someuser","code":"123456"}'
# → { user, token, expiresIn: 604800 }

curl http://localhost:3000/api/dispatch/routes?date=2026-05-30 \
  -H "Authorization: Bearer <token>"
# → { routes: [...] }
```

### Step 2 — Mobile: token plumbing

The hard part is that `src/storage/sync.ts` runs in the background and **must not import React Context**. Create a tiny module that AuthContext writes to and that storage/API modules can read from:

`mobile-app/src/api/authToken.ts` — NEW:
```ts
let currentToken: string | null = null;
type Listener = (token: string | null) => void;
const subs = new Set<Listener>();

export function setAuthToken(token: string | null): void {
  currentToken = token;
  subs.forEach((fn) => fn(token));
}
export function getAuthToken(): string | null {
  return currentToken;
}
export function subscribeAuthToken(fn: Listener): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
```

Wire it up:
- `AuthContext.tsx` — call `setAuthToken(session.token)` after `bootstrapAsync` and after a successful login; call `setAuthToken(null)` on logout.
- `src/api/client.ts` — request interceptor adds `Authorization: Bearer ${getAuthToken()}` when present.

### Step 3 — Mobile: real OTP + route fetching

Update `mobile-app/src/api/auth.ts`:
- Replace the `/api/auth/verify-otp` stub with `/api/auth/mobile/verify-otp`.
- The dev-mode branch stays — just the production branch changes.

Add `mobile-app/src/data/routeMapper.ts` — NEW:
- Function `mapServerRouteToStops(serverRoute): MockStop[]` that takes the backend `{ stops: [...] }` and produces the existing `MockStop[]` shape so screens don't need to change.
- Fields that don't exist on the server yet (`primaryContact`, `siteContact`, `orderLines`, `totalWeight`, `gateCode`) — return `undefined`. The screens already guard against missing fields.

Add `mobile-app/src/hooks/useDriverRoute.ts` — NEW:
- Returns `{ stops: MockStop[], loading: boolean, error: string | null, refresh: () => Promise<void> }`.
- In dev mode, returns `MOCK_STOPS` immediately.
- In production, fetches `/api/dispatch/routes?date={today}&branch={user.branch}` via `client`.
- Supports pull-to-refresh by exposing `refresh()`.

Update screens to use the hook instead of `findStop(so)` / direct `MOCK_STOPS` reads:
- `src/app/(app)/route-list.tsx` — replace local `MOCK_STOPS` usage with `useDriverRoute()`.
- `src/app/(app)/[soNumber]/details.tsx` — replace `findStop(so)` with `useDriverRoute().stops.find(s => s.so === so)`.
- `src/app/(app)/[soNumber]/customer.tsx` — same.
- `src/app/(app)/sync-queue.tsx` — same (it already uses `findStop` only for display).

`src/data/mockRoute.ts` stays as the fallback data source — don't delete it.

### Step 4 — Mobile: real POD upload + delivery sync

This is the trickiest piece because `outbox.photoUris` are local `file://` paths the server can't use.

Update `mobile-app/src/api/dispatch.ts`:
- Replace the simulated `markDelivered` mock with a two-phase flow:
  1. **Upload photos**: for each `file://` URI, request a presigned PUT URL from the backend (`POST /api/dispatch/orders/[so]/pod/upload-url` — you'll need to add this route, or reuse the existing R2 presigning pattern from `src/lib/r2.ts`). PUT bytes to it. Track each photo's `{ uri, remoteKey, uploaded: true|false }` so retries can resume mid-batch instead of re-uploading already-completed photos.
  2. **Mark delivered**: once all photos uploaded (or zero photos for skip), POST to `/api/dispatch/orders/[so]/deliver` with `{ status, notes, timestamp, photo_keys: [...] }`.
- Both phases run inside the existing outbox/sync flow — `syncItem` in `sync.ts` already wraps the call in try/catch + retry/backoff.

Where to store upload progress (so retry resumes):
- Extend `OutboxItem` in `src/storage/outbox.ts` to track per-photo upload state:
  ```ts
  photoUploads?: Array<{ uri: string; remoteKey?: string; uploaded: boolean }>;
  ```
- Initialize on enqueue (all `uploaded: false`).
- `dispatch.ts` updates the relevant entries via `outbox.update()` after each successful PUT.

Keep `sync.ts` itself unchanged — it should remain a generic "iterate pending → call dispatch.markDelivered → handle success/failure" loop. The two-phase complexity lives in `dispatch.ts`.

### Step 5 — Reconciliation

After Step 4 lands, add one more touch:
- When the route refresh runs (`useDriverRoute().refresh()`), if the server reports a stop as `delivered` but the outbox still has a pending item for that SO with status `synced`, drop the local override.
- If the server still reports `pending` but the outbox has a `synced` item, leave the local view as delivered — the next route refresh will catch up.

---

## Don't waste time on

- Real maps (Mapbox/Leaflet) — Phase 6
- Per-job site contacts (foreman, gate codes) — needs new web tables; deferred
- Signature capture — V1.1
- Barcode scanning — separate app workflow
- ESLint config for `mobile-app` — `npm run lint` currently fails by design (no config), don't fix unless asked

---

## Verification (run before committing)

```bash
cd mobile-app
npm run type-check
```

End-to-end smoke test in iOS simulator with `EXPO_PUBLIC_BACKEND_URL=http://localhost:3000` set in `mobile-app/.env`:
1. Start the Next.js dev server (`npm run dev` from repo root) with `AUTH_OTP_CONSOLE=true`.
2. `cd mobile-app && npx expo start`, press `i`.
3. Log in as a real user from `app_users` (get OTP from server console).
4. Confirm branch picker + route list shows real stops from `/api/dispatch/routes`.
5. Open a stop, take 2 photos, mark delivered.
6. Verify Network panel shows: presigned URL fetch → PUT to R2 → POST `/deliver` with `photo_keys`.
7. Turn off Mac Wi-Fi → mark another stop delivered → confirm it queues in Sync Queue.
8. Turn Wi-Fi back on → confirm sync fires, queue clears, photos cleaned up from disk.
9. Cold-kill simulator app → reopen → confirm session persists and any in-flight outbox items remain queued.

Then dev-mode regression:
1. Unset `EXPO_PUBLIC_BACKEND_URL`, restart Expo.
2. Confirm `000000` login still works and the app falls back to `MOCK_STOPS`.

---

## Commit guidance

Start a fresh branch off current `main`:
```bash
git checkout main && git pull
git checkout -b claude/mobile-phase5-backend
```

Suggested commit boundaries:
1. `feat(api): mobile auth — JWT verify-otp endpoint + Bearer middleware` (web-side only)
2. `feat(mobile-app): wire real auth + token plumbing` (auth-only mobile changes)
3. `feat(mobile-app): real route fetching with offline mock fallback` (routes only)
4. `feat(mobile-app): real POD upload + two-phase delivery sync` (the meaty one)

Each commit should leave the app in a working state. Open one PR with all four.

---

## Gotchas

1. **Expo only inlines `EXPO_PUBLIC_*` env vars.** `IS_DEV_MODE` is derived from `EXPO_PUBLIC_BACKEND_URL` — don't introduce new non-public env vars expecting them to reach the device bundle.

2. **`AUTH_SECRET` is server-side only.** The JWT signing happens on the Next.js side; the mobile client never touches the secret. Verify the secret is present in the server env before assuming `/api/auth/mobile/verify-otp` works.

3. **The `MockStop` shape has more fields than the real API returns.** That's intentional — `primaryContact`, `siteContact`, `gateCode`, `orderLines`, `totalWeight` are all "future" data from a not-yet-built `job_contacts` table. Your `routeMapper` should leave them `undefined` and rely on the existing screens' null-handling. Don't fail mapping when they're missing.

4. **Photo retry must be resumable.** If a stop has 5 photos, 3 upload successfully, then the user goes offline — the next retry should only re-upload the failed 2 photos, not re-upload all 5. That's what the `photoUploads[]` extension to `OutboxItem` is for.

5. **Don't import React from storage modules.** `src/storage/sync.ts` and `src/storage/outbox.ts` must stay React-free so they can run in any context. Token plumbing goes through the standalone `authToken.ts` module described in Step 2.

6. **The outbox post-sync cleanup deletes photo files.** That happens in `sync.ts:syncItem()` after successful `markDelivered`. When you replace the mock with real uploads, the same cleanup applies — but only after the *deliver* POST succeeds, not after the photo uploads. If photos upload but deliver fails, the next retry will re-PUT zero photos (because they're already marked `uploaded: true` in `photoUploads`) and just retry the deliver. Don't delete files until everything succeeds.

7. **Capability check for the dispatch routes:** `/api/dispatch/routes` requires `dispatch.view`. Drivers may not have that capability today — check `ROLE_DEFAULTS` in `src/lib/access-control.ts` and confirm the `driver` role grants it. If not, add it or grant via `app_users.granted_capabilities`.

---

## When done

- Open a PR titled `feat(mobile-app): Phase 5 — real backend wiring`
- Tag the PR description: "Replaces dev-mode mocks with real OTP/route/POD; offline outbox preserved end-to-end"
- Confirm both real-mode and dev-mode smoke tests pass before requesting review
- Update `mobile-app/README.md`'s "Future / Deferred" section to remove items that just shipped
- Land it and we move on to Phase 6 (real maps + GPS-aware ETAs)

Good luck.
