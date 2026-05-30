# Phase 4 Handoff — Offline Sync Engine

> Handoff doc for the next coding agent (Codex or another Claude session). Self-contained — you don't need to read prior chat history.

> Status update: Phase 4 was implemented in commit `c416d009` on `claude/mobile-app-mvp`. Keep this file as historical implementation context; use `docs/MOBILE_APP.md` and `mobile-app/README.md` for the current gameplan.

---

## Project context (one paragraph)

`mobile-app/` is an Expo SDK 54 React Native app for Beisser Lumber delivery drivers. It lives in a monorepo with a Next.js web app at the project root. The mobile app is **independent** — it consumes existing LiveEdge API endpoints (`/api/auth/send-otp`, `/api/dispatch/routes`, `/api/dispatch/orders/[so]/deliver`, `/api/dispatch/orders/[so]/pod`) but is otherwise decoupled. **Do not touch the Next.js project** unless asked.

Routes use Expo Router (file-based, mirrors Next.js App Router). State so far is local React state + a tiny module-scoped photo store. Styling is all `StyleSheet` (no NativeWind). Colors live in `src/theme/colors.ts`. Icons via `react-native-svg` wrapper in `src/components/ui/Icon.tsx`.

---

## Status: what's built (don't redo this)

| Screen | File | Status |
|--------|------|--------|
| Splash | `src/app/splash.tsx` | ✅ Beisser-green hero with logo |
| Login | `src/app/(auth)/login.tsx` | ✅ Username entry, calls `requestOTP` |
| OTP entry | `src/app/(auth)/otp.tsx` | ✅ 6-box code, resend timer, calls `verifyOTP`, navigates to branch-select |
| Branch picker | `src/app/(auth)/branch-select.tsx` | ✅ 4 yards w/ colored dots |
| Route list | `src/app/(app)/route-list.tsx` | ✅ Reads `MOCK_STOPS`, expandable cards, progress bar, pull-to-refresh, MAP FAB (non-functional) |
| Delivery details | `src/app/(app)/[soNumber]/details.tsx` | ✅ Map placeholder, alert box, photo grid, notes, order row, Call FAB, Skip/Deliver |
| Camera | `src/app/(app)/[soNumber]/camera.tsx` | ✅ `expo-camera` viewfinder, multi-photo capture, writes to `photoStore` (in-memory only) |
| Customer sheet | `src/app/(app)/[soNumber]/customer.tsx` | ✅ Bottom-sheet modal, primary/site contacts, gate code highlight, line items |
| Route complete | `src/app/(app)/route-complete.tsx` | ✅ Gradient hero, stats grid, yard return checklist |
| Sync queue | `src/app/(app)/sync-queue.tsx` | 🟡 Uses hardcoded mock data — **needs to be wired to real outbox in Phase 4** |
| Profile | `src/app/(app)/profile.tsx` | ✅ Gradient avatar, branch chip, settings rows, logout |

**Dev-mode auth** in `src/api/auth.ts` activates when `EXPO_BACKEND_URL` env var is unset (always, currently). Any username + code `000000` signs in as `Dev Driver` at branch `20GR`.

**Shared UI primitives** (`src/components/ui/`):
- `Icon.tsx` — 24 SVG icons; `<Icon name="check" size={20} color={C.green} strokeWidth={2.4} />`
- `Pill.tsx` — status pills (`kind="pending|delivered|skipped|inroute"`)
- `BigButton.tsx` — 56pt-tall buttons (`kind="primary|primaryDim|danger|secondary|ghost"`, `icon`, `loading`, `fullWidth`, `style`)
- `Wordmark.tsx` — LiveEdge logo
- `AppStatusBar.tsx` — top bar with branch dot + ONLINE/OFFLINE chip + avatar
- `MapPlaceholder.tsx` — hand-drawn SVG map (not real maps yet)

**Theme** (`src/theme/colors.ts`): `C.green=#006834`, `C.gold=#9e8635`, `C.text=#111827`, status colors `C.ok|warn|err` with `*Soft` variants, branch dot colors. `BRANCHES` array with 4 yards. `BranchCode` union type.

