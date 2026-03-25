/**
 * DynamoDB Service - New Single Table Design
 * 
 * Handles all database operations for ProfitFirst
 * Uses DynamoDB Document Client for simplified data operations
 * 
 * TABLE: ProfitFirst_Core
 * PK = MERCHANT#<merchantId>
 * SK = ENTITY#<entityId>
 */

const { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');
const { ENTITY_TYPES, PK_PATTERNS, SK_PATTERNS } = require('../config/dynamodb.schema');

class DynamoDBService {
  /**
   * Create or Update User
   * 
   * @param {Object} userData - User information
   * @returns {Object} Success status and user data/error
   */
  async createUser(userData) {
    try {
      // CRITICAL: Never generate new UUID - always require userId to be passed
      if (!userData.userId) {
        throw new Error('userId is required - cannot create user without Cognito user ID');
      }
      
      const userId = userData.userId; // Must be Cognito sub
      const timestamp = new Date().toISOString();
      const isVerified = userData.isVerified || false;

      const user = {
        PK: PK_PATTERNS.MERCHANT(userData.merchantId),
        SK: SK_PATTERNS.USER(userId),
        entityType: ENTITY_TYPES.USER,
        merchantId: userData.merchantId,
        userId: userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        authProvider: userData.authProvider || 'cognito',
        isVerified: isVerified,
        onboardingCompleted: userData.onboardingCompleted || false,
        onboardingStep: userData.onboardingStep || 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLogin: null
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: user,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      });

      await newDynamoDB.send(command);
      return { success: true, data: user };
    } catch (error) {
      console.error('newDynamoDB createUser error:', error);
      if (error.name === 'ConditionalCheckFailedException') {
        return { success: false, error: 'User already exists' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Get User by Email
   * 
   * @param {string} email - User's email address
   * @returns {Object} Success status and user data/error
   */
  async getUserByEmail(email) {
    try {
      const command = new ScanCommand({
        TableName: newTableName,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email
        },
        Limit: 1
      });

      const result = await newDynamoDB.send(command);

      if (result.Items && result.Items.length > 0) {
        return { success: true, data: result.Items[0] };
      }
      return { success: false, error: 'User not found' };
    } catch (error) {
      console.error('newDynamoDB getUserByEmail error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get User by ID
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} userId - User ID
   * @returns {Object} Success status and user data/error
   */
  async getUserById(merchantId, userId) {
    try {
      const command = new GetCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: SK_PATTERNS.USER(userId)
        }
      });

      const result = await newDynamoDB.send(command);

      if (result.Item) {
        return { success: true, data: result.Item };
      }
      return { success: false, error: 'User not found' };
    } catch (error) {
      console.error('newDynamoDB getUserById error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update User Verification Status
   * 
   * @param {string} email - User's email address
   * @param {boolean} isVerified - Verification status
   * @returns {Object} Success status and updated user data/error
   */
  async updateUserVerification(email, isVerified) {
    try {
      const userResult = await this.getUserByEmail(email);
      if (!userResult.success) {
        return { success: false, error: 'User not found' };
      }

      const command = new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: userResult.data.PK,
          SK: userResult.data.SK
        },
        UpdateExpression: 'SET isVerified = :verified, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':verified': isVerified,
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Attributes };
    } catch (error) {
      console.error('newDynamoDB updateUserVerification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update User Onboarding Status
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} userId - User ID
   * @param {Object} updates - Onboarding updates
   * @returns {Object} Success status and updated user data/error
   */
  async updateUserOnboarding(merchantId, userId, updates) {
    try {
      const command = new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: SK_PATTERNS.USER(userId)
        },
        UpdateExpression: 'SET #attr = :value, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#attr': Object.keys(updates)[0]
        },
        ExpressionAttributeValues: {
          ':value': Object.values(updates)[0],
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Attributes };
    } catch (error) {
      console.error('newDynamoDB updateUserOnboarding error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Shopify Order
   * 
   * @param {Object} orderData - Order information
   * @returns {Object} Success status and order data/error
   */
  async saveOrder(orderData) {
    try {
      const timestamp = new Date().toISOString();
      
      const order = {
        PK: PK_PATTERNS.MERCHANT(orderData.merchantId),
        SK: SK_PATTERNS.ORDER(orderData.orderId),
        entityType: ENTITY_TYPES.ORDER,
        merchantId: orderData.merchantId,
        orderId: orderData.orderId,
        shopifyOrderId: orderData.shopifyOrderId,
        orderTotal: orderData.orderTotal,
        currency: orderData.currency,
        orderStatus: orderData.orderStatus,
        fulfillmentStatus: orderData.fulfillmentStatus,
        paymentType: orderData.paymentType || 'prepaid',
        products: orderData.products || [],
        cogsAtSale: orderData.cogsAtSale || 0,
        shippingFee: orderData.shippingFee || 0,
        createdAt: orderData.createdAt || timestamp,
        updatedAt: timestamp,
        orderTimeline: orderData.orderTimeline || {}
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: order
      });

      await newDynamoDB.send(command);
      return { success: true, data: order };
    } catch (error) {
      console.error('newDynamoDB saveOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Product
   * 
   * @param {Object} productData - Product information
   * @returns {Object} Success status and product data/error
   */
  async saveProduct(productData) {
    try {
      const product = {
        PK: PK_PATTERNS.MERCHANT(productData.merchantId),
        SK: SK_PATTERNS.PRODUCT(productData.productId),
        entityType: ENTITY_TYPES.PRODUCT,
        merchantId: productData.merchantId,
        productId: productData.productId,
        shopifyProductId: productData.shopifyProductId,
        productName: productData.productName,
        costPrice: productData.costPrice,
        variants: productData.variants || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: product
      });

      await newDynamoDB.send(command);
      return { success: true, data: product };
    } catch (error) {
      console.error('newDynamoDB saveProduct error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Shipment
   * 
   * @param {Object} shipmentData - Shipment information
   * @returns {Object} Success status and shipment data/error
   */
  async saveShipment(shipmentData) {
    try {
      const shipment = {
        PK: PK_PATTERNS.MERCHANT(shipmentData.merchantId),
        SK: SK_PATTERNS.SHIPMENT(shipmentData.shipmentId),
        entityType: ENTITY_TYPES.SHIPMENT,
        merchantId: shipmentData.merchantId,
        shipmentId: shipmentData.shipmentId,
        shiprocketShipmentId: shipmentData.shiprocketShipmentId,
        orderId: shipmentData.orderId,
        orderStatus: shipmentData.orderStatus,
        shippingFee: shipmentData.shippingFee,
        deliveryStatus: shipmentData.deliveryStatus,
        awbCode: shipmentData.awbCode || '',
        carrier: shipmentData.carrier || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: shipment
      });

      await newDynamoDB.send(command);
      return { success: true, data: shipment };
    } catch (error) {
      console.error('newDynamoDB saveShipment error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Meta Ads Data
   * 
   * @param {Object} adsData - Ads information
   * @returns {Object} Success status and ads data/error
   */
  async saveAdsData(adsData) {
    try {
      const ads = {
        PK: PK_PATTERNS.MERCHANT(adsData.merchantId),
        SK: SK_PATTERNS.ADS(adsData.campaignId),
        entityType: ENTITY_TYPES.ADS,
        merchantId: adsData.merchantId,
        campaignId: adsData.campaignId,
        metaCampaignId: adsData.metaCampaignId,
        campaignName: adsData.campaignName,
        spend: adsData.spend,
        impressions: adsData.impressions,
        clicks: adsData.clicks,
        date: adsData.date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: ads
      });

      await newDynamoDB.send(command);
      return { success: true, data: ads };
    } catch (error) {
      console.error('newDynamoDB saveAdsData error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Business Expense
   * 
   * @param {Object} expenseData - Expense information
   * @returns {Object} Success status and expense data/error
   */
  async saveExpense(expenseData) {
    try {
      const expense = {
        PK: PK_PATTERNS.MERCHANT(expenseData.merchantId),
        SK: SK_PATTERNS.EXPENSE(expenseData.expenseId),
        entityType: ENTITY_TYPES.EXPENSE,
        merchantId: expenseData.merchantId,
        expenseId: expenseData.expenseId,
        expenseType: expenseData.expenseType,
        amount: expenseData.amount,
        date: expenseData.date,
        description: expenseData.description,
        category: expenseData.category || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: expense
      });

      await newDynamoDB.send(command);
      return { success: true, data: expense };
    } catch (error) {
      console.error('newDynamoDB saveExpense error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Daily Summary
   * 
   * @param {Object} summaryData - Summary information
   * @returns {Object} Success status and summary data/error
   */
  async saveDailySummary(summaryData) {
    try {
      const summary = {
        PK: PK_PATTERNS.MERCHANT(summaryData.merchantId),
        SK: SK_PATTERNS.SUMMARY(summaryData.date),
        entityType: ENTITY_TYPES.SUMMARY,
        merchantId: summaryData.merchantId,
        date: summaryData.date,
        revenueEarned: summaryData.revenueEarned,
        adsSpend: summaryData.adsSpend,
        shippingSpend: summaryData.shippingSpend,
        cogs: summaryData.cogs,
        profit: summaryData.profit,
        totalOrders: summaryData.totalOrders || 0,
        deliveredOrders: summaryData.deliveredOrders || 0,
        rtoCount: summaryData.rtoCount || 0,
        cancelledOrders: summaryData.cancelledOrders || 0,
        businessExpenses: summaryData.businessExpenses || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: summary
      });

      await newDynamoDB.send(command);
      return { success: true, data: summary };
    } catch (error) {
      console.error('newDynamoDB saveDailySummary error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Integration Status
   * 
   * @param {Object} integrationData - Integration status
   * @returns {Object} Success status and integration data/error
   */
  async saveIntegrationStatus(integrationData) {
    try {
      const integration = {
        PK: PK_PATTERNS.MERCHANT(integrationData.merchantId),
        SK: SK_PATTERNS.INTEGRATION(integrationData.platform),
        entityType: ENTITY_TYPES.INTEGRATION,
        merchantId: integrationData.merchantId,
        platform: integrationData.platform,
        lastSyncTime: integrationData.lastSyncTime,
        syncStatus: integrationData.syncStatus,
        lastError: integrationData.lastError || '',
        ordersSynced: integrationData.ordersSynced || 0,
        productsSynced: integrationData.productsSynced || 0,
        shipmentsSynced: integrationData.shipmentsSynced || 0,
        adsSynced: integrationData.adsSynced || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: integration
      });

      await newDynamoDB.send(command);
      return { success: true, data: integration };
    } catch (error) {
      console.error('newDynamoDB saveIntegrationStatus error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Daily Summary
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Object} Success status and summary data/error
   */
  async getDailySummary(merchantId, date) {
    try {
      const command = new GetCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: SK_PATTERNS.SUMMARY(date)
        }
      });

      const result = await newDynamoDB.send(command);

      if (result.Item) {
        return { success: true, data: result.Item };
      }
      return { success: false, error: 'Summary not found' };
    } catch (error) {
      console.error('newDynamoDB getDailySummary error:', error);
      return { success: false, error: error.message };
    }
  }

  
  async getIntegrationStatus(merchantId, platform) {
    try {
      const command = new GetCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: `INTEGRATION#${platform.toUpperCase()}` 
          // SK: SK_PATTERNS.INTEGRATION(platform)
        }
      });

      const result = await newDynamoDB.send(command);

      if (result.Item) {
        return { success: true, data: result.Item };
      }
      return { success: false, error: 'Integration status not found' };
    } catch (error) {
      console.error('newDynamoDB getIntegrationStatus error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Orders for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @param {Object} options - Query options
   * @returns {Object} Success status and orders data/error
   */
  async getOrdersByMerchant(merchantId, options = {}) {
    try {
      const { limit = 100, startDate, endDate } = options;
      
      const params = {
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'ORDER#'
        },
        Limit: limit
      };

      if (startDate) {
        params.FilterExpression = 'orderCreatedAt >= :startDate';
        params.ExpressionAttributeValues[':startDate'] = startDate;
      }

      const command = new QueryCommand(params);
      const result = await newDynamoDB.send(command);

      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getOrdersByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Shipments for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and shipments data/error
   */
  async getShipmentsByMerchant(merchantId) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'SHIPMENT#'
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getShipmentsByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Products for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and products data/error
   */
  async getProductsByMerchant(merchantId) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'PRODUCT#'
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getProductsByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Expenses for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and expenses data/error
   */
  async getExpensesByMerchant(merchantId) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'EXPENSE#'
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getExpensesByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Ads Data for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Object} Success status and ads data/error
   */
  async getAdsDataByMerchant(merchantId, startDate, endDate) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'date >= :startDate AND date <= :endDate',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'ADS#',
          ':startDate': startDate,
          ':endDate': endDate
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getAdsDataByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Daily Summaries for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Object} Success status and summaries data/error
   */
  async getSummariesByMerchant(merchantId, startDate, endDate) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'date >= :startDate AND date <= :endDate',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'SUMMARY#',
          ':startDate': startDate,
          ':endDate': endDate
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getSummariesByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Integration Record (for onboarding)
   * 
   * @param {Object} integrationData - Integration credentials and info
   * @returns {Object} Success status and integration data/error
   */
  async createIntegration(integrationData) {
    try {
      const timestamp = new Date().toISOString();
      
      const integration = {
        PK: PK_PATTERNS.MERCHANT(integrationData.merchantId),
        SK: SK_PATTERNS.INTEGRATION(integrationData.platform.toUpperCase()),
        entityType: ENTITY_TYPES.INTEGRATION,
        merchantId: integrationData.merchantId,
        platform: integrationData.platform.toLowerCase(),
        status: 'active',
        connectedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...integrationData.credentials // Spread platform-specific credentials
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: integration
      });

      await newDynamoDB.send(command);
      return { success: true, data: integration };
    } catch (error) {
      console.error('newDynamoDB createIntegration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Product Record (for Step 3 - Product Info Only)
   * 
   * @param {Object} productData - Product information (no variants)
   * @returns {Object} Success status and product data/error
   */
  async createProduct(productData) {
    try {
      const timestamp = new Date().toISOString();
      
      const product = {
        PK: PK_PATTERNS.MERCHANT(productData.merchantId),
        SK: SK_PATTERNS.PRODUCT(productData.productId),
        entityType: ENTITY_TYPES.PRODUCT,
        merchantId: productData.merchantId,
        productId: productData.productId,
        productName: productData.productName,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: product,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      });

      await newDynamoDB.send(command);
      return { success: true, data: product };
    } catch (error) {
      console.error('newDynamoDB createProduct error:', error);
      if (error.name === 'ConditionalCheckFailedException') {
        return { success: false, error: 'Product already exists' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Variant Record (for Step 3 - COGS stored here)
   * 
   * @param {Object} variantData - Variant information with COGS
   * @returns {Object} Success status and variant data/error
   */
  async createVariant(variantData) {
    try {
      const timestamp = new Date().toISOString();
      
      const variant = {
        PK: PK_PATTERNS.MERCHANT(variantData.merchantId),
        SK: SK_PATTERNS.VARIANT(variantData.variantId),
        entityType: ENTITY_TYPES.VARIANT,
        merchantId: variantData.merchantId,
        productId: variantData.productId,
        variantId: variantData.variantId,
        variantName: variantData.variantName || '', // Size S, Size M, etc.
        salePrice: variantData.salePrice, // Reference only - NOT used for revenue
        costPrice: variantData.costPrice, // COGS - this is what matters
        createdAt: timestamp,
        updatedAt: timestamp
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: variant,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      });

      await newDynamoDB.send(command);
      return { success: true, data: variant };
    } catch (error) {
      console.error('newDynamoDB createVariant error:', error);
      if (error.name === 'ConditionalCheckFailedException') {
        return { success: false, error: 'Variant already exists' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Variants for a Product
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} productId - Product ID
   * @returns {Object} Success status and variants data/error
   */
  async getVariantsByProduct(merchantId, productId) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'productId = :productId',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'VARIANT#',
          ':productId': productId
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getVariantsByProduct error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Variants for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and variants data/error
   */
  async getVariantsByMerchant(merchantId) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'VARIANT#'
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getVariantsByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get All Integrations for Merchant
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and integrations data/error
   */
  async getIntegrationsByMerchant(merchantId) {
    try {
      const command = new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': PK_PATTERNS.MERCHANT(merchantId),
          ':sk': 'INTEGRATION#'
        }
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Items || [] };
    } catch (error) {
      console.error('newDynamoDB getIntegrationsByMerchant error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update Integration Record
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} platform - Integration platform (shopify, meta, shiprocket)
   * @param {Object} updates - Fields to update
   * @returns {Object} Success status and updated data/error
   */
  async updateIntegration(merchantId, platform, updates) {
    try {
      const timestamp = new Date().toISOString();
      
      // Build update expression dynamically
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {
        ':updatedAt': timestamp
      };

      // Add updatedAt to updates
      updates.updatedAt = timestamp;

      // Process each update field
      Object.entries(updates).forEach(([key, value], index) => {
        if (value !== undefined && value !== null) {
          const attrName = `#attr${index}`;
          const valueName = `:value${index}`;
          
          updateExpressions.push(`${attrName} = ${valueName}`);
          expressionAttributeNames[attrName] = key;
          expressionAttributeValues[valueName] = value;
        }
      });

      if (updateExpressions.length === 0) {
        return { success: false, error: 'No valid updates provided' };
      }

      const command = new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: `INTEGRATION#${platform.toUpperCase()}`
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Attributes };
    } catch (error) {
      console.error('newDynamoDB updateIntegration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create User Profile (change SK from USER# to PROFILE)
   * 
   * @param {Object} userData - User information
   * @returns {Object} Success status and user data/error
   */
async createUserProfile(userData) {
    try {
      // 🚨 DEFENSIVE CHECK
      if (!userData.userId) {
        console.error("CRITICAL: Cannot create DynamoDB profile without a valid Cognito userId.");
        return { success: false, error: "Missing Cognito user ID" };
      }
      
      const merchantId = userData.userId; // Cognito sub ID
      const timestamp = new Date().toISOString();
      
      const params = {
        TableName: newTableName, // 👈 FIX 1: Use the New Singapore Table
        Item: {
          PK: `MERCHANT#${merchantId}`,
          SK: `PROFILE`,
          entityType: "PROFILE",
          merchantId: merchantId,
          userId: merchantId,
          email: userData.email || '',
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          authProvider: userData.authProvider || 'cognito',
          isVerified: userData.isVerified || false,
          onboardingCompleted: false,
          onboardingStep: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        // Prevent duplicate profiles
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      };
      
      try {
        // 👈 FIX 2: Use the newDynamoDB client
        await newDynamoDB.send(new PutCommand(params)); 
        console.log(`✅ User profile created with Cognito ID: ${merchantId}`);
        return { success: true, data: { merchantId, userId: merchantId } };
      } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
          console.log(`ℹ️  User profile already exists for ${merchantId}`);
          return { success: true, data: { merchantId, userId: merchantId } };
        }
        console.error("Error creating user profile in DynamoDB:", error);
        return { success: false, error: error.message };
      }
    } catch (error) {
      console.error('createUserProfile error:', error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Get User Profile (using PROFILE SK)
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and user data/error
   */
  async getUserProfile(merchantId) {
    try {
      const command = new GetCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: 'PROFILE'
        }
      });

      const result = await newDynamoDB.send(command);

      if (result.Item) {
        return { success: true, data: result.Item };
      }
      return { success: false, error: 'User profile not found' };
    } catch (error) {
      console.error('newDynamoDB getUserProfile error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update User Profile Onboarding
   * 
   * @param {string} merchantId - Merchant ID
   * @param {Object} updates - Onboarding updates
   * @returns {Object} Success status and updated user data/error
   */
  async updateUserProfileOnboarding(merchantId, updates) {
    try {
      // Filter out undefined values
      const validUpdates = {};
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && updates[key] !== null) {
          validUpdates[key] = updates[key];
        }
      });

      if (Object.keys(validUpdates).length === 0) {
        return { success: false, error: 'No valid updates provided' };
      }

      // Build dynamic update expression
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {
        ':updatedAt': new Date().toISOString()
      };

      // Add each valid update field
      Object.keys(validUpdates).forEach((key, index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:value${index}`;
        
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = validUpdates[key];
      });

      // Add updatedAt
      updateExpressions.push('updatedAt = :updatedAt');

      const command = new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: 'PROFILE'
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Attributes };
    } catch (error) {
      console.error('newDynamoDB updateUserProfileOnboarding error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update User Last Login Time
   * 
   * @param {string} merchantId - Merchant ID
   * @returns {Object} Success status and updated user data/error
   */
  async updateLastLogin(merchantId) {
    try {
      const command = new UpdateCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET lastLogin = :lastLogin, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':lastLogin': new Date().toISOString(),
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });

      const result = await newDynamoDB.send(command);
      return { success: true, data: result.Attributes };
    } catch (error) {
      console.error('newDynamoDB updateLastLogin error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate temporary user to Cognito ID
   * 
   * @param {string} email - User's email
   * @param {string} cognitoUserId - Cognito user ID (sub)
   * @returns {Object} Success status and user data/error
   */
  async migrateTemporaryUser(email, cognitoUserId) {
    try {
      // Find user by email
      const userResult = await this.getUserByEmail(email);
      
      if (!userResult.success) {
        return { success: false, error: 'User not found' };
      }
      
      const oldUser = userResult.data;
      
      // If user already has correct Cognito ID, no migration needed
      if (oldUser.userId === cognitoUserId) {
        return { success: true, data: oldUser, migrated: false };
      }
      
      console.log(`🔄 Migrating user from ${oldUser.userId} to ${cognitoUserId}`);
      
      // Create new record with Cognito ID
      const newUser = {
        PK: PK_PATTERNS.MERCHANT(cognitoUserId),
        SK: 'PROFILE',
        entityType: 'PROFILE',
        merchantId: cognitoUserId,
        userId: cognitoUserId,
        email: oldUser.email,
        firstName: oldUser.firstName,
        lastName: oldUser.lastName,
        authProvider: oldUser.authProvider,
        isVerified: oldUser.isVerified,
        onboardingCompleted: oldUser.onboardingCompleted,
        onboardingStep: oldUser.onboardingStep,
        businessName: oldUser.businessName,
        businessType: oldUser.businessType,
        phone: oldUser.phone,
        whatsapp: oldUser.whatsapp,
        createdAt: oldUser.createdAt,
        updatedAt: new Date().toISOString(),
        lastLogin: null
      };
      
      const command = new PutCommand({
        TableName: newTableName,
        Item: newUser
      });
      
      await newDynamoDB.send(command);
      
      // Delete old record
      await this.deleteUser(oldUser.merchantId, oldUser.userId);
      
      console.log(`✅ User migrated successfully to Cognito ID: ${cognitoUserId}`);
      
      return { success: true, data: newUser, migrated: true };
    } catch (error) {
      console.error('Migrate temporary user error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete User
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} userId - User ID
   * @returns {Object} Success status and message/error
   */
  async deleteUser(merchantId, userId) {
    try {
      const command = new DeleteCommand({
        TableName: newTableName,
        Key: {
          PK: PK_PATTERNS.MERCHANT(merchantId),
          SK: SK_PATTERNS.USER(userId)
        }
      });

      await newDynamoDB.send(command);
      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      console.error('DynamoDB deleteUser error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new DynamoDBService();
