
const onboardingService = require('../services/onboarding.service');

class OnboardingController {
  
  async getCurrentStep(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // In new schema, merchantId = userId

      const result = await onboardingService.getOnboardingStatus(merchantId);

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      res.status(200).json({
        step: result.data.currentStep,
        isCompleted: result.data.isCompleted,
        integrations: result.data.integrations,
        products: result.data.products,
        variants: result.data.variants
      });
    } catch (error) {
      console.error('Get current step error:', error);
      res.status(500).json({ error: 'Failed to get onboarding step' });
    }
  }

  async updateStep(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // In new schema, merchantId = userId
      const { step, data } = req.body;

      if (!step || step < 1 || step > 5) {
        return res.status(400).json({ error: 'Invalid step number' });
      }

      let result;

      // Route to specific step methods
      switch (step) {
        case 1:
          result = await onboardingService.updateStep1BusinessInfo(merchantId, data);
          break;
        case 2:
          result = await onboardingService.updateStep2ShopifyIntegration(merchantId, data);
          break;
        case 3:
          result = await onboardingService.updateStep3MetaIntegration(merchantId, data);
          break;
        case 4:
          result = await onboardingService.updateStep4ShiprocketIntegration(merchantId, data);
          break;
        case 5:
          result = await onboardingService.updateStep5ProductCOGS(merchantId, data);
          break;
        default:
          return res.status(400).json({ error: 'Invalid step number' });
      }

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(200).json({
        message: `Step ${step} completed successfully`,
        currentStep: result.data.currentStep,
        isCompleted: result.data.isCompleted || false,
        data: result.data
      });
    } catch (error) {
      console.error('Update step error:', error);
      res.status(500).json({ error: 'Failed to update onboarding step' });
    }
  }

 
  async completeOnboarding(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // In new schema, merchantId = userId

      const result = await onboardingService.completeOnboarding(merchantId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(200).json({
        message: 'Onboarding completed successfully',
        data: result.data
      });
    } catch (error) {
      console.error('Complete onboarding error:', error);
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  }

  
  async getOnboardingData(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // In new schema, merchantId = userId

      const result = await onboardingService.getOnboardingData(merchantId);

      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      res.status(200).json(result.data);
    } catch (error) {
      console.error('Get onboarding data error:', error);
      res.status(500).json({ error: 'Failed to get onboarding data' });
    }
  }

 
  async getProxyToken(req, res) {
    try {
      const { shop, password } = req.query;

      console.log(`\n🔍 Proxy token request received:`);
      console.log(`   Shop: ${shop}`);
      console.log(`   Password: ${password}`);

      if (!shop || !password) {
        return res.status(400).json({
          error: 'Missing required parameters',
          message: 'shop and password are required'
        });
      }

      // Call external proxy service to get access token
      const axios = require('axios');
      const externalUrl = 'https://profitfirst.co.in/token';
      
      console.log(`📡 Calling external service: ${externalUrl}`);
      console.log(`   Params: shop=${shop}, password=${password}`);
      
      const proxyResponse = await axios.get(externalUrl, {
        params: { shop, password },
        timeout: 10000 // 10 second timeout
      });

      console.log(`✅ External service response:`, {
        status: proxyResponse.status,
        data: proxyResponse.data
      });

      if (proxyResponse.data && proxyResponse.data.accessToken) {
        console.log(`✅ Access token received: ${proxyResponse.data.accessToken.substring(0, 20)}...`);
        
        res.json({
          success: true,
          accessToken: proxyResponse.data.accessToken,
          shop: shop
        });
      } else {
        console.log(`❌ No access token in response:`, proxyResponse.data);
        
        res.status(400).json({
          error: 'Failed to get access token',
          message: 'External service did not return an access token'
        });
      }
    } catch (error) {
      console.error('❌ Proxy token error:', error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data:`, error.response.data);
        
        return res.status(error.response.status).json({
          error: 'External service error',
          message: error.response.data?.message || error.message,
          details: error.response.data
        });
      }

      res.status(500).json({
        error: 'Failed to fetch token',
        message: error.message
      });
    }
  }

  async handleShopifyCallback(req, res) {
    try {
      const { code, shop, state } = req.query;

      console.log(`\n🔄 Shopify OAuth callback received`);
      console.log(`📝 Shop: ${shop}`);
      console.log(`🔑 Code: ${code ? 'received' : 'missing'}`);
      console.log(`🛡️  State: ${state}`);

      if (!code || !shop || !state) {
        console.log(`❌ Missing required callback parameters`);
        return res.status(400).json({
          error: 'Missing required parameters',
          message: 'Installation callback is invalid'
        });
      }

      // Use state as merchantId (passed during installation URL generation)
      const merchantId = state;

      // Process the callback through onboarding service
      const result = await onboardingService.updateStep2ShopifyIntegration(merchantId, {
        shopifyStore: shop,
        code: code,
        state: state,
        installationMode: 'callback'
      });

      if (!result.success) {
        console.log(`❌ Callback processing failed: ${result.error}`);
        
        // Redirect to frontend with error
        const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboarding/step2?error=${encodeURIComponent(result.error)}`;
        return res.redirect(errorUrl);
      }

      console.log(`✅ Shopify connection completed successfully`);

      // Redirect to frontend with success
      const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboarding/step2?success=true&shop=${encodeURIComponent(result.data.shopInfo.name)}`;
      res.redirect(successUrl);

    } catch (error) {
      console.error('❌ Shopify callback error:', error.message);
      
      // Redirect to frontend with error
      const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboarding/step2?error=${encodeURIComponent('Installation failed')}`;
      res.redirect(errorUrl);
    }
  }
 async connectShipping(req, res) {
    try {
      const merchantId = req.user.userId;
      const { platform, email, password, access_token, secret_key } = req.body;

      console.log(`\n🚚 Step 4: Connecting ${platform} for merchant: ${merchantId}`);

      if (platform !== 'Shiprocket') {
        return res.status(400).json({
          error: 'Unsupported platform',
          message: `Platform ${platform} is not supported yet`
        });
      }

      // 1. Validate React sent the fields
      if (!email || !password) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Email and password are required for Shiprocket'
        });
      }
        
      // 2. Prepare data for our Service
      const shiprocketData = {
        email: email,
        password: password
      };

      // 3. Let the Service handle the API call, token generation, and encryption!
      const result = await onboardingService.updateStep4ShiprocketIntegration(merchantId, shiprocketData);

      if (!result.success) {
        // This will catch the "Invalid credentials" error from the service
        return res.status(400).json({ message: result.error });
      }

      console.log(`✅ ${platform} connected successfully via Onboarding Step 4`);

      res.status(200).json({
        success: true,
        message: `${platform} connected successfully`,
        platform: platform,
        currentStep: result.data.currentStep,
        data: result.data
      });

    } catch (error) {
      console.error('❌ Step 4 shipping connection error:', error.message);
      res.status(500).json({
        error: 'Failed to connect shipping platform',
        message: error.message
      });
    }
  }
}

module.exports = new OnboardingController();
