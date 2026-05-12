const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  ChangeMessageVisibilityCommand,
} = require("@aws-sdk/client-sqs");
const {
  GetCommand,
  UpdateCommand,
  QueryCommand,
  BatchWriteCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  sqsClient,
  shiprocketQueueUrl,
  summaryQueueUrl,
  newDynamoDB,
  newTableName,
} = require("../config/aws.config");
const axios = require("axios");
const { formatInTimeZone } = require("date-fns-tz");
const encryptionService = require("../utils/encryption");

let isShuttingDown = false;

// ======================================================================
// CONSTANTS
// ======================================================================

const STATUS_CODE_MAP = {
  1: "NEW", 2: "CANCELED", 3: "OTHER", 4: "READY_TO_SHIP",
  5: "PICKUP_SCHEDULED", 6: "SHIPPED", 7: "DELIVERED", 8: "UNDELIVERED",
  9: "RTO", 10: "RTO_DELIVERED", 11: "PICKUP_GENERATED", 12: "PICKUP_QUEUED",
  13: "OUT_FOR_PICKUP", 14: "PICKUP_RESCHEDULED", 15: "PICKED_UP",
  16: "OUT_FOR_DELIVERY", 17: "IN_TRANSIT", 18: "AWB_ASSIGNED",
  19: "LABEL_GENERATED", 20: "MANIFEST_GENERATED", 21: "PICKUP_EXCEPTION",
  22: "UNDELIVERED_1ST", 23: "UNDELIVERED_2ND", 24: "UNDELIVERED_3RD",
  25: "RTO_INITIATED", 26: "RTO_ACKNOWLEDGED", 27: "RTO_IN_TRANSIT",
  38: "REACHED_DESTINATION_HUB", 42: "MISROUTED",
  43: "CUSTOMER_NOT_AVAILABLE", 44: "ADDRESS_INCORRECT", 45: "DELAYED",
  46: "PARTIAL_DELIVERED", 47: "OUT_FOR_DELIVERY_TODAY", 48: "HANDED_OVER",
};

const DDB_BATCH_SIZE = 25;     // DynamoDB BatchWrite hard limit
const DDB_BATCH_GET_SIZE = 100; // DynamoDB BatchGet hard limit
const PER_PAGE = 100;

// 🟢 SCALABILITY CONFIG - TUNED FOR HIGH VOLUME
const RATE_LIMIT = {
  BASE_DELAY_MS: 1200,     // Slightly tighter — 50 req/min
  RETRY_DELAY_MS: 5000,
  BACKOFF_MULTIPLIER: 2,
  MAX_RETRIES: 5,
};

const CHUNK_CONFIG = {
  // 🟢 KEY: Use 3-day windows for high-volume stores
  // Shiprocket has ~10k records hard limit per range, regardless of window
  // 3 days × 3k orders/day = 9k = safe
  WINDOW_DAYS: 3,
  MAX_PAGES_PER_WINDOW: 100, // Shiprocket hard limit
  ORDERS_PER_SQS_MESSAGE: 500, // Process 5 pages per SQS invocation
};

const SQS_CONFIG = {
  VISIBILITY_HEARTBEAT_MS: 10 * 60 * 1000, // Extend visibility every 10 min
  MAX_MESSAGE_PROCESSING_MS: 12 * 60 * 1000, // Reshard after 12 min
};

// ======================================================================
// HELPERS
// ======================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeOrderName = (name) => {
  if (!name) return "";
  return String(name).replace(/^#/, "").replace(/-[A-Z]$/i, "").trim().toLowerCase();
};

const parseShiprocketDate = (dateStr) => {
  if (!dateStr || dateStr === "0000-00-00 00:00:00") return null;
  const clean = String(dateStr).replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  if (isNaN(d.getTime())) return null;
  return formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd");
};

const getNormalizedStatus = (status) => {
  if (!status) return "UNKNOWN";
  let textStatus = status;
  if (typeof status === "number" || (!isNaN(Number(status)) && String(status).trim() !== "")) {
    textStatus = STATUS_CODE_MAP[Number(status)] || String(status);
  }
  const s = String(textStatus).toLowerCase();
  if (s.includes("rto")) return "RTO";
  if (s.includes("delivered") && !s.includes("rto")) return "DELIVERED";
  if (s.includes("cancel")) return "CANCELLED";
  return "IN_TRANSIT";
};

const formatDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const splitDateRange = (fromStr, toStr, windowDays) => {
  const chunks = [];
  const start = new Date(fromStr);
  const end = new Date(toStr);
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + windowDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ from: formatDate(cursor), to: formatDate(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
};

// ======================================================================
// SMART API CALLER (retry + rate limit)
// ======================================================================

async function callShiprocketAPI(url, token, params, label = "API") {
  let attempt = 0;
  let delay = RATE_LIMIT.RETRY_DELAY_MS;

  while (attempt < RATE_LIMIT.MAX_RETRIES) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        timeout: 60000,
      });
      return { success: true, data: res.data };
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.message || err.message;
      attempt++;

      if (status === 429) {
        console.warn(`   ⏳ [${label}] 429 Rate limit. Retry ${attempt} after ${delay}ms`);
        await sleep(delay);
        delay *= RATE_LIMIT.BACKOFF_MULTIPLIER;
        continue;
      }

      if (status === 400) {
        return { success: false, status: 400, error: errorMsg, noData: true };
      }

      if (status === 401) {
        return { success: false, status: 401, error: "Auth failed" };
      }

      if (attempt < RATE_LIMIT.MAX_RETRIES) {
        console.warn(`   ⚠️ [${label}] Error ${status || "net"}: ${errorMsg}. Retry ${attempt}`);
        await sleep(delay);
        delay *= RATE_LIMIT.BACKOFF_MULTIPLIER;
        continue;
      }

      return { success: false, status, error: errorMsg };
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

// ======================================================================
// 🟢 BATCH GET (optimized bulk read - reduces 90k DDB calls → 900 calls)
// ======================================================================

async function batchGetTempShipments(merchantId, srOrderIds) {
  if (srOrderIds.length === 0) return new Map();
  const resultMap = new Map();

  const chunks = [];
  for (let i = 0; i < srOrderIds.length; i += DDB_BATCH_GET_SIZE) {
    chunks.push(srOrderIds.slice(i, i + DDB_BATCH_GET_SIZE));
  }

  for (const chunk of chunks) {
    const keys = chunk.map((id) => ({
      PK: `MERCHANT#${merchantId}`,
      SK: `TEMP_SHIPMENT#${id}`,
    }));

    let retries = 3;
    let unprocessed = { [newTableName]: { Keys: keys } };

    while (unprocessed && Object.keys(unprocessed).length > 0 && retries > 0) {
      try {
        const res = await newDynamoDB.send(
          new BatchGetCommand({ RequestItems: unprocessed }),
        );
        for (const item of res.Responses?.[newTableName] || []) {
          resultMap.set(item.srOrderId, item);
        }
        unprocessed = res.UnprocessedKeys;
        if (unprocessed && Object.keys(unprocessed).length > 0) {
          await sleep(300);
          retries--;
        } else {
          break;
        }
      } catch (err) {
        console.error("BatchGet error:", err.message);
        retries--;
        await sleep(500);
      }
    }
  }

  return resultMap;
}

