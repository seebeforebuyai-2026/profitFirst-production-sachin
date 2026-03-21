# Step 1: Onboarding-to-Dashboard Transition
## 100% Production-Ready Plan

---

## PHASE 1: Backend - Onboarding Completion

### What Happens When Shiprocket Saves Successfully

```
1. Shiprocket API returns valid token (200 OK)
2. Save INTEGRATION#SHIPROCKET record:
   - platform: "shiprocket"
   - email (encrypted)
   - password (encrypted)
   - token (encrypted)
   - expiresAt: current + 10 days
   - status: "active"
   - connectedAt: now
3. UPDATE PROFILE record with:
   - onboardingStep: 5 (completed all 4 steps)
   - onboardingCompleted: true
   - step4CompletedAt: now
   - cogsCompleted: false
   - initialSyncCompleted: false
   - dashboardUnlocked: false
4. Return success to frontend
```

### Important: Do NOT Set dashboardUnlocked Yet
```
Dashboard must stay locked until:
  ✅ cogsCompleted = true (all variants have costPrice > 0)
  ✅ initialSyncCompleted = true (all 3 platform syncs done)
```

### Phase 1 Update: Final Step Index
```
When Shiprocket (Step 4) is saved successfully:
  → onboardingStep: 6 (This signifies "Onboarding Wizard Closed")
  → onboardingCompleted: true
  → dashboardUnlocked: false (still locked, waiting for COGS + sync)
```

---

## PHASE 2: Frontend - Navigation

### What Happens After Shiprocket Save

```
1. Frontend receives: { success: true, currentStep: 6 }
2. Store tokens in localStorage/sessionStorage
3. Redirect to /dashboard (NOT /onboarding/step5)
4. Clear onboarding state from memory
```

### React Router Setup

```
Route: /dashboard
  → Check dashboardUnlocked from PROFILE
  → If false: Show locked dashboard (blur + welcome popup)
  → If true: Show full dashboard with data
```

---

## PHASE 3: Dashboard "Gatekeeper" Logic

### Dashboard.jsx - On Mount

```
1. Call GET /api/auth/profile
2. Check dashboardUnlocked flag
3. If false:
   - Apply CSS blur to main content: filter: blur(8px)
   - Disable all sidebar items except "Products"
   - Show welcome modal (non-dismissible)
4. If true:
   - Remove blur
   - Enable all sidebar items
   - Load dashboard data
```

### Welcome Modal Content

```
┌─────────────────────────────────────────────┐
│  👋 Welcome to ProfitFirst!                 │
│                                             │
│  To see your real profit, first set your   │
│  product costs (COGS).                      │
│                                             │
│  [→ Set Up Products]                        │
└─────────────────────────────────────────────┘
```

---

## PHASE 4: Sidebar Lock Implementation

### Sidebar.jsx - Lock Logic

```
For each menu item:
  - If item === "Products":
      → Show as active (green highlight)
      → Allow click
  - Else:
      → Show lock icon 🔒
      → Disable click
      → Show tooltip: "Unlock dashboard to access"
```

### CSS for Blur Effect

```css
.dashboard-locked {
  filter: blur(8px);
  pointer-events: none;
}

.sidebar-locked .menu-item:not(.products) {
  opacity: 0.5;
  pointer-events: none;
}
```

---

## PHASE 5: Products Page - Sequential Trigger

### Products.jsx - On Mount

```
1. Call POST /api/products/trigger-fetch
   → Creates SQS job for product fetch ONLY
   → Returns immediately: { success: true }

2. Poll GET /api/products/list every 5 seconds
   → Show "Fetching products..." spinner
   → When products appear, show table

3. User enters COGS for all variants

4. User clicks [Save All Costs]
   → POST /api/products/save-cogs called
   → Backend updates VARIANT# records with costPrice
   → Backend sets PROFILE.cogsCompleted = true

5. IF save-cogs returns success:
   → THEN automatically call POST /api/sync/start-initial
   → Creates 3 SQS jobs:
      - SHOPIFY_SYNC (last 90 days)
      - META_SYNC (last 90 days)
      - SHIPROCKET_SYNC (last 90 days)
   → Returns immediately: { success: true }

6. Poll GET /api/sync/status every 10 seconds
   → Show progress bars for each platform
   → Update: "Shopify 45% | Meta 20% | Shiprocket 0%"
```

