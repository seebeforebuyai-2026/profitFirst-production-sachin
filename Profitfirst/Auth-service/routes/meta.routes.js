/**
 * Meta/Facebook Ads Routes
 */

const express = require('express');
const router = express.Router();
const metaController = require('../controllers/meta.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// POST /api/meta/connect - Initiate OAuth flow (for onboarding)
router.post('/connect', authenticateToken, metaController.initiateOAuth);

// GET /api/meta/callback - OAuth callback from Facebook
router.get('/callback', metaController.handleCallback);

// GET /api/meta/connection - Get connection status (for onboarding)
router.get('/connection', authenticateToken, metaController.getConnection);

// POST /api/meta/select-account - Select ad account (for onboarding)
router.post('/select-account', authenticateToken, metaController.selectAdAccount);

module.exports = router;
