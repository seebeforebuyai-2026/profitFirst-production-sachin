# ProfitFirst - Dashboard Formulas & Data Matrix

## 📊 Complete Dashboard Overview

This document defines **ALL** the metrics, formulas, and data sources for the ProfitFirst dashboard.

---

## 🧠 CORE PRINCIPLE (NON-NEGOTIABLE)

**The Three Truths:**
- **Shopify** = The Revenue Truth (Order values, discounts, refunds)
- **Shiprocket** = The Delivery Truth (Shipping costs, RTO status, delivery dates)
- **Meta** = The Spend Truth (Absolute daily marketing cost)

👉 If you break this → ❌ wrong profit
👉 If you follow → ✅ bank-level accuracy

---

## ️ DATABASE STRUCTURE

### Table: `ProfitFirst_Core` (Singapore ap-southeast-1)

| PK | SK | Description |
|----|----|-------------|
| `MERCHANT#<id>` | `PROFILE` | Onboarding flags, gatewayFeeRate (default 2.5%), rtoHandlingFee |
| `MERCHANT#<id>` | `VARIANT#<id>` | Master COGS: current costPrice, salePrice, productImage |
| `MERCHANT#<id>` | `ORDER#<id>` | Frozen Snapshot: totalPrice, cogsAtSale, status, paymentType |
| `MERCHANT#<id>` | `SHIPMENT#<id>` | freight_charges, return_freight_charges, deliveryStatus |
| `MERCHANT#<id>` | `ADS#<YYYY-MM-DD>` | Daily marketing spend (one record per day) |
| `MERCHANT#<id>` | `SUMMARY#<date>` | **PRE-CALCULATED DAILY PROFIT** (Dashboard source) |
| `MERCHANT#<id>` | `SYNC#SHOPIFY` | Sync progress |
| `MERCHANT#<id>` | `SYNC#META` | Sync progress |
| `MERCHANT#<id>` | `SYNC#SHIPROCKET` | Sync progress |

---

## 📈 DASHBOARD SECTIONS & FORMULAS

### SECTION 1: ACTUAL MONEY

| Metric | Formula | Source | Notes |
|--------|---------|--------|-------|
| **Revenue Generated** | `SUM(totalPriceSet - totalDiscountsSet)` from ALL Shopify orders | Shopify | Includes pending, paid, excludes cancelled, failed, test orders |
| **Revenue Earned** | `SUM(netRevenue)` where netRevenue = totalPrice - discounts - refunds | Shopify | Only delivered orders Revenue |
| **COGS** | `SUM(cogsAtSale × quantity)` | Order records | Use variant level COGS, frozen at sync time |
| **Money Kept (Net Profit)** | `Net Revenue - COGS - Ads Spend - Shipping Spend - Business Expenses - Gateway Fees - RTO Handling Fees` | Calculated | **MAIN METRIC** |
| **Profit Margin** | `(Money Kept / Net Revenue) × 100` | Calculated | Percentage |

---

### SECTION 2: ADS PERFORMANCE

| Metric | Formula | Source | Notes |
|--------|---------|--------|-------|
| **Ads Spend** | `SUM(ad_spend)` from Meta Ads | Meta Platforms Ads | Fetch from Meta Ads Manager |
| **ROAS** | `Revenue Generated / Ads Spend` | Calculated | |
| **POAS** | `Money Kept / Ads Spend` | Calculated | **MORE IMPORTANT** than ROAS |

#### POAS Decision Logic

| POAS Value | Status | Message |
|------------|--------|---------|
| `< 1.2` | 🚨 High Risk | "Your ad spend is eating your profit. Review campaigns." |
| `1.2 - 2.5` | ✅ Sustainable | "Ads are profitable. Monitor closely." |
| `> 2.5` | 🚀 Scale Now | "You earn profit" |

---

### SECTION 3: ORDER ECONOMICS

