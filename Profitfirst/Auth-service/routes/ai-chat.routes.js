const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/ai-chat.controller');
const auth = require('../middleware/auth.middleware'); // 👈 Change variable name to 'auth'
const dynamoDBService = require("../services/dynamodb.service");

// 🟢 Logic: Dhoondho asli function kaunsa hai
// Agar 'auth' khud function hai toh wo use karo, varna uske andar ka 'verifyToken' ya 'authMiddleware'
const verify = typeof auth === 'function' ? auth : (auth.verifyToken || auth.authMiddleware || Object.values(auth)[0]);


// 🟢 Route Fix
router.post('/chat', verify, (req, res) => {
    return aiChatController.handleChat(req, res);
});
router.delete('/clear', verify, aiChatController.clearHistory);

router.get('/history', verify, async (req, res) => {
    try {
        const history = await dynamoDBService.getChatHistory(req.user.userId, 20);
        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;