const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} = require("@aws-sdk/client-sqs");
const {
  GetCommand,
  UpdateCommand,
  QueryCommand,
  BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  sqsClient,
  delhiveryQueueUrl,
  summaryQueueUrl,
  newDynamoDB,
  newTableName,
} = require("../config/aws.config");

const encryptionService = require("../utils/encryption");
const delhiveryUtil = require("../utils/delhivery.util");
const { formatInTimeZone } = require("date-fns-tz");

let isShuttingDown = false;
const DDB_BATCH_SIZE = 25; // DynamoDB BatchWrite limit

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ======================================================================
// HELPER: Batch Write Items to DynamoDB
// ======================================================================
async function batchWriteItems(items) {
  if (!items || items.length === 0) return;

  for (let i = 0; i < items.length; i += DDB_BATCH_SIZE) {
    const chunk = items.slice(i, i + DDB_BATCH_SIZE);
    let retries = 3;
    let unprocessed = chunk.map((item) => ({ PutRequest: { Item: item } }));

    while (unprocessed.length > 0 && retries > 0) {
      try {
        const res = await newDynamoDB.send(
          new BatchWriteCommand({
            RequestItems: { [newTableName]: unprocessed },
          })
        );
        unprocessed = res.UnprocessedItems?.[newTableName] || [];
        if (unprocessed.length > 0) {
          await sleep(300);
          retries--;
        }
      } catch (err) {
        console.error("BatchWrite error:", err.message);
        retries--;
        await sleep(500);
      }
    }
  }
}