| Metric | Formula | Source | Notes |
|--------|---------|--------|-------|
| **Total Orders** | `Count(Shopify orders)` | Shopify | All orders placed (excluding test, cancelled, voided) |
| **Delivered Orders** | `Count(status = delivered)` | Shiprocket | Only delivered |
| **RTO Count** | `Count(status = RTO)` | Shiprocket | Returned to origin |
| **Cancelled Orders** | `Count(status = cancelled)` | Shiprocket | Cancelled orders |
| **Prepaid Orders** | `Count(paymentType = prepaid)` | Shopify | For gateway fee calculation |
| **AOV (Average Order Value)** | `Revenue Generated / Total Orders` | Calculated | Based on ALL orders |
| **Profit Per Order** | `Money Kept / Delivered Orders` | Calculated | |
| **Shipping Per Order** | `Shipping Spend / Delivered Orders` | Calculated | |

---

### SECTION 4: PRODUCT PROFITABILITY (Top 5 Products)

| Metric | Formula | Source | Notes |
|--------|---------|--------|-------|
| **Product Name** | From Shopify (stored in ORDER) | Shopify | |
| **Delivered Quantity** | `SUM(product_quantity where order delivered)` | Shiprocket → delivery status | |
| **Product Revenue** | `SUM(product_price × quantity)` | Shopify → sale price | |
| **Product COGS** | `product_cost × delivered_quantity` | Order records | Use variant level COGS |
| **Product Profit** | `Product Revenue - Product COGS` | Calculated | |

---

### SECTION 5: COST LEAKAGE

| Metric | Formula | Source | Notes |
|--------|---------|--------|-------|
| **Shipping Spend** | `Forward Freight + Return Freight` from Shiprocket | Shiprocket | Forward for delivered, Forward + Return for RTO |
| **RTO Handling Fees** | `RTO Count × RTO Handling Fee` | Calculated | Fee stored in PROFILE record |
| **Gateway Fees** | `SUM(Prepaid Delivered Revenue) × gateway_percentage` | Calculated | Default 2.5%, only prepaid orders that were delivered |
| **Fixed Expenses** | `SUM(manual expenses)` | Manually entered | Rent, staff, tools, subscriptions stored in database |
| **RTO Revenue Lost** | `SUM(netRevenue where status = RTO)` | Calculated | Expected revenue lost |

---

### SECTION 6: PENDING / OUTCOME

| Metric | Formula | Source | Notes |
|--------|---------|--------|-------|
| **In Transit Orders** | `Count(status = in_transit)` | Shiprocket | Currently in transit |
| **Delivery Success Rate** | `Delivered / (Delivered + RTO)` from last 30 days of `SUMMARY#` records | Calculated | Calculate from LAST 30 DAYS of merchant's data |
| **Expected Delivered** | `In Transit × Delivery Success Rate (merchant-specific)` | Calculated | Forecast using last 30 days success rate |
| **Expected Revenue** | `Expected Delivered × AOV` | Calculated | Forecast |
| **Risk Level** | Based on RTO Rate (calculated from last 30 days) | Calculated | See notes below |

#### Risk Level Logic
Calculate RTO Rate from last 30 days of data:
```
RTO Rate = RTO Orders / (Delivered Orders + RTO Orders) × 100
```

| RTO Rate | Risk Level | Color |
|----------|------------|-------|
| `< 15%` | Low Risk | Green |
| `15-30%` | Medium Risk | Yellow |
| `> 30%` | High Risk | Red |

---

### SECTION 7: DASHBOARD GRAPHS

#### Net Profit Chart
- **Data:** Daily Net Profit for last 30 days
- **Formula:** `Net Profit = Revenue - COGS - Ads - Shipping - Gateway Fees - RTO Handling - Expenses`

#### Money Flow Chart
- **Metrics:** Revenue, Product Cost, Ads Spend, Shipping Fees, Business Expenses, Money Kept

---

### SECTION 8: BUSINESS EXPENSE PAGE

#### Stored in Database

| Field | Description |
|-------|-------------|
| `agencyFees` | Agency/Marketing fees |
| `otherExpenses` | Other expenses |
| `rtoHandlingFees` | RTO handling fees |
| `paymentGatewayFees` | Payment gateway fees |
| `staffSalary` | Staff salaries |
| `officeRent` | Office rent |
| `toolsCost` | Tools costs |
| `softwareSubscriptions` | Software subscriptions |

