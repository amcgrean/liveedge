# Mobile App Development Guide

## Overview

The **Beisser LiveEdge Driver App** is a React Native (Expo) mobile application for delivery drivers to:
- View assigned delivery routes
- Mark deliveries as complete or skipped
- Capture proof-of-delivery (POD) photos
- Sync offline updates when connectivity returns

**Tech Stack**: Expo (iOS + Android), React Native, TypeScript, Axios, NativeWind (Tailwind CSS)

**Status**: Phase 1-2 complete (Auth + Route Display)

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
# Edit .env.local if needed (default points to localhost:3000)
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
│   │   │   └── login.tsx         ← OTP login screen
│   │   └── (app)/                ← Protected routes (require auth)
│   │       ├── _layout.tsx
│   │       ├── route-list.tsx    ← Today's deliveries list
│   │       └── [soNumber]/       ← Dynamic delivery detail
│   │           ├── _layout.tsx
│   │           ├── details.tsx   ← Mark complete/skip
│   │           └── photos.tsx    ← Photo capture (phase 4)
│   │
│   ├── api/                      ← API client modules
│   │   ├── client.ts             ← Axios instance + interceptors
│   │   ├── auth.ts               ← OTP login endpoints
│   │   └── dispatch.ts           ← Route + delivery endpoints
│   │
│   ├── context/                  ← React Context providers
│   │   └── AuthContext.tsx       ← Global auth state + session storage
│   │
│   ├── storage/                  ← Local data persistence (future)
│   │   ├── session.ts            ← Secure token storage
│   │   ├── outbox.ts             ← Offline queue (phase 5)
│   │   └── sync.ts               ← Sync engine (phase 5)
│   │
│   ├── hooks/                    ← Custom React hooks
│   │   ├── useAuth.ts            ← AuthContext consumer
│   │   ├── useRoute.ts           ← Fetch + refetch route
│   │   └── useSync.ts            ← Background sync (phase 5)
│   │
│   ├── components/               ← Reusable UI components
│   │   ├── DeliveryCard.tsx      ← Stop summary card
│   │   ├── PhotoCamera.tsx       ← Camera wrapper (phase 4)
│   │   └── Button.tsx            ← Shared button styles
│   │
│   ├── types/                    ← TypeScript definitions
│   │   └── index.ts              ← Core types (User, Route, DeliveryStop, etc.)
│   │
│   └── utils/                    ← Utilities
│       ├── date.ts               ← Date formatting (date-fns)
│       └── network.ts            ← Network status detection (phase 5)
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
- `/login` — OTP login screen

### App Routes (Authenticated Users)
- `/route-list` — Today's deliveries
- `/[soNumber]/details` — Delivery details + status buttons
- `/[soNumber]/photos` — Photo gallery (phase 4)

**Navigation Flow**:
1. App detects no session → show `/login`
2. User logs in with OTP → stores token in SecureStore
3. App redirects to `/(app)/route-list`
4. Tap delivery → navigate to `/[soNumber]/details`

---

## API Integration

### Authentication

**OTP Login Flow**:

```typescript
// Step 1: Request OTP
POST /api/auth/send-otp
{
  "username": "john.doe@beisser.com"
}
→ { success: true, expiresIn: 600 }

// Step 2: Verify OTP code
POST /api/auth/send-otp
{
  "username": "john.doe@beisser.com",
  "code": "123456"
}
→ {
    "user": { id, email, name, role, branch, ... },
    "token": "eyJhbGc...",
    "expiresIn": 604800  // 7 days in seconds
  }
```

**Token Storage**:
- Stored in `expo-secure-store` (encrypted on device)
- Attached to all API requests: `Authorization: Bearer {token}`
- Refreshed before expiry (manual for MVP; auto-refresh in phase 5)

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
  "status": "delivered|skipped",
  "notes": "customer not ready",
  "timestamp": "2026-04-26T11:15:00Z",
  "photo_count": 0
}

Response:
{
  "success": true,
  "updated_at": "2026-04-26T11:15:05Z",
  "synced_at": "2026-04-26T11:15:05Z"
}
```

#### Upload POD Photos (Phase 4)
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

### ⏳ Phase 3: Delivery Status Update
- Mark Delivered / Skip buttons
- Optimistic UI updates
- Toast notifications
- Basic error handling

### ⏳ Phase 4: Photo Capture & Upload
- `expo-camera` integration
- Photo gallery
- Multi-photo support per delivery
- Upload to presigned R2 URL
- Local photo queue until confirmed

### ⏳ Phase 5: Offline Sync
- `@react-native-community/netinfo` for connectivity detection
- AsyncStorage outbox for pending deliveries + photos
- Background sync service (expo-task-manager)
- Retry logic with exponential backoff
- Conflict resolution (server wins)

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
EXPO_BACKEND_URL=http://localhost:3000
# Or for production: https://liveedge.beisser.com

# API request timeout (ms)
EXPO_API_TIMEOUT=30000

# Log level (info, debug, warn, error)
EXPO_LOG_LEVEL=info
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
  - [ ] Click "Mark Delivered" → status updates
  - [ ] Click "Mark Skipped" → prompt for reason → skipped with note
  - [ ] Auto-return to route list after update
  - [ ] Route list reflects status change

- [ ] **Edge Cases**
  - [ ] Network disconnected → error toast
  - [ ] Token expired → redirect to login
  - [ ] Empty route → show "no deliveries" message
  - [ ] App backgrounded/foregrounded → state persists

### End-to-End Test Flow

1. Fresh install → shows login
2. Login with valid OTP → redirected to route list
3. Fetch route with 5+ stops
4. Tap first stop → see details
5. Mark delivered → back to list, status updated
6. Tap second stop
7. Mark skipped with reason → back to list
8. Pull-to-refresh → route re-fetches
9. Kill app and restart → session persists, route list opens
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
| API calls timeout | Check `EXPO_BACKEND_URL` in .env.local; verify backend is running |
| Token invalid | Clear storage: `npx expo-cli@latest start --clear` (clears simulator) |
| Photos not working (phase 4) | Check iOS/Android permissions in `app.json`; ensure camera permission granted |
| Sync not working (phase 5) | Verify `@react-native-community/netinfo` installed; check connectivity status |

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

- **Image Optimization**: Compress photos before upload (phase 4)
- **Lazy Loading**: Load routes on-demand, not all at once
- **Memory**: Unload photos from cache after sync (phase 5)
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
