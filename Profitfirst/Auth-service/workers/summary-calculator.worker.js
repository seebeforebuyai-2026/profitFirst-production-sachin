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
  console.log("🚀 [SummaryWorker] Cash-Flow Accounting Engine Active...");
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
        await calculateProfitSummaries(body);
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: summaryQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }
    } catch (err) {
      if (!isShuttingDown)
        console.error("❌ Summary Worker Error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

const calculateProfitSummaries = async (job) => {
  const { merchantId, affectedDates = [] } = job;

  try {
    const profileRes = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
      }),
    );
    const profile = profileRes?.Item || {};
    const gatewayRate = (profile.paymentGatewayFeePercent || 2.5) / 100;
    const rtoFee = Number(profile.rtoHandlingFees || 60); // Plural Fixed
    const dailyOverhead =
      ((Number(profile.agencyFees) || 0) +
        (Number(profile.staffSalary) || 0) +
        (Number(profile.officeRent) || 0) +
        (Number(profile.otherExpenses) || 0)) /
      30;

    let datesToCalculate =
      affectedDates.length > 0 ? [...new Set(affectedDates)] : [];
    if (datesToCalculate.length === 0) {
      for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        datesToCalculate.push(
          formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd"),
        );
      }
    }

    const [orders, ads, shipments] = await Promise.all([
      dynamodbService.queryAll(merchantId, "ORDER#"),
      dynamodbService.queryAll(merchantId, "ADS#"),
      dynamodbService.queryAll(merchantId, "SHIPMENT#"),
    ]);

    const orderMap = new Map(orders.map((o) => [normalize(o.orderName), o]));

    for (const targetDate of datesToCalculate) {
      const stats = initDay();
      let hasActivity = false;

      // 1. Sales & Prepaid
      orders.forEach((o) => {
        if (o.orderCreatedAtIST !== targetDate || o.isTest) return;

        hasActivity = true;
        stats.totalOrders += 1;
        stats.revenueGenerated +=
          Number(o.totalPrice) - Number(o.discounts || 0);
        if (o.isCancelled) stats.cancelledOrders += 1;

        const pAmount = Number(o.prepaidAmount || 0);
        if (pAmount > 0) {
          stats.prepaidRevenue += pAmount;
          stats.revenueEarned += pAmount;
          stats.cogs +=
            (pAmount / (Number(o.netRevenue) || 1)) * Number(o.totalCogs || 0);
          stats.gatewayFees += pAmount * gatewayRate;
          stats.revenueFromCurrentOrders += pAmount;
        }

        // 🟢 NEW LOGIC: Separate counting
        if (o.paymentType === "PREPAID") {
          stats.prepaidOrders += 1;
        } else if (o.paymentType === "PARTIAL_COD") {
          stats.partialCodOrders += 1;
          stats.partialPrepaidAmount += Number(o.prepaidAmount || 0);
          stats.partialCodAmount += Number(o.codAmount || 0);
        } else if (o.paymentType === "COD") {
          stats.codOrders += 1;
        }
      });

      // 2. Shipment Updates (COD realized on delivery)
      shipments.forEach((s) => {
        if (s.shipActivityDateIST === targetDate) {
          hasActivity = true;
          stats.shippingSpend += Number(s.totalShippingPaid || 0);
          const matchingOrder = orderMap.get(normalize(s.shopifyOrderName));

          if (s.deliveryStatus === "DELIVERED") {
            stats.deliveredOrders += 1;
            const cAmount = Number(s.codAmount || 0);
            if (cAmount > 0) {
              stats.codRevenue += cAmount;
              stats.revenueEarned += cAmount;
              stats.cogs +=
                (cAmount /
                  (Number(matchingOrder?.netRevenue || s.netRevenue) || 1)) *
                Number(matchingOrder?.totalCogs || s.totalCogs || 0);

              // Month breakdown
              const orderDate =
                s.orderCreatedAtIST || matchingOrder?.orderCreatedAtIST;
              if (orderDate?.substring(0, 7) < targetDate.substring(0, 7))
                stats.revenueFromPastOrders += cAmount;
              else stats.revenueFromCurrentOrders += cAmount;
            }
          } else if (s.deliveryStatus === "RTO") {
            stats.rtoOrders += 1;
            stats.rtoHandlingFees += rtoFee;
            stats.rtoRevenueLost += Number(
              matchingOrder?.netRevenue || s.netRevenue || 0,
            );
          } else if (s.deliveryStatus === "IN_TRANSIT") {
            stats.inTransitOrders += 1;
            stats.expectedRevenue += Number(s.codAmount || 0);
          }
        }
      });

      // 3. Marketing & Aggregation
      const adsForDay = ads.filter((a) => a.date === targetDate);
      stats.adsSpend = adsForDay.reduce(
        (sum, a) => sum + Number(a.spend || 0),
        0,
      );
      if (stats.adsSpend > 0) hasActivity = true;

      if (hasActivity) {
        stats.aov =
          stats.totalOrders > 0
            ? Number((stats.revenueGenerated / stats.totalOrders).toFixed(2))
            : 0;
        const totalCost =
          stats.cogs +
          stats.adsSpend +
          stats.shippingSpend +
          stats.gatewayFees +
          stats.rtoHandlingFees +
          dailyOverhead;
        const moneyKept = Number((stats.revenueEarned - totalCost).toFixed(2));
        stats.businessExpenses = Number(dailyOverhead.toFixed(2));

        await newDynamoDB.send(
          new PutCommand({
            TableName: newTableName,
            Item: {
              PK: `MERCHANT#${merchantId}`,
              SK: `SUMMARY#${targetDate}`,
              ...stats,
              moneyKept,
              totalCost: Number(totalCost.toFixed(2)),
              profitMargin:
                stats.revenueEarned > 0
                  ? Number(((moneyKept / stats.revenueEarned) * 100).toFixed(2))
                  : 0,
              updatedAt: new Date().toISOString(),
            },
          }),
        );
      }
    }
    await syncService.checkAndUnlockDashboard(merchantId);

    console.log(`✅ [Summary] Cash-Flow Logic Fixed for ${merchantId}`);
  } catch (e) {
    console.error("❌ Summary Error:", e.message);
  }
};
function initDay() {
  return {
    revenueGenerated: 0,
    revenueEarned: 0,
    prepaidRevenue: 0,
    codRevenue: 0,
    revenueFromPastOrders: 0,
    revenueFromCurrentOrders: 0,
    cogs: 0,
    adsSpend: 0,
    shippingSpend: 0,
    gatewayFees: 0,
    rtoHandlingFees: 0,
    rtoRevenueLost: 0,
    businessExpenses: 0,
    partialCodOrders: 0,
    partialPrepaidAmount: 0,
    partialCodAmount: 0,
    totalOrders: 0,
    deliveredOrders: 0,
    rtoOrders: 0,
    cancelledOrders: 0,
    inTransitOrders: 0,
    prepaidOrders: 0,
    codOrders: 0,
    expectedDelivery: 0,
    expectedRevenue: 0,
    aov: 0,
    roas: 0,
  };
}

pollQueue();
