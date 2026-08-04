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
  name
    ? String(name)
        .replace(/^R_/i, "")       // strip return prefix  e.g. R_#4067-77946
        .replace(/^#/, "")          // strip leading #
        .replace(/-[A-Z]$/i, "")    // strip trailing single-letter suffix e.g. -C
        .replace(/-\d{5,}$/, "")    // strip trailing Shopify internal ID  e.g. -85624
        .trim()
        .toLowerCase()
    : "";

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
  "NEW", "READY_TO_SHIP", "PICKUP_SCHEDULED", "PICKUP_GENERATED", "PICKUP_QUEUED",
  "LABEL_GENERATED", "MANIFEST_GENERATED", "PICKUP RESCHEDULED", "PICKUP_RESCHEDULED",
  "AWB_ASSIGNED",  // AWB assigned but not yet picked up
];

// NDR = delivery attempted but failed. Only UNDELIVERED family per SR dashboard.
const NDR_PENDING_STATUSES = [
  "UNDELIVERED", "UNDELIVERED_1ST", "UNDELIVERED_2ND", "UNDELIVERED_3RD",
];

// REACHED BACK statuses = RTO per SR dashboard
const RETURNING_TO_SELLER_STATUSES = [
  "REACHED BACK AT THE SELLER CITY",
  "REACHED BACK AT SELLER CITY",
  "REACHED_BACK_AT_THE_SELLER_CITY",
];

const calculateProfitSummaries = async (job) => {
  const { merchantId, affectedDates = [] } = job;

  try {
    // ── GUARD: only run after Shiprocket sync is fully complete ──────
    // Prevents stale SQS messages from recalculating mid-sync.
    const syncRes = await newDynamoDB.send(new GetCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: "SYNC#SHIPROCKET" },
    }));
    const srStatus = syncRes?.Item?.status;
    if (srStatus === "in_progress") {
      console.warn(`⏳ [SummaryWorker] Shiprocket sync still in_progress for ${merchantId}. Skipping — will recalculate after sync finishes.`);
      return;
    }
    // ─────────────────────────────────────────────────────────────────
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

    // Compact data quality log — one line per merchant, non-blocking
    const hasSrCreated = shipments.filter(s => s.srCreatedAtIST && !s.isPhantom).length;
    const totalNonPhantom = shipments.filter(s => !s.isPhantom).length;
    console.log(`📊 [Summary] ${merchantId} | shipments: ${totalNonPhantom} (phantoms excluded: ${shipments.length - totalNonPhantom}) | srCreatedAtIST: ${hasSrCreated}/${totalNonPhantom}`);

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

      // ─────────────────────────────────────────────────────────────────────
      // SHIPMENT METRICS — two separate concerns:
      //
      // 1. STATUS COUNTS (totalShipments, delivered, RTO, inTransit, NDR,
      //    pickupPending, cancelled) → anchored to srCreatedAtIST.
      //    Logic: "of all shipments Shiprocket created on this date, what is
      //    their CURRENT status?" — same as Shiprocket dashboard date filter.
      //
      // 2. FINANCIAL EVENTS (shippingSpend, codRevenue, rtoHandlingFees)
      //    → anchored to the event date (deliveredAtIST, rtoAtIST,
      //    shipActivityDateIST) because money moves on those dates.
      // ─────────────────────────────────────────────────────────────────────
      shipments.forEach((s) => {

        if (s.isPhantom) return;  // phantom records excluded from all counts

        const rawUp = (s.rawStatus || "").toUpperCase().trim();
        const dsUp  = (s.deliveryStatus || "").toUpperCase().trim();

        // ── FINANCIAL: Shipping spend → when money was charged ──────────
        if (s.shipActivityDateIST === targetDate) {
          hasActivity = true;
          stats.shippingSpend += Number(s.totalShippingPaid || 0);
        }

        // ── STATUS COUNTS: anchored to srCreatedAtIST (Shiprocket cohort) ─
        // Falls back to orderCreatedAtIST for records without srCreatedAtIST yet.
        const shipCountDate = s.srCreatedAtIST || s.orderCreatedAtIST || s.shipActivityDateIST;
        if (shipCountDate === targetDate && !s.isPhantom) {
          hasActivity = true;
          stats.totalShipments += 1;
          if (s.isOrphan) stats.orphanShipmentsCount += 1;

          if (PICKUP_PENDING_STATUSES.includes(rawUp)) {
            stats.pickupPendingOrders += 1;

          } else if (NDR_PENDING_STATUSES.includes(rawUp)) {
            stats.ndrPendingOrders += 1;

          } else if (dsUp === "CANCELLED") {
            stats.cancelledOrders += 1;

          } else if (
            dsUp === "RTO" ||
            rawUp.includes("RTO") ||
            RETURNING_TO_SELLER_STATUSES.includes(rawUp)
          ) {
            // RTO: current status is RTO — count it in this cohort
            stats.rtoOrders += 1;

          } else if (dsUp === "DELIVERED") {
            // Current status is DELIVERED — count it in this cohort
            stats.deliveredOrders += 1;

          } else if (
            dsUp === "IN_TRANSIT" &&
            !RETURNING_TO_SELLER_STATUSES.includes(rawUp)
          ) {
            stats.inTransitOrders += 1;
          }
        }

        // ── FINANCIAL: COD revenue → when the order was delivered ────────
        // This is separate from status counts — it's about when money arrived.
        if (
          s.deliveredAtIST === targetDate &&
          dsUp === "DELIVERED"
        ) {
          const orderKey = normalize(s.shopifyOrderName);
          if (deliveredUniqueOrders.has(orderKey)) return;
          deliveredUniqueOrders.add(orderKey);

          hasActivity = true;
          const matchingOrder = orderMap.get(orderKey);

          const codAmount = matchingOrder
            ? Number(matchingOrder.codAmount || 0)
            : Number(s.codAmount || 0);

          if (!matchingOrder) {
            console.log("ORDER MATCH FAILED", orderKey, s.shopifyOrderName, s.srOrderId);
          }

          if (codAmount > 0) {
            stats.codRevenue += codAmount;
            stats.revenueEarned += codAmount;
            stats.gatewayFees += codAmount * gatewayRate;
            stats.cogs += matchingOrder
              ? Number(matchingOrder.totalCogs || 0)
              : Number(s.totalCogs || 0);

            const orderDate = s.orderCreatedAtIST || matchingOrder?.orderCreatedAtIST;
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

        // ── FINANCIAL: RTO handling fee + revenue lost → when RTO was confirmed ──
        // Anchored to rtoAtIST (the date Shiprocket confirmed the return).
        // Completely separate from status counts — this is purely about money.
        // rtoHandlingFees = rtoFee × number of RTOs confirmed on this date
        // rtoRevenueLost  = net revenue of the order that got returned
        const isRTO =
          dsUp === "RTO" ||
          rawUp.includes("RTO") ||
          RETURNING_TO_SELLER_STATUSES.includes(rawUp);

        if (isRTO && s.rtoAtIST === targetDate) {
          hasActivity = true;
          stats.rtoHandlingFees += rtoFee;

          const matchingOrder = orderMap.get(normalize(s.shopifyOrderName));
          const revenueLost = matchingOrder
            ? Number(matchingOrder.netRevenue || 0)
            : Number(s.netRevenue || 0);
          stats.rtoRevenueLost += revenueLost;
        }

        // ── FINANCIAL: RTO handling fee → when RTO was confirmed ─────────
        // (handled above — nothing extra needed here)

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
