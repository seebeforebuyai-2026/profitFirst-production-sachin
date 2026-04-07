const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} = require("@aws-sdk/client-sqs");
const {
  PutCommand,
  GetCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const {
  sqsClient,
  shiprocketQueueUrl,
  summaryQueueUrl,
  newDynamoDB,
  newTableName,
  s3Client,
  s3BucketName,
} = require("../config/aws.config");
const axios = require("axios");
const { formatInTimeZone } = require("date-fns-tz");
const encryptionService = require("../utils/encryption");

let isShuttingDown = false;
const normalizeOrderName = (name) =>
  name ? name.toString().replace(/^#/, "").trim().toLowerCase() : "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 🟢 HUMAN LOGIC: Parse Shiprocket's weird dates like "18th Feb"
const parseShiprocketDate = (str) => {
  if (!str) return null;
  // Format "18th Feb 2026" -> "18 Feb 2026" (Remove th, st, nd, rd)
  const clean = str.replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
};

const pollQueue = async () => {
  console.log("🚀 Shiprocket Worker: FINAL PRODUCTION ENGINE STARTED...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          WaitTimeSeconds: 20,
        }),
      );
      if (!Messages || Messages.length === 0) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      await processShiprocketSync(body);
      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
    } catch (e) {
      console.error("❌ Worker Fatal Error:", e.message);
      await sleep(5000);
    }
  }
};

const processShiprocketSync = async (job) => {
  const { merchantId, sinceDate, page = 1, globalPage = 1 } = job;
  try {
    const integration = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHIPROCKET" },
      }),
    );
    if (!integration.Item) return;
    const token = encryptionService.decrypt(integration.Item.token);

    // Window logic for 30-day Shiprocket limit
    const startObj = new Date(sinceDate);
    const todayObj = new Date();
    let endObj = new Date(startObj);
    endObj.setDate(endObj.getDate() + 29);
    if (endObj > todayObj) endObj = todayObj;

    const fromStr = startObj.toISOString().split("T")[0];
    const toStr = endObj.toISOString().split("T")[0];

    console.log(`📡 Syncing: ${fromStr} to ${toStr} | Page ${page}`);

    const res = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/shipments",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { from: fromStr, to: toStr, page: page, per_page: 50 },
      },
    );

    const shipments = res.data.data || [];

    for (const ship of shipments) {
      try {
        const rawStatus = (ship.status || "").toUpperCase().trim();
        let deliveryStatus =
          rawStatus === "DELIVERED"
            ? "delivered"
            : rawStatus.startsWith("RTO")
              ? "rto"
              : "in_transit";

        // 🟢 DATE FIX: Robust Parsing
        const createdAtDate = parseShiprocketDate(ship.created_at);
        const updatedAtDate = parseShiprocketDate(ship.updated_at);

        if (!createdAtDate) {
          console.warn(
            `⚠️ Skipping ${ship.id} due to unparsable date: ${ship.created_at}`,
          );
          continue;
        }

        const orderDateIST = formatInTimeZone(
          createdAtDate,
          "Asia/Kolkata",
          "yyyy-MM-dd",
        );
        const updatedAtIST = updatedAtDate
          ? formatInTimeZone(updatedAtDate, "Asia/Kolkata", "yyyy-MM-dd")
          : orderDateIST;

        // 🟢 IDENTITY BRIDGE: Slow & Steady to prevent 429
        let channelOrderId = ship.channel_order_id;

        if (!channelOrderId || channelOrderId === "") {
          try {
            await sleep(600); // ⏱️ Increased delay to 600ms for safety
            const detail = await axios.get(
              `https://apiv2.shiprocket.in/v1/external/orders/show/${ship.order_id}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            channelOrderId = detail.data.data.channel_order_id;
          } catch (err) {
            if (err.response?.status === 429) {
              console.warn("🚨 Rate limit! Sleeping 10s...");
              await sleep(10000);
            }
          }
        }

        const charges = ship.charges || {};
        const freight = Number(charges.freight_charges || 0);
        const rtoFreight = Number(
          charges.applied_weight_amount_rto || charges.rto_charges || 0,
        );
        const totalPaid = freight + (deliveryStatus === "rto" ? rtoFreight : 0);

        // S3 Backup & DynamoDB Put
        await s3Client.send(
          new PutObjectCommand({
            Bucket: s3BucketName,
            Key: `${merchantId}/shipments/${ship.id}.json`,
            Body: JSON.stringify(ship),
            ContentType: "application/json",
          }),
        );

        await newDynamoDB.send(
          new PutCommand({
            TableName: newTableName,
            Item: {
              PK: `MERCHANT#${merchantId}`,
              SK: `SHIPMENT#${ship.id}`,
              entityType: "SHIPMENT",
              shipmentId: ship.id.toString(),
              orderId: ship.order_id?.toString(),
              shopifyOrderName: channelOrderId || "",
              normalizedOrderName: normalizeOrderName(channelOrderId),
              shippingFee: freight,
              returnFee: deliveryStatus === "rto" ? rtoFreight : 0,
              totalShippingPaid: totalPaid,
              deliveryStatus,
              orderCreatedAtIST: orderDateIST,
              deliveredAtIST:
                deliveryStatus === "delivered" ? updatedAtIST : null,
              updatedAt: new Date().toISOString(),
            },
          }),
        );
      } catch (err) {
        console.error(`⚠️ Skip Shipment ${ship.id}:`, err.message);
      }
    }

    const nextLink = res.data.meta?.pagination?.links?.next || null;
    if (nextLink && shipments.length > 0) {
      await updateSyncProgress(
        merchantId,
        "SHIPROCKET",
        Math.min(98, globalPage * 2),
      );
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          MessageBody: JSON.stringify({
            ...job,
            page: page + 1,
            globalPage: globalPage + 1,
          }),
        }),
      );
    } else if (toStr < todayObj.toISOString().split("T")[0]) {
      const nextChunkStart = new Date(endObj);
      nextChunkStart.setDate(nextChunkStart.getDate() + 1);
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          MessageBody: JSON.stringify({
            merchantId,
            sinceDate: nextChunkStart.toISOString(),
            page: 1,
            globalPage: globalPage + 1,
          }),
        }),
      );
    } else {
      await markSyncComplete(merchantId, "SHIPROCKET");
    }
  } catch (e) {
    throw e;
  }
};

// ... updateSyncProgress and markSyncComplete remain same ...

async function updateSyncProgress(merchantId, platform, percent) {
  try {
    await newDynamoDB.send(
      new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` },
        UpdateExpression: "SET #p = :p, updatedAt = :t",
        ExpressionAttributeNames: { "#p": "percent" },
        ExpressionAttributeValues: {
          ":p": percent,
          ":t": new Date().toISOString(),
        },
      }),
    );
  } catch (err) {}
}

async function markSyncComplete(merchantId, platform) {
  await newDynamoDB.send(
    new UpdateCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` },
      UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t",
      ExpressionAttributeNames: { "#s": "status", "#p": "percent" },
      ExpressionAttributeValues: {
        ":c": "completed",
        ":p": 100,
        ":t": new Date().toISOString(),
      },
    }),
  );
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: summaryQueueUrl,
      MessageBody: JSON.stringify({ type: "SUMMARY_CALC", merchantId }),
    }),
  );
      console.log(`🏁 Shiprocket Sync COMPLETED for ${merchantId}. Moving to Summary calulation.`);

}

pollQueue();
