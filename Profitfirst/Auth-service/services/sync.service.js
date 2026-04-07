const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName, sqsClient, shopifyQueueUrl } = require("../config/aws.config");
const dynamodbService = require("./dynamodb.service");

class SyncService {
  async startInitialSync(merchantId) {
    try {
      const timestamp = new Date().toISOString();
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 90);
      const sinceDateStr = sinceDate.toISOString();

      // 1. Initialize all records to in_progress
      const platforms = ["SHOPIFY", "META", "SHIPROCKET"];
      await Promise.all(platforms.map((p) =>
        newDynamoDB.send(new PutCommand({
          TableName: newTableName,
          Item: { PK: `MERCHANT#${merchantId}`, SK: `SYNC#${p}`, status: "in_progress", percent: 0, sinceDate: sinceDateStr, updatedAt: timestamp }
        }))
      ));

      // 2. 🟢 Trigger Shopify Queue ONLY (First link in the relay race)
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: shopifyQueueUrl,
        MessageBody: JSON.stringify({ type: "SHOPIFY_SYNC", merchantId, sinceDate: sinceDateStr, pageCount: 1 })
      }));

      console.log(`🚀 [Relay Race Start] Shopify job sent to specific queue for ${merchantId}`);
      return { success: true };
    } catch (error) { throw error; }
  }

  async getSyncStatus(merchantId) {
    const result = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${merchantId}`, ":sk": "SYNC#" }
    }));
    const status = {};
    result.Items.forEach(i => status[i.SK.replace("SYNC#", "").toLowerCase()] = i);
    return { success: true, shopify: status.shopify || {percent: 0}, meta: status.meta || {percent: 0}, shiprocket: status.shiprocket || {percent: 0} };
  }

  async checkAndUnlockDashboard(merchantId) {
    const profileRes = await dynamodbService.getUserProfile(merchantId);
    if (profileRes.data?.dashboardUnlocked) return;

    await newDynamoDB.send(new UpdateCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
      UpdateExpression: "SET dashboardUnlocked = :true, initialSyncCompleted = :true, updatedAt = :t",
      ExpressionAttributeValues: { ":true": true, ":t": new Date().toISOString() }
    }));
    console.log(`🏆 DASHBOARD UNLOCKED FOR ${merchantId}`);
  }
}

module.exports = new SyncService();