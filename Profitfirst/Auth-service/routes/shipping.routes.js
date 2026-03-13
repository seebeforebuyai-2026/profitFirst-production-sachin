/**
 * Shipping Platform Routes
 */

const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/shipping.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// POST /api/shipping/connect - Connect shipping platform (for onboarding)
router.post('/connect', authenticateToken, shippingController.connectPlatform);

// GET /api/shipping/connection - Get connection status (for onboarding)
router.get('/connection', authenticateToken, shippingController.getConnection);

// DELETE /api/shipping/disconnect - Disconnect platform
router.delete('/disconnect', authenticateToken, shippingController.disconnect);

module.exports = router;