#### Business Expenses Formula

```
Business Expenses = SUM(all manual expenses)
```

---

## 🔌 DATA SOURCES

| Metric | Platform | API Endpoint | Notes |
|--------|----------|--------------|-------|
| **Products** | Shopify | GraphQL Admin API v2024-04+ | Required fields: totalPriceSet, totalDiscountsSet, totalRefundedSet, paymentGatewayNames |
| **Orders** | Shopify | GraphQL Admin API v2024-04+ | With `since_id` cursor |
| **Meta Ads** | Meta | Graph API v20.0+ `/act_<ID>/insights` | Day-by-day, convert to IST |
| **Shiprocket Shipments** | Shiprocket | REST API v2 `/v1/external/shipments` | Page-by-page |
| **Business Expenses** | Manual | Frontend form | Merchant enters manually |

---

## 🌍 TIMEZONE HANDLING

### Rule: ALL timestamps stored in UTC, ALL summaries in IST

| Storage | Format | Example |
|---------|--------|---------|
| **Raw Data** | UTC ISO 8601 | `2026-03-19T14:30:00Z` |
| **SUMMARY# Key** | IST Date | `SUMMARY#2026-03-19` |
| **Date Display** | IST | `March 19, 2026` |

### Conversion Logic

```javascript
// Use date-fns-tz library
const { formatInTimeZone } = require("date-fns-tz");

// Convert UTC to IST
const istDate = formatInTimeZone(
  new Date(utcTimestamp),
  "Asia/Kolkata",
  "yyyy-MM-dd",
);

// Use IST date as SUMMARY# key
const summaryKey = `SUMMARY#${istDate}`;
```

---

## 📊 SUMMARY# RECORD SCHEMA

```javascript
MERCHANT#<id> | SUMMARY#2026-03-19
{
  // Revenue
  revenueGenerated: 50000,      // ALL orders total (totalPrice - discounts)
  revenueEarned: 42000,         // DELIVERED orders only (netRevenue)
  refunds: 1000,                // Refunded amount
  cogs: 18000,                  // Frozen COGS from orders
  adsSpend: 8000,               // Meta ads for this day
  shippingSpend: 3000,          // Shiprocket fees (forward + return)
  rtoHandlingFees: 500,         // RTO handling fees
  gatewayFees: 1000,            // Prepaid delivered revenue × gatewayFee%
  businessExpenses: 1500,       // Manual expenses

  // Profit
  moneyKept: 18000,             // Final profit
  profitMargin: 42.86,          // (moneyKept / netRevenue) × 100

  // Orders
  totalOrders: 210,
  deliveredOrders: 180,
  rtoOrders: 12,
  cancelledOrders: 10,
  inTransitOrders: 5,

  // Ads
  roas: 6.25,                   // revenueGenerated / adsSpend
  poas: 2.25,                   // moneyKept / adsSpend

  // Averages
  aov: 238,                     // revenueGenerated / totalOrders
  profitPerOrder: 100,          // moneyKept / deliveredOrders
  shippingPerOrder: 16.67,      // shippingSpend / deliveredOrders

  // Risk
  rtoRate: 6.25,                // rtoOrders / (delivered + rto) × 100
  rtoRevenueLost: 3000,         // Sum of RTO order totals

  // Metadata
  date: "2026-03-19",           // IST date
  createdAt: "2026-03-19T23:59:59Z",
  updatedAt: "2026-03-19T23:59:59Z"
}
```

---

## 🔍 DASHBOARD API ENDPOINT

### GET `/api/dashboard/summary?from=2026-03-01&to=2026-03-07`

**Backend Logic:**
1. Query `SUMMARY#` records for date range
2. Aggregate all fields (SUM totals, AVG rates)
3. Calculate POAS decision message
4. Return single aggregated object

**Important:** For date ranges, NEVER sum percentages (ROAS, POAS). Instead:
- SUM the raw totals (Total Revenue, Total Spend, Total Profit)
- Calculate ratios at the end

