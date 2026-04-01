const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { sqsClient, sqsQueueUrl, newDynamoDB, newTableName } = require('../config/aws.config');
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
const encryptionService = require('../utils/encryption'); // ✅ Fixed Path
const syncService = require('../services/sync.service');

let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Meta Ads Sync Worker started...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: sqsQueueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 20
      }));
      if (!Messages) continue;

      const message = Messages[0];
      const body = JSON.parse(message.Body);
      if (body.type === 'META_SYNC') {
        console.log(`📦 Processing Meta Ads for: ${body.merchantId}`);
        await processMetaSync(body);
      }
      await sqsClient.send(new DeleteMessageCommand({ QueueUrl: sqsQueueUrl, ReceiptHandle: message.ReceiptHandle }));
    } catch (e) {
      if (!isShuttingDown) console.error("Worker Error:", e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};

const processMetaSync = async (job) => {
  const { merchantId, sinceDate } = job;
  try {
    const integration = await newDynamoDB.send(new GetCommand({
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: 'INTEGRATION#META' }
    }));
    if (!integration.Item) return;

    const decryptedToken = encryptionService.decrypt(integration.Item.accessToken);
    let startDate = new Date(sinceDate);
    const endDate = new Date();
    
    while (startDate <= endDate && !isShuttingDown) {
      const chunkEnd = new Date(startDate);
      chunkEnd.setDate(chunkEnd.getDate() + 30);
      const finalEnd = chunkEnd > endDate ? endDate : chunkEnd;

      const response = await axios.get(`https://graph.facebook.com/v18.0/${integration.Item.adAccountId}/insights`, {
        params: {
          access_token: decryptedToken,
          time_range: JSON.stringify({ 
            'since': startDate.toISOString().split('T')[0], 
            'until': finalEnd.toISOString().split('T')[0] 
          }),
          fields: 'spend,impressions,clicks',
          time_increment: 1,
        }
      });

      for (const day of response.data.data) {
        await newDynamoDB.send(new PutCommand({
          TableName: newTableName,
          Item: {
            PK: `MERCHANT#${merchantId}`,
            SK: `ADS#${day.date_start}`,
            entityType: 'ADS',
            spend: Number(day.spend),
            updatedAt: new Date().toISOString()
          }
        }));
      }

      startDate.setDate(startDate.getDate() + 31);
      console.log(`📊 [Meta] Synced chunk for ${merchantId}. Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      await new Promise(r => setTimeout(r, 1000)); 
    }

    await markSyncComplete(merchantId, 'META');
    await syncService.checkAndUnlockDashboard(merchantId);
  } catch (error) { console.error("Meta Error:", error.message); }
};

const markSyncComplete = async (merchantId, platform) => {
  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` },
    UpdateExpression: 'SET #s = :c, percent = :p, completedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':c': 'completed', ':p': 100, ':t': new Date().toISOString() }
  }));
};

const shutdown = () => { isShuttingDown = true; console.log("🛑 Shutting down..."); setTimeout(() => process.exit(0), 1000); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
pollQueue();