**Mock data** (`src/data/mockRoute.ts`): `MOCK_STOPS` array of 8 stops with detailed info on stop #04 (Brenneman Residence). `findStop(so)`, `stopIndex(so)`.

**Photo store** (`src/data/photoStore.ts`): in-memory, module-scoped `Record<string, string[]>` keyed by SO. `photoStore.add/remove/get/clear/subscribe`, `usePhotos(so)` hook. **This is what Phase 4 replaces with persistent storage.**

---

## What Phase 4 must deliver

The driver currently has **no persistence**. If the app is killed mid-delivery, all photos and the pending "Mark Delivered" action are lost. They also can't see real online/offline state — the top bar always says ONLINE. Phase 4 fixes both, plus wires up the sync queue screen.

### Deliverables checklist

- [ ] **4.1** Network detector hook (`@react-native-community/netinfo`)
- [ ] **4.2** Persistent photo storage on the device filesystem (`expo-file-system`)
- [ ] **4.3** Persistent outbox in AsyncStorage (`@react-native-async-storage/async-storage`)
- [ ] **4.4** Toast notification system
- [ ] **4.5** Wire delivery details "Mark Delivered" / "Skip" to enqueue into outbox + toast
- [ ] **4.6** Background sync engine with exponential backoff
- [ ] **4.7** Real `AppStatusBar` online/offline state via context
- [ ] **4.8** Sync queue screen reads real outbox (retry / view / discard)

All 8 dependencies are already installed in `package.json`. Don't `npm install` anything new.

---

## Detailed implementation plan

### 4.1 — Network detector

Create `src/hooks/useOnline.ts`:

```ts
import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    NetInfo.fetch().then((state) =>
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false))
    );
    return unsub;
  }, []);
  return online;
}
```

Use it in `route-list.tsx`, `profile.tsx`, `sync-queue.tsx` — replace the hardcoded `online={true}` prop on `<AppStatusBar>` with `online={useOnline()}`.

### 4.2 — Photo persistence

Create `src/storage/photoFS.ts`. Photos currently captured by `expo-camera` return a `file://` URI that lives in the app's *cache* directory — those can be wiped by the OS. We need to copy them to the *document* directory (persistent) and key them by SO.

```ts
import * as FileSystem from 'expo-file-system/legacy';

const ROOT = FileSystem.documentDirectory + 'pod-photos/';

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ROOT);
  if (!info.exists) await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

export async function savePhotoForStop(soNumber: string, sourceUri: string): Promise<string> {
  await ensureDir();
  const filename = `${soNumber}-${Date.now()}.jpg`;
  const destUri = ROOT + filename;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

export async function deletePhoto(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn('[photoFS] delete failed', e);
  }
}

export async function listSavedPhotos(soNumber: string): Promise<string[]> {
  await ensureDir();
  const all = await FileSystem.readDirectoryAsync(ROOT);
  return all
    .filter((name) => name.startsWith(`${soNumber}-`))
    .map((name) => ROOT + name)
    .sort();
}
```

Note: import path is `expo-file-system/legacy` — the v19 default export removed the synchronous API we want.

**Update `src/data/photoStore.ts`** to use `photoFS`:
- Replace the in-memory `photosBySo` with a hydrated-from-disk cache
- On startup, scan `pod-photos/` for each stop and populate
- `add(so, uri)` now `await savePhotoForStop(so, uri)` and stores the persistent URI
- `remove(so, idx)` now `await deletePhoto(uri)` first

Make sure the `photoStore.add` is awaited in `camera.tsx`'s `handleShutter`.

### 4.3 — Persistent outbox

