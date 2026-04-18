const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} = require("@aws-sdk/client-sqs");

const {
  PutCommand,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { formatInTimeZone } = require("date-fns-tz");

const {
  sqsClient,
  shopifyQueueUrl,
  metaQueueUrl,
  newDynamoDB,
  newTableName,
  s3Client,
  s3BucketName,
} = require("../config/aws.config");

const shopifyUtil = require("../utils/shopify.util");
const logger = require("../utils/logger.js");
const dynamoDBService = require("../services/dynamodb.service");

let isShuttingDown = false;

/**
 * 🟢 SQS POLLER
 */
const pollQueue = async () => {
  console.log("🚀 [ShopifyWorker] Sync Engine Active...");

  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: shopifyQueueUrl,
          WaitTimeSeconds: 20,
          MaxNumberOfMessages: 1,
        })
      );

      if (!Messages || Messages.length === 0) continue;

      const message = Messages[0];

      // ✅ SAFE JSON PARSE
      let body;
      try {
        body = JSON.parse(message.Body);
      } catch (err) {
        console.error("❌ Invalid SQS message:", message.Body);
        continue;
      }

      if (body.type === "DISPATCH_DAILY_SYNC") {
        console.log("⏰ Nightly Alarm: Initiating Global Sweep...");
        await startIncrementalSyncForAll();
      } else if (body.type === "SHOPIFY_SYNC") {
        await processOrders(body);
      }

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: shopifyQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
      );

    } catch (e) {
      if (!isShuttingDown) {
        console.error("❌ Worker Error:", e);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
};

/**
 * 🕵️ MANAGER: Fetch all active Shopify integrations
 */
async function startIncrementalSyncForAll() {
  try {
    console.log("📡 [Manager] Querying GSI1...");

    let lastKey = undefined;
    let count = 0;

    do {
      const params = {
        TableName: newTableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        FilterExpression: "entityType = :type AND platform = :p AND #s = :active",
        ExpressionAttributeNames: {
          "#s": "status",
        },
        ExpressionAttributeValues: {
          ":pk": "INTEGRATION",
          ":type": "INTEGRATION",
          ":p": "shopify",
          ":active": "active",
        },
      };

      if (lastKey) params.ExclusiveStartKey = lastKey;

      const res = await newDynamoDB.send(new QueryCommand(params));
      const items = res?.Items || [];

      console.log("Items count:", items.length);

      for (const item of items) {
        if (!item?.PK || !item.PK.startsWith("MERCHANT#")) continue;

        const merchantId = item.PK.split("#")[1];

        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shopifyQueueUrl,
            MessageBody: JSON.stringify({
              type: "SHOPIFY_SYNC",
              merchantId,
              mode: "incremental",
              sinceDate: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            }),
          })
        );

        count++;
      }

      lastKey = res.LastEvaluatedKey;

    } while (lastKey);

    console.log(`✅ Dispatched sync for ${count} merchants`);

  } catch (err) {
    console.error("❌ Manager Error:", err);
    logger.logError("SYSTEM", "MANAGER", err, "DISPATCH_DAILY_SYNC");
  }
}

/**
 * 🛠️ WORKER: Process Shopify Orders
 */