// 🟢 Batch lookup Shopify orders by normalizedOrderName using parallel queries
async function batchGetShopifyOrders(merchantId, normalizedNames) {
  const resultMap = new Map();
  if (normalizedNames.length === 0) return resultMap;

  // Parallel but throttled (20 concurrent queries max)
  const CONCURRENCY = 20;
  for (let i = 0; i < normalizedNames.length; i += CONCURRENCY) {
    const batch = normalizedNames.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (name) => {
      try {
        const res = await newDynamoDB.send(
          new QueryCommand({
            TableName: newTableName,
            IndexName: "normalizedOrderNameGSI",
            KeyConditionExpression: "PK = :pk AND normalizedOrderName = :sk",
            ExpressionAttributeValues: {
              ":pk": `MERCHANT#${merchantId}`,
              ":sk": name,
            },
            Limit: 1,
          }),
        );
        if (res.Items?.[0]) resultMap.set(name, res.Items[0]);
      } catch (err) {
        // silent fail per-item
      }
    });
    await Promise.all(promises);
  }

  return resultMap;
}

// ======================================================================
// BATCH WRITE/DELETE (throttle-aware)
// ======================================================================

async function batchWriteItems(items) {
  if (items.length === 0) return;

  const chunks = [];
  for (let i = 0; i < items.length; i += DDB_BATCH_SIZE) {
    chunks.push(items.slice(i, i + DDB_BATCH_SIZE));
  }

  for (const chunk of chunks) {
    let retries = 5;
    let unprocessed = chunk.map((item) => ({ PutRequest: { Item: item } }));
    let backoff = 200;

    while (unprocessed.length > 0 && retries > 0) {
      try {
        const res = await newDynamoDB.send(
          new BatchWriteCommand({
            RequestItems: { [newTableName]: unprocessed },
          }),
        );
        unprocessed = res.UnprocessedItems?.[newTableName] || [];
        if (unprocessed.length > 0) {
          await sleep(backoff);
          backoff *= 2;
          retries--;
        }
      } catch (err) {
        console.error("BatchWrite error:", err.message);
        retries--;
        await sleep(backoff);
        backoff *= 2;
      }
    }
  }
}

async function batchDeleteItems(keys) {
  if (keys.length === 0) return;
  const chunks = [];
  for (let i = 0; i < keys.length; i += DDB_BATCH_SIZE) {
    chunks.push(keys.slice(i, i + DDB_BATCH_SIZE));
  }
  for (const chunk of chunks) {
    try {
      await newDynamoDB.send(
        new BatchWriteCommand({
          RequestItems: {
            [newTableName]: chunk.map((key) => ({ DeleteRequest: { Key: key } })),
          },
        }),
      );
    } catch (err) {
      console.error("BatchDelete error:", err.message);
    }
  }
}

// ======================================================================
// STAGE 1: COLLECT SHIPMENTS (chunked by date window)
// ======================================================================

async function collectShipmentsForWindow(merchantId, token, fromStr, toStr, heartbeat) {
  let page = 1;
  let totalCollected = 0;
  const itemsToWrite = [];

  while (page <= CHUNK_CONFIG.MAX_PAGES_PER_WINDOW) {
    await heartbeat(); // Keep SQS message alive

    const result = await callShiprocketAPI(
      "https://apiv2.shiprocket.in/v1/external/shipments",
      token,
      { from: fromStr, to: toStr, page, per_page: PER_PAGE },
      `ship-${fromStr}-p${page}`,
    );

    await sleep(RATE_LIMIT.BASE_DELAY_MS);

    if (!result.success) {
      if (result.noData) break;
      console.warn(`      ⚠️ Window ${fromStr} page ${page}: ${result.error}`);
      break;
    }

    const shipments = result.data?.data || [];
    if (shipments.length === 0) break;

    for (const ship of shipments) {
      if (!ship.order_id) continue;
      itemsToWrite.push({
        PK: `MERCHANT#${merchantId}`,
        SK: `TEMP_SHIPMENT#${ship.order_id}`,
        entityType: "TEMP_SHIPMENT",
        srOrderId: String(ship.order_id),
        textStatus: ship.status,
        charges: ship.charges || {},
        delivered_date: ship.delivered_date || null,
        rto_delivered_date: ship.rto_delivered_date || null,
        awb: ship.awb || "",
        courier: ship.courier_name || "",
        ttl: Math.floor(Date.now() / 1000) + 14400, // 4 hour TTL for large syncs
      });

      if (itemsToWrite.length >= 500) {
        await batchWriteItems(itemsToWrite.splice(0, 500));
      }
    }

    totalCollected += shipments.length;
    const pagination = result.data?.meta?.pagination;
    if (!pagination || pagination.current_page >= pagination.total_pages) break;
    page++;
  }

  if (itemsToWrite.length > 0) await batchWriteItems(itemsToWrite);
  return totalCollected;
}

// ======================================================================
// STAGE 2: PROCESS ONE PAGE OF ORDERS (OPTIMIZED WITH BATCH LOOKUPS)
// ======================================================================