### Why Sequential (Not Parallel)?

```
Product Fetch First:
  → User sees products with COGS inputs
  → User enters costs
  → Save-cogs stamps costPrice on VARIANT# records

Then Sync Starts:
  → Worker fetches orders
  → Worker looks up costPrice from VARIANT# records
  → Worker stamps cogsAtSale on ORDER# records
  → Historical profit is accurate from day 1

If we did parallel:
  → Orders sync before COGS set
  → cogsAtSale = 0 for all orders
  → Profit calculations wrong
  → User has to manually fix later
```

### Products Table - Initial State

```
Product Name    │ Variant  │ Sale Price │ Your Cost
─────────────────────────────────────────────────────
T-Shirt         │ Size S   │ ₹499       │ [  0  ]
T-Shirt         │ Size M   │ ₹499       │ [  0  ]
T-Shirt         │ Size L   │ ₹499       │ [  0  ]
Jeans           │ 32 inch  │ ₹999       │ [  0  ]
Jeans           │ 34 inch  │ ₹999       │ [  0  ]

[Save All Costs]
```

---



## PHASE 6: Production Edge Cases

### Edge Case 1: Manual URL Bypass

```
Problem: User types /analytics directly in browser

Solution: React Router Protected Route
  → Check dashboardUnlocked from PROFILE
  → If false: Redirect to /dashboard
  → If true: Allow access

Implementation:
  <Route path="/analytics" element={
    <ProtectedRoute requireUnlock={true}>
      <AnalyticsPage />
    </ProtectedRoute>
  } />
```

### Edge Case 2: Page Refresh During Setup

```
Problem: User refreshes /products page

Solution: 
  → GET /api/auth/profile on mount
  → If dashboardUnlocked = false:
      → Show Products page (setup phase)
      → Continue polling products + sync status
  → If dashboardUnlocked = true:
      → Redirect to /dashboard
```

### Edge Case 3: User Leaves and Returns

```
Problem: User closes browser, comes back later

Solution:
  → GET /api/auth/profile
  → If dashboardUnlocked = false:
      → Show locked dashboard with current progress
      → Resume polling
  → If dashboardUnlocked = true:
      → Show full dashboard
```

### Edge Case 4: Dashboard Remains Blurred

```
Dashboard stays locked until BOTH:
  ✅ cogsCompleted = true (all variants have costPrice > 0)
  ✅ initialSyncCompleted = true (all 3 platform syncs complete)

If only one is true:
  → Dashboard stays locked
  → Show message: "Waiting for [missing condition]..."
```

---

## PHASE 7: SQS Queue Setup (AWS)

### Create These Queues

```
1. profitfirst-sync-queue (Main Queue)
   → Visibility timeout: 15 minutes
      (Gives worker enough time for large pages + rate-limit backoffs)
   → Message retention: 4 days
   → Redrive policy: points to DLQ

2. profitfirst-sync-dlq (Dead Letter Queue)
   → Visibility timeout: 14 days
   → Used for jobs that fail 3 times
   → CloudWatch alert when messages arrive
```

### Why 15 Minutes Visibility Timeout?

```
Problem: 50,000 products or 100,000 orders
         Shopify rate limits (2 req/sec)
         Worker needs time to paginate through all data

Calculation:
  50,000 products ÷ 250 per page = 200 pages
  200 pages × 0.5s per page = 100 seconds
  Plus rate limit backoffs = ~12-15 minutes total

If timeout is 5 minutes:
  → Worker crashes mid-way
  → Job reappears in queue
  → Duplicate processing possible

If timeout is 15 minutes:
  → Worker completes all pages
  → Job marked as done
  → No duplicates, no crashes
```

