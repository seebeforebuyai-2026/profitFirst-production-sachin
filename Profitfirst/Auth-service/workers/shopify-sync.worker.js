const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { 
  sqsClient, 
  shopifyQueueUrl, 
  metaQueueUrl, 
  newDynamoDB, 
  newTableName, 
  s3Client, 
  s3BucketName 
} = require("../config/aws.config");
const shopifyUtil = require("../utils/shopify.util");
const dynamodbService = require("../services/dynamodb.service");

let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Shopify Sync Worker: Monitoring Queue...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({ 
        QueueUrl: shopifyQueueUrl, 
        WaitTimeSeconds: 20,
        MaxNumberOfMessages: 1 
      }));
      
      if (!Messages || Messages.length === 0) continue;
      
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      
      console.log(`📦 Job Received | Merchant: ${body.merchantId} | Page: ${body.pageCount || 1}`);
      await processOrders(body);
      
      await sqsClient.send(new DeleteMessageCommand({ 
        QueueUrl: shopifyQueueUrl, 
        ReceiptHandle: message.ReceiptHandle 
      }));
      console.log(`✅ Page Processed Successfully.`);
    } catch (e) { 
      if (!isShuttingDown) console.error("❌ Worker Poll Error:", e.message); 
      await new Promise(r => setTimeout(r, 5000)); 
    }
  }
};

const processOrders = async (job) => {
  const { merchantId, sinceDate, cursor = null, pageCount = 1 } = job;
  
  try {
    // 1. Fetch Master COGS (Variants)
    // Production Note: In future, if variants > 10,000, this needs pagination
    const variants = await dynamodbService.getVariantsByMerchant(merchantId);
    const costMap = {};
    variants.data?.forEach(v => {
      if (v.variantId) {
        const cleanId = v.variantId.toString().split('/').pop();
        costMap[cleanId] = v.costPrice || 0;
      }
    });

    // 2. Integration Auth Check
    const integration = await newDynamoDB.send(new GetCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHOPIFY" }
    }));
    if (!integration.Item) {
      console.error(`❌ Integration missing for ${merchantId}`);
      return; 
    }

    // 3. Fetch Orders from Shopify
    const data = await shopifyUtil.fetchShopifyOrders(
      integration.Item.shopifyStore,
      integration.Item.accessToken,
      sinceDate,
      cursor
    );

    if (!data?.edges) return;

    // 4. Individual Order Processing (Defensive Loop)
    for (const { node: order } of data.edges) {
      try {
        const orderId = order.id.split('/').pop();
        const orderName = order.name || `Order-${orderId}`;

        // --- Step A: S3 Backup (Source of Truth) ---
        const s3Key = `${merchantId}/orders/${orderId}.json`;
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: s3Key,
          Body: JSON.stringify(order),
          ContentType: "application/json"
        }));

        // --- Step B: Math & Formulas (Defensive Calculation) ---
        const subtotal   = Number(order.subtotalPriceSet?.shopMoney?.amount || 0);
        const totalPrice = Number(order.totalPriceSet?.shopMoney?.amount || 0);
        const discounts  = Number(order.totalDiscountsSet?.shopMoney?.amount || 0);
        const tax        = Number(order.totalTaxSet?.shopMoney?.amount || 0);
        const shipping   = Number(order.totalShippingPriceSet?.shopMoney?.amount || 0);

        // Refund Extraction (Audit Logic)
        const refunds = (order.refunds || []).reduce((sum, refund) => {
          const rLineItems = refund.refundLineItems?.edges || refund.refundLineItems || [];
          return sum + rLineItems.reduce((rSum, item) => {
            const node = item.node || item;
            return rSum + Number(node.subtotalSet?.shopMoney?.amount || 0);
          }, 0);
        }, 0);

        const netRevenue = totalPrice - discounts - refunds;
        const grossSales = subtotal - tax;

        // Payment Type Detection
        const isCOD = (order.paymentGatewayNames || []).some(g => {
          const lowG = g.toLowerCase();
          return lowG.includes("cash on delivery") || lowG === "cod";
        });
        const paymentType = isCOD ? "cod" : "prepaid";

        // --- Step C: COGS Snapshotting ---
        let totalCogs = 0;
        const slimLineItems = (order.lineItems?.edges || []).map(({ node: li }) => {
          const vId = li.variant?.id ? li.variant.id.split('/').pop() : 'deleted_variant';
          const costAtSale = costMap[vId] || 0; 
          totalCogs += (costAtSale * (li.quantity || 0));
          
          return {
            variantId: vId,
            productName: li.title || "Unknown",
            quantity: li.quantity || 0,
            price: Number(li.discountedUnitPriceSet?.shopMoney?.amount || 0),
            cogsAtSale: costAtSale 
          };
        });

        // --- Step D: Save to DynamoDB ---
        await newDynamoDB.send(new PutCommand({
          TableName: newTableName,
          Item: {
            PK: `MERCHANT#${merchantId}`,
            SK: `ORDER#${orderId}`,
            entityType: "ORDER",
            orderId,
            orderName, 
            totalPrice,
            subtotalPrice: subtotal,
            grossSales, 
            discounts,
            tax,
            shipping,
            refunds,
            netRevenue,
            paymentType,
            status: order.displayFinancialStatus?.toLowerCase() || "unknown",
            isCancelled: !!order.cancelledAt,
            cancelledAt: order.cancelledAt || null,
            isTest: !!order.test,
            totalCogs: Number(totalCogs.toFixed(2)),
            lineItems: slimLineItems, 
            s3RawUrl: `s3://${s3BucketName}/${s3Key}`,
            orderCreatedAt: order.createdAt,
            updatedAt: new Date().toISOString()
          }
        }));

      } catch (orderErr) {
        // Ek order fail ho toh log karein, par loop na todein
        console.error(`⚠️ Error processing order ${order.id}:`, orderErr.message);
      }
    }

    // 5. Next Page logic
    if (data.pageInfo.hasNextPage) {
      await updateSyncProgress(merchantId, "SHOPIFY", Math.min(98, pageCount * 5));
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: shopifyQueueUrl,
        MessageBody: JSON.stringify({ 
          ...job, 
          cursor: data.pageInfo.endCursor, 
          pageCount: pageCount + 1 
        })
      }));
    } else {
      await markSyncComplete(merchantId, "SHOPIFY", sinceDate);
    }

  } catch (e) {
    console.error("❌ processOrders Page Level Error:", e.message);
    throw e; // SQS will retry this page
  }
};

