# Mobile App Test Plan — Phase 3-5 Complete

## Test Environment
- **Device**: iPhone (real or Simulator)
- **App**: Expo Go
- **Backend**: LiveEdge dev/staging API (configured in .env)
- **Network**: Test both online and offline scenarios

---

## Test Cases

### 1. Authentication Flow
**Objective**: Verify login and session persistence

- [ ] **1.1 Request OTP**
  - Open app, see login screen
  - Enter valid username
  - Tap "Send Code"
  - Verify code email received (or check server logs)

- [ ] **1.2 Verify OTP**
  - Enter 6-digit code from email
  - Tap "Verify"
  - Should see branch selection screen

- [ ] **1.3 Select Branch**
  - Choose a branch (e.g., "Grimes")
  - Tap "Continue"
  - Should navigate to route list

- [ ] **1.4 Session Persistence**
  - Close app completely
  - Reopen
  - Should skip login, go directly to route list
  - Session should persist across restarts

---

### 2. Route List & Navigation
**Objective**: Verify route display, status, and navigation

- [ ] **2.1 Route Display**
  - See today's deliveries listed
  - Each card shows:
    - SO number (large/bold)
    - Customer name
    - Address (city, state)
    - Status badge (Pending/Delivered/Skipped)
  - Verify count matches backend

- [ ] **2.2 Progress Bar**
  - Progress bar shows completion % at top
  - Updates as deliveries are marked

- [ ] **2.3 Pull-to-Refresh**
  - Pull down on list
  - Verify refresh spinner appears
  - List refreshes from server

- [ ] **2.4 Tap to Navigate**
  - Tap any delivery card
  - Navigate to delivery detail screen
  - SO number matches

---

### 3. Delivery Details Screen
**Objective**: Verify detail view, photo capture, and status updates

- [ ] **3.1 Detail Display**
  - SO number shown (large)
  - Customer name, address complete
  - Status badge visible
  - Last updated timestamp present

- [ ] **3.2 Photo Grid Display**
  - Photo grid section visible (empty initially)
  - "No photos yet" message shown
  - "Take a Photo" button visible

- [ ] **3.3 Open Camera**
  - Tap "Take a Photo" or "Add Photo" button
  - Camera modal opens
  - Camera live preview visible
  - Capture button (green circle) visible
  - Close button (X) visible

- [ ] **3.4 Capture Photo**
  - Tap capture button
  - Hear/see photo capture feedback (if device supports)
  - Modal closes
  - Toast "Photo captured" appears
  - Photo thumbnail appears in grid

- [ ] **3.5 Multiple Photos**
  - Take 3+ photos
  - All appear in photo grid
  - Can scroll horizontally through photos
  - Photo count updates ("Photos (3)")

- [ ] **3.6 Remove Photo**
  - Tap X button on any photo
  - Photo disappears from grid
  - Count updates

---

### 4. Delivery Status Updates — Online
**Objective**: Verify status update, photo upload, and sync when online

- [ ] **4.1 Mark Delivered (No Photos)**
  - Navigate to a pending delivery
  - Ensure WiFi/mobile is ON
  - Tap "Mark Delivered"
  - Button shows "Updating..." with spinner
  - Toast "✓ Marked delivered" appears
  - Screen returns to route list
  - Delivery shows "Delivered" status in list

- [ ] **4.2 Mark Delivered (With Photos)**
  - Navigate to another pending delivery
  - Take 2 photos
  - Tap "Mark Delivered"
  - Button shows "Uploading..." (photo phase)
  - Then "Updating..." (status phase)
  - Toast appears: "✓ Marked delivered"
  - Route list updates
  - Delivery shows "Delivered"

- [ ] **4.3 Mark Skipped**
  - Navigate to pending delivery
  - Tap "Mark Skipped"
  - Prompt asks for reason
  - Enter reason (e.g., "Not ready")
  - Delivery marked as "Skipped"
  - Toast "✓ Marked skipped" appears

- [ ] **4.4 Empty Reason for Skip**
  - Tap "Mark Skipped" on another delivery
  - Leave reason blank
  - Tap "Skip"
  - Should still mark as skipped (reason optional)

---

### 5. Offline Behavior
**Objective**: Verify offline queue, optimistic updates, and error handling

- [ ] **5.1 Go Offline**
  - In delivery detail, turn off WiFi
  - Wait 3-5 seconds for sync status to update

- [ ] **5.2 Offline Warning**
  - Red dot + "No connection" appears in sync status bar
  - Below action buttons: "⚠️ Offline - Changes will sync when you're back online"

- [ ] **5.3 Mark Delivered Offline**
  - Tap "Mark Delivered"
  - Optimistic update: status badge changes to green "Delivered"
  - Toast: "No connection - saved offline"
  - Button returns to normal (not disabled)
  - Can navigate back to route list
  - Delivery still shows "Delivered" in list (optimistic)

- [ ] **5.4 Take Photo Offline**
  - Go back to another pending delivery (still offline)
  - Take a photo
  - Photo appears in grid normally
  - Mark as delivered
  - Toast: "No connection - saved offline"