async function processOrdersPage(merchantId, srOrders, dirtyDates) {
  const shipmentItems = [];
  const orderUpdates = [];
  const stats = { linked: 0, orphan: 0, delivered: 0, rto: 0, inTransit: 0 };

  if (srOrders.length === 0) return stats;

  // 🟢 BATCH LOOKUP: Get ALL temp shipments in 1 call instead of N calls
  const srOrderIds = srOrders.map((o) => String(o.id));
  const tempMap = await batchGetTempShipments(merchantId, srOrderIds);

  // 🟢 BATCH LOOKUP: Get ALL shopify orders in parallel
  const normalizedNames = srOrders
    .filter((o) => o.channel_order_id)
    .map((o) => normalizeOrderName(o.channel_order_id));
  const orderMap = await batchGetShopifyOrders(merchantId, normalizedNames);

  for (const srOrder of srOrders) {
    try {
      const channelOrderId = srOrder.channel_order_id;
      if (!channelOrderId) continue;

      const shipmentData = srOrder.shipments?.[0] || {};
      const shipmentId = shipmentData.id || srOrder.id;
      const enriched = tempMap.get(String(srOrder.id)) || {};

      const rawStatus =
        enriched.textStatus ||
        STATUS_CODE_MAP[Number(shipmentData.status)] ||
        srOrder.status ||
        "UNKNOWN";

      const deliveryStatus = getNormalizedStatus(rawStatus);
      const shipActivityDateIST = parseShiprocketDate(srOrder.updated_at);
      const deliveredAtIST = parseShiprocketDate(
        enriched.delivered_date || shipmentData.delivered_date,
      );
      const rtoAtIST = parseShiprocketDate(
        enriched.rto_delivered_date || shipmentData.rto_delivered_date,
      );

      const normalizedName = normalizeOrderName(channelOrderId);
      const order = orderMap.get(normalizedName);

      let orderCreatedDateIST = null;
      let orderNetRevenue = 0;
      let orderCogs = 0;
      let paymentType = "unknown";
      let codPart = 0;
      let isOrphan = false;

      if (order) {
        stats.linked++;
        orderCreatedDateIST = order.orderCreatedAtIST;
        orderNetRevenue = order.netRevenue || 0;
        orderCogs = order.totalCogs || 0;
        paymentType = order.paymentType || "unknown";
        codPart = order.codAmount || 0;

        if (orderCreatedDateIST) dirtyDates.add(orderCreatedDateIST);
        if (deliveryStatus === "RTO" && rtoAtIST) dirtyDates.add(rtoAtIST);

        if (deliveryStatus === "DELIVERED" && deliveredAtIST) {
          dirtyDates.add(deliveredAtIST);
          stats.delivered++;
          if (!order.isRealized || !order.deliveredAtIST) {
            orderUpdates.push({
              PK: order.PK,
              SK: order.SK,
              deliveredAtIST,
            });
          }
        } else if (deliveryStatus === "RTO") stats.rto++;
        else if (deliveryStatus === "IN_TRANSIT") stats.inTransit++;
      } else {
        isOrphan = true;
        stats.orphan++;
      }

      const charges = enriched.charges || {};
      const freight = Number(charges.freight_charges || 0);
      const rtoFreight = Number(
        charges.applied_weight_amount_rto || charges.rto_charges || 0,
      );
      const totalPaid = Number(
        (freight + (deliveryStatus === "RTO" ? rtoFreight : 0)).toFixed(2),
      );

      shipmentItems.push({
        PK: `MERCHANT#${merchantId}`,
        SK: `SHIPMENT#${shipmentId}`,
        shopifyOrderName: String(channelOrderId),
        normalizedOrderName: normalizedName,
        entityType: "SHIPMENT",
        shipmentId: String(shipmentId),
        srOrderId: String(srOrder.id),
        orderCreatedAtIST: orderCreatedDateIST,
        paymentType,
        netRevenue: orderNetRevenue,
        totalCogs: orderCogs,
        codAmount: codPart,
        shippingFee: freight,
        returnFee: deliveryStatus === "RTO" ? rtoFreight : 0,
        totalShippingPaid: totalPaid,
        deliveryStatus,
        rawStatus,
        awb: enriched.awb || "",
        courier: enriched.courier || "",
        shipActivityDateIST,
        deliveredAtIST,
        rtoAtIST,
        isOrphan,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`   ⚠️ Skip ${srOrder.id}:`, err.message);
    }
  }

  // Batch write all shipments
  await batchWriteItems(shipmentItems);

  // 🟢 Parallel order updates (throttled concurrency)
  const UPDATE_CONCURRENCY = 10;
  for (let i = 0; i < orderUpdates.length; i += UPDATE_CONCURRENCY) {
    const batch = orderUpdates.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(
      batch.map((update) =>
        newDynamoDB
          .send(
            new UpdateCommand({
              TableName: newTableName,
              Key: { PK: update.PK, SK: update.SK },
              UpdateExpression:
                "SET isRealized = :true, deliveredAtIST = :delDate, orderStatus = :stat, updatedAt = :updatedAt",
              ExpressionAttributeValues: {
                ":true": true,
                ":delDate": update.deliveredAtIST,
                ":stat": "DELIVERED",
                ":updatedAt": new Date().toISOString(),
              },
            }),
          )
          .catch((err) => console.error("Order update error:", err.message)),
      ),
    );
  }

  return stats;
}

// ======================================================================
// STAGE 3: CLEANUP TEMP RECORDS (CHUNKED via SQS for huge volumes)
// ======================================================================

async function cleanupTempRecords(merchantId, heartbeat) {
  console.log("🧹 [Stage 3] Cleaning TEMP records...");
  let lastKey;
  let totalDeleted = 0;
  const keysToDelete = [];

  do {
    await heartbeat();
    const res = await newDynamoDB.send(
      new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `MERCHANT#${merchantId}`,
          ":sk": "TEMP_SHIPMENT#",
        },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items || []) {
      keysToDelete.push({ PK: item.PK, SK: item.SK });
      if (keysToDelete.length >= 500) {
        await batchDeleteItems(keysToDelete.splice(0, 500));
        totalDeleted += 500;
      }
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  if (keysToDelete.length > 0) {
    await batchDeleteItems(keysToDelete);
    totalDeleted += keysToDelete.length;
  }
  console.log(`   ✅ Deleted ${totalDeleted} TEMP records`);
  // Note: DynamoDB TTL will also auto-cleanup any leftovers
}

// ======================================================================
// 🟢 SQS HEARTBEAT (extends visibility for long-running jobs)
// ======================================================================

function createHeartbeat(receiptHandle, queueUrl) {
  let startTime = Date.now();
  let lastExtension = Date.now();

  return async () => {
    const now = Date.now();
    // Extend visibility every 10 min
    if (now - lastExtension >= SQS_CONFIG.VISIBILITY_HEARTBEAT_MS) {
      try {
        await sqsClient.send(
          new ChangeMessageVisibilityCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
            VisibilityTimeout: 900, // Extend to another 15 min
          }),
        );
        lastExtension = now;
        console.log(`   💓 SQS heartbeat (elapsed: ${Math.round((now - startTime) / 1000)}s)`);
      } catch (err) {
        console.warn("Heartbeat failed:", err.message);
      }
    }
    // Signal to re-shard if we're running > 12 min
    return now - startTime > SQS_CONFIG.MAX_MESSAGE_PROCESSING_MS;
  };
}

// ======================================================================
// MAIN JOB PROCESSOR
// ======================================================================

