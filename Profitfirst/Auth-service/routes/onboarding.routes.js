/**
 * Onboarding Routes
 * 
 * Defines all onboarding-related API endpoints
 */

const express = require('express');
const onboardingController = require('../controllers/onboarding.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Shopify OAuth callback (public route - no auth required)
router.get('/shopify/callback', onboardingController.handleShopifyCallback);

// All other onboarding routes require authentication
router.use(authenticateToken);

// Get current onboarding step
router.get('/step', onboardingController.getCurrentStep);

// Update onboarding step
router.post('/step', onboardingController.updateStep);

// Complete onboarding
router.post('/complete', onboardingController.completeOnboarding);

// Get onboarding data
router.get('/data', onboardingController.getOnboardingData);

// Proxy to get Shopify access token (for onboarding)
router.get('/proxy/token', onboardingController.getProxyToken);

// Connect shipping platform (Step 5)
router.post('/step5', onboardingController.connectShipping);

module.exports = router;