Create `src/storage/outbox.ts`. (There's an old version of this file — **delete it and start fresh**. It imported types that no longer match what we need.)

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OutboxItemStatus = 'queued' | 'retrying' | 'failed' | 'synced';

export interface OutboxItem {
  id: string;                 // UUID
  soNumber: string;
  type: 'deliver' | 'skip';
  notes: string;
  photoUris: string[];        // persistent file:// URIs
  createdAt: number;          // ms epoch
  status: OutboxItemStatus;
  attempts: number;
  lastError?: string;
  nextRetryAt?: number;
  syncedAt?: number;
}

const KEY = 'liveedge.outbox.v1';

type Listener = () => void;
const subs = new Set<Listener>();
let cache: OutboxItem[] = [];
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  loaded = true;
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  subs.forEach((fn) => fn());
}

export const outbox = {
  async init(): Promise<void> { await load(); },

  async all(): Promise<OutboxItem[]> {
    await load();
    return [...cache].sort((a, b) => b.createdAt - a.createdAt);
  },

  async enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<OutboxItem> {
    await load();
    const newItem: OutboxItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      status: 'queued',
      attempts: 0,
    };
    cache = [newItem, ...cache];
    await persist();
    return newItem;
  },

  async update(id: string, patch: Partial<OutboxItem>): Promise<void> {
    await load();
    cache = cache.map((it) => (it.id === id ? { ...it, ...patch } : it));
    await persist();
  },

  async remove(id: string): Promise<void> {
    await load();
    cache = cache.filter((it) => it.id !== id);
    await persist();
  },

  pending(): OutboxItem[] {
    return cache.filter((it) => it.status !== 'synced');
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

import { useEffect, useState } from 'react';
export function useOutbox(): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const all = await outbox.all();
      if (alive) setItems(all);
    };
    refresh();
    const unsub = outbox.subscribe(refresh);
    return () => { alive = false; unsub(); };
  }, []);
  return items;
}
```

Call `outbox.init()` once at app startup in `src/app/_layout.tsx`:

```tsx
useEffect(() => { outbox.init(); }, []);
```

### 4.4 — Toast system

Create `src/context/ToastContext.tsx`. (There's an old version — **rewrite it.**) A toast slides down from the top, has a 3-second auto-dismiss, supports `success | error | info` variants.

Use `react-native`'s `Animated` for slide + fade. Wrap the root layout `<AuthProvider>` in `<ToastProvider>` so any screen can call `useToast().show('Synced ✓', 'success')`.

Keep the API minimal:

```ts
interface ToastAPI {
  show(message: string, kind?: 'success' | 'error' | 'info'): void;
}
```

Render the toast in a `<View>` positioned `absolute, top: 60` over the entire tree, using `pointerEvents="box-none"` so it doesn't block taps below.

### 4.5 — Wire delivery details

In `src/app/(app)/[soNumber]/details.tsx`:

**`handleMarkDelivered`** — currently shows an Alert and routes. Replace with:

```tsx
const { show } = useToast();
const online = useOnline();

