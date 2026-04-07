const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { 
  sqsClient, 
  metaQueueUrl, 
  shiprocketQueueUrl, 
  newDynamoDB, 
  newTableName,
  s3Client,
  s3BucketName 
} = require("../config/aws.config");
const axios = require("axios");
const encryptionService = require("../utils/encryption");

let isShuttingDown = false;

const pollQueue = async () => {
  console.log("🚀 Meta Ads Worker: Active and Waiting...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({ 
        QueueUrl: metaQueueUrl, 
        WaitTimeSeconds: 20 
      }));
      
      if (!Messages || Messages.length === 0) continue;
      
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      
      console.log(`📢 Processing Ads for Merchant: ${body.merchantId}`);
      await processMetaSync(body);
      
      await sqsClient.send(new DeleteMessageCommand({ 
        QueueUrl: metaQueueUrl, 
        ReceiptHandle: message.ReceiptHandle 
      }));
      console.log(`✅ Ad Sync Success.`);
    } catch (e) { 
      if (!isShuttingDown) console.error("❌ Meta Worker Fatal Error:", e.message); 
      await new Promise(r => setTimeout(r, 5000)); 
    }
  }
};


const processMetaSync = async (job) => {
  const { merchantId, sinceDate } = job;
  try {
    const integration = await newDynamoDB.send(new GetCommand({ 
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#META" }
    }));
    
    if (!integration.Item) return;
    const token = encryptionService.decrypt(integration.Item.accessToken);
    const adAccountId = integration.Item.adAccountId;
    const startStr = sinceDate.split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // 🟢 NEW: Loop for Meta Pagination
    let nextUrl = `https://graph.facebook.com/v20.0/${adAccountId}/insights?access_token=${token}&time_range=${JSON.stringify({ since: startStr, until: todayStr })}&fields=spend,impressions,clicks,reach,actions,action_values,inline_link_click_ctr&time_increment=1&limit=50`;

    while (nextUrl) {
        const response = await axios.get(nextUrl);
        const dailyData = response.data.data || [];

        for (const day of dailyData) {
            try {
                const dateKey = day.date_start; 
                const s3Key = `${merchantId}/ads/${dateKey}.json`;
                const purchases = (day.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
                const purchaseValue = (day.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;

                await s3Client.send(new PutObjectCommand({
                    Bucket: s3BucketName, Key: s3Key,
                    Body: JSON.stringify(day), ContentType: "application/json"
                }));

                await newDynamoDB.send(new PutCommand({ 
                    TableName: newTableName, 
                    Item: { 
                        PK: `MERCHANT#${merchantId}`, 
                        SK: `ADS#${dateKey}`, 
                        entityType: "ADS", 
                        date: dateKey,
                        spend: Number(day.spend || 0), 
                        reach: Number(day.reach || 0),
                        impressions: Number(day.impressions || 0),
                        clicks: Number(day.clicks || 0),
                        ctr: Number(day.inline_link_click_ctr || 0),
                        metaPurchases: Number(purchases),
                        metaPurchaseValue: Number(purchaseValue),
                        s3RawUrl: `s3://${s3BucketName}/${s3Key}`,
                        updatedAt: new Date().toISOString() 
                    }
                }));
            } catch (dayErr) { console.error(`⚠️ Day save fail:`, dayErr.message); }
        }

        // 🟢 Check if more pages exist in Meta
        nextUrl = response.data.paging?.next || null;
        if (nextUrl) console.log("➡️ Meta: Fetching next page of insights...");
    }

    await markSyncComplete(merchantId, "META", sinceDate);

  } catch (e) { throw e; }
};
async function markSyncComplete(merchantId, platform, sinceDate) {
  try {
    // 1. Update Platform Sync Progress
    await newDynamoDB.send(new UpdateCommand({ 
      TableName: newTableName, 
      Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${platform}` }, 
      UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t, updatedAt = :ut", 
      ExpressionAttributeNames: { "#s": "status", "#p": "percent" }, 
      ExpressionAttributeValues: { ":c": "completed", ":p": 100, ":t": new Date().toISOString(), ":ut": new Date().toISOString() } 
    }));

    // 2. Baton Pass to Shiprocket
    await sqsClient.send(new SendMessageCommand({ 
      QueueUrl: shiprocketQueueUrl, 
      MessageBody: JSON.stringify({ type: "SHIPROCKET_SYNC", merchantId, sinceDate }) 
    }));
    
    console.log(`🏁 Meta Sync OK for ${merchantId} -> Triggering Shiprocket.`);
  } catch (err) { console.error("markSyncComplete Error:", err.message); }
}

pollQueue();