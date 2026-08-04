const express = require("express");
const router  = express.Router();
const { authenticateToken } = require("../middleware/auth.middleware");
const paymentController     = require("../controllers/payment.controller");

// Public routes (no auth needed)
router.get ("/plans",           paymentController.getPlans);

// Cashfree webhook — no JWT, but signature-verified inside controller
// IMPORTANT: Must use express.raw or express.json BEFORE this route in Server.js
// We handle raw body via req.body (already JSON-parsed by express.json middleware)
router.post("/webhook",         paymentController.webhook);

// Protected routes (require login)
router.post("/create-order",    authenticateToken, paymentController.createOrder);
router.get ("/verify/:orderId", authenticateToken, paymentController.verifyPayment);
router.get ("/subscription",    authenticateToken, paymentController.getSubscription);

module.exports = router;
