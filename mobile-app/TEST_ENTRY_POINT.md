# Entry Point Testing Guide

This guide provides step-by-step instructions to test the enhanced entry point debugging and identify where initialization is failing.

## What Was Added

1. **Detailed Sequential Logging** in `index.tsx`:
   - Logs each step of module loading (React, React Native, Expo, Expo Router)
   - Logs success/failure with ✓/✗ indicators
   - Includes fallback registration mechanism if Expo Router fails

2. **Component Lifecycle Logging** in `src/app/_layout.tsx`:
   - Logs when component function is called
   - Logs when useEffect hook runs
   - Logs when rendering occurs
   - Shows visual confirmation on screen ("✓ App Initialized")

3. **Debugging Guide** in `DEBUG_GUIDE.md`:
   - Complete initialization flow documentation
   - What each log message means
   - How to interpret failures

## Quick Test (5 minutes)

### Part 1: Start the Dev Server
```bash
cd /Users/aaronm/Documents/liveedge/mobile-app

# Kill any running instance
pkill -f "expo start" || true
sleep 2

# Start fresh
npm start
```

Wait until you see:
```
Local:        exp://192.168.x.x:8081
To open the app press i for iOS simulator, a for android emulator, or w for web.
```

### Part 2: Scan QR Code on iPhone
1. Open Expo Go app
2. Tap "Scan QR code" (bottom menu)
3. Point camera at the QR code in terminal
4. Wait for app to load

### Part 3: Watch Terminal Logs
**Critical:** Keep watching the terminal where `npm start` is running. You should see logs appearing as the app initializes:

```
[2026-04-28T...] [INDEX] ===== APP INITIALIZATION START =====
[2026-04-28T...] [INDEX] Process: DEV
[2026-04-28T...] [INDEX] Node env: production
[2026-04-28T...] [INDEX] Setting up global error handlers...
[2026-04-28T...] [INDEX] Step 1: Requiring React...
[2026-04-28T...] [INDEX] ✓ React loaded. Version info: v19.1.0
...
```

### Part 4: Check iPhone Screen
You should see one of these:

**SUCCESS:** 
```
✓ App Initialized

Beisser LiveEdge Driver
```

**FAILURE:** 
Red error screen with error message

## Detailed Testing (30 minutes)

If the quick test fails, use this systematic approach:

### Test 1: Verify Dev Server is Running
```bash
# In a NEW terminal
curl http://localhost:8081/__debug/packages
```

You should get JSON output listing installed packages.

If this fails: Metro bundler isn't running. Check for errors in the npm start terminal.

### Test 2: Verify iOS Bundling
In the `npm start` terminal, press `i` to build for iOS simulator:

```
i - open iOS Simulator
```

This will:
1. Build the iOS bundle
2. Start the simulator
3. Load the app in simulator

You should see logs like:
```
iOS Bundled ... modules in XXms
```

Watch the simulator screen and terminal logs together.

### Test 3: Check Metro Bundler Logs
While app is loading, press `w` in the metro terminal to toggle log view:

```
w - open web debugger
```

This opens a web-based log viewer showing real-time logs.

### Test 4: Capture Full Output
Run this to capture all output to a file:

```bash
npm start 2>&1 | tee startup_debug.log &
# Scan QR code on iPhone
# Wait 30 seconds
# Press Ctrl+C to stop
```

Then check `startup_debug.log` for the complete initialization sequence.

## Expected Outcomes

### Scenario 1: All Logs Succeed ✓
**Terminal shows:**
```
[TIME] [INDEX] ✓ React loaded
[TIME] [INDEX] ✓ React Native loaded
[TIME] [INDEX] ✓ Expo loaded
[TIME] [INDEX] ✓ Root layout loaded
[TIME] [INDEX] ✓ expo-router/entry imported successfully
[TIME] [INDEX] ===== APP INITIALIZATION COMPLETE =====
[TIME] [ROOT_LAYOUT] RootLayout component function called
[TIME] [ROOT_LAYOUT] RootLayout rendering View and Text
```

**iPhone shows:**
```
✓ App Initialized
Beisser LiveEdge Driver
```

**Action:** App is working! Proceed to implementing more features.

---

### Scenario 2: Logs Succeed but Still Gets Error
**Terminal shows all SUCCESS logs, but iPhone still shows:**
```
app entry point named main could not be found
```

**Diagnosis:** Expo is not detecting the registered component. This is an Expo/Expo Router issue, not our code.

