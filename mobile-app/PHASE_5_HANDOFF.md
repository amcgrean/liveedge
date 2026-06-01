# Mobile App — Phase 5 + SO Lookup + Sales Live · Phase 6 Handoff

> Current as of 2026-06-01 after PRs #456 / #457 / #469 / #473 / #475 / #477.
> Replaces the prior Phase 5 handoff. Full Phase 1–4 history in `PHASE_4_HANDOFF.md`.

## TL;DR

Phases 1–5 + SO lookup + claim + sales experience + pricing capability gate
all in `main` and live against `app.beisser.cloud`. The Expo app is a single
binary with a role-switcher (`RoleContext`) gating two experiences: driver
POD and sales lookup/quote/order.

Dev mode (`000000` login + `MOCK_STOPS`) still works when `EXPO_PUBLIC_BACKEND_URL`
is unset, so any future agent can hack offline.

Phase 6 is real maps + GPS-aware ETAs.

## What's Live (Phases 1–5)

| Phase | Status | Notes |
|---|---|---|
| 1 — Scaffolding & dev OTP auth | ✅ | Expo SDK 54, Expo Router, TS, SecureStore session |
| 2 — Mock route + delivery details | ✅ | `route-list`, `[soNumber]/details`, `[soNumber]/customer` |
| 3 — Mark delivered/skipped | ✅ | toasts, Sync Queue, photoStore |
| 4 — Offline outbox + sync engine | ✅ | AsyncStorage outbox, 5-attempt backoff, post-sync cleanup |
| 5 — Real backend wiring | ✅ (PR #456) | JWT auth, real routes, two-phase POD upload, reconciliation |
| 5+ — SO lookup + claim | ✅ (PR #457) | Search icon → numpad → `/orders/[so]` lookup → claim creates ad-hoc per-user-per-day stop |
| 5+ — Agility-side dispatch reality | ✅ (PR #469) | Lookup joins `agility_shipments` for real driver/ship_date/route_id_char (dispatch_route_stops mostly empty for real loads) |
| 5+ — Sales experience | ✅ (PR #473) | Role-gated; tabs Home/Orders/Customers/Items/Profile; new order + quote flows; role-switch screen |
| 5+ — Numpad + customer line items | ✅ (PR #475) | Custom big-button numpad (no OS keyboard = no freeze on `router.replace`). Customer sheet fetches real `/orders/[so]/lines` |
| 5+ — Pricing cap gate + UOM labels | ✅ (PR #477) | `pricing.view` capability strips $ server-side for drivers. JOIN `agility_items.display_uom` to show "Each"/"BF" instead of FK pointer |

### Phase 5 — what landed

**Backend (Next.js app):**
- `POST /api/auth/mobile/verify-otp` — validates the OTP against `otp_codes`, returns `{ user, token, expiresIn }` where `token` is an HS256 JWT signed with `AUTH_SECRET` (same secret as NextAuth). Added to the route-guards `public` allowlist.
- `src/lib/mobile-auth.ts` — ships `signMobileToken` / `verifyMobileToken` / `getMobileSession` / `requireSessionOrMobile`. The combined guard accepts EITHER a NextAuth cookie OR a Bearer JWT and enforces capabilities exactly like `requireCapability`. Added to `guardPatterns` in `docs/security-policy-routes.md`.
- `GET /api/dispatch/routes` — accepts Bearer; new `?include=stops` query embeds stops with denormalized customer/address from `agility_so_header`.
- `POST /api/dispatch/orders/[so]/deliver` — accepts Bearer; handles the mobile body shape `{ type, status, notes, timestamp, photo_keys[] }`; falls back to session branch + server-side stop lookup when caller is mobile.
- `POST /api/dispatch/orders/[so]/pod` — accepts Bearer (Agility signature push, unchanged otherwise).
- **NEW** `POST /api/dispatch/orders/[so]/pod/upload-url` — returns a 10-minute presigned R2 PUT URL keyed under `pod/<so>/<ts>-<rand>.<ext>`. Server-derived keys keep clients from overwriting existing objects.

**Mobile (Expo app):**
- `src/api/authToken.ts` — standalone token holder. AuthContext pushes on bootstrap/login/logout; axios interceptor attaches `Authorization: Bearer` to every request.
- `src/api/auth.ts` — `verifyOTP` now hits `/api/auth/mobile/verify-otp`. Dev mode unchanged.
- `src/data/routeMapper.ts` + `src/hooks/useDriverRoute.ts` — fetch + map. In dev mode the hook returns `MOCK_STOPS`. Otherwise it fetches `/api/dispatch/routes?date=…&branch=…&include=stops` and flattens to the `MockStop[]` shape. Server stops carry their backend ids via `stopId/routeId/shipmentNum/branchCode` for the deliver call.
- Six screens swapped off `findStop()`/`MOCK_STOPS`: `route-list`, `[soNumber]/details`, `/customer`, `/camera`, `/photos`, `sync-queue`.
- `mobile-app/src/storage/outbox.ts` — `OutboxItem.photoUploads?: { uri, remoteKey?, uploaded }[]`. Seeded on enqueue. Persisted incrementally as each photo PUT lands.
- `mobile-app/src/api/dispatch.ts` — `markDelivered(item: OutboxItem)` now runs the two-phase flow:
  1. for each `photoUploads[i].uploaded === false`, POST `/pod/upload-url`, then PUT the local file:// bytes; persist `remoteKey` immediately.
  2. POST `/deliver` with `{ type, status, notes, timestamp, photo_keys[] }`.
- `mobile-app/src/storage/sync.ts` — re-reads the outbox row before each attempt so resumed retries pick up partial progress. Photo cleanup still gated on the deliver 2xx, unchanged.
- Reconciliation overlay in `useDriverRoute`: pending outbox rows flip a server-side pending stop to delivered/skipped optimistically. Server-confirmed terminal states (`delivered`/`skipped`) are authoritative. Synced rows are removed by `sync.ts` so the hook never has to.

### Phase 5 — verification status

- `cd mobile-app && npm run type-check` — clean ✅
- Backend `npx tsc --noEmit` (filtered for pre-existing unrelated errors) — clean ✅
- CI `check-route-guards` — passing 228/228 after policy update ✅
- **End-to-end smoke test on a real device with prod-like backend** — NOT YET RUN. Needs user-driven testing.

## Phase 5 Follow-ups (small, incremental)

These were discovered during Phase 5 implementation. None are blockers for shipping the PR.

1. **POD photo persistence on the backend.** `/deliver` currently `console.log`s the received `photo_keys[]` and treats them as audit-only — there's no `pod_photos` table yet. Decide whether to:
   - Add a `bids.pod_photos` table with `{ so_number, stop_id, r2_key, uploaded_at, uploaded_by }` and let dispatch view them, OR
   - Push them into Agility via `podSignatureCreate` (currently signature-only) once Agility's POD photo API surface is understood.
2. **Mobile dispatch capability for non-admin drivers.** `ROLE_DEFAULTS.driver` already includes `dispatch.view`. Confirm in `app_users` that real driver accounts have the `driver` role assigned. If not, either add it or grant via `granted_capabilities`.
3. **Branch handling for drivers without a branch.** `useDriverRoute` defaults to `'20GR'` if `user.branch` is unset. The backend `requireSessionOrMobile` + dispatch routes derive branch from session. For a multi-branch driver, today's UX shows one branch at a time — the existing branch-select screen handles the switch.
4. **`MockStop.items` is hardcoded to 0 in real mode.** Server response doesn't carry line counts. Either join `agility_so_lines` for a count on the route fetch or fetch lazily per-stop when the user expands a card.
5. **Per-photo upload concurrency.** Currently sequential. With 5 photos × 2 MB the slowest path is ~5–10 s on a marginal LTE connection. Could parallelize 2–3 at a time later.
6. **Photo size cap / compression.** `expo-camera` produces full-resolution JPEGs (~3–5 MB each). Consider an in-app compress-before-upload step (`expo-image-manipulator`) to keep PUT durations bounded.
7. **UOM master mirror.** Customer-sheet fix uses `agility_items.display_uom` + numeric-only suppression. Full fix is mirroring Agility's UOM master into `public.agility_uoms` (Pi sync agent) then sweeping the web for raw `price_uom_ptr` rendering. CLAUDE.md Pending Action #18.
8. **Pricing capability sweep.** `pricing.view` gate is on `/orders/[so]/lines` only. Other `$`-returning endpoints reachable from a Bearer token (`/api/sales/orders/[so]`, `/api/warehouse/orders/[so]`, dispatch timeline, scorecard, etc.) should mirror the strip-on-server pattern. CLAUDE.md Pending Action #19.
9. **JWT cap freshness.** Capability list is baked into the JWT at login. When a new capability is added (like `pricing.view`), existing tokens don't carry it — users have to sign out + back in. No refresh-token flow today; if cap turnover becomes a thing, add one.
10. **Route-list refresh on focus.** `useDriverRoute` fetches on mount + pull-to-refresh, but doesn't refetch when the screen regains focus. A driver returning from the customer sheet sees cached data. Wire `useFocusEffect` if staleness becomes an issue.

## Phase 6 — Real Maps + GPS-Aware ETAs

Defer until Phase 5 is verified in production with at least one real driver day.

### Goal

Replace the `MapPlaceholder` and "MAP" FAB with a working map showing:
- the driver's current GPS position
- all today's stops as pins, color-coded by status
- a polyline for the planned route (next pending stop highlighted)
- per-stop ETA computed from current position + remaining stops + branch warehouse return

### Open decisions

| Question | Options | Lean |
|---|---|---|
| Map provider | Mapbox · Google Maps · Apple MapKit (iOS) + Google (Android) · OSM tiles | **react-native-maps** (Apple+Google native) is the lowest-friction; defer Mapbox until styling/offline are real needs |
| Stop coords | Geocode on the backend at route-generation time, stash in `dispatch_route_stops` · Or geocode on the mobile client | **Backend** — Pi geocoder already produces `agility_customers.lat/lon`; the routes API just needs to expose them per stop |
| GPS source | Expo `expo-location` foreground · `expo-task-manager` background tracking | **Foreground only** for v6; background tracking requires App Store privacy disclosures we don't have yet |
| ETA math | Straight-line haversine + ~30 mph constant · Google Distance Matrix API · Mapbox Directions | **Haversine first** (zero deps, instant). Upgrade if it's noticeably off |

### Recommended implementation order

1. **Backend** — extend `/api/dispatch/routes?include=stops` to return `lat`/`lon` per stop (already on `agility_customers`). LiveEdge web already uses these on the dispatch map.
2. **Mobile** — install `react-native-maps`, replace `MapPlaceholder` with a real map. Pin component reuses the existing status colors.
3. **GPS** — `expo-location` foreground permission flow. Surface "GPS off" + "GPS unavailable" states inline. Don't auto-track location for a driver who hasn't opted in.
4. **ETA** — write a pure helper (`src/lib/eta.ts`) that takes `{ currentPos, remainingStops, returnTo }` and returns per-stop ETAs. Display next-stop ETA on the route-list header (replacing the static "Est. complete" line).
5. **MAP FAB** — open a full-screen map modal that pans/zooms to fit all stops. Tap a pin to navigate to that stop.

### Phase 6 non-goals

- Background location tracking (privacy + App Store review)
- Turn-by-turn navigation (defer to native maps app handoff)
- Optimal route reordering (dispatch decides order; mobile renders it)

## Phase 7+ Backlog (intentionally deferred)

These are in `README.md`'s "Future / Deferred" list. Re-evaluate after Phase 6 ships.

- **Per-job site contacts** (foreman, gate codes, hours, site access). Needs a new `job_contacts` table on the web side. Mobile screens already null-guard the optional fields.
- **Signature capture at door.** Currently the `/pod` endpoint accepts a signature blob but the app doesn't capture one. UX TBD — separate "Get signature" step before photos, or after delivered.
- **Barcode/QR scan.** For yard pickup and SO confirmation. `expo-camera` already in the app.
- **Push notifications.** Dispatch-initiated route updates ("stop added", "rerouted").
- **Driver chat with dispatch.** Lower priority than maps.

## Files To Avoid Unless Needed

- `src/components/ui/*` — design primitives are stable
- `src/theme/colors.ts` — palette is stable
- `(auth)/*` screens — auth contract is stable post-Phase 5
- Root Next.js app — only for concrete contract changes; Phase 6 will need one (`?include=stops` returning lat/lon)

## Commands

From `mobile-app/`:
```bash
npm run type-check
npm start                                       # alias: npx expo start
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000 npm start    # real backend mode
```

From repo root before committing:
```bash
git status --short
git diff --check
npm run check:route-guards     # any new app/api/**/route.ts must satisfy this
```

## Known Stale / Historical Docs

- `mobile-app/TEST_PLAN.md` — broader than current automated coverage.
- `mobile-app/DEBUG_*`, `TEST_ENTRY_POINT*`, `SESSION_COMPLETE.txt` — historical artifacts from Phase 4 debug sessions; safe to ignore.
- `mobile-app/PHASE_4_HANDOFF.md` — superseded by Phase 5's completion but kept for the outbox/sync architecture detail.
- `docs/agent-prompts/mobile-app-phase-5-real-backend.md` — the prompt that produced this work. Superseded by this doc.

## Completion Criteria — Phase 5 ✅

All met as of PR #456:

- ✅ mobile can request OTP against real backend (`/api/auth/send-otp`)
- ✅ mobile can verify OTP and receive a JWT (`/api/auth/mobile/verify-otp`)
- ✅ route list loads real assigned stops for the selected branch/date
- ✅ detail/customer screens render real stop data without Brenneman-only mock fields
- ✅ delivered/skipped actions sync to real backend
- ✅ POD photos upload durably via presigned R2 PUTs (resumable)
- ✅ offline outbox still works across app restarts
- ✅ sync queue accurately shows pending/retrying/failed actions
- ✅ dev mode still works with `EXPO_PUBLIC_BACKEND_URL` unset
- ✅ `npm run type-check` passes
- ✅ `npm run check:route-guards` passes
