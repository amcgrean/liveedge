# Mobile App Development Guide

## Overview

The **Beisser LiveEdge Driver App** is a React Native (Expo) mobile application for delivery drivers to:
- View assigned delivery routes
- Mark deliveries as complete or skipped
- Capture proof-of-delivery (POD) photos
- Sync offline updates when connectivity returns

**Tech Stack**: Expo SDK 54 (iOS + Android), React Native, TypeScript, Axios, React Native `StyleSheet`

**Status**: Mobile MVP through Phase 4 is implemented on PR #445. The app currently runs primarily in dev/mock mode; Phase 5 is real backend integration.

---

## Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g eas-cli`
- For iOS: Xcode command-line tools
- For Android: Android Studio or Android SDK

### Setup

```bash
cd mobile-app
npm install
cp .env.example .env.local
# Leave EXPO_PUBLIC_BACKEND_URL unset for dev-mode mocks, or set it to a real LiveEdge API base URL.
npm start
```

### Running on Device/Simulator

```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Web (for debugging)
npm run web
```

---

## Project Structure

```
mobile-app/
├── src/
│   ├── app/                      ← Expo Router pages (file-based routing)
│   │   ├── _layout.tsx           ← Root layout (auth/app routing)
│   │   ├── splash.tsx            ← Loading screen
│   │   ├── (auth)/               ← Auth-only routes
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx         ← Username entry / OTP request
│   │   │   ├── otp.tsx           ← Six-digit OTP entry
│   │   │   └── branch-select.tsx ← Yard picker
│   │   └── (app)/                ← Protected routes (require auth)
│   │       ├── _layout.tsx
│   │       ├── route-list.tsx    ← Today's deliveries list
│   │       └── [soNumber]/       ← Dynamic delivery detail
│   │           ├── _layout.tsx
│   │           ├── details.tsx   ← Mark delivered/skip, notes, POD photo grid
│   │           ├── camera.tsx    ← Camera capture
│   │           └── customer.tsx  ← Customer / site detail sheet
│   │
│   ├── api/                      ← API client modules
│   │   ├── client.ts             ← Axios instance + interceptors
│   │   ├── auth.ts               ← OTP login endpoints
│   │   └── dispatch.ts           ← Route + delivery endpoints
│   │
│   ├── context/                  ← React Context providers
│   │   ├── AuthContext.tsx       ← Global auth state + session storage
│   │   └── ToastContext.tsx      ← App-wide toast notifications
│   │
│   ├── storage/                  ← Local persistence and sync
│   │   ├── photoFS.ts            ← Persistent POD photo files
│   │   ├── outbox.ts             ← AsyncStorage delivery outbox
│   │   └── sync.ts               ← Retry/backoff sync engine
│   │
│   ├── hooks/                    ← Custom React hooks
│   │   └── useOnline.ts          ← NetInfo online/offline state
│   │
│   ├── components/ui/            ← Reusable UI primitives
│   │   ├── AppStatusBar.tsx      ← Branch + online/offline + sync badge
│   │   ├── BigButton.tsx         ← Primary action button
│   │   ├── Icon.tsx              ← SVG icon wrapper
│   │   ├── MapPlaceholder.tsx    ← Placeholder until real maps
│   │   ├── Pill.tsx              ← Status pills
│   │   └── Wordmark.tsx          ← LiveEdge wordmark
│   │
│   ├── types/                    ← TypeScript definitions
│   │   └── index.ts              ← Core types (User, Route, DeliveryStop, etc.)
│   │
│   └── utils/                    ← Utilities
│       └── date.ts               ← Date formatting helpers
│
├── app.json                      ← Expo config (permissions, icons, name)
├── eas.json                      ← EAS build config (App Store/Play Store)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Routing & Navigation

Uses **Expo Router** (file-based routing, similar to Next.js):

### Auth Routes (Unauthenticated Users)
- `/(auth)/login` — username entry / OTP request
- `/(auth)/otp` — OTP entry
- `/(auth)/branch-select` — yard picker

### App Routes (Authenticated Users)
- `/(app)/route-list` — today's route
- `/(app)/[soNumber]/details` — delivery details, notes, POD photos, status actions
- `/(app)/[soNumber]/camera` — camera capture
- `/(app)/[soNumber]/customer` — customer/site sheet
- `/(app)/sync-queue` — persistent outbox status and retry controls
- `/(app)/profile` — profile, settings, sync queue entry
- `/(app)/route-complete` — route completion checklist

**Navigation Flow**:
1. App detects no session → show `/login`
2. User logs in with OTP → stores token in SecureStore
3. User selects branch → app routes to `/(app)/route-list`
4. Tap a delivery → navigate to `/(app)/[soNumber]/details`
5. Mark delivered/skip → enqueue offline-first outbox item → auto-sync when online

---

## API Integration

### Authentication

**Current mode**

If `EXPO_PUBLIC_BACKEND_URL` is unset, the app runs in dev mode:
- any username can request a code
- OTP code `000000` signs in as `Dev Driver`
- dispatch sync is mocked with an intentional 15% simulated failure rate so retry UI can be tested

Real backend integration is Phase 5. LiveEdge's current web auth is NextAuth cookie-oriented, so mobile likely needs a dedicated JWT-returning verify endpoint before production API mode is useful.

**OTP Login Flow**

```typescript
// Step 1: Request OTP
POST /api/auth/send-otp
{
  "identifier": "john.doe@beisser.com"
}
→ { ok: true }

