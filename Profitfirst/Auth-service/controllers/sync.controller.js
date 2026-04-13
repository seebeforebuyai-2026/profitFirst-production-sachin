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
        
        await sqsClient.send(new SendMessageCommand({
            QueueUrl: shopifyQueueUrl,
            MessageBody: JSON.stringify({
                type: "SHOPIFY_SYNC",
                merchantId: merchantId,
                mode: "incremental", 
                sinceDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
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