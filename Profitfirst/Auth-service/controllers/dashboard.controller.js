const dashboardService = require('../services/dashboard.service');

class DashboardController {
  async getSummary(req, res) {
    try {
      const { from, to } = req.query;
      const merchantId = req.user.userId;

      if (!from || !to) {
        return res.status(400).json({ error: "Date range (from, to) is required." });
      }

      const result = await dashboardService.getAggregatedSummary(merchantId, from, to);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new DashboardController();