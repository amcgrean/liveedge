# Phase 5 Handoff — Real Backend Integration

> Handoff doc for the next coding agent. This is current for branch `claude/mobile-app-mvp`, PR #445.

## Project Context

`mobile-app/` is an Expo SDK 54 React Native driver app inside the LiveEdge monorepo. It is intentionally independent from the root Next.js app, but Phase 5 will likely require small, explicit Next.js API work because the mobile app needs a JWT-style auth contract and real route/POD endpoints. Do not touch the root web app casually; only modify it when implementing a concrete mobile backend contract.

The mobile app uses Expo Router, TypeScript, React Native `StyleSheet`, SecureStore for auth session persistence, AsyncStorage for the offline outbox, and `expo-file-system/legacy` for persistent POD photo files. UI primitives live in `src/components/ui/`. Colors live in `src/theme/colors.ts`.

## Current Branch State

- Branch: `claude/mobile-app-mvp`
- PR: #445
- Latest relevant commits:
  - `7054fff5 docs(mobile-app): add Phase 5 handoff`
  - `093e065d docs(mobile-app): refresh gameplan after offline sync`
  - `c416d009 feat(mobile-app): Phase 4 — offline sync engine + persistent outbox`
- Working tree was clean when this handoff was created.

## What Is Complete

Phase 1-4 mobile MVP is implemented:

- OTP-style dev auth flow:
  - `src/app/(auth)/login.tsx`
  - `src/app/(auth)/otp.tsx`
  - `src/app/(auth)/branch-select.tsx`
  - `src/context/AuthContext.tsx`
  - `src/api/auth.ts`
- Mock route list and delivery details:
  - `src/data/mockRoute.ts`
  - `src/app/(app)/route-list.tsx`
  - `src/app/(app)/[soNumber]/details.tsx`
  - `src/app/(app)/[soNumber]/customer.tsx`
- Camera and persisted POD photos:
  - `src/app/(app)/[soNumber]/camera.tsx`
  - `src/app/(app)/[soNumber]/photos.tsx`
  - `src/data/photoStore.ts`
  - `src/storage/photoFS.ts`
- Offline sync:
  - `src/hooks/useOnline.ts`
  - `src/storage/outbox.ts`
  - `src/storage/sync.ts`
  - `src/context/ToastContext.tsx`
  - `src/app/(app)/sync-queue.tsx`
- Profile and route complete screens:
  - `src/app/(app)/profile.tsx`
  - `src/app/(app)/route-complete.tsx`

When `EXPO_PUBLIC_BACKEND_URL` is unset, dev mode is active:

- any username can request OTP
- code `000000` signs in
- dispatch sync is mocked with 800 ms latency and an intentional 15% failure rate

## Current Verification

The last verification run:

```bash
cd mobile-app
npm run type-check
```

passed.

`npm run lint` is not currently a useful gate because the mobile package has no ESLint config.

## Phase 5 Goal

Make the mobile app consume real LiveEdge backend data and submit real delivery/POD updates while preserving the Phase 4 offline-first behavior.

Phase 5 should not replace the offline outbox. The outbox remains the delivery action source of truth while offline or while a sync is pending.

## Main Blocker

The current web auth flow is NextAuth cookie-oriented. The mobile app needs a dedicated mobile auth response:

```ts
{
  user: {
    id: string;
    username?: string;
    email: string;
    name: string;
    roles: string[];
    branch?: string;
  };
  token: string;
  expiresIn: number;
}
```

Current placeholder in `src/api/auth.ts` calls:

```ts
POST /api/auth/verify-otp
```

That endpoint is a guess and likely does not exist with this response shape. Do not assume mobile production auth works until the web API contract is implemented and tested.

## Recommended Implementation Order

### 1. Confirm Phase 4 Manually

Before backend work, run the app in dev mode and test:

- login with any username + `000000`
- pick Grimes
- capture 2 photos for stop `102-44947`
- mark delivered offline
- verify Sync Queue has one item
- kill/reopen app
- verify outbox and photos persist
- reconnect network
- verify queued item syncs or retries

This catches device/runtime issues that TypeScript cannot.

### 2. Add Mobile Auth Endpoint

Likely root app work:

- add a dedicated mobile OTP verify API route
- verify the OTP against the same backing store as web auth
- return a bearer token/JWT and user payload
- preserve existing web auth behavior

Mobile files to update:

- `mobile-app/src/api/auth.ts`
- `mobile-app/src/context/AuthContext.tsx` only if the session shape changes
- `mobile-app/src/types/index.ts` only if the user/session shape needs a small extension

Keep dev mode working when `EXPO_PUBLIC_BACKEND_URL` is unset.

### 3. Replace Mock Route Data

Current app uses `src/data/mockRoute.ts`. The first real-data pass should introduce a mapping layer instead of spreading API payload assumptions through screens.

Suggested files:

```text
mobile-app/src/api/dispatch.ts
mobile-app/src/data/routeMapper.ts          NEW
mobile-app/src/hooks/useDriverRoute.ts      NEW
mobile-app/src/app/(app)/route-list.tsx
mobile-app/src/app/(app)/[soNumber]/details.tsx
mobile-app/src/app/(app)/[soNumber]/customer.tsx
mobile-app/src/app/(app)/sync-queue.tsx
mobile-app/src/data/mockRoute.ts            keep as dev fallback
```

Recommended pattern:

- `useDriverRoute()` fetches `/api/dispatch/routes?date=YYYY-MM-DD&branch=CODE`
- if `IS_DEV_MODE`, return `MOCK_STOPS`
- normalize API stops into the current `MockStop`-like UI shape
- keep screens rendering one stable stop type
- only remove or rename `MockStop` after real shape stabilizes

### 4. Wire Delivery Sync To Real Endpoints

Current `markDelivered()` dev mock accepts:

```ts
{
  type: 'deliver' | 'skip';
  notes: string;
  photoUris: string[];
  timestamp: string;
}
```

Real backend likely needs two steps:

1. upload POD photos via `/api/dispatch/orders/[so]/pod`
2. mark delivery status via `/api/dispatch/orders/[so]/deliver`

Decide the server contract explicitly. Do not send local `file://` URIs to the server as if they were useful server-side paths.

Recommended mobile approach:

- `sync.ts` stays outbox-oriented
- `dispatch.ts` exposes one high-level `syncDeliveryAction(item, token)` or equivalent
- that function handles photo upload then status update
- outbox item marks `synced` only after all required server writes succeed
- failed photo upload should keep the item pending unless product explicitly allows status-only completion

### 5. Reconcile Server State

After successful sync:

- mark outbox item synced
- refresh route data when online
- make route list status reflect server state plus pending local overrides

Avoid showing a stop as fully synced if the server still reports pending.

### 6. Real Maps

Defer until real route data is available. Current map UI is placeholder:

- `src/components/ui/MapPlaceholder.tsx`
- MAP FAB in `route-list.tsx`
- map area in `details.tsx`

Real maps need route coordinates or geocoded stop addresses. Do not build a map-only shell without real location data.

## Files To Avoid Unless Needed

- `src/components/ui/*` — design primitives are stable
- `src/theme/colors.ts` — keep palette stable
- `(auth)/*` screens — only change if auth contract requires it
- root Next.js app — only for concrete Phase 5 API endpoints

## Known Stale Or Deferred Items

- `mobile-app/TEST_PLAN.md` is broader than current automated coverage and includes some future backend/photo-upload expectations.
- `mobile-app/DEBUG_*`, `TEST_ENTRY_POINT*`, and `SESSION_COMPLETE.txt` are historical debugging artifacts.
- Per-job site contacts are intentionally deferred. See `mobile-app/README.md`.
- Signature capture is deferred.
- Barcode scanning is deferred.

## Commands

Use these from `mobile-app/`:

```bash
npm run type-check
npm start
npm run ios
npm run android
```

Use this from repo root before committing:

```bash
git status --short
git diff --check
```

## Completion Criteria For Phase 5

Phase 5 should be considered complete when:

- mobile can request OTP against real backend
- mobile can verify OTP and receive a bearer token/JWT
- route list loads real assigned stops for the selected branch/date
- detail/customer screens render real stop data without relying on Brenneman-only mock fields
- delivered/skipped actions sync to real backend
- POD photos upload durably
- offline outbox still works across app restarts
- sync queue accurately shows pending/retrying/failed actions
- dev mode still works with `EXPO_PUBLIC_BACKEND_URL` unset
- `npm run type-check` passes

## Ready-To-Use Prompt

Use `docs/agent-prompts/mobile-app-phase-5-real-backend.md` when handing this work to the next agent.