**Response:**
```json
{
  "dateRange": {
    "from": "2026-03-01",
    "to": "2026-03-07"
  },
  "revenue": {
    "generated": 350000,
    "earned": 300000
  },
  "costs": {
    "cogs": 120000,
    "adsSpend": 50000,
    "shippingSpend": 15000,
    "rtoHandlingFees": 2500,
    "gatewayFees": 7125,
    "businessExpenses": 8000
  },
  "profit": {
    "moneyKept": 97375,
    "profitMargin": 32.46
  },
  "ads": {
    "roas": 7.0,
    "poas": 1.95,
    "scalingDecision": "✅ Sustainable: Ads are profitable. Monitor closely."
  },
  "orders": {
    "total": 1500,
    "delivered": 1200,
    "rto": 150,
    "cancelled": 100,
    "inTransit": 50,
    "rtoRate": 11.11
  },
  "forecast": {
    "inTransit": 50,
    "successRate": 88.89,
    "expectedDelivered": 44,
    "expectedRevenue": 10500,
    "riskLevel": "Low Risk"
  },
  "averages": {
    "aov": 233,
    "profitPerOrder": 81,
    "shippingPerOrder": 12.5
  },
  "topProducts": [...],
  "costBreakdown": {
    "cogs": 42.1,
    "adsSpend": 17.5,
    "shipping": 5.3,
    "gatewayFees": 2.5,
    "businessExpenses": 2.8,
    "moneyKept": 32.5
  }
}
```

---

## 🧪 VERIFICATION CHECK (Before Dashboard Unlock)

Before unlocking dashboard, verify accuracy:

1. **Check 1:** Do we have at least one order in the last 90 days?
2. **Check 2:** Does `SUMMARY#` total match Shopify "Total Sales" for the last 24 hours?
3. **Check 3:** Are there any variants with ₹0 cost?
4. **Check 4:** Is `cogsCompleted = true` and `initialSyncCompleted = true`?

If all checks pass → `dashboardUnlocked = true`

---

## 📝 NOTES

- **Never calculate dashboard from raw ORDER# records** - Always use `SUMMARY#` records
- **All timestamps stored in UTC** - Use `date-fns-tz` for IST conversion
- **COGS is frozen at order time** - Historical profit stays accurate
- **Gateway fees only on prepaid orders that were delivered** - COD orders have no gateway fee
- **RTO orders lose shipping money** - Count return shipping as cost
- **POAS is more important than ROAS** - Shows real profitability
- **Delivery success rate should be calculated per merchant from last 30 days** - Not a fixed 80%
- **Date ranges use IST** - All summaries calculated for IST days
- **Never sum percentages (ROAS, POAS)** - Sum raw totals then calculate ratios at the end

---

## 🏆 PRODUCTION SAFETY CHECKLIST

- **Idempotency:** Use Shopify/Shiprocket IDs as Sort Keys to prevent double-counting
- **Hybrid Storage:** Upload all raw API JSON responses to S3; store only slim, calculated fields in DynamoDB
- **Timezone Enforcement:** Store timestamps in UTC, but group all SUMMARY# records by IST
- **Sequential Unlock:** Dashboard unblurs ONLY after `cogsCompleted == true` AND `initialSyncCompleted == true`
- **Queue Chaining:** Workers use SQS message chaining to paginate 100,000+ records without timing out

---

## 📊 ENTERPRISE AGGREGATION RULE (CRITICAL)

When the user selects a date range (e.g., "Last 7 Days" or "Last 30 Days"):

**❌ WRONG:**
- `avg(ROAS)` across 7 days
- `avg(POAS)` across 7 days

**✅ CORRECT:**
1. Query all `SUMMARY#` records in the date range
2. SUM the raw totals:
   - `SUM(revenueGenerated)`
   - `SUM(adsSpend)`
   - `SUM(moneyKept)`
   - `SUM(netRevenue)`
