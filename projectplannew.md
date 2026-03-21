# ProfitFirst - Master Production Plan
## Complete Architecture, Formulas, Implementation Guide & Next Steps

**Status:** Phases 1 & 2 Complete. Starting Phase 3.
**Goal:** Production-ready SaaS for 10,000+ merchants, 100,000+ orders each.
**Stack:** Node.js + React + AWS (DynamoDB Singapore, SQS, S3, Cognito, EventBridge)

---

## WHAT IS DONE (Phases 1 & 2)

```
✅ AWS Cognito auth (signup, OTP, login, password reset)
✅ Cognito sub = merchantId everywhere (single source of truth, no UUIDs)
✅ DynamoDB single table: ProfitFirst_Core (Singapore ap-southeast-1)
✅ No DynamoDB writes on signup/OTP - only on first login
✅ Onboarding Step 1: Business info → updates PROFILE
✅ Onboarding Step 2: Shopify → INTEGRATION#SHOPIFY (token encrypted)
✅ Onboarding Step 3: Meta → INTEGRATION#META (token encrypted, 60-day expiry)
✅ Onboarding Step 4: Shiprocket → auto-generates token from email+password
                      INTEGRATION#SHIPROCKET (token+password encrypted, 10-day expiry)
✅ AES-256-CBC encryption for all tokens
✅ Rate limiting, CORS, Helmet security headers
✅ Graceful shutdown, health endpoint
```

---

## THE GOLDEN RULES (Never Break These)

```
Rule 1: NEVER process heavy tasks inside an API request
        → API creates SQS job → returns immediately → worker does the work

Rule 2: NEVER calculate dashboard from raw ORDER records
        → Always read from SUMMARY#<date> records
        → Dashboard loads in milliseconds even with 1 million orders

Rule 3: ALWAYS use idempotent keys
        → ORDER#<shopifyOrderId> → same order synced 10 times = same record, no duplicates

Rule 4: ALWAYS store raw JSON in S3, not DynamoDB
        → DynamoDB limit = 400KB per item
        → Shopify order JSON can be 300KB+ with many line items
        → Store slim fields in DynamoDB + rawDataS3Url pointing to S3

Rule 5: ALWAYS fetch data in ASCENDING order (oldest first)
        → Use since_id for Shopify (cursor-based, no gaps)
        → Use date-by-date for Meta
        → Use page+sort for Shiprocket

Rule 6: ALWAYS save sync progress (lastSyncedId)
        → If worker crashes → resume from where it stopped, not from beginning

Rule 7: ALWAYS encrypt tokens before storing
        → Shopify, Meta, Shiprocket tokens + Shiprocket password

Rule 8: ALWAYS use IST timezone for daily summaries
        → All raw timestamps stored in UTC
        → SUMMARY#YYYY-MM-DD calculated based on Asia/Kolkata (IST) 00:00-23:59

Rule 9: ALWAYS freeze COGS at order time
        → When order is synced, copy current costPrice into order as cogsAtSale
        → If merchant changes COGS later, old orders keep their original cost
        → Historical profit stays accurate forever

Rule 10: NEVER allow one platform failure to block others
         → Shopify sync fails → Meta and Shiprocket continue
         → Show retry button per platform
```


---

## DYNAMODB COMPLETE SCHEMA

### Table: ProfitFirst_Core (Singapore ap-southeast-1)
```
PK = MERCHANT#<cognitoSub>
SK = entity type
```

### Every Record Type