const processOrders = async (job) => {
  const syncStartTime = new Date().toISOString();

  const {
    merchantId,
    sinceDate,
    cursor = null,
    mode = "full",
    pageCount = 1,
    currentAffectedDates = [],
  } = job;

  try {
    const [variants, integrationRes] = await Promise.all([
      dynamoDBService.getVariantsByMerchant(merchantId),
      newDynamoDB.send(
        new GetCommand({
          TableName: newTableName,
          Key: {
            PK: `MERCHANT#${merchantId}`,
            SK: "INTEGRATION#SHOPIFY",
          },
        })
      ),
    ]);

    const integration = integrationRes.Item;
    if (!integration) {
      console.warn(`⚠️ No integration for ${merchantId}`);
      return;
    }

    const costMap = {};
    variants?.data?.forEach((v) => {
      const id = v.variantId?.split("/").pop();
      if (id) costMap[id] = v.costPrice || 0;
    });

    let queryStr = `created_at:>=${sinceDate}`;

    if (mode === "incremental" && integration.lastSyncTime) {
      const buffer = new Date(
        new Date(integration.lastSyncTime).getTime() - 15 * 60000
      ).toISOString();

      queryStr = `updated_at:>=${buffer}`;
    }

    queryStr += " AND test:false";

    const data = await shopifyUtil.fetchShopifyOrders(
      integration.shopifyStore,
      integration.accessToken,
      queryStr,
      cursor
    );

    if (!data?.edges) return;

    const affectedDates = new Set(currentAffectedDates);

    for (const { node: order } of data.edges) {
      try {
        const orderId = order?.id?.split("/").pop();
        if (!orderId) continue;

        const dateIST = formatInTimeZone(
          new Date(order.createdAt),
          "Asia/Kolkata",
          "yyyy-MM-dd"
        );

        affectedDates.add(dateIST);

        // S3 backup
        await s3Client.send(
          new PutObjectCommand({
            Bucket: s3BucketName,
            Key: `${merchantId}/orders/${orderId}.json`,
            Body: JSON.stringify(order),
            ContentType: "application/json",
          })
        );

        const totalPrice = Number(order.totalPriceSet?.shopMoney?.amount || 0);
        const discounts = Number(order.totalDiscountsSet?.shopMoney?.amount || 0);

        const refunds = (order.refunds || []).reduce((sum, r) => {
          const items = r.refundLineItems?.edges || r.refundLineItems || [];
          return sum + items.reduce(
            (rs, item) =>
              rs + Number((item.node || item).subtotalSet?.shopMoney?.amount || 0),
            0
          );
        }, 0);

        let totalCogs = 0;

        const lineItems = order.lineItems.edges.map(({ node: li }) => {
          const vId = li.variant?.id?.split("/").pop();
          const cost = costMap[vId] || 0;

          totalCogs += cost * li.quantity;

          return {
            variantId: vId,
            quantity: li.quantity,
            cogsAtSale: cost,
            price: Number(li.discountedUnitPriceSet?.shopMoney?.amount || 0),
          };
        });

        // ✅ SAFE ITEM (NO undefined)
        const safeItem = JSON.parse(JSON.stringify({
          PK: `MERCHANT#${merchantId}`,
          SK: `ORDER#${orderId}`,
          entityType: "ORDER",
          orderId,
          orderName: order.name || "",
          totalPrice,
          discounts,
          refunds,
          netRevenue: totalPrice - discounts - refunds,
          paymentType: (order.paymentGatewayNames || []).some((g) =>
            g?.toLowerCase().includes("cash")
          )
            ? "cod"
            : "prepaid",
          status: order.displayFinancialStatus
            ? order.displayFinancialStatus.toLowerCase()
            : "unknown",
          isCancelled: !!order.cancelledAt,
          totalCogs: Number(totalCogs.toFixed(2)),
          lineItems,
          orderCreatedAt: order.createdAt || null,
          updatedAt: new Date().toISOString(),
        }));

        await newDynamoDB.send(
          new PutCommand({
            TableName: newTableName,
            Item: safeItem,
          })
        );

      } catch (err) {
        console.error("⚠️ Order skip:", err.message);
      }
    }

    const datesArray = Array.from(affectedDates);

    if (data.pageInfo.hasNextPage) {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shopifyQueueUrl,
          MessageBody: JSON.stringify({
            ...job,
            cursor: data.pageInfo.endCursor,
            pageCount: pageCount + 1,
            currentAffectedDates: datesArray,
          }),
        })
      );
    } else {
      await dynamoDBService.updateSyncWatermark(merchantId, "SHOPIFY", {
        lastOrderId: data.edges[data.edges.length - 1]?.node.id.split("/").pop(),
        syncTime: syncStartTime,
      });

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: metaQueueUrl,
          MessageBody: JSON.stringify({
            type: "META_SYNC",
            merchantId,
            sinceDate,
            mode,
            affectedDates: datesArray,
          }),
        })
      );

      console.log(`✅ [Shopify] Done. Dates: ${datesArray.length}`);
    }

  } catch (e) {
    logger.logError(merchantId, "SHOPIFY", e, "INCREMENTAL_SYNC");
    throw e;
  }
};

// 🚀 START
pollQueue();