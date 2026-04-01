const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

router.post('/add', authenticateToken, expenseController.create);
router.get('/list', authenticateToken, expenseController.list);

module.exports = router;