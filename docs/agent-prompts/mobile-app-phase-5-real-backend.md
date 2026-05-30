# Next Agent Prompt — Mobile App Phase 5 Real Backend Integration

You are taking over PR #445 on branch `claude/mobile-app-mvp`. The latest relevant handoff/review commit at the time this prompt was prepared is `ed9725fa`.

Your task is to start Phase 5 for `mobile-app/`: connect the Expo driver app to real LiveEdge backend data and auth while preserving the completed Phase 4 offline-first behavior.

Read these first:

1. `mobile-app/PHASE_5_HANDOFF.md`
2. `docs/MOBILE_APP.md`
3. `mobile-app/README.md`
4. `mobile-app/src/api/auth.ts`
5. `mobile-app/src/api/dispatch.ts`
6. `mobile-app/src/storage/outbox.ts`
7. `mobile-app/src/storage/sync.ts`
8. `mobile-app/src/data/mockRoute.ts`

## Current State

Phase 1-4 is implemented:

- OTP-style dev auth
- branch picker
- mock route list/details/customer sheet
- camera capture
- persistent POD photo files
- AsyncStorage outbox
- NetInfo online/offline state
- retry/backoff sync engine
- real Sync Queue screen

Recent review fixes already landed:

- Deliver/Skip actions now guard against duplicate outbox enqueues from repeated taps.
- Active photo hydration excludes photos already claimed by outbox items.
- Sync Queue no longer claims there is a signature when signature capture is deferred.

Dev mode is active when `EXPO_PUBLIC_BACKEND_URL` is unset:

- any username works
- code `000000` signs in
- dispatch sync is mocked with 800 ms latency and 15% simulated failure

Keep dev mode working.

## Hard Requirement

Do not remove or bypass the offline outbox. Real backend sync must run through the same outbox path so delivered/skipped actions still survive no-signal job sites and cold app restarts.

## Main Blocker

The current LiveEdge web auth is NextAuth/cookie-oriented. Mobile needs a bearer-token response. Before assuming real auth works, implement or confirm a mobile OTP verify endpoint that returns:

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

The mobile placeholder currently calls:

```ts
POST /api/auth/verify-otp
```

Do not treat this endpoint as real unless you verify it exists and returns the required shape.

## Implementation Order

### 1. Verify Phase 4 Quickly

From `mobile-app/`:

```bash
npm run type-check
npm start
```

In dev mode:

- login with any username + `000000`
- pick Grimes
- capture 2 photos on stop `102-44947`
- toggle offline or block network if possible
- mark delivered
- verify Sync Queue behavior and persistence after app restart

### 2. Mobile Auth Contract

If root Next.js work is needed, keep it minimal and explicit:

- add a dedicated mobile OTP verify API route
- verify OTP against the same data used by web auth
- return a bearer token/JWT and user payload
- do not break web NextAuth

Mobile files likely involved:

- `mobile-app/src/api/auth.ts`
- `mobile-app/src/context/AuthContext.tsx`
- `mobile-app/src/types/index.ts`

After auth is real, make sure `src/api/dispatch.ts` attaches the returned token to real dispatch/route/POD requests. Do not remove dev-mode behavior.

### 3. Route Data Hook

Add a mapper/hook instead of wiring raw API data directly into screens.

Suggested files:

```text
mobile-app/src/data/routeMapper.ts
mobile-app/src/hooks/useDriverRoute.ts
mobile-app/src/api/dispatch.ts
mobile-app/src/app/(app)/route-list.tsx
mobile-app/src/app/(app)/[soNumber]/details.tsx
mobile-app/src/app/(app)/[soNumber]/customer.tsx
mobile-app/src/app/(app)/sync-queue.tsx
```

Pattern:

- if `IS_DEV_MODE`, return `MOCK_STOPS`
- otherwise fetch `/api/dispatch/routes?date=YYYY-MM-DD&branch=CODE`
- normalize real stops into the current UI stop shape
- keep screens rendering a stable app-level type
- handle loading, error, empty-route, and pull-to-refresh states explicitly

### 4. Delivery/POD Sync

Current outbox items contain local `file://` photo URIs. These are not useful to the server directly.

Real sync likely needs:

1. upload photos to `/api/dispatch/orders/[so]/pod` or presigned R2
2. mark delivered/skipped at `/api/dispatch/orders/[so]/deliver`
3. mark outbox item `synced` only after required server writes succeed

Put this orchestration in `src/api/dispatch.ts` or a small helper called by `src/storage/sync.ts`. Keep `sync.ts` focused on retry/backoff/outbox iteration.

Important: `sync.ts` currently does not know about auth tokens. Decide whether to pass the active session token into the sync layer, expose a token provider, or move server sync orchestration into a context that has auth access. Avoid importing React context directly into storage modules.

### 5. Reconciliation

After successful sync:

- refresh route data when online
- show server state plus pending local overrides
- avoid showing an item as durably synced if backend still reports pending

## Do Not Spend Time On Yet

- real maps before real route data
- per-job contacts table
- signature capture
- barcode scanning
- broad UI redesign

## Verification

At minimum:

```bash
cd mobile-app
npm run type-check
```

Also run:

```bash
git diff --check
```

`npm run lint` currently fails because the mobile package has no ESLint config. Do not present lint as a passing gate unless you add/configure it deliberately.

## Commit Guidance

Stay on `claude/mobile-app-mvp`; do not create a new branch unless asked.

Use a conventional commit. Example:

```text
feat(mobile-app): start Phase 5 real backend integration
```

Push to `origin/claude/mobile-app-mvp` when complete.