async function processShiprocketSync(job, heartbeat) {
  const {
    merchantId,
    sinceDate,
    mode = "full",
    stage = "collect",
    chunkIdx = 0,
    page = 1,
    currentAffectedDates = [],
    dateChunks = null,
    collectChunkIdx = 0, // Track collect progress
  } = job;

  try {
    const integrationRes = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHIPROCKET" },
      }),
    );
    const integration = integrationRes.Item;
    if (!integration) return;
    const token = encryptionService.decrypt(integration.token);

    const today = new Date();
    const startDateObj =
      mode === "incremental"
        ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(sinceDate);
    const fromStr = formatDate(startDateObj);
    const toStr = formatDate(today);

    const chunks =
      dateChunks || splitDateRange(fromStr, toStr, CHUNK_CONFIG.WINDOW_DAYS);

    console.log(
      `📦 [Shiprocket] ${merchantId} | Stage: ${stage} | ChunkIdx: ${chunkIdx + 1}/${chunks.length} | Page: ${page}`,
    );

    // ==================================================================
    // STAGE: COLLECT (🟢 Now sharded — one chunk per SQS message)
    // ==================================================================
    if (stage === "collect") {
      if (collectChunkIdx >= chunks.length) {
        // All collect chunks done → start processing
        await updateSyncProgress(merchantId, "SHIPROCKET", 30);
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shiprocketQueueUrl,
            MessageBody: JSON.stringify({
              ...job,
              stage: "process",
              chunkIdx: 0,
              page: 1,
              dateChunks: chunks,
            }),
          }),
        );
        return;
      }

      const currentChunk = chunks[collectChunkIdx];
      console.log(
        `💾 [Collect ${collectChunkIdx + 1}/${chunks.length}] ${currentChunk.from} → ${currentChunk.to}`,
      );

      const count = await collectShipmentsForWindow(
        merchantId,
        token,
        currentChunk.from,
        currentChunk.to,
        heartbeat,
      );
      console.log(`   ✅ Collected ${count} shipments in this window`);

      const progress = 5 + ((collectChunkIdx + 1) / chunks.length) * 25;
      await updateSyncProgress(merchantId, "SHIPROCKET", progress);

      // Next collect chunk
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          MessageBody: JSON.stringify({
            ...job,
            stage: "collect",
            collectChunkIdx: collectChunkIdx + 1,
            dateChunks: chunks,
          }),
        }),
      );
      return;
    }

    // ==================================================================
    // STAGE: PROCESS
    // ==================================================================
    if (stage === "process") {
      const currentChunk = chunks[chunkIdx];
      if (!currentChunk) {
        await updateSyncProgress(merchantId, "SHIPROCKET", 95);
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shiprocketQueueUrl,
            MessageBody: JSON.stringify({
              ...job,
              stage: "cleanup",
              currentAffectedDates,
            }),
          }),
        );
        return;
      }

      const dirtyDates = new Set(currentAffectedDates);
      let currentPage = page;
      let pagesProcessedThisRun = 0;

      // 🟢 Process multiple pages per SQS message, but re-shard if running too long
      while (true) {
        const shouldReshard = await heartbeat();
        if (shouldReshard && pagesProcessedThisRun > 0) {
          console.log(`   ⏰ Re-sharding at page ${currentPage} to prevent timeout`);
          break;
        }

        const result = await callShiprocketAPI(
          "https://apiv2.shiprocket.in/v1/external/orders",
          token,
          {
            from: currentChunk.from,
            to: currentChunk.to,
            page: currentPage,
            per_page: PER_PAGE,
          },
          `orders-c${chunkIdx + 1}-p${currentPage}`,
        );

        await sleep(RATE_LIMIT.BASE_DELAY_MS);

        if (!result.success) {
          console.warn(
            `   ⚠️ Chunk ${chunkIdx + 1} page ${currentPage}: ${result.error} → next chunk`,
          );
          // Move to next date chunk
          await sqsClient.send(
            new SendMessageCommand({
              QueueUrl: shiprocketQueueUrl,
              MessageBody: JSON.stringify({
                ...job,
                stage: "process",
                chunkIdx: chunkIdx + 1,
                page: 1,
                currentAffectedDates: Array.from(dirtyDates),
                dateChunks: chunks,
              }),
            }),
          );
          return;
        }

        const orders = result.data?.data || [];
        const pagination = result.data?.meta?.pagination;

        if (orders.length === 0) break;

        console.log(
          `   📋 Chunk ${chunkIdx + 1}/${chunks.length} [${currentChunk.from}→${currentChunk.to}], page ${currentPage}/${pagination?.total_pages || "?"}: ${orders.length} orders`,
        );

        const stats = await processOrdersPage(merchantId, orders, dirtyDates);
        console.log(
          `   📊 Linked=${stats.linked}, Orphan=${stats.orphan}, Delivered=${stats.delivered}, RTO=${stats.rto}, Transit=${stats.inTransit}`,
        );

        pagesProcessedThisRun++;

        const chunkProgress =
          (chunkIdx +
            (pagination
              ? pagination.current_page / pagination.total_pages
              : 1)) /
          chunks.length;
        const percent = 30 + Math.min(60, chunkProgress * 60);
        await updateSyncProgress(merchantId, "SHIPROCKET", percent);

        const hasMorePages =
          pagination && pagination.current_page < pagination.total_pages;

        if (!hasMorePages) break;
        currentPage++;

        // Re-shard every 5 pages to avoid SQS timeout
        if (pagesProcessedThisRun >= 5) {
          console.log(`   🔀 Re-sharding after ${pagesProcessedThisRun} pages`);
          await sqsClient.send(
            new SendMessageCommand({
              QueueUrl: shiprocketQueueUrl,
              MessageBody: JSON.stringify({
                ...job,
                stage: "process",
                chunkIdx,
                page: currentPage,
                currentAffectedDates: Array.from(dirtyDates),
                dateChunks: chunks,
              }),
            }),
          );
          return;
        }
      }

      // Current chunk done → next chunk
      const datesArray = Array.from(dirtyDates);
      if (chunkIdx + 1 < chunks.length) {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shiprocketQueueUrl,
            MessageBody: JSON.stringify({
              ...job,
              stage: "process",
              chunkIdx: chunkIdx + 1,
              page: 1,
              currentAffectedDates: datesArray,
              dateChunks: chunks,
            }),
          }),
        );
      } else {
        // All chunks processed → cleanup
        await updateSyncProgress(merchantId, "SHIPROCKET", 95);
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shiprocketQueueUrl,
            MessageBody: JSON.stringify({
              ...job,
              stage: "cleanup",
              currentAffectedDates: datesArray,
            }),
          }),
        );
      }
      return;
    }

    // ==================================================================
    // STAGE: CLEANUP
    // ==================================================================
    if (stage === "cleanup") {
      await cleanupTempRecords(merchantId, heartbeat);
      await markSyncComplete(merchantId, currentAffectedDates);
      return;
    }
  } catch (e) {
    console.error("❌ Shiprocket Fatal Error:", e.response?.data || e.message);
    throw e;
  }
}

// ======================================================================
// PROGRESS UPDATE
// ======================================================================