- [ ] **5.5 View Sync Status**
  - While offline, scroll to top of route list
  - Sync status bar shows:
    - Red indicator
    - "No connection"
    - Or "X pending" if there are queued deliveries

---

### 6. Online Reconnection & Auto-Sync
**Objective**: Verify auto-sync when connectivity returns

- [ ] **6.1 Reconnect WiFi**
  - Re-enable WiFi while in app
  - Wait 2-5 seconds

- [ ] **6.2 Sync Status Updates**
  - Sync status changes from red to yellow
  - Shows "Syncing..." with spinner
  - Pending count visible (e.g., "2 pending")

- [ ] **6.3 Sync Completes**
  - Wait for sync to finish
  - Sync status clears or shows checkmark
  - Toast "✓ Synced" appears (or no error)
  - Pending count returns to 0

- [ ] **6.4 Verify Server State**
  - Navigate back to route list
  - Pull-to-refresh
  - All offline deliveries now show as "Delivered" on server
  - Photos visible in delivery detail

---

### 7. Network Error Handling
**Objective**: Verify graceful error handling and retry logic

- [ ] **7.1 Photo Upload Fails**
  - Connect to WiFi but block/throttle network to API
  - Take photos and mark delivered
  - Photo upload shows error
  - Toast: "Photo upload failed - will retry later"
  - Status still updates (photos can fail without blocking delivery update)

- [ ] **7.2 Status Update Fails**
  - Intentionally break connection to `/api/dispatch/orders/[SO]/deliver`
  - Mark delivery
  - Request retries with backoff (1s, 5s, 30s, 5min)
  - Toast shows error after final retry
  - Delivery queued for later sync

- [ ] **7.3 Manual Retry via Sync**
  - After error, reconnect network
  - Tap any action to trigger sync or wait for auto-sync
  - Pending delivery retries
  - Should eventually succeed

---

### 8. Toast Notifications
**Objective**: Verify toast messages appear correctly and clear

- [ ] **8.1 Success Toast**
  - Mark delivery delivered
  - Green toast: "✓ Marked delivered"
  - Auto-dismisses after 3s
  - Can manually dismiss by tapping

- [ ] **8.2 Error Toast**
  - Trigger a network error
  - Red toast with error message
  - Shows for 4s before auto-dismiss

- [ ] **8.3 Info Toast**
  - Go offline
  - Mark delivery
  - Blue toast: "No connection - saved offline"
  - Auto-dismisses after 3s

- [ ] **8.4 Multiple Toasts**
  - Trigger multiple updates quickly
  - Toasts stack vertically
  - Each has independent dismiss timer

---

### 9. Sync Status Indicator
**Objective**: Verify the status bar at top of route list

- [ ] **9.1 Online State**
  - WiFi on, no pending deliveries
  - Status bar hidden or shows checkmark

- [ ] **9.2 Offline State**
  - Turn WiFi off
  - Status bar shows red dot + "No connection"
  - Does not hide

- [ ] **9.3 Pending State**
  - Offline with 1+ pending deliveries
  - Status bar shows yellow dot + "2 pending"
  - Count updates as you mark deliveries

- [ ] **9.4 Syncing State**
  - Reconnect WiFi
  - Status bar shows spinner + "Syncing..."
  - Disappears after sync completes

---

### 10. Edge Cases & Stress
**Objective**: Test unusual scenarios and robustness

- [ ] **10.1 Rapid Offline/Online Toggles**
  - Toggle WiFi on/off quickly (3-5 times)
  - App should not crash
  - Sync queue should handle cleanly

- [ ] **10.2 Large Photo**
  - Take a high-quality photo
  - Verify compressed to 70% before upload
  - Should upload within reasonable time

- [ ] **10.3 Many Photos**
  - Capture 10+ photos on one delivery
  - Grid should scroll smoothly
  - Upload should handle batch

- [ ] **10.4 App Background**
  - Mark delivery, then immediately minimize app
  - Allow sync to run in background
  - Reopen app
  - Sync should have completed
  - Status should reflect server state

- [ ] **10.5 Rapid Delivery Navigation**
  - Navigate through 5+ deliveries quickly
  - Tap back/forward rapidly
  - App should not crash or leak memory

---

## Pass/Fail Criteria

**PASS**: All test cases pass without crashes or unexpected behavior
- Status updates appear and persist
- Photos capture and upload
- Offline queue works and auto-syncs
- Toasts appear correctly
- Sync status visible and accurate

**FAIL**: Any of the following
- App crashes at any point
- Status updates don't persist after refresh
- Photos fail to capture or display
- Sync doesn't trigger on reconnect
- Misleading toast messages

---

## Log Collection

During testing, collect:
1. **Console logs** from Expo Go (shake device, show logs)
2. **Server logs** from backend API
3. **Network requests** (if possible, via proxy)

---

## Notes

- All times are approximate; actual sync may vary by network
- First test should be with fresh login to verify auth
- Test on real iPhone if possible (Simulator may behave differently for camera)
- Screenshots welcome for documentation
