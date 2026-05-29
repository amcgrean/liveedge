# Quick Start Guide

## What Was Done
Added comprehensive logging to track app initialization step-by-step and identify where the "entry point not found" error occurs.

## Test in 5 Minutes

```bash
# Step 1: Verify environment
./TEST_ENTRY_POINT.sh

# Step 2: Start dev server
npm start

# Step 3: On iPhone
# - Open Expo Go
# - Tap "Scan QR code"
# - Point at QR code in terminal
# - Watch terminal for logs
```

## What You'll See

### Terminal (Real-time logs):
```
[TIME] [INDEX] ===== APP INITIALIZATION START =====
[TIME] [INDEX] ✓ React loaded
[TIME] [INDEX] ✓ React Native loaded
[TIME] [INDEX] ✓ Expo loaded
[TIME] [INDEX] ✓ Root layout loaded
[TIME] [INDEX] ✓ expo-router/entry imported successfully
[TIME] [ROOT_LAYOUT] RootLayout component function called
[TIME] [INDEX] ===== APP INITIALIZATION COMPLETE =====
```

### iPhone Screen:
```
✓ App Initialized

Beisser LiveEdge Driver
```

## Success Indicators

### ✅ If all is working:
- Terminal shows all ✓ indicators
- iPhone shows "✓ App Initialized"
- App is ready for Phase 2

### ⚠️ If logs succeed but iPhone shows error:
- Read `TEST_ENTRY_POINT.md` Scenario 2
- Apply the suggested fix

### ❌ If logs fail at a step:
- Find your step in `TEST_ENTRY_POINT.md`
- Apply the scenario-specific fix
- Run `npm start --clear`
- Test again

## Key Files to Read

| File | Purpose |
|------|---------|
| `QUICK_START.md` | This file - quick overview |
| `DEBUGGING_SESSION_SUMMARY.md` | What was added and why |
| `TEST_ENTRY_POINT.md` | Detailed testing with all scenarios |
| `DEBUG_GUIDE.md` | Complete debugging reference |
| `CHANGES_THIS_SESSION.md` | All files modified/created |

## Troubleshooting Commands

```bash
# Clear Metro cache and restart
npm start --clear

# Full clean reinstall
rm -rf node_modules && npm install

# Verify TypeScript
npm run type-check

# Verify linting
npm run lint
```

## Entry Point Logging Breakdown

Each initialization step logs:
1. **React module** - Core React library
2. **React Native module** - React Native for iOS/Android
3. **Expo module** - Expo framework
4. **Root layout** - Your app's root component
5. **Expo Router** - Routing system
6. **Fallback registration** - If Expo Router fails

If any step shows ✗ instead of ✓, that's where the problem is.

## Component Logging

The root layout (`src/app/_layout.tsx`) now logs:
- When component function is called
- When useEffect hook runs (mounting)
- When component renders

This shows whether the component is even being executed.

## Next Steps

1. **Run verification script** to check environment
2. **Start dev server** with `npm start`
3. **Test on iPhone** by scanning QR code
4. **Watch terminal logs** for initialization sequence
5. **Check iPhone screen** for success message or error
6. **Read appropriate guide** based on result

## Expected Duration

- Environment verification: ~30 seconds
- Dev server startup: ~10 seconds
- App loading on iPhone: ~5-10 seconds
- **Total time to get result: ~30 seconds**

## Documentation Files Added

1. `DEBUG_GUIDE.md` - 200+ lines of debugging reference
2. `TEST_ENTRY_POINT.md` - 350+ lines of testing procedures
3. `TEST_ENTRY_POINT.sh` - Automated verification script
4. `DEBUGGING_SESSION_SUMMARY.md` - Session overview
5. `CHANGES_THIS_SESSION.md` - Detailed change log
6. `QUICK_START.md` - This file

## Code Changes Made

### Entry Point (index.tsx)
- Added 6-step initialization logging
- Each step logs success/failure with timestamps
- Global error handler setup
- Fallback registration mechanism

### Root Component (src/app/_layout.tsx)
- Added lifecycle logging (component function call, useEffect mount)
- Enhanced screen display with success indicator
- Proper React Native styling

### TypeScript Fixes
- `splash.tsx` - ClassNames → StyleSheet
- `route-list.tsx` - ClassNames → StyleSheet (simplified)
- `photos.tsx` - ClassNames → StyleSheet
- `(auth)/_layout.tsx` - Removed unsupported options

## Log Format

Every log follows this pattern:
```
[ISO_TIMESTAMP] [SOURCE] Message: details
```

Example:
```
[2026-04-28T10:30:45.123Z] [INDEX] ✓ React loaded. Version info: v19.1.0
```

- **[ISO_TIMESTAMP]** = When the event happened
- **[SOURCE]** = Where it came from ([INDEX] or [ROOT_LAYOUT])
- **Message** = What happened
- **✓** = Success, **✗** = Failure

## Estimated Timeline

| Activity | Time |
|----------|------|
| Run verification script | 30 sec |
| Start dev server | 10 sec |
| Load app on iPhone | 10 sec |
| See logs in terminal | Instant |
| Determine issue (if any) | 1 min |
| **Total** | **~2 minutes** |

## Pro Tips

💡 **Press 'w' in Metro terminal** to toggle web log viewer while app is loading.

💡 **Keep the terminal window visible** when testing on iPhone - logs appear in real-time.

💡 **If you need to restart**, press Ctrl+C to stop `npm start`, then run again.

💡 **Each test takes ~30 seconds**, so quick iteration is possible.

---

## TL;DR

```bash
./TEST_ENTRY_POINT.sh  # Verify environment (30 sec)
npm start               # Start dev server (10 sec)
# Scan QR code on iPhone with Expo Go
# Watch terminal for logs (should see all ✓ indicators)
# iPhone should show: ✓ App Initialized
```

If you see all ✓ and the success screen → **App is working!**

If something fails → Check `TEST_ENTRY_POINT.md` for your scenario.

---

**Ready to test?** Start with:
```bash
./TEST_ENTRY_POINT.sh
```
