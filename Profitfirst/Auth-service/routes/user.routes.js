const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// GET /api/user/business-expenses
router.get('/business-expenses', authenticateToken, userController.getBusinessExpenses);
router.get('/full-profile', authenticateToken, userController.getFullProfile);

// POST /api/user/business-expenses
router.post('/business-expenses', authenticateToken, userController.updateBusinessExpenses);

module.exports = router;