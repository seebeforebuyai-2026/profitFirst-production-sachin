Hi This is my client project which is name as the profitfirst.
basically it is the very important project for me basically in this we are connect the merchant (Project users ) shopify , meta Ads Account , and shiproact as the shipping platform , 

my role is there is like this project is alredy devlop but i want to make it producttion ready clean code easy to modify and manintaence properly working proper database (most important), realy time monitoring system, properly working appliactionfor 10000+ merchants users need to  works perfect even handle the large data also if any merchent have the lot of data like 100000 orders per month still need to perly working with properly handle the rate limint for all the clients, ok perfectly a production ready project i want to make this, as possiable simple , easy to modefy the code simple code easy to undestant i am also a begneer devloper i want to make this easy but need to working perfectly for lar user and large data ok, 

we are using the currently  nodejs , react js , and amazon service for hosting and database ok. 

ProfitFirst – Simple Production Guide

Goal:
Make the project clean, scalable, production-ready for 10,000+ merchants using Node.js + React + AWS.

Platform integrations:
Shopify (orders & store data)
Meta Platforms Ads (marketing spend)
Shiprocket (shipping data)

Infrastructure:
Amazon Web Services
Amazon DynamoDB
Amazon SQS
Amazon S3
Amazon CloudWatch

1️⃣ System Architecture (Simple Rule)
Never process heavy tasks inside API.
Correct flow:
API
 ↓
SQS Queue
 ↓
Worker
 ↓
DynamoDB
API only sends jobs.
Workers process data in background.

2️⃣ Data Sync Strategy
Use two sync methods.
Webhooks (Real-time)
From Shopify events:
order created
order updated
refund created
product updated
Nightly Sync (Backup)
Run every 24 hours to fix missed data.
Use:
Amazon EventBridge

3️⃣ DynamoDB Table Design
Use Single Table Design.
Table:
ProfitFirst_Core
Keys:
PK = MERCHANT#ID
SK = ENTITY#ID
Examples:
MERCHANT#101  ORDER#55890
MERCHANT#101  PRODUCT#P1
MERCHANT#101  VARIANT#V1
MERCHANT#101  SHIPMENT#8899
MERCHANT#101  EXPENSE#2026-03
MERCHANT#101  SUMMARY#2026-03-05
MERCHANT#101  METADATA

4️⃣ Prevent Duplicate Orders
Use deterministic keys.
Example:
PK = MERCHANT#101
SK = ORDER#55890
If the same order syncs again → record updates.
No duplicates.
This is called Idempotency.

5️⃣ Store API Data Correctly
Use Hybrid Storage Strategy.
Store in DynamoDB:
important fields
product line items
analytics data
Store in S3:
full API JSON

Example:
rawDataS3Url
Reason:
DynamoDB item limit = 400 KB.

6️⃣ Background Workers

Workers process:
Shopify orders
Meta Ads data
Shiprocket shipments
Workers must handle:
pagination
retries
rate limits

7️⃣ API Rate Limit Handling
External APIs have limits.

Examples:
Shopify → request limits
Meta Ads → points system
Use rate limiter library:
Bottleneck
Retry strategy:
1s
2s
4s
8s
This is Exponential Backoff.

8️⃣ Queue Safety
Use Dead Letter Queue (DLQ).
If job fails multiple times:
move job → DLQ
This prevents data loss.

9️⃣ Dashboard Performance
Never calculate analytics from raw orders.
Example problem:
100k orders
dashboard query
Very slow.
Instead create Daily Summary records.
Example:
MERCHANT#101
SUMMARY#2026-03-05
revenueEarned
adsSpend
shippingSpend
cogs
profit

Dashboard reads one record only.
🔟 Important Metrics
Main metric:

Money Kept =
Revenue Earned
- COGS
- Ads Spend
- Shipping
- Business Expenses
- Gateway Fees
- RTO Fees
1️⃣1️⃣ Ads Performance Metrics

Ads Spend
From Meta Ads.
ROAS
ROAS = Revenue Generated / Ads Spend
POAS (better metric)
POAS = Money Kept / Ads Spend
POAS shows real profitability.
1️⃣2️⃣ Product Profitability

Calculate per product.

Product Revenue = price × quantity
Product COGS = cost × quantity
Product Profit = revenue − cogs

Use variant level COGS.

1️⃣3️⃣ Freeze COGS at Order Time

Product cost changes.

Solution:

Copy cost into order record.

Example:

cogsAtSale

This keeps historical profit accurate.

1️⃣4️⃣ Store Platform IDs

Always store original IDs.

Examples:

shopifyOrderId
shopifyCustomerId
shopifyProductId
shopifyVariantId

shiprocketShipmentId

metaCampaignId
metaAdsetId
metaAdId

Helps debugging.

1️⃣5️⃣ Order Timeline Fields

Store these:

orderCreatedAt
orderPaidAt
orderFulfilledAt
orderDeliveredAt
orderCancelledAt

This allows analytics like:
delivery time
processing time
fulfillment delay

1️⃣6️⃣ Business Expenses

Store manual costs:

agencyFees
staffSalary
officeRent
toolsCost
softwareSubscriptions
otherExpenses

Formula:

Business Expenses = SUM(all expenses)
1️⃣7️⃣ Monitoring

Send logs to:
Amazon CloudWatch
Track:
API errors
worker crashes
queue size
sync failures
Use structured logs.
Example:

merchantId
action
error
1️⃣8️⃣ Sync Metadata

Store integration status.

Example:

MERCHANT#101
INTEGRATION#SHOPIFY

Fields:

lastSyncTime
syncStatus
lastError
ordersSynced

Helps debugging merchant issues.

1️⃣9️⃣ Security

Never store secrets in code.

Use:

AWS Secrets Manager

Store:

SHOPIFY_TOKEN
META_ACCESS_TOKEN
SHIPROCKET_TOKEN
2️⃣0️⃣ Clean Backend Structure

