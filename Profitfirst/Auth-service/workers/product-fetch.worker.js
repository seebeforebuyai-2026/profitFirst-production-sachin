const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { sqsClient, sqsQueueUrl, newDynamoDB, newTableName, s3Client, s3BucketName } = require('../config/aws.config');
const dynamodbService = require('../services/dynamodb.service');
const shopifyUtil = require('../utils/shopify.util');

let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Product Fetch Worker started. Watching SQS...");

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

      if (body.type === 'PRODUCT_FETCH') {
        console.log(`📦 Processing PRODUCT_FETCH for merchant: ${body.merchantId}`);
        await processProductFetch(body.merchantId);
      }

      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: sqsQueueUrl,
        ReceiptHandle: message.ReceiptHandle
      }));

    } catch (error) {
      if (!isShuttingDown) {
        console.error("❌ SQS Polling Error:", error.message);
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  }
};

const processProductFetch = async (merchantId) => {
  try {
    const integration = await dynamodbService.getIntegrationStatus(merchantId, 'shopify');
    if (!integration.success) {
      console.error(`⚠️ Integration not found for merchant ${merchantId}`);
      return;
    }

    const { shopifyStore, accessToken } = integration.data;
    let cursor = null;
    let hasMore = true;

    while (hasMore && !isShuttingDown) {
      const data = await shopifyUtil.fetchShopifyProducts(shopifyStore, accessToken, cursor);
      const productEdges = data.edges;
      if (productEdges.length === 0) break;

      // 1. S3 Backup
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: `${merchantId}/raw/products_${Date.now()}.json`,
          Body: JSON.stringify(productEdges),
          ContentType: 'application/json'
        }));
      } catch (e) { console.error("S3 Save Failed:", e.message); }

      // 2. Prepare Items
      const batchItems = [];
      productEdges.forEach(({ node: p }) => {
        p.variants.edges.forEach(({ node: v }) => {
          batchItems.push({
            PutRequest: {
              Item: {
                PK: `MERCHANT#${merchantId}`,
                SK: `VARIANT#${v.id.split('/').pop()}`,
                entityType: 'VARIANT',
                productId: p.id.split('/').pop(),
                variantId: v.id.split('/').pop(),
                productName: p.title,
                variantName: v.title === 'Default Title' ? '' : v.title,
                salePrice: Number(v.price),
                productImage: p.featuredImage ? p.featuredImage.url : null,
                costPrice: 0,
                updatedAt: new Date().toISOString()
              }
            }
          });
        });
      });

      // 3. Batch Write with Retry Loop (Enterprise Standard)
      for (let i = 0; i < batchItems.length; i += 25) {
        let chunk = batchItems.slice(i, i + 25);
        let maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          let writeResult = await newDynamoDB.send(new BatchWriteCommand({
            RequestItems: { [newTableName]: chunk }
          }));

          if (writeResult.UnprocessedItems && writeResult.UnprocessedItems[newTableName]) {
            chunk = writeResult.UnprocessedItems[newTableName];
            console.warn(`⚠️ Retry ${attempt + 1}: ${chunk.length} items unprocessed. Waiting...`);
            await new Promise(res => setTimeout(res, 1000 * (attempt + 1))); // Exponential wait
          } else {
            break; // All items saved successfully
          }
        }
      }

      console.log(`✅ Synced ${batchItems.length} variants for ${merchantId}`);
      cursor = data.pageInfo.endCursor;
      hasMore = data.pageInfo.hasNextPage;
    }
    console.log(`🏁 Finished all products for ${merchantId}`);
  } catch (error) {
    console.error(`❌ Process Error for ${merchantId}:`, error.message);
  }
};

// Graceful Shutdown
const shutdown = () => {
  console.log('🛑 Worker shutting down safely...');
  isShuttingDown = true;
  setTimeout(() => process.exit(0), 1000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

pollQueue(); 