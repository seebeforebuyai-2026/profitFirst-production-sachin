const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} = require("@aws-sdk/client-sqs");
const {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
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
 * 🟢 SQS POLLING LOOP
 */
const pollQueue = async () => {
  console.log("🚀 [ShopifyWorker] Sync Engine Active and Listening...");

  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: shopifyQueueUrl,
          WaitTimeSeconds: 20,
          MaxNumberOfMessages: 1,
        }),
      );

      if (!Messages || Messages.length === 0) continue;

      const message = Messages[0];
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
        }),
      );
    } catch (e) {
      if (!isShuttingDown) {
        console.error("❌ Worker Error:", e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
};

/**
 * 🕵️ MANAGER: Start Sync for all active merchants
 */
async function startIncrementalSyncForAll() {
  try {
    console.log("📡 [Manager] Querying GSI1 for active integrations...");
    let lastKey = undefined;
    let count = 0;

    do {
      const params = {
        TableName: newTableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        FilterExpression: "platform = :p AND #s = :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":pk": "INTEGRATION",
          ":p": "shopify",
          ":active": "active",
        },
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      };

      const res = await newDynamoDB.send(new QueryCommand(params));
      const items = res?.Items || [];

      for (const item of items) {
        if (!item?.PK) continue;
        const merchantId = item.PK.split("#")[1];

        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shopifyQueueUrl,
            MessageBody: JSON.stringify({
              type: "SHOPIFY_SYNC",
              merchantId,
              mode: "incremental",
              sinceDate: new Date(
                Date.now() - 168 * 60 * 60 * 1000,
              ).toISOString(),
            }),
          }),
        );
        count++;
      }
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Dispatched sync for ${count} merchants`);
  } catch (err) {
    console.error("❌ Manager Error:", err.message);
  }
}

/**
 * 🛠️ WORKER LOGIC
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
    console.log(`🔍 [ShopifyWorker] Processing ${merchantId} | Mode: ${mode}`);

    const [variantsRes, integrationRes] = await Promise.all([
      dynamoDBService.getVariantsByMerchant(merchantId),
      newDynamoDB.send(
        new GetCommand({
          TableName: newTableName,
          Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHOPIFY" },
        }),
      ),
    ]);

    const integration = integrationRes.Item;
    if (!integration) return;

    const costMap = {};
    variantsRes.data?.forEach((v) => {
      const id = v.variantId?.split("/").pop();
      if (id) costMap[id] = v.costPrice || 0;
    });

    let queryStr = `created_at:>=${sinceDate}`;
    if (mode === "incremental" && integration.lastSyncTime) {
      const buffer = new Date(
        new Date(integration.lastSyncTime).getTime() - 15 * 60000,
      ).toISOString();
      queryStr = `updated_at:>=${buffer}`;
    }
    queryStr += " AND test:false";

    const data = await shopifyUtil.fetchShopifyOrders(
      integration.shopifyStore,
      integration.accessToken,
      queryStr,
      cursor,
    );
    if (!data?.edges) return;

    const affectedDates = new Set(currentAffectedDates);

    for (const { node: order } of data.edges) {
      try {
        const orderId = order.id.split("/").pop();
        const dateIST = formatInTimeZone(
          new Date(order.createdAt),
          "Asia/Kolkata",
          "yyyy-MM-dd",
        );
        affectedDates.add(dateIST);

        // 1. Financial Constants from API
        const totalPrice = Number(order.totalPriceSet?.shopMoney?.amount || 0);

        const amountPaidAtOrder = Number(
          order.totalReceivedSet?.shopMoney?.amount || 0,
        );

        const outstanding = Number(
          order.totalOutstandingSet?.shopMoney?.amount || 0,
        );

        const discounts = Number(
          order.totalDiscountsSet?.shopMoney?.amount || 0,
        );

        const financialStatus =
          order.displayFinancialStatus?.toLowerCase() || "unknown";

        // 2. Refund Logic
        const refundsProductOnly = (order.refunds || []).reduce((sum, r) => {
          const items = r.refundLineItems?.edges || r.refundLineItems || [];

          return (
            sum +
            items.reduce(
              (rSum, item) =>
                rSum +
                Number((item.node || item).subtotalSet?.shopMoney?.amount || 0),
              0,
            )
          );
        }, 0);
        const netAmount = totalPrice - discounts - refundsProductOnly;

        let prepaidAmount = 0;
        let codAmount = 0;
        let paymentType = "COD";

        const statusUpper = (order.displayFinancialStatus || "").toUpperCase();
        const gateways = (order.paymentGatewayNames || [])
          .join(" ")
          .toLowerCase();

        const isPPCOD = gateways.includes("ppcod") || gateways.includes("cod");

        if (statusUpper === "PAID") {
          paymentType = "PREPAID";
          prepaidAmount = netAmount;
          codAmount = 0;
        } else if (statusUpper === "PARTIALLY_PAID") {
          paymentType = "PARTIAL_COD";
          codAmount = outstanding > 0 ? outstanding : netAmount * 0.85; // fallback 85%
          prepaidAmount = netAmount - codAmount;
        } else if (statusUpper === "PENDING") {
          paymentType = "COD";
          prepaidAmount = 0;
          codAmount = netAmount;
        } else if (statusUpper === "REFUNDED" || statusUpper === "VOIDED") {
          paymentType = "REFUNDED";
          prepaidAmount = 0;
          codAmount = 0;
        } else {
          paymentType = isPPCOD ? "PARTIAL_COD" : "COD";
          prepaidAmount = 0;
          codAmount = netAmount;
        }

        // 4. Realization Logic
        // Prepaid and Partial Advance are considered "Realized" on Order Date
        let isRealized =
          paymentType === "PREPAID" || paymentType === "PARTIAL_COD";

        // 5. COGS Stamping
        let totalCogs = 0;
        const lineItems = order.lineItems.edges.map(({ node: li }) => {
          const vId = li.variant?.id?.split("/").pop();
          const cost = costMap[vId] || 0;
          totalCogs += cost * li.quantity;
          return {
            title: li.title || "",
            variantId: vId,
            quantity: li.quantity,
            cogsAtSale: cost,
            price: Number(li.discountedUnitPriceSet?.shopMoney?.amount || 0),
          };
        });

        const safeItem = JSON.parse(
          JSON.stringify({
            PK: `MERCHANT#${merchantId}`,
            SK: `ORDER#${orderId}`,
            entityType: "ORDER",
            orderId,
            orderName: order.name || "",
            normalizedOrderName: (order.name || "").replace(/^#/, "").trim().toLowerCase(),
            totalPrice,
            discounts,
            tax: Number(order.totalTaxSet?.shopMoney?.amount || 0),
            refunds: refundsProductOnly,
            netRevenue: Number(netAmount.toFixed(2)),
            totalCogs: Number(totalCogs.toFixed(2)),

            // Realization Data
            paymentType,
            financialStatus,
            isCOD: paymentType === "COD",
            isPrepaid: paymentType === "PREPAID",

            prepaidAmount: Number(prepaidAmount.toFixed(2)),
            codAmount: Number(codAmount.toFixed(2)),
            outstandingAmount: Number(outstanding.toFixed(2)),
            isRealized,
            orderCreatedAtIST: dateIST,
            status: order.displayFinancialStatus?.toLowerCase(),
            isCancelled: !!order.cancelledAt,
            lineItems,
            orderCreatedAt: order.createdAt,
            updatedAt: new Date().toISOString(),
            s3RawUrl: `s3://${s3BucketName}/${merchantId}/orders/${orderId}.json`,
          }),
        );

        await newDynamoDB.send(
          new PutCommand({ TableName: newTableName, Item: safeItem }),
        );
      } catch (err) {
        console.error(`⚠️ Order skip:`, err.message);
      }
    }

    const datesArray = Array.from(affectedDates);

    if (data.pageInfo.hasNextPage) {
      await updateSyncProgress(
        merchantId,
        "SHOPIFY",
        Math.min(95, pageCount * 10),
      );
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shopifyQueueUrl,
          MessageBody: JSON.stringify({
            ...job,
            cursor: data.pageInfo.endCursor,
            pageCount: pageCount + 1,
            currentAffectedDates: datesArray,
          }),
        }),
      );
    } else {
      await markSyncComplete(
        merchantId,
        "SHOPIFY",
        syncStartTime,
        datesArray,
        sinceDate,
        mode,
      );
    }
  } catch (e) {
    logger.logError(merchantId, "SHOPIFY", e, "SYNC_PROCESS");
    throw e;
  }
};

/**
 * 🟢 HELPER: Update Sync Progress in DynamoDB
 */
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
  } catch (err) {
    console.error("Update Progress Error:", err.message);
  }
}

/**
 * 🟢 HELPER: Finalize Sync and pass baton
 */
async function markSyncComplete(
  merchantId,
  platform,
  syncStartTime,
  affectedDates,
  sinceDate,
  mode,
) {
  try {
    // 1. Update Sync Record
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

    // 2. Update Watermark
    await dynamoDBService.updateSyncWatermark(merchantId, platform, {
      syncTime: syncStartTime,
    });

    // 3. Pass baton to Meta Sync
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: metaQueueUrl,
        MessageBody: JSON.stringify({
          type: "META_SYNC",
          merchantId,
          sinceDate,
          mode,
          affectedDates,
        }),
      }),
    );

    console.log(
      `🏁 Shopify Sync COMPLETED for ${merchantId}. Moving to Meta Ads.`,
    );
  } catch (err) {
    console.error("Complete Sync Error:", err.message);
  }
}

pollQueue();
