const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName, sqsClient, sqsQueueUrl } = require('../config/aws.config');
const dynamodbService = require('./dynamodb.service');

class SyncService {
  async startInitialSync(merchantId) {
    try {
      const timestamp = new Date().toISOString();
      
      // 🟢 Production Rule: Fetch exactly 365 days of history
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 365);
      const sinceDateStr = sinceDate.toISOString();

      // 1. Initialize SYNC records (This makes progress bars show 0% instead of error)
      const platforms = ['SHOPIFY', 'META', 'SHIPROCKET'];
      await Promise.all(platforms.map(platform => 
        newDynamoDB.send(new PutCommand({
          TableName: newTableName,
          Item: {
            PK: `MERCHANT#${merchantId}`,
            SK: `SYNC#${platform}`,
            entityType: 'SYNC_STATUS',
            status: 'in_progress',
            percent: 0,
            sinceDate: sinceDateStr,
            startedAt: timestamp,
            updatedAt: timestamp
          }
        }))
      ));

      // 2. Fire 3 SQS Jobs (Decoupled logic)
      const jobs = [
        { type: 'SHOPIFY_SYNC', merchantId, sinceDate: sinceDateStr },
        { type: 'META_SYNC', merchantId, sinceDate: sinceDateStr },
        { type: 'SHIPROCKET_SYNC', merchantId, sinceDate: sinceDateStr }
      ];

      await Promise.all(jobs.map(job => 
        sqsClient.send(new SendMessageCommand({
          QueueUrl: sqsQueueUrl,
          MessageBody: JSON.stringify(job)
        }))
      ));

      console.log(`🚀 [Sync] 1-Year Sync Triggered for ${merchantId}`);
      return { success: true };
    } catch (error) {
      console.error('Start Sync Error:', error);
      throw error;
    }
  }

  async getSyncStatus(merchantId) {
    const result = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `MERCHANT#${merchantId}`,
        ':sk': 'SYNC#'
      }
    }));

    const status = {};
    result.Items.forEach(item => {
      const platform = item.SK.replace('SYNC#', '').toLowerCase();
      status[platform] = item;
    });

    // 🟢 Safety Check: If a platform record isn't created yet, 
    // send a "pending" object so React doesn't crash.
    return { 
      success: true, 
      shopify: status.shopify || { status: 'pending', percent: 0 },
      meta: status.meta || { status: 'pending', percent: 0 },
      shiprocket: status.shiprocket || { status: 'pending', percent: 0 }
    };
  }


  async checkAndUnlockDashboard(merchantId) {
    try {
      const status = await this.getSyncStatus(merchantId);
      const profile = await dynamodbService.getUserProfile(merchantId);
      
      // 1. Check if all 3 background syncs are "completed"
      const allSynced = 
        status.shopify?.status === 'completed' &&
        status.meta?.status === 'completed' &&
        status.shiprocket?.status === 'completed';
      
      // 2. Check if user has finished entering COGS
      const cogsDone = profile.data?.cogsCompleted === true;
      
      if (allSynced && cogsDone) {
        console.log(`🔓 [UNLOCK] All conditions met for merchant: ${merchantId}`);
        
        // 3. Trigger the Summary Calculator (Firing one last SQS job)
        await sqsClient.send(new SendMessageCommand({
          QueueUrl: sqsQueueUrl,
          MessageBody: JSON.stringify({ type: 'SUMMARY_CALC', merchantId })
        }));

        // 4. Update the profile
        await dynamodbService.updateUserProfileOnboarding(merchantId, {
          initialSyncCompleted: true,
          dashboardUnlocked: true
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Unlock Check Error:', error);
    }
  }

}

module.exports = new SyncService();