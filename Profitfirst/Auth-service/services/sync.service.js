const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { PutCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const {
  newDynamoDB,
  newTableName,
  sqsClient,
  sqsQueueUrl,
} = require("../config/aws.config");
const dynamodbService = require("./dynamodb.service");

class SyncService {
  async startInitialSync(merchantId) {
    try {
      const timestamp = new Date().toISOString();

      // 🟢 Production Rule: Fetch exactly 365 days of history
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 365);
      const sinceDateStr = sinceDate.toISOString();

      // 1. Initialize SYNC records (This makes progress bars show 0% instead of error)
      const platforms = ["SHOPIFY", "META", "SHIPROCKET"];
      await Promise.all(
        platforms.map((platform) =>
          newDynamoDB.send(
            new PutCommand({
              TableName: newTableName,
              Item: {
                PK: `MERCHANT#${merchantId}`,
                SK: `SYNC#${platform}`,
                entityType: "SYNC_STATUS",
                status: "in_progress",
                percent: 0,
                sinceDate: sinceDateStr,
                startedAt: timestamp,
                updatedAt: timestamp,
              },
            }),
          ),
        ),
      );

      // 2. Fire 3 SQS Jobs (Decoupled logic)
      const jobs = [
        { type: "SHOPIFY_SYNC", merchantId, sinceDate: sinceDateStr },
        { type: "META_SYNC", merchantId, sinceDate: sinceDateStr },
        { type: "SHIPROCKET_SYNC", merchantId, sinceDate: sinceDateStr },
      ];

      await Promise.all(
        jobs.map((job) =>
          sqsClient.send(
            new SendMessageCommand({
              QueueUrl: sqsQueueUrl,
              MessageBody: JSON.stringify(job),
            }),
          ),
        ),
      );

      console.log(`🚀 [Sync] 1-Year Sync Triggered for ${merchantId}`);
      return { success: true };
    } catch (error) {
      console.error("Start Sync Error:", error);
      throw error;
    }
  }

  async getSyncStatus(merchantId) {
    const result = await newDynamoDB.send(
      new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `MERCHANT#${merchantId}`,
          ":sk": "SYNC#",
        },
      }),
    );

    const status = {};
    result.Items.forEach((item) => {
      const platform = item.SK.replace("SYNC#", "").toLowerCase();
      status[platform] = item;
    });

    // 🟢 Safety Check: If a platform record isn't created yet,
    // send a "pending" object so React doesn't crash.
    return {
      success: true,
      shopify: status.shopify || { status: "pending", percent: 0 },
      meta: status.meta || { status: "pending", percent: 0 },
      shiprocket: status.shiprocket || { status: "pending", percent: 0 },
    };
  }

  async checkAndUnlockDashboard(merchantId) {
    try {
            console.log(`🔍 Running Unlock Verification for: ${merchantId}`);

      // 1. Get current status of all 3 background syncs
      const syncStatus = await this.getSyncStatus(merchantId);
      
      // 2. Get User Profile for setup flags
      const profileResult = await dynamodbService.getUserProfile(merchantId);
      const profile = profileResult.data;

      // 🟢 CONDITION 1: Are all background workers finished?
      const allSynced = 
        syncStatus.shopify?.status === 'completed' &&
        syncStatus.meta?.status === 'completed' &&
        syncStatus.shiprocket?.status === 'completed';




     // 🟢 CONDITION 2: Has the user entered Product Costs?
      const cogsDone = profile?.cogsCompleted === true;

      // 🟢 CONDITION 3: Has the user entered Business Expenses?
      const expensesDone = profile?.expensesCompleted === true;

      // 3. If everything is ready, trigger the final calculation and UNLOCK
      if (allSynced && cogsDone && expensesDone) {
        console.log(`🚀 [DASHBOARD UNLOCKED] for ${merchantId}`);
        
        await newDynamoDB.send(new UpdateCommand({
          TableName: newTableName,
          Key: { PK: `MERCHANT#${merchantId}`, SK: 'PROFILE' },
          UpdateExpression: 'SET dashboardUnlocked = :true, initialSyncCompleted = :true, updatedAt = :time',
          ExpressionAttributeValues: {
            ':true': true,
            ':time': new Date().toISOString()
          }
        }));

        // Fire the Summary Calculator one last time to include the new expenses
        await sqsClient.send(new SendMessageCommand({
          QueueUrl: sqsQueueUrl,
          MessageBody: JSON.stringify({ type: 'SUMMARY_CALC', merchantId: merchantId })
        }));
        
        return { unlocked: true };
      }

      console.log(`🟡 [STILL LOCKED] Sync: ${allSynced?'✅':'❌'}, COGS: ${cogsDone?'✅':'❌'}, Expenses: ${expensesDone?'✅':'❌'}`);
      return { unlocked: false };
      
    } catch (error) {
      console.error('Unlock Check Error:', error);
      return { unlocked: false };
    }
  }
}

module.exports = new SyncService();
