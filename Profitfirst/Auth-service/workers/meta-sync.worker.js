const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { 
  sqsClient, metaQueueUrl, shiprocketQueueUrl, newDynamoDB, newTableName, s3Client, s3BucketName 
} = require("../config/aws.config");
const axios = require("axios");
const logger = require("../utils/logger.js");
const encryptionService = require("../utils/encryption");

let isShuttingDown = false;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const pollQueue = async () => {
  console.log("🚀 [MetaWorker] Sync Engine Active...");
  while (!isShuttingDown) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({ 
        QueueUrl: metaQueueUrl, WaitTimeSeconds: 20, MaxNumberOfMessages: 1
      }));
      if (!Messages || Messages.length === 0) continue;
      const message = Messages[0];
      const body = JSON.parse(message.Body);
      await processMetaSync(body);
      await sqsClient.send(new DeleteMessageCommand({ QueueUrl: metaQueueUrl, ReceiptHandle: message.ReceiptHandle }));
    } catch (e) { 
      if (!isShuttingDown) console.error("❌ Meta Worker Fatal Error:", e.message); 
      await sleep(5000); 
    }
  }
};

const processMetaSync = async (job) => {
  const { merchantId, sinceDate, mode = "full", affectedDates = [] } = job;
  try {
    const integrationRes = await newDynamoDB.send(new GetCommand({ 
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#META" }
    }));
    
    const integration = integrationRes.Item;
    if (!integration) {
        console.error(`⚠️ No Meta integration found for ${merchantId}`);
        return;
    }

    // 🟢 FIXED MAPPING BASED ON YOUR DB SCREENSHOT
    const token = encryptionService.decrypt(integration.accessToken || (integration.credentials && integration.credentials.accessToken));
    let adAccountId = integration.selectedAdAccountId || integration.adAccountId || (integration.credentials && integration.credentials.selectedAdAccountId);

    if (!adAccountId) {
        throw new Error("Ad Account ID missing in Database (Check field: selectedAdAccountId)");
    }

    // Ensure 'act_' prefix
    if (typeof adAccountId === 'string' && !adAccountId.startsWith('act_')) {
        adAccountId = `act_${adAccountId}`;
    }
    
    let startStr, endStr;
    const today = new Date();
    
    if (mode === "incremental") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        startStr = sevenDaysAgo.toISOString().split('T')[0];
        endStr = today.toISOString().split('T')[0];
    } else {
        startStr = new Date(sinceDate).toISOString().split('T')[0];
        endStr = today.toISOString().split('T')[0];
    }

    const dirtyDates = new Set(affectedDates);
    let nextUrl = `https://graph.facebook.com/v20.0/${adAccountId}/insights`;
    let initialParams = {
        access_token: token,
        time_range: JSON.stringify({ since: startStr, until: endStr }),
        fields: "spend,impressions,clicks,reach,actions,action_values,inline_link_click_ctr",
        time_increment: 1,
        limit: 50
    };

    while (nextUrl) {
        await sleep(500); 
        console.log(`📡 Fetching Meta Ads: ${adAccountId} | ${startStr} to ${endStr}`);
        const response = await axios.get(nextUrl, { params: nextUrl.includes('?') ? {} : initialParams });
        const dailyData = response.data.data || [];

        for (const day of dailyData) {
            try {
                const dateKey = day.date_start; 
                dirtyDates.add(dateKey); 
                const s3Key = `${merchantId}/ads/${dateKey}.json`;
                await s3Client.send(new PutObjectCommand({
                    Bucket: s3BucketName, Key: s3Key,
                    Body: JSON.stringify(day), ContentType: "application/json"
                }));
                await newDynamoDB.send(new PutCommand({ 
                    TableName: newTableName, 
                    Item: { 
                        PK: `MERCHANT#${merchantId}`, SK: `ADS#${dateKey}`, 
                        entityType: "ADS", date: dateKey,
                        spend: Number(day.spend || 0), reach: Number(day.reach || 0),
                        impressions: Number(day.impressions || 0), clicks: Number(day.clicks || 0),
                        s3RawUrl: `s3://${s3BucketName}/${s3Key}`,
                        updatedAt: new Date().toISOString() 
                    }
                }));
            } catch (dayErr) { console.error(`⚠️ Day save fail:`, dayErr.message); }
        }
        nextUrl = response.data.paging?.next || null;
        initialParams = {}; 
    }
    await markSyncComplete(merchantId, mode, sinceDate, Array.from(dirtyDates));
  } catch (e) { 
    if (e.response && e.response.data) console.error("🚨 Meta API Error Details:", JSON.stringify(e.response.data));
    logger.logError(merchantId, "META_ADS", e, "INCREMENTAL_SYNC");
    throw e; 
  }
};

async function markSyncComplete(merchantId, mode, sinceDate, finalAffectedDates) {
  try {
    await newDynamoDB.send(new UpdateCommand({ 
      TableName: newTableName, Key: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#META` }, 
      UpdateExpression: "SET #s = :c, #p = :p, completedAt = :t", 
      ExpressionAttributeNames: { "#s": "status", "#p": "percent" }, 
      ExpressionAttributeValues: { ":c": "completed", ":p": 100, ":t": new Date().toISOString() } 
    }));
    await sqsClient.send(new SendMessageCommand({ 
      QueueUrl: shiprocketQueueUrl, 
      MessageBody: JSON.stringify({ type: "SHIPROCKET_SYNC", merchantId, sinceDate, mode, currentAffectedDates: finalAffectedDates }) 
    }));
    console.log(`✅ [Meta] Done. Passing ${finalAffectedDates.length} dirty dates.`);
  } catch (err) { console.error("markSyncComplete Error:", err); }
}

pollQueue();