const syncService = require('../services/sync.service');

class SyncController {
  async triggerSync(req, res) {
    try {
      const result = await syncService.startInitialSync(req.user.userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
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