/**
 * Onboarding Service - Production Ready
 * 
 * Handles onboarding with proper INTEGRATION and PRODUCT/VARIANT structure
 * Uses new DynamoDB service for all database operations
 * 
 * ONBOARDING FLOW:
 * Step 1: Business Info (stored in PROFILE)
 * Step 2: Shopify Integration (INTEGRATION#SHOPIFY)
 * Step 3: Meta Ads Integration (INTEGRATION#META)
 * Step 4: Shiprocket Integration (INTEGRATION#SHIPROCKET)
 * Step 5: Product COGS (PRODUCT + VARIANT records)
 */

const dynamodbService = require('./dynamodb.service');

class OnboardingService {
  /**
   * Get User Onboarding Status
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @returns {Object} Onboarding data with integrations
   */
  async getOnboardingStatus(merchantId) {
    try {
      // Get user profile
      const profileResult = await dynamodbService.getUserProfile(merchantId);
      
      if (!profileResult.success) {
        return {
          success: true,
          data: {
            currentStep: 1,
            isCompleted: false,
            integrations: {},
            products: [],
            variants: []
          }
        };
      }

      // Get all integrations
      const integrationsResult = await dynamodbService.getIntegrationsByMerchant(merchantId);
      const integrations = {};
      
      if (integrationsResult.success) {
        integrationsResult.data.forEach(integration => {
          integrations[integration.platform] = {
            status: integration.status,
            connectedAt: integration.connectedAt
          };
        });
      }

      // Get products and variants
      const productsResult = await dynamodbService.getProductsByMerchant(merchantId);
      const variantsResult = await dynamodbService.getVariantsByMerchant(merchantId);

      return {
        success: true,
        data: {
          currentStep: profileResult.data.onboardingStep || 1,
          isCompleted: profileResult.data.onboardingCompleted || false,
          integrations: integrations,
          products: productsResult.success ? productsResult.data : [],
          variants: variantsResult.success ? variantsResult.data : []
        }
      };
    } catch (error) {
      console.error('Get onboarding status error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update Onboarding Step 1: Business Info
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @param {Object} businessData - Business information
   * @returns {Object} Success status
   */
  async updateStep1BusinessInfo(merchantId, businessData) {
    try {
      console.log(`📝 Step 1: Updating business info for merchant: ${merchantId}`);
      console.log(`📋 Received business data:`, businessData);

      // Build updates object with only defined values
      const updates = {
        onboardingStep: 2,
        step1CompletedAt: new Date().toISOString()
      };

      // Map frontend fields to backend fields (only if they exist)
      if (businessData.fullName) {
        updates.businessName = businessData.fullName;
      } else if (businessData.businessName) {
        updates.businessName = businessData.businessName;
      }

      if (businessData.industry) {
        updates.businessType = businessData.industry;
      } else if (businessData.businessType) {
        updates.businessType = businessData.businessType;
      }

      // Add other fields if they exist
      if (businessData.email) updates.email = businessData.email;
      if (businessData.phone) updates.phone = businessData.phone;
      if (businessData.whatsapp) updates.whatsapp = businessData.whatsapp;
      if (businessData.referral) updates.referral = businessData.referral;

      console.log(`📋 Updates to be sent:`, updates);

      const result = await dynamodbService.updateUserProfileOnboarding(merchantId, updates);
      
      if (!result.success) {
        console.error(`❌ Step 1 failed:`, result.error);
        return { success: false, error: result.error };
      }
      
      console.log(`✅ Step 1 completed: Business info saved`);

      return {
        success: true,
        data: {
          currentStep: 2,
          businessInfo: {
            businessName: updates.businessName,
            businessType: updates.businessType,
            email: updates.email,
            phone: updates.phone,
            whatsapp: updates.whatsapp,
            referral: updates.referral
          }
        }
      };
    } catch (error) {
      console.error(`❌ Step 1 error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update Onboarding Step 2: Shopify Integration (External OAuth Service)
   * 
   * Works with external OAuth service at profitfirst.co.in
   * Handles access token received from external service
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @param {Object} shopifyData - Shopify credentials from external service
   * @returns {Object} Success status
   */
  async updateStep2ShopifyIntegration(merchantId, shopifyData) {
    try {
      console.log(`📝 Step 2: Processing Shopify integration for merchant: ${merchantId}`);
      console.log(`🔗 Shopify store: ${shopifyData.shopifyStore}`);
      console.log(`🔧 Mode: ${shopifyData.installationMode || 'external'}`);

      // Validate required fields
      if (!shopifyData.shopifyStore) {
        return { 
          success: false, 
          error: 'Shopify store URL is required' 
        };
      }

      // Validate Shopify URL format
      const isValidUrl = this.isValidShopifyUrl(shopifyData.shopifyStore);
      if (!isValidUrl) {
        console.log(`❌ Invalid Shopify URL format: ${shopifyData.shopifyStore}`);
        return { 
          success: false, 
          error: 'Invalid Shopify URL format. Must be: yourstore.myshopify.com' 
        };
      }

      console.log(`✅ Shopify URL format is valid`);

      // If we have an access token, verify and save it
      if (shopifyData.accessToken) {
        console.log(`🔑 Access token provided, verifying...`);
        
        // Test credentials with Shopify API
        const credentialsTest = await this.testShopifyCredentials(shopifyData);
        
        if (!credentialsTest.success) {
          console.log(`❌ Shopify credentials test failed: ${credentialsTest.error}`);
          return { 
            success: false, 
            error: `Shopify connection failed: ${credentialsTest.error}` 
          };
        }

        console.log(`✅ Shopify credentials are valid`);
        console.log(`📊 Shop info: ${credentialsTest.shopInfo.name} (${credentialsTest.shopInfo.domain})`);

        // Save integration record
        const integrationResult = await dynamodbService.createIntegration({
          merchantId: merchantId,
          platform: 'shopify',
          credentials: {
            shopifyStore: shopifyData.shopifyStore,
            accessToken: shopifyData.accessToken, // TODO: Encrypt this
            shopName: credentialsTest.shopInfo.name,
            shopDomain: credentialsTest.shopInfo.domain,
            shopEmail: credentialsTest.shopInfo.email,
            currency: credentialsTest.shopInfo.currency,
            timezone: credentialsTest.shopInfo.timezone,
            testedAt: new Date().toISOString(),
            connectedVia: 'external_oauth' // Track how it was connected
          }
        });

        if (!integrationResult.success) {
          console.log(`❌ Failed to save integration: ${integrationResult.error}`);
          return { success: false, error: integrationResult.error };
        }

        // Update profile onboarding step
        const profileUpdates = {
          onboardingStep: 3,
          step2CompletedAt: new Date().toISOString()
        };

        await dynamodbService.updateUserProfileOnboarding(merchantId, profileUpdates);
        
        console.log(`✅ Step 2 completed: Shopify integration created and tested`);

        return {
          success: true,
          data: {
            currentStep: 3,
            connected: true,
            integration: integrationResult.data,
            shopInfo: credentialsTest.shopInfo,
            message: `Successfully connected to ${credentialsTest.shopInfo.name}!`,
            nextAction: 'continue'
          }
        };
      } else {
        // No access token provided - this is just a validation request
        console.log(`📋 No access token provided - validation only`);
        return {
          success: true,
          data: {
            validated: true,
            shopifyStore: shopifyData.shopifyStore,
            message: 'Store URL validated. Please install the app via external service.',
            nextAction: 'install_external'
          }
        };
      }
    } catch (error) {
      console.error(`❌ Step 2 error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate Shopify URL Format
   * 
   * @param {string} url - Shopify store URL
   * @returns {boolean} Is valid format
   */
  isValidShopifyUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Remove protocol if present
    const cleanUrl = url.replace(/^https?:\/\//, '').toLowerCase().trim();
    
    // Check format: storename.myshopify.com
    const shopifyRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
    
    return shopifyRegex.test(cleanUrl);
  }

  /**
   * Test Shopify Credentials
   * 
   * @param {Object} shopifyData - { shopifyStore, accessToken }
   * @returns {Object} { success, error?, shopInfo? }
   */
  async testShopifyCredentials(shopifyData) {
    try {
      const axios = require('axios');
      
      // Clean URL (remove protocol if present)
      const cleanStore = shopifyData.shopifyStore.replace(/^https?:\/\//, '');
      const shopifyUrl = `https://${cleanStore}/admin/api/2023-10/shop.json`;
      
      console.log(`🔗 Testing Shopify API: ${shopifyUrl}`);

      const response = await axios.get(shopifyUrl, {
        headers: {
          'X-Shopify-Access-Token': shopifyData.accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      if (response.status === 200 && response.data && response.data.shop) {
        const shop = response.data.shop;
        
        return {
          success: true,
          shopInfo: {
            name: shop.name,
            domain: shop.domain,
            email: shop.email,
            currency: shop.currency,
            timezone: shop.timezone,
            planName: shop.plan_name,
            country: shop.country_name,
            createdAt: shop.created_at
          }
        };
      } else {
        return {
          success: false,
          error: 'Invalid response from Shopify API'
        };
      }
    } catch (error) {
      console.error(`🔥 Shopify API test error:`, error.message);
      
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        
        switch (status) {
          case 401:
            return {
              success: false,
              error: 'Invalid access token. Please check your Shopify credentials.'
            };
          case 403:
            return {
              success: false,
              error: 'Access denied. Please ensure your app has the required permissions.'
            };
          case 404:
            return {
              success: false,
              error: 'Store not found. Please check your Shopify store URL.'
            };
          case 429:
            return {
              success: false,
              error: 'Rate limit exceeded. Please try again in a few minutes.'
            };
          default:
            return {
              success: false,
              error: `Shopify API error: ${status} ${statusText}`
            };
        }
      } else if (error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: 'Store not found. Please check your Shopify store URL.'
        };
      } else if (error.code === 'ETIMEDOUT') {
        return {
          success: false,
          error: 'Connection timeout. Please try again.'
        };
      } else {
        return {
          success: false,
          error: 'Failed to connect to Shopify. Please check your credentials.'
        };
      }
    }
  }

  /**
   * Update Onboarding Step 3: Meta Ads Integration (moved from Step 4)
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @param {Object} metaData - Meta Ads credentials
   * @returns {Object} Success status
   */
  async updateStep3MetaIntegration(merchantId, metaData) {
    try {
      console.log(`📝 Step 3: Connecting Meta Ads for merchant: ${merchantId}`);

      // Create Meta integration record
      const integrationResult = await dynamodbService.createIntegration({
        merchantId: merchantId,
        platform: 'meta',
        credentials: {
          adAccountId: metaData.adAccountId,
          accessToken: metaData.accessToken // TODO: Encrypt this
        }
      });

      if (!integrationResult.success) {
        return { success: false, error: integrationResult.error };
      }

      // Update profile onboarding step
      const profileUpdates = {
        onboardingStep: 4,
        step3CompletedAt: new Date().toISOString()
      };

      await dynamodbService.updateUserProfileOnboarding(merchantId, profileUpdates);
      
      console.log(`✅ Step 3 completed: Meta Ads integration created`);

      return {
        success: true,
        data: {
          currentStep: 4,
          integration: integrationResult.data
        }
      };
    } catch (error) {
      console.error(`❌ Step 3 error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update Onboarding Step 4: Shiprocket Integration (moved from Step 5)
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @param {Object} shiprocketData - Shiprocket credentials
   * @returns {Object} Success status
   */
  async updateStep4ShiprocketIntegration(merchantId, shiprocketData) {
    try {
      console.log(`📝 Step 4: Connecting Shiprocket for merchant: ${merchantId}`);

      // Create Shiprocket integration record
      const integrationResult = await dynamodbService.createIntegration({
        merchantId: merchantId,
        platform: 'shiprocket',
        credentials: {
          email: shiprocketData.email,
          token: shiprocketData.token // TODO: Encrypt this
        }
      });

      if (!integrationResult.success) {
        return { success: false, error: integrationResult.error };
      }

      // Update profile onboarding step
      const profileUpdates = {
        onboardingStep: 5,
        step4CompletedAt: new Date().toISOString()
      };

      await dynamodbService.updateUserProfileOnboarding(merchantId, profileUpdates);
      
      console.log(`✅ Step 4 completed: Shiprocket integration created`);

      return {
        success: true,
        data: {
          currentStep: 5,
          integration: integrationResult.data
        }
      };
    } catch (error) {
      console.error(`❌ Step 4 error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update Onboarding Step 5: Product COGS Setup (moved from Step 3)
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @param {Object} productData - Product and variants with COGS
   * @returns {Object} Success status
   */
  async updateStep5ProductCOGS(merchantId, productData) {
    try {
      console.log(`📝 Step 5: Adding product COGS for merchant: ${merchantId}`);

      const results = {
        products: [],
        variants: []
      };

      // Create product record (info only)
      const productResult = await dynamodbService.createProduct({
        merchantId: merchantId,
        productId: productData.productId,
        productName: productData.productName
      });

      if (!productResult.success) {
        return { success: false, error: productResult.error };
      }

      results.products.push(productResult.data);

      // Create variant records (COGS stored here)
      if (productData.variants && productData.variants.length > 0) {
        for (const variant of productData.variants) {
          const variantResult = await dynamodbService.createVariant({
            merchantId: merchantId,
            productId: productData.productId,
            variantId: variant.variantId,
            variantName: variant.variantName,
            salePrice: variant.salePrice, // Reference only
            costPrice: variant.costPrice  // COGS - this matters
          });

          if (variantResult.success) {
            results.variants.push(variantResult.data);
          }
        }
      }

      // Update profile onboarding step
      const profileUpdates = {
        onboardingStep: 6, // Completed all steps
        step5CompletedAt: new Date().toISOString()
      };

      await dynamodbService.updateUserProfileOnboarding(merchantId, profileUpdates);
      
      console.log(`✅ Step 5 completed: Product and ${results.variants.length} variants created`);

      return {
        success: true,
        data: {
          currentStep: 6, // All steps completed
          product: results.products[0],
          variants: results.variants
        }
      };
    } catch (error) {
      console.error(`❌ Step 5 error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Complete Onboarding Data
   * 
   * @param {string} merchantId - Merchant's unique ID
   * @returns {Object} Complete onboarding data with all integrations
   */
  async getOnboardingData(merchantId) {
    try {
      // Get user profile
      const profileResult = await dynamodbService.getUserProfile(merchantId);
      
      if (!profileResult.success) {
        return { success: false, error: 'User profile not found' };
      }

      // Get all integrations
      const integrationsResult = await dynamodbService.getIntegrationsByMerchant(merchantId);
      
      // Get products and variants
      const productsResult = await dynamodbService.getProductsByMerchant(merchantId);
      const variantsResult = await dynamodbService.getVariantsByMerchant(merchantId);

      return {
        success: true,
        data: {
          profile: profileResult.data,
          integrations: integrationsResult.success ? integrationsResult.data : [],
          products: productsResult.success ? productsResult.data : [],
          variants: variantsResult.success ? variantsResult.data : [],
          currentStep: profileResult.data.onboardingStep || 1,
          isCompleted: profileResult.data.onboardingCompleted || false
        }
      };
    } catch (error) {
      console.error('Get onboarding data error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Legacy method for backward compatibility
   * 
   * @deprecated Use specific step methods instead
   */
  async updateOnboardingStep(merchantId, userId, step, stepData = {}) {
    console.warn('⚠️  updateOnboardingStep is deprecated. Use specific step methods instead.');
    
    switch (step) {
      case 1:
        return this.updateStep1BusinessInfo(merchantId, stepData);
      case 2:
        return this.updateStep2ShopifyIntegration(merchantId, stepData);
      case 3:
        return this.updateStep3MetaIntegration(merchantId, stepData);
      case 4:
        return this.updateStep4ShiprocketIntegration(merchantId, stepData);
      case 5:
        return this.updateStep5ProductCOGS(merchantId, stepData);
      default:
        return { success: false, error: 'Invalid step number' };
    }
  }

  /**
   * Legacy method for backward compatibility
   * 
   * @deprecated Onboarding completes automatically in Step 5
   */
  async completeOnboarding(merchantId, userId, finalData = {}) {
    console.warn('⚠️  completeOnboarding is deprecated. Onboarding completes automatically in Step 5.');
    
    const profileUpdates = {
      onboardingCompleted: true,
      onboardingStep: 6
    };

    const result = await dynamodbService.updateUserProfileOnboarding(merchantId, profileUpdates);
    
    return {
      success: true,
      message: 'Onboarding completed successfully'
    };
  }
}

module.exports = new OnboardingService();