3. Calculate ratios at the end:
   - `ROAS = SUM(revenueGenerated) / SUM(adsSpend)`
   - `POAS = SUM(moneyKept) / SUM(adsSpend)`
   - `Profit Margin = (SUM(moneyKept) / SUM(netRevenue)) × 100`

---

**Last Updated:** March 25, 2026
**Version:** 1.0 (Production Ready)
---

# 📚 OFFICIAL API DOCUMENTATION

## 🟢 SHOPIFY: THE REVENUE ENGINE

### API Protocol
**GraphQL Admin API v2024-04+**

**Endpoint:** `POST /admin/api/2024-04/graphql.json`

---

### 🎯 REQUIRED FIELDS (ONLY THESE)

```graphql
query GetOrders($cursor: String) {
  orders(
    first: 50,
    after: $cursor,
    query: "test:false",
    sortKey: CREATED_AT,
    reverse: true
  ) {
    edges {
      node {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
          }
        }
        totalRefundedSet {
          shopMoney {
            amount
          }
        }
        paymentGatewayNames
        lineItems(first: 50) {
          edges {
            node {
              variant {
                id
                inventoryItem {
                  unitCost {
                    amount
                  }
                }
              }
              quantity
              discountedUnitPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

---

### 🚨 DATA CLEANING (MANDATORY)

**REMOVE these orders:**
- `test = true`
- `cancelledAt != null`
- `displayFinancialStatus = VOIDED`

**KEEP these orders:**
- `PAID`
- `PENDING`
- `PARTIALLY_PAID`

---

### 💰 REVENUE LOGIC (FINAL)

```javascript
// Revenue Generated (ALL orders)
revenueGenerated = totalPriceSet - totalDiscountsSet

// Net Revenue (for delivered orders only)
netRevenue = totalPriceSet - totalDiscountsSet - totalRefundedSet
```

---

### 💳 PAYMENT TYPE LOGIC

```javascript
// If paymentGatewayNames includes "Cash on Delivery" OR is empty
if (paymentGatewayNames.includes("Cash on Delivery") || paymentGatewayNames.length === 0) {
  paymentType = "COD";
} else {
  paymentType = "PREPAID";
}
```

---

### 🧊 FREEZE COGS (CRITICAL)

```javascript
// At sync time, look up variant cost in VARIANT# table
const costAtSale = shopify.unitCost || VARIANT_TABLE.costPrice;

// Store in ORDER# permanently
ORDER#<id> {
  cogsAtSale: costAtSale,  // NEVER change this for that order
  // ... other fields
}
```

---

### 📦 ORDER STORAGE

```javascript
ORDER#<orderId> {
  entityType: "ORDER",
  orderId: "ShopifyOrderID",
  merchantId: "MERCHANT#<id>",
  totalPrice: 1200,
  currency: "INR",
  netRevenue: 1150,           // totalPrice - discounts - refunds
  paymentType: "prepaid",     // or "cod"
  status: "paid",             // from displayFinancialStatus
  cogsAtSale: 400,            // Frozen COGS at sync time
  createdAt: "2026-03-19T14:30:00Z",
  lineItems: [
    {
      variantId: "V1",
      quantity: 2,
      price: 400,
      cogsAtSale: 200
    }
  ]
}
```

---

## 🔵 SHIPROCKET: THE DELIVERY GATEKEEPER

### API Protocol
**REST API v2**

**Endpoint:** `GET /v1/external/shipments`

---

### 🎯 REQUIRED FIELDS

```json
{
  "order_id": "ShopifyOrderID",
  "status": "DELIVERED",
  "freight_charges": 50,
  "return_freight_charges": 0,
  "delivered_date": "2026-03-19"
}
```

---

### 🔄 STATUS MAPPING

| Shiprocket | System Status |
|------------|---------------|
| `DELIVERED` | `delivered` |
| `RTO` | `rto` |
| `IN TRANSIT` | `in_transit` |
| `CANCELED` | `cancelled` |

---

### 💸 SHIPPING LOGIC

```javascript
// IF delivered:
if (status === "DELIVERED") {
  shipping = freight_charges;
}

