const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { 
  sqsClient, shiprocketQueueUrl, summaryQueueUrl, newDynamoDB, newTableName, s3Client, s3BucketName 
} = require("../config/aws.config");
const axios = require("axios");
const { formatInTimeZone } = require("date-fns-tz");
const encryptionService = require("../utils/encryption");
const logger = require("../utils/logger.js"); // 🟢 Logger added

let isShuttingDown = false;
const normalizeOrderName = (name) => name ? name.toString().replace(/^#/, "").trim().toLowerCase() : "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parseShiprocketDate = (str) => {
  if (!str) return null;
  const clean = str.replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
};

const pollQueue = async () => {
  console.log("🚀 [ShiprocketWorker] Sync Engine Active...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({ 
        QueueUrl: shiprocketQueueUrl, WaitTimeSeconds: 20, MaxNumberOfMessages: 1 
      }));
      if (!Messages || Messages.length === 0) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      
      await processShiprocketSync(body);
      
      await sqsClient.send(new DeleteMessageCommand({ QueueUrl: shiprocketQueueUrl, ReceiptHandle: message.ReceiptHandle }));
    } catch (e) { 
      if (!isShuttingDown) console.error("❌ Fatal Worker Error:", e.message); 
      await sleep(5000); 
    }
  }
};

const processShiprocketSync = async (job) => {
  const { merchantId, sinceDate, mode = "full", page = 1, globalPage = 1, currentAffectedDates = [] } = job;
  
  try {
    const integrationRes = await newDynamoDB.send(new GetCommand({
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHIPROCKET" }
    }));
    const integration = integrationRes.Item;
    if (!integration) return;
    const token = encryptionService.decrypt(integration.token);

    const today = new Date();
    let startDateObj = (mode === "incremental") ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) : new Date(sinceDate);

    let endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + 29);
    if (endDateObj > today) endDateObj = today;

    const fromStr = startDateObj.toISOString().split("T")[0];
    const toStr   = endDateObj.toISOString().split("T")[0];

    console.log(`📡 Shiprocket [${mode}] | ${fromStr} to ${toStr} | Page ${page}`);

    const res = await axios.get("https://apiv2.shiprocket.in/v1/external/shipments", {
      headers: { Authorization: `Bearer ${token}` },
      params: { from: fromStr, to: toStr, page: page, per_page: 50 }
    });

    const shipments = res.data.data || [];
    const dirtyDates = new Set(currentAffectedDates); 

    for (const ship of shipments) {
      try {
        const rawStatus = (ship.status || "").toUpperCase().trim();
        let deliveryStatus = (rawStatus === "DELIVERED") ? "delivered" : (rawStatus.startsWith("RTO") || rawStatus.includes("RETURN")) ? "rto" : "in_transit";

        const createdAtDate = parseShiprocketDate(ship.created_at);
        const updatedAtDate = parseShiprocketDate(ship.updated_at);
        if (!createdAtDate) continue;

        const orderDateIST = formatInTimeZone(createdAtDate, "Asia/Kolkata", "yyyy-MM-dd");
        const activityDateIST = updatedAtDate ? formatInTimeZone(updatedAtDate, "Asia/Kolkata", "yyyy-MM-dd") : orderDateIST;

        dirtyDates.add(orderDateIST);
        dirtyDates.add(activityDateIST);

        let channelOrderId = ship.channel_order_id;
        if (!channelOrderId) {
          await sleep(600); 
          const detail = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${ship.order_id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          channelOrderId = detail.data.data.channel_order_id;
        }

        const charges = ship.charges || {};
        const freight = Number(charges.freight_charges || 0);
        const rtoFreight = Number(charges.applied_weight_amount_rto || charges.rto_charges || 0);
        const totalPaid = Number((freight + (deliveryStatus === "rto" ? rtoFreight : 0)).toFixed(2));

        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName, Key: `${merchantId}/shipments/${ship.id}.json`,
          Body: JSON.stringify(ship), ContentType: "application/json"
        }));

        await newDynamoDB.send(new PutCommand({
          TableName: newTableName,
          Item: {
            PK: `MERCHANT#${merchantId}`, SK: `SHIPMENT#${ship.id}`,
            entityType: "SHIPMENT", shipmentId: ship.id.toString(),
            orderId: ship.order_id?.toString(), shopifyOrderName: channelOrderId || "",
            normalizedOrderName: normalizeOrderName(channelOrderId),
            shippingFee: freight, returnFee: (deliveryStatus === "rto") ? rtoFreight : 0,
            totalShippingPaid: totalPaid,
            deliveryStatus,
            orderCreatedAtIST: orderDateIST,
            deliveredAtIST: (deliveryStatus === "delivered") ? activityDateIST : null,
            updatedAt: new Date().toISOString()
          }
        }));
      } catch (err) { console.error(`⚠️ Skip ${ship.id}`); }
    }

    const nextLink = res.data.meta?.pagination?.links?.next || null;
    const datesArray = Array.from(dirtyDates);

    if (nextLink && shipments.length > 0) {
      await updateSyncProgress(merchantId, "SHIPROCKET", Math.min(98, globalPage * 2));
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: shiprocketQueueUrl,
        MessageBody: JSON.stringify({ ...job, page: page + 1, globalPage: globalPage + 1, currentAffectedDates: datesArray })
      }));
    } else if (toStr < today.toISOString().split("T")[0]) {
      const nextStart = new Date(endDateObj);
      nextStart.setDate(nextStart.getDate() + 1);
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: shiprocketQueueUrl,
        MessageBody: JSON.stringify({ ...job, sinceDate: nextStart.toISOString(), page: 1, globalPage: globalPage + 1, currentAffectedDates: datesArray })
      }));
    } else {
      await markSyncComplete(merchantId, datesArray);
    }
  } catch (e) { 
    // 🟢 Error Logging added
    logger.logError(merchantId, "SHIPROCKET", e, "INCREMENTAL_SYNC");
    throw e; 
  }
};

async function updateSyncProgress(merchantId, platform, percent) {
  try {
    await newDynamoDB.send(new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform.toUpperCase()}` },
        UpdateExpression: "SET #p = :p, updatedAt = :t",
        ExpressionAttributeNames: { "#p": "percent" },
        ExpressionAttributeValues: { ":p": percent, ":t": new Date().toISOString() },
    }));
  } catch (err) {}
}

async function markSyncComplete(merchantId, finalAffectedDates) {
  try {
    // 1. Update Sync Progress to 100%
    await newDynamoDB.send(new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#SHIPROCKET` },
        UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t",
        ExpressionAttributeNames: { "#s": "status", "#p": "percent" },
        ExpressionAttributeValues: { ":c": "completed", ":p": 100, ":t": new Date().toISOString() },
    }));

    // 2. 🟢 Update Integration Watermark (Critical for Next Sync)
    await newDynamoDB.send(new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `INTEGRATION#SHIPROCKET` },
        UpdateExpression: "SET lastSyncTime = :t",
        ExpressionAttributeValues: { ":t": new Date().toISOString() }
    }));

    // 3. Trigger Summary Calculation
    await sqsClient.send(new SendMessageCommand({
        QueueUrl: summaryQueueUrl,
        MessageBody: JSON.stringify({ type: "SUMMARY_CALC", merchantId, affectedDates: finalAffectedDates }),
    }));
    
    console.log(`🏁 Shiprocket DONE for ${merchantId}. Summary triggered.`);
  } catch (err) { console.error("markSyncComplete Error:", err); }
}

pollQueue();