Simple Node.js structure:

src/
routes
controllers
services
repositories
workers
utils
config

Flow:

Route
 → Controller
 → Service
 → Repository
 → Database
⭐ 5 Most Important Rules

If you remember only these, your system will scale.

1️⃣ Use SQS queue + workers
2️⃣ Use DynamoDB single table design
3️⃣ Use daily summary records
4️⃣ Store raw JSON in S3
5️⃣ Use webhooks + nightly sync

✅ If you follow these points, your project can handle:

10,000+ merchants
100,000+ orders per merchant
millions of records
real-time analytics
ProfitFirst – Production Architecture & System Design
1. Project Overview
ProfitFirst is a merchant analytics platform that connects with:
Shopify (orders and store data)
Meta Platforms Ads accounts
Shiprocket shipping platform
The system collects and processes merchant data to calculate metrics like profit, marketing performance, and order analytics.

Current Stack
Backend: Node.js
Frontend: React
Infrastructure: Amazon Web Services
Goal

Convert the existing project into a production-ready scalable system that can support:
10,000+ merchants
100,000+ orders and all the data per merchant per month
Large API integrations
Reliable background processing
Clean and maintainable code

2. High-Level Architecture
The system should follow an Event-Driven Architecture.
Instead of processing large tasks inside API requests, tasks are sent to a queue and processed in the background.
Architecture Components
API Server
Message Queue
Background Workers
Database
Monitoring System
Infrastructure
Queue: Amazon SQS
Database: Amazon DynamoDB
Scheduler: Amazon EventBridge
Logs: Amazon CloudWatch

3. Event-Driven Sync Architecture
Problem

A merchant might have 100,000+ orders.

If your API tries to fetch everything in one request:

Server timeout

API rate limit

Request failure

Solution

Use a Queue Based Processing System.

Workflow

1️⃣ Merchant clicks Sync

2️⃣ API sends a task to queue

{
  "merchantId": "123",
  "task": "fetch_orders",
  "page": 1
}

3️⃣ API immediately returns response

Sync started. Processing in background.

4️⃣ Worker processes task

Worker:

Calls Shopify API

Saves data to database

Sends next page task

4. Queue System

Use Amazon SQS as the message queue.

Why SQS

Fully managed

Auto scaling

No server maintenance

Reliable retry system

Queue Types

Main Queue

profitfirst-sync-queue

Dead Letter Queue (DLQ)

profitfirst-sync-dlq

If a job fails 3 times → move to DLQ.

5. Worker System

Workers process heavy tasks like:

Shopify orders

Meta ads data

Shiprocket shipping updates

Workers should run as separate Node.js processes.

Worker Responsibilities

Fetch API data

Handle pagination

Respect API rate limits

Save data

Schedule next task

6. Handling API Rate Limits

External APIs limit request speed.

Shopify Rate Limit

Uses Leaky Bucket Algorithm

Meta Ads Rate Limit

Uses Points-based limits

Solution

Use a rate limiter library.

Recommended:

Bottleneck (JavaScript library)

rate-limiter-flexible

Retry Strategy

Use Exponential Backoff

Example:

Retry 1 → wait 1 second
Retry 2 → wait 2 seconds
Retry 3 → wait 4 seconds
Retry 4 → wait 8 seconds
7. Sync Priority System

Use Priority Queues

High Priority

Real-time operations

New orders

Order updates

Low Priority

Large background syncs

Historical orders

Ads history

8. Database Architecture

Amazon DynamoDB

Best for:

High scale

Millions of records

Fast reads


9. DynamoDB Single Table Design

Table Name

ProfitFirst_Core
Partition Key (PK)
MERCHANT#<merchantId>

Example

MERCHANT#101
Sort Key (SK)

Used for different data types

Examples:

METADATA
ORDER#55890
AD#2391
Example Record
PK: MERCHANT#101
SK: ORDER#55890

data:
{
  total_price: 120,
  status: "shipped"
}
10. Preventing Duplicate Orders

Use Idempotent Writes.

Key Strategy
PK = MERCHANT#123
SK = ORDER#ShopifyOrderID

Example

SK = ORDER#55890

If the same order is inserted again:

DynamoDB will overwrite the same row.

No duplicates possible.

11. Watermark Sync Strategy

Use a Watermark Pattern to track progress.

Step 1 — Merchant Onboarding

When merchant connects store:

Calculate

StartDate = Today - 90 days

Add SQS job

{
  type: "HISTORICAL",
  merchantId: "M1",
  sinceDate: "2024-01-01"
}

Worker fetches 3 months of orders.

Step 2 — Save Sync Metadata

Store progress in database.

PK: MERCHANT#M1
SK: METADATA

lastSyncedOrderId: 55890
lastSyncedTimestamp: 2024-03-05
status: ACTIVE
Step 3 — Daily Incremental Sync

Use Amazon EventBridge.

Schedule job every 24 hours.

EventBridge → sends job to SQS.

{
  type: "DAILY",
  merchantId: "M1"
}

Worker fetches only new orders and new data.

Example API call:

orders?since_id=55890
12. Multi-Level Duplicate Protection
Check 1 — API Level

Use filters like:

since_id
updated_at
created_at_min
Check 2 — Logic Level

Compare timestamps.

if(api.updated_at > db.updated_at){
updateRecord()
}
Check 3 — Database Level

Primary key ensures uniqueness.

ORDER#ShopifyID
13. Data Aggregation (Materialized View Concept)

Never calculate large reports in real time.

Instead create summary tables.

Example table:

DailyMerchantSummary

Example record:

merchantId: 101
date: 2024-03-05
totalOrders: 245
totalRevenue: 12500
profit: 4500

Dashboard reads this single row instead of scanning millions.

14. Real-Time Monitoring

Monitoring tools are critical for production.

Logging

Use:

Winston
or

Pino

