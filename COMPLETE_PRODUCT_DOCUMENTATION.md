# 📚 PROFITFIRST - COMPLETE PRODUCT DOCUMENTATION

**Version:** 1.0  
**Last Updated:** February 2026  
**Purpose:** Complete technical documentation of ProfitFirst D2C Analytics Platform

---

## 📖 TABLE OF CONTENTS

1. [Product Overview](#product-overview)
2. [User Journey Flow](#user-journey-flow)
3. [Technical Architecture](#technical-architecture)
4. [Data Flow & Storage](#data-flow--storage)
5. [Dashboard Metrics Specification](#dashboard-metrics-specification)
6. [Current Code Implementation](#current-code-implementation)
7. [API Endpoints](#api-endpoints)
8. [Worker System](#worker-system)
9. [Database Schema](#database-schema)
10. [Issues & Gaps](#issues--gaps)

---

## 1. PRODUCT OVERVIEW

### What is ProfitFirst?

ProfitFirst is a **profit analytics platform for D2C (Direct-to-Consumer) brands** that helps merchants understand their true profitability by integrating data from:

- **Shopify** (Orders & Revenue)
- **Shiprocket** (Shipping & Delivery Status)
- **Meta Ads** (Marketing Spend)

### Core Value Proposition

Instead of just showing revenue, ProfitFirst calculates **real profit** by accounting for:
- Product costs (COGS)
- Marketing spend (Ads)
- Shipping costs
- Gateway fees
- RTO (Return to Origin) losses
- Business expenses


---

## 2. USER JOURNEY FLOW

### Step-by-Step User Experience

#### STEP 1: User Signup & Login
**Files Involved:**
- `Profitfirst/frontend-profit-first/client/src/pages/Signup.jsx`
- `Profitfirst/frontend-profit-first/client/src/pages/Login.jsx`
- `Profitfirst/Auth-service/controllers/auth.controller.js`
- `Profitfirst/Auth-service/services/cognito.service.js`

**Flow:**
1. User visits homepage and clicks "Sign Up"
2. Enters email, password, business name
3. Backend creates AWS Cognito user
4. User receives verification email
5. User verifies email via link
6. User logs in with credentials
7. JWT tokens stored in localStorage

**Database Records Created:**
```javascript
// DynamoDB Record
PK: "MERCHANT#<userId>"
SK: "PROFILE"
{
  entityType: "PROFILE",
  email: "user@example.com",
  businessName: "My Store",
  onboardingStep: 1,
  dashboardUnlocked: false,
  cogsCompleted: false,
  initialSyncCompleted: false,
  createdAt: "2026-02-25T10:00:00Z"
}
```

---

#### STEP 2: Onboarding - Platform Connections
**Files Involved:**
- `Profitfirst/frontend-profit-first/client/src/pages/Onboarding.jsx`
- `Profitfirst/Auth-service/controllers/onboarding.controller.js`

**Flow:**
1. User redirected to `/onboarding` after login
2. User sees 3 integration cards: Shopify, Shiprocket, Meta

**2A. Shopify Connection:**
- User clicks "Connect Shopify"
- Redirected to Shopify OAuth: `https://{shop}.myshopify.com/admin/oauth/authorize`
- User approves app permissions
- Shopify redirects back with `code`
- Backend exchanges code for `access_token`
- Token encrypted and stored in DynamoDB

**Database Record:**
```javascript
PK: "MERCHANT#<userId>"
SK: "INTEGRATION#SHOPIFY"
{
  entityType: "INTEGRATION",
  platform: "SHOPIFY",
  shopifyStore: "mystore.myshopify.com",
  accessToken: "encrypted_token_here",
  connectedAt: "2026-02-25T10:05:00Z"
}
```

**2B. Shiprocket Connection:**
- User enters Shiprocket email & password
- Backend calls Shiprocket login API
- Receives auth token
- Token encrypted and stored

**Database Record:**
```javascript
PK: "MERCHANT#<userId>"
SK: "INTEGRATION#SHIPROCKET"
{
  entityType: "INTEGRATION",
  platform: "SHIPROCKET",
  email: "user@example.com",
  token: "encrypted_token_here",
  connectedAt: "2026-02-25T10:10:00Z"
}
```

**2C. Meta Ads Connection:**
- User clicks "Connect Meta"
- Redirected to Facebook OAuth
- User approves permissions
- Backend receives access token and ad account ID
- Stored in DynamoDB

**Database Record:**
```javascript
PK: "MERCHANT#<userId>"
SK: "INTEGRATION#META"
{
  entityType: "INTEGRATION",
  platform: "META",
  adAccountId: "act_123456789",
  accessToken: "encrypted_token_here",
  connectedAt: "2026-02-25T10:15:00Z"
}
```


---

#### STEP 3: Redirect to Dashboard (Blurred State)
**Files Involved:**
- `Profitfirst/frontend-profit-first/client/src/pages/Dashboard.jsx`
- `Profitfirst/frontend-profit-first/client/src/MainDashboard.jsx`

**Flow:**
1. After all 3 integrations connected, user redirected to `/dashboard`
2. Dashboard shows **BLURRED** with message: "Complete setup to unlock"
3. User sees 2 pending tasks:
   - ❌ Set Product Costs (COGS)
   - ❌ Enter Business Expenses

**Profile Status:**
```javascript
{
  onboardingStep: 4,
  dashboardUnlocked: false,
  cogsCompleted: false,
  initialSyncCompleted: false
}
```

---

#### STEP 4: Set Product Costs (COGS)
**Files Involved:**
- `Profitfirst/frontend-profit-first/client/src/pages/Products.jsx`
- `Profitfirst/Auth-service/controllers/products.controller.js`
- `Profitfirst/Auth-service/services/products.service.js`

**Flow:**
1. User clicks "Set Product Costs" from dashboard
2. Redirected to `/dashboard/products`
3. System fetches all products from Shopify
4. User sees table with all product variants
5. User enters cost price for each variant
6. User clicks "Save All Costs"
7. Backend stores costs in DynamoDB

**Database Records Created:**
```javascript
// For each variant
PK: "MERCHANT#<userId>"
SK: "VARIANT#<variantId>"
{
  entityType: "VARIANT",
  variantId: "gid://shopify/ProductVariant/123456",
  productName: "Premium T-Shirt",
  variantTitle: "Black / Medium",
  salePrice: 999,
  costPrice: 400,  // User entered
  productImage: "https://cdn.shopify.com/...",
  updatedAt: "2026-02-25T10:30:00Z"
}
```

**Profile Updated:**
```javascript
{
  cogsCompleted: true,
  updatedAt: "2026-02-25T10:30:00Z"
}
```

---

#### STEP 5: Enter Business Expenses
**Files Involved:**
- `Profitfirst/frontend-profit-first/client/src/pages/BusinessExpenses.jsx`
- `Profitfirst/Auth-service/controllers/expense.controller.js`

**Flow:**
1. User clicks "Enter Business Expenses" from dashboard
2. Redirected to `/dashboard/business-expenses`
3. User enters monthly fixed costs:
   - Agency Fees
   - Staff Salary
   - Office Rent
   - Software Subscriptions
   - Other Expenses
   - RTO Handling Fee (per order)
4. User clicks "Save Expenses"
5. Backend updates PROFILE record

**Profile Updated:**
```javascript
PK: "MERCHANT#<userId>"
SK: "PROFILE"
{
  // ... existing fields
  agencyFees: 10000,
  staffSalary: 25000,
  officeRent: 15000,
  softwareSubscriptions: 5000,
  otherExpenses: 5000,
  rtoHandlingFees: 50,  // per RTO order
  gatewayFeeRate: 2.5,  // percentage
  updatedAt: "2026-02-25T10:35:00Z"
}
```


---

#### STEP 6: Automatic Data Sync Triggered (90 Days)
**Files Involved:**
- `Profitfirst/Auth-service/controllers/sync.controller.js`
- `Profitfirst/Auth-service/services/sync.service.js`
- `Profitfirst/Auth-service/workers/shopify-sync.worker.js`
- `Profitfirst/Auth-service/workers/meta-sync.worker.js`
- `Profitfirst/Auth-service/workers/shiprocket-sync.worker.js`
- `Profitfirst/Auth-service/workers/summary-calculator.worker.js`

**Trigger Condition:**
```javascript
if (cogsCompleted === true && businessExpensesEntered === true) {
  // Start 90-day sync
  triggerInitialSync(merchantId);
}
```

**Sync Flow:**

**6A. Shopify Orders Sync (90 Days)**

**Worker:** `shopify-sync.worker.js`

**Process:**
1. Calculate start date: `today - 90 days`
2. Send message to SQS: `shopify-queue`
3. Worker receives message
4. Fetches orders from Shopify GraphQL API
5. For each order:
   - Extract order details
   - Calculate COGS from VARIANT# records
   - Store in DynamoDB as ORDER# record
   - Upload raw JSON to S3
6. If more pages exist, send next page message to queue
7. When complete, trigger Meta sync

**GraphQL Query Used:**
```graphql
query getOrders($cursor: String, $query: String) {
  orders(first: 50, after: $cursor, query: $query) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        createdAt
        displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              variant { id price }
              product { id }
            }
          }
        }
      }
    }
  }
}
```

**Current Issues:**
- ❌ Missing: `totalDiscountsSet`
- ❌ Missing: `totalRefundedSet`
- ❌ Missing: `paymentGatewayNames`
- ❌ Missing: `cancelledAt`
- ❌ Missing: `test`

**ORDER# Record Stored:**
```javascript
PK: "MERCHANT#<userId>"
SK: "ORDER#<orderId>"
{
  entityType: "ORDER",
  orderId: "5678901234",
  orderName: "#1001",
  totalPrice: 1999,
  orderCreatedAt: "2026-01-15T14:30:00Z",
  totalCogs: 800,
  lineItems: [
    {
      variantId: "123456",
      quantity: 2,
      cogsAtSale: 400
    }
  ],
  status: "paid",
  updatedAt: "2026-02-25T10:40:00Z",
  s3RawDataUrl: "s3://bucket/merchant-id/orders/5678901234.json"
}
```

**Current Issues in Storage:**
- ❌ Missing: `discounts` field
- ❌ Missing: `refunds` field
- ❌ Missing: `paymentType` (prepaid/cod)
- ❌ Missing: `isCancelled` flag
- ❌ Missing: `isTest` flag


---

**6B. Meta Ads Sync (90 Days)**

**Worker:** `meta-sync.worker.js`

**Process:**
1. Receives message from Shopify worker
2. Fetches daily ad spend from Meta Graph API
3. For each day, stores ADS# record
4. Triggers Shiprocket sync

**API Call:**
```javascript
GET https://graph.facebook.com/v20.0/{adAccountId}/insights
params: {
  access_token: token,
  time_range: { since: "2025-11-27", until: "2026-02-25" },
  fields: "spend",
  time_increment: 1  // Daily breakdown
}
```

**ADS# Record Stored:**
```javascript
PK: "MERCHANT#<userId>"
SK: "ADS#2026-02-25"
{
  entityType: "ADS",
  date: "2026-02-25",
  spend: 5000,
  updatedAt: "2026-02-25T10:45:00Z",
  s3RawDataUrl: "s3://bucket/merchant-id/ads/2026-02-25.json"
}
```

---

**6C. Shiprocket Shipments Sync (90 Days)**

**Worker:** `shiprocket-sync.worker.js`

**Process:**
1. Receives message from Meta worker
2. Fetches shipments from Shiprocket API
3. For each shipment, stores SHIPMENT# record
4. Links shipment to ORDER# via order_id
5. Triggers Summary Calculator

**API Call:**
```javascript
GET https://apiv2.shiprocket.in/v1/external/shipments
params: {
  from: "2025-11-27",
  to: "2026-02-25",
  page: 1,
  per_page: 100
}
```

**SHIPMENT# Record Stored:**
```javascript
PK: "MERCHANT#<userId>"
SK: "SHIPMENT#<shipmentId>"
{
  entityType: "SHIPMENT",
  shipmentId: "SR123456",
  orderId: "5678901234",  // Links to ORDER#
  shippingFee: 50,
  returnShippingFee: 0,
  deliveryStatus: "delivered",  // or "rto", "in_transit", "cancelled"
  updatedAt: "2026-02-25T10:50:00Z",
  s3RawDataUrl: "s3://bucket/merchant-id/shipments/SR123456.json"
}
```

**Status Values:**
- `delivered` - Successfully delivered
- `rto` - Returned to origin
- `in_transit` - Currently in transit
- `cancelled` - Cancelled by customer or system

**Current Issue:**
- ❌ Status not normalized (storing raw Shiprocket status)


---

**6D. Summary Calculator (Daily Aggregation)**

**Worker:** `summary-calculator.worker.js`

**Process:**
1. Receives message from Shiprocket worker
2. Queries all ORDER#, SHIPMENT#, ADS# records
3. Groups data by IST date
4. Calculates daily metrics
5. Stores SUMMARY# record for each day
6. Checks if dashboard should be unlocked

**Calculation Logic (Current Implementation):**

```javascript
// For each day in last 90 days:

// 1. Revenue Generated (from orders)
orders.forEach(order => {
  const date = convertToIST(order.orderCreatedAt);
  dailyStats[date].revenueGenerated += order.totalPrice;
  dailyStats[date].totalOrders += 1;
});

// 2. Revenue Earned (from delivered shipments)
shipments.forEach(shipment => {
  const date = convertToIST(shipment.updatedAt);
  const order = findOrder(shipment.orderId);
  
  if (shipment.deliveryStatus === "delivered") {
    dailyStats[date].deliveredOrders++;
    dailyStats[date].revenueEarned += order.totalPrice;
    dailyStats[date].cogs += order.totalCogs;
    
    if (order.paymentType === "prepaid") {
      dailyStats[date].gatewayFees += (order.totalPrice * 0.025);
    }
  } else if (shipment.deliveryStatus === "rto") {
    dailyStats[date].rtoOrders++;
    dailyStats[date].rtoHandlingFees += profile.rtoHandlingFees;
  }
  
  dailyStats[date].shippingSpend += (shipment.shippingFee + shipment.returnShippingFee);
});

// 3. Ads Spend
ads.forEach(ad => {
  const date = ad.SK.replace("ADS#", "");
  dailyStats[date].adsSpend += ad.spend;
});

// 4. Business Expenses (daily portion)
const monthlyFixed = profile.agencyFees + profile.staffSalary + profile.officeRent + profile.otherExpenses;
const dailyOverhead = monthlyFixed / 30;

// 5. Final Profit Calculation
const moneyKept = revenueEarned - (cogs + adsSpend + shippingSpend + gatewayFees + rtoHandlingFees + dailyOverhead);
```

**Current Issues in Calculation:**
- ❌ Using `totalPrice` instead of `totalPrice - discounts`
- ❌ Not subtracting refunds from revenue earned
- ❌ Not tracking cancelled orders
- ❌ Not tracking in-transit orders
- ❌ Not tracking prepaid vs COD count
- ❌ Not calculating RTO revenue lost

**SUMMARY# Record Stored:**
```javascript
PK: "MERCHANT#<userId>"
SK: "SUMMARY#2026-02-25"
{
  entityType: "SUMMARY",
  date: "2026-02-25",
  
  // Revenue
  revenueGenerated: 50000,
  revenueEarned: 42000,
  
  // Costs
  cogs: 18000,
  adsSpend: 8000,
  shippingSpend: 3000,
  gatewayFees: 1050,
  rtoHandlingFees: 500,
  businessExpenses: 2000,
  
  // Profit
  moneyKept: 9450,
  
  // Orders
  totalOrders: 210,
  deliveredOrders: 180,
  rtoOrders: 12,
  
  updatedAt: "2026-02-25T11:00:00Z"
}
```

**Missing Fields:**
- ❌ `refunds`
- ❌ `netRevenue`
- ❌ `cancelledOrders`
- ❌ `inTransitOrders`
- ❌ `prepaidOrders`
- ❌ `codOrders`
- ❌ `rtoRevenueLost`


---

#### STEP 7: Dashboard Unlocked
**Files Involved:**
- `Profitfirst/Auth-service/services/sync.service.js`

**Unlock Condition:**
```javascript
if (
  cogsCompleted === true &&
  initialSyncCompleted === true &&
  summaryRecordsExist === true
) {
  // Unlock dashboard
  updateProfile({ dashboardUnlocked: true });
}
```

**Profile Updated:**
```javascript
{
  dashboardUnlocked: true,
  initialSyncCompleted: true,
  lastSyncAt: "2026-02-25T11:00:00Z"
}
```

---

#### STEP 8: User Views Dashboard
**Files Involved:**
- `Profitfirst/frontend-profit-first/client/src/pages/Dashboard.jsx`
- `Profitfirst/Auth-service/controllers/dashboard.controller.js`
- `Profitfirst/Auth-service/services/dashboard.service.js`

**Flow:**
1. User refreshes dashboard page
2. Frontend calls: `GET /api/dashboard/summary?from=2026-01-26&to=2026-02-25`
3. Backend queries all SUMMARY# records in date range
4. Aggregates data across all days
5. Calculates final metrics
6. Returns JSON response
7. Frontend displays metrics

**API Request:**
```javascript
GET /api/dashboard/summary?from=2026-01-26&to=2026-02-25

Headers:
  Authorization: Bearer <jwt_token>
```

**API Response Structure:**
```json
{
  "success": true,
  "summary": {
    "revenueGenerated": 1500000,
    "revenueEarned": 1200000,
    "cogs": 540000,
    "adsSpend": 240000,
    "shippingSpend": 90000,
    "gatewayFees": 30000,
    "rtoHandlingFees": 15000,
    "businessExpenses": 60000,
    "moneyKept": 225000,
    "profitMargin": 18.75,
    "roas": 6.25,
    "poas": 0.94,
    "poasDecision": "🚨 High Risk: Ad spend is eating your profit.",
    "totalOrders": 6300,
    "deliveredOrders": 5400,
    "rtoOrders": 360,
    "aov": 238,
    "profitPerOrder": 41.67,
    "shippingPerOrder": 16.67
  },
  "forecast": {
    "successRate": 93.75,
    "expectedDelivered": 47,
    "expectedRevenue": 11186,
    "riskLevel": "Low Risk"
  },
  "topProducts": [
    {
      "name": "Premium T-Shirt",
      "deliveredQty": 450,
      "revenue": 449550,
      "cogs": 180000,
      "profit": 269550
    }
  ],
  "chartData": [
    {
      "date": "2026-01-26",
      "moneyKept": 7500,
      "revenueGenerated": 50000
    }
  ]
}
```


---

## 3. TECHNICAL ARCHITECTURE

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│  - Signup/Login                                                  │
│  - Onboarding (Integrations)                                     │
│  - Dashboard (Metrics Display)                                   │
│  - Products (COGS Entry)                                         │
│  - Business Expenses                                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS/REST API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                     │
│  - Auth Controller (Cognito)                                     │
│  - Onboarding Controller                                         │
│  - Dashboard Controller                                          │
│  - Products Controller                                           │
│  - Sync Controller                                               │
└────────────┬───────────────────────────┬────────────────────────┘
             │                           │
             ▼                           ▼
┌────────────────────────┐   ┌──────────────────────────────────┐
│   AWS COGNITO          │   │      AWS SQS (Message Queues)    │
│   (Authentication)     │   │  - shopify-queue                 │
└────────────────────────┘   │  - meta-queue                    │
                             │  - shiprocket-queue              │
                             │  - summary-queue                 │
                             └──────────┬───────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORKER PROCESSES                            │
│  - shopify-sync.worker.js                                        │
│  - meta-sync.worker.js                                           │
│  - shiprocket-sync.worker.js                                     │
│  - summary-calculator.worker.js                                  │
└────────────┬───────────────────────────┬────────────────────────┘
             │                           │
             ▼                           ▼
┌────────────────────────┐   ┌──────────────────────────────────┐
│   AWS DYNAMODB         │   │      AWS S3                      │
│   (Primary Database)   │   │  (Raw JSON Storage)              │
│  - MERCHANT# records   │   │  - orders/*.json                 │
│  - ORDER# records      │   │  - shipments/*.json              │
│  - SHIPMENT# records   │   │  - ads/*.json                    │
│  - ADS# records        │   │                                  │
│  - SUMMARY# records    │   │                                  │
└────────────────────────┘   └──────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL APIs                                 │
│  - Shopify GraphQL API                                           │
│  - Meta Graph API                                                │
│  - Shiprocket REST API                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 19
- Vite (Build tool)
- Tailwind CSS 4
- Recharts (Charts)
- Axios (HTTP client)
- React Router (Navigation)

**Backend:**
- Node.js 18+
- Express.js
- AWS SDK v3
- Axios (External API calls)

**Database:**
- AWS DynamoDB (NoSQL)
- Single Table Design

**Storage:**
- AWS S3 (Raw JSON backup)

**Queue:**
- AWS SQS (Message queuing)

**Authentication:**
- AWS Cognito (User management)


---

## 4. DATA FLOW & STORAGE

### DynamoDB Single Table Design

**Table Name:** `ProfitFirst_Core`  
**Region:** `ap-southeast-1` (Singapore)

**Access Pattern:**

| PK | SK | Entity Type | Description |
|----|----|-------------|-------------|
| `MERCHANT#<id>` | `PROFILE` | PROFILE | User profile & settings |
| `MERCHANT#<id>` | `INTEGRATION#SHOPIFY` | INTEGRATION | Shopify credentials |
| `MERCHANT#<id>` | `INTEGRATION#META` | INTEGRATION | Meta credentials |
| `MERCHANT#<id>` | `INTEGRATION#SHIPROCKET` | INTEGRATION | Shiprocket credentials |
| `MERCHANT#<id>` | `VARIANT#<id>` | VARIANT | Product variant COGS |
| `MERCHANT#<id>` | `ORDER#<id>` | ORDER | Shopify order snapshot |
| `MERCHANT#<id>` | `SHIPMENT#<id>` | SHIPMENT | Shiprocket shipment |
| `MERCHANT#<id>` | `ADS#<YYYY-MM-DD>` | ADS | Daily ad spend |
| `MERCHANT#<id>` | `SUMMARY#<YYYY-MM-DD>` | SUMMARY | Daily aggregated metrics |
| `MERCHANT#<id>` | `SYNC#SHOPIFY` | SYNC | Sync progress tracker |
| `MERCHANT#<id>` | `SYNC#META` | SYNC | Sync progress tracker |
| `MERCHANT#<id>` | `SYNC#SHIPROCKET` | SYNC | Sync progress tracker |

### S3 Storage Structure

**Bucket Name:** `profitfirst-raw-data`

**Folder Structure:**
```
s3://profitfirst-raw-data/
  └── {merchantId}/
      ├── orders/
      │   ├── 5678901234.json
      │   ├── 5678901235.json
      │   └── ...
      ├── shipments/
      │   ├── SR123456.json
      │   ├── SR123457.json
      │   └── ...
      └── ads/
          ├── 2026-02-25.json
          ├── 2026-02-24.json
          └── ...
```

**Purpose:**
- Backup of raw API responses
- Audit trail
- Debugging
- Data recovery
- Compliance

### Data Retention

- **DynamoDB:** Permanent (until merchant deletes account)
- **S3:** 2 years (lifecycle policy)
- **SQS Messages:** 14 days (default retention)


---

## 5. DASHBOARD METRICS SPECIFICATION

### What Should Be Shown on Dashboard

The dashboard is divided into **8 sections**:

---

### SECTION 1: ACTUAL MONEY (Top Priority)

**Purpose:** Show real cash flow and profit

| Metric | Formula | Current Status |
|--------|---------|----------------|
| **Revenue Generated** | `SUM(totalPrice - discounts)` for non-cancelled orders | ❌ Using totalPrice only |
| **Revenue Earned** | `SUM(totalPrice - discounts - refunds)` for delivered orders | ❌ Using totalPrice only |
| **COGS** | `SUM(cogsAtSale × quantity)` for delivered orders | ✅ Working |
| **Money Kept** | `Revenue Earned - COGS - Ads - Shipping - Gateway - RTO - Expenses` | ⚠️ Partially working |
| **Profit Margin** | `(Money Kept / Revenue Earned) × 100` | ⚠️ Partially working |

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  ACTUAL MONEY                                               │
├─────────────────────────────────────────────────────────────┤
│  Revenue Generated    ₹1,500,000                            │
│  Revenue Earned       ₹1,200,000                            │
│  COGS                 ₹540,000                              │
│  Money Kept           ₹225,000                              │
│  Profit Margin        18.75%                                │
└─────────────────────────────────────────────────────────────┘
```

---

### SECTION 2: ADS PERFORMANCE

**Purpose:** Evaluate marketing efficiency

| Metric | Formula | Current Status |
|--------|---------|----------------|
| **Ads Spend** | `SUM(Meta daily spend)` | ✅ Working |
| **ROAS** | `Revenue Generated / Ads Spend` | ✅ Working |
| **POAS** | `Money Kept / Ads Spend` | ✅ Working |
| **Decision** | Based on POAS thresholds | ✅ Working |

**POAS Decision Logic:**
- `< 1.2` → 🚨 High Risk
- `1.2 - 2.5` → ✅ Sustainable
- `> 2.5` → 🚀 Scale Now

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  ADS PERFORMANCE                                            │
├─────────────────────────────────────────────────────────────┤
│  Ads Spend            ₹240,000                              │
│  ROAS                 6.25                                  │
│  POAS                 0.94                                  │
│  Decision             🚨 High Risk: Ad spend eating profit  │
└─────────────────────────────────────────────────────────────┘
```

---

### SECTION 3: ORDER ECONOMICS

**Purpose:** Understand order fulfillment

| Metric | Formula | Current Status |
|--------|---------|----------------|
| **Total Orders** | Count of non-cancelled orders | ✅ Working |
| **Delivered Orders** | Count where status = delivered | ✅ Working |
| **RTO Count** | Count where status = rto | ✅ Working |
| **Cancelled Orders** | Count where status = cancelled | ❌ Not tracked |
| **In-Transit Orders** | Count where status = in_transit | ❌ Not tracked |
| **Prepaid Orders** | Count where paymentType = prepaid | ❌ Not tracked |
| **COD Orders** | Count where paymentType = cod | ❌ Not tracked |
| **AOV** | `Revenue Generated / Total Orders` | ✅ Working |
| **Profit Per Order** | `Money Kept / Delivered Orders` | ✅ Working |
| **Shipping Per Order** | `Shipping Spend / Delivered Orders` | ✅ Working |

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  ORDER ECONOMICS                                            │
├─────────────────────────────────────────────────────────────┤
│  Total Orders         6,300                                 │
│  Delivered            5,400                                 │
│  RTO                  360                                   │
│  Cancelled            150                                   │
│  In-Transit           390                                   │
│  Prepaid              4,200                                 │
│  COD                  2,100                                 │
│  AOV                  ₹238                                  │
│  Profit Per Order     ₹41.67                               │
│  Shipping Per Order   ₹16.67                               │
└─────────────────────────────────────────────────────────────┘
```


---

### SECTION 4: PRODUCT PROFITABILITY (Top 5)

**Purpose:** Identify best-selling products

| Column | Formula | Current Status |
|--------|---------|----------------|
| **Product Name** | From order line items | ✅ Working |
| **Delivered Qty** | `SUM(quantity)` where delivered | ✅ Working |
| **Revenue** | `SUM(price × quantity)` | ✅ Working |
| **COGS** | `SUM(cogsAtSale × quantity)` | ✅ Working |
| **Profit** | `Revenue - COGS` | ✅ Working |

**Display:**
```
┌──────────────────────────────────────────────────────────────────┐
│  PRODUCT PROFITABILITY (Top 5)                                   │
├──────────────────────────────────────────────────────────────────┤
│  Product              Qty    Revenue      COGS       Profit      │
│  Premium T-Shirt      450    ₹449,550    ₹180,000   ₹269,550    │
│  Denim Jeans          320    ₹639,680    ₹256,000   ₹383,680    │
│  Leather Jacket       180    ₹899,820    ₹360,000   ₹539,820    │
│  Sneakers             290    ₹579,710    ₹232,000   ₹347,710    │
│  Backpack             410    ₹409,590    ₹164,000   ₹245,590    │
└──────────────────────────────────────────────────────────────────┘
```

---

### SECTION 5: COST LEAKAGE

**Purpose:** Track all expense categories

| Metric | Formula | Current Status |
|--------|---------|----------------|
| **Shipping Spend** | `SUM(forward + return freight)` | ✅ Working |
| **Gateway Fees** | `SUM(prepaid delivered revenue) × 2.5%` | ✅ Working |
| **RTO Handling Fees** | `RTO Count × fee per order` | ✅ Working |
| **Fixed Expenses** | Monthly overhead / 30 | ✅ Working |
| **RTO Revenue Lost** | `SUM(netRevenue)` for RTO orders | ❌ Not tracked |

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  COST LEAKAGE                                               │
├─────────────────────────────────────────────────────────────┤
│  Shipping Spend       ₹90,000                               │
│  Gateway Fees         ₹30,000                               │
│  RTO Handling         ₹15,000                               │
│  Fixed Expenses       ₹60,000                               │
│  RTO Revenue Lost     ₹85,680                               │
└─────────────────────────────────────────────────────────────┘
```

---

### SECTION 6: PENDING OUTCOME / FORECAST

**Purpose:** Predict future deliveries

| Metric | Formula | Current Status |
|--------|---------|----------------|
| **In-Transit Orders** | Count where status = in_transit | ❌ Not tracked |
| **Delivery Success Rate** | `Delivered / (Delivered + RTO)` from last 30 days | ⚠️ Using current day only |
| **Expected Delivered** | `In-Transit × Success Rate` | ⚠️ Partially working |
| **Expected Revenue** | `Expected Delivered × AOV` | ⚠️ Partially working |
| **Risk Level** | Based on RTO rate | ✅ Working |

**Risk Level Logic:**
- RTO Rate `< 15%` → 🟢 Low Risk
- RTO Rate `15-30%` → 🟡 Medium Risk
- RTO Rate `> 30%` → 🔴 High Risk

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  PENDING OUTCOME / FORECAST                                 │
├─────────────────────────────────────────────────────────────┤
│  In-Transit Orders    390                                   │
│  Success Rate         93.75%                                │
│  Expected Delivered   366                                   │
│  Expected Revenue     ₹87,108                               │
│  Risk Level           🟢 Low Risk                           │
└─────────────────────────────────────────────────────────────┘
```


---

### SECTION 7: DAILY PROFIT CHART

**Purpose:** Visualize profit trends

**Data Source:** `chartData` array from API response

**Chart Type:** Bar Chart

**X-Axis:** Date (last 30 days)  
**Y-Axis:** Money Kept (Net Profit)

**Current Status:** ❌ Using hardcoded data

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  DAILY PROFIT STATUS                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ₹120k ┤                                    ▄              │
│         │                          ▄        ▐█▌             │
│   ₹80k  ┤        ▄        ▄       ▐█▌  ▄   ▐█▌             │
│         │   ▄   ▐█▌  ▄   ▐█▌ ▄   ▐█▌ ▐█▌ ▐█▌             │
│   ₹40k  ┤  ▐█▌ ▐█▌ ▐█▌ ▐█▌▐█▌ ▐█▌▐█▌▐█▌             │
│         │ ▐█▌▐█▌▐█▌▐█▌▐█▌▐█▌▐█▌▐█▌             │
│   ₹0    ┼─────────────────────────────────────────────────│
│         Feb 4  Feb 11  Feb 18  Feb 25                      │
└─────────────────────────────────────────────────────────────┘
```

---

### SECTION 8: MONEY FLOW CHART

**Purpose:** Show revenue distribution

**Data Source:** `summary` object from API response

**Chart Type:** Waterfall Bar Chart

**Categories:**
1. Revenue (Green)
2. Product Cost / COGS (Red)
3. Marketing / Ads (Red)
4. Business Expenses (Red)
5. Shipping Spend (Red)
6. Money Kept / Net Profit (Green)

**Current Status:** ❌ Using hardcoded data

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  MONEY FLOW                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ₹300k ┤  ▐█████████████████▌                              │
│        │  ▐█████████████████▌                              │
│  ₹200k ┤  ▐█████████████████▌                              │
│        │  ▐█████████████████▌  ▐████████▌                  │
│  ₹100k ┤  ▐█████████████████▌  ▐████████▌  ▐███▌  ▐██▌    │
│        │  ▐█████████████████▌  ▐████████▌  ▐███▌  ▐██▌    │
│  ₹0    ┼──────────────────────────────────────────────────│
│        │  Revenue    COGS    Ads   Expenses  Shipping      │
│        │  (Green)    (Red)   (Red)  (Red)     (Red)        │
└─────────────────────────────────────────────────────────────┘
```


---

## 6. CURRENT CODE IMPLEMENTATION

### File Structure

```
Profitfirst/
├── Auth-service/                    # Backend
│   ├── config/
│   │   ├── aws.config.js           # AWS SDK setup
│   │   ├── dynamodb.schema.js      # Table schema
│   │   └── groq.config.js          # AI config
│   ├── controllers/
│   │   ├── auth.controller.js      # Login/Signup
│   │   ├── dashboard.controller.js # Dashboard API
│   │   ├── onboarding.controller.js# Integration setup
│   │   ├── products.controller.js  # COGS management
│   │   ├── expense.controller.js   # Business expenses
│   │   └── sync.controller.js      # Sync trigger
│   ├── services/
│   │   ├── cognito.service.js      # AWS Cognito
│   │   ├── dashboard.service.js    # Data aggregation
│   │   ├── dynamodb.service.js     # DB operations
│   │   ├── sync.service.js         # Sync orchestration
│   │   └── products.service.js     # Product operations
│   ├── workers/
│   │   ├── shopify-sync.worker.js  # Shopify data fetch
│   │   ├── meta-sync.worker.js     # Meta ads fetch
│   │   ├── shiprocket-sync.worker.js # Shiprocket fetch
│   │   └── summary-calculator.worker.js # Daily aggregation
│   ├── utils/
│   │   ├── encryption.js           # Token encryption
│   │   ├── shopify.util.js         # Shopify GraphQL
│   │   └── validators.js           # Input validation
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT verification
│   │   └── validation.middleware.js# Request validation
│   ├── routes/
│   │   └── *.routes.js             # API routes
│   └── Server.js                   # Express app
│
└── frontend-profit-first/           # Frontend
    └── client/
        ├── src/
        │   ├── pages/
        │   │   ├── Homepage.jsx    # Landing page
        │   │   ├── Signup.jsx      # Registration
        │   │   ├── Login.jsx       # Authentication
        │   │   ├── Onboarding.jsx  # Integration setup
        │   │   ├── Dashboard.jsx   # Main dashboard
        │   │   ├── Products.jsx    # COGS entry
        │   │   ├── BusinessExpenses.jsx # Expense entry
        │   │   ├── Analytics.jsx   # Advanced analytics
        │   │   └── Settings.jsx    # User settings
        │   ├── components/
        │   │   ├── Navbar.jsx      # Navigation
        │   │   ├── DateRangeSelector.jsx # Date picker
        │   │   └── PageLoader.jsx  # Loading state
        │   ├── utils/
        │   │   └── auth.js         # Token management
        │   ├── App.jsx             # Main app
        │   ├── main.jsx            # Entry point
        │   └── index.css           # Tailwind styles
        ├── axios.js                # API client
        └── package.json            # Dependencies
```


---

### Key Code Files Explained

#### 1. Shopify Sync Worker
**File:** `Profitfirst/Auth-service/workers/shopify-sync.worker.js`

**Purpose:** Fetch orders from Shopify and store in DynamoDB

**Current Implementation:**
```javascript
// Polls SQS queue for messages
const pollQueue = async () => {
  while (!isShuttingDown) {
    const { Messages } = await sqsClient.send(
      new ReceiveMessageCommand({ 
        QueueUrl: shopifyQueueUrl, 
        WaitTimeSeconds: 20 
      })
    );
    
    if (Messages) {
      await processOrders(JSON.parse(Messages[0].Body));
      await sqsClient.send(
        new DeleteMessageCommand({ 
          QueueUrl: shopifyQueueUrl, 
          ReceiptHandle: Messages[0].ReceiptHandle 
        })
      );
    }
  }
};

// Fetches orders and stores them
const processOrders = async (job) => {
  const { merchantId, sinceDate, cursor, pageCount } = job;
  
  // Get COGS map
  const variants = await dynamodbService.getVariantsByMerchant(merchantId);
  const costMap = {};
  variants.data?.forEach(v => costMap[v.variantId] = v.costPrice || 0);
  
  // Get Shopify credentials
  const integration = await newDynamoDB.send(
    new GetCommand({ 
      TableName: newTableName, 
      Key: { 
        PK: `MERCHANT#${merchantId}`, 
        SK: "INTEGRATION#SHOPIFY" 
      }
    })
  );
  
  // Fetch orders from Shopify
  const data = await shopifyUtil.fetchShopifyOrders(
    integration.Item.shopifyStore,
    integration.Item.accessToken,
    sinceDate,
    cursor
  );
  
  // Store each order
  for (const { node: order } of data.edges) {
    const orderId = order.id.split('/').pop();
    let totalCogs = 0;
    
    const items = order.lineItems.edges.map(({ node: i }) => {
      const vId = i.variant?.id?.split('/').pop();
      const cost = costMap[vId] || 0;
      totalCogs += (cost * i.quantity);
      return { 
        variantId: vId, 
        quantity: i.quantity, 
        cogsAtSale: cost 
      };
    });
    
    await newDynamoDB.send(new PutCommand({
      TableName: newTableName,
      Item: { 
        PK: `MERCHANT#${merchantId}`, 
        SK: `ORDER#${orderId}`, 
        entityType: 'ORDER', 
        totalPrice: Number(order.totalPriceSet.shopMoney.amount), 
        orderCreatedAt: order.createdAt, 
        totalCogs, 
        lineItems: items, 
        status: order.displayFinancialStatus?.toLowerCase(), 
        updatedAt: new Date().toISOString() 
      }
    }));
  }
  
  // If more pages, queue next page
  if (data.pageInfo.hasNextPage) {
    await sqsClient.send(new SendMessageCommand({ 
      QueueUrl: shopifyQueueUrl, 
      MessageBody: JSON.stringify({ 
        ...job, 
        cursor: data.pageInfo.endCursor, 
        pageCount: pageCount + 1 
      })
    }));
  } else {
    // Sync complete, trigger Meta sync
    await markSyncComplete(merchantId, "SHOPIFY", sinceDate);
  }
};
```

**Issues:**
- ❌ Not fetching `totalDiscountsSet`
- ❌ Not fetching `totalRefundedSet`
- ❌ Not fetching `paymentGatewayNames`
- ❌ Not fetching `cancelledAt`
- ❌ Not storing `discounts`, `refunds`, `paymentType` fields


---

#### 2. Shopify Utility
**File:** `Profitfirst/Auth-service/utils/shopify.util.js`

**Purpose:** Make GraphQL calls to Shopify

**Current Implementation:**
```javascript
async fetchShopifyOrders(shop, encryptedToken, sinceDate, cursor = null) {
  const accessToken = encryptionService.decrypt(encryptedToken);
  const url = `https://${shop}/admin/api/2023-10/graphql.json`;

  const query = `
    query getOrders($cursor: String, $query: String) {
      orders(first: 50, after: $cursor, query: $query) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  quantity
                  variant { id price }
                  product { id }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await axios.post(url, 
    { query, variables: { cursor, query: `created_at:>=${sinceDate}` } },
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  );

  return response.data.data.orders;
}
```

**Issues:**
- ❌ Missing `totalDiscountsSet { shopMoney { amount } }`
- ❌ Missing `totalRefundedSet { shopMoney { amount } }`
- ❌ Missing `paymentGatewayNames`
- ❌ Missing `cancelledAt`
- ❌ Missing `test`


---

#### 3. Summary Calculator Worker
**File:** `Profitfirst/Auth-service/workers/summary-calculator.worker.js`

**Purpose:** Aggregate daily metrics from raw data

**Current Implementation:**
```javascript
const calculate30DaySummary = async (merchantId) => {
  // Get profile for business expenses
  const profile = await getProfile(merchantId);
  const monthlyFixed = (profile.agencyFees || 0) + 
                       (profile.staffFees || 0) + 
                       (profile.officeRent || 0) + 
                       (profile.otherExpenses || 0);
  const dailyOverhead = monthlyFixed / 30;

  // Fetch all data
  const [orders, ads, shipments] = await Promise.all([
    dynamodbService.queryAll(merchantId, "ORDER#"),
    dynamodbService.queryAll(merchantId, "ADS#"),
    dynamodbService.queryAll(merchantId, "SHIPMENT#"),
  ]);

  const orderMap = new Map(orders.map((o) => [o.orderId, o]));
  const dailyStats = {};

  // 1. Process Orders
  orders.forEach((o) => {
    const date = formatInTimeZone(
      new Date(o.orderCreatedAt), 
      "Asia/Kolkata", 
      "yyyy-MM-dd"
    );
    if (!dailyStats[date]) dailyStats[date] = initDay();
    
    dailyStats[date].revenueGenerated += (o.totalPrice || 0);
    dailyStats[date].totalOrders += 1;
  });

  // 2. Process Shipments
  shipments.forEach((s) => {
    const date = formatInTimeZone(
      new Date(s.updatedAt), 
      "Asia/Kolkata", 
      "yyyy-MM-dd"
    );
    if (!dailyStats[date]) return;
    
    const order = orderMap.get(s.orderId);
    
    if (s.deliveryStatus === "delivered") {
      dailyStats[date].deliveredOrders++;
      dailyStats[date].revenueEarned += (order?.totalPrice || 0);
      dailyStats[date].cogs += (order?.totalCogs || 0);
      
      if (order?.paymentType === "prepaid") {
        dailyStats[date].gatewayFees += ((order.totalPrice || 0) * 0.025);
      }
    } else if (s.deliveryStatus === "rto") {
      dailyStats[date].rtoOrders++;
      dailyStats[date].rtoHandlingFees += (profile.rtoHandlingFees || 0);
    }
    
    dailyStats[date].shippingSpend += (
      (s.shippingFee || 0) + (s.returnShippingFee || 0)
    );
  });

  // 3. Process Ads
  ads.forEach((a) => {
    const date = a.SK.replace("ADS#", "");
    if (dailyStats[date]) {
      dailyStats[date].adsSpend += (a.spend || 0);
    }
  });

  // 4. Calculate final profit and save
  for (const [date, data] of Object.entries(dailyStats)) {
    const moneyKept = data.revenueEarned - (
      data.cogs + 
      data.adsSpend + 
      data.shippingSpend + 
      data.gatewayFees + 
      data.rtoHandlingFees + 
      dailyOverhead
    );
    
    await newDynamoDB.send(new PutCommand({
      TableName: newTableName,
      Item: {
        PK: `MERCHANT#${merchantId}`,
        SK: `SUMMARY#${date}`,
        entityType: "SUMMARY",
        date,
        ...data,
        businessExpenses: Number(dailyOverhead.toFixed(2)),
        moneyKept: Number(moneyKept.toFixed(2)),
        updatedAt: new Date().toISOString()
      }
    }));
  }
};

function initDay() {
  return { 
    revenueGenerated: 0, 
    revenueEarned: 0, 
    cogs: 0, 
    adsSpend: 0, 
    shippingSpend: 0, 
    gatewayFees: 0, 
    rtoHandlingFees: 0, 
    totalOrders: 0, 
    deliveredOrders: 0, 
    rtoOrders: 0 
  };
}
```

**Issues:**
- ❌ Using `totalPrice` instead of `totalPrice - discounts`
- ❌ Not subtracting refunds from revenue earned
- ❌ Not tracking cancelled orders
- ❌ Not tracking in-transit orders
- ❌ Not tracking prepaid/COD counts
- ❌ Not calculating RTO revenue lost
- ❌ Missing fields in `initDay()`


---

#### 4. Dashboard Service
**File:** `Profitfirst/Auth-service/services/dashboard.service.js`

**Purpose:** Aggregate SUMMARY# records for date range

**Current Implementation:**
```javascript
async getAggregatedSummary(merchantId, startDate, endDate) {
  // 1. Query all SUMMARY# records in date range
  let days = [];
  let lastKey = null;

  do {
    const params = {
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${merchantId}`,
        ":start": `SUMMARY#${startDate}`,
        ":end": `SUMMARY#${endDate}`,
      }
    };

    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await newDynamoDB.send(new QueryCommand(params));
    days.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // 2. Initialize aggregator
  const totals = {
    revenueGenerated: 0,
    revenueEarned: 0,
    netRevenue: 0,
    refunds: 0,
    cogs: 0,
    adsSpend: 0,
    shippingSpend: 0,
    rtoHandlingFees: 0,
    gatewayFees: 0,
    businessExpenses: 0,
    moneyKept: 0,
    totalOrders: 0,
    deliveredOrders: 0,
    rtoOrders: 0,
    cancelledOrders: 0,
    inTransitOrders: 0,
    rtoRevenueLost: 0,
  };

  // 3. Sum all fields
  days.forEach((day) => {
    Object.keys(totals).forEach((key) => {
      if (day[key] !== undefined) {
        totals[key] += Number(day[key] || 0);
      }
    });
  });

  // 4. Calculate final ratios
  const finalNetRevenue = totals.revenueEarned - totals.refunds;
  const profitMargin = finalNetRevenue > 0 
    ? (totals.moneyKept / finalNetRevenue) * 100 
    : 0;
  const roas = totals.adsSpend > 0 
    ? totals.revenueGenerated / totals.adsSpend 
    : 0;
  const poas = totals.adsSpend > 0 
    ? totals.moneyKept / totals.adsSpend 
    : 0;
  const aov = totals.totalOrders > 0 
    ? totals.revenueGenerated / totals.totalOrders 
    : 0;

  // 5. Return aggregated data
  return {
    success: true,
    summary: {
      ...totals,
      finalNetRevenue: Number(finalNetRevenue.toFixed(2)),
      profitMargin: Number(profitMargin.toFixed(2)),
      roas: Number(roas.toFixed(2)),
      poas: Number(poas.toFixed(2)),
      aov: Number(aov.toFixed(2)),
      poasDecision: this.getPoasDecision(poas),
    },
    forecast: { /* ... */ },
    topProducts: await this.calculateTopProducts(merchantId, startDate, endDate),
    chartData: days,
  };
}
```

**Issues:**
- ❌ Missing `prepaidOrders` in totals
- ❌ Not calculating `codOrders`


---

#### 5. Dashboard Frontend
**File:** `Profitfirst/frontend-profit-first/client/src/pages/Dashboard.jsx`

**Purpose:** Display dashboard metrics

**Current Implementation:**
```javascript
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState({
    from: format(new Date(Date.now() - 30*24*60*60*1000), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
    label: "Last 30 days",
  });

  // Fetch data from API
  const fetchDashboardData = useCallback(async () => {
    const response = await axiosInstance.get("/dashboard/summary", {
      params: { from: dateRange.from, to: dateRange.to },
    });
    setData(response.data);
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const { summary, forecast, topProducts } = data;

  return (
    <div>
      {/* Section 1: Actual Money */}
      <MetricCard 
        title="Revenue Generated" 
        value={`₹${summary.revenueGenerated.toLocaleString()}`} 
      />
      <MetricCard 
        title="Revenue Earned" 
        value={`₹${summary.revenueEarned.toLocaleString()}`} 
      />
      <MetricCard 
        title="Money Kept" 
        value={`₹${summary.moneyKept.toLocaleString()}`} 
      />
      
      {/* Section 2: Ads Performance */}
      <MetricCard 
        title="ROAS" 
        value={summary.roas} 
      />
      <MetricCard 
        title="POAS" 
        value={summary.poas} 
      />
      
      {/* Section 3: Order Economics */}
      <MetricCard 
        title="Total Orders" 
        value={`150`}  // ❌ HARDCODED
      />
      <MetricCard 
        title="Delivered Orders" 
        value={summary.deliveredOrders} 
      />
      
      {/* Charts */}
      <BarChart data={performanceChartData}>  {/* ❌ HARDCODED */}
        <Bar dataKey="netProfit" />
      </BarChart>
    </div>
  );
};
```

**Issues:**
- ❌ Hardcoded values for Total Orders, Cancelled, Prepaid
- ❌ Hardcoded chart data (`performanceChartData`, `moneyFlowData`)
- ❌ Not using `forecast` data properly
- ❌ Typo: "TOtal Orders"


---

## 7. API ENDPOINTS

### Authentication

#### POST /api/auth/signup
**Purpose:** Create new user account

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "businessName": "My Store"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User created. Please verify email.",
  "userId": "41037dca-f0a1-7005-fcfe-6841ff1fc07b"
}
```

---

#### POST /api/auth/login
**Purpose:** Authenticate user

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "idToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "userId": "41037dca-f0a1-7005-fcfe-6841ff1fc07b",
    "email": "user@example.com",
    "businessName": "My Store"
  }
}
```

---

### Onboarding

#### POST /api/onboarding/shopify/connect
**Purpose:** Connect Shopify store

**Request:**
```json
{
  "code": "shopify_oauth_code",
  "shop": "mystore.myshopify.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shopify connected successfully"
}
```

---

#### POST /api/onboarding/shiprocket/connect
**Purpose:** Connect Shiprocket account

**Request:**
```json
{
  "email": "user@example.com",
  "password": "shiprocket_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shiprocket connected successfully"
}
```

---

#### POST /api/onboarding/meta/connect
**Purpose:** Connect Meta Ads account

**Request:**
```json
{
  "accessToken": "meta_oauth_token",
  "adAccountId": "act_123456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Meta Ads connected successfully"
}
```

---

### Products

#### GET /api/products
**Purpose:** Get all products with variants

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "variantId": "123456",
      "productName": "Premium T-Shirt",
      "variantTitle": "Black / Medium",
      "salePrice": 999,
      "costPrice": 400,
      "productImage": "https://cdn.shopify.com/..."
    }
  ]
}
```

---

#### POST /api/products/update-costs
**Purpose:** Save product costs

**Request:**
```json
{
  "costs": [
    {
      "variantId": "123456",
      "costPrice": 400
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Costs updated successfully"
}
```

---

### Business Expenses

#### POST /api/expenses/update
**Purpose:** Save business expenses

**Request:**
```json
{
  "agencyFees": 10000,
  "staffSalary": 25000,
  "officeRent": 15000,
  "softwareSubscriptions": 5000,
  "otherExpenses": 5000,
  "rtoHandlingFees": 50
}
```

**Response:**
```json
{
  "success": true,
  "message": "Expenses updated successfully"
}
```

---

### Dashboard

#### GET /api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
**Purpose:** Get aggregated dashboard data

**Response:**
```json
{
  "success": true,
  "summary": {
    "revenueGenerated": 1500000,
    "revenueEarned": 1200000,
    "cogs": 540000,
    "adsSpend": 240000,
    "shippingSpend": 90000,
    "gatewayFees": 30000,
    "rtoHandlingFees": 15000,
    "businessExpenses": 60000,
    "moneyKept": 225000,
    "profitMargin": 18.75,
    "roas": 6.25,
    "poas": 0.94,
    "poasDecision": "🚨 High Risk",
    "totalOrders": 6300,
    "deliveredOrders": 5400,
    "rtoOrders": 360,
    "aov": 238,
    "profitPerOrder": 41.67,
    "shippingPerOrder": 16.67
  },
  "forecast": {
    "successRate": 93.75,
    "expectedDelivered": 47,
    "expectedRevenue": 11186,
    "riskLevel": "Low Risk"
  },
  "topProducts": [...],
  "chartData": [...]
}
```

---

### Sync

#### POST /api/sync/trigger
**Purpose:** Manually trigger data sync

**Response:**
```json
{
  "success": true,
  "message": "Sync started"
}
```


---

## 8. WORKER SYSTEM

### SQS Queue Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYNC ORCHESTRATION                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  shopify-queue   │
                  └────────┬─────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ shopify-sync.worker.js │
              └────────┬───────────────┘
                       │
                       ▼
                  ┌──────────────────┐
                  │   meta-queue     │
                  └────────┬─────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  meta-sync.worker.js   │
              └────────┬───────────────┘
                       │
                       ▼
                  ┌──────────────────┐
                  │ shiprocket-queue │
                  └────────┬─────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │ shiprocket-sync.worker.js  │
              └────────┬───────────────────┘
                       │
                       ▼
                  ┌──────────────────┐
                  │  summary-queue   │
                  └────────┬─────────┘
                           │
                           ▼
              ┌──────────────────────────────────┐
              │ summary-calculator.worker.js     │
              └──────────────────────────────────┘
```

### Queue Message Formats

#### Shopify Queue Message
```json
{
  "type": "SHOPIFY_SYNC",
  "merchantId": "41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  "sinceDate": "2025-11-27T00:00:00Z",
  "cursor": null,
  "pageCount": 1
}
```

#### Meta Queue Message
```json
{
  "type": "META_SYNC",
  "merchantId": "41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  "sinceDate": "2025-11-27T00:00:00Z"
}
```

#### Shiprocket Queue Message
```json
{
  "type": "SHIPROCKET_SYNC",
  "merchantId": "41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  "sinceDate": "2025-11-27T00:00:00Z",
  "page": 1
}
```

#### Summary Queue Message
```json
{
  "type": "SUMMARY_CALC",
  "merchantId": "41037dca-f0a1-7005-fcfe-6841ff1fc07b"
}
```

### Worker Lifecycle

1. **Start:** Worker polls SQS queue with long polling (20 seconds)
2. **Receive:** Gets message from queue
3. **Process:** Executes sync logic
4. **Store:** Saves data to DynamoDB and S3
5. **Delete:** Removes message from queue
6. **Next:** Sends message to next queue (if applicable)
7. **Repeat:** Goes back to step 1

### Error Handling

- **Retry:** Failed messages automatically retry (SQS default: 3 times)
- **DLQ:** After max retries, message moves to Dead Letter Queue
- **Logging:** All errors logged to CloudWatch
- **Alerts:** Critical errors trigger SNS notifications


---

## 9. DATABASE SCHEMA

### Complete DynamoDB Records

#### PROFILE Record
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "PROFILE",
  entityType: "PROFILE",
  
  // User Info
  email: "user@example.com",
  businessName: "My Store",
  
  // Onboarding Status
  onboardingStep: 5,
  dashboardUnlocked: true,
  cogsCompleted: true,
  initialSyncCompleted: true,
  
  // Business Expenses
  agencyFees: 10000,
  staffSalary: 25000,
  officeRent: 15000,
  softwareSubscriptions: 5000,
  otherExpenses: 5000,
  rtoHandlingFees: 50,
  gatewayFeeRate: 2.5,
  
  // Timestamps
  createdAt: "2026-02-25T10:00:00Z",
  updatedAt: "2026-02-25T11:00:00Z",
  lastSyncAt: "2026-02-25T11:00:00Z"
}
```

---

#### INTEGRATION Records
```javascript
// Shopify
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "INTEGRATION#SHOPIFY",
  entityType: "INTEGRATION",
  platform: "SHOPIFY",
  shopifyStore: "mystore.myshopify.com",
  accessToken: "encrypted_token_here",
  connectedAt: "2026-02-25T10:05:00Z"
}

// Meta
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "INTEGRATION#META",
  entityType: "INTEGRATION",
  platform: "META",
  adAccountId: "act_123456789",
  accessToken: "encrypted_token_here",
  connectedAt: "2026-02-25T10:15:00Z"
}

// Shiprocket
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "INTEGRATION#SHIPROCKET",
  entityType: "INTEGRATION",
  platform: "SHIPROCKET",
  email: "user@example.com",
  token: "encrypted_token_here",
  connectedAt: "2026-02-25T10:10:00Z"
}
```

---

#### VARIANT Record
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "VARIANT#123456",
  entityType: "VARIANT",
  variantId: "gid://shopify/ProductVariant/123456",
  productName: "Premium T-Shirt",
  variantTitle: "Black / Medium",
  salePrice: 999,
  costPrice: 400,
  productImage: "https://cdn.shopify.com/...",
  updatedAt: "2026-02-25T10:30:00Z"
}
```

---

#### ORDER Record (Current)
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "ORDER#5678901234",
  entityType: "ORDER",
  orderId: "5678901234",
  orderName: "#1001",
  totalPrice: 1999,
  orderCreatedAt: "2026-01-15T14:30:00Z",
  totalCogs: 800,
  lineItems: [
    {
      variantId: "123456",
      quantity: 2,
      cogsAtSale: 400
    }
  ],
  status: "paid",
  updatedAt: "2026-02-25T10:40:00Z",
  s3RawDataUrl: "s3://bucket/merchant-id/orders/5678901234.json"
}
```

#### ORDER Record (Should Be)
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "ORDER#5678901234",
  entityType: "ORDER",
  orderId: "5678901234",
  orderName: "#1001",
  
  // Pricing
  totalPrice: 1999,
  discounts: 100,
  refunds: 50,
  netRevenue: 1849,  // totalPrice - discounts - refunds
  
  // Payment
  paymentType: "prepaid",  // or "cod"
  
  // Status
  status: "paid",
  isCancelled: false,
  isTest: false,
  cancelledAt: null,
  
  // COGS
  totalCogs: 800,
  lineItems: [
    {
      variantId: "123456",
      productName: "Premium T-Shirt",
      quantity: 2,
      price: 999,
      cogsAtSale: 400
    }
  ],
  
  // Timestamps
  orderCreatedAt: "2026-01-15T14:30:00Z",
  updatedAt: "2026-02-25T10:40:00Z",
  
  // Backup
  s3RawDataUrl: "s3://bucket/merchant-id/orders/5678901234.json"
}
```

---

#### SHIPMENT Record
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "SHIPMENT#SR123456",
  entityType: "SHIPMENT",
  shipmentId: "SR123456",
  orderId: "5678901234",
  awb: "AWB123456789",
  shippingFee: 50,
  returnShippingFee: 0,
  deliveryStatus: "delivered",  // delivered, rto, in_transit, cancelled
  deliveredAt: "2026-01-20T10:00:00Z",
  updatedAt: "2026-02-25T10:50:00Z",
  s3RawDataUrl: "s3://bucket/merchant-id/shipments/SR123456.json"
}
```

---

#### ADS Record
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "ADS#2026-02-25",
  entityType: "ADS",
  date: "2026-02-25",
  spend: 5000,
  updatedAt: "2026-02-25T10:45:00Z",
  s3RawDataUrl: "s3://bucket/merchant-id/ads/2026-02-25.json"
}
```

---

#### SUMMARY Record (Current)
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "SUMMARY#2026-02-25",
  entityType: "SUMMARY",
  date: "2026-02-25",
  
  // Revenue
  revenueGenerated: 50000,
  revenueEarned: 42000,
  
  // Costs
  cogs: 18000,
  adsSpend: 8000,
  shippingSpend: 3000,
  gatewayFees: 1050,
  rtoHandlingFees: 500,
  businessExpenses: 2000,
  
  // Profit
  moneyKept: 9450,
  
  // Orders
  totalOrders: 210,
  deliveredOrders: 180,
  rtoOrders: 12,
  
  updatedAt: "2026-02-25T11:00:00Z"
}
```

#### SUMMARY Record (Should Be)
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "SUMMARY#2026-02-25",
  entityType: "SUMMARY",
  date: "2026-02-25",
  
  // Revenue
  revenueGenerated: 50000,     // totalPrice - discounts (non-cancelled)
  revenueEarned: 42000,        // netRevenue (delivered only)
  netRevenue: 41500,           // totalPrice - discounts - refunds
  refunds: 500,
  
  // Costs
  cogs: 18000,
  adsSpend: 8000,
  shippingSpend: 3000,
  gatewayFees: 1050,
  rtoHandlingFees: 500,
  businessExpenses: 2000,
  
  // Profit
  moneyKept: 9450,
  
  // Orders
  totalOrders: 210,
  deliveredOrders: 180,
  rtoOrders: 12,
  cancelledOrders: 8,
  inTransitOrders: 10,
  prepaidOrders: 140,
  codOrders: 70,
  
  // RTO
  rtoRevenueLost: 2850,
  
  updatedAt: "2026-02-25T11:00:00Z"
}
```

---

#### SYNC Record
```javascript
{
  PK: "MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b",
  SK: "SYNC#SHOPIFY",
  entityType: "SYNC",
  platform: "SHOPIFY",
  status: "completed",  // pending, in_progress, completed, failed
  percent: 100,
  startedAt: "2026-02-25T10:35:00Z",
  completedAt: "2026-02-25T10:55:00Z"
}
```


---

## 10. ISSUES & GAPS

### Critical Issues (Must Fix)

#### Issue 1: Missing Shopify Fields
**Location:** `shopify.util.js` GraphQL query

**Problem:** Not fetching critical fields from Shopify

**Missing Fields:**
- `totalDiscountsSet { shopMoney { amount } }`
- `totalRefundedSet { shopMoney { amount } }`
- `paymentGatewayNames`
- `cancelledAt`
- `test`

**Impact:** Cannot calculate correct Revenue Generated and Revenue Earned

---

#### Issue 2: Incomplete ORDER# Storage
**Location:** `shopify-sync.worker.js`

**Problem:** Not storing all required fields

**Missing Fields:**
- `discounts`
- `refunds`
- `netRevenue`
- `paymentType`
- `isCancelled`
- `isTest`
- `cancelledAt`

**Impact:** Summary calculator cannot compute accurate metrics

---

#### Issue 3: Wrong Revenue Formulas
**Location:** `summary-calculator.worker.js`

**Problem:** Using `totalPrice` instead of `totalPrice - discounts - refunds`

**Current:**
```javascript
dailyStats[date].revenueGenerated += (o.totalPrice || 0);
dailyStats[date].revenueEarned += (order?.totalPrice || 0);
```

**Should Be:**
```javascript
// Revenue Generated (non-cancelled orders)
if (!o.isCancelled && !o.isTest) {
  dailyStats[date].revenueGenerated += ((o.totalPrice || 0) - (o.discounts || 0));
}

// Revenue Earned (delivered orders)
if (s.deliveryStatus === "delivered") {
  dailyStats[date].revenueEarned += (order?.netRevenue || 0);
}
```

**Impact:** Profit calculations are incorrect

---

#### Issue 4: Missing Order Status Tracking
**Location:** `summary-calculator.worker.js`

**Problem:** Not tracking cancelled and in-transit orders

**Missing Logic:**
```javascript
if (s.deliveryStatus === "cancelled") {
  dailyStats[date].cancelledOrders++;
} else if (s.deliveryStatus === "in_transit") {
  dailyStats[date].inTransitOrders++;
}
```

**Impact:** Cannot show complete order breakdown

---

#### Issue 5: Missing Prepaid/COD Tracking
**Location:** `summary-calculator.worker.js`

**Problem:** Not counting prepaid vs COD orders

**Missing Logic:**
```javascript
if (order.paymentType === "prepaid") {
  dailyStats[date].prepaidOrders++;
} else {
  dailyStats[date].codOrders++;
}
```

**Impact:** Cannot show payment method breakdown

---

#### Issue 6: Missing RTO Revenue Lost
**Location:** `summary-calculator.worker.js`

**Problem:** Not calculating revenue lost from RTO orders

**Missing Logic:**
```javascript
if (s.deliveryStatus === "rto") {
  dailyStats[date].rtoRevenueLost += (order?.netRevenue || 0);
}
```

**Impact:** Cannot show true cost of RTOs

---

#### Issue 7: Hardcoded Frontend Data
**Location:** `Dashboard.jsx`

**Problem:** Using hardcoded values instead of API data

**Hardcoded Values:**
- Total Orders: `150`
- Cancelled Orders: `23`
- Prepaid Orders: `22`
- Performance Chart Data: 29 days of fake data
- Money Flow Chart Data: Fake revenue breakdown

**Impact:** Dashboard shows incorrect data

---

#### Issue 8: Shiprocket Status Not Normalized
**Location:** `shiprocket-sync.worker.js`

**Problem:** Storing raw Shiprocket status without normalization

**Current:**
```javascript
deliveryStatus: ship.status?.toLowerCase()
```

**Should Be:**
```javascript
deliveryStatus: normalizeStatus(ship.status)

function normalizeStatus(status) {
  const s = (status || "").toUpperCase().trim();
  if (s === "DELIVERED") return "delivered";
  if (s.startsWith("RTO")) return "rto";
  if (s.includes("CANCEL")) return "cancelled";
  if (s.includes("TRANSIT") || s.includes("PENDING")) return "in_transit";
  return "unknown";
}
```

**Impact:** Inconsistent status values in database

---

### Medium Priority Issues

#### Issue 9: No S3 Backup Implementation
**Problem:** Code references S3 URLs but doesn't actually upload

**Impact:** No raw data backup for debugging

---

#### Issue 10: No Error Notifications
**Problem:** Worker failures are logged but not alerted

**Impact:** Silent failures go unnoticed

---

#### Issue 11: No Sync Progress UI
**Problem:** User cannot see sync progress in real-time

**Impact:** Poor user experience during initial sync

---

### Low Priority Issues

#### Issue 12: Typo in Dashboard
**Location:** `Dashboard.jsx` line 350

**Problem:** "TOtal Orders" should be "Total Orders"

---

#### Issue 13: No Data Validation
**Problem:** No validation for negative values or outliers

**Impact:** Bad data can corrupt metrics

---

#### Issue 14: No Rate Limit Handling
**Problem:** No exponential backoff for API rate limits

**Impact:** Sync can fail during high-volume periods


---

## SUMMARY

### What Works ✅

1. User authentication (Cognito)
2. Platform integrations (Shopify, Meta, Shiprocket)
3. COGS entry and storage
4. Business expenses entry
5. Worker queue system (SQS)
6. Basic data fetching from APIs
7. DynamoDB storage
8. Dashboard API endpoint
9. Basic profit calculation
10. Top products calculation

### What Doesn't Work ❌

1. Revenue formulas (using totalPrice instead of totalPrice - discounts)
2. Refunds not subtracted from revenue earned
3. Cancelled orders not tracked
4. In-transit orders not tracked
5. Prepaid/COD counts not tracked
6. RTO revenue lost not calculated
7. Hardcoded dashboard values
8. Hardcoded chart data
9. Missing Shopify fields in GraphQL query
10. Incomplete ORDER# record storage
11. Shiprocket status not normalized
12. No S3 backup implementation

### Priority Fix Order

1. **Fix Shopify GraphQL query** - Add missing fields
2. **Fix Shopify worker storage** - Store all required fields
3. **Fix summary calculator formulas** - Use correct revenue calculations
4. **Fix summary calculator tracking** - Track all order statuses
5. **Fix dashboard frontend** - Remove hardcoded data
6. **Fix dashboard service** - Add missing fields
7. **Fix Shiprocket status** - Normalize status values
8. **Implement S3 backup** - Upload raw JSON

---

## CONCLUSION

This documentation provides a complete overview of the ProfitFirst platform, including:

- User journey from signup to dashboard unlock
- Technical architecture and data flow
- Current code implementation with file references
- Database schema (current vs should be)
- API endpoints
- Worker system
- All issues and gaps

Use this as a reference guide for understanding the system and fixing the identified issues.

---

**END OF DOCUMENTATION**