```
MERCHANT#<id> | PROFILE
  merchantId, userId, email, firstName, lastName
  authProvider, isVerified
  onboardingStep, onboardingCompleted
  cogsCompleted, initialSyncCompleted, dashboardUnlocked
  businessName, businessType, phone, whatsapp
  paymentGatewayFeePercent (default: 2.5)
  createdAt, updatedAt, lastLogin

MERCHANT#<id> | INTEGRATION#SHOPIFY
  platform: "shopify"
  shopifyStore, accessToken (encrypted)
  shopName, shopDomain, shopEmail, currency, timezone
  status: "active"
  connectedAt, lastSyncTime, lastSyncedOrderId
  syncStatus: "idle" | "in_progress" | "completed" | "failed"

MERCHANT#<id> | INTEGRATION#META
  platform: "meta"
  adAccountId, accessToken (encrypted)
  expiresAt (60 days from connection)
  status: "active"
  connectedAt, lastSyncTime, lastSyncedDate

MERCHANT#<id> | INTEGRATION#SHIPROCKET
  platform: "shiprocket"
  email, password (encrypted), token (encrypted)
  expiresAt (10 days from connection)
  status: "active"
  connectedAt, lastSyncTime, lastSyncedShipmentId

MERCHANT#<id> | PRODUCT#<shopifyProductId>
  productId (shopify ID), productName
  productType, tags
  createdAt, updatedAt

MERCHANT#<id> | VARIANT#<shopifyVariantId>
  variantId (shopify ID), productId
  variantName (Size S, Color Red, etc.)
  sku, salePrice
  costPrice (COGS - entered by merchant, default 0)
  cogsSetAt
  createdAt, updatedAt

MERCHANT#<id> | ORDER#<shopifyOrderId>
  orderId (shopify ID), orderNumber
  orderTotal, currency
  paymentType: "prepaid" | "cod"
  orderStatus: "pending" | "paid" | "cancelled" | "refunded"
  fulfillmentStatus: "unfulfilled" | "fulfilled" | "partial"
  deliveryStatus: "pending" | "in_transit" | "delivered" | "rto" | "cancelled"
  lineItems: [{ productId, variantId, quantity, price, cogsAtSale }]
  cogsAtSale (total COGS frozen at time of order)
  shippingFee (from Shiprocket)
  gatewayFee (calculated: prepaidAmount × gatewayFeePercent)
  discountAmount
  orderCreatedAt, orderPaidAt, orderFulfilledAt
  orderDeliveredAt, orderCancelledAt
  shiprocketShipmentId, awbCode
  rawDataS3Url (full Shopify JSON stored in S3)
  createdAt, updatedAt

MERCHANT#<id> | SHIPMENT#<shiprocketShipmentId>
  shipmentId (shiprocket ID), orderId (shopify order ID)
  awbCode, carrier
  deliveryStatus: "pending" | "in_transit" | "delivered" | "rto" | "cancelled"
  shippingFee, returnShippingFee (for RTO)
  estimatedDelivery
  shipmentCreatedAt, deliveredAt, rtoAt
  rawDataS3Url
  createdAt, updatedAt

MERCHANT#<id> | ADS#<date>#<campaignId>
  date (YYYY-MM-DD IST), campaignId (meta ID)
  campaignName, adsetId, adId
  spend, impressions, clicks, reach
  purchases, purchaseValue (from Meta pixel if available)
  rawDataS3Url
  createdAt, updatedAt

MERCHANT#<id> | EXPENSE#<expenseId>
  expenseId, expenseType
  Types: "agency_fee" | "staff_salary" | "office_rent" | "tools_software"
         "rto_handling_fee" | "payment_gateway_fee" | "other"
  amount, date (YYYY-MM-DD IST)
  description, category
  createdAt, updatedAt

  in business expence as the monthly bases need to use (agency_fee" | "staff_salary" | "office_rent" | "tools_software")


MERCHANT#<id> | SUMMARY#<date>
  date (YYYY-MM-DD IST)
  -- Revenue --
  revenueGenerated    (ALL orders total, including pending/cancelled)
  revenueEarned       (DELIVERED orders only)
  discountsGiven      (discounts on delivered orders)
  netRevenue          (revenueEarned - discountsGiven)
  -- Costs --
  cogs                (SUM of cogsAtSale for delivered orders)
  adsSpend            (Meta ads spend for this IST day)
  shippingSpend       (Shiprocket fees for delivered orders)
  returnShippingCost  (Shiprocket fees for RTO orders)
  gatewayFees         (prepaid revenue × gatewayFeePercent)
  businessExpenses    (manual expenses for this day)
  -- Profit --
  grossProfit         (netRevenue - cogs)
  netProfit           (netRevenue - cogs - adsSpend - shippingSpend - returnShippingCost - gatewayFees - businessExpenses)
  profitMargin        (netProfit / netRevenue × 100)
  -- Orders --
  totalOrders, deliveredOrders, rtoOrders, cancelledOrders, pendingOrders, inTransitOrders
  -- Ads --
  roas                (revenueGenerated / adsSpend)
  poas                (netProfit / adsSpend)
  -- Averages --
  aov                 (revenueGenerated / totalOrders)
  profitPerOrder      (netProfit / deliveredOrders)
  avgShippingPerOrder (shippingSpend / deliveredOrders)
  -- Risk --
  rtoRate             (rtoOrders / (deliveredOrders + rtoOrders) × 100)
  rtoRevenueLost      (SUM of order values for RTO orders)
  createdAt, updatedAt

MERCHANT#<id> | SYNC#SHOPIFY
  status: "pending" | "in_progress" | "completed" | "failed"
  totalOrders, completedOrders
  lastSyncedOrderId   (for crash recovery - resume from here)
  startedAt, completedAt, error

MERCHANT#<id> | SYNC#META
  status, totalDays, completedDays
  lastSyncedDate      (YYYY-MM-DD)
  startedAt, completedAt, error

MERCHANT#<id> | SYNC#SHIPROCKET
  status, totalShipments, completedShipments
  lastSyncedShipmentId
  startedAt, completedAt, error
```


---

## ALL DASHBOARD FORMULAS (Complete & Verified)

### Section 1: Revenue

```
Revenue Generated = SUM(order_total) for ALL orders on that day
                    Source: Shopify
                    Includes: pending, paid, cancelled, refunded

Revenue Earned = SUM(order_total) for DELIVERED orders only
                 Source: Shopify order_total + Shiprocket delivery_status = "delivered"

Discounts Given = SUM(total_discounts) for DELIVERED orders
                  Source: Shopify

Net Revenue = Revenue Earned - Discounts Given
```

### Section 2: Costs

```
COGS = SUM(cogsAtSale × quantity) for each line item in DELIVERED orders
       Source: cogsAtSale field frozen in ORDER record at sync time
       Note: Use cogsAtSale NOT current costPrice (historical accuracy)

Ads Spend = SUM(spend) from Meta Ads for that IST day
            Source: Meta Marketing API
            Note: Meta reports in UTC, convert to IST before storing

Shipping Spend = SUM(freight_charge) from Shiprocket for DELIVERED orders
                 Source: Shiprocket API
                 Note: Only count delivered orders, not RTO

Return Shipping Cost = SUM(freight_charge) for RTO orders
                       Source: Shiprocket API
                       Note: Merchant pays shipping even on returned orders

Payment Gateway Fees = SUM(prepaid_order_total) × (gatewayFeePercent / 100)
                       Source: Calculated
                       Default: 2.5% (editable by merchant in Settings)
                       Note: COD orders do NOT have gateway fees
                       Prepaid = orders where paymentType = "prepaid"

Business Expenses = SUM(amount) from EXPENSE records for that day
                    Source: Manually entered by merchant
                    Types: agency fees, staff salary, office rent, tools, other
```