async function updateSyncProgress(merchantId, platform, percent) {
  try {
    await newDynamoDB.send(
      new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${merchantId}`,
          SK: `SYNC#${platform.toUpperCase()}`,
        },
        UpdateExpression: "SET #p = :p, updatedAt = :t",
        ExpressionAttributeNames: { "#p": "percent" },
        ExpressionAttributeValues: {
          ":p": Math.round(percent),
          ":t": new Date().toISOString(),
        },
      }),
    );
  } catch (err) {}
}

// ======================================================================
// MARK COMPLETE
// ======================================================================

async function markSyncComplete(merchantId, finalAffectedDates) {
  try {
    await newDynamoDB.send(
      new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#SHIPROCKET` },
        UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t",
        ExpressionAttributeNames: { "#s": "status", "#p": "percent" },
        ExpressionAttributeValues: {
          ":c": "completed",
          ":p": 100,
          ":t": new Date().toISOString(),
        },
      }),
    );

    await newDynamoDB.send(
      new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `INTEGRATION#SHIPROCKET` },
        UpdateExpression: "SET lastSyncTime = :t",
        ExpressionAttributeValues: { ":t": new Date().toISOString() },
      }),
    );

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: summaryQueueUrl,
        MessageBody: JSON.stringify({
          type: "SUMMARY_CALC",
          merchantId,
          affectedDates: finalAffectedDates,
        }),
      }),
    );

    console.log(
      `🏁 Shiprocket DONE for ${merchantId}. Recalculating ${finalAffectedDates.length} dates.`,
    );
  } catch (err) {
    console.error("markSyncComplete Error:", err);
  }
}

// ======================================================================
// QUEUE POLLER (with heartbeat)
// ======================================================================

async function pollQueue() {
  console.log("🚀 [ShiprocketWorker] PRODUCTION Engine v2.0 (High-Scale)...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          WaitTimeSeconds: 20,
          MaxNumberOfMessages: 1,
          VisibilityTimeout: 900,
        }),
      );

      if (!Messages || Messages.length === 0) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      const heartbeat = createHeartbeat(
        message.ReceiptHandle,
        shiprocketQueueUrl,
      );

      await processShiprocketSync(body, heartbeat);

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: shiprocketQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
    } catch (e) {
      if (!isShuttingDown) console.error("❌ Worker Error:", e.message);
      await sleep(5000);
    }
  }
}

process.on("SIGTERM", () => {
  isShuttingDown = true;
  console.log("🛑 Shutting down gracefully...");
});

pollQueue();







// const {
//   ReceiveMessageCommand,
//   DeleteMessageCommand,
//   SendMessageCommand,
// } = require("@aws-sdk/client-sqs");
// const {
//   PutCommand,
//   GetCommand,
//   UpdateCommand,
//   QueryCommand,
//   DeleteCommand,
//   BatchWriteCommand,
// } = require("@aws-sdk/lib-dynamodb");
// const { PutObjectCommand } = require("@aws-sdk/client-s3");
// const {
//   sqsClient,
//   shiprocketQueueUrl,
//   summaryQueueUrl,
//   newDynamoDB,
//   newTableName,
//   s3Client,
//   s3BucketName,
// } = require("../config/aws.config");
// const axios = require("axios");
// const { formatInTimeZone } = require("date-fns-tz");
// const encryptionService = require("../utils/encryption");

// let isShuttingDown = false;

// // ======================================================================
// // CONSTANTS
// // ======================================================================

// const STATUS_CODE_MAP = {
//   1: "NEW",
//   2: "CANCELED",
//   3: "OTHER",
//   4: "READY_TO_SHIP",
//   5: "PICKUP_SCHEDULED",
//   6: "SHIPPED",
//   7: "DELIVERED",
//   8: "UNDELIVERED",
//   9: "RTO",
//   10: "RTO_DELIVERED",
//   11: "PICKUP_GENERATED",
//   12: "PICKUP_QUEUED",
//   13: "OUT_FOR_PICKUP",
//   14: "PICKUP_RESCHEDULED",
//   15: "PICKED_UP",
//   16: "OUT_FOR_DELIVERY",
//   17: "IN_TRANSIT",
//   18: "AWB_ASSIGNED",
//   19: "LABEL_GENERATED",
//   20: "MANIFEST_GENERATED",
//   21: "PICKUP_EXCEPTION",
//   22: "UNDELIVERED_1ST",
//   23: "UNDELIVERED_2ND",
//   24: "UNDELIVERED_3RD",
//   25: "RTO_INITIATED",
//   26: "RTO_ACKNOWLEDGED",
//   27: "RTO_IN_TRANSIT",
//   38: "REACHED_DESTINATION_HUB",
//   42: "MISROUTED",
//   43: "CUSTOMER_NOT_AVAILABLE",
//   44: "ADDRESS_INCORRECT",
//   45: "DELAYED",
//   46: "PARTIAL_DELIVERED",
//   47: "OUT_FOR_DELIVERY_TODAY",
//   48: "HANDED_OVER",
// };

// const BATCH_SIZE = 25; // DynamoDB BatchWrite limit
// const PER_PAGE = 100; // Shiprocket max per page
// const API_DELAY = 250; // Rate limiting (250ms between calls)

// // ======================================================================
// // HELPERS
// // ======================================================================

// const RATE_LIMIT = {
//   REQUESTS_PER_MINUTE: 30, // Conservative (leaving buffer)
//   DELAY_MS: 2000,          // 2 seconds between requests
//   BURST_DELAY_MS: 5000,    // 5 seconds after rate limit error
// };

// const CHUNK_CONFIG = {
//   MAX_DAYS: 30,           // Shiprocket /shipments API limit
//   PER_PAGE: 100,          // Max items per page
//   MAX_RETRIES: 3,         // Per failed request
//   BATCH_FLUSH_SIZE: 50,   // DB batch write size
//   MEMORY_FLUSH_SIZE: 500, // Flush to DB when array exceeds
// };

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// const normalizeOrderName = (name) => {
//   if (!name) return "";
//   return String(name)
//     .replace(/^#/, "")
//     .replace(/-[A-Z]$/i, "")
//     .trim()
//     .toLowerCase();
// };

// const parseShiprocketDate = (dateStr) => {
//   if (!dateStr || dateStr === "0000-00-00 00:00:00") return null;
//   const clean = String(dateStr).replace(/(\d+)(st|nd|rd|th)/, "$1");
//   const d = new Date(clean);
//   if (isNaN(d.getTime())) return null;
//   return formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd");
// };

// const getNormalizedStatus = (status) => {
//   if (!status) return "UNKNOWN";
//   let textStatus = status;
//   if (
//     typeof status === "number" ||
//     (!isNaN(Number(status)) && String(status).trim() !== "")
//   ) {
//     textStatus = STATUS_CODE_MAP[Number(status)] || String(status);
//   }
//   const s = String(textStatus).toLowerCase();
//   if (s.includes("rto")) return "RTO";
//   if (s.includes("delivered") && !s.includes("rto")) return "DELIVERED";
//   if (s.includes("cancel")) return "CANCELLED";
//   return "IN_TRANSIT";
// };