// Step 2: Verify OTP code
POST /api/auth/verify-otp  // Phase 5 mobile endpoint placeholder
{
  "identifier": "john.doe@beisser.com",
  "code": "123456"
}
→ {
    "user": { id, email, name, role, branch, ... },
    "token": "eyJhbGc...",
    "expiresIn": 604800  // 7 days in seconds
  }
```

**Token Storage**
- Stored in `expo-secure-store` (encrypted on device)
- Attached to all API requests: `Authorization: Bearer {token}`
- Refresh behavior is deferred until the Phase 5 backend contract is settled

### Dispatch Endpoints

All require `Authorization: Bearer {token}` header.

#### Fetch Route + Stops
```
GET /api/dispatch/routes?date=2026-04-26&branch=20GR

Response:
{
  "id": 1,
  "route_date": "2026-04-26",
  "route_name": "Route A",
  "driver_name": "John Doe",
  "branch_code": "20GR",
  "status": "in_progress",
  "stops": [
    {
      "so_number": "SO-12345",
      "customer_name": "ABC Contractors",
      "address": "123 Main St",
      "city": "Des Moines",
      "state": "IA",
      "zip": "50309",
      "status": "pending|delivered|skipped",
      "updated_at": "2026-04-26T10:30:00Z",
      "notes": "customer not ready"
    },
    ...
  ]
}
```

#### Get Stop Detail
```
GET /api/dispatch/orders/SO-12345

Response: { so_number, customer_name, address, city, state, zip, status, updated_at, notes }
```

#### Update Delivery Status
```
POST /api/dispatch/orders/SO-12345/deliver
{
  "type": "deliver|skip",
  "notes": "customer not ready",
  "timestamp": "2026-04-26T11:15:00Z",
  "photoUris": ["file:///.../pod-photos/SO-12345-...jpg"]
}

Response:
{
  "success": true,
  "updated_at": "2026-04-26T11:15:05Z",
  "synced_at": "2026-04-26T11:15:05Z"
}
```

#### Upload POD Photos (Phase 5 backend integration)
```
POST /api/dispatch/orders/SO-12345/pod
Content-Type: multipart/form-data

{
  "status": "delivered",
  "files": [image1.jpg, image2.jpg, ...],
  "timestamp": "2026-04-26T11:15:00Z"
}

Response:
{
  "success": true,
  "photo_ids": ["uuid1", "uuid2", ...],
  "uploaded_at": "2026-04-26T11:15:05Z"
}
```

---

## Development Phases

### ✅ Phase 1: Scaffolding & Auth
- Expo project initialized with TypeScript
- OTP login screen
- AuthContext for global session management
- SecureStore token persistence
- Splash screen during load

### ✅ Phase 2: Route Display & Navigation
- Route list screen (today's stops)
- Pull-to-refresh
- Delivery detail screen
- Stop information display

### ✅ Phase 3: Delivery Status Update
- Mark Delivered / Skip buttons
- Toast notifications
- Basic error handling

### ✅ Phase 4: Photo Capture + Offline Sync
- `expo-camera` integration
- Multi-photo support per delivery
- `@react-native-community/netinfo` for connectivity detection
- Persistent POD photo storage in the app document directory
- AsyncStorage outbox for pending deliveries, skips, notes, and photo URIs
- Toast notifications
- Real sync queue screen with retry, view, and discard actions
- Retry logic with exponential backoff

### ⏳ Phase 5: Real Backend Integration
- Add/settle a mobile JWT auth endpoint for OTP verification
- Replace mock route data with `GET /api/dispatch/routes`
- Map API route/stop payloads into the current driver UI shape
- Upload POD photos to the real `/pod` endpoint or a presigned R2 flow
- Reconcile server-side delivery state after outbox sync
- Add real map route/polyline support after live route data is available

### ⏳ Phase 6: Testing & Deployment
- End-to-end testing
- Performance optimization
- Accessibility review
- EAS build + App Store / Play Store submission
- CI/CD pipeline

---

## Environment Configuration

Create `.env.local` (copied from `.env.example`):

```env
# Backend API URL
# Leave unset for dev-mode mocks. Expo only inlines EXPO_PUBLIC_* variables.
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
# Or for production/staging: https://app.beisser.cloud