### Section 3: Profit

```
Gross Profit = Net Revenue - COGS

Net Profit (Money Kept) = Net Revenue
                          - COGS
                          - Ads Spend
                          - Shipping Spend
                          - Return Shipping Cost
                          - Payment Gateway Fees
                          - Business Expenses

Profit Margin = (Net Profit / Net Revenue) × 100
                Show as percentage
```

### Section 4: Ads Performance

```
ROAS = Revenue Generated / Ads Spend
       Note: Try to fetch directly from Meta Ads Manager if available
             If not available, calculate using formula above

POAS = Net Profit / Ads Spend
       This is the MOST IMPORTANT metric
       POAS < 1.2 → High Risk (spending more than earning)
       POAS 1.2-2.5 → Moderate (sustainable)
       POAS > 2.5 → Scalable (tell merchant to spend more)

POAS Decision Logic:
  < 1.2  → "⚠️ High Risk: Your ad spend is eating your profit. Review campaigns."
  1.2-2.5 → "✅ Sustainable: Ads are profitable. Monitor closely."
  > 2.5  → "🚀 Scale Now: You earn ₹2.5+ profit for every ₹1 spent on ads."
```

### Section 5: Order Economics

```
Total Orders = COUNT(all orders) for that day
               Source: Shopify

Delivered Orders = COUNT(orders where deliveryStatus = "delivered")
                   Source: Shiprocket

RTO Orders = COUNT(orders where deliveryStatus = "rto")
             Source: Shiprocket

Cancelled Orders = COUNT(orders where orderStatus = "cancelled")
                   Source: Shopify

In Transit Orders = COUNT(orders where deliveryStatus = "in_transit")
                    Source: Shiprocket

RTO Rate = RTO Orders / (Delivered Orders + RTO Orders) × 100
           Risk Levels:
           < 15%  → Low Risk (green)
           15-30% → Medium Risk (yellow)
           > 30%  → High Risk (red)

AOV (Average Order Value) = Revenue Generated / Total Orders

Profit Per Order = Net Profit / Delivered Orders

Average Shipping Per Order = Shipping Spend / Delivered Orders

RTO Revenue Lost = SUM(order_total) for all RTO orders
                   (Revenue you expected but never received)
```

### Section 6: Pending / In-Transit Forecast

```
In Transit Count = COUNT(deliveryStatus = "in_transit")

Merchant Delivery Success Rate = Delivered Orders / (Delivered + RTO Orders) × 100
                                  Calculate from LAST 30 DAYS of data
                                  NOT a fixed 80% - use real merchant data

Expected Delivered = In Transit Count × (Merchant Delivery Success Rate / 100)

Expected Revenue = Expected Delivered × AOV

Risk Level = based on RTO Rate (see above)
```

### Section 7: Product Profitability

```
For each product (top 5 by revenue):

Product Revenue = SUM(line_item_price × quantity) for DELIVERED orders
Product COGS = SUM(cogsAtSale × quantity) for DELIVERED orders
Product Profit = Product Revenue - Product COGS
Product Margin = (Product Profit / Product Revenue) × 100
Delivered Quantity = SUM(quantity) for DELIVERED orders
```

### Section 8: Cost Leakage Breakdown

```
Show as a pie/bar chart:
- COGS: X%
- Ads Spend: X%
- Shipping: X%
- Return Shipping (RTO): X%
- Gateway Fees: X%
- Business Expenses: X%
- Net Profit: X%

All percentages of Net Revenue
```

### Section 9: Dashboard Date Ranges

```
Default view: Last 7 days
Available options: Today, Yesterday, Last 7 days, Last 30 days, Last 365 days, Custom range

How to fetch:
  GET /api/dashboard/summary?from=2026-03-01&to=2026-03-07
  Backend: Query SUMMARY# records for that date range
  Aggregate: SUM all fields across the date range
  Return: Single aggregated object

Important: All dates in IST (Asia/Kolkata)
```


---

## PHASE 3: DASHBOARD LOCK + PRODUCTS PAGE (NEXT STEP)

### What to Build

```
3A. Backend: Products API
  POST /api/products/trigger-fetch
    → Creates SQS job: { type: "PRODUCT_FETCH", merchantId }
    → Returns immediately: { success: true }

  GET /api/products/list?page=1&limit=50
    → Returns paginated products+variants from DynamoDB

  POST /api/products/save-cogs
    → Body: { variants: [{ variantId, costPrice }] }
    → Updates each VARIANT# record with costPrice
    → Checks if ALL variants have costPrice > 0. If yes: sets PROFILE.cogsCompleted = true
    → Returns: { success: true, cogsCompleted: true }

3B. Backend: SQS Product Fetch Worker
  → Picks up PRODUCT_FETCH job from SQS
  → Fetches products from Shopify: GET /products.json?limit=250
  → Uses since_id cursor for pagination (handles 50k+ products)
  → Each product → PRODUCT# record in DynamoDB
  → Each variant → VARIANT# record in DynamoDB (costPrice: 0)
  → Updates SYNC#PRODUCTS progress
  → When done: marks productFetchCompleted: true in PROFILE

3C. Frontend: Locked Dashboard
  → On /dashboard load: GET /api/auth/profile
  → If dashboardUnlocked = false:
      Apply CSS blur to main content area
      Disable all sidebar items except "Products"
      Show center popup:
        "Welcome! Set your product costs to unlock your dashboard."
        [→ Set Up Products] button

3D. Frontend: Products/COGS Page
  → On mount: call POST /api/products/trigger-fetch (starts Product SQS job ONLY)
  → Poll GET /api/products/list every 5 seconds until products appear
  → Show paginated table: Product | Variant | Sale Price | Your Cost [input]
  → "Bulk Apply" button: set same cost for all variants of one product
  → [Save All Costs] button → Calls POST /api/products/save-cogs
  → IF save is successful → THEN call POST /api/sync/start-initial (Starts 365-day sync!)
  → Show sync progress bar at top (polls /api/sync/status every 10s)
```

