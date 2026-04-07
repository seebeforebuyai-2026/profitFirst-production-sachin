const { ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
// 🟢 Use the specific productQueueUrl from your config
const { sqsClient, productQueueUrl, newDynamoDB, newTableName, s3Client, s3BucketName } = require("../config/aws.config");
const dynamodbService = require("../services/dynamodb.service");
const shopifyUtil = require("../utils/shopify.util");
const axios = require("axios");
const axiosRetry = require("axios-retry").default;

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429,
});

let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Product Fetch Worker started. Watching SQS...");

  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: productQueueUrl, // This should be your dedicated product queue
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        }),
      );

      if (!Messages || Messages.length === 0) continue;

      const message = Messages[0];
      const body = JSON.parse(message.Body);

      // 🟢 Logic: Process if type matches
      if (body.type === "PRODUCT_FETCH") {
        console.log(`📦 Processing PRODUCT_FETCH for merchant: ${body.merchantId}`);
        await processProductFetch(body.merchantId);
        
        // 🟢 Delete ONLY after successful processing
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: productQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
        console.log("✅ Product message processed and removed from queue.");
      } else {
        console.log(`⏭️  Skipping ${body.type} - Not a product fetch job.`);
        // Note: In the 4-queue model, we shouldn't even get other types here.
      }

    } catch (error) {
      if (!isShuttingDown) {
        // 🟢 FIXED: Removed the reference to 'body.type' here to prevent the crash
        console.error("❌ Worker Error:", error.message);
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  }
};

const processProductFetch = async (merchantId) => {
  try {
    const integration = await dynamodbService.getIntegrationStatus(merchantId, "shopify");
    if (!integration.success) {
      console.error(`⚠️ Integration not found for merchant ${merchantId}`);
      return;
    }

    const { shopifyStore, accessToken } = integration.data;
    let cursor = null;
    let hasMore = true;

    while (hasMore && !isShuttingDown) {
      const data = await shopifyUtil.fetchShopifyProducts(shopifyStore, accessToken, cursor);
      const productEdges = data.edges || [];
      if (productEdges.length === 0) break;

      // 1. S3 Backup
      try {
        await s3Client.send(new PutObjectCommand({
            Bucket: s3BucketName,
            Key: `${merchantId}/raw/products_${Date.now()}.json`,
            Body: JSON.stringify(productEdges),
            ContentType: "application/json",
        }));
      } catch (e) { console.error("S3 Backup Failed:", e.message); }

      // 2. Prepare Items
      const batchItems = [];
      productEdges.forEach(({ node: p }) => {
        p.variants.edges.forEach(({ node: v }) => {
          const price = Number(v.price);
          if (!price || price <= 0) return;

          batchItems.push({
            PutRequest: {
              Item: {
                PK: `MERCHANT#${merchantId}`,
                SK: `VARIANT#${v.id.split("/").pop()}`,
                entityType: "VARIANT",
                productId: p.id.split("/").pop(),
                variantId: v.id.split("/").pop(),
                productName: p.title,
                variantName: v.title === "Default Title" ? "" : v.title,
                salePrice: price,
                productImage: p.featuredImage ? p.featuredImage.url : null,
                costPrice: 0,
                updatedAt: new Date().toISOString(),
              },
            },
          });
        });
      });

      // 3. Batch Write with Retry Loop
      for (let i = 0; i < batchItems.length; i += 25) {
        let chunk = batchItems.slice(i, i + 25);
        let maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          let writeResult = await newDynamoDB.send(new BatchWriteCommand({
              RequestItems: { [newTableName]: chunk },
          }));

          if (writeResult.UnprocessedItems && writeResult.UnprocessedItems[newTableName]) {
            chunk = writeResult.UnprocessedItems[newTableName];
            console.warn(`⚠️ Retry ${attempt + 1}: ${chunk.length} items unprocessed.`);
            await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
          } else {
            break; 
          }
        }
      }

      console.log(`✅ Synced ${batchItems.length} variants for ${merchantId}`);
      cursor = data.pageInfo.endCursor;
      hasMore = data.pageInfo.hasNextPage;
      
      // Rate limit safety
      await new Promise(res => setTimeout(res, 500));
    }
    console.log(`🏁 Finished all products for ${merchantId}`);
  } catch (error) {
    console.error(`❌ Process Error for ${merchantId}:`, error.message);
  }
};

// Graceful Shutdown
const shutdown = () => {
  console.log("🛑 Worker shutting down safely...");
  isShuttingDown = true;
  setTimeout(() => process.exit(0), 1000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

pollQueue();