# API request timeout (ms)
EXPO_PUBLIC_API_TIMEOUT=30000
```

---

## Testing

### Manual Testing Checklist

- [ ] **Login**
  - [ ] Can request OTP with email
  - [ ] Receives code via email (in dev, check console)
  - [ ] Can enter code and sign in
  - [ ] Token persists on app restart

- [ ] **Route View**
  - [ ] Route + stops load within 2s
  - [ ] Stops sorted by sequence
  - [ ] Progress bar shows completion %
  - [ ] Pull-to-refresh works
  - [ ] Handles no-data state gracefully

- [ ] **Delivery Details**
  - [ ] Tap stop → navigate to details
  - [ ] All stop info displayed (address, customer, SO#)
  - [ ] Status badge shows current state
  - [ ] Back button returns to route list

- [ ] **Mark Delivery**
  - [ ] Capture at least 2 photos
  - [ ] Tap "Mark Delivered" → outbox item is created
  - [ ] Tap "Skip" → prompt for reason on iOS, default reason on Android
  - [ ] Auto-return to route list after enqueue
  - [ ] Sync badge reflects pending item count until sync succeeds

- [ ] **Edge Cases**
  - [ ] Network disconnected → online chip flips to OFFLINE
  - [ ] Offline delivery → toast says "Saved offline · will sync later"
  - [ ] App killed/reopened → outbox and active photos persist
  - [ ] Manual retry/discard works from Sync Queue

### End-to-End Test Flow

1. Fresh install → shows login
2. Login with valid OTP → redirected to route list
3. In dev mode, route list shows mock stops
4. Tap first stop → see details
5. Mark delivered → back to list, status updated
6. Tap second stop
7. Mark skipped with reason → back to list
8. Open Profile → Sync Queue → verify pending/synced state
9. Kill app and restart → session, active photos, and outbox persist
10. Logout (if implemented) → back to login

---

## Debugging

### Enable Detailed Logging

```typescript
// In src/api/client.ts, add:
client.interceptors.request.use((config) => {
  console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

client.interceptors.response.use(
  (response) => {
    console.log(`[API] Response ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`[API] Error ${error.response?.status} ${error.config.url}`);
    return Promise.reject(error);
  }
);
```

### Check React Native Debugger

1. Install: `npm install -g react-native-debugger`
2. Open app in Expo
3. Press `D` in Expo CLI → "Open in Debugger"
4. View network requests, redux state, etc.

### Console Logs

```bash
npm start
# Shows all console.log/console.error from app
# Filter by pressing 'f' → search term
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | `rm -rf node_modules && npm install` |
| Expo won't start | `npx expo-cli@latest start --clear` |
| API calls timeout | Check `EXPO_PUBLIC_BACKEND_URL` in `.env.local`; verify backend is running |
| Token invalid | Clear storage: `npx expo-cli@latest start --clear` (clears simulator) |
| Photos not working | Check iOS/Android permissions in `app.json`; ensure camera permission granted |
| Sync not working | Verify `@react-native-community/netinfo` installed; check connectivity status and Sync Queue |

---

## Building for Distribution

### Local Build (for testing)

```bash
# iOS
npm run build:ios
# Opens simulator with built app

# Android
npm run build:android
# Generates APK for manual testing
```

### EAS Build (for App Store / Play Store)

```bash
# First time: link Expo account
eas build --platform all

# Monitor build progress
eas build --status
```

See `eas.json` for build profiles (development, preview, production).

---

## Performance Tips

- **Image Optimization**: Compress photos before real backend upload
- **Lazy Loading**: Load routes on-demand, not all at once
- **Memory**: Unload or prune synced photos after backend confirms durable upload
- **Bundle Size**: Use Metro bundler analyzer to identify large packages
- **Network**: Implement request timeout + retry (already in client.ts)

---

## Security Checklist

- [ ] HTTPS enforced (in production)
- [ ] JWT token stored in SecureStore (not localStorage)
- [ ] OTP codes validated server-side
- [ ] API requests include auth header
- [ ] Sensitive data (token, user ID) never logged
- [ ] App doesn't cache credentials
- [ ] Logout clears all local storage
- [ ] No hardcoded API URLs (use .env)

---

## Useful Links

- **Expo Docs**: https://docs.expo.dev
- **Expo Router**: https://docs.expo.dev/routing
- **React Native**: https://reactnative.dev
- **NativeWind**: https://www.nativewind.dev
- **Axios**: https://axios-http.com

---

## Contributing

See [`../CLAUDE.md`](../CLAUDE.md) for code standards.

Key patterns:
- Use TypeScript for all files
- Export types from `src/types/index.ts`
- Use Context API for global state
- Prefer custom hooks over local state when possible
- Keep components small and focused
- Add error boundaries around high-risk areas (camera, file upload)

---

## Questions?

Reach out to the development team or check the [plan document](./plans/delightful-snacking-snail.md) for architectural details.