### Issue: Why NOT fetch products directly in API (timeout risk)

```
Problem: Merchant has 50,000 products
         GET /api/products/fetch-from-shopify would need 200 API calls
         Each call = 250 products
         200 calls × 0.5s = 100 seconds
         Node.js/Lambda timeout = 30 seconds → CRASH

Solution: SQS Worker
         API creates job → returns in <100ms
         Worker runs for as long as needed (no timeout)
         Frontend polls for progress
```

### Issue: Pagination for 50k products in frontend

```
Problem: Sending 50,000 products to React at once = browser freeze

Solution: Paginate
         GET /api/products/list?page=1&limit=50
         Show 50 products at a time
         "Load More" or page numbers
         Search/filter by product name
```


---

## PHASE 4: BACKGROUND SYNC ARCHITECTURE (SQS WORKERS)

### SQS Queue Setup

```
Main Queue: profitfirst-sync-queue
  → All sync jobs go here
  → Visibility timeout: 5 minutes
  → Message retention: 4 days

Dead Letter Queue: profitfirst-sync-dlq
  → Jobs that fail 3 times go here
  → CloudWatch alert when DLQ receives messages
  → Dev team investigates and retries manually
```

### Job Types in SQS

```
{ type: "PRODUCT_FETCH",    merchantId }
{ type: "SHOPIFY_SYNC",     merchantId, sinceDate, lastSyncedOrderId }
{ type: "META_SYNC",        merchantId, sinceDate, lastSyncedDate }
{ type: "SHIPROCKET_SYNC",  merchantId, sinceDate, lastSyncedShipmentId }
{ type: "SUMMARY_CALC",     merchantId, fromDate, toDate }
{ type: "COGS_RECALC",      merchantId, variantId, newCostPrice }
{ type: "DAILY_SYNC",       merchantId }
```


### Shopify Orders Worker (Most Complex)

```
Step 1: Read job from SQS
  { type: "SHOPIFY_SYNC", merchantId, sinceDate, lastSyncedOrderId }

Step 2: Get Shopify token from DynamoDB
  GET MERCHANT#<id> | INTEGRATION#SHOPIFY
  Decrypt accessToken

Step 3: Fetch orders page by page (ASCENDING - oldest first)
  If lastSyncedOrderId exists:
    GET /orders.json?since_id=<lastSyncedOrderId>&limit=250&status=any
  Else:
    GET /orders.json?created_at_min=<sinceDate>&limit=250&status=any&order=created_at+asc

Step 4: For each order in the page:
  a. Get variant IDs from line items
  b. Look up costPrice for each variant from VARIANT# records
  c. Calculate cogsAtSale = SUM(costPrice × quantity) per line item
  d. Build slim DynamoDB record (important fields only)
  e. Upload full JSON to S3: s3://profitfirst-raw/<merchantId>/orders/<orderId>.json
  f. Save to DynamoDB: MERCHANT#<id> | ORDER#<shopifyOrderId>
     with rawDataS3Url pointing to S3

Step 5: Update sync progress
  UPDATE MERCHANT#<id> | SYNC#SHOPIFY
  SET completedOrders += 250, lastSyncedOrderId = <lastOrderId>

Step 6: If more pages exist:
  Send NEW SQS message: { type: "SHOPIFY_SYNC", merchantId, lastSyncedOrderId: <lastId> }
  This is the "Cursor Passing" pattern - no timeouts possible

Step 7: If no more pages:
  UPDATE SYNC#SHOPIFY: status = "completed", completedAt = now
  Check if all 3 syncs complete → if yes, trigger SUMMARY_CALC

Rate Limiting:
  Use Bottleneck library: maxConcurrent=1, minTime=500 (2 req/sec)
  On 429: wait 1s → 2s → 4s → 8s (exponential backoff)
  Max 5 retries → move to DLQ
```

### Meta Ads Worker

```
Step 1: Read job from SQS
  { type: "META_SYNC", merchantId, sinceDate, lastSyncedDate }

Step 2: Get Meta token from DynamoDB, decrypt

Step 3: Fetch day by day (oldest first)
  For each day from sinceDate to today:
    GET /act_<adAccountId>/insights
      ?time_range={"since":"2026-01-01","until":"2026-01-01"}
      &fields=spend,impressions,clicks,reach,campaign_id,campaign_name,adset_id,ad_id
      &level=ad
      &time_increment=1

Step 4: Convert UTC timestamps to IST for the date key

Step 5: Save to DynamoDB: MERCHANT#<id> | ADS#<date-IST>#<campaignId>
        Upload raw JSON to S3

Step 6: Update SYNC#META progress, send next day as new SQS job

Rate Limiting:
  Check response header: x-business-use-case-usage
  If usage > 75%: wait 30 seconds before next call
  Exponential backoff: 5s → 10s → 20s → 40s
```

