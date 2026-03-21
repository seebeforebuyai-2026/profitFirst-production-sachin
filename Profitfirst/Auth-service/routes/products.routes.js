const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');
const { authenticateToken } = require('../middleware/auth.middleware'); // ✅ FIXED NAME

// All routes are protected
router.post('/trigger-fetch', authenticateToken, productsController.triggerProductFetch);
router.get('/list', authenticateToken, productsController.getProductsList);
router.post('/save-cogs', authenticateToken, productsController.saveCogs);

module.exports = router;