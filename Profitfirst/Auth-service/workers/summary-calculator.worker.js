const { ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { sqsClient, summaryQueueUrl, newDynamoDB, newTableName } = require("../config/aws.config");
const { formatInTimeZone } = require("date-fns-tz");
const dynamodbService = require("../services/dynamodb.service");
const syncService = require("../services/sync.service");

let isShuttingDown = false;
const normalize = (name) => name ? name.toString().replace(/^#/, "").trim().toLowerCase() : "";

const pollQueue = async () => {
  console.log("🚀 [SummaryWorker] Accounting Engine Active...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: summaryQueueUrl, WaitTimeSeconds: 20, MaxNumberOfMessages: 1
      }));

      if (!Messages || Messages.length === 0) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);

      if (body.type === "SUMMARY_CALC") {
        console.log(`📊 Processing Summary Job for Merchant: ${body.merchantId}`);
        await calculateProfitSummaries(body); 
        
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: summaryQueueUrl, ReceiptHandle: message.ReceiptHandle
        }));
      }
    } catch (err) {
      if (!isShuttingDown) console.error("❌ Summary Worker Error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

const calculateProfitSummaries = async (job) => {
 const { merchantId, affectedDates = [] } = job;
  
  try {
    const profileRes = await newDynamoDB.send(new GetCommand({
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" }
    }));
    const profile = profileRes?.Item || {};
    const gatewayRate = (profile.paymentGatewayFeePercent || 2.5) / 100;
    const rtoFee = Number(profile.rtoHandlingFee || 60);
    const dailyOverhead = ((Number(profile.agencyFees) || 0) + (Number(profile.staffSalary) || 0) + (Number(profile.officeRent) || 0) + (Number(profile.otherExpenses) || 0)) / 30;

    let datesToCalculate = [];
    if (affectedDates.length > 0) {
        datesToCalculate = [...new Set(affectedDates)];
    } else {
        for (let i = 0; i < 90; i++) {
            const d = new Date(); d.setDate(d.getDate() - i);
            datesToCalculate.push(formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd"));
        }
    }

    const [orders, ads, shipments] = await Promise.all([
      dynamodbService.queryAll(merchantId, "ORDER#"),
      dynamodbService.queryAll(merchantId, "ADS#"),
      dynamodbService.queryAll(merchantId, "SHIPMENT#"),
    ]);

    const orderMap = new Map(orders.map(o => [normalize(o.orderName), o]));
    
    for (const targetDate of datesToCalculate) {
      const stats = initDay();
      let hasActivity = false;

      // --- Shopify Orders ---
      orders.forEach(o => {
        const orderIST = formatInTimeZone(new Date(o.orderCreatedAt), "Asia/Kolkata", "yyyy-MM-dd");
        if (orderIST === targetDate && !o.isTest) {
            stats.revenueGenerated += (Number(o.totalPrice) - Number(o.discounts || 0));
            stats.totalOrders += 1;
            if (o.isCancelled) stats.cancelledOrders += 1;
            if (o.paymentType === "prepaid") stats.prepaidOrders += 1;
            else stats.codOrders += 1;
            hasActivity = true;
        }
      });

      // --- Ads Spend (Safer Filter Logic) ---
      const adsForDay = ads.filter(a => (a.date || a.SK.split('#')[1]) === targetDate);
      if (adsForDay.length > 0) {
          stats.adsSpend = adsForDay.reduce((sum, a) => sum + Number(a.spend || 0), 0);
          hasActivity = true;
      }

      // --- Shiprocket Logistics ---
      shipments.forEach(s => {
        const shipActivityDate = s.deliveredAtIST || formatInTimeZone(new Date(s.updatedAt), "Asia/Kolkata", "yyyy-MM-dd");
        
        if (shipActivityDate === targetDate) {
            stats.shippingSpend += Number(s.totalShippingPaid || 0);
            hasActivity = true;
        }

        if (s.deliveredAtIST === targetDate && s.deliveryStatus === "delivered") {
            const matchingOrder = orderMap.get(s.normalizedOrderName);
            if (matchingOrder) {
                stats.deliveredOrders += 1;
                stats.revenueEarned += Number(matchingOrder.netRevenue || 0);
                stats.cogs += Number(matchingOrder.totalCogs || 0);
                if (matchingOrder.paymentType === "prepaid") {
                    stats.gatewayFees += (Number(matchingOrder.netRevenue) * gatewayRate);
                }
                hasActivity = true;
            }
        } 
        else if (shipActivityDate === targetDate && s.deliveryStatus === "rto") {
            const matchingOrder = orderMap.get(s.normalizedOrderName);
            stats.rtoOrders += 1;
            stats.rtoHandlingFees += rtoFee;
            if (matchingOrder) stats.rtoRevenueLost += Number(matchingOrder.netRevenue || 0);
            hasActivity = true;
        }
      });

      if (hasActivity) {
          // 🟢 ROUNDING EVERYTHING TO 2 DECIMAL PLACES
          const moneyKept = Number((stats.revenueEarned - (stats.cogs + stats.adsSpend + stats.shippingSpend + stats.gatewayFees + stats.rtoHandlingFees + dailyOverhead)).toFixed(2));

          await newDynamoDB.send(new PutCommand({
            TableName: newTableName,
            Item: {
              PK: `MERCHANT#${merchantId}`,
              SK: `SUMMARY#${targetDate}`,
              entityType: "SUMMARY",
              date: targetDate,
              ...stats,
              revenueGenerated: Number(stats.revenueGenerated.toFixed(2)),
              revenueEarned: Number(stats.revenueEarned.toFixed(2)),
              shippingSpend: Number(stats.shippingSpend.toFixed(2)),
              gatewayFees: Number(stats.gatewayFees.toFixed(2)),
              moneyKept: moneyKept,
              aov: stats.totalOrders > 0 ? Number((stats.revenueGenerated / stats.totalOrders).toFixed(2)) : 0,
              profitMargin: stats.revenueEarned > 0 ? Number(((moneyKept / stats.revenueEarned) * 100).toFixed(2)) : 0,
              businessExpenses: Number(dailyOverhead.toFixed(2)),
              updatedAt: new Date().toISOString()
            }
          })); 
      }
    }

    await syncService.checkAndUnlockDashboard(merchantId);
    console.log(`✅ [Summary] Recalculation Done for ${merchantId}`);
  } catch (e) { 
      console.error("❌ Summary Error:", e.message); 
  }
}

function initDay() {
  return { 
    revenueGenerated: 0, revenueEarned: 0, cogs: 0, adsSpend: 0, shippingSpend: 0, 
    gatewayFees: 0, rtoHandlingFees: 0, rtoRevenueLost: 0, totalOrders: 0, 
    deliveredOrders: 0, rtoOrders: 0, cancelledOrders: 0, inTransitOrders: 0, 
    prepaidOrders: 0, codOrders: 0 
  };
}

pollQueue();