### Shiprocket Worker

```
Step 1: Read job from SQS
  { type: "SHIPROCKET_SYNC", merchantId, sinceDate, lastSyncedShipmentId }

Step 2: Get Shiprocket token from DynamoDB, decrypt
        Check if token expired (expiresAt < now)
        If expired: re-authenticate with stored email+password, update token

Step 3: Fetch shipments page by page (ASCENDING)
  GET /shipments?from=<sinceDate>&to=<today>&page=1&per_page=100
      &sort=created_date&order=asc

Step 4: For each shipment:
  a. Find matching Shopify order by order ID
  b. Update ORDER# record with deliveryStatus, shippingFee, awbCode
  c. Save SHIPMENT# record
  d. Upload raw JSON to S3

Step 5: Update SYNC#SHIPROCKET progress, send next page as new SQS job

Rate Limiting: 1 request/second (Bottleneck: minTime=1000)
```

### Crash Recovery (Very Important)

```
Every worker saves lastSyncedOrderId / lastSyncedDate / lastSyncedShipmentId
to the SYNC# record after EACH PAGE.

If worker crashes:
  SQS visibility timeout expires (5 min)
  SQS makes job visible again
  Worker picks it up again
  Reads SYNC# record → gets lastSyncedId
  Resumes from that point

Result: Zero data loss, zero duplicates, no re-fetching from beginning
```


---

## PHASE 5: SUMMARY CALCULATOR

### When It Runs

```
1. After initial 365-day sync completes (all 3 platforms done)
2. Every night at 2:00 AM IST (AWS EventBridge cron)
3. When merchant updates COGS (recalculate affected days only)
4. When merchant adds business expense
```

### How It Works

```
Input: merchantId, fromDate, toDate (all in IST)

For each day in the range:

  1. Query all ORDER# records for that IST day
     (use orderCreatedAt converted to IST)

  2. Query all SHIPMENT# records for that IST day
     (use shipmentCreatedAt converted to IST)

  3. Query ADS# records for that IST day

  4. Query EXPENSE# records for that IST day

  5. Calculate all metrics using formulas above

  6. Save/Update SUMMARY#<YYYY-MM-DD> record

  7. Move to next day
```

### Accuracy Verification (Before Dashboard Unlock)

```
After summary calculation, run a verification check:

Pick last 5 days that have orders
For each day:
  Sum orders directly from ORDER# records
  Compare with SUMMARY# record
  If difference > 1%: flag as error, do NOT unlock dashboard

If all checks pass:
  Update PROFILE: initialSyncCompleted = true
  Check if cogsCompleted also true
  If both true: dashboardUnlocked = true
```

---

## PHASE 6: DASHBOARD UNLOCK + DATA DISPLAY

### Unlock Flow

```
Worker finishes all 3 syncs
       ↓
Summary Calculator runs
       ↓
Accuracy verification passes
       ↓
PROFILE: initialSyncCompleted = true
       ↓
Check: cogsCompleted = true?
       ↓ YES
PROFILE: dashboardUnlocked = true
       ↓
Frontend polling detects dashboardUnlocked = true
       ↓
Remove blur CSS
Enable all sidebar items
Show "Dashboard Ready!" toast
Load dashboard data
```

### Dashboard API

```
GET /api/dashboard/summary?from=2026-03-01&to=2026-03-07

Backend:
  1. Query SUMMARY# records for date range
  2. Aggregate all fields (SUM totals, AVG rates)
  3. Calculate POAS decision message
  4. Return single aggregated object

Response:
{
  dateRange: { from, to },
  revenue: { generated, earned, discounts, net },
  costs: { cogs, adsSpend, shipping, returnShipping, gatewayFees, businessExpenses },
  profit: { gross, net, margin },
  ads: { roas, poas, poasDecision },
  orders: { total, delivered, rto, cancelled, inTransit, rtoRate },
  forecast: { inTransit, successRate, expectedDelivered, expectedRevenue, riskLevel },
  averages: { aov, profitPerOrder, avgShipping },
  topProducts: [...],
  costBreakdown: { ... percentages }
}
```

### Default Dashboard View

```
On first unlock: show last 30 days
Date range options: Today, Yesterday, Last 7 days, Last 30 days, Last 90 days, Last 365 days, Custom
All dates in IST
```

---

## PHASE 7: DAILY SYNC (ONGOING AFTER INITIAL SETUP)

### EventBridge Cron (Every Night 2 AM IST)

```
Trigger: AWS EventBridge rule: cron(30 20 * * ? *)
         (20:30 UTC = 02:00 IST)

For each active merchant:
  1. Check INTEGRATION#SHOPIFY lastSyncTime
  2. Fetch orders updated since lastSyncTime
     GET /orders.json?updated_at_min=<lastSyncTime>&status=any
     Note: Use updated_at (not created_at) to catch status changes
  3. Update ORDER# records (delivery status may have changed)
  4. Fetch new Meta ads data for yesterday
  5. Fetch new Shiprocket shipments
  6. Recalculate SUMMARY# for affected days
  7. Update lastSyncTime in INTEGRATION records

Token Refresh Check:
  If Shiprocket token expires in < 3 days:
    Re-authenticate with stored email+password
    Update INTEGRATION#SHIPROCKET with new token + new expiresAt
  If Meta token expires in < 7 days:
    Send email to merchant: "Please reconnect Meta Ads"
    (Meta tokens cannot be auto-refreshed without user action)
```