### SQS Job Types

```
{ type: "PRODUCT_FETCH", merchantId }
{ type: "SHOPIFY_SYNC", merchantId, sinceDate, lastSyncedOrderId }
{ type: "META_SYNC", merchantId, sinceDate, lastSyncedDate }
{ type: "SHIPROCKET_SYNC", merchantId, sinceDate, lastSyncedShipmentId }
{ type: "SUMMARY_CALC", merchantId, fromDate, toDate }
```

---

## PHASE 8: Data Storage Strategy

### DynamoDB vs S3 Split

```
DynamoDB (Slim Fields Only):
  MERCHANT#<id> | ORDER#<orderId>
    - orderId, orderTotal, currency
    - paymentType, orderStatus, deliveryStatus
    - cogsAtSale, shippingFee, gatewayFee
    - lineItems (slim: productId, variantId, quantity, price)
    - rawDataS3Url (pointer to S3)
    - createdAt, updatedAt
  → Size: < 5KB per item

S3 (Raw JSON):
  profitfirst-raw-data/
    <merchantId>/
      orders/
        <shopifyOrderId>.json (full Shopify API response)
  → Size: 100KB - 500KB per file
  → Cost: ~$0.023 per GB/month
```

---

## PHASE 9: Timezone Handling

### IST Enforcement

```
All timestamps stored in UTC in DynamoDB

When calculating SUMMARY#<date>:
  1. Read orderCreatedAt (UTC)
  2. Convert to Asia/Kolkata timezone
  3. Use IST date as the summary key

Example:
  Order created: 2026-03-05 20:30 UTC
  = 2026-03-06 02:00 IST
  → Goes into SUMMARY#2026-03-06 (not 2026-03-05)
```

### Library to Use

```
Use: date-fns-tz (lightweight, tree-shakeable)
Or: moment-timezone (if already using moment)

Example:
  import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
  const istDate = utcToZonedTime(orderCreatedAt, 'Asia/Kolkata');
  const summaryKey = format(istDate, 'yyyy-MM-dd');
```

---

## PHASE 10: Success Criteria

### What Must Work

```
✅ User completes Shiprocket onboarding
✅ Backend sets onboardingCompleted: true, dashboardUnlocked: false
✅ Frontend redirects to /dashboard
✅ Dashboard is blurred, only Products tab clickable
✅ Welcome modal appears (non-dismissible)
✅ User clicks "Set Up Products"
✅ POST /api/products/trigger-fetch called
✅ POST /api/sync/start-initial called
✅ Products page shows "Fetching products..." spinner
✅ SQS jobs created (check AWS console)
✅ Products appear in table (paginated)
✅ Sync progress bars show Shopify/Meta/Shiprocket status
✅ User enters COGS for all variants
✅ POST /api/products/save-cogs called
✅ PROFILE.cogsCompleted = true
✅ Wait for sync to complete
✅ PROFILE.initialSyncCompleted = true
✅ PROFILE.dashboardUnlocked = true
✅ Blur removed, all sidebar items clickable
✅ Dashboard shows real data from SUMMARY# records
```

---

## CURRENT STATUS

```
✅ Onboarding flow complete
✅ Shiprocket saves to DynamoDB
✅ All tokens encrypted
⏳ Step 1: Dashboard lock + Products page (THIS FILE)
⏳ Step 2: Products API + SQS worker
⏳ Step 3: Sync Status API
⏳ Step 4: Shopify/Meta/Shiprocket workers
⏳ Step 5: Summary calculator
⏳ Step 6: Frontend locked dashboard
⏳ Step 7: Products/COGS page
⏳ Step 8: Sync progress UI
⏳ Step 9: Dashboard unlock + data display
```

