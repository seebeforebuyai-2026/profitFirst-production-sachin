const productsService = require('../services/products.service');

class ProductsController {
  async triggerProductFetch(req, res) {
    try {
      await productsService.queueProductFetch(req.user.userId);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  }

async getProductsList(req, res) {
    try {
      const merchantId = req.user.userId;
      const { limit = 50, lastKey } = req.query;
      
      let exclusiveStartKey = null;
      
      // 🟢 Safer Decoding: Handle edge cases where lastKey is a string "null" or "undefined"
      if (lastKey && lastKey !== 'null' && lastKey !== 'undefined' && lastKey !== '') {
        try {
          const decoded = Buffer.from(lastKey, 'base64').toString('utf8');
          exclusiveStartKey = JSON.parse(decoded);
        } catch (e) {
          console.error("⚠️ Invalid lastKey format, starting from page 1");
          exclusiveStartKey = null;
        }
      }

      const result = await productsService.getVariantsList(merchantId, parseInt(limit), exclusiveStartKey);
      
      // 🟢 Safer Encoding
      let encodedLastKey = null;
      if (result.lastKey) {
        encodedLastKey = Buffer.from(JSON.stringify(result.lastKey)).toString('base64');
      }

      res.json({
        success: true,
        variants: result.variants,
        lastKey: encodedLastKey
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
    } catch (error) { res.status(500).json({ error: error.message }); }
  }
}

module.exports = new ProductsController();