### Shopify Webhooks (Real-Time Updates)

```
Register these webhooks when merchant connects Shopify:
  orders/create   → immediately save new order to DynamoDB
  orders/updated  → update order status, recalculate summary for that day
  orders/paid     → update payment status
  products/create → add new PRODUCT# and VARIANT# records, notify merchant to set COGS
  products/update → update product/variant info

Webhook Handler:
  POST /api/webhooks/shopify
  Verify HMAC signature (X-Shopify-Hmac-Sha256 header)
  Process immediately for small updates
  For large updates: send to SQS
```

---

## PHASE 8: BUSINESS EXPENSES PAGE

### What to Build

```
Page: /expenses

Features:
  - Add expense: type, amount, date, description
  - Edit/delete expense
  - Monthly view of all expenses
  - Total expenses per month

Expense Types:
  agency_fee, staff_salary, office_rent, tools_software,
  rto_handling_fee, payment_gateway_fee, other

API:
  POST /api/expenses/add
  GET  /api/expenses/list?month=2026-03
  PUT  /api/expenses/update/:expenseId
  DELETE /api/expenses/delete/:expenseId

DynamoDB:
  MERCHANT#<id> | EXPENSE#<expenseId>
  expenseId = <date>_<type>_<uuid-short>

After adding expense:
  Trigger SUMMARY_CALC SQS job for that day
  Dashboard updates automatically
```

---

## KNOWN ISSUES & SOLUTIONS

### Issue 1: New Product Added After Onboarding

```
Problem: Merchant adds new product to Shopify next week.
         Dashboard shows 0 profit for those orders (no COGS set).

Solution:
  Shopify webhook: products/create
  → Add PRODUCT# and VARIANT# records with costPrice: 0
  → Set PROFILE: newProductsNeedCogs: true
  → Show "!" badge on Products tab in sidebar
  → Message: "2 new products need cost setup"
  → Merchant sets COGS → trigger SUMMARY_CALC for affected days
```

### Issue 2: Shiprocket Token Expiry (10 days)

```
Problem: Token expires, sync fails silently.

Solution:
  Daily cron checks expiresAt for all INTEGRATION#SHIPROCKET records
  If expires in < 3 days:
    Re-authenticate using stored encrypted email+password
    Update token + new expiresAt
  If re-auth fails:
    Send email to merchant: "Please reconnect Shiprocket"
    Mark integration status: "token_expired"
    Show warning in dashboard
```

### Issue 3: Meta Token Expiry (60 days)

```
Problem: Meta tokens cannot be auto-refreshed (requires user action).

Solution:
  At 7 days before expiry: show yellow warning banner in dashboard
  At 3 days before expiry: show red warning banner
  At expiry: mark integration "expired", show reconnect button
  Ads data stops syncing until reconnected
```

### Issue 4: DynamoDB 400KB Limit

```
Problem: Shopify order with many line items can exceed 400KB.

Solution:
  Store full JSON in S3: s3://profitfirst-raw/<merchantId>/orders/<orderId>.json
  Store only slim fields in DynamoDB:
    orderId, orderTotal, currency, paymentType, orderStatus,
    fulfillmentStatus, deliveryStatus, lineItems (slim version),
    cogsAtSale, shippingFee, gatewayFee, discountAmount,
    orderCreatedAt, orderDeliveredAt, rawDataS3Url
  DynamoDB item stays < 5KB → fast and cheap
```

### Issue 5: Timezone Confusion

```
Problem: Shopify uses UTC, Meta uses UTC, Shiprocket uses IST.
         Dashboard shows wrong day for orders placed at 11 PM IST.

Solution:
  Store ALL raw timestamps in UTC in DynamoDB
  When calculating SUMMARY#<date>:
    Convert orderCreatedAt (UTC) to IST
    Use IST date as the summary key
  Example:
    Order created at 2026-03-05 20:30 UTC
    = 2026-03-06 02:00 IST
    → Goes into SUMMARY#2026-03-06 (not 2026-03-05)
  Use: moment-timezone or date-fns-tz library
  Timezone: "Asia/Kolkata"
```

### Issue 6: COGS Changed After Orders Synced

```
Problem: Merchant changes COGS from ₹200 to ₹250.
         Old orders still show ₹200 (cogsAtSale is frozen).
         Merchant asks: "Why is my old profit wrong?"

Solution:
  cogsAtSale is intentionally frozen (correct behavior)
  Show message: "COGS updated. Old orders keep original cost for accuracy."
  Offer option: "Apply new cost to past orders?"
  If yes: SQS job → update cogsAtSale on past ORDER# records → recalculate SUMMARY#
  If no: only future orders use new cost
```

### Issue 7: RTO Handling in Profit Calculation

```
Problem: RTO order = merchant gets product back but loses shipping money.

Correct calculation:
  RTO order revenue = 0 (not counted in revenueEarned)
  RTO COGS = 0 (product returned, merchant has it back)
  RTO shipping cost = freight_charge (merchant paid this, it's a loss)
  RTO return shipping = return_freight_charge (if applicable)

So for RTO orders:
  Revenue contribution: 0
  Cost contribution: shipping fee + return shipping fee
  Net impact: negative (pure loss)
```

### Issue 8: COD vs Prepaid Gateway Fees