---

## NEXT ACTION

```
Start with Step 1 Implementation:

1. Backend: Update Shiprocket save logic
   → Add PROFILE update with dashboardUnlocked: false
   → File: Profitfirst/Auth-service/services/onboarding.service.js

2. Frontend: Update Shiprocket success handler
   → Redirect to /dashboard
   → Clear onboarding state
   → File: Profitfirst/frontend-profit-first/client/src/pages/Step4.jsx

3. Frontend: Create Dashboard lock logic
   → Check dashboardUnlocked on mount
   → Apply blur if false
   → Show welcome modal
   → File: Profitfirst/frontend-profit-first/client/src/MainDashboard.jsx

4. Frontend: Create Products page
   → Auto-trigger fetch + sync on mount
   → Show products table with COGS inputs
   → Show sync progress
   → File: Profitfirst/frontend-profit-first/client/src/pages/Products.jsx
```

---

## IMPORTANT: Do NOT Skip These

```
❌ Do NOT set dashboardUnlocked: true during onboarding
❌ Do NOT show dashboard data before cogsCompleted = true
❌ Do NOT calculate dashboard from raw orders (always use SUMMARY#)
❌ Do NOT fetch products inline (use SQS to avoid timeout)
❌ Do NOT store raw JSON in DynamoDB (use S3 + rawDataS3Url)
❌ Do NOT forget IST timezone (all summaries must use Asia/Kolkata)
❌ Do NOT allow one platform failure to block others
❌ Do NOT skip SQS DLQ (jobs that fail 3 times must go to DLQ)
```

Here are the only changes required:
Change 1: Phase 5 (The Sequence)
The Problem: Your plan currently says to trigger Product Fetch and Order Sync in parallel on mount.
The Fix: Change Phase 5 to Sequential. We must fetch products first, let the user save costs, and then start the 365-day sync.
Update Phase 5 to this:
PHASE 5: Products Page - Sequential Trigger
On Mount: Call POST /api/products/trigger-fetch (Starts Product SQS job ONLY).
Polling: Poll GET /api/products/list until products appear.
User Action: User enters COGS for all variants and clicks [Save All Costs].
The Trigger: IF save-cogs returns success, THEN the frontend automatically calls POST /api/sync/start-initial (Starts the 365-day Order/Ads/Shipping sync).
Why? This ensures orders are stamped with correct costs immediately during sync.
Change 2: Phase 1 (The Final Step Index)
The Problem: To be consistent with your current code, we should define what "finished" looks like.
The Fix: When Shiprocket (Step 4) is saved, set onboardingStep to 6.
Update Phase 1, Point 3 to this:
UPDATE PROFILE record with:
onboardingStep: 6 (This signifies "Onboarding Wizard Closed, Moving to Product Setup")
onboardingCompleted: true
dashboardUnlocked: false
Change 3: Phase 7 (SQS Timeout)
The Problem: You have "Visibility timeout: 5 minutes."
The Fix: For 50,000+ products or 100,000 orders, a worker might need more than 5 minutes if Shopify rate limits are tight.
Update Phase 7 to this:
profitfirst-sync-queue (Main Queue)
Visibility timeout: 15 minutes (Gives the worker enough time to handle large pages and rate-limit backoffs without the job reappearing in the queue).
🏆 Final Confirmation
Other than those 3 specific updates, your plan is perfect.

✅ What is COMPLETED and works correctly:
Identity: Signup, OTP, and Login are perfect.
Connections: Shopify, Meta, and Shiprocket credentials are encrypted and saved.
Redirect: When you finish onboarding, you land on the Dashboard.
Gatekeeper: The Dashboard is blurred, the Welcome Modal appears, and the Sidebar is locked.
Navigation: You can click "Set Up Products" and go to the /dashboard/products page.
Backend API: The routes to trigger a fetch, list products, and save costs are ready.

