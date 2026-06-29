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

const PICKUP_PENDING_STATUSES = [
  "NEW",
  "READY_TO_SHIP",
  "PICKUP_SCHEDULED",
  "PICKUP_GENERATED",
  "PICKUP_QUEUED",
  "LABEL_GENERATED",
  "MANIFEST_GENERATED",
];

const NDR_PENDING_STATUSES = ["NDR_DELIVERED"];

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

   console.log("\n");
console.log("=======================================");
console.log("SHIPROCKET FORENSIC AUDIT");
console.log("=======================================");

console.log("Orders:", orders.length);
console.log("Shipments:", shipments.length);

const byDeliveryStatus = {};
const byRawStatus = {};
const byAwb = {};
const bySrOrder = {};

shipments.forEach((s) => {
  const ds = s.deliveryStatus || "NULL";
  const rs = s.rawStatus || "NULL";

  byDeliveryStatus[ds] = (byDeliveryStatus[ds] || 0) + 1;
  byRawStatus[rs] = (byRawStatus[rs] || 0) + 1;

  if (s.awb) {
    byAwb[s.awb] = (byAwb[s.awb] || 0) + 1;
  }

  if (s.srOrderId) {
    bySrOrder[s.srOrderId] =
      (bySrOrder[s.srOrderId] || 0) + 1;
  }
});

console.log("\n=== DELIVERY STATUS ===");
console.table(byDeliveryStatus);

console.log("\n=== RAW STATUS ===");
console.table(byRawStatus);

const uniqueAwbs = Object.keys(byAwb).length;
const uniqueSrOrders = Object.keys(bySrOrder).length;

console.log("\n=== UNIQUENESS ===");
console.log("Unique AWBs:", uniqueAwbs);
console.log("Unique SR Orders:", uniqueSrOrders);

console.log(
  "Duplicate AWBs:",
  Object.values(byAwb).filter(c => c > 1).length
);

console.log(
  "Duplicate SR Orders:",
  Object.values(bySrOrder).filter(c => c > 1).length
);

console.log("\n=== DUPLICATE AWBS SAMPLE ===");

console.table(
  Object.entries(byAwb)
    .filter(([_, count]) => count > 1)
    .slice(0, 30)
    .map(([awb, count]) => ({
      awb,
      count,
    }))
);

const forensic = {
  delivered: 0,
  rto: 0,
  inTransit: 0,
  cancelled: 0,
  pickupPending: 0,
  ndrDelivered: 0,
};

shipments.forEach((s) => {
  const raw = (s.rawStatus || "").toUpperCase();
  const ds = (s.deliveryStatus || "").toUpperCase();

  if (ds === "DELIVERED")
    forensic.delivered++;

  if (
    ds === "RTO" ||
    raw.includes("RTO")
  )
    forensic.rto++;

  if (
    ds === "IN_TRANSIT" &&
    !raw.includes("RTO")
  )
    forensic.inTransit++;

  if (
    ds === "CANCELLED" ||
    raw.includes("CANCEL")
  )
    forensic.cancelled++;

  if (
    raw === "NDR_DELIVERED"
  )
    forensic.ndrDelivered++;

  if (
    [
      "NEW",
      "READY_TO_SHIP",
      "PICKUP_SCHEDULED",
      "PICKUP_GENERATED",
      "PICKUP_QUEUED",
      "LABEL_GENERATED",
      "MANIFEST_GENERATED",
    ].includes(raw)
  ) {
    forensic.pickupPending++;
  }
});

console.log("\n=== FORENSIC COUNTS ===");
console.table(forensic);

const weirdRecords = shipments.filter(
  (s) =>
    s.deliveryStatus === "IN_TRANSIT" &&
    (
      (s.rawStatus || "").includes("RTO") ||
      (s.rawStatus || "").includes("BACK")
    )
);

console.log(
  "\n=== SUSPICIOUS IN_TRANSIT ===",
  weirdRecords.length
);

console.table(
  weirdRecords.slice(0, 50).map((s) => ({
    srOrderId: s.srOrderId,
    awb: s.awb,
    deliveryStatus: s.deliveryStatus,
    rawStatus: s.rawStatus,
    orderCreatedAtIST: s.orderCreatedAtIST,
    deliveredAtIST: s.deliveredAtIST,
    rtoAtIST: s.rtoAtIST,
    shipActivityDateIST: s.shipActivityDateIST,
  }))
);