// IF RTO:
if (status === "RTO") {
  shipping = freight_charges + return_freight_charges;
}
```

---

### 🎯 DELIVERY RULE

```
Revenue Earned ONLY when status = delivered
```

---

### 🔁 SYNC RULE (IMPORTANT)

**Always re-fetch shipments with these statuses:**
- `IN_TRANSIT`
- `AWB_ASSIGNED`

This ensures you catch delivery status updates.

---

## 🟠 META ADS: THE MARKETING COST

### API Protocol
**Graph API v20.0+**

**Endpoint:** `GET /v20.0/act_<adAccountId>/insights`

**Required Fields:** `spend`

---

### 🚨 STRICT RULES

```
✅ ONLY use: spend
❌ NEVER use: Meta revenue or Meta ROAS
```

Meta's revenue and ROAS are often double-counted or inaccurate. Only trust the `spend` field.

---

### 🕒 TIMEZONE

```
Meta returns data in the Ad Account timezone.
Worker must convert to Asia/Kolkata (IST) before saving.
```

---

### 📊 ADS STORAGE

```javascript
ADS#<YYYY-MM-DD> {
  entityType: "ADS",
  merchantId: "MERCHANT#<id>",
  date: "2026-03-19",         // IST date
  adsSpend: 15000,
  createdAt: "2026-03-19T23:59:59Z"
}
```

---

## 🧮 MASTER PROFIT FORMULA

This logic runs every hour to update the `SUMMARY#` record for the day.

### Step 1: Net Revenue (Real Cash In)

```javascript
Net Revenue = (Revenue of Delivered Orders) - (Shopify totalRefundedSet)
```

### Step 2: Total Costs (Real Cash Out)

```javascript
Total Costs = 
  COGS (Delivered Only) +
  Ads Spend +
  Shipping (Forward + Return) +
  Gateway Fees +
  RTO Handling +
  Business Expenses
```

**Detailed Calculations:**

```javascript
// COGS: SUM(cogsAtSale × quantity) for Delivered orders only
cogs = SUM(cogsAtSale × quantity) WHERE status = 'delivered'

// Marketing: SUM(Meta spend) for that IST day
adsSpend = SUM(adsSpend) WHERE date = 'IST_DATE'

// Shipping: SUM(Forward Freight + Return Freight) for Delivered/RTO items
shipping = 
  SUM(freight_charges WHERE status = 'delivered') +
  SUM(freight_charges + return_freight_charges WHERE status = 'rto')

// Gateway Fees: SUM(Prepaid Delivered Revenue) × 0.025
gatewayFees = SUM(netRevenue WHERE paymentType = 'prepaid' AND status = 'delivered') × 0.025

// RTO Handling: Count(RTO Orders) × rtoHandlingFee
rtoHandlingFees = COUNT(status = 'rto') × rtoHandlingFee

// Business Expenses: SUM(Manual Expenses)
businessExpenses = SUM(manualExpenses)
```

### Step 3: Money Kept (The Final Profit)

```javascript
Money Kept = Net Revenue - Total Costs
```

---

## 📊 SUMMARY ENGINE

**RUN:** Every 1 hour

**STORE:**

```javascript
SUMMARY#<YYYY-MM-DD> {
  entityType: "SUMMARY",
  merchantId: "MERCHANT#<id>",
  date: "2026-03-19",         // IST date

  // Revenue
  revenueGenerated: 50000,    // ALL orders (totalPrice - discounts)
  revenueEarned: 42000,       // DELIVERED orders only (netRevenue)
  refunds: 1000,              // Refunded amount

  // Costs
  cogs: 18000,                // Frozen COGS from delivered orders
  adsSpend: 8000,             // Meta ads for this day
  shippingSpend: 3000,        // Shiprocket fees (forward + return)
  rtoHandlingFees: 500,       // RTO handling fees
  gatewayFees: 1000,          // Prepaid delivered revenue × gatewayFee%
  businessExpenses: 1500,     // Manual expenses

  // Profit
  moneyKept: 18000,           // Final profit
  profitMargin: 42.86,        // (moneyKept / netRevenue) × 100

  // Orders
  totalOrders: 210,
  deliveredOrders: 180,
  rtoOrders: 12,
  cancelledOrders: 10,
  inTransitOrders: 5,

  // Ads
  roas: 6.25,                 // revenueGenerated / adsSpend
  poas: 2.25,                 // moneyKept / adsSpend

  // Averages
  aov: 238,                   // revenueGenerated / totalOrders
  profitPerOrder: 100,        // moneyKept / deliveredOrders
  shippingPerOrder: 16.67,    // shippingSpend / deliveredOrders

  // Risk
  rtoRate: 6.25,              // rtoOrders / (delivered + rto) × 100
  rtoRevenueLost: 3000,       // Sum of RTO order totals

  // Metadata
  createdAt: "2026-03-19T23:59:59Z",
  updatedAt: "2026-03-19T23:59:59Z"
}
```

