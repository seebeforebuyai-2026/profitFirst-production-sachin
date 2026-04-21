const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// 🟢 Point strictly to the controller
router.post('/start-initial', authenticateToken, syncController.triggerSync);
router.get('/status', authenticateToken, syncController.getStatus);
router.post('/manual', authenticateToken, syncController.triggerManualSync);

module.exports = router;