**Next steps:**
1. Check if you can see "RootLayout component function called" in logs
   - If YES: Component loaded but Expo doesn't recognize registration
   - If NO: Component never loaded despite logs saying step 4 succeeded
2. Try adding explicit `expo.registerRootComponent` export:
   ```typescript
   // At end of index.tsx
   const { registerRootComponent } = require('expo');
   require('expo-router/entry');
   // This creates a fallback
   ```

---

### Scenario 3: Fails at React Loading
**Terminal shows:**
```
[TIME] [INDEX] ✗ Failed to load React: [ERROR MESSAGE]
```

**Fix:**
```bash
npm install react@19.1.0 --force
npm start --clear
```

---

### Scenario 4: Fails at React Native Loading
**Terminal shows:**
```
[TIME] [INDEX] ✗ Failed to load React Native: [ERROR MESSAGE]
```

**Fix:**
```bash
npm install react-native@0.81.5 --force
npm start --clear
```

---

### Scenario 5: Fails at Expo Loading
**Terminal shows:**
```
[TIME] [INDEX] ✗ Failed to load expo: [ERROR MESSAGE]
```

**Fix:**
```bash
npm install expo@54.0.0 --force
npm start --clear
```

---

### Scenario 6: Fails at Root Layout Loading
**Terminal shows:**
```
[TIME] [INDEX] ✗ Failed to load root layout: [ERROR MESSAGE]
```

**Diagnosis:** There's a syntax error or import error in `src/app/_layout.tsx`

**Fix:**
1. Open `src/app/_layout.tsx` in editor
2. Check for:
   - Missing imports
   - Syntax errors
   - Invalid TypeScript
3. Run `npm run type-check` to validate

---

### Scenario 7: Fails at Expo Router, Uses Fallback
**Terminal shows:**
```
[TIME] [INDEX] ✗ expo-router/entry failed: [ERROR MESSAGE]
[TIME] [INDEX] Step 6: Attempting fallback registration...
[TIME] [INDEX] ✓ Successfully registered root component via registerRootComponent
[TIME] [INDEX] ===== APP INITIALIZATION COMPLETE =====
```

**Status:** Fallback worked! App should load on iPhone.

**Action:** This is acceptable behavior. Expo Router initialization might be slow on first load.

---

## Log Interpretation Cheat Sheet

| Log | Status | Meaning |
|-----|--------|---------|
| `===== APP INITIALIZATION START =====` | ℹ️ Info | Entry point started loading |
| `✓ React loaded` | ✅ Good | React module found and loaded |
| `✗ React loading` | ❌ Error | React module missing or broken |
| `✓ Root layout loaded` | ✅ Good | Component file found and exported correctly |
| `RootLayout component function called` | ✅ Good | Component is executing |
| `RootLayout useEffect hook running` | ✅ Good | Component has mounted |
| `expo-router/entry imported successfully` | ✅ Good | Expo Router initialized |
| `expo-router/entry failed` | ⚠️ Warning | Will try fallback |
| `Successfully registered root component via registerRootComponent` | ✅ Good | Fallback worked |
| `===== APP INITIALIZATION COMPLETE =====` | ✅ Good | Entry point finished |
| `app entry point named main could not be found` | ❌ Error | Expo can't find the registered component |

## Next Steps After Testing

Once you've confirmed the initialization sequence:

1. **If logs show all SUCCESS but iPhone error persists:**
   - Take a screenshot of the error on iPhone
   - Check `DEBUG_GUIDE.md` advanced section
   - Consider clearing Expo cache: `expo logout && expo login`

2. **If logs show a failure at a specific step:**
   - Follow the corresponding fix in "Expected Outcomes" section
   - Run `npm start --clear` after any fixes
   - Re-test from Part 1

3. **If logs show SUCCESS and iPhone shows the success screen:**
   - Congratulations! The entry point is working
   - Next phase: implement actual routing and features
   - Add logging to app layout files as you build them

## Troubleshooting Commands

```bash
# Clear cache and reinstall
npm start --clear

# Full clean reinstall
rm -rf node_modules package-lock.json
npm install

# Check for SDK 54
grep sdkVersion app.json

# Verify critical files exist
ls -la index.tsx src/app/_layout.tsx

# Type check
npm run type-check

# Lint check
npm run lint
```

## Files Modified for Debugging

- `index.tsx` - Enhanced with 6-step initialization logging
- `src/app/_layout.tsx` - Added useEffect logging and success indicator
- `DEBUG_GUIDE.md` - Complete debugging reference
- `TEST_ENTRY_POINT.md` - This file

All changes are debugging only and can be simplified once the issue is identified.