Send logs to:

Amazon CloudWatch

Example structured log:

logger.error({
merchantId: "123",
action: "meta_sync",
error: "Invalid Token"
})
15. Performance Monitoring

Use monitoring tools like:

New Relic

Datadog

These tools show:

slow database queries

API failures

CPU usage

memory issues

16. Health Monitoring

Create a health endpoint.

/health

Return status if systems are working.

Example:

{
status: "OK",
database: "connected",
queue: "connected"
}
17. Dead Letter Queue Monitoring

When jobs fail repeatedly:

SQS moves them to DLQ.

Example failure causes:

expired API token

network error

API outage

Set CloudWatch alert when DLQ receives messages.

18. Backend Structure

Why this works for a Beginner
Decoupling: By separating the API from the Worker, if your Shopify sync code has a bug and crashes, your website stays online. Only the background sync pauses.

Idempotency: By using ORDER#ID as the Sort Key, you don't have to worry about complex "if exists" logic. DynamoDB handles the "don't duplicate" rule for you.

Cost Efficiency: Using AWS SQS and DynamoDB means you only pay for what you use. If you have 0 merchants today, your cost is almost $0. If you have 10,000 tomorrow, it scales instantly.

The "Missing Link": The Folder Structure
To make this real, you need to organize your code so you don't get lost. Here is the Enterprise Folder Structure based on your document:

To move from "Plan" to "Code," I suggest we tackle these in order:

Step 1: The DynamoDB Schema. We should define exactly what the "Merchant Metadata" row looks like so we can track that 3-month window.

Step 2: The SQS Producer. A simple function in your API that "talks" to SQS.

Step 3: The Shopify Worker. The actual code that loops through the 100,000 orders using the since_id watermark.

19. Layered Code Architecture

Follow this pattern.

Routes

Handle HTTP requests.

POST /sync
Controllers

Validate input.

Services

Business logic.

Example:

calculateProfit()
syncOrders()
Repository / Models

Database queries.

20. Security Best Practices

Never hardcode secrets.

Use Environment Variables

Example

SHOPIFY_API_KEY
META_ACCESS_TOKEN
AWS_ACCESS_KEY

Store secrets in:

AWS Secrets Manager

21. Scalability Strategy

To scale to 10,000 merchants.

Add more:

workers

queue consumers

No code change required.

22. Production Readiness Checklist
Architecture

✔ Event-Driven Architecture
✔ Background Workers
✔ Queue Processing

API

✔ Rate Limit Handling
✔ Retry Logic
✔ Pagination

Database

✔ Partition Keys
✔ Unique Order IDs
✔ Summary Tables

Reliability

✔ Dead Letter Queue
✔ Structured Logs
✔ Monitoring Alerts

Performance

✔ Indexed queries
✔ No table scans
✔ Precomputed analytics

23. Why This Architecture is Production Ready
Scalable

Workers can scale horizontally.

Reliable

Queue retries failed jobs.

Fast

Merchant data isolated using partition keys.

Clean

Clear service-based architecture.

Safe

Duplicate protection and incremental sync.








business expence page:-
  
store the data in database 
agency fees 
other expence 
rto handlling fees 
payment gateway fees

staff fees 
offce rent 


Should You Store Full API JSON with Required Fields

Since you are using Amazon DynamoDB, the best production strategy is a hybrid approach.

Recommended Strategy (Best Practice)

Store both:

1️⃣ Normalized Important Fields (for queries & calculations)
2️⃣ Raw JSON response (for future use)

Example Order Record
PK: MERCHANT#101
SK: ORDER#55890

{
  merchantId: "101",
  orderId: "55890",
  orderTotal: 1200,
  currency: "INR",
  createdAt: "2026-03-05",
  updatedAt: "2026-03-05",
  customerId: "C123",
  products: [
    { productId: "P1", quantity: 2, price: 400 }
  ],

  rawData: { Shopify API JSON response }
}


 improved vertion is 
 PK: MERCHANT#101
SK: ORDER#55890

{
  entityType: "ORDER",
  source: "shopify",

  merchantId: "101",
  orderId: "55890",
  orderTotal: 1200,
  currency: "INR",

  orderStatus: "paid",
  fulfillmentStatus: "fulfilled",

  createdAt: "2026-03-05",
  updatedAt: "2026-03-05",

  products: [
    {
      productId: "P1",
      variantId: "V1",
      quantity: 2,
      price: 400
    }
  ],

  rawData: {...}
}

1. ACTUAL MONEY SECTION
Revenue Generated

Total revenue of all Shopify orders

Formula

Revenue Generated = SUM(Shopify order_total)

Source
→ Shopify

Revenue Earned

Revenue of only delivered orders

Formula

Revenue Earned = SUM(Delivered Orders Revenue)

Source
→ Shiprocket

Reason

Only delivered orders generate real revenue.

COGS (Cost of Goods Sold)

Product manufacturing cost.

COGS comes from user onboarding input.

Product table example

productId
productName
costPrice
varient base

Formula
COGS

Your formula is correct.

But calculate per line item.

COGS =
SUM(product_cost × delivered_quantity)

Important:

Use variant level COGS

variantId
productId
costPrice

Because variants can have different costs.



Money Kept (Net Profit)

This is the main metric of the dashboard.

Formula

Money Kept =
Revenue Earned
- Product COGS
- Ads Spend
- Shipping Spend
- Business Expenses
- Payment Gateway Fees
- RTO Handling Fees



Profit Margin

Formula

Profit Margin =
(Money Kept / Revenue Earned) × 100


2. ADS PERFORMANCE
Ads Spend

From Meta Platforms

Ads Spend = SUM(ad_spend)


ROAS (Return on Ad Spend)

Formula

ROAS = Revenue Generated / Ads Spend need to mach the ads manager try to fetch from the meta not calulate. 


POAS (Profit on Ad Spend)

Formula