// // ======================================================================
// // BATCH DB WRITER (Production-grade)
// // ======================================================================

// async function batchWriteItems(items) {
//   if (items.length === 0) return;

//   const chunks = [];
//   for (let i = 0; i < items.length; i += BATCH_SIZE) {
//     chunks.push(items.slice(i, i + BATCH_SIZE));
//   }

//   for (const chunk of chunks) {
//     let retries = 3;
//     let unprocessed = chunk.map((item) => ({ PutRequest: { Item: item } }));

//     while (unprocessed.length > 0 && retries > 0) {
//       try {
//         const res = await newDynamoDB.send(
//           new BatchWriteCommand({
//             RequestItems: { [newTableName]: unprocessed },
//           }),
//         );

//         unprocessed = res.UnprocessedItems?.[newTableName] || [];
//         if (unprocessed.length > 0) {
//           await sleep(500);
//           retries--;
//         }
//       } catch (err) {
//         console.error("Batch write error:", err.message);
//         retries--;
//         await sleep(1000);
//       }
//     }
//   }
// }

// async function batchDeleteItems(keys) {
//   if (keys.length === 0) return;

//   const chunks = [];
//   for (let i = 0; i < keys.length; i += BATCH_SIZE) {
//     chunks.push(keys.slice(i, i + BATCH_SIZE));
//   }

//   for (const chunk of chunks) {
//     try {
//       await newDynamoDB.send(
//         new BatchWriteCommand({
//           RequestItems: {
//             [newTableName]: chunk.map((key) => ({
//               DeleteRequest: { Key: key },
//             })),
//           },
//         }),
//       );
//     } catch (err) {
//       console.error("Batch delete error:", err.message);
//     }
//   }
// }

// // ======================================================================
// // STAGE 1: COLLECT SHIPMENTS (Store as TEMP records)
// // ======================================================================

// async function collectShipments(merchantId, token, fromStr, toStr) {
//   console.log(`💾 [Stage 1] Collecting /shipments data...`);

//   let page = 1;
//   let totalCollected = 0;
//   const itemsToWrite = [];

//   while (true) {
//     try {
//       const res = await axios.get(
//         "https://apiv2.shiprocket.in/v1/external/shipments",
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           params: { from: fromStr, to: toStr, page, per_page: PER_PAGE },
//           timeout: 30000,
//         },
//       );

//       const shipments = res.data?.data || [];
//       if (shipments.length === 0) break;

//       for (const ship of shipments) {
//         if (!ship.order_id) continue;

//         itemsToWrite.push({
//           PK: `MERCHANT#${merchantId}`,
//           SK: `TEMP_SHIPMENT#${ship.order_id}`,
//           entityType: "TEMP_SHIPMENT",
//           srOrderId: String(ship.order_id),
//           textStatus: ship.status,
//           charges: ship.charges || {},
//           delivered_date: ship.delivered_date || null,
//           rto_delivered_date: ship.rto_delivered_date || null,
//           awb: ship.awb || "",
//           courier: ship.courier_name || "",
//           ttl: Math.floor(Date.now() / 1000) + 3600, // Auto-cleanup after 1 hour
//         });

//         if (itemsToWrite.length >= 100) {
//           await batchWriteItems(itemsToWrite.splice(0, 100));
//         }
//       }

//       totalCollected += shipments.length;
//       console.log(`   📦 Collected ${totalCollected} shipments (page ${page})`);

//       const pagination = res.data?.meta?.pagination;
//       if (!pagination || pagination.current_page >= pagination.total_pages)
//         break;

//       page++;
//       await sleep(API_DELAY);
//     } catch (err) {
//       if (err.response?.status === 400 && page > 1) {
//         console.log(`   ℹ️ /shipments exhausted at page ${page}`);
//         break;
//       }
//       console.warn(
//         `   ⚠️ /shipments page ${page}:`,
//         err.response?.status || err.message,
//       );
//       break;
//     }
//   }

//   // Final flush
//   if (itemsToWrite.length > 0) {
//     await batchWriteItems(itemsToWrite);
//   }

//   console.log(`   ✅ Stage 1 Done: ${totalCollected} shipments in TEMP table`);
//   return totalCollected;
// }

// // ======================================================================
// // STAGE 2: FETCH ONE PAGE OF ORDERS
// // ======================================================================

// async function fetchOrdersPage(token, fromStr, toStr, page) {
//   const res = await axios.get(
//     "https://apiv2.shiprocket.in/v1/external/orders",
//     {
//       headers: { Authorization: `Bearer ${token}` },
//       params: { from: fromStr, to: toStr, page, per_page: PER_PAGE },
//       timeout: 30000,
//     },
//   );
//   return {
//     orders: res.data?.data || [],
//     pagination: res.data?.meta?.pagination,
//   };
// }

// // ======================================================================
// // STAGE 2: LOOKUP TEMP SHIPMENT DATA
// // ======================================================================

// async function getTempShipment(merchantId, srOrderId) {
//   try {
//     const res = await newDynamoDB.send(
//       new GetCommand({
//         TableName: newTableName,
//         Key: {
//           PK: `MERCHANT#${merchantId}`,
//           SK: `TEMP_SHIPMENT#${srOrderId}`,
//         },
//       }),
//     );
//     return res.Item || null;
//   } catch (err) {
//     return null;
//   }
// }

// // ======================================================================
// // STAGE 2: LOOKUP SHOPIFY ORDER (via GSI)
// // ======================================================================

// async function getShopifyOrder(merchantId, normalizedName) {
//   try {
//     const res = await newDynamoDB.send(
//       new QueryCommand({
//         TableName: newTableName,
//         IndexName: "normalizedOrderNameGSI",
//         KeyConditionExpression: "PK = :pk AND normalizedOrderName = :sk",
//         ExpressionAttributeValues: {
//           ":pk": `MERCHANT#${merchantId}`,
//           ":sk": normalizedName,
//         },
//         Limit: 1,
//       }),
//     );
//     return res.Items?.[0] || null;
//   } catch (err) {
//     return null;
//   }
// }

// // ======================================================================
// // STAGE 2: PROCESS ONE PAGE OF ORDERS
// // ======================================================================

// async function processOrdersPage(merchantId, srOrders, dirtyDates) {
//   const shipmentItems = [];
//   const orderUpdates = [];
//   const stats = { linked: 0, orphan: 0, delivered: 0, rto: 0, inTransit: 0 };

//   for (const srOrder of srOrders) {
//     try {
//       const channelOrderId = srOrder.channel_order_id;
//       if (!channelOrderId) continue;

