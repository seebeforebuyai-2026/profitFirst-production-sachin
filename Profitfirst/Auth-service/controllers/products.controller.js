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
      const { limit = 50, lastKey } = req.query;
      
      // 🟢 Decode base64 lastKey back to JSON for DynamoDB
      const exclusiveStartKey = lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : null;

      const result = await productsService.getVariantsList(req.user.userId, parseInt(limit), exclusiveStartKey);
      
      // 🟢 Encode LastEvaluatedKey to base64 for frontend safety
      if (result.lastKey) {
        result.lastKey = Buffer.from(JSON.stringify(result.lastKey)).toString('base64');
      }

      res.json(result);
    } catch (error) { res.status(500).json({ error: error.message }); }
  }

  async saveCogs(req, res) {
    try {
      await productsService.saveCogsBatch(req.user.userId, req.body.variants);
      res.json({ success: true, cogsCompleted: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  }
}

module.exports = new ProductsController();