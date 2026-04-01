const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { QueryCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { sqsClient, sqsQueueUrl, newDynamoDB, newTableName } = require('../config/aws.config');
const { formatInTimeZone } = require('date-fns-tz'); 
const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// 🟢 Automatically retry on network errors or 5xx/429 status codes
axiosRetry(axios, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response.status === 429;
  }
});
let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Summary Calculator started. Aggregating 1-Year Financial Data...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: sqsQueueUrl, 
        MaxNumberOfMessages: 1, 
        WaitTimeSeconds: 20
      }));

      if (!Messages) continue;

      const message = Messages[0];
      const body = JSON.parse(message.Body);

      if (body.type === 'SUMMARY_CALC') {
        console.log(`📊 Processing summary aggregation for merchant: ${body.merchantId}`);
        await calculateWholeYear(body.merchantId);
      }

      await sqsClient.send(new DeleteMessageCommand({ 
        QueueUrl: sqsQueueUrl, 
        ReceiptHandle: message.ReceiptHandle 
      }));

    } catch (e) { 
      if (!isShuttingDown) console.error("Worker Error:", e.message); 
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

const calculateWholeYear = async (merchantId) => {
  try {
    // 1. Get Merchant Settings (Fixed Costs + Gateway Fee + RTO Fee)
    const profileResult = await newDynamoDB.send(new GetCommand({
        TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: 'PROFILE' }
    }));
    const profile = profileResult.Item || {};
    
    const gatewayFeePercent = profile.paymentGatewayFeePercent || 2.5;
    const rtoHandlingFee = profile.rtoHandlingFees || 0; // 🟢 From new UI

    // 🟢 2. PRODUCTION LOGIC: Calculate Daily Overheads (Fixed Costs / 30)
    const monthlyFixed = (profile.agencyFees || 0) + (profile.staffFees || 0) + (profile.officeRent || 0) + (profile.otherExpenses || 0);
    const dailyOverhead = Number((monthlyFixed / 30).toFixed(2));

    // 3. Load all raw data into memory (using the paginated queryAll helper)
    const [orders, ads, shipments] = await Promise.all([
        queryAll(merchantId, 'ORDER#'),
        queryAll(merchantId, 'ADS#'),
        queryAll(merchantId, 'SHIPMENT#')
    ]);
    const orderMap = new Map(orders.map(o => [o.orderId, o]));

    const dailyStats = {};

    // 4. Process Orders (Revenue Generated)
    orders.forEach(order => {
      const istDate = formatInTimeZone(new Date(order.orderCreatedAt), 'Asia/Kolkata', 'yyyy-MM-dd');
      if (!dailyStats[istDate]) dailyStats[istDate] = initDay();
      
      dailyStats[istDate].revenueGenerated += (order.totalPrice || 0);
      dailyStats[istDate].totalOrders++;
    });

  ads.forEach(ad => {
      const date = ad.SK.replace('ADS#', ''); // Extract YYYY-MM-DD
      if (!dailyStats[date]) dailyStats[date] = initDay();
      dailyStats[date].adsSpend += (ad.spend || 0); // 🟢 Now ads are counted!
    });

    // 5. Process Shipments (Revenue Earned + Shipping + RTO)
    shipments.forEach(ship => {
      const istDate = formatInTimeZone(new Date(ship.updatedAt), 'Asia/Kolkata', 'yyyy-MM-dd');
      if (!dailyStats[istDate]) dailyStats[istDate] = initDay();

      const relatedOrder = orderMap.get(ship.orderId);
      const orderValue = relatedOrder ? relatedOrder.totalPrice : 0;
      const isPrepaid = relatedOrder?.paymentType === 'prepaid';

      let currentShipCost = (ship.shippingFee || 0);
      
      if (ship.deliveryStatus === 'delivered') {
        dailyStats[istDate].deliveredOrders++;
        dailyStats[istDate].revenueEarned += orderValue;
        dailyStats[istDate].cogs += (relatedOrder?.totalCogs || 0);
        
        // Gateway fees only on delivered prepaid
        if (isPrepaid) {
          dailyStats[istDate].gatewayFees += (orderValue * (gatewayFeePercent / 100));
        }
      } 
      else if (ship.deliveryStatus === 'rto') {
        dailyStats[istDate].rtoOrders++;
        dailyStats[istDate].rtoRevenueLost += orderValue;
        currentShipCost += (ship.returnShippingFee || 0);
        
        // 🟢 Add custom RTO fee from settings
        dailyStats[istDate].rtoHandlingFees += rtoHandlingFee;
      }
      
      dailyStats[istDate].shippingSpend += currentShipCost;
    });

    // 6. Final Save with dailyOverhead
    // 🟢 Step 6: Final Profit Math & Save for each day
    for (const [date, data] of Object.entries(dailyStats)) {
      
      // 🟢 ISSUE 2 FIX: Calculate Money Kept including Daily Overhead
      const netRevenue = data.revenueEarned - (data.refunds || 0);
      
      const moneyKept = netRevenue - (
        data.cogs + 
        data.adsSpend + 
        data.shippingSpend + 
        data.gatewayFees + 
        data.rtoHandlingFees + 
        dailyOverhead // This is the ₹1,000/day share of rent/salaries
      );
      
      // 🟢 ISSUE 3 FIX: Calculate missing order ratios
      const profitPerOrder = data.deliveredOrders > 0 ? (moneyKept / data.deliveredOrders) : 0;
      const shippingPerOrder = data.deliveredOrders > 0 ? (data.shippingSpend / data.deliveredOrders) : 0;
      const rtoRate = (data.deliveredOrders + data.rtoOrders) > 0 
                      ? (data.rtoOrders / (data.deliveredOrders + data.rtoOrders)) * 100 : 0;

      // 🟢 Calculate standard ratios
      const profitMargin = netRevenue > 0 ? (moneyKept / netRevenue) * 100 : 0;
      const roas = data.adsSpend > 0 ? (data.revenueGenerated / data.adsSpend) : 0;
      const poas = data.adsSpend > 0 ? (moneyKept / data.adsSpend) : 0;
      const aov = data.totalOrders > 0 ? (data.revenueGenerated / data.totalOrders) : 0;

      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: {
          PK: `MERCHANT#${merchantId}`,
          SK: `SUMMARY#${date}`,
          entityType: 'SUMMARY',
          date,
          ...data,
          // 🟢 ISSUE 2 FIX: Override the 0 from initDay with real overhead
          businessExpenses: dailyOverhead, 
          netRevenue,
          moneyKept: Number(moneyKept.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(2)),
          // 🟢 ISSUE 3 FIX: Adding new fields to DB
          profitPerOrder: Number(profitPerOrder.toFixed(2)),
          shippingPerOrder: Number(shippingPerOrder.toFixed(2)),
          rtoRate: Number(rtoRate.toFixed(2)),
          updatedAt: new Date().toISOString()
        }
      }));
    }
    console.log(`🏁 [SUMMARY] Complete. Daily overhead ₹${dailyOverhead} applied to ${merchantId}`);
    
    // 🟢 7. FINAL ACTION: Run the Unlocker Check
    const syncService = require('../services/sync.service');
    await syncService.checkAndUnlockDashboard(merchantId);

  } catch (error) {
    console.error(`❌ [SUMMARY] Error:`, error.message);
  }
};
// --- Helpers ---

function initDay() {
  return { 
    revenueGenerated: 0, revenueEarned: 0, refunds: 0, cogs: 0, 
    adsSpend: 0, shippingSpend: 0, gatewayFees: 0, rtoHandlingFees: 0,
    businessExpenses: 0, totalOrders: 0, deliveredOrders: 0, 
    rtoOrders: 0, cancelledOrders: 0, inTransitOrders: 0, rtoRevenueLost: 0,
    profitPerOrder: 0, shippingPerOrder: 0
  };
}

async function queryAll(merchantId, prefix) {
  let items = [];
  let lastKey = null;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `MERCHANT#${merchantId}`, ':sk': prefix },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
    if (isShuttingDown) break;
  } while (lastKey);
  return items;
}

const shutdown = () => { isShuttingDown = true; process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

pollQueue();