```
Problem: Payment gateway fees only apply to prepaid orders.
         COD orders have no gateway fee.

Solution:
  In ORDER# record: store paymentType = "prepaid" | "cod"
  Gateway fee calculation:
    prepaidRevenue = SUM(order_total where paymentType = "prepaid" AND delivered)
    gatewayFees = prepaidRevenue × (gatewayFeePercent / 100)
  Default gatewayFeePercent = 2.5 (stored in PROFILE, editable in Settings)
```


---

## COMPLETE IMPLEMENTATION ORDER (Step by Step)

```
STEP 1 (Do This First): Backend - Products API + SQS Worker
  Files to create:
    Auth-service/controllers/products.controller.js
    Auth-service/services/products.service.js
    Auth-service/workers/product-fetch.worker.js
    Auth-service/routes/products.routes.js
  What it does:
    POST /api/products/trigger-fetch → creates SQS job
    GET  /api/products/list?page=1&limit=50 → paginated list
    POST /api/products/save-cogs → saves costPrice per variant
  Test: Trigger fetch, verify PRODUCT# and VARIANT# records in DynamoDB

STEP 2: Backend - Sync Status API
  Files to create:
    Auth-service/controllers/sync.controller.js
    Auth-service/services/sync.service.js
    Auth-service/routes/sync.routes.js
  What it does:
    POST /api/sync/start-initial → creates 3 SQS jobs
    GET  /api/sync/status → reads SYNC# records, returns progress
  Test: Start sync, verify SQS jobs in AWS console, verify SYNC# records

STEP 3: Backend - Shopify Orders Worker
  Files to create:
    Auth-service/workers/shopify-sync.worker.js
    Auth-service/utils/rate-limiter.js (Bottleneck setup)
    Auth-service/utils/s3-upload.js
  What it does:
    Fetches orders page by page (ascending, since_id cursor)
    Stamps cogsAtSale from VARIANT# records
    Saves slim record to DynamoDB + full JSON to S3
    Updates SYNC#SHOPIFY progress
    Sends next page as new SQS job (cursor passing)
  Test: Run worker, verify ORDER# records, verify S3 files, verify no duplicates

STEP 4: Backend - Meta Ads Worker
  Files to create:
    Auth-service/workers/meta-sync.worker.js
  What it does:
    Fetches ads data day by day (oldest first)
    Converts UTC to IST for date key
    Saves ADS#<date-IST>#<campaignId> records
  Test: Run worker, verify ADS# records, verify IST dates correct

STEP 5: Backend - Shiprocket Worker
  Files to create:
    Auth-service/workers/shiprocket-sync.worker.js
  What it does:
    Fetches shipments page by page (ascending)
    Matches with Shopify orders by order ID
    Updates ORDER# records with deliveryStatus, shippingFee
    Saves SHIPMENT# records
  Test: Run worker, verify SHIPMENT# records, verify ORDER# delivery status updated

STEP 6: Backend - Summary Calculator
  Files to create:
    Auth-service/workers/summary-calc.worker.js
    Auth-service/utils/timezone.js (IST conversion helpers)
  What it does:
    Loops through date range day by day
    Calculates all metrics using formulas above
    Saves SUMMARY#<date> records
    Runs accuracy verification before marking initialSyncCompleted
  Test: Run calculator, verify SUMMARY# records, manually verify one day's numbers

STEP 7: Frontend - Locked Dashboard
  Files to modify:
    frontend/src/pages/Dashboard.jsx (or MainDashboard.jsx)
    frontend/src/components/Sidebar.jsx
  What it does:
    On load: GET /api/auth/profile
    If dashboardUnlocked = false: blur main content, disable sidebar
    Show welcome popup with "Set Up Products" button
  Test: Login, verify blur appears, verify only Products tab clickable

STEP 8: Frontend - Products/COGS Page
  Files to create:
    frontend/src/pages/Products.jsx
    frontend/src/components/CogsTable.jsx
  What it does:
    On mount: trigger-fetch + start-initial-sync
    Poll products list every 5s until products appear
    Show paginated table with COGS inputs
    Bulk apply button
    Save button → save-cogs → check unlock
  Test: Enter COGS, verify VARIANT# records updated, verify cogsCompleted flag

STEP 9: Frontend - Sync Progress UI
  Files to create:
    frontend/src/components/SyncProgress.jsx
  What it does:
    Poll /api/sync/status every 10 seconds
    Show progress bars per platform
    When allCompleted + cogsCompleted → unlock dashboard
  Test: Watch progress bars update, verify dashboard unlocks at right time

STEP 10: Frontend - Dashboard Data Display
  Files to modify:
    frontend/src/pages/Dashboard.jsx
    frontend/src/pages/Analytics.jsx
  What it does:
    GET /api/dashboard/summary?from=...&to=...
    Display all metrics with correct formulas
    Date range selector
  Test: Verify numbers match manual calculation from Shopify/Meta/Shiprocket

STEP 11: Business Expenses Page
  Files to create:
    Auth-service/controllers/expenses.controller.js
    Auth-service/routes/expenses.routes.js
    frontend/src/pages/Expenses.jsx

STEP 12: Daily Sync (EventBridge Cron)
  Files to create:
    Auth-service/workers/daily-sync.worker.js
  Setup: AWS EventBridge rule for 2 AM IST

STEP 13: Shopify Webhooks
  Files to create:
    Auth-service/controllers/webhooks.controller.js
    Auth-service/routes/webhooks.routes.js
```

