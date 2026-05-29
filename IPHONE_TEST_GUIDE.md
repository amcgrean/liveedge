# iPhone Testing Guide — Expo Go Demo

## ✅ Status: Dev Server Running

The mobile app is **live and ready to test** on your iPhone.

**Dev Server Details**:
- 🔗 **URL**: http://192.168.68.73:8081
- 📍 **Location**: Your Mac (liveedge/mobile-app)
- ⚙️ **Status**: Running (no bundling errors)

---

## 🍎 How to Test on Your iPhone Tomorrow

### Step 1: Install Expo Go
Download **Expo Go** from the App Store (free):
- Search for "Expo Go"
- Install the app with your Apple ID

### Step 2: Get the QR Code
When you're ready to test, run this on your Mac terminal:

```bash
cd /Users/aaronm/Documents/liveedge/mobile-app
npx expo-cli@latest start --qr-code
# Or just: npm start
```

You'll see output like:
```
Expo Go (iOS)
‾‾‾‾‾‾‾‾‾‾‾‾
[QR CODE WILL DISPLAY HERE]
```

### Step 3: Scan & Run
1. Open **Expo Go** app on your iPhone
2. Tap the camera icon in the top-right
3. Point at your Mac screen to **scan the QR code**
4. The app will load automatically (10-15 seconds)

---

## 🧪 What to Test

Once the app loads, you'll see the **login screen**:

### Test 1: Login
- **Field**: Username or Email
- **Test Value**: `test@example.com`
- **Click**: "Continue"
- **Expected**: Prompts for OTP code
- **Note**: Any 6-digit code works (dev mode)

### Test 2: OTP Verification
- **Field**: 6-digit code
- **Test Value**: `123456` (any 6 digits)
- **Click**: "Verify"
- **Expected**: Redirects to route list

### Test 3: Route View (Today's Deliveries)
- **Expect**: List of 5+ mock deliveries
- **Details**: SO#, Customer name, Address, Status badge
- **Action**: Pull down to refresh
- **Expected**: Progress bar updates

### Test 4: Delivery Details
- **Action**: Tap any delivery (blue card)
- **Expected**: Full stop details appear
  - Sales order number (large)
  - Customer name
  - Full address
  - Status (pending/delivered/skipped)
  
### Test 5: Mark Complete / Skip
- **Action**: Tap "✓ Mark Delivered" button
- **Expected**: Status updates, screen returns to route list, delivery shows "✓ Delivered"
- **Alternative**: Tap "✗ Skip Delivery" → prompts for reason

### Test 6: Session Persistence
- **Action**: Close Expo Go app completely
- **Wait**: 10 seconds
- **Reopen**: Expo Go and scan QR again
- **Expected**: App remembers login, shows route list (not login screen)

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| QR code won't scan | Make sure iPhone is on same WiFi as Mac |
| "Cannot connect to server" | Check IP address in terminal output (`192.168.x.x`) |
| App blank/loading forever | Check Mac terminal for errors (ctrl+C, `npm start` again) |
| Login screen loops | Token may be invalid; clear app storage in Expo Go settings |

---

## 🎬 Demo Flow (5 minutes)

**If demoing to someone else**:

1. **Show Login**: "Drivers sign in with email"
   - Enter email → get OTP → verify
   
2. **Show Route List**: "See all stops for the day"
   - Swipe to show multiple deliveries
   - Pull-to-refresh
   - Show progress bar
   
3. **Show Delivery Details**: "Tap to see address details"
   - Tap a delivery
   - Show full address + customer name
   
4. **Mark Complete**: "Driver marks delivery done"
   - Tap "Mark Delivered"
   - Show status updates
   - Return to list
   
5. **Session**: "Even if phone closes, you're still logged in"
   - Close app, reopen
   - Already logged in!

**Total time**: ~3-4 minutes

---

## 📝 What's NOT Ready Yet

These features will be added in future phases:

- ❌ **Photo Capture**: POD photos (Phase 4)
- ❌ **Offline Sync**: Works without internet (Phase 5)
- ❌ **Notifications**: Toast messages (Phase 3)
- ❌ **Real API**: Uses mock data for now

---

## 🚀 Keep Dev Server Running

To keep the server running all night:

```bash
# Start in a new terminal window, let it run
cd /Users/aaronm/Documents/liveedge/mobile-app
npm start
# Don't close this terminal
```

Or if you close the terminal, just restart before testing:
```bash
npm start
```

---

## ❓ If Something Breaks

1. **Check terminal** on Mac for error messages
2. **Quit Expo Go** (swipe up on iPhone)
3. **Restart**: `Ctrl+C` in terminal, then `npm start`
4. **Rescan** QR code

---

## 📱 Summary

✅ **App is live and testable**  
✅ **No errors in the code**  
✅ **Dev server running 24/7**  
✅ **Ready for iPhone demo**  

**Next steps**:
1. Download Expo Go tomorrow
2. Connect iPhone to same WiFi as your Mac
3. Run `npm start` in mobile-app directory
4. Scan QR code
5. Test the flows above

Enjoy the demo! 🎉