POAS = Money Kept / Ads Spend

POAS is more accurate than ROAS.

POAS

Correct and very important.

POAS =
Money Kept / Ads Spend

Yes — POAS is better than ROAS for decision making.

Example:

ROAS = 3
POAS = 0.5

Meaning:

You earn revenue but profit is low.

So scaling ads may be risky.

decision:
 makeing like 
scale aggrsivly or not scale 

The POAS (Profit on Ad Spend) Trigger:

This is your "Killer Feature."

Low POAS (< 1.2): High Risk. The merchant is spending all their profit on ads.

High POAS (> 2.5): Scalable. Tell the merchant: "You are making 2.5x profit for every $1 spent. Spend more!"


3. ORDER ECONOMICS
Total Orders
Total Orders = Count(Shopify orders)

Source
→ Shopify

Delivered Orders
Delivered Orders = Count(status = delivered)

Source
→ Shiprocket

RTO Count
RTO Count = Count(status = RTO)
Cancelled Orders
Cancelled Orders = Count(status = cancel)


Gateway Fees =
Prepaid Revenue × gateway_percentage


Average Order Value (AOV)

Formula

AOV = Revenue Generated / Total Orders
Profit Per Order

Formula

Profit Per Order = Money Kept / Delivered Orders


Average Shipping Per Order

Formula

Average Shipping Cost = Shipping Spend / Delivered Orders

4. PRODUCT PROFITABILITY

Top 5 selling products.

Product Name

From Shopify

Delivered Quantity
Delivered Quantity = SUM(product_quantity where order delivered)
Product Revenue
Product Revenue = SUM(product_price × quantity)

Product COGS
Product COGS = product_cost × delivered_quantity
Product Profit
Product Profit = Product Revenue − Product COGS

5. COST LEAKAGE

Shows where money is leaking.

Shipping Spend

From Shiprocket

RTO Handling Fees

Formula

RTO Handling Cost =
RTO Count × RTO Handling Fee

(RTO fee stored in database)

Payment Gateway Fees

Formula

Gateway Fees =
Prepaid Revenue × gateway_percentage

Example

2.5%


Fixed Cost

Stored manually.

Examples

rent

staff

tools

subscriptions

RTO Revenue Lost

Formula

RTO Revenue Lost =
SUM(order_value where status = RTO)


6. PENDING OUTCOME / MONEY

Future revenue risk.

In Transit Orders
Count(status = in_transit)

Source
→ Shiprocket

Expected Delivered

Estimate

Expected Delivered =
InTransit × delivery_success_rate

Example

delivery_success_rate = 80% we have to calulate base on there last delevered orders 
"Expected Revenue" Logic: * Your formula: InTransit * Delivery_Success_Rate.

Pro Tip: Instead of a fixed 80%, calculate the Real Success Rate for that specific merchant over the last 30 days.



Expected Revenue
Expected Revenue =
Expected Delivered × AOV 

Risk Level

Logic example

High Risk → RTO rate > 30%

Medium Risk → RTO rate 15–30%

Low Risk → RTO rate < 15%

Logic: (Delivered Orders / (Delivered + RTO Orders)) * 100. This makes your "Risk Level" much more accurate for each individual user.


7. DASHBOARD GRAPHS
Net Profit Chart
Daily Net Profit
Last 30 days

Formula

Net Profit =
Revenue Earned
− COGS
− Ads Spend
− Shipping
− Expenses


Money Flow Chart

Breakdown chart.

Metrics

Revenue
Product Cost
Ads Spend
Shipping Fees
Business Expenses
Money Kept


8. BUSINESS EXPENSE PAGE

Stored in database.

Fields

agencyFees
otherExpenses
rtoHandlingFees
paymentGatewayFees

staffSalary
officeRent
toolsCost
softwareSubscriptions


Business Expenses

Stored in database.

Examples

agency fees

office rent

staff salary

tools/software

other expenses

Formula

Business Expenses = SUM(all manual expenses)


Ads Spend

Total marketing spend.

Source
→ Meta Platforms Ads

Formula

Ads Spend = SUM(meta_ads_spend) 

Shipping Spend

Shipping charges paid.

Source
→ Shiprocket

Formula

Shipping Spend = SUM(shipping_fee)


Final Recommendation for Your System

Store these core datasets:

Data	Source
Orders	Shopify
Shipping	Shiprocket
Ads	Meta Platforms
Products	Merchant input
Expenses	Merchant input

All data stored in Amazon DynamoDB with:

PK = MERCHANT#ID
SK = DATA_TYPE#ID


Final Important Advice

For analytics systems like ProfitFirst:

Never calculate metrics directly from millions of orders every time.

Instead create Daily Summary records

Example

MERCHANT#101
SUMMARY#2026-03-05

This makes the dashboard instant even with huge data.