async function updateSyncProgress(merchantId, platform, percent) {
  try {
    await newDynamoDB.send(new UpdateCommand({ 
      TableName: newTableName, 
      Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` }, 
      UpdateExpression: "SET #p = :p, updatedAt = :t", 
      ExpressionAttributeNames: { "#p": "percent" }, 
      ExpressionAttributeValues: { ":p": percent, ":t": new Date().toISOString() } 
    }));
  } catch (err) { console.error("Update Progress Error:", err.message); }
}

async function markSyncComplete(merchantId, platform, sinceDate) {
  try {
    // 1. Mark Sync as Done
    await newDynamoDB.send(new UpdateCommand({ 
      TableName: newTableName, 
      Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` }, 
      UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t", 
      ExpressionAttributeNames: { "#s": "status", "#p": "percent" }, 
      ExpressionAttributeValues: { ":c": "completed", ":p": 100, ":t": new Date().toISOString() } 
    }));

    // 2. Link Merchant to S3 Storage
    await newDynamoDB.send(new UpdateCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
      UpdateExpression: "SET rawDataBucket = :b, rawDataPrefix = :p, s3LinkedAt = :t",
      ExpressionAttributeValues: {
        ":b": s3BucketName,
        ":p": `${merchantId}/orders/`,
        ":t": new Date().toISOString()
      }
    }));

    // 3. Move to Meta Sync
    await sqsClient.send(new SendMessageCommand({ 
      QueueUrl: metaQueueUrl, 
      MessageBody: JSON.stringify({ type: "META_SYNC", merchantId, sinceDate }) 
    }));
    
    console.log(`🏁 Shopify Sync COMPLETED for ${merchantId}. Moving to Meta Ads.`);
  } catch (err) { console.error("Complete Sync Error:", err.message); }
}

pollQueue(); 