const handleMarkDelivered = async () => {
  if (photos.length < MIN_PHOTOS) {
    Alert.alert('Photos required', `Capture at least ${MIN_PHOTOS} photos.`);
    return;
  }
  const item = await outbox.enqueue({
    soNumber,
    type: 'deliver',
    notes,
    photoUris: photos,
  });
  show(
    online ? 'Delivery saved · syncing' : 'Saved offline · will sync later',
    'success'
  );
  // Photos are owned by the outbox item now; clear from active store
  photoStore.clear(soNumber);
  const isLast = idx === MOCK_STOPS.length - 1;
  if (isLast) {
    router.replace('/(app)/route-complete');
  } else {
    router.back();
  }
};
```

**`handleSkip`** — similar, but `type: 'skip'` and `photoUris: []`. Prompt for a reason via `Alert.prompt` (iOS only — for Android fall back to a state var + modal, or skip Android polish for now).

### 4.6 — Background sync engine

Create `src/storage/sync.ts`. (There's an old version — **rewrite it.**) Strategy:

- Module-scope `running = false` guard so we don't double-fire.
- `runSync()` iterates `outbox.pending()`, calls `dispatchAPI.markDelivered(item.soNumber, ...)` per item (`src/api/dispatch.ts` exists but is stubbed — see note below).
- On success → `outbox.update(id, { status: 'synced', syncedAt: Date.now() })`.
- On failure → bump `attempts`, set `nextRetryAt = now + backoffMs(attempts)` where `backoffMs(n) = [1_000, 5_000, 30_000, 60_000, 300_000][Math.min(n, 4)]`. After 5 attempts, status = `'failed'`.
- Skip items whose `nextRetryAt > now`.

Trigger `runSync()`:
1. On every `online` flip from false → true (subscribe inside the sync engine, or expose a public `syncNow()` that the `useOnline` hook calls)
2. On every `outbox.enqueue` (subscribe to outbox)
3. On a `setInterval(30_000)` heartbeat while the app is foregrounded

Dev mode: `src/api/dispatch.ts` is currently a stub. For Phase 4, add a `DEV_MODE` mock (same pattern as `src/api/auth.ts`) that simulates success after 800ms. That way we can test the queue → sync → "Synced ✓" flow without a real backend.

```ts
export async function markDelivered(soNumber: string, body: DeliverBody): Promise<void> {
  if (DEV_MODE) {
    await new Promise((r) => setTimeout(r, 800));
    if (Math.random() < 0.15) throw new Error('Simulated network error');
    return;
  }
  await client.post(`/api/dispatch/orders/${soNumber}/deliver`, body);
}
```

The 15% failure rate is intentional — it lets you watch the queue retry visually during testing.

### 4.7 — Real online/offline in AppStatusBar

The `AppStatusBar` component already takes `online` + `syncCount` props. Just need the parent screens to pass the right values.

Sub `online={useOnline()}` and `syncCount={useOutbox().filter(i => i.status !== 'synced').length}` in:
- `route-list.tsx`
- `profile.tsx`
- `sync-queue.tsx`

### 4.8 — Sync queue screen wired to real outbox

`src/app/(app)/sync-queue.tsx` currently uses a hardcoded `MOCK_QUEUE`. Replace with `useOutbox()`. Format each `OutboxItem` into the existing card layout:
- `stop` → look up via `findStop(item.soNumber)?.n ?? '??'`
- `name` → `findStop(item.soNumber)?.name ?? item.soNumber`
- `time` → `format(item.createdAt, 'h:mm a')`
- `photos` → `item.photoUris.length`
- `status` → `'retrying' | 'failed' | 'queued'` from `item.status`
- `tries` → `item.attempts`

Wire the per-card **Retry** button to `outbox.update(id, { status: 'queued', nextRetryAt: undefined })` then `syncNow()`. Wire the bottom **Retry All** button to do the same for all pending items.

Add a per-card **Discard** option (long-press or kebab menu) that calls `outbox.remove(id)` + deletes the associated photo files via `photoFS.deletePhoto`.

---

## Testing checklist (run after building)

In iOS simulator with the app open:

- [ ] Sign in, pick Grimes, see route list → top bar shows ONLINE
- [ ] Toggle simulator network off (Settings → Developer → Network Link Conditioner → 100% Loss, or Mac Wi-Fi off entirely) → top bar should flip to OFFLINE within ~3s
- [ ] Open stop #04 Brenneman → take 2 photos → tap Mark Delivered
- [ ] Toast shows "Saved offline · will sync later"
- [ ] Sync queue chip in top-right shows badge "1"
- [ ] Open Profile → Sync Queue → see Brenneman as a Queued item
- [ ] Turn network back on → after ~30s (or sooner), item transitions Queued → Retrying → either Synced (vanishes after a beat) or Failed (intentional 15% sim)
- [ ] Toast briefly shows "Synced ✓" when item completes
- [ ] Kill the app cold (swipe up in simulator), reopen → outbox state is preserved (any in-flight queued items still there)
- [ ] Delete the simulator's app entirely → reinstall → outbox is empty (clean slate)

---

## Files to create

```
mobile-app/src/hooks/useOnline.ts                  NEW (mkdir -p src/hooks first)
mobile-app/src/storage/photoFS.ts                  NEW (mkdir -p src/storage first)
mobile-app/src/storage/outbox.ts                   NEW (skeleton in §4.3)
mobile-app/src/storage/sync.ts                     NEW (skeleton in §4.6)
mobile-app/src/context/ToastContext.tsx            NEW (skeleton in §4.4)
```

Note: the old versions of those files were dead stubs and have been deleted.

## Files to modify

```
mobile-app/src/app/_layout.tsx                     Wrap in <ToastProvider>; call outbox.init()
mobile-app/src/data/photoStore.ts                  Persist via photoFS
mobile-app/src/app/(app)/[soNumber]/details.tsx    Wire to outbox + toast
mobile-app/src/app/(app)/[soNumber]/camera.tsx     Await persisted photoStore.add
mobile-app/src/app/(app)/route-list.tsx            useOnline + useOutbox for status bar
mobile-app/src/app/(app)/profile.tsx               Same
mobile-app/src/app/(app)/sync-queue.tsx            Real outbox data + retry actions
mobile-app/src/api/dispatch.ts                     Add DEV_MODE mock with 15% failure
```

## Files NOT to touch

- Anything outside `mobile-app/`
- `mobile-app/src/components/ui/*` (design system is final for this phase)
- `mobile-app/src/theme/colors.ts`
- `mobile-app/src/data/mockRoute.ts`
- All `(auth)/*` screens
- `route-complete.tsx`, `customer.tsx`

---

## Gotchas

1. **`expo-file-system` v19 changed its API.** Use `import * as FileSystem from 'expo-file-system/legacy'` for the old synchronous-ish API. The new API uses class-based `File` objects which would require a deeper rewrite.

2. **Dead stub files (`outbox.ts`, `sync.ts`, `ToastContext.tsx`, `SyncContext.tsx`, `useDeliveryUpdate.ts`, `usePhotoCapture.ts`, `Toast.tsx`, `PhotoCamera.tsx`, `PhotoGrid.tsx`, `SyncStatus.tsx`) have been deleted in commit `db6b5fa`.** Create the new versions from scratch using the skeletons in section 4.1–4.4 above.

   The directory `src/storage/` and `src/hooks/` were removed when empty — recreate them with `mkdir -p` if you want to put files there, or pick a different home (e.g. `src/lib/`).

3. **`@/types/index.ts` is shared with auth.** Keep `User`, `AuthSession` intact. You can add `OutboxItem` etc. in `src/storage/outbox.ts` itself rather than polluting the types barrel.

4. **`Alert.prompt` for skip reason is iOS-only.** For Phase 4 just check `Platform.OS === 'ios'` and use it; on Android, use a hardcoded reason "Skipped by driver" for now. Polish later.

5. **Don't burn cycles on the MAP FAB or real maps.** That's Phase 5.

6. **Don't connect to a real backend yet.** Dev mode mocks are sufficient for Phase 4. The whole point of this phase is to prove the offline-first plumbing works locally.

   When you do hook up the real backend (Phase 5), note that `src/api/client.ts` now reads `EXPO_PUBLIC_BACKEND_URL` (Expo only inlines `EXPO_PUBLIC_*` envs), and `src/api/auth.ts` has TODO markers for the actual backend contract — currently the verify endpoint is a guess (`/api/auth/verify-otp`) because LiveEdge's NextAuth provider sets a cookie, not a JWT. A dedicated mobile auth endpoint will likely need to be added on the web side.

7. **Camera permission flow already works** — don't re-implement it. Just make sure your awaited `photoStore.add(so, uri)` in `handleShutter` (camera.tsx) keeps the immediate visual feedback (thumbnail strip updates).

---

## When done

Commit on the current branch `claude/mobile-app-mvp` (NOT a new branch — keep stacked on the open PR #445). Use a conventional commit message:

```
feat(mobile-app): Phase 4 — offline sync engine + persistent outbox

[bullet list of what landed]
```

Then push and let CI run. The user will manually merge PR #445 when they're satisfied.

Good luck.
