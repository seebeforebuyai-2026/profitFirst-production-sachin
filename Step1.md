# ProfitFirst Dashboard — Complete Production Documentation

> **Purpose:** Single source of truth for every metric on the dashboard.
> Covers: what each metric is, exact formula, which API field to use, known bugs fixed, and what to skip with reason.

---

## CONTENTS
1. [Architecture Overview](#architecture)
2. [Data Fetching — Shopify](#shopify)
3. [Data Fetching — Meta Ads](#meta)
4. [Data Fetching — Shiprocket](#shiprocket)
5. [Cross-Reference Logic (Shopify ↔ Shiprocket)](#crossref)
6. [Section 1 — Actual Money](#section1)
7. [Section 2 — Ads Performance](#section2)
8. [Section 3 — Order Economics](#section3)
9. [Section 4 — Product Profitability](#section4)
10. [Section 5 — Cost Leakage](#section5)
11. [Section 6 — Pending / Forecast](#section6)
12. [Section 7 — Dashboard Graphs](#section7)
13. [Known Bugs Fixed](#bugs)
14. [What Is Skipped & Why](#skipped)
15. [Production API Response Shape](#shape)

---

## 1. ARCHITECTURE OVERVIEW <a name="architecture"></a>

```
Shopify GraphQL  ──┐
Meta Graph API   ──┼──► Worker (per merchant per day) ──► DynamoDB SUMMARY# record
Shiprocket REST  ──┘
                              ▼
                    Dashboard API /summary
                              ▼
                    React Frontend
```

- Worker runs **once per day per merchant** and stores a `SUMMARY#YYYY-MM-DD` record.
- Dashboard API reads from DynamoDB (no live API calls during user request).
- For the **audit/test script**, all 3 APIs are called directly in sequence.

---

## 2. SHOPIFY DATA FETCHING <a name="shopify"></a>

### API
```
POST https://{shopifyStore}/admin/api/2024-04/graphql.json
Header: X-Shopify-Access-Token: {token}
```

### GraphQL Query (FINAL — production ready)
```graphql
query GetOrders($after: String) {
  orders(
    first: 250
    after: $after
    sortKey: CREATED_AT
    query: "created_at:>=YYYY-MM-DD AND created_at:<=YYYY-MM-DD"
  ) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name                          # e.g. "#luxc3288" — used for SR cross-ref
        createdAt
        cancelledAt                   # null if not cancelled
        test                          # skip if true
        displayFulfillmentStatus
        paymentGatewayNames           # ["Cash on Delivery"] or ["Razorpay"] etc.

        subtotalPriceSet        { shopMoney { amount } }
        totalPriceSet           { shopMoney { amount } }
        totalDiscountsSet       { shopMoney { amount } }
        totalTaxSet             { shopMoney { amount } }
        totalShippingPriceSet   { shopMoney { amount } }

        lineItems(first: 50) {
          edges {
            node {
              name
              quantity
              variant { id }
              discountedUnitPriceSet { shopMoney { amount } }
            }
          }
        }

        refunds {
          createdAt
          refundLineItems(first: 50) {
            edges {
              node {
                quantity
                subtotalSet { shopMoney { amount } }
                lineItem { name }
              }
            }
          }
        }
      }
    }
  }
}
```

### Order Inclusion Rules
| Condition | Action | Reason |
|-----------|--------|--------|
| `o.test === true` | **SKIP entirely** | Test orders never count |
| `o.cancelledAt !== null` | **Include in gross/total counts but mark as cancelled** | Dashboard includes cancelled in Gross Sales |
| Normal order | **Include in all metrics** | Standard order |

### Critical: This Store Uses Tax-Inclusive Pricing
`subtotalPriceSet` already **contains tax baked in**.
Do NOT use `subtotalPriceSet` directly as gross sales — it is NOT product-only revenue.

### Prepaid Detection
```javascript
const isPrepaid = !o.paymentGatewayNames.some(g =>
  g.toLowerCase().includes("cash on delivery") ||
  g.toLowerCase() === "cod" ||
  g.toLowerCase().includes("cash")
);
```
All other gateways (Razorpay, Paytm, Stripe, etc.) = prepaid.

### Refund Extraction — CRITICAL BUG FIXED
**Wrong (old code):** `o.refunds[].totalRefundedSet` — includes tax + shipping refunds
**Correct:** `o.refunds[].refundLineItems[].subtotalSet` — product value only

**Additional fix:** Cancelled order refunds are NOT "returns". They are cancellation refunds.
```javascript
// Only count refunds on NON-CANCELLED orders as Returns
const refunded = isCancelled ? 0 : o.refunds.reduce((sum, refund) => {
  return sum + refund.refundLineItems.edges.reduce((rSum, { node: rli }) => {
    return rSum + Number(rli.subtotalSet.shopMoney.amount);
  }, 0);
}, 0);
```

---

## 3. META ADS DATA FETCHING <a name="meta"></a>

### API
```
GET https://graph.facebook.com/v20.0/{adAccountId}/insights
Params:
  access_token: {token}
  time_range: {"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}
  fields: spend,purchase_roas,inline_link_click_ctr,reach,impressions,actions,action_values
```

### Fields Extracted
| Field | API Path | Notes |
|-------|----------|-------|
| Ads Spend | `data[0].spend` | String, parse to Number |
| ROAS (raw) | `data[0].purchase_roas[0].value` | action_type = "omni_purchase" |
| Purchases | `actions.find(a => a.action_type === "purchase").value` | |
| Purchase Value | `action_values.find(a => a.action_type === "purchase").value` | |
| CTR | `data[0].inline_link_click_ctr` | Already a percentage |
| Reach | `data[0].reach` | |
| Impressions | `data[0].impressions` | |
| Link Clicks | `actions.find(a => a.action_type === "link_click").value` | |
| Add to Cart | `actions.find(a => a.action_type === "add_to_cart").value` | |
| Initiate Checkout | `actions.find(a => a.action_type === "initiate_checkout").value` | |

**Note:** ROAS from Meta API (`purchase_roas`) is Meta's own attribution — it is NOT the same as the dashboard's ROAS (`Revenue Generated / Ads Spend`). Store the raw value but always calculate ROAS yourself.

---

## 4. SHIPROCKET DATA FETCHING <a name="shiprocket"></a>

### API
```
GET https://apiv2.shiprocket.in/v1/external/shipments
Params: from=YYYY-MM-DD&to=YYYY-MM-DD&per_page=100&page=1
Header: Authorization: Bearer {token}
```

### Pagination
`total_pages` is **null** in the response. Use link-based pagination:
```javascript
const nextLink = srRes.data.meta?.pagination?.links?.next || null;
nextUrl = (nextLink && nextLink !== nextUrl) ? nextLink : null;
```

### Shipment Status Classification
```javascript
const stat = (shipment.status || "").toUpperCase().trim();

if (stat === "DELIVERED")                              → category = "delivered"
if (stat.startsWith("RTO"))                            → category = "rto"
  // covers: RTO DELIVERED, RTO_NDR, RTO INITIATED, RTO IN TRANSIT
if (stat.includes("RETURN") && !stat.startsWith("RTO"))→ category = "returned"
if (stat.includes("CANCEL"))                           → category = "cancelled"
else                                                   → category = "in_transit"
```

### Freight Calculation
```javascript
const charges    = shipment.charges || {};
const freight    = Number(charges.freight_charges || 0);
const rtoFreight = Number(
  charges.charged_weight_amount_rto ||   // preferred
  charges.applied_weight_amount_rto ||   // fallback 1
  charges.rto_charges ||                 // fallback 2
  0
);

// DELIVERED: forward freight only
freightApplied = freight;

// RTO: forward + return leg (do NOT add freight twice)
freightApplied = freight + rtoFreight;

// IN_TRANSIT: forward freight only (return leg not yet charged)
freightApplied = freight;
```

### Cross-Reference Field — CRITICAL
To link Shiprocket shipments back to Shopify orders, use:
```javascript
const channelOrderId = shipment.channel_order_id?.toString() || "";
```
This contains the Shopify **order name** (e.g. `"#luxc3288"`).
Do NOT use `shipment.order_id` — that is Shiprocket's internal ID, not Shopify's.

⚠️ **IMPORTANT:** Log `channel_order_id` from a real response to verify the format.
If it is stored without the `#` prefix (e.g. `"luxc3288"`), adjust the comparison:
```javascript
// Normalize both sides before comparing
const normalize = (name) => name.replace(/^#/, "").toLowerCase();
```

---

## 5. CROSS-REFERENCE LOGIC (Shopify ↔ Shiprocket) <a name="crossref"></a>

This is used to compute: Revenue Earned, RTO Revenue Lost, Gateway Fees (prepaid delivered).

```javascript
// Build sets from Shiprocket
const srDeliveredOrderNames = new Set();  // channel_order_id of delivered shipments
const srRTOOrderNames       = new Set();  // channel_order_id of RTO shipments

// Then for each Shopify order:
s.orders.forEach(order => {
  const name = order.shopifyOrderName; // e.g. "#luxc3288"

  if (srDeliveredOrderNames.has(name)) {
    revenueEarned += order.netRevenue;
    if (order.isPrepaid) prepaidDelivRev += order.netRevenue;
  }

  if (srRTOOrderNames.has(name)) {
    rtoRevenueLost += order.netRevenue;
  }
});
```

**If Revenue Earned = 0:** The channel_order_id format doesn't match. Add this debug log:
```javascript
console.log("SR sample channel_order_id:", srShipments[0]?.channel_order_id);
console.log("Shopify sample name:", s.orders[0]?.shopifyOrderName);
```
Then fix the normalization to match both formats.

---

## 6. SECTION 1 — ACTUAL MONEY <a name="section1"></a>

### Revenue Generated
```
Formula:  SUM(totalPriceSet - totalDiscountsSet)
Orders:   Non-cancelled, non-test only
Source:   Shopify
API field: totalPriceSet.shopMoney.amount - totalDiscountsSet.shopMoney.amount
Frontend: summary.revenueGenerated
```

### Revenue Earned
```
Formula:  SUM(totalPrice - discounts - refunds) for DELIVERED orders ONLY
Orders:   Cross-referenced with Shiprocket — only orders where SR status = DELIVERED
Source:   Shopify (amounts) × Shiprocket (delivery confirmation)
Frontend: summary.revenueEarned
Note:     If cross-ref fails (Revenue Earned = 0), check channel_order_id format
```

### COGS (Total Cost of Goods Sold)
```
Formula:  SUM(variantCostAtSale × deliveredQuantity)
Source:   Order records in DB (frozen at sync time)
Status:   ⛔ SKIPPED — not available from Shopify/Meta/Shiprocket APIs
          Shopify does NOT return cost price via GraphQL without Inventory cost query
          Needs to be stored separately at order sync time
Frontend: summary.cogs = 0 (until implemented)
```

### Money Kept (Net Profit)
```
Formula:  Revenue Earned - COGS - Ads Spend - Shipping Spend - Gateway Fees
          - RTO Handling Fees - Business Expenses
Source:   Calculated
Current:  Revenue Earned - Ads Spend - Shipping Spend - Gateway Fees
          (COGS, RTO Handling Fees, Business Expenses skipped — unavailable)
Frontend: summary.moneyKept
⚠️ This number is INCOMPLETE until COGS and expenses are wired in
```

### Profit Margin
```
Formula:  (Money Kept / Revenue Earned) × 100
Source:   Calculated
Frontend: summary.profitMargin
```

---

## 7. SECTION 2 — ADS PERFORMANCE <a name="section2"></a>

### Ads Spend
```
Formula:  SUM(spend) from Meta Ads for the date range
Source:   Meta Graph API → data[0].spend
Frontend: summary.adsSpend
```

### ROAS (Return on Ad Spend)
```
Formula:  Revenue Generated / Ads Spend
Source:   Calculated (NOT Meta's purchase_roas field)
Frontend: summary.roas
```

### POAS (Profit on Ad Spend)
```
Formula:  Money Kept / Ads Spend
Source:   Calculated
Frontend: summary.poas
Decision:
  poas < 1.2  → "🚨 High Risk — Your ad spend is eating your profit. Review campaigns."
  1.2 ≤ poas ≤ 2.5 → "✅ Sustainable — Ads are profitable. Monitor closely."
  poas > 2.5  → "🚀 Scale Now — You earn profit."
Frontend: summary.poasDecision
```

### Additional Meta Metrics (for dashboard cards)
| Metric | API Field | Frontend Key |
|--------|-----------|--------------|
| Meta Purchases | `actions[purchase].value` | `summary.metaPurchases` |
| Purchase Value | `action_values[purchase].value` | `summary.purchaseValue` |
| CTR | `inline_link_click_ctr` | `summary.ctr` |
| Reach | `reach` | `summary.reach` |
| Impressions | `impressions` | `summary.impressions` |
| Link Clicks | `actions[link_click].value` | `summary.linkClicks` |
| Add to Cart | `actions[add_to_cart].value` | `summary.addToCart` |
| Initiate Checkout | `actions[initiate_checkout].value` | `summary.initiateCheckout` |

---

## 8. SECTION 3 — ORDER ECONOMICS <a name="section3"></a>

| Metric | Formula | Source | Status |
|--------|---------|--------|--------|
| Total Orders | COUNT(non-cancelled, non-test Shopify orders) | Shopify | ✅ |
| Delivered Orders | COUNT(SR status = DELIVERED) | Shiprocket | ✅ |
| RTO Count | COUNT(SR status starts with RTO) | Shiprocket | ✅ |
| Cancelled Orders | COUNT(Shopify cancelledAt ≠ null) | Shopify | ✅ |
| Prepaid Orders | COUNT(paymentGatewayNames ≠ COD) | Shopify | ✅ |
| COD Orders | Total Orders - Prepaid Orders | Calculated | ✅ |
| AOV | Revenue Generated / Total Orders | Calculated | ✅ |
| Profit Per Order | Money Kept / Delivered Orders | Calculated | ✅ |
| Shipping Per Order | Shipping Spend / Delivered Orders | Calculated | ✅ |

**Frontend keys:** `summary.totalOrders`, `summary.deliveredOrders`, `summary.rtoOrders`,
`summary.cancelledOrders`, `summary.prepaidOrders`, `summary.codOrders`,
`summary.aov`, `summary.profitPerOrder`, `summary.shippingPerOrder`

---

## 9. SECTION 4 — PRODUCT PROFITABILITY <a name="section4"></a>

### Top 5 Products by Revenue

| Metric | Formula | Source | Status |
|--------|---------|--------|--------|
| Product Name | lineItems[].name | Shopify | ✅ |
| Delivered Qty | SUM(quantity) only for SR-delivered orders | Shopify × Shiprocket cross-ref | ✅ |
| Product Revenue | SUM(discountedUnitPrice × qty) for delivered orders | Shopify | ✅ |
| Product COGS | variantCost × deliveredQty | DB (frozen at sync) | ⛔ SKIPPED |
| Product Profit | Product Revenue - Product COGS | Calculated | ⛔ SKIPPED (no COGS) |

```javascript
// Build product map — only for SR-delivered orders
srDeliveredOrderNames.forEach(orderName => {
  const shopifyOrder = s.orders.find(o => o.shopifyOrderName === orderName);
  if (!shopifyOrder) return;
  shopifyOrder.lineItems.forEach(li => {
    const key = li.variantId || li.name;
    productMap[key] = productMap[key] || { name: li.name, deliveredQty: 0, revenue: 0 };
    productMap[key].deliveredQty += li.quantity;
    productMap[key].revenue     += li.discountedUnitPrice * li.quantity;
  });
});

// Sort by revenue, take top 5
const top5 = Object.values(productMap)
  .sort((a, b) => b.revenue - a.revenue)
  .slice(0, 5);
```

**Frontend key:** `topProducts` array with `{ name, deliveredQty, revenue, cogs: 0, profit: 0 }`

---

## 10. SECTION 5 — COST LEAKAGE <a name="section5"></a>

| Metric | Formula | Source | Status |
|--------|---------|--------|--------|
| Shipping Spend | Forward Freight + Return Freight (from Shiprocket) | Shiprocket | ✅ |
| → Forward Freight | SUM(freight_charges) for all shipments | Shiprocket | ✅ |
| → Return Freight | SUM(rto_freight) for RTO shipments only | Shiprocket | ✅ |
| Gateway Fees | SUM(prepaid delivered revenue) × 2.5% | Calculated | ✅ |
| RTO Revenue Lost | SUM(netRevenue) for RTO orders | Shopify × Shiprocket | ✅ (if cross-ref works) |
| RTO Handling Fees | RTO Count × fee from merchant profile | DB Profile record | ⛔ SKIPPED |
| Fixed Expenses | SUM of manually entered expenses | DB | ⛔ SKIPPED (manual entry) |

```javascript
// Gateway Fees — ONLY prepaid orders that were DELIVERED
const gatewayFees = r2(prepaidDelivRev * 0.025);

// Shipping Spend
const shippingSpend = r2(sh.totalFreight);  // forward + return already separated
```

**Frontend keys:** `summary.shippingSpend`, `summary.gatewayFees`,
`summary.rtoRevenueLost`, `summary.rtoHandlingFees`, `summary.businessExpenses`

---

## 11. SECTION 6 — PENDING / FORECAST <a name="section6"></a>

| Metric | Formula | Source | Status |
|--------|---------|--------|--------|
| In Transit Orders | COUNT(SR status = in_transit) | Shiprocket | ✅ |
| Delivery Success Rate | Delivered / (Delivered + RTO) from last 30 days | DynamoDB SUMMARY# records | ⚠️ Currently uses today only |
| Expected Delivered | In Transit × Delivery Success Rate | Calculated | ✅ |
| Expected Revenue | Expected Delivered × AOV | Calculated | ✅ |
| RTO Rate | RTO / (Delivered + RTO) × 100 | Calculated | ✅ |
| Risk Level | RTO Rate < 15% = Low, 15-30% = Medium, >30% = High | Calculated | ✅ |

**Production note:** Delivery Success Rate must use **30-day rolling average** from stored SUMMARY# records, not just today's data. Today's data only has meaning after the day is fully resolved.

```javascript
// Correct production approach:
// 1. Query last 30 SUMMARY# records from DynamoDB for this merchant
// 2. totalDelivered30d = SUM(delivered) across 30 days
// 3. totalRTO30d = SUM(rto) across 30 days
// 4. deliveryRate30d = totalDelivered30d / (totalDelivered30d + totalRTO30d)

// For now (single-day audit):
const totalDecided  = sh.delivered + sh.rto;
const deliveryRate  = totalDecided > 0 ? sh.delivered / totalDecided : 0;
const rtoRate       = totalDecided > 0 ? sh.rto / totalDecided : 0;

const riskLevel =
  rtoRate < 0.15 ? { label: "Low Risk",    color: "green"  } :
  rtoRate < 0.30 ? { label: "Medium Risk", color: "yellow" } :
                   { label: "High Risk",   color: "red"    };
```

**Frontend keys:** `forecast.inTransit`, `forecast.deliveryRate`,
`forecast.expectedDelivered`, `forecast.expectedRevenue`, `forecast.riskLevel`

---

## 12. SECTION 7 — DASHBOARD GRAPHS <a name="section7"></a>

### Net Profit Chart (Daily — Last 30 Days)
- **Data:** One bar per day for the selected date range
- **Formula per day:** `netProfit = moneyKept` for that day's SUMMARY# record
- **Source:** DynamoDB SUMMARY# records (pre-computed)
- **Frontend key:** `chartData[]` with `{ date, netProfit }`
- **Color:** Green bar if `netProfit >= 0`, Red if negative

### Money Flow Chart
- **Static bars** showing revenue decomposition:
```
Revenue Earned → - COGS → - Ads Spend → - Shipping → - Expenses → = Money Kept
```
- **Source:** Current period summary values
- **Frontend:** `moneyFlowData[]` with `{ name, value, type: "positive"|"negative" }`

---

## 13. KNOWN BUGS FIXED <a name="bugs"></a>

### Bug 1 — Gross Sales Wrong (Tax-Inclusive Store)
**Symptom:** Gross Sales = ₹78,412 instead of ₹66,450.87
**Root Cause:** `subtotalPriceSet` on a tax-inclusive store **already includes tax**.
Using it directly double-counts tax.
**Fix:**
```javascript
// WRONG (old):
const gross = subtotal + discounts;

// CORRECT:
const gross = subtotal - tax;
// Verified: SUM(subtotal - tax) across all 46 orders = 66,450.87 ✅
```

### Bug 2 — financialStatus Field Error (GraphQL Crash)
**Symptom:** `Field 'financialStatus' doesn't exist on type 'Order'`
**Fix:** Field was renamed in newer API versions. Use `displayFulfillmentStatus` instead.

### Bug 3 — Returns = ₹0 (Wrong Refund Field)
**Symptom:** Returns always ₹0
**Root Cause:** `totalRefundedSet` on the order node is unreliable / always 0
**Fix:** Use `refunds[].refundLineItems[].subtotalSet` — the product-only refund amount

### Bug 4 — Returns Too High (Cancellation Refunds Counted as Returns)
**Symptom:** Returns = ₹13,044 when dashboard shows ₹846.61
**Root Cause:** Cancelled orders (cancelledAt set) have refunds on them — these are
**cancellation refunds, not customer returns**. Should NOT count as "Returns".
**Fix:**
```javascript
// Only count refunds on NON-cancelled orders
const refunded = isCancelled ? 0 : o.refunds.reduce(...)
```
**Remaining diff after fix:** Dashboard's ₹846.61 is booked by **refund date**, not order date.
Our non-cancelled refunds for orders placed today = refunds processed on future dates.
This is an accounting methodology difference — not a code bug. Accept it.

### Bug 5 — Revenue Earned = ₹0 (Cross-Reference Failure)
**Symptom:** Revenue Earned always 0 even when there are delivered orders
**Root Cause:** Matching by `order.shopifyOrderName` (#luxc3288) against
`shipment.order_id` (Shiprocket's internal numeric ID) — these never match.
**Fix:** Use `shipment.channel_order_id` which stores the Shopify order name.
**Verify in production:**
```javascript
console.log("SR channel_order_id sample:", srShipments[0]?.channel_order_id);
console.log("Shopify order name sample:", s.orders[0]?.shopifyOrderName);
```
If format differs (e.g. missing `#`), normalize both:
```javascript
const normalize = s => String(s).replace(/^#/, "").toLowerCase().trim();
if (normalize(channelOrderId) === normalize(order.shopifyOrderName)) { ... }
```

### Bug 6 — IST Filtering Was Wrong (Removed 26 Valid Orders)
**Symptom:** Only 20 orders counted instead of 46
**Root Cause:** Applied `toISTDate()` filter to exclude orders created after 18:30 UTC.
But the dashboard counts ALL 46 orders — including those placed between 18:30-24:00 UTC
(which are technically next IST day but the dashboard still attributes them to this day).
**Fix:** Remove IST filtering entirely. Trust Shopify's date filter which respects store timezone.
The 1-order edge case (tax/ship diff of ₹152/₹49) is a known dashboard quirk — not our bug.

### Bug 7 — Product Qty Counts All Orders (Should Be Delivered Only)
**Symptom:** Product delivered qty includes qty from non-delivered orders
**Root Cause:** `productMap` was built from all non-cancelled orders
**Fix:** Only accumulate product qty/revenue for orders confirmed delivered by Shiprocket

---

## 14. WHAT IS SKIPPED & WHY <a name="skipped"></a>

| Metric | Reason Skipped | How to Add Later |
|--------|----------------|-----------------|
| COGS | Shopify API does not return variant cost price. Needs separate inventory cost storage at sync time | Store `variant.inventoryItem.unitCost` during product sync |
| RTO Handling Fees | Stored in merchant's PROFILE# DynamoDB record | Read from `PROFILE#merchantId` record at calculation time |
| Fixed Business Expenses | Manually entered by merchant via frontend form | Read from `EXPENSE#merchantId#YYYY-MM` records |
| Delivery Rate (30-day) | Requires querying last 30 SUMMARY# records | Add DynamoDB query for last 30 days before forecast calc |
| Product Profit | Requires COGS (see above) | Auto-calculates once COGS is implemented |

---

## 15. PRODUCTION API RESPONSE SHAPE <a name="shape"></a>

This is exactly what the backend `/dashboard/summary` endpoint must return
to satisfy the current React frontend (Dashboard.jsx):

```json
{
  "summary": {
    "revenueGenerated": 82708,
    "revenueEarned": 45230,
    "cogs": 0,
    "moneyKept": 18540,
    "profitMargin": 41.0,

    "adsSpend": 12511.57,
    "roas": 6.61,
    "poas": 1.48,
    "poasDecision": "Ads are profitable. Monitor closely.",

    "totalOrders": 48,
    "deliveredOrders": 30,
    "rtoOrders": 28,
    "cancelledOrders": 0,
    "prepaidOrders": 5,
    "codOrders": 43,
    "aov": 1723.08,
    "profitPerOrder": 618.0,
    "shippingPerOrder": 258.63,

    "shippingSpend": 7758.97,
    "gatewayFees": 284.5,
    "rtoHandlingFees": 0,
    "rtoRevenueLost": 22400,
    "businessExpenses": 0
  },

  "forecast": {
    "inTransit": 0,
    "deliverySuccessRate": 51.72,
    "rtoRate": 48.28,
    "riskLevel": "High Risk",
    "riskColor": "red",
    "expectedDelivered": 0,
    "expectedRevenue": 0
  },

  "topProducts": [
    {
      "name": "G-SHOCK-2100-Black",
      "deliveredQty": 6,
      "revenue": 8994,
      "cogs": 0,
      "profit": 0
    }
  ],

  "chartData": [
    { "date": "2026-02-21", "netProfit": 18540 },
    { "date": "2026-02-22", "netProfit": 22100 }
  ]
}
```

---

## QUICK FORMULA REFERENCE CARD

```
Gross Sales       = SUM(subtotalPriceSet - totalTaxSet)           [all orders incl cancelled]
Revenue Generated = SUM(totalPriceSet - totalDiscountsSet)        [non-cancelled, non-test]
Revenue Earned    = SUM(totalPrice - discounts - refunds)         [SR-delivered orders only]
Returns           = SUM(refundLineItems[].subtotalSet)            [non-cancelled orders only]
Net Revenue       = totalPrice - discounts - refunds              [per order]

Shipping Spend    = SUM(forward freight) + SUM(return freight)    [from Shiprocket charges]
Gateway Fees      = SUM(prepaid delivered revenue) × 2.5%
RTO Revenue Lost  = SUM(netRevenue for RTO-confirmed orders)

Money Kept        = Revenue Earned - COGS - Ads - Shipping - Gateway - RTO Fees - Expenses
Profit Margin     = Money Kept / Revenue Earned × 100

ROAS              = Revenue Generated / Ads Spend
POAS              = Money Kept / Ads Spend

AOV               = Revenue Generated / Total Orders
Profit Per Order  = Money Kept / Delivered Orders
Shipping/Order    = Shipping Spend / Delivered Orders

Delivery Rate     = Delivered / (Delivered + RTO)                 [30-day rolling]
RTO Rate          = RTO / (Delivered + RTO) × 100                [30-day rolling]
Expected Delivered= In Transit × Delivery Rate
Expected Revenue  = Expected Delivered × AOV
```

---

## CURRENT STATUS SUMMARY

| Section | Status | Blocker |
|---------|--------|---------|
| Revenue Generated | ✅ Correct | — |
| Revenue Earned | ⚠️ Fix channel_order_id match | Verify `channel_order_id` format in SR response |
| COGS | ⛔ Not implemented | Needs variant cost storage |
| Money Kept | ⚠️ Partial | Missing COGS, RTO fees, expenses |
| Profit Margin | ⚠️ Partial | Depends on Money Kept |
| Ads Spend | ✅ Correct | — |
| ROAS | ✅ Correct | — |
| POAS | ⚠️ Partial | Depends on Money Kept |
| Total/Delivered/RTO Orders | ✅ Correct | — |
| Cancelled Orders | ✅ Correct | — |
| Prepaid Orders | ✅ Correct | Verify gateway names in live data |
| AOV | ✅ Correct | — |
| Profit Per Order | ⚠️ Partial | Depends on Money Kept |
| Shipping Per Order | ✅ Correct | — |
| Top Products (revenue/qty) | ⚠️ Fix delivered-only filter | Depends on cross-ref fix |
| Shipping Spend | ✅ Correct | — |
| Gateway Fees | ✅ Correct | — |
| RTO Revenue Lost | ⚠️ Fix cross-ref | Same as Revenue Earned fix |
| In Transit | ✅ Correct | — |
| Delivery/RTO Rate | ⚠️ Today only | Need 30-day SUMMARY# query |
| Expected Delivered/Revenue | ✅ Correct formula | — |
| Risk Level | ✅ Correct | — |
| Gross Sales (cross-check) | ✅ Correct | — |