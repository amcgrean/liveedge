# Phase 6 — Mobile App: Real Maps + GPS-Aware ETAs

You are picking up Phase 6 of the LiveEdge driver mobile app. Phases 1–5 + SO lookup + sales experience + pricing capability gate + UOM display labels are **already merged to `main`** (PRs #445, #454, #456, #457, #469, #473, #475, #477). Start a fresh branch from current `main`.

> Self-contained brief — you don't need to read prior chat history. Supporting docs to scan if you want more context: `mobile-app/PHASE_5_HANDOFF.md` (current "what's live + what's next"), `CLAUDE.md` "Mobile App — Driver POD + Sales" section, and the previous prompt at `docs/agent-prompts/mobile-app-phase-5-real-backend.md` (historical, superseded by this Phase 6 prompt).

---

## TL;DR

Replace the placeholder map and FAB with a working map experience:

1. **Stop coordinates from the backend** — expose `lat`/`lon` per stop on `/api/dispatch/routes?include=stops` (already in `agility_customers`, just not surfaced)
2. **Real map** — `react-native-maps` on iOS+Android, replacing `MapPlaceholder`
3. **GPS** — foreground `expo-location` permission flow, current position pin
4. **ETA** — straight-line haversine helper that computes "next stop ETA" + total route ETA from current position
5. **Full-screen map modal** — tap the MAP FAB on route-list to see all today's stops on one map; pin tap navigates to that stop's details

**Hard requirement:** the offline outbox in `src/storage/outbox.ts` + sync engine in `src/storage/sync.ts` are unchanged territory — don't touch them. You're adding visualization on top of existing data, not changing how anything is persisted or synced.

**No background location tracking** — that requires App Store privacy disclosures we don't have. Foreground only for v6.

---

## Current state (don't redo)

| Layer | File | Status |
|---|---|---|
| Auth (JWT, OTP) | `mobile-app/src/api/auth.ts`, `src/lib/mobile-auth.ts` | ✅ Live since Phase 5 |
| Driver route fetch | `mobile-app/src/hooks/useDriverRoute.ts` | ✅ Live; lat/lon not yet on response |
| SO lookup + claim | `mobile-app/src/app/(app)/lookup.tsx`, `useStopOrLookup.ts` | ✅ Live; numpad-driven |
| Delivery details | `mobile-app/src/app/(app)/[soNumber]/details.tsx` | ✅ Live; uses `<MapPlaceholder />` you'll replace |
| Customer sheet with real lines | `mobile-app/src/app/(app)/[soNumber]/customer.tsx` | ✅ Live |
| Pricing capability gate | `pricing.view` in `access-control-shared.ts`, `/dispatch/orders/[so]/lines` | ✅ Live |
| Sales experience | `mobile-app/src/app/(sales)/...` | ✅ Live (out of scope for Phase 6 — driver side only) |
| MapPlaceholder + MAP FAB | `mobile-app/src/components/ui/MapPlaceholder.tsx`, route-list FAB | 🟡 To be replaced |
| Outbox / sync / photoFS | `mobile-app/src/storage/{outbox,sync,photoFS}.ts` | ✅ Live — DO NOT TOUCH |

---

## Backend research (done — use these exact paths)

### Stop coords already exist in `agility_customers`

The Pi geocoder writes `lat` / `lon` to `public.agility_customers` (see `CLAUDE.md` "Geocoding Pipeline" section). LiveEdge web's dispatch board already plots these — see `src/components/dispatch/DispatchMap.tsx`. They just aren't on the mobile routes response yet.

The customer-side `(cust_key, shipto_seq_num)` resolution is what the dispatch routes query already does for customer name/address. Add `h_cust.lat`, `h_cust.lon` to the SELECT in the `include=stops` branch.

### Routes you need to MODIFY (small, additive)

**`app/api/dispatch/routes/route.ts`** — the GET handler's `include=stops` block currently selects:

```sql
SELECT s.route_id, s.id, s.so_id, s.shipment_num, s.sequence, s.status, s.notes,
       h.cust_name AS customer_name, h.cust_code,
       h.shipto_address_1 AS address_1, h.shipto_city AS city,
       h.shipto_state AS state, h.shipto_zip AS zip,
       h.reference, h.ship_via, h.so_status
FROM dispatch_route_stops s
JOIN dispatch_routes r ON r.id = s.route_id
LEFT JOIN agility_so_header h ON h.so_id = s.so_id AND h.system_id = r.branch_code
WHERE s.route_id = ANY(${routeIds})
```

Add a LATERAL join to `agility_customers` for `lat`/`lon` (key by `cust_key + shipto_seq_num`). The pattern already exists in CLAUDE.md's "AR balance query pattern" section — same shape, different fields:

```sql
LEFT JOIN LATERAL (
  SELECT lat, lon FROM agility_customers
  WHERE TRIM(cust_code) = TRIM(h.cust_code) AND seq_num = h.shipto_seq_num
    AND is_deleted = false
  LIMIT 1
) c ON true
```

Return `lat` and `lon` (NULL when missing — Pi geocoder hasn't matched ~10% of IA customers). Stops without lat/lon get rendered as "no coords" badges client-side, not pins.

**`app/api/dispatch/orders/[so_number]/route.ts`** — the SO lookup endpoint should also include `lat`/`lon` on the response so a single-stop view has them too. Same LATERAL pattern, key off `agility_customers` via `(cust_code, shipto_seq_num)`.

---

## Implementation order

### 1. Backend: add lat/lon to dispatch responses

Files:
- `app/api/dispatch/routes/route.ts` — add LATERAL to `agility_customers` in the `include=stops` block; return `lat?: number | null, lon?: number | null` per stop
- `app/api/dispatch/orders/[so_number]/route.ts` — same LATERAL, add `lat`/`lon` to the `so` payload

Smoke test:
```bash
curl "https://app.beisser.cloud/api/dispatch/routes?date=2026-06-01&include=stops" -H "Authorization: Bearer <token>" | jq '.routes[0].stops[0] | {so_id, address_1, lat, lon}'
```

### 2. Mobile: route mapper passes coords through

Files:
- `mobile-app/src/data/routeMapper.ts` — extend `ServerStop` type with `lat?: number | null, lon?: number | null`; pass through to the mapped `DriverStop`
- `mobile-app/src/data/mockRoute.ts` — extend `MockStop` with optional `lat?: number, lon?: number` so dev-mode mock stops can carry coords for testing. Add coords to a few of the existing entries (e.g. Holstead 4220 NW 86th St Urbandale ≈ 41.668, -93.722).

### 3. Mobile: install + wire `react-native-maps`

```bash
cd mobile-app
npx expo install react-native-maps expo-location
```

- iOS info.plist additions for location permission (via `app.json` → `expo.ios.infoPlist.NSLocationWhenInUseUsageDescription`): `"LiveEdge uses your location to show nearby stops and estimate delivery times."`
- Android: `expo-location` handles permissions via the manifest automatically when installed via `expo install`.

### 4. Build a `<RouteMap />` component

`mobile-app/src/components/ui/RouteMap.tsx` — new file:

- Wraps `<MapView>` from `react-native-maps`
- Props: `stops: DriverStop[]`, `currentStopSo?: string`, `userLocation?: { lat: number; lon: number }`, `onPinPress?: (so: string) => void`
- Renders a `<Marker>` per stop with `pinColor` derived from the existing status palette (pending grey, delivered green, skipped red, inroute amber)
- Shows the user's blue dot via `showsUserLocation={true}` + `showsMyLocationButton={true}` (foreground only)
- Auto-fits to show all stops on mount via `fitToCoordinates`
- Stops without lat/lon are filtered out before rendering — show a count of "N stops missing coords" elsewhere if the count is non-zero

### 5. Inline map on delivery details

Replace `<MapPlaceholder>` in `mobile-app/src/app/(app)/[soNumber]/details.tsx` with a constrained-height `<RouteMap stops={[stop]} currentStopSo={stop.so} />`. Show "No coords for this stop" when `lat/lon` are null instead of a broken map.

### 6. Full-screen map modal

New screen `mobile-app/src/app/(app)/route-map.tsx`:
- `<Stack.Screen name="route-map" options={{ presentation: 'modal' }} />` in `(app)/_layout.tsx`
- Uses `useDriverRoute()` to get all today's stops + current GPS
- Tap a pin → close modal + push details for that SO
- Wire from the existing MAP FAB on `route-list.tsx` (currently no-op): `onPress={() => router.push('/(app)/route-map')}`

### 7. ETA helper

Pure helper at `mobile-app/src/lib/eta.ts`:
```ts
export function haversineMiles(a: {lat: number; lon: number}, b: {lat: number; lon: number}): number
export function etaMinutes(distanceMiles: number, avgMph = 30): number  // simple
export function computeRouteETAs(opts: {
  currentPos: {lat: number; lon: number};
  remainingStops: DriverStop[];
  returnTo?: {lat: number; lon: number};  // optional warehouse return
  avgMph?: number;
}): { perStopMinutes: number[]; totalMinutes: number }
```

Display next-stop ETA in the route-list header (replace the static "Est. complete 3:40 PM" line). When GPS is unavailable, fall back to "—" — don't show stale estimates.

---

## Don't waste time on

- Background location tracking — App Store privacy disclosures, separate scope
- Turn-by-turn navigation — defer to Apple Maps / Google Maps handoff via `Linking.openURL('maps://?daddr=...')`
- Route optimization (reordering stops) — dispatch decides the order, mobile renders it
- Offline map tiles — `react-native-maps` uses Apple/Google tiles which require online. If a driver really goes offline mid-route, they have the address list already.
- Mapbox styling / custom map themes
- Real-time per-stop ETA updates from a routing engine — haversine + 30mph is the v6 spec. If it's noticeably wrong, swap to Google Distance Matrix in a follow-up.

---

## Verification

```bash
cd mobile-app
npm run type-check
```

End-to-end smoke test:
1. Get a Bearer token for a driver account (see `docs/agent-prompts/mobile-app-phase-5-real-backend.md` for the curl flow).
2. `cd mobile-app && EXPO_PUBLIC_BACKEND_URL=https://app.beisser.cloud npx expo start --ios`
3. Log in, pick a branch with real assigned stops.
4. Route list → tap a stop → details should show an inline map pinned to the stop (or "No coords" if Pi hasn't matched it).
5. Tap MAP FAB → full-screen map shows all stops + driver's blue dot.
6. Tap a pin → details for that SO opens.
7. Cold-kill app → reopen → outbox + sync still work (Phase 4 invariant).
8. Unset `EXPO_PUBLIC_BACKEND_URL` → restart Expo → dev mode still works with `000000` login and the few mock stops you added coords to.

---

## Commit guidance

Suggested commit boundaries:
1. `feat(api): expose stop lat/lon on /dispatch/routes + /orders/[so]` (backend only)
2. `feat(mobile-app): install react-native-maps + expo-location + permission strings`
3. `feat(mobile-app): RouteMap component + inline map on delivery details`
4. `feat(mobile-app): full-screen route map modal from MAP FAB`
5. `feat(mobile-app): haversine ETA helper + next-stop ETA on route list`

Each commit should leave the app in a working state. One PR with all five.

---

## Gotchas

1. **`react-native-maps` requires a development build, not Expo Go.** On iOS it ships native code. If the user is testing via Expo Go, you'll need to either (a) build a dev client via `eas build --profile development --platform ios` or (b) Aaron switches to a dev client install. Confirm before starting — Phase 5 was tested in Expo Go and the workflow doesn't carry over.

2. **iOS permission strings must be in `app.json` BEFORE the build**, not at runtime. Missing `NSLocationWhenInUseUsageDescription` crashes the app on first location request with no useful error.

3. **`expo-location` foreground permission may be denied or "restricted".** Always render a "Turn on location to see ETAs" CTA in the UI rather than crashing or showing stale data when permission is missing.

4. **Coords are NULL for some stops** — ~10% of IA customers haven't been geocoded by the Pi yet (per CLAUDE.md "Geocoding Pipeline" section, ~10K unmatched). Don't drop the stop from the route list when lat/lon is null — just skip the pin and show a "no coords" badge.

5. **The Pi geocoder occasionally writes wildly wrong coords for `geocode_source = 'sqlite_state_fuzzy'`** (see the 2026-05-18 incident in CLAUDE.md). If you see a stop pinned far from its address, check `geocode_source` on the customer row before assuming the matcher is fixed — the post-fix tier is zip3- or city-gated and shouldn't repeat, but verify.

6. **`react-native-maps` MapView height defaults to 0** — wrap in a flex container with explicit `style={{ height: 220 }}` or it renders invisibly.

7. **The route-list header ETA replaces a static string** — make sure the prop wiring through `<AppStatusBar>` or wherever it lives doesn't break the existing offline indicator + sync count badge.

---

## When done

- Open a PR titled `feat(mobile-app): Phase 6 — real maps + GPS-aware ETAs`
- PR description tag: "Replaces MapPlaceholder with react-native-maps; foreground GPS; haversine ETA helper"
- Confirm both real-mode + dev-mode smoke tests pass
- Update `mobile-app/PHASE_5_HANDOFF.md`: bump title to mention Phase 6 shipped; add a Phase 7+ section for the deferred items (background tracking, turn-by-turn handoff, distance matrix swap)
- Update CLAUDE.md "Mobile App" section to mention Phase 6 live

Good luck.
