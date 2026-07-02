const syncService = require('../services/sync.service');
const { SendMessageCommand } = require("@aws-sdk/client-sqs"); // 🟢 Essential for Manual Sync
const { sqsClient, shopifyQueueUrl } = require("../config/aws.config"); // 🟢 Essential for Manual Sync

class SyncController {
  async triggerSync(req, res) {
    try {
      const result = await syncService.startInitialSync(req.user.userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async triggerManualSync(req, res) {
    try {
        const merchantId = req.user.userId;

        // Guard: block if any platform sync is still in progress
        const syncStatus = await syncService.getSyncStatus(merchantId);
        const platforms = ["shopify", "meta", "shiprocket"];
        const inProgress = platforms.find(
          (p) => syncStatus[p]?.status === "in_progress"
        );
        if (inProgress) {
          return res.json({
            success: false,
            message: `Sync already running (${inProgress} is in progress). Please wait for it to finish.`,
          });
        }

        // Mark all platforms as in_progress before firing
        const timestamp = new Date().toISOString();
        const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { PutCommand } = require("@aws-sdk/lib-dynamodb");
        const { newDynamoDB, newTableName } = require("../config/aws.config");
        await Promise.all(
          platforms.map((p) =>
            newDynamoDB.send(new PutCommand({
              TableName: newTableName,
              Item: {
                PK: `MERCHANT#${merchantId}`,
                SK: `SYNC#${p.toUpperCase()}`,
                status: "in_progress",
                percent: 0,
                sinceDate,
                updatedAt: timestamp,
              },
            }))
          )
        );

        await sqsClient.send(new SendMessageCommand({
            QueueUrl: shopifyQueueUrl,
            MessageBody: JSON.stringify({
                type: "SHOPIFY_SYNC",
                merchantId,
                mode: "incremental",
                sinceDate,
            })
        }));

        res.json({ success: true, message: "Sync triggered! Refreshing data..." });
    } catch (err) {
        console.error("Manual Sync Trigger Error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

  async getStatus(req, res) {
    try {
      const result = await syncService.getSyncStatus(req.user.userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new SyncController();