How to handle "Product COGS" (The Beginner's Trap)
Since you are using DynamoDB, here is how you should handle the COGS input properly:

The Problem: Prices change. If a product cost $10 in January but $12 in March, your "Money Kept" will be wrong if you only store one price.

The Solution:

Create a PRODUCT#<SKU> record.

Store a history array or a current_cogs field.

When an order is synced: Copy the current COGS into the Order record itself. This "freezes" the cost at the time of the sale so your historical profit stays accurate forever.


1️⃣ Storing API Data (Your Hybrid Approach)

✅ Your decision is correct.

Best practice in analytics systems is:

Store 3 things

1️⃣ Normalized Fields → for calculations
2️⃣ Line Items / Important Objects → for product analytics
3️⃣ Raw API JSON → for future features

Example DynamoDB Record:

PK: MERCHANT#101
SK: ORDER#55890
{
  entityType: "ORDER",
  source: "shopify",

  merchantId: "101",
  orderId: "55890",

  orderTotal: 1200,
  currency: "INR",

  paymentType: "prepaid",
  orderStatus: "paid",
  fulfillmentStatus: "fulfilled",

  createdAt: "2026-03-05",
  updatedAt: "2026-03-05",

  products: [
    {
      productId: "P1",
      variantId: "V1",
      quantity: 2,
      price: 400,
      cogsAtSale: 220
    }
  ],

  rawData: {...}
}
Important Improvement

Add this field:

cogsAtSale

Why?

COGS changes over time.

Example

Jan cost = 200
Mar cost = 250

If you calculate later using current cost → old profit becomes wrong.

So when order is created:

copy current product cost into order

This freezes historical profit.


9️⃣ Final DynamoDB Structure (Recommended)

Single Table Design

PK = MERCHANT#ID
SK = ENTITY#ID

Examples

MERCHANT#101  ORDER#55890
MERCHANT#101  PRODUCT#P1
MERCHANT#101  VARIANT#V1
MERCHANT#101  SHIPMENT#8899
MERCHANT#101  ADS#2026-03-05
MERCHANT#101  EXPENSE#2026-03
MERCHANT#101  SUMMARY#2026-03-05


Store Platform IDs (Very Important)

Always store original platform IDs from every platform.

Example fields:

shopifyOrderId
shopifyCustomerId
shopifyProductId
shopifyVariantId
shiprocketShipmentId
metaAdAccountId
metaCampaignId
metaAdsetId
metaAdId

Why?

Later you will need:

Ad attribution

Order reconciliation

Debugging mismatched data

Never rely only on your internal IDs.


Store Order Timeline

Very important for analytics.

Example:

orderCreatedAt
orderPaidAt
orderFulfilledAt
orderDeliveredAt
orderCancelledAt

Why this matters:

Later you can calculate:

Delivery Time
Fulfillment Delay
Order Processing Time

Merchants love these insights.


Data Sync Status (Critical for SaaS)

Store sync health.

Example record:

PK: MERCHANT#101
SK: INTEGRATION#SHOPIFY

Fields:

lastSyncTime
syncStatus
lastError
ordersSynced
productsSynced

This helps when merchants say:

"My dashboard data is wrong."

You can debug easily.

Data Retention Strategy

Raw JSON can become huge.

Example:

1 merchant
10k orders
5MB json each

Solution:

Store:

important fields → DynamoDB
raw JSON → S3

And keep reference:

rawDataS3Url

Much cheaper.

DynamoDB Item Size Limit (Very Important)

Amazon DynamoDB has a hard limit:

Maximum item size = 400 KB

That means one record cannot exceed 400 KB.

Example problem:

Shopify Order JSON = 120 KB
Shiprocket Shipment JSON = 90 KB
Extra fields + arrays = 50 KB

Total = 260 KB (still safe)

But sometimes Shopify orders include:

many line items

discounts

metafields

shipping lines

tax lines

notes

Then JSON can become 300–700 KB.

If that happens → DynamoDB will reject the write.

Error example:

Item size has exceeded the maximum allowed size

So storing large raw JSON directly in DynamoDB is risky.

DynamoDB (Fast analytics)

Store only important fields used in queries/calculations.

Example:

PK: MERCHANT#101
SK: ORDER#55890
{
 orderId
 orderTotal
 currency
 paymentType
 createdAt
 products[]
 shippingFee
 status
 rawDataS3Url
}
S3 (Cheap raw storage)

Amazon S3 is perfect for large JSON.

Example path:

s3://merchant-data/shopify/101/orders/55890.json

Then DynamoDB record stores:

rawDataS3Url:
"s3://merchant-data/shopify/101/orders/55890.json"


Idempotency (Most Important for Sync Systems)

When syncing data from APIs like Shopify, Meta Platforms, and Shiprocket, the same job may run multiple times.

Reasons:

network error

worker crash

retry from queue

API timeout

If you don't handle this → duplicate data will appear.

Correct Strategy

Use deterministic keys.

Example:

PK: MERCHANT#101
SK: ORDER#55890

If worker runs 10 times, DynamoDB will just update same record.

No duplicates.


API Retry System (429 / 500 Errors)

All APIs fail sometimes.

Example errors:

429 Too Many Requests
500 Internal Server Error
503 Service Unavailable

Your worker must retry.

Best strategy:

Exponential Backoff

Example:

Retry 1 → wait 1s
Retry 2 → wait 2s
Retry 3 → wait 4s
Retry 4 → wait 8s

Libraries you can use:

Bottleneck

Axios Retry
Webhooks > Polling (Huge Performance Gain)

Instead of constantly asking Shopify:

Give me new orders
Give me new orders
Give me new orders

Use webhooks.

Example:

Shopify sends event when:

order created

order updated

refund created

product updated

This means:

Real-time sync
Less API calls
Less rate limit risk

This is how production systems work.


4️⃣ Dead Letter Queue (Production Safety)

If a job fails many times, you must move it to a Dead Letter Queue (DLQ).

Use:

Amazon SQS


Flow:

Worker tries job
Retry 3 times
Still failing
→ move to DLQ

Then you can inspect errors.

Without this → silent failures happen.


Use Daily Summary Table (Huge Performance Boost)

Never calculate dashboard from raw orders every time.

Example problem:

100 merchants
100k orders each
= 10 million orders

If dashboard query scans all orders → very slow.

Correct approach:

Create Daily Summary records.

Example:

PK: MERCHANT#101
SK: SUMMARY#2026-03-05
{
 revenueEarned: 50000,
 adsSpend: 20000,
 shippingSpend: 5000,
 cogs: 12000,
 profit: 13000
}

Dashboard loads instantly.

6️⃣ Data Versioning (Future Proof)

Sometimes APIs change.

Example:

Shopify changes field names.

Solution:

Add version field.

dataVersion: "v1"
source: "shopify"

This helps during migrations.


Rate Limit Control (Very Important)

APIs have limits.

Example Shopify:

2 requests per second

Meta Ads:

points based system

Use rate limiter.

Example library:

bottleneck

This protects your system.

8️⃣ Merchant Isolation (Security)

Never allow merchants to access other merchant data.

Use merchant key everywhere.

Example:

PK: MERCHANT#101

Every query must include merchantId.

This prevents data leaks.


Data Backups

Even with Amazon DynamoDB, always enable backups.

Enable:

Point in Time Recovery (PITR)

Then you can restore database from last 35 days.

Very important.


Structured Logging

Never log like this:

console.log("error")

Instead log structured data.

Example:

logger.error({
 merchantId: "101",
 action: "shopify_sync",
 orderId: "55890",
 error: "Invalid token"
})

Send logs to:

Amazon CloudWatch

Then you can search logs easily.


1️⃣3️⃣ Pagination Handling

APIs return paginated data.

Example Shopify:

250 orders per request

Worker must loop pages.

Example:

page 1
page 2
page 3

Until finished.

1️⃣4️⃣ Data Validation

Never trust external APIs.

Validate fields.

Example:

order_total must be number
created_at must be date

Use libraries like:

zod
joi
1️⃣5️⃣ Monitoring Alerts

If sync stops working, you must know immediately.

Use:

Amazon CloudWatch alerts.

Example alerts:

Error rate > 5%
Queue backlog > 1000 jobs
Worker stopped

Then send:

Email

Slack

SMS

⭐ The 5 MOST IMPORTANT Things For Your Project

If you remember only 5 things, remember these:

1️⃣ Queue based architecture (SQS workers)
2️⃣ Daily summary tables (fast dashboard)
3️⃣ Idempotent database keys (no duplicates)
4️⃣ Store raw JSON in S3 not DynamoDB
5️⃣ Use webhooks instead of polling


Key Findings from Project.md:
DynamoDB Single Table Design:

Table: ProfitFirst_Core
PK = MERCHANT#ID
SK = ENTITY#ID
Examples: ORDER#55890, PRODUCT#P1, SHIPMENT#8899, SUMMARY#2026-03-05
Data Handling:

Store normalized fields in DynamoDB
Store raw JSON in S3 (for large data)
Use deterministic keys to prevent duplicates
Create daily summary records for fast dashboard
Current Implementation:

Users table with userId as primary key
Separate Onboarding table
Onboarding stores credentials and step data
Next Steps (Step by Step):
Step 1: Create New DynamoDB Schema

Define all entity types (USER, ORDER, PRODUCT, SHIPMENT, ADS, EXPENSE, SUMMARY)
Define PK/SK patterns
Create GSI for email lookup
Create GSI for sync status
Step 2: Update Onboarding Flow

Remove data fetching from onboarding
Only save credentials during onboarding
Mark onboarding as complete after Step 5
Step 3: Create Background Sync Service

Single background sync after onboarding
Fetches Shopify, Meta, Shiprocket data
Stores in new DynamoDB schema
Step 4: Add Sync Status

Show sync progress to user
"Syncing..." status during data collection
"Sync Complete" when done
Ready to proceed with Step 1: Create New DynamoDB Schema?


Project Goal

The goal at this stage is not to rebuild the entire system.
We only want to complete the initial foundation of the application in a simple, clean, and production-ready way.

Current focus areas:

Landing Page

Authentication

Merchant Onboarding

Everything else (data processing, sync scheduler, dashboards, analytics, etc.) will be implemented later after this phase is stable.

Important Rules for This Phase
1. Do NOT Use Old Database Code

The previous project contains old database logic and connection management.

We must not reuse anything related to the old database.

This includes removing or ignoring code related to:

Old database connections

Sync scheduler

Old data processing logic

Old connection management system

All new development must use a fresh database setup.

2. New Database Setup

We will use a new database only.

Database service:

Amazon DynamoDB

Region:

Singapore region

All application data must be stored only in this new DynamoDB database.

The old database must not be used for any purpose.

3. Remove Unused Code

Since the previous project contains many unused files and systems, we need to clean the codebase first.

Tasks:

Remove unused backend services

Remove old database logic

Remove sync scheduler logic

Remove old connection management code

Remove any unused files or folders

The goal is to make the project clean and easy to understand.



Phase 1 — Authentication

Authentication is already implemented in the project.

Current task:

Keep the authentication system the same

Only change the database connection

Authentication must now store and read data from:

Amazon DynamoDB (Singapore region)

We should not use any old database logic.

The authentication system should remain:

Simple

Secure

Production ready

Phase 2 — Merchant Onboarding

After authentication, we implement onboarding.

Purpose of onboarding:

Allow merchants to connect their platforms.

Platforms to connect:

Shopify

Meta Ads

Shiprocket

During onboarding:

Merchant enters connection details

The connection information is saved in the new database

Data must be stored only in DynamoDB

Example stored data:

merchantId

shopifyStore

shopifyAccessToken

metaAdAccountId

metaAccessToken

shiprocketEmail

shiprocketToken

Important:

At this stage we are only saving connection data, not processing it.

Things We Are NOT Doing Now

The following systems will not be implemented in this phase:

No Data Processing

We will not build:

order syncing

ads syncing

shipping data syncing

No Sync Scheduler

The system previously had a sync scheduler that runs daily and fetches connections from the old database.

This system must not be implemented now.

It will be built later.

No Dashboard

We will not build:

analytics dashboard

profit calculations

metrics

reports

Those features will come after onboarding is complete and tested.

Current Development Goal

For now the application should support only:

Landing Page

Authentication

Merchant Onboarding

Storing connection data in DynamoDB

Once these are fully working and tested, we will move to the next phase.

Next Phase (Future Work)

After this phase is stable, we will start working on:

Data syncing

Queue system

Worker architecture

API integrations

Data processing

Dashboard and analytics

But these features are not part of the current task.

Summary

Current focus:

Clean the project

Remove old database code

Use new DynamoDB database (Singapore region)

Keep authentication working

Implement onboarding

Store merchant connection data

Do not implement any sync systems or data processing yet.

1️⃣ User Record Structure (Mostly Correct)

Current:

PK: MERCHANT#<userId>
SK: USER#<userId>

Data:

entityType: "USER"
merchantId
userId
email
firstName
lastName
authProvider
isVerified
onboardingCompleted
onboardingStep

✅ This is good and production safe.

But I recommend one small improvement.

Change SK

Instead of:

SK: USER#<userId>

Use:

SK: PROFILE

Final structure:

PK: MERCHANT#123
SK: PROFILE

Why?

Because each merchant normally has one profile.

Cleaner and easier queries later.

Example:

PK: MERCHANT#123
SK: PROFILE
{
 entityType: "PROFILE",
 merchantId: "123",
 email,
 firstName,
 lastName,
 onboardingCompleted,
 onboardingStep
}
2️⃣ Onboarding Data Structure (Needs Change)

Right now onboarding data is stored like:

step1
step2
step3
step4
step5

inside the USER record.

Example:

step2: {
 shopifyStore
 shopifyAccessToken
}

⚠️ This is not good for production.

Because:

USER record becomes large

credentials mixed with profile

harder to manage integrations later

Correct Approach (Production Ready)

Store platform connections as separate records.

Example:

PK: MERCHANT#123
SK: INTEGRATION#SHOPIFY
{
 entityType: "INTEGRATION",
 platform: "shopify",
 shopifyStore: "store.myshopify.com",
 accessToken: "xxx",
 connectedAt: "date",
 status: "active"
}
Meta Ads
PK: MERCHANT#123
SK: INTEGRATION#META
{
 entityType: "INTEGRATION",
 platform: "meta",
 adAccountId,
 accessToken,
 connectedAt
}
Shiprocket
PK: MERCHANT#123
SK: INTEGRATION#SHIPROCKET
{
 entityType: "INTEGRATION",
 platform: "shiprocket",
 email,
 token,
 connectedAt
}
3️⃣ Shipping Credentials (Must Fix)

You already identified the problem correctly.

Current:

shipping_connections table
old database

❌ This must be completely removed.

Your plan already says:

Do not use old database

So change this.

Instead store in same table.

Example:

PK: MERCHANT#123
SK: INTEGRATION#SHIPROCKET
4️⃣ Product COGS Storage (Needs Improvement)

Currently step4 stores:

products: [
 { productId, costPrice }
]

⚠️ This is not scalable.

Better approach:

Each product should be separate record.

Example:

PK: MERCHANT#123
SK: PRODUCT#P1
{
 entityType: "PRODUCT",
 productId: "P1",
 costPrice: 100
}

Later when syncing orders you can use it easily.

5️⃣ Onboarding Progress (Keep This)

This is good.

onboardingCompleted
onboardingStep

Example:

PK: MERCHANT#123
SK: PROFILE
onboardingStep: 3
onboardingCompleted: false

Keep this exactly as is.

6️⃣ Database Region (Correct)

You said:

Singapore region only.

That is good.

Use:

ap-southeast-1

Everything must go there.

No old database calls.

7️⃣ Final Table Structure (Correct Production Design)

Single table:

ProfitFirst_Core

Examples:

MERCHANT#123   PROFILE
MERCHANT#123   INTEGRATION#SHOPIFY
MERCHANT#123   INTEGRATION#META
MERCHANT#123   INTEGRATION#SHIPROCKET
MERCHANT#123   PRODUCT#P1
MERCHANT#123   PRODUCT#P2

Later when syncing data you will add:

MERCHANT#123   ORDER#55890
MERCHANT#123   SHIPMENT#8899
MERCHANT#123   ADS#2026-03-11
MERCHANT#123   SUMMARY#2026-03-11

This matches our full architecture plan.

8️⃣ Security Improvement (Very Important)

Do NOT store tokens in plain text.

Encrypt them.

Example:

encryptedAccessToken

Use:

AWS KMS encryption.

From Amazon Web Services.

9️⃣ Onboarding API Flow (Recommended)

Better onboarding logic:

Step1

Create profile.

Step2

Create:

INTEGRATION#SHOPIFY

Step3

Create:

INTEGRATION#META

Step4

Create:

PRODUCT# records

Step5

Create:

INTEGRATION#SHIPROCKET

Finally:

onboardingCompleted = true
🔟 Final Result (Clean Architecture)

You will have:

Single table in
Amazon DynamoDB

Records like:

MERCHANT#101 PROFILE
MERCHANT#101 INTEGRATION#SHOPIFY
MERCHANT#101 INTEGRATION#META
MERCHANT#101 INTEGRATION#SHIPROCKET
MERCHANT#101 PRODUCT#P1
MERCHANT#101 PRODUCT#P2

Later:

MERCHANT#101 ORDER#55890
MERCHANT#101 SHIPMENT#8899
MERCHANT#101 SUMMARY#2026-03-05

Perfect for production scale.

🚨 Critical Production Issues Found:
1. Current Problems:
Mixed Database Usage: User data → Singapore ✅, Shipping → Old DB ❌
Non-Scalable Structure: Storing all onboarding data in USER record
No Queue System: Processing heavy tasks in API requests
No Rate Limiting: External API calls without proper limits
No Daily Summaries: Will be slow with millions of records
Plain Text Tokens: Security risk for production
2. Production Requirements from Project.md:
🏗️ Architecture (Must Have):
✅ Event-Driven Architecture (SQS + Workers)
✅ Background Processing (Never in API)
✅ Queue System (Amazon SQS + DLQ)
✅ Rate Limiting (Bottleneck library)
✅ Daily Summary Tables (Fast dashboard)
✅ Idempotent Keys (No duplicates)
✅ S3 Storage (Raw JSON)
✅ Monitoring (CloudWatch)
🗄️ Database Structure (Production Ready):
// Current (Wrong):
PK: MERCHANT#123, SK: USER#123
{
  step1: {...}, step2: {...}, step3: {...} // ❌ Not scalable
}

// Production (Correct):
PK: MERCHANT#123, SK: PROFILE
PK: MERCHANT#123, SK: INTEGRATION#SHOPIFY  
PK: MERCHANT#123, SK: INTEGRATION#META
PK: MERCHANT#123, SK: INTEGRATION#SHIPROCKET
PK: MERCHANT#123, SK: PRODUCT#P1
PK: MERCHANT#123, SK: SUMMARY#2026-03-11  // ⭐ Critical for performance
⚡ Performance Requirements:
10,000+ merchants
100,000+ orders per merchant
Real-time dashboard (using daily summaries)
API rate limiting (2 req/sec for Shopify)
Exponential backoff retry strategy
Dead Letter Queue for failed jobs
🔒 Security Requirements:
Encrypt tokens (AWS KMS)
Merchant isolation (PK = MERCHANT#ID)
Structured logging (CloudWatch)
No secrets in code (AWS Secrets Manager)
🎯 What We Need to Fix Right Now:
Phase 1: Fix Current Storage Issues
Update shipping.controller.js → Use new DynamoDB (Singapore)
Create INTEGRATION records → Separate platform connections
Fix onboarding service → Store proper structure
Encrypt sensitive tokens → Use AWS KMS
Phase 2: Add Production Architecture
Add SQS queues → Background processing
Add rate limiting → Bottleneck library
Add daily summaries → Fast dashboard queries
Add monitoring → CloudWatch alerts


this is final recods model 
// User Profile
PK: MERCHANT#123, SK: PROFILE
{
  entityType: "PROFILE",
  merchantId: "123",
  email: "user@example.com",
  firstName: "John",
  lastName: "Doe",
  onboardingStep: 6,
  onboardingCompleted: true
}

// Shopify Integration (Step 2)
PK: MERCHANT#123, SK: INTEGRATION#SHOPIFY
{
  entityType: "INTEGRATION",
  platform: "shopify",
  shopifyStore: "mystore.myshopify.com",
  accessToken: "encrypted_token",
  connectedAt: "2026-03-11T...",
  status: "active"
}

// Product COGS (Step 3) - Enhanced with variants and sale price
PK: MERCHANT#123, SK: PRODUCT#P1
{
  entityType: "PRODUCT",
  productId: "P1", 
  variantId: "V1",
  productName: "T-Shirt",
  salePrice: 400,
  costPrice: 100,
  createdAt: "2026-03-11T..."
}

// Meta Integration (Step 4)  
PK: MERCHANT#123, SK: INTEGRATION#META
{
  entityType: "INTEGRATION", 
  platform: "meta",
  adAccountId: "act_123456",
  accessToken: "encrypted_token",
  connectedAt: "2026-03-11T...",
  status: "active"
}

// Shiprocket Integration (Step 5)
PK: MERCHANT#123, SK: INTEGRATION#SHIPROCKET
{
  entityType: "INTEGRATION",
  platform: "shiprocket", 
  email: "user@example.com",
  token: "encrypted_token",
  connectedAt: "2026-03-11T...",
  status: "active"
}


1️⃣ Idea: Pre-Calculate Daily Metrics

Instead of calculating dashboard data every time from orders, you store daily summaries.

Example record in Amazon DynamoDB table ProfitFirst_Core:

PK: MERCHANT#101
SK: SUMMARY#2026-03-11
{
 "entityType": "SUMMARY",
 "date": "2026-03-11",
 "revenue": 45000,
 "orders": 120,
 "deliveredOrders": 95,
 "adsSpend": 15000,
 "cogs": 20000,
 "shippingCost": 5000,
 "profit": 5000
}

This is 1 record per day per merchant.

2️⃣ When To Calculate This

Run a daily job (cron) every night.

Example:

00:30 AM

Steps:

Fetch merchant integrations

Get new orders from Shopify

Get delivery data from Shiprocket

Get ad spend from Meta

Calculate metrics

Save summary record

3️⃣ Simple Calculation Logic

Example:

Revenue = sum(shopify order totals)

Orders = count(shopify orders)

Delivered Orders = shiprocket delivered

Ads Spend = meta ads spend

COGS = sum(variant cost × quantity)

Profit =
Revenue
- Ads Spend
- COGS
- Shipping
- Business Expenses

Then save result as SUMMARY record.

4️⃣ Dashboard Query (Very Fast)

If user opens dashboard last 30 days:

Query DynamoDB:

PK: MERCHANT#101
SK begins_with SUMMARY#

Return only:

SUMMARY#2026-03-11
SUMMARY#2026-03-10
SUMMARY#2026-03-09
...

Only 30 records.

⚡ Super fast.

5️⃣ Money Flow Graph

Graph uses same data.

Example:

Revenue
COGS
Ads Spend
Profit

From daily summary records.

6️⃣ Why This Is Powerful

Without summary:

30 days
500 orders per day
= 15,000 order records

Dashboard must scan all.

❌ slow
❌ expensive

With summary:

30 records

⚡ instant dashboard.

7️⃣ Final Structure in Table

Your table ProfitFirst_Core will contain:

MERCHANT#101 PROFILE
MERCHANT#101 INTEGRATION#SHOPIFY
MERCHANT#101 INTEGRATION#META
MERCHANT#101 INTEGRATION#SHIPROCKET

MERCHANT#101 PRODUCT#P1
MERCHANT#101 VARIANT#V1

MERCHANT#101 ORDER#1001
MERCHANT#101 ORDER#1002

MERCHANT#101 SUMMARY#2026-03-11
MERCHANT#101 SUMMARY#2026-03-10
MERCHANT#101 SUMMARY#2026-03-09

✅ Simple rule

Orders → raw data
SUMMARY → dashboard data