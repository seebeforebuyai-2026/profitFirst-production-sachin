hat is 100% DONE:
Data Extraction: Workers for Shopify, Meta, and Shiprocket are finished.
Financial Brain: The Summary Calculator is perfectly accurate.
Setup UI: The "Products" page and COGS setup are complete.
❌ What is MISSING (The Final 3 Steps):
1. The Dashboard Aggregation API (Immediate Next Step)
The Problem: You have 365 individual SUMMARY# records in the database. But the dashboard needs to show the "Last 7 Days" or "Last 30 Days" total.
The Task: Create an API that queries a date range, sums up the numbers, calculates the Weighted Ratios (POAS/ROAS), and sends one single JSON object to the React charts.
2. The Dashboard UI Connection
The Problem: Your main dashboard charts are currently using "static" or "old" data.
The Task: Connect your MainDashboard.jsx and Analytics.jsx to the new Aggregation API so the charts reflect the real profit your workers calculated.
3. The Automation (EventBridge Cron)
The Problem: Right now, you have to run the workers manually in your terminal.
The Task: Set up AWS EventBridge (or a simple internal cron) to wake up the workers every hour (for new orders) and every night at 2:00 AM IST (for a full summary refresh).
🚀 THE NEXT ACTION: Step 1 (The Dashboard API)
We need to build the API that React will call to get the final numbers. We will use the Weighted Aggregation Rule from your spec (never average percentages).
🛠️ Part A: Update sync.service.js
Add a method to query and sum up daily records.
Add this to Profitfirst/Auth-service/services/sync.service.js:
code
JavaScript
async getDashboardSummary(merchantId, startDate, endDate) {
    try {
      const params = {
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': `MERCHANT#${merchantId}`,
          ':start': `SUMMARY#${startDate}`,
          ':end': `SUMMARY#${endDate}`
        }
      };

      const result = await newDynamoDB.send(new QueryCommand(params));
      const summaries = result.Items || [];

      // 1. Initialize Totals
      const totals = {
        revenueGenerated: 0, revenueEarned: 0, netRevenue: 0,
        cogs: 0, adsSpend: 0, shippingSpend: 0, gatewayFees: 0,
        businessExpenses: 0, totalOrders: 0, deliveredOrders: 0,
        rtoOrders: 0, moneyKept: 0
      };

      // 2. Sum the raw data
      summaries.forEach(day => {
        Object.keys(totals).forEach(key => {
          totals[key] += (day[key] || 0);
        });
      });

      // 3. 🟢 Calculate Weighted Ratios (The Senior Rule)
      const profitMargin = totals.netRevenue > 0 ? (totals.moneyKept / totals.netRevenue) * 100 : 0;
      const roas = totals.adsSpend > 0 ? (totals.revenueGenerated / totals.adsSpend) : 0;
      const poas = totals.adsSpend > 0 ? (totals.moneyKept / totals.adsSpend) : 0;
      const aov = totals.totalOrders > 0 ? (totals.revenueGenerated / totals.totalOrders) : 0;

      return {
        success: true,
        summary: {
          ...totals,
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(2))
        },
        chartData: summaries // Send raw days for the line charts
      };
    } catch (error) {
      console.error('Dashboard API Error:', error);
      throw error;
    }
  }
🛠️ Part B: Create the Route
File: Profitfirst/Auth-service/routes/dashboard.routes.js
code
JavaScript
const express = require('express');
const router = express.Router();
const syncService = require('../services/sync.service');
const { authenticateToken } = require('../middleware/auth.middleware');

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.query; // Expects YYYY-MM-DD
    const result = await syncService.getDashboardSummary(req.user.userId, from, to);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

================================================================

WHAT we will do LATER (During Background Sync Phase)
When we finish Onboarding and move to the background sync architecture, we will write a Nightly Cron Job (using AWS EventBridge).
Every night at 2:00 AM, the worker will do this simple check:
Look at all INTEGRATION records.
"Are there any tokens expiring in the next 3 days?"
If yes -> Run the refresh API call -> Update DynamoDB with the new token and new expiresAt date.
This way, the merchant never has to log in again. It happens invisibly in the background.

Meta Integration (Expires in 60 days)
When connecting Meta, their API gives you an expires_in value (usually 60 days).
Action NOW: We calculate the exact expiration date and save it.
DynamoDB Record:
PK: MERCHANT#COGNITO_ID
SK: INTEGRATION#META
accessToken: [Encrypted]
issuedAt: The date you got the token.
expiresAt: 2026-05-16T... (Current date + 59 days)

Shiprocket Integration (Expires in 10 days)
Shiprocket requires an email and password to generate a new token.
Action NOW: We must encrypt and store the Shiprocket password alongside the token, and set the 10-day expiration date.
DynamoDB Record:
PK: MERCHANT#COGNITO_ID
SK: INTEGRATION#SHIPROCKET
shiprocketEmail: merchant@email.com
shiprocketPassword: [Encrypted] (Crucial for generating new tokens later)
accessToken: [Encrypted]
issuedAt: The date you got the token.
expiresAt: 2026-03-26T... (Current date + 9 days)


ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456


================================================================

CODE CLEANUP - FILES TO DELETE / REVIEW
(Do this after COGS page is complete)

✅ COMPLETED
- auth.controller.js - Fixed (no DynamoDB on signup/OTP)
- onboarding.service.js - Fixed (Cognito sub as merchantId, upsert integrations)
- dynamodb.service.js - Fixed (createUserProfile requires userId)
- Shiprocket flow - Fixed (auto-generate token from email+password)
- Meta flow - Fixed (60-day expiry, upsert logic)

❌ SAFE TO DELETE (Old/Unused Files)
- config/onboarding-table-schema.js     → Old separate Onboarding table, replaced by single table
- controllers/dashboard.controller.js   → Uses old dynamoDB + redis.config, not in Server.js
- controllers/orderconformationdata.js  → Uses old ap-south-1 DynamoDB, not in Server.js
- routes/dashboard.routes.js            → Not registered in Server.js
- routes/prediction.routes.js           → Not registered in Server.js
- scripts/check-shiprocket-connection.js → Debug script only
- scripts/check-shiprocket-fields.js    → Debug script only
- scripts/get-shopify-token.js          → Debug script only

⚠️ NEEDS REWRITE BEFORE USE
- controllers/shopify.controller.js     → Uses old dynamoDB from aws.config, needs new DB
- controllers/prediction.controller.js  → Uses old ap-south-1 DynamoDB directly
- services/prediction.service.js        → Uses old DynamoDB client

⚠️ KEEP BUT REVIEW LATER (Only needed if AI features are active)
- config/ai.config.js
- config/bedrock.config.js
- config/groq.config.js

================================================================

NEXT UP - COGS PAGE (Product Manufacturing Details)
- User enters product cost price (COGS) per variant
- Save each product as its own row: PK: MERCHANT#<id>, SK: PRODUCT#<productId>
- Save each variant as its own row: PK: MERCHANT#<id>, SK: VARIANT#<variantId>
- Fields to store: productName, variantName, costPrice, salePrice
- This is Step 5 of onboarding





SQS_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/243547230894/profitfirst-sync-queue-sachin
S3_BUCKET_NAME=profitfirst-raw-data-sachin
