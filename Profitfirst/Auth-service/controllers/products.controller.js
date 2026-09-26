const productsService = require("../services/products.service");

class ProductsController {
  async triggerProductFetch(req, res) {
    try {
      await productsService.queueProductFetch(req.user.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getProductsList(req, res) {
    try {
      const merchantId = req.user.userId;
      const { limit = 50, lastKey } = req.query;

      let exclusiveStartKey = null;

      // 🟢 Safer Decoding: Handle edge cases where lastKey is a string "null" or "undefined"
      if (
        lastKey &&
        lastKey !== "null" &&
        lastKey !== "undefined" &&
        lastKey !== ""
      ) {
        try {
          const decoded = Buffer.from(lastKey, "base64").toString("utf8");
          exclusiveStartKey = JSON.parse(decoded);
        } catch (e) {
          console.error("⚠️ Invalid lastKey format, starting from page 1");
          exclusiveStartKey = null;
        }
      }

      const result = await productsService.getVariantsList(
        merchantId,
        parseInt(limit),
        exclusiveStartKey,
      );

      // 🟢 Safer Encoding
      let encodedLastKey = null;
      if (result.lastKey) {
        encodedLastKey = Buffer.from(JSON.stringify(result.lastKey)).toString(
          "base64",
        );
      }

      res.json({
        success: true,
        variants: result.variants,
        lastKey: encodedLastKey,
      });
    } catch (error) {
      console.error("❌ List API error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
  async saveCogs(req, res) {
    try {
      await productsService.saveCogsBatch(req.user.userId, req.body.variants);
      res.json({ success: true, cogsCompleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getTopSelling(req, res) {
    try {
      const merchantId = req.user.userId;
      const result = await productsService.getTopSellingProducts(merchantId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async saveCogsBulk(req, res) {
    try {
      const merchantId = req.user.userId; // 🟢 1. merchantId extract karein
      const { exactVariants, bulkPercent, bulkVariantIds } = req.body;

      // 🟢 2. Pehle COGS ko DynamoDB VARIANT# me save hone dein
      await productsService.saveCogsBulk(
        merchantId,
        exactVariants,
        bulkPercent,
        bulkVariantIds,
      );

      // 🟢 3. Ab last 30 days ke orders ko naye COGS ke sath re-stamp karne ke liye trigger karein
      try {
        const { sqsClient, shopifyQueueUrl } = require("../config/aws.config");
        const { SendMessageCommand } = require("@aws-sdk/client-sqs");

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: shopifyQueueUrl,
            MessageBody: JSON.stringify({
              type: "SHOPIFY_SYNC",
              merchantId: merchantId,
              sinceDate: thirtyDaysAgo.toISOString(),
              mode: "shopify_onboarding", // Direct to summary taaki turant P&L recalculate ho
              affectedDates: [],
            }),
          }),
        );
        console.log(`📡 Orders re-stamped with new COGS for ${merchantId}`);
      } catch (sqsErr) {
        console.warn("COGS sync trigger warning:", sqsErr.message);
      }

      return res.json({
        success: true,
        message: "COGS saved and recalculation started",
      });
    } catch (error) {
      console.error("saveCogsBulk error:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ProductsController();