---

## TESTING CHECKLIST (Test Each Step Before Moving to Next)

```
After Step 1-2 (Products + Sync API):
  [ ] POST /api/products/trigger-fetch returns success immediately
  [ ] SQS job visible in AWS console
  [ ] PRODUCT# and VARIANT# records appear in DynamoDB
  [ ] GET /api/products/list returns paginated results
  [ ] POST /api/products/save-cogs updates VARIANT# records
  [ ] cogsCompleted = true after all variants have costPrice > 0

After Step 3-5 (Workers):
  [ ] ORDER# records in DynamoDB with correct fields
  [ ] cogsAtSale correctly stamped on each order
  [ ] S3 files exist for each order
  [ ] No duplicate ORDER# records (run sync twice, verify same count)
  [ ] ADS# records with IST dates
  [ ] SHIPMENT# records linked to correct orders
  [ ] ORDER# delivery status updated from Shiprocket
  [ ] Worker crash recovery: kill worker, restart, verify it resumes

After Step 6 (Summary Calculator):
  [ ] SUMMARY# records exist for each day in last 365 days
  [ ] Pick one day: manually sum orders from Shopify, compare with SUMMARY#
  [ ] Verify IST timezone: order at 11 PM IST goes to correct day
  [ ] Verify RTO orders: revenue = 0, shipping cost counted
  [ ] Verify gateway fees: only on prepaid orders
  [ ] dashboardUnlocked = true in PROFILE after verification passes

After Step 7-9 (Frontend):
  [ ] Dashboard blurred on first visit
  [ ] Only Products tab clickable
  [ ] Products page shows all products with variants
  [ ] COGS input works, save works
  [ ] Sync progress bars update every 10 seconds
  [ ] Dashboard unlocks when both conditions met
  [ ] All sidebar items clickable after unlock

After Step 10 (Dashboard Data):
  [ ] Revenue numbers match Shopify admin
  [ ] Ads spend matches Meta Ads Manager
  [ ] Shipping costs match Shiprocket
  [ ] Net profit formula correct
  [ ] POAS calculation correct
  [ ] Date range selector works
  [ ] Default shows last 7 days
```

---

## CURRENT STATUS & NEXT ACTION

```
DONE:
  ✅ Auth (signup, OTP, login, password reset)
  ✅ Onboarding (Business → Shopify → Meta → Shiprocket)
  ✅ All tokens encrypted and stored in DynamoDB
  ✅ This plan

NEXT ACTION (Start Here):
  → Build STEP 1: Products Controller + Service + Worker + Routes
  → File: Auth-service/controllers/products.controller.js
  → File: Auth-service/services/products.service.js
  → File: Auth-service/routes/products.routes.js
  → Register route in Server.js: app.use('/api/products', productsRoutes)
  → Test with real Shopify store

AFTER THAT:
  → STEP 2: Sync Status API
  → STEP 3: Shopify Orders Worker
  → Continue in order above
```

---

## S3 BUCKET STRUCTURE

```
Bucket: profitfirst-raw-data-sachin in singapure rigion only 

profitfirst-raw-data/
  <merchantId>/
    orders/
      <shopifyOrderId>.json
    shipments/
      <shiprocketShipmentId>.json
    ads/
      <date>/
        <campaignId>.json
    products/
      <shopifyProductId>.json

Access: Private (no public access)
Encryption: SSE-S3 (server-side encryption)
Lifecycle: Move to Glacier after 1 year (cost saving)
```

---

## ENVIRONMENT VARIABLES NEEDED

```
# Existing
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
NEW_DYNAMODB_TABLE_NAME=ProfitFirst_Core
NEW_AWS_REGION=ap-southeast-1
ENCRYPTION_KEY=...
FRONTEND_URL=...

# New (add these)
SQS_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/<account>/profitfirst-sync-queue
SQS_DLQ_URL=https://sqs.ap-southeast-1.amazonaws.com/<account>/profitfirst-sync-dlq
S3_BUCKET_NAME=profitfirst-raw-data
S3_REGION=ap-southeast-1
PAYMENT_GATEWAY_FEE_PERCENT=2.5
```

 3 Pro-Tips for the Coding Phase
1. The DynamoDB "BatchWrite" Secret (For Phase 3 & 4)
In your worker, when you download 250 products or 250 orders, don't use 250 individual PutCommand requests. DynamoDB has a command called BatchWriteCommand. It lets you save 25 items at the exact same time in one network call.
Why it matters: It makes your worker 10x faster and uses less AWS compute time. (I will write the code this way for you).
2. The Meta Ads Timezone Quirk
Shopify uses UTC, which is great. But Meta Ads returns data based on the Timezone of the Ad Account.
Why it matters: If the merchant's Meta Ad account is accidentally set to "Pacific Time (PST)", Meta will return "Yesterday's Spend" based on PST, not IST.
The Fix: When we write the Meta Worker, we will explicitly ask the Meta API to return the data grouped by day, and we will just map that directly to the IST date.
3. The SQS "FIFO" Warning (Keep it Standard)
When you create your SQS Queue in AWS, AWS will ask if you want a "Standard Queue" or a "FIFO Queue (First-In-First-Out)".
The Fix: Always choose Standard Queue. FIFO queues are slower, more expensive, and have strict rate limits. Because your architecture uses Idempotent Keys (ORDER#123), we don't care if SQS accidentally processes an order out of order, because DynamoDB will just overwrite it safely! Standard SQS is infinitely scalable.
