const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// GET /api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', authenticateToken, dashboardController.getSummary);

module.exports = router;