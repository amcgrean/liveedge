# Mobile App Debugging Guide

## Entry Point Initialization Flow

The app initialization happens in this order:

### 1. **index.tsx Execution** (Entry Point)
When Expo starts the app, it looks for the main entry point file (`index.tsx` in the root directory).

**Expected logs:**
```
[TIME] [INDEX] ===== APP INITIALIZATION START =====
[TIME] [INDEX] Process: DEV
[TIME] [INDEX] Node env: production
[TIME] [INDEX] Setting up global error handlers...
```

### 2. **Module Loading Phase**
The entry point attempts to load critical modules in sequence:

- **Step 1: React**
  ```
  [TIME] [INDEX] Step 1: Requiring React...
  [TIME] [INDEX] ✓ React loaded. Version info: v19.1.0
  ```

- **Step 2: React Native**
  ```
  [TIME] [INDEX] Step 2: Requiring React Native...
  [TIME] [INDEX] ✓ React Native loaded. Platform: ios
  ```

- **Step 3: Expo**
  ```
  [TIME] [INDEX] Step 3: Requiring expo...
  [TIME] [INDEX] ✓ Expo loaded. registerRootComponent: function
  ```

- **Step 4: Root Layout**
  ```
  [TIME] [INDEX] Step 4: Loading root layout from ./src/app/_layout...
  [TIME] [INDEX] ✓ Root layout loaded. Type: function
  [TIME] [INDEX] ✓ Root layout component name: RootLayout
  ```

### 3. **Expo Router Initialization**
The entry point attempts to initialize expo-router:

**Success case:**
```
[TIME] [INDEX] Step 5: Attempting expo-router/entry approach...
[TIME] [INDEX] Requiring expo-router/entry...
[TIME] [INDEX] ✓ expo-router/entry imported successfully
[TIME] [INDEX] ===== APP INITIALIZATION COMPLETE =====
```

**Fallback case (if expo-router fails):**
```
[TIME] [INDEX] ✗ expo-router/entry failed: [ERROR MESSAGE]
[TIME] [INDEX] Step 6: Attempting fallback registration...
[TIME] [INDEX] Calling registerRootComponent with RootLayout...
[TIME] [INDEX] ✓ Successfully registered root component via registerRootComponent
[TIME] [INDEX] ===== APP INITIALIZATION COMPLETE =====
```

### 4. **Component Rendering**
Once the entry point succeeds, the RootLayout component should render:

```
[TIME] [ROOT_LAYOUT] RootLayout component function called
[TIME] [ROOT_LAYOUT] RootLayout rendering View and Text
[TIME] [ROOT_LAYOUT] RootLayout useEffect hook running
```

## Debugging Steps

### Step 1: Start the Dev Server
```bash
cd mobile-app
npm start
```

Wait for the Metro bundler to show the QR code and connection status.

### Step 2: Open Expo Go on iPhone
1. Launch Expo Go app
2. Tap "Scan QR code"
3. Scan the code shown in the terminal

### Step 3: Monitor Logs
Once you scan the QR code, you should see logs appearing in the terminal where `npm start` is running.

**Important:** The terminal where `npm start` is running shows logs from the dev server. To see actual device logs from your iPhone, you need to use Expo's log viewer:

- Press `w` in the Metro Bundler terminal (toggles log view)
- Or open the Expo Go app > More > Device Logs

### Step 4: Identify Where Initialization Fails

**If you see all SUCCESS logs and the app shows on iPhone:**
- Initialization completed successfully
- Check the app screen for the "✓ App Initialized" message

**If initialization fails at a specific step:**

| Failed At | Issue | Next Steps |
|-----------|-------|-----------|
| React loading | React module is corrupted | Run `npm install react@19.1.0` |
| React Native loading | RN not installed | Run `npm install react-native@0.81.5` |
| Expo loading | Expo broken | Run `npm install expo@54.0.0` |
| Root layout | _layout.tsx has syntax error | Check `src/app/_layout.tsx` for TypeScript errors |
| expo-router/entry | Expo Router broken | Check next section for fallback behavior |
| Fallback registration | Fundamental issue | Check console error details |

## Common Error Messages

### "Unknown option: .visitor"
- **Cause:** Babel preset mismatch
- **Fix:** Check `babel.config.js` - should only have `'babel-preset-expo'`

### "Cannot find module..."
- **Cause:** Module not installed or path wrong
- **Fix:** Run `npm install` and check import paths in files

### "TypeError: X is not a function"
- **Cause:** Module loaded but not the right export
- **Fix:** Check the module has a default export with correct function

### "app entry point named main could not be found"
- **Current Problem:** Expo Router entry point registration is failing or not completing
- **Debugging:** Look for errors in Steps 1-5 above. If all steps complete but this error persists, the issue is in how Expo is detecting the registered component
- **Next Step:** Enable debug mode with `EXPO_DEBUG=true`

## Advanced Debugging

### Running with Debug Flags
```bash
EXPO_DEBUG=true npm start
```

### Clearing Cache
If you're seeing stale module errors:
```bash
npm start --clear
```

### Verbose Logging
```bash
npm start -- --verbose
```

### Check Node Modules
Verify critical dependencies are installed:
```bash
ls node_modules/expo
ls node_modules/expo-router
ls node_modules/react
ls node_modules/react-native
```

## Log Format Reference

Each log line has this format:
```
[ISO_TIMESTAMP] [SOURCE] Message: details
```

- **[ISO_TIMESTAMP]:** Time when log was emitted (e.g., `2026-04-28T10:30:45.123Z`)
- **[SOURCE]:** Which part of app emitted log:
  - `[INDEX]` = Entry point (index.tsx)
  - `[ROOT_LAYOUT]` = Root layout component
- **Message:** What happened
- **✓ or ✗:** Success or failure indicator

## If App Still Won't Load

1. **Verify SDK 54:** `grep sdkVersion app.json` should show `54.0.0`
2. **Clear cache:** `npm start --clear`
3. **Reinstall:** `rm -rf node_modules && npm install`
4. **Check logs:** Press `w` in Metro terminal to see device logs
5. **Device check:** Try a simple component (already simplified to View + Text)

## Expected Output on iPhone Screen

Once all logs show SUCCESS and app loads:

```
✓ App Initialized

Beisser LiveEdge Driver
```

This confirms the entry point is working and the root component is rendering.
