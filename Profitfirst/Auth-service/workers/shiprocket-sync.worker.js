const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { sqsClient, sqsQueueUrl, newDynamoDB, newTableName, s3Client, s3BucketName } = require('../config/aws.config');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// 🟢 Automatically retry on network errors or 5xx/429 status codes
axiosRetry(axios, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response.status === 429;
  }
});const encryptionService = require('../utils/encryption');
const syncService = require('../services/sync.service');

let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Shiprocket Sync Worker started. Watching SQS...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: sqsQueueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 20
      }));

      if (!Messages) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);

      if (body.type === 'SHIPROCKET_SYNC') {
        console.log(`📦 Processing Shiprocket for merchant: ${body.merchantId} (Page: ${body.page || 1})`);
        await processShiprocketSync(body);
      }

      await sqsClient.send(new DeleteMessageCommand({ QueueUrl: sqsQueueUrl, ReceiptHandle: message.ReceiptHandle }));
    } catch (e) { 
        if (!isShuttingDown) console.error("Worker Error:", e.message); 
        await new Promise(r => setTimeout(r, 5000)); 
    }
  }
};

const processShiprocketSync = async (job) => {
  const { merchantId, sinceDate, page = 1 } = job;
  try {
    // 1. Get Integration
    const integration = await newDynamoDB.send(new GetCommand({
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: 'INTEGRATION#SHIPROCKET' }
    }));
    if (!integration.Item) return;

    const decryptedToken = encryptionService.decrypt(integration.Item.token);

    // 2. API Call with 100 items per page
    const response = await axios.get('https://apiv2.shiprocket.in/v1/external/shipments', {
      headers: { 'Authorization': `Bearer ${decryptedToken}` },
      params: { 
        from: sinceDate.split('T')[0], 
        page: page, 
        per_page: 100,
        sort: 'created_at',
        order: 'asc'
      }
    });

    const shipments = response.data.data;
    if (!shipments || shipments.length === 0) {
      await markSyncComplete(merchantId, 'SHIPROCKET');
      await syncService.checkAndUnlockDashboard(merchantId);
      return;
    }

    // 3. S3 Backup
    try {
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: `${merchantId}/raw/shiprocket_pg${page}_${Date.now()}.json`,
          Body: JSON.stringify(shipments),
          ContentType: 'application/json'
        }));
    } catch (e) { console.error("S3 Error:", e.message); }

    // 4. Save to DynamoDB (Idempotent)
    for (const ship of shipments) {
      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: {
          PK: `MERCHANT#${merchantId}`,
          SK: `SHIPMENT#${ship.id}`,
          entityType: 'SHIPMENT',
          orderId: ship.order_id.toString(),
          awbCode: ship.awb_code,
          shippingFee: Number(ship.freight_charges || 0),
          deliveryStatus: ship.status?.toLowerCase(),
          updatedAt: new Date().toISOString()
        }
      }));
    }

    // 5. Update Progress (Estimated)
    // Shiprocket doesn't always give total count, so we increment progress
    await updateSyncProgress(merchantId, 'SHIPROCKET', Math.min(page * 5, 99));

    // 6. Message Chaining (Next Page)
    if (shipments.length === 100) {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: sqsQueueUrl,
        MessageBody: JSON.stringify({ ...job, page: page + 1 })
      }));
      await new Promise(r => setTimeout(r, 1000)); // Rate limit safety (1 req/sec)
    } else {
      await markSyncComplete(merchantId, 'SHIPROCKET');
      await syncService.checkAndUnlockDashboard(merchantId);
    }

  } catch (error) { console.error(`❌ Shiprocket Sync Failed for ${merchantId}:`, error.message); }
};

async function updateSyncProgress(merchantId, platform, percent) {
  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` },
    UpdateExpression: 'SET percent = :p',
    ExpressionAttributeValues: { ':p': percent }
  }));
}

async function markSyncComplete(merchantId, platform) {
  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` },
    UpdateExpression: 'SET #s = :c, percent = :p, completedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':c': 'completed', ':p': 100, ':t': new Date().toISOString() }
  }));
}
pollQueue();