// ======================================================================
// HELPER: Update Sync Progress in DynamoDB
// ======================================================================
async function updateSyncProgress(merchantId, status, percent) {
  try {
    await newDynamoDB.send(
      new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${merchantId}`,
          SK: `SYNC#DILEVERY`,
        },
        UpdateExpression: "SET #s = :s, #p = :p, updatedAt = :t",
        ExpressionAttributeNames: { "#s": "status", "#p": "percent" },
        ExpressionAttributeValues: {
          ":s": status,
          ":p": Math.round(percent),
          ":t": new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    console.warn("Update progress error:", err.message);
  }
}

// ======================================================================
// HELPER: Fetch Delhivery Token from DynamoDB
// ======================================================================
async function getDelhiveryToken(merchantId) {
  for (const sk of ["INTEGRATION#DILEVERY", "INTEGRATION#DELHIVERY"]) {
    const res = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${merchantId}`,
          SK: sk,
        },
      })
    );
    if (res.Item?.access_token) {
      return encryptionService.decrypt(res.Item.access_token);
    }
  }
  return null;
}

// ======================================================================
// MAIN LOGIC: Process Delhivery Sync
// ======================================================================
async function processDelhiverySync(job) {
  const { merchantId, sinceDate, mode = "delhivery_onboarding" } = job;
  console.log(`\n🚚 [DelhiveryWorker] Starting sync for merchant=${merchantId} | Mode=${mode}`);

  try {
    // 1. Get decrypted API Token
    const token = await getDelhiveryToken(merchantId);
    if (!token) {
      throw new Error("No saved Delhivery access token found for merchant");
    }

    await updateSyncProgress(merchantId, "in_progress", 10);

    // 2. Fetch matching Shopify orders from DynamoDB
    const today = new Date();
    const startDateObj =
      mode === "delhivery_onboarding"
        ? new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
        : mode === "historical"
        ? new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
        : new Date(sinceDate || today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const sinceISO = formatInTimeZone(startDateObj, "Asia/Kolkata", "yyyy-MM-dd");

    console.log(`📡 [DelhiveryWorker] Querying Shopify orders created since: ${sinceISO}`);

    let orders = [];
    let lastKey = null;

    do {
      const params = {
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "orderCreatedAtIST >= :since AND (isTest = :false OR attribute_not_exists(isTest))",
        ExpressionAttributeValues: {
          ":pk": `MERCHANT#${merchantId}`,
          ":sk": "ORDER#",
          ":since": sinceISO,
          ":false": false,
        },
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      const res = await newDynamoDB.send(new QueryCommand(params));
      orders.push(...(res.Items || []));
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    console.log(`📋 [DelhiveryWorker] Found ${orders.length} Shopify orders to track`);

    if (orders.length === 0) {
      console.log("ℹ️ No Shopify orders found in this date range. Completing sync.");
      await updateSyncProgress(merchantId, "completed", 100);
      return;
    }

    // Map order reference to Shopify order object
    const referenceToOrder = new Map();
    for (const ord of orders) {
      const ref = delhiveryUtil.normalizeOrderReference(ord.orderName);
      if (ref && !referenceToOrder.has(ref)) {
        referenceToOrder.set(ref, ord);
      }
    }

    const uniqueReferences = Array.from(referenceToOrder.keys());
    console.log(`📦 [DelhiveryWorker] Querying Delhivery tracking for ${uniqueReferences.length} references...`);

    await updateSyncProgress(merchantId, "in_progress", 30);

    // 3. Fetch tracking data from Delhivery in batches of 25
    const shipments = await delhiveryUtil.fetchDelhiveryShipments(token, uniqueReferences);
    console.log(`✅ [DelhiveryWorker] Received ${shipments.length} tracking records from Delhivery`);

    await updateSyncProgress(merchantId, "in_progress", 65);

    // 4. Map shipments, update orders, and build SHIPMENT# items
    const dirtyDates = new Set();
    const shipmentItems = [];
    const orderUpdates = [];

    const stats = { delivered: 0, rto: 0, inTransit: 0, cancelled: 0, ndr: 0 };

    for (const ship of shipments) {
      try {
        const rawStatus =
          ship.Status?.Status ||
          ship.Status?.StatusType ||
          ship.status ||
          "UNKNOWN";

        const deliveryStatus = delhiveryUtil.normalizeDelhiveryStatus(rawStatus);

        // Milestone dates
        const dates = delhiveryUtil.extractDelhiveryDates(ship, deliveryStatus);

        const ref =
          delhiveryUtil.normalizeOrderReference(
            ship.ReferenceNo || ship.ReferenceID || ship.OrderID || ship.OrderNo
          );

        const matchedOrder = ref ? referenceToOrder.get(ref) : null;
        const awb = String(ship.AWB || ship.awb || ship.Waybill || "").trim();
        const shipmentId = awb || ref || `dlv_${Date.now()}`;

        let orderNetRevenue = 0;
        let orderCogs = 0;
        let paymentType = "COD";
        let codAmount = 0;
        let orderCreatedDateIST = null;

        if (matchedOrder) {
          orderCreatedDateIST = matchedOrder.orderCreatedAtIST;
          orderNetRevenue = Number(matchedOrder.netRevenue || 0);
          orderCogs = Number(matchedOrder.totalCogs || 0);
          paymentType = matchedOrder.paymentType || "COD";
          codAmount = Number(matchedOrder.codAmount || 0);

          if (orderCreatedDateIST) dirtyDates.add(orderCreatedDateIST);
          if (dates.srCreatedAtIST) dirtyDates.add(dates.srCreatedAtIST);
          if (dates.deliveredAtIST) dirtyDates.add(dates.deliveredAtIST);
          if (dates.rtoAtIST) dirtyDates.add(dates.rtoAtIST);
          if (dates.shipActivityDateIST) dirtyDates.add(dates.shipActivityDateIST);

          // Update Shopify order if DELIVERED
          if (deliveryStatus === "DELIVERED" && dates.deliveredAtIST) {
            stats.delivered++;
            if (!matchedOrder.isRealized || !matchedOrder.deliveredAtIST) {
              orderUpdates.push({
                PK: matchedOrder.PK,
                SK: matchedOrder.SK,
                deliveredAtIST: dates.deliveredAtIST,
              });
            }
          } else if (deliveryStatus === "RTO") {
            stats.rto++;
          } else if (deliveryStatus === "IN_TRANSIT") {
            stats.inTransit++;
          } else if (deliveryStatus === "NDR") {
            stats.ndr++;
          } else if (deliveryStatus === "CANCELLED") {
            stats.cancelled++;
          }
        }

        // Calculate Freight / Charges
        // Delhivery package charges or estimated freight
        const freight = Number(
          ship.charges?.freight_charges ||
          ship.charges?.total_amount ||
          ship.FreightCharges ||
          0
        );

        const rtoFreight = deliveryStatus === "RTO"
          ? Number(ship.charges?.rto_charges || freight * 0.8 || 0)
          : 0;

        const totalPaid = Number((freight + rtoFreight).toFixed(2));

        // 🟢 Standardized SHIPMENT# Item (Exact match with Summary Calculator)
        shipmentItems.push({
          PK: `MERCHANT#${merchantId}`,
          SK: `SHIPMENT#${shipmentId}`, // Primary key = AWB / unique ID (Zero duplicates!)
          shopifyOrderName: matchedOrder ? matchedOrder.orderName : String(ref),
          normalizedOrderName: ref,
          entityType: "SHIPMENT",
          shipmentId: String(shipmentId),
          srOrderId: String(ship.OrderID || ref),
          orderCreatedAtIST: orderCreatedDateIST,
          srCreatedAtIST: dates.srCreatedAtIST || orderCreatedDateIST, // Anchor date for status cohorts
          paymentType,
          netRevenue: orderNetRevenue,
          totalCogs: orderCogs,
          codAmount,
          shippingFee: freight,
          returnFee: rtoFreight,
          totalShippingPaid: totalPaid,
          deliveryStatus,
          rawStatus,
          awb,
          courier: "Delhivery",
          shipActivityDateIST: dates.shipActivityDateIST,
          deliveredAtIST: dates.deliveredAtIST,
          rtoAtIST: dates.rtoAtIST,
          isOrphan: !matchedOrder,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Error processing Delhivery shipment:", err.message);
      }
    }

    // 5. Batch write SHIPMENT# items to DynamoDB
    console.log(`💾 [DelhiveryWorker] Writing ${shipmentItems.length} SHIPMENT# records to DynamoDB...`);
    await batchWriteItems(shipmentItems);

    // 6. Update realized Shopify orders
    for (const update of orderUpdates) {
      await newDynamoDB.send(
        new UpdateCommand({
          TableName: newTableName,
          Key: { PK: update.PK, SK: update.SK },
          UpdateExpression: "SET isRealized = :true, deliveredAtIST = :delDate, orderStatus = :stat, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":true": true,
            ":delDate": update.deliveredAtIST,
            ":stat": "DELIVERED",
            ":updatedAt": new Date().toISOString(),
          },
        })
      ).catch(() => {});
    }

    console.log(`📊 [DelhiveryWorker] Sync Summary: Delivered=${stats.delivered}, RTO=${stats.rto}, InTransit=${stats.inTransit}`);

    // 7. Mark Sync Completed
    await updateSyncProgress(merchantId, "completed", 100);

    // 8. Handover to Summary Worker to update Dashboard
    const finalAffectedDates = Array.from(dirtyDates);
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: summaryQueueUrl,
        MessageBody: JSON.stringify({
          type: "SUMMARY_CALC",
          merchantId,
          affectedDates: finalAffectedDates,
        }),
      })
    );

    console.log(`🏁 [DelhiveryWorker] Sync complete! Triggered SUMMARY_CALC for ${finalAffectedDates.length} dates.`);

  } catch (error) {
    console.error("❌ [DelhiveryWorker] Fatal Error:", error.message);
    await updateSyncProgress(merchantId, "failed", 0);
    throw error;
  }
}

// ======================================================================
// SQS POLLING LOOP
// ======================================================================
async function pollQueue() {
  console.log("🚀 [DelhiveryWorker] Sync Engine Active and Listening on SQS...");

  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: delhiveryQueueUrl,
          WaitTimeSeconds: 20,
          MaxNumberOfMessages: 1,
          VisibilityTimeout: 900,
        })
      );

      if (!Messages || Messages.length === 0) continue;

      const message = Messages[0];
      const body = JSON.parse(message.Body);

      if (body.type === "DELHIVERY_SYNC") {
        await processDelhiverySync(body);
      }

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: delhiveryQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
      );
    } catch (e) {
      if (!isShuttingDown) console.error("❌ Delhivery Worker Error:", e.message);
      await sleep(5000);
    }
  }
}

process.on("SIGTERM", () => {
  isShuttingDown = true;
  console.log("🛑 [DelhiveryWorker] Shutting down gracefully...");
});

pollQueue();