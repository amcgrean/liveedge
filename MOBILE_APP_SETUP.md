# Mobile App Scaffolding — Setup & Next Steps

## What Was Created

A complete React Native (Expo) project scaffolding for the **Beisser LiveEdge Driver App** — a mobile application for drivers to complete deliveries with proof-of-delivery photo capture.

### Directory Structure
```
mobile-app/
├── src/
│   ├── app/                  — Expo Router pages (file-based routing)
│   ├── api/                  — API client (auth, dispatch)
│   ├── context/              — AuthContext (global session state)
│   ├── types/                — TypeScript definitions
│   ├── utils/                — Utility functions (date, network)
│   └── storage/ (future)     — Local storage, offline sync (Phase 5)
│
├── app.json                  — Expo config
├── eas.json                  — App Store / Play Store build config
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md                 — Local setup guide
```

### Features Implemented (Phase 1-2)

✅ **Phase 1: Auth & Session Management**
- OTP login screen (request + verify 6-digit code)
- Session persistence via SecureStore (encrypted on device)
- AuthContext for global state + session persistence
- Auto-logout on token expiry

✅ **Phase 2: Route Display & Navigation**
- Route list screen (today's deliveries with progress bar)
- Pull-to-refresh to sync latest status
- Delivery detail screen (address, customer, SO#)
- Tap-to-open navigation between screens
- Error handling + loading states

### Current Status

**Ready to Run**: All Phase 1-2 code is complete and testable.

---

## Running the App

### 1. Install Dependencies
```bash
cd mobile-app
npm install
```

This is already done, but you can re-run if needed.

### 2. Start Development Server
```bash
npm start
# Or: npm run dev
```

You'll see:
```
Expo Go (Android/iPhone app)
expo-dev-client://...

Press 'i' to run in iOS simulator
Press 'a' to run in Android emulator
Press 'w' to run in web
Press 'q' to quit
```

### 3. Run on Simulator

**iOS** (requires Xcode):
```bash
npm run ios
```

**Android** (requires Android Studio):
```bash
npm run android
```

**Web** (for quick testing):
```bash
npm run web
```

### 4. Test the App

1. **Login**: You'll see the login screen
   - Enter any username (e.g., `test@example.com`)
   - Click "Continue"
   - Enter OTP code (backend handles this)
   - Tap "Verify"

2. **View Route**: After login, you'll see today's deliveries
   - Scroll to see all stops
   - Pull-down to refresh
   - Tap any delivery to see details

3. **Delivery Details**: Tap a delivery
   - See full address + customer name
   - Current status (pending/delivered/skipped)
   - Two action buttons: "Mark Delivered" or "Skip Delivery"
   - Tap button → status updates, returns to list

---

## Environment Setup

The app connects to your local backend by default:

```env
EXPO_BACKEND_URL=http://localhost:3000
EXPO_API_TIMEOUT=30000
EXPO_LOG_LEVEL=info
```

If using a remote backend, edit `.env.local`:
```bash
cd mobile-app
nano .env.local
# Change EXPO_BACKEND_URL to your backend URL
```

---

## Next Steps (Phase 3-6)

### Phase 3: Delivery Status Updates ← **Start Here**
Focus on completing delivery status updates with offline support.

**Files to Modify**:
- `src/app/(app)/[soNumber]/details.tsx` — Add toast notifications
- `src/storage/outbox.ts` — Implement offline queue
- `src/context/SyncContext.tsx` — Add sync state

**Tasks**:
1. Add Toast context for notifications
2. Implement optimistic UI (update local state immediately)
3. Queue failed updates for retry
4. Show "Syncing..." status during POST

**Estimated Time**: 1-2 days

### Phase 4: Photo Capture & Upload
Integrate camera for proof-of-delivery.

**Dependencies to Add**:
- `expo-camera` (already in package.json)
- `expo-image-picker`

**Files to Create**:
- `src/components/PhotoCamera.tsx` — Camera UI
- `src/components/PhotoGrid.tsx` — Photo display
- `src/hooks/usePhotoCapture.ts` — Photo state management
- `src/api/files.ts` — Upload to presigned R2 URL

### Phase 5: Offline Sync
Full offline-first capability with background sync.

**Dependencies**:
- `@react-native-community/netinfo` (already in package.json)
- `react-native-mmkv` (lightweight storage)
- `expo-background-fetch` (already in package.json)

**Files to Create**:
- `src/storage/outbox.ts` — Delivery queue
- `src/storage/photos.ts` — Photo cache
- `src/storage/sync.ts` — Sync engine
- `src/hooks/useSync.ts` — Background sync

### Phase 6: Testing & Deployment
Polish and ship to App Stores.

**Build for Testing**:
```bash
npm run build:ios   # Generates IPA for TestFlight
npm run build:android  # Generates APK for Google Play
```

**Full Deploy** (to App Stores):
```bash
eas build --platform all
eas submit --platform all
```

---

## API Integration Checklist

The mobile app expects these backend endpoints. **No changes needed to web app** — endpoints already exist.

- [ ] `POST /api/auth/send-otp` — Request OTP code
- [ ] `POST /api/auth/send-otp` (with code) — Verify OTP + return token
- [ ] `GET /api/dispatch/routes?date=X&branch=Y` — Fetch route + stops
- [ ] `GET /api/dispatch/orders/[so_number]` — Get stop detail
- [ ] `POST /api/dispatch/orders/[so_number]/deliver` — Update status
- [ ] `POST /api/dispatch/orders/[so_number]/pod` — Upload POD photos
- [ ] `GET /api/dispatch/kpis?branch=X&date=Y` — Fetch KPI metrics (future)

All endpoints already exist in the web app. Just verify response format matches `src/types/index.ts`.

---

## Git Workflow

### Commit Phase 1-2 Work
```bash
git add mobile-app/ docs/MOBILE_APP.md .gitignore README.md
git commit -m "Init: Mobile app scaffolding (Expo + Phase 1-2: Auth + Route Display)

- Initialize Expo project with TypeScript
- OTP login screen with SecureStore persistence
- Route list screen with pull-to-refresh
- Delivery details screen with mark delivered/skip buttons
- Type definitions + API client (auth, dispatch)
- Full documentation in docs/MOBILE_APP.md"
```

### Create Branch for Phase 3
```bash
git checkout -b feat/delivery-notifications
# Work on Phase 3: Delivery status + notifications
```

---

## Key Files to Know

**Core App Structure**:
- `src/app/_layout.tsx` — Root layout (conditional auth/app routing)
- `src/app/(auth)/login.tsx` — OTP login form
- `src/context/AuthContext.tsx` — Global auth + session storage
- `src/app/(app)/route-list.tsx` — Delivery list view
- `src/app/(app)/[soNumber]/details.tsx` — Delivery detail + actions

**API & Types**:
- `src/api/client.ts` — Axios instance + interceptors
- `src/api/auth.ts` — OTP login endpoints
- `src/api/dispatch.ts` — Route + delivery endpoints
- `src/types/index.ts` — TypeScript definitions

**Configuration**:
- `app.json` — Expo config (name, icon, permissions)
- `eas.json` — EAS build config (iOS/Android)
- `tsconfig.json` — TypeScript settings
- `.env.example` — Environment template

---

## Troubleshooting

**Issue**: "Cannot find module 'expo-secure-store'"
- **Solution**: `npm install` in mobile-app directory

**Issue**: Build fails with permission errors
- **Solution**: Clear cache: `npm start --clear` and try again

**Issue**: API calls return 401 (Unauthorized)
- **Solution**: OTP login required first; check token in SecureStore

**Issue**: Route list shows "No data"
- **Solution**: 
  1. Check backend is running (should have `/api/dispatch/routes` endpoint)
  2. Check `EXPO_BACKEND_URL` in .env.local
  3. Verify driver has deliveries for today

---

## Documentation

- **Mobile App Guide**: [docs/MOBILE_APP.md](../docs/MOBILE_APP.md) — Full API docs, routing, architecture
- **Web App**: [CLAUDE.md](../CLAUDE.md) — Backend architecture, auth, database
- **Development Plan**: [.claude/plans/delightful-snacking-snail.md](../.claude/plans/delightful-snacking-snail.md) — Original plan with phases + success criteria

---

## Questions?

Refer to:
1. **Development Plan** — Architecture decisions, phase breakdown, risks
2. **MOBILE_APP.md** — API docs, troubleshooting, testing checklist
3. **CLAUDE.md** — Backend auth flow, permissions, branch context
4. **Code Comments** — Look for `// TODO` or `// FIXME` markers

---

**Start with Phase 3**: Add toast notifications + optimistic updates to the delivery status flow. That's the most impactful next step for core functionality.

Good luck! 🚀
