const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { sqsClient, sqsQueueUrl, newDynamoDB, newTableName, s3Client, s3BucketName } = require('../config/aws.config');
const shopifyUtil = require('../utils/shopify.util');
const syncService = require('../services/sync.service');
const dynamodbService = require('../services/dynamodb.service');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// 🟢 Automatically retry on network errors or 5xx/429 status codes
axiosRetry(axios, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response.status === 429;
  }
});
let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Shopify Order Sync Worker started. Watching SQS...");

  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: sqsQueueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20
      }));

      if (!Messages) continue;

      const message = Messages[0];
      const body = JSON.parse(message.Body);

      if (body.type === 'SHOPIFY_SYNC') {
        console.log(`📦 Syncing Orders for merchant: ${body.merchantId} (Cursor: ${body.cursor ? 'Next Page' : 'Start'})`);
        await processOrders(body);
      }

      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: sqsQueueUrl,
        ReceiptHandle: message.ReceiptHandle
      }));

    } catch (error) {
      if (!isShuttingDown) {
        console.error("❌ Worker Loop Error:", error.message);
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  }
};

const processOrders = async (job) => {
  const { merchantId, sinceDate, cursor = null } = job;

  try {
    // 1. PERFORMANCE OPTIMIZATION: Get all Variant Costs once to avoid DB calls in loop
    const variantsResult = await dynamodbService.getVariantsByMerchant(merchantId);
    const costMap = {};
    if (variantsResult.success) {
      variantsResult.data.forEach(v => {
        costMap[v.variantId] = v.costPrice || 0;
      });
    }

    // 2. Get Integration
    const integration = await newDynamoDB.send(new GetCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: 'INTEGRATION#SHOPIFY' }
    }));

    if (!integration.Item) {
      console.error(`⚠️ No Shopify integration for ${merchantId}`);
      return;
    }

    const { shopifyStore, accessToken } = integration.Item;

    // 3. Fetch Page of Orders (Rate Limited in Util)
    const data = await shopifyUtil.fetchShopifyOrders(shopifyStore, accessToken, sinceDate, cursor);
    const orderEdges = data.edges || [];

    if (orderEdges.length === 0) {
      await markSyncComplete(merchantId, 'SHOPIFY');
      await syncService.checkAndUnlockDashboard(merchantId);
      return;
    }

    // 4. Process Orders
    for (const { node: order } of orderEdges) {
      const orderId = order.id.split('/').pop();
      let totalOrderCogs = 0;

      // Extract and map line items with Frozen COGS
      const slimLineItems = order.lineItems.edges.map(({ node: item }) => {
        const vId = item.variant?.id?.split('/').pop() || 'unknown';
        const cost = costMap[vId] || 0; // Look up cost from our memory map
        totalOrderCogs += (cost * item.quantity);

        return {
          variantId: vId,
          quantity: item.quantity,
          cogsAtSale: cost
        };
      });

      // A. Backup Raw JSON to S3
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: `${merchantId}/orders/${orderId}.json`,
          Body: JSON.stringify(order),
          ContentType: 'application/json'
        }));
      } catch (s3Err) { console.error("S3 Backup Failed:", s3Err.message); }

      // B. Save Slim Record to DynamoDB
      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: {
          PK: `MERCHANT#${merchantId}`,
          SK: `ORDER#${orderId}`,
          entityType: 'ORDER',
          orderNumber: order.name,
          totalPrice: Number(order.totalPriceSet.shopMoney.amount),
          currency: order.totalPriceSet.shopMoney.currencyCode,
          orderCreatedAt: order.createdAt,
          lineItems: slimLineItems,
          totalCogs: totalOrderCogs,
          status: order.displayFinancialStatus?.toLowerCase(),
          updatedAt: new Date().toISOString()
        }
      }));
    }

    // 5. Update Progress and Pass Cursor (Message Chaining)
    if (data.pageInfo.hasNextPage && !isShuttingDown) {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: sqsQueueUrl,
        MessageBody: JSON.stringify({ ...job, cursor: data.pageInfo.endCursor })
      }));
      console.log(`➡️  Chunk done. Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    } else {
      await markSyncComplete(merchantId, 'SHOPIFY');
      await syncService.checkAndUnlockDashboard(merchantId);
    }

  } catch (error) {
    console.error(`❌ Shopify Sync Failed for ${merchantId}:`, error.message);
  }
};

async function markSyncComplete(merchantId, platform) {
  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` },
    UpdateExpression: 'SET #s = :c, percent = :p, completedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':c': 'completed', ':p': 100, ':t': new Date().toISOString() }
  }));
  console.log(`✅ ${platform} Sync 100% Complete for ${merchantId}`);
}

// Graceful Shutdown
const shutdown = () => {
  console.log('🛑 Shutting down Shopify worker safely...');
  isShuttingDown = true;
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

pollQueue();