console.log("=======================================");
console.log("END FORENSIC AUDIT");
console.log("=======================================");
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
        // Note: cancelledOrders is counted from SHIPMENT records (deliveryStatus === "CANCELLED")
        // to match Shiprocket's dashboard definition, not Shopify order cancellations.

        const pAmount = Number(o.prepaidAmount || 0);
        if (pAmount > 0) {
          stats.prepaidRevenue += pAmount;
          stats.revenueEarned += pAmount;
          stats.cogs +=
            (pAmount / (Number(o.netRevenue) || 1)) * Number(o.totalCogs || 0);
          stats.gatewayFees += pAmount * gatewayRate;
          stats.revenueFromCurrentOrders += pAmount;
          stats.currentOrdersCount += 1;
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

      // Reset unique sets for each date
      const deliveredUniqueOrders = new Set();
      const rtoUniqueOrders = new Set();

      // Shipping spend → shipActivityDateIST (financial event: when money was charged)
      // Status counts (inTransit, pickupPending, cancelled) → orderCreatedAtIST
      // This prevents double-counting when a shipment has activity across many days
      shipments.forEach((s) => {
        if (s.shipActivityDateIST === targetDate) {
          hasActivity = true;
          stats.shippingSpend += Number(s.totalShippingPaid || 0);
        }

        // Count each shipment's status once — on the date the order was created
        const shipCountDate = s.orderCreatedAtIST || s.shipActivityDateIST;
        if (shipCountDate === targetDate) {
          hasActivity = true;
          stats.totalShipments += 1;
          if (s.isOrphan) stats.orphanShipmentsCount += 1;
          if (PICKUP_PENDING_STATUSES.includes(s.rawStatus))
            stats.pickupPendingOrders += 1;
          if (NDR_PENDING_STATUSES.includes(s.rawStatus))
            stats.ndrPendingOrders += 1;
          if (s.deliveryStatus === "IN_TRANSIT") stats.inTransitOrders += 1;
          if (s.deliveryStatus === "CANCELLED") stats.cancelledOrders += 1;
        }

        // Delivered → deliveredAtIST
        if (
          s.deliveredAtIST === targetDate &&
          s.deliveryStatus === "DELIVERED"
        ) {
          const orderKey = normalize(s.shopifyOrderName);
          if (deliveredUniqueOrders.has(orderKey)) return;
          deliveredUniqueOrders.add(orderKey);

          hasActivity = true;
          const matchingOrder = orderMap.get(orderKey);
          stats.deliveredOrders += 1;

          const codAmount = matchingOrder
            ? Number(matchingOrder.codAmount || 0)
            : Number(s.codAmount || 0);

          if (!matchingOrder) {
            console.log(
              "ORDER MATCH FAILED",
              orderKey,
              s.shopifyOrderName,
              s.srOrderId,
            );
          }

          if (codAmount > 0) {
            stats.codRevenue += codAmount;
            stats.revenueEarned += codAmount;
            stats.gatewayFees += codAmount * gatewayRate;
            stats.cogs += matchingOrder
              ? Number(matchingOrder.totalCogs || 0)
              : Number(s.totalCogs || 0);

            const orderDate =
              s.orderCreatedAtIST || matchingOrder?.orderCreatedAtIST;
            if (orderDate?.substring(0, 7) < targetDate.substring(0, 7)) {
              stats.revenueFromPastOrders += codAmount;
              stats.pastOrdersCount += 1;
            } else {
              stats.revenueFromCurrentOrders += codAmount;
              if (matchingOrder?.paymentType !== "PARTIAL_COD") {
                stats.currentOrdersCount += 1;
              }
            }
          }
        }

        const srId = s.srOrderId;
        const rawStat = (s.rawStatus || "").toUpperCase().trim();
        const orderKey = normalize(s.shopifyOrderName);

        const isCurrentlyRTO =
          s.deliveryStatus === "RTO" ||
          rawStat.includes("RTO") ||
          rawStat.includes("RETURN_TO_SELLER");

        if (isCurrentlyRTO) {
          const rtoDateToMatch = s.rtoAtIST || s.updatedAtIST; // Prefer completion date, fallback to last update date (as per Shiprocket sample data)

          if (rtoDateToMatch === targetDate) {
            const uniqueRTOKey = `${srId}_${targetDate}`;

            if (!rtoUniqueOrders.has(uniqueRTOKey)) {
              // Use the Set declared outside the shipment loop but reset per targetDate iteration
              hasActivity = true;
              stats.rtoOrders += 1;
              stats.rtoHandlingFees += rtoFee;

              const matchingOrder = orderMap.get(orderKey);
              stats.rtoRevenueLost += matchingOrder
                ? Number(matchingOrder.netRevenue || 0)
                : Number(s.netRevenue || 0);
              rtoUniqueOrders.add(uniqueRTOKey);
            }
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
        const totalCost = [
          stats.cogs,
          stats.adsSpend,
          stats.shippingSpend,
          stats.gatewayFees,
          stats.rtoHandlingFees,
          dailyOverhead,
        ].reduce((sum, val) => sum + (Number(val) || 0), 0);
        const moneyKept = Number((stats.revenueEarned - totalCost).toFixed(2));
        stats.businessExpenses = Number(dailyOverhead.toFixed(2));

        const item = {
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
        };

        // NaN fields dhundo
        const nanFields = Object.entries(item).filter(
          ([k, v]) => typeof v === "number" && isNaN(v),
        );
        if (nanFields.length > 0) {
          console.error(
            "❌ NaN fields found:",
            nanFields.map(([k]) => k),
          );
        }

        await newDynamoDB.send(
          new PutCommand({ TableName: newTableName, Item: item }),
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
    pastOrdersCount: 0,
    currentOrdersCount: 0,
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
    totalShipments: 0,
    deliveredOrders: 0,
    rtoOrders: 0,
    cancelledOrders: 0,
    inTransitOrders: 0,
    pickupPendingOrders: 0,
    ndrPendingOrders: 0,
    orphanShipmentsCount: 0,
    prepaidOrders: 0,
    codOrders: 0,
    expectedDelivery: 0,
    expectedRevenue: 0,
    aov: 0,
    roas: 0,
  };
}

pollQueue();
