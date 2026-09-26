const syncService = require("../services/sync.service");
const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { sqsClient, shopifyQueueUrl } = require("../config/aws.config");

class SyncController {
  async triggerSync(req, res) {
    try {
      const result = await syncService.startInitialSync(req.user.userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // ── "Sync Now" Button (Last 30 Days Re-sync) ──────────────────────
  async triggerManualSync(req, res) {
    try {
      const merchantId = req.user.userId;

      // Guard: block if already running
      const syncStatus = await syncService.getSyncStatus(merchantId);
      const platforms = ["shopify", "meta", "shiprocket"];
      const inProgress = platforms.find(
        (p) => syncStatus[p]?.status === "in_progress",
      );
      if (inProgress) {
        return res.json({
          success: false,
          message: `Sync already running (${inProgress} is in progress). Please wait.`,
        });
      }

      const timestamp = new Date().toISOString();
      // 🟢 FIX: 24 ghante ke bajaye 30 din ka sync karein taaki dashboard ke saare orders update hon!
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { PutCommand } = require("@aws-sdk/lib-dynamodb");
      const { newDynamoDB, newTableName } = require("../config/aws.config");

      await Promise.all(
        platforms.map((p) =>
          newDynamoDB.send(
            new PutCommand({
              TableName: newTableName,
              Item: {
                PK: `MERCHANT#${merchantId}`,
                SK: `SYNC#${p.toUpperCase()}`,
                status: "in_progress",
                percent: 0,
                sinceDate: thirtyDaysAgo,
                updatedAt: timestamp,
              },
            }),
          ),
        ),
      );

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shopifyQueueUrl,
          MessageBody: JSON.stringify({
            type: "SHOPIFY_SYNC",
            merchantId,
            mode: "incremental",
            sinceDate: thirtyDaysAgo,
          }),
        }),
      );

      res.json({
        success: true,
        message: "Sync triggered! Refreshing data...",
      });
    } catch (err) {
      console.error("Manual Sync Trigger Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // ── "Fetch 1 Year Data" Button (Full 1-Year Pipeline) ────────────
  async startHistoricalSync(req, res) {
    try {
      const merchantId = req.user.userId;

      // Sync already running check
      const syncStatus = await syncService.getSyncStatus(merchantId);
      if (syncStatus.shopify?.status === "in_progress") {
        return res.json({
          success: false,
          message: "Sync already running. Please wait.",
        });
      }

      // 1 Year ago date
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const sinceDate = oneYearAgo.toISOString();

      // Trigger Shopify (1 Year) -> Jo aage Meta (1 Year) -> Shiprocket (1 Year) chain chalayega
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: shopifyQueueUrl,
          MessageBody: JSON.stringify({
            type: "SHOPIFY_SYNC",
            merchantId,
            sinceDate: sinceDate,
            mode: "historical",
            affectedDates: [],
          }),
        }),
      );

      console.log(
        `📡 1-Year Historical sync triggered for merchant: ${merchantId}`,
      );
      return res.json({
        success: true,
        message: "1-Year historical sync started in background!",
      });
    } catch (error) {
      console.error("Historical sync error:", error.message);
      return res.status(500).json({ error: "Failed to start historical sync" });
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
