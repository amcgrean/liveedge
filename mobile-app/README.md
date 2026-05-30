# Beisser LiveEdge Driver App

Mobile app for drivers to complete deliveries with proof-of-delivery photo capture.

## Future / Deferred

- **Per-job site contacts** (foreman name, gate codes, hours on site, site access notes). Agility has limited primary contacts per customer, but rich per-job contact info doesn't exist yet. Plan: add a `job_contacts` table in LiveEdge web that estimators/dispatch can fill in per SO, then surface in the driver app's customer sheet.
- Real maps (route polyline + multi-stop overview) — currently uses placeholder.
- Signature capture at door.
- Barcode scan for yard/receiving.

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g eas-cli`

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your backend URL
   ```

3. **Start development server**:
   ```bash
   npm start
   # Or: npm run dev
   ```

4. **Run on simulator**:
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   ```

## Project Structure

```
src/
  app/                 — Expo Router pages (file-based routing)
  api/                — API client modules
  context/            — React Context providers (Auth, Sync, Toast)
  hooks/              — Custom React hooks
  components/         — Reusable UI components
  storage/            — Local storage (AsyncStorage, SQLite)
  types/              — TypeScript type definitions
  utils/              — Utility functions
```

## Key Features (MVP)

- ✅ OTP Login
- ✅ View daily route + delivery stops
- ✅ Mark deliveries complete/skipped
- ✅ Proof-of-delivery photo capture
- ✅ Offline outbox and auto-sync retry loop
- ✅ Real backend route/auth/POD integration (Phase 5)

## API Integration

### Backend Endpoints

All requests require `Authorization: Bearer {token}` header.

- `POST /api/auth/send-otp` — Request OTP code (`{ identifier }`)
- `POST /api/auth/mobile/verify-otp` — Verify code, returns `{ user, token, expiresIn }` (JWT)
- `GET /api/dispatch/routes?date=YYYY-MM-DD&branch=CODE&include=stops` — Fetch route + stops
- `POST /api/dispatch/orders/{SO}/pod/upload-url` — Get presigned R2 PUT URL for POD photo
- `POST /api/dispatch/orders/{SO}/deliver` — Mark delivered/skipped (accepts `photo_keys[]`)
- `POST /api/dispatch/orders/{SO}/pod` — POD signature push (existing, Agility-bound)

See [../docs/MOBILE_APP.md](../docs/MOBILE_APP.md) for full API docs.

## Development Workflow

### Phase 1: Scaffolding & Auth ✅
- Project initialized with Expo + TypeScript
- Auth context + OTP login screen
- Session persistence

### Phase 2: Route Display & Navigation (In Progress)
- Route list screen
- Delivery details screen
- Pull-to-refresh

### Phase 3: Delivery Status Update ✅
- Mark delivered/skipped buttons
- Toast notifications

### Phase 4: Photo Capture + Offline Sync ✅
- Camera integration
- Local photo storage
- AsyncStorage queue
- Background sync
- Retry/discard controls in Sync Queue

### Phase 5: Real Backend Integration ✅
- JWT-signed mobile OTP verify endpoint (`/api/auth/mobile/verify-otp`)
- Dispatch + POD routes accept Bearer tokens alongside the NextAuth cookie
- `useDriverRoute()` hook + route mapper feed every screen from real data
- Two-phase delivery sync: presigned R2 PUT per photo, then deliver POST with R2 keys
- `OutboxItem.photoUploads[]` makes uploads resumable so retries don't re-upload completed photos
- Pending outbox rows overlay server data for optimistic-UI reconciliation

### Phase 6: Real Maps + GPS (Next)
- Map polyline + multi-stop overview from live coords
- GPS-aware ETAs and "next stop" hints

## Testing

### Manual Testing Checklist

- [ ] OTP login works
- [ ] Route list loads
- [ ] Pull-to-refresh fetches latest data
- [ ] Tap delivery → details screen opens
- [ ] Mark delivered updates status
- [ ] Mark skipped prompts for reason
- [ ] Session persists on app restart

### Test Accounts

Dev mode is active when `EXPO_PUBLIC_BACKEND_URL` is unset. Use any username with OTP code `000000`.

## Build & Deployment

### Development Build
```bash
npm run build:android   # APK for testing
npm run build:ios       # Ad-hoc build for testing
```

### Production Build
```bash
eas build --platform all   # Builds for App Store + Play Store
```

## Troubleshooting

### Build Fails
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear Expo cache: `npx expo-cli@latest start --clear`

### API Calls Fail
- Check `EXPO_PUBLIC_BACKEND_URL` in `.env.local`
- Verify backend is running
- Check network connectivity
- Review console logs: `npm start` shows all logs

### Photos Not Showing
- Check camera permissions granted
- Verify photo upload endpoint working
- Check local storage has space

## Contributing

See [../../CLAUDE.md](../../CLAUDE.md) for codebase guidelines.

## License

Proprietary — Beisser Lumber Co.
