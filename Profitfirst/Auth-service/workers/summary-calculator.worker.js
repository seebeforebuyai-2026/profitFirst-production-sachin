const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { QueryCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { sqsClient, sqsQueueUrl, newDynamoDB, newTableName } = require('../config/aws.config');
const { formatInTimeZone } = require('date-fns-tz'); 

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
    // 1. Get Merchant Settings
    const profileResult = await newDynamoDB.send(new GetCommand({
        TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: 'PROFILE' }
    }));
    const profile = profileResult.Item || {};
    const gatewayFeePercent = profile.paymentGatewayFeePercent || 2.5;
    const rtoHandlingFee = profile.rtoHandlingFee || 0;

    // 2. Query ALL raw data (Memory Safe)
    const [orders, ads, shipments, expenses] = await Promise.all([
        queryAll(merchantId, 'ORDER#'),
        queryAll(merchantId, 'ADS#'),
        queryAll(merchantId, 'SHIPMENT#'),
        queryAll(merchantId, 'EXPENSE#')
    ]);

    const dailyStats = {};

    // 3. Process Orders (Revenue Generated & Count)
    orders.forEach(order => {
      const istDate = formatInTimeZone(new Date(order.orderCreatedAt), 'Asia/Kolkata', 'yyyy-MM-dd');
      if (!dailyStats[istDate]) dailyStats[istDate] = initDay();

      dailyStats[istDate].revenueGenerated += (order.totalPrice || 0);
      dailyStats[istDate].totalOrders++;
      
      if (order.status === 'cancelled') dailyStats[istDate].cancelledOrders++;
    });

    // 4. Process Shipments (Delivery Truth & Shipping Costs)
    shipments.forEach(ship => {
      const istDate = formatInTimeZone(new Date(ship.updatedAt), 'Asia/Kolkata', 'yyyy-MM-dd');
      if (!dailyStats[istDate]) dailyStats[istDate] = initDay();

      const relatedOrder = orders.find(o => o.orderId === ship.orderId);
      const orderValue = relatedOrder ? relatedOrder.totalPrice : 0;
      const isPrepaid = relatedOrder?.paymentType === 'prepaid';

      let currentShipCost = (ship.shippingFee || 0);
      
      if (ship.deliveryStatus === 'delivered') {
        dailyStats[istDate].deliveredOrders++;
        dailyStats[istDate].revenueEarned += orderValue;
        dailyStats[istDate].cogs += (relatedOrder?.totalCogs || 0);
        
        if (isPrepaid) {
          dailyStats[istDate].gatewayFees += (orderValue * (gatewayFeePercent / 100));
        }
      } 
      else if (ship.deliveryStatus === 'rto') {
        dailyStats[istDate].rtoOrders++;
        dailyStats[istDate].rtoRevenueLost += orderValue;
        currentShipCost += (ship.returnShippingFee || 0);
        dailyStats[istDate].rtoHandlingFees += rtoHandlingFee;
      }
      else if (ship.deliveryStatus === 'in_transit') {
        dailyStats[istDate].inTransitOrders++;
      }

      dailyStats[istDate].shippingSpend += currentShipCost;
    });

    // 5. Process Ads
    ads.forEach(ad => {
      const date = ad.SK.replace('ADS#', '');
      if (!dailyStats[date]) dailyStats[date] = initDay();
      dailyStats[date].adsSpend += (ad.spend || 0);
    });

    // 6. Process Expenses (🟢 BUG FIXED: Uses exp.date)
    expenses.forEach(exp => {
      if (!dailyStats[exp.date]) dailyStats[exp.date] = initDay();
      dailyStats[exp.date].businessExpenses += (exp.amount || 0);
    });

    // 7. Calculate Ratios and Save
    for (const [date, data] of Object.entries(dailyStats)) {
      
      // 🟢 Logic: Net Revenue = Earned - Refunds (Accuracy Fix)
      const netRevenue = data.revenueEarned - (data.refunds || 0);

      const moneyKept = netRevenue - (data.cogs + data.adsSpend + data.shippingSpend + data.gatewayFees + data.rtoHandlingFees + data.businessExpenses);
      
      // 🟢 Aggregation Math (Rule 8)
      const profitMargin = netRevenue > 0 ? (moneyKept / netRevenue) * 100 : 0;
      const roas = data.adsSpend > 0 ? (data.revenueGenerated / data.adsSpend) : 0;
      const poas = data.adsSpend > 0 ? (moneyKept / data.adsSpend) : 0;
      const aov = data.totalOrders > 0 ? (data.revenueGenerated / data.totalOrders) : 0;
      const profitPerOrder = data.deliveredOrders > 0 ? (moneyKept / data.deliveredOrders) : 0;
      const shippingPerOrder = data.deliveredOrders > 0 ? (data.shippingSpend / data.deliveredOrders) : 0;
      const rtoRate = (data.deliveredOrders + data.rtoOrders) > 0 
                      ? (data.rtoOrders / (data.deliveredOrders + data.rtoOrders)) * 100 : 0;

      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: {
          PK: `MERCHANT#${merchantId}`,
          SK: `SUMMARY#${date}`,
          entityType: 'SUMMARY',
          date,
          ...data,
          netRevenue,
          moneyKept,
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(2)),
          profitPerOrder: Number(profitPerOrder.toFixed(2)),
          shippingPerOrder: Number(shippingPerOrder.toFixed(2)),
          rtoRate: Number(rtoRate.toFixed(2)),
          updatedAt: new Date().toISOString()
        }
      }));
    }

    console.log(`✅ [AGGREGATION] Complete for ${merchantId}. Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    
  } catch (error) {
    console.error(`❌ [AGGREGATION] Error:`, error.message);
  }
};

// --- Helpers ---

function initDay() {
  return { 
    revenueGenerated: 0, revenueEarned: 0, netRevenue: 0, refunds: 0, cogs: 0, 
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