//       const shipmentData = srOrder.shipments?.[0] || {};
//       const shipmentId = shipmentData.id || srOrder.id;

//       // Get TEMP shipment data (has real charges + text status)
//       const enriched = (await getTempShipment(merchantId, srOrder.id)) || {};

//       const rawStatus =
//         enriched.textStatus ||
//         STATUS_CODE_MAP[Number(shipmentData.status)] ||
//         srOrder.status ||
//         "UNKNOWN";

//       const deliveryStatus = getNormalizedStatus(rawStatus);
//       const shipActivityDateIST = parseShiprocketDate(srOrder.updated_at);
//       const deliveredAtIST = parseShiprocketDate(
//         enriched.delivered_date || shipmentData.delivered_date,
//       );
//       const rtoAtIST = parseShiprocketDate(
//         enriched.rto_delivered_date || shipmentData.rto_delivered_date,
//       );

//       const normalizedName = normalizeOrderName(channelOrderId);

//       // Lookup Shopify order
//       const order = await getShopifyOrder(merchantId, normalizedName);

//       let orderCreatedDateIST = null;
//       let orderNetRevenue = 0;
//       let orderCogs = 0;
//       let paymentType = "unknown";
//       let codPart = 0;
//       let isOrphan = false;

//       if (order) {
//         stats.linked++;
//         orderCreatedDateIST = order.orderCreatedAtIST;
//         orderNetRevenue = order.netRevenue || 0;
//         orderCogs = order.totalCogs || 0;
//         paymentType = order.paymentType || "unknown";
//         codPart = order.codAmount || 0;

//         if (orderCreatedDateIST) dirtyDates.add(orderCreatedDateIST);
//         if (deliveryStatus === "RTO" && rtoAtIST) dirtyDates.add(rtoAtIST);

//         if (deliveryStatus === "DELIVERED" && deliveredAtIST) {
//           dirtyDates.add(deliveredAtIST);
//           stats.delivered++;

//           if (!order.isRealized || !order.deliveredAtIST) {
//             orderUpdates.push({
//               PK: order.PK,
//               SK: order.SK,
//               deliveredAtIST,
//             });
//           }
//         } else if (deliveryStatus === "RTO") {
//           stats.rto++;
//         } else if (deliveryStatus === "IN_TRANSIT") {
//           stats.inTransit++;
//         }
//       } else {
//         isOrphan = true;
//         stats.orphan++;
//       }

//       const charges = enriched.charges || {};
//       const freight = Number(charges.freight_charges || 0);
//       const rtoFreight = Number(
//         charges.applied_weight_amount_rto || charges.rto_charges || 0,
//       );
//       const totalPaid = Number(
//         (freight + (deliveryStatus === "RTO" ? rtoFreight : 0)).toFixed(2),
//       );

//       shipmentItems.push({
//         PK: `MERCHANT#${merchantId}`,
//         SK: `SHIPMENT#${shipmentId}`,
//         shopifyOrderName: String(channelOrderId),
//         normalizedOrderName: normalizedName,
//         entityType: "SHIPMENT",
//         shipmentId: String(shipmentId),
//         srOrderId: String(srOrder.id),
//         orderCreatedAtIST: orderCreatedDateIST,
//         paymentType,
//         netRevenue: orderNetRevenue,
//         totalCogs: orderCogs,
//         codAmount: codPart,
//         shippingFee: freight,
//         returnFee: deliveryStatus === "RTO" ? rtoFreight : 0,
//         totalShippingPaid: totalPaid,
//         deliveryStatus,
//         rawStatus,
//         awb: enriched.awb || "",
//         courier: enriched.courier || "",
//         shipActivityDateIST,
//         deliveredAtIST,
//         rtoAtIST,
//         isOrphan,
//         updatedAt: new Date().toISOString(),
//       });
//     } catch (err) {
//       console.error(`   ⚠️ Skip ${srOrder.id}:`, err.message);
//     }
//   }

//   // Batch write shipments
//   await batchWriteItems(shipmentItems);

//   // Update orders as delivered (sequential — these are fewer)
//   for (const update of orderUpdates) {
//     try {
//       await newDynamoDB.send(
//         new UpdateCommand({
//           TableName: newTableName,
//           Key: { PK: update.PK, SK: update.SK },
//           UpdateExpression:
//             "SET isRealized = :true, deliveredAtIST = :delDate, orderStatus = :stat, updatedAt = :updatedAt",
//           ExpressionAttributeValues: {
//             ":true": true,
//             ":delDate": update.deliveredAtIST,
//             ":stat": "DELIVERED",
//             ":updatedAt": new Date().toISOString(),
//           },
//         }),
//       );
//     } catch (err) {
//       console.error("Order update error:", err.message);
//     }
//   }

//   return stats;
// }

// // ======================================================================
// // STAGE 3: CLEANUP TEMP RECORDS
// // ======================================================================

// async function cleanupTempRecords(merchantId) {
//   console.log("🧹 [Stage 3] Cleaning TEMP records...");
//   let lastKey;
//   let totalDeleted = 0;
//   const keysToDelete = [];

//   do {
//     const res = await newDynamoDB.send(
//       new QueryCommand({
//         TableName: newTableName,
//         KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
//         ExpressionAttributeValues: {
//           ":pk": `MERCHANT#${merchantId}`,
//           ":sk": "TEMP_SHIPMENT#",
//         },
//         ProjectionExpression: "PK, SK",
//         ExclusiveStartKey: lastKey,
//       }),
//     );

//     for (const item of res.Items || []) {
//       keysToDelete.push({ PK: item.PK, SK: item.SK });
//       if (keysToDelete.length >= 100) {
//         await batchDeleteItems(keysToDelete.splice(0, 100));
//         totalDeleted += 100;
//       }
//     }

//     lastKey = res.LastEvaluatedKey;
//   } while (lastKey);

//   if (keysToDelete.length > 0) {
//     await batchDeleteItems(keysToDelete);
//     totalDeleted += keysToDelete.length;
//   }

//   console.log(`   ✅ Deleted ${totalDeleted} TEMP records`);
// }

// // ======================================================================
// // MAIN JOB PROCESSOR
// // ======================================================================

// async function processShiprocketSync(job) {
//   const {
//     merchantId,
//     sinceDate,
//     mode = "full",
//     stage = "collect", // 🟢 State machine: collect → process → cleanup
//     page = 1,
//     currentAffectedDates = [],
//   } = job;

//   try {
//     // Load integration
//     const integrationRes = await newDynamoDB.send(
//       new GetCommand({
//         TableName: newTableName,
//         Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHIPROCKET" },
//       }),
//     );
//     const integration = integrationRes.Item;
//     if (!integration) return;
//     const token = encryptionService.decrypt(integration.token);

//     const today = new Date();
//     const startDateObj =
//       mode === "incremental"
//         ? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
//         : new Date(sinceDate);
//     const fromStr = startDateObj.toISOString().split("T")[0];
//     const toStr = today.toISOString().split("T")[0];

//     console.log(
//       `📦 [Shiprocket] ${merchantId} | Stage: ${stage} | Page ${page}`,
//     );

//     // ==================================================================
//     // STAGE: COLLECT
//     // ==================================================================
//     if (stage === "collect") {
//       await updateSyncProgress(merchantId, "SHIPROCKET", 10);
//       await collectShipments(merchantId, token, fromStr, toStr);
//       await updateSyncProgress(merchantId, "SHIPROCKET", 30);

//       // Move to PROCESS stage
//       await sqsClient.send(
//         new SendMessageCommand({
//           QueueUrl: shiprocketQueueUrl,
//           MessageBody: JSON.stringify({
//             ...job,
//             stage: "process",
//             page: 1,
//           }),
//         }),
//       );
//       return;
//     }

//     // ==================================================================
//     // STAGE: PROCESS
//     // ==================================================================
//     if (stage === "process") {
//       const { orders, pagination } = await fetchOrdersPage(
//         token,
//         fromStr,
//         toStr,
//         page,
//       );

//       console.log(
//         `   📋 Processing ${orders.length} orders (page ${page}/${pagination?.total_pages || "?"})`,
//       );

//       const dirtyDates = new Set(currentAffectedDates);
//       const stats = await processOrdersPage(merchantId, orders, dirtyDates);

//       console.log(
//         `   📊 Page ${page}: Linked=${stats.linked}, Orphan=${stats.orphan}, Delivered=${stats.delivered}, RTO=${stats.rto}, Transit=${stats.inTransit}`,
//       );

//       const hasMore =
//         pagination && pagination.current_page < pagination.total_pages;
//       const datesArray = Array.from(dirtyDates);

//       if (hasMore && orders.length > 0) {
//         const percent =
//           30 +
//           Math.min(60, (pagination.current_page / pagination.total_pages) * 60);
//         await updateSyncProgress(merchantId, "SHIPROCKET", percent);

//         await sqsClient.send(
//           new SendMessageCommand({
//             QueueUrl: shiprocketQueueUrl,
//             MessageBody: JSON.stringify({
//               ...job,
//               stage: "process",
//               page: page + 1,
//               currentAffectedDates: datesArray,
//             }),
//           }),
//         );
//       } else {
//         // Move to CLEANUP stage
//         await updateSyncProgress(merchantId, "SHIPROCKET", 95);
//         await sqsClient.send(
//           new SendMessageCommand({
//             QueueUrl: shiprocketQueueUrl,
//             MessageBody: JSON.stringify({
//               ...job,
//               stage: "cleanup",
//               currentAffectedDates: datesArray,
//             }),
//           }),
//         );
//       }
//       return;
//     }

//     // ==================================================================
//     // STAGE: CLEANUP
//     // ==================================================================
//     if (stage === "cleanup") {
//       await cleanupTempRecords(merchantId);
//       await markSyncComplete(merchantId, currentAffectedDates);
//       return;
//     }
//   } catch (e) {
//     console.error("❌ Shiprocket Fatal Error:", e.response?.data || e.message);
//     throw e;
//   }
// }

// // ======================================================================
// // PROGRESS UPDATE
// // ======================================================================

// async function updateSyncProgress(merchantId, platform, percent) {
//   try {
//     await newDynamoDB.send(
//       new UpdateCommand({
//         TableName: newTableName,
//         Key: {
//           PK: `MERCHANT#${merchantId}`,
//           SK: `SYNC#${platform.toUpperCase()}`,
//         },
//         UpdateExpression: "SET #p = :p, updatedAt = :t",
//         ExpressionAttributeNames: { "#p": "percent" },
//         ExpressionAttributeValues: {
//           ":p": Math.round(percent),
//           ":t": new Date().toISOString(),
//         },
//       }),
//     );
//   } catch (err) {}
// }

// // ======================================================================
// // MARK COMPLETE
// // ======================================================================

// async function markSyncComplete(merchantId, finalAffectedDates) {
//   try {
//     await newDynamoDB.send(
//       new UpdateCommand({
//         TableName: newTableName,
//         Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#SHIPROCKET` },
//         UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t",
//         ExpressionAttributeNames: { "#s": "status", "#p": "percent" },
//         ExpressionAttributeValues: {
//           ":c": "completed",
//           ":p": 100,
//           ":t": new Date().toISOString(),
//         },
//       }),
//     );

//     await newDynamoDB.send(
//       new UpdateCommand({
//         TableName: newTableName,
//         Key: { PK: `MERCHANT#${merchantId}`, SK: `INTEGRATION#SHIPROCKET` },
//         UpdateExpression: "SET lastSyncTime = :t",
//         ExpressionAttributeValues: { ":t": new Date().toISOString() },
//       }),
//     );

//     await sqsClient.send(
//       new SendMessageCommand({
//         QueueUrl: summaryQueueUrl,
//         MessageBody: JSON.stringify({
//           type: "SUMMARY_CALC",
//           merchantId,
//           affectedDates: finalAffectedDates,
//         }),
//       }),
//     );

//     console.log(
//       `🏁 Shiprocket DONE for ${merchantId}. Recalculating ${finalAffectedDates.length} dates.`,
//     );
//   } catch (err) {
//     console.error("markSyncComplete Error:", err);
//   }
// }

// // ======================================================================
// // QUEUE POLLER
// // ======================================================================

// async function pollQueue() {
//   console.log("🚀 [ShiprocketWorker] PRODUCTION Engine Active...");
//   while (!isShuttingDown) {
//     try {
//       const { Messages } = await sqsClient.send(
//         new ReceiveMessageCommand({
//           QueueUrl: shiprocketQueueUrl,
//           WaitTimeSeconds: 20,
//           MaxNumberOfMessages: 1,
//           VisibilityTimeout: 900, // 🟢 15 minutes for large datasets
//         }),
//       );

//       if (!Messages || Messages.length === 0) continue;
//       const message = Messages[0];
//       const body = JSON.parse(message.Body);

//       await processShiprocketSync(body);

//       await sqsClient.send(
//         new DeleteMessageCommand({
//           QueueUrl: shiprocketQueueUrl,
//           ReceiptHandle: message.ReceiptHandle,
//         }),
//       );
//     } catch (e) {
//       if (!isShuttingDown) console.error("❌ Worker Error:", e.message);
//       await sleep(5000);
//     }
//   }
// }

// // Graceful shutdown
// process.on("SIGTERM", () => {
//   isShuttingDown = true;
//   console.log("🛑 Shutting down gracefully...");
// });

// pollQueue();
