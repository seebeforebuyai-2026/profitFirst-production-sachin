const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const { PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  sqsClient,
  summaryQueueUrl,
  newDynamoDB,
  newTableName,
} = require("../config/aws.config");
const { formatInTimeZone } = require("date-fns-tz");
const dynamodbService = require("../services/dynamodb.service");
const syncService = require("../services/sync.service");

let isShuttingDown = false;
const normalize = (name) =>
  name ? name.toString().replace(/^#/, "").trim().toLowerCase() : "";

const pollQueue = async () => {
  console.log("🚀 Summary Worker: Accounting Engine Started...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: summaryQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        }),
      );
      if (!Messages || Messages.length === 0) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      if (body.type === "SUMMARY_CALC") {
        await calculateProfitSummaries(body.merchantId);
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: summaryQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }
    } catch (err) {
      console.error("❌ Summary Worker Error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

const calculateProfitSummaries = async (merchantId) => {
  try {
    // 1. Settings & Overhead
    const profileRes = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
      }),
    );
    const profile = profileRes?.Item || {};
    const pgFeePercent =
      profile.paymentGatewayFeePercent !== undefined
        ? Number(profile.paymentGatewayFeePercent)
        : 2.5;

    const gatewayRate = pgFeePercent / 100;
    const rtoFee = Number(profile.rtoHandlingFee || 60);
    console.log(
      `ℹ️ Using Fees for ${merchantId}: PG=${pgFeePercent}%, RTO=₹${rtoFeePerOrder}`,
    );

    const dailyOverhead =
      ((Number(profile.agencyFees) || 0) +
        (Number(profile.staffSalary) || 0) +
        (Number(profile.officeRent) || 0) +
        (Number(profile.otherExpenses) || 0)) /
      30;

    // 2. Fetch All Truths
    const [orders, ads, shipments] = await Promise.all([
      dynamodbService.queryAll(merchantId, "ORDER#"),
      dynamodbService.queryAll(merchantId, "ADS#"),
      dynamodbService.queryAll(merchantId, "SHIPMENT#"),
    ]);

    const dailyStats = {};
    const orderMap = new Map();
    orders.forEach((o) => orderMap.set(normalize(o.orderName), o));

    // 3. ACTIVITY A: SHOPIFY SALES (Created IST Date)
    orders.forEach((o) => {
      const dateIST = formatInTimeZone(
        new Date(o.orderCreatedAt),
        "Asia/Kolkata",
        "yyyy-MM-dd",
      );
      if (!dailyStats[dateIST]) dailyStats[dateIST] = initDay();

      if (!o.isTest) {
        // Revenue Generated = Sum of all orders placed today
        dailyStats[dateIST].revenueGenerated +=
          o.totalPrice - (o.discounts || 0);
        dailyStats[dateIST].totalOrders += 1;

        if (o.isCancelled) dailyStats[dateIST].cancelledOrders += 1;
        if (o.paymentType === "prepaid") dailyStats[dateIST].prepaidOrders += 1;
        else dailyStats[dateIST].codOrders += 1;
      }
    });

    // 4. ACTIVITY B: SHIPROCKET & FINANCIAL REALIZATION
    // Yahan hum delivery aur costs dono handle karenge bina double-counting ke
    shipments.forEach((s) => {
      // Activity Date: Delivery date (for Delivered) or Update date (for RTO/Shipping cost)
      const activityDate =
        s.deliveredAtIST ||
        formatInTimeZone(new Date(s.updatedAt), "Asia/Kolkata", "yyyy-MM-dd");
      if (!activityDate) return;
      if (!dailyStats[activityDate]) dailyStats[activityDate] = initDay();

      // Shipping Spend hamesha count hoga chahe order match ho ya na ho (Loss Truth)
      dailyStats[activityDate].shippingSpend += s.totalShippingPaid || 0;

      const matchingOrder = orderMap.get(s.normalizedOrderName);
      if (matchingOrder) {
        if (s.deliveryStatus === "delivered") {
          dailyStats[activityDate].deliveredOrders += 1;
          dailyStats[activityDate].revenueEarned += matchingOrder.netRevenue;
          dailyStats[activityDate].cogs += matchingOrder.totalCogs;

          if (matchingOrder.paymentType === "prepaid") {
            dailyStats[activityDate].gatewayFees +=
              matchingOrder.netRevenue * gatewayRate;
          }
        } else if (s.deliveryStatus === "rto") {
          dailyStats[activityDate].rtoOrders += 1;
          dailyStats[activityDate].rtoHandlingFees += rtoFee;
          dailyStats[activityDate].rtoRevenueLost +=
            matchingOrder.netRevenue || 0;
        } else if (s.deliveryStatus === "in_transit") {
          dailyStats[activityDate].inTransitOrders += 1;
        }
      }
    });

    // 5. ACTIVITY C: MARKETING SPEND
    ads.forEach((a) => {
      const dateKey = a.date || a.SK.split("#")[1];
      if (!dailyStats[dateKey]) dailyStats[dateKey] = initDay();
      dailyStats[dateKey].adsSpend += Number(a.spend || 0);
    });

    // 6. FINAL MATH & SAVE
    for (const [date, data] of Object.entries(dailyStats)) {
      // Net Profit = Money Realized - (Product Cost + Ad Cost + Shipping Cost + Fees + Overheads)
      const moneyKept =
        data.revenueEarned -
        (data.cogs +
          data.adsSpend +
          data.shippingSpend +
          data.gatewayFees +
          data.rtoHandlingFees +
          dailyOverhead);

      const aov =
        data.totalOrders > 0 ? data.revenueGenerated / data.totalOrders : 0;
      const roas =
        data.adsSpend > 0 ? data.revenueGenerated / data.adsSpend : 0;
      const poas = data.adsSpend > 0 ? moneyKept / data.adsSpend : 0;

      await newDynamoDB.send(
        new PutCommand({
          TableName: newTableName,
          Item: {
            PK: `MERCHANT#${merchantId}`,
            SK: `SUMMARY#${date}`,
            entityType: "SUMMARY",
            date,
            ...data,
            aov: Number(aov.toFixed(2)),
            roas: Number(roas.toFixed(2)),
            poas: Number(poas.toFixed(2)),
            businessExpenses: Number(dailyOverhead.toFixed(2)),
            moneyKept: Number(moneyKept.toFixed(2)),
            profitMargin:
              data.revenueEarned > 0
                ? Number(((moneyKept / data.revenueEarned) * 100).toFixed(2))
                : 0,
            updatedAt: new Date().toISOString(),
          },
        }),
      );
    }

    await syncService.checkAndUnlockDashboard(merchantId);
    console.log(
      `🏁 Mission Accomplished for ${merchantId}. Dashboard is now bank-level accurate.`,
    );
  } catch (err) {
    console.error("❌ Logic Error:", err.message);
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
    rtoRevenueLost: 0,
    totalOrders: 0,
    deliveredOrders: 0,
    rtoOrders: 0,
    cancelledOrders: 0,
    inTransitOrders: 0,
    prepaidOrders: 0,
    codOrders: 0,
  };
}

pollQueue();