---

## 📦 TOP PRODUCTS (FINAL)

```sql
SELECT 
  product_name,
  SUM(quantity) as qty,
  SUM(price × quantity) as revenue,
  SUM(cost × quantity) as cogs
FROM ORDER_ITEMS
WHERE status = 'delivered'
GROUP BY product_name
ORDER BY qty DESC
LIMIT 5;
```

---

## 📊 ENTERPRISE AGGREGATION (7/30 DAY VIEWS)

**The Golden Rule:** Never sum percentages.

### ❌ WRONG:
```javascript
// This is WRONG:
avg(ROAS) across 7 days
avg(POAS) across 7 days
```

### ✅ CORRECT:

```javascript
// 1. Query all SUMMARY# records in the date range
const summaries = query(`SUMMARY#2026-03-12`, `SUMMARY#2026-03-18`);

// 2. Sum the raw totals
const totalRevenue = SUM(summaries.revenueGenerated);
const totalAdsSpend = SUM(summaries.adsSpend);
const totalMoneyKept = SUM(summaries.moneyKept);
const totalNetRevenue = SUM(summaries.revenueEarned - summaries.refunds);

// 3. Calculate ratios at the end
const finalROAS = totalRevenue / totalAdsSpend;
const finalPOAS = totalMoneyKept / totalAdsSpend;
const finalProfitMargin = (totalMoneyKept / totalNetRevenue) × 100;
```

---

## 🔐 PRODUCTION SAFETY CHECKLIST

### ❗ Refund Handling
```
Net Revenue = Revenue - Refunds
```

### ❗ RTO Cost
```
Shipping = Forward Freight + Return Freight
```

### ❗ Delivery Date Rule
```
Use Shiprocket delivered_date (NOT order date)
```

### ❗ Idempotency
```
Primary Key = ORDER#<id>
```

### ❗ Timezone
```
Store → UTC
Summary → IST
```

### ❗ No Raw Data
```
Dashboard ONLY uses SUMMARY#
```

---

## 🔐 ENTERPRISE SAFETY (ADVANCED)

### Store Raw API JSON in S3 (Backup)
```
S3 Path: s3://bucket/merchantId/orders/orderId.json
DynamoDB stores: rawDataS3Url
```

### Use Cursor Pagination (Shopify)
```
Use endCursor for next page
```

### Use Retry System (API Failure)
```
Exponential Backoff: 1s, 2s, 4s, 8s
```

### Use SQS for Scaling
```
Queue: profitfirst-sync-queue
DLQ: profitfirst-sync-dlq
```

### Partial Failure Handling
```
Meta fail ≠ system fail
Continue processing other data
```

---

## ✅ FINAL CHECKLIST

- [ ] Orders synced (90 days)
- [ ] Shipments linked
- [ ] Meta spend synced
- [ ] COGS filled
- [ ] Refunds handled
- [ ] No duplicates
- [ ] Summary built

---

## 🏆 FINAL RESULT

If you follow THIS EXACT DOCUMENT:

✅ 100% correct profit  
✅ Matches real bank cash  
✅ Handles refunds + RTO  
✅ Scales to 100K+ orders  
✅ No data mismatch  


**Last Updated:** March 25, 2026  
**Version:** 1.0 (Production Ready)
