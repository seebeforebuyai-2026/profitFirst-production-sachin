/**
 * DynamoDB Schema Configuration
 * 
 * Single Table Design for ProfitFirst
 * 
 * TABLE: ProfitFirst_Core (New Database)
 * 
 * PARTITION KEY (PK): MERCHANT#<merchantId>
 * SORT KEY (SK): ENTITY#<entityId>
 * 
 * ENTITY TYPES:
 * - PROFILE - User account data (replaces USER#<userId>)
 * - INTEGRATION#<platform> - Platform connections (Shopify, Meta, Shiprocket)
 * - PRODUCT#<productId> - Product info only (no COGS)
 * - VARIANT#<variantId> - Variant-level COGS (where cost is stored)
 * - ORDER#<orderId> - Shopify order data
 * - SHIPMENT#<shipmentId> - Shiprocket shipment data
 * - ADS#<campaignId> - Meta Ads campaign data
 * - EXPENSE#<expenseId> - Business expense data
 * - SUMMARY#<date> - Daily summary record
 * - METADATA - Merchant metadata
 * 
 * ONBOARDING STRUCTURE:
 * MERCHANT#123 / PROFILE              - User profile & onboarding progress
 * MERCHANT#123 / INTEGRATION#SHOPIFY  - Step 2: Shopify credentials
 * MERCHANT#123 / PRODUCT#P1           - Step 3: Product info
 * MERCHANT#123 / VARIANT#V1           - Step 3: Variant COGS (Size S)
 * MERCHANT#123 / VARIANT#V2           - Step 3: Variant COGS (Size M)
 * MERCHANT#123 / INTEGRATION#META     - Step 4: Meta Ads credentials
 * MERCHANT#123 / INTEGRATION#SHIPROCKET - Step 5: Shiprocket credentials
 */

// Entity Type Constants
const ENTITY_TYPES = {
  PROFILE: 'PROFILE', // Changed from USER to PROFILE
  USER: 'USER', // Keep for backward compatibility
  ORDER: 'ORDER',
  PRODUCT: 'PRODUCT',
  VARIANT: 'VARIANT',
  SHIPMENT: 'SHIPMENT',
  ADS: 'ADS',
  EXPENSE: 'EXPENSE',
  SUMMARY: 'SUMMARY',
  INTEGRATION: 'INTEGRATION',
  METADATA: 'METADATA',
  SYNC_STATUS: 'SYNC_STATUS'
};

// PK/SK Patterns
const PK_PATTERNS = {
  MERCHANT: (merchantId) => `MERCHANT#${merchantId}`,
  USER: (merchantId, userId) => `MERCHANT#${merchantId}#USER#${userId}`,
  ORDER: (merchantId, orderId) => `MERCHANT#${merchantId}#ORDER#${orderId}`,
  PRODUCT: (merchantId, productId) => `MERCHANT#${merchantId}#PRODUCT#${productId}`,
  VARIANT: (merchantId, variantId) => `MERCHANT#${merchantId}#VARIANT#${variantId}`,
  SHIPMENT: (merchantId, shipmentId) => `MERCHANT#${merchantId}#SHIPMENT#${shipmentId}`,
  ADS: (merchantId, campaignId) => `MERCHANT#${merchantId}#ADS#${campaignId}`,
  EXPENSE: (merchantId, expenseId) => `MERCHANT#${merchantId}#EXPENSE#${expenseId}`,
  SUMMARY: (merchantId, date) => `MERCHANT#${merchantId}#SUMMARY#${date}`,
  INTEGRATION: (merchantId, platform) => `MERCHANT#${merchantId}#INTEGRATION#${platform}`,
  METADATA: (merchantId) => `MERCHANT#${merchantId}#METADATA`
};

const SK_PATTERNS = {
  PROFILE: () => 'PROFILE', // New pattern for user profile
  USER: (userId) => `USER#${userId}`, // Keep for backward compatibility
  ORDER: (orderId) => `ORDER#${orderId}`,
  PRODUCT: (productId) => `PRODUCT#${productId}`,
  VARIANT: (variantId) => `VARIANT#${variantId}`,
  SHIPMENT: (shipmentId) => `SHIPMENT#${shipmentId}`,
  ADS: (campaignId) => `ADS#${campaignId}`,
  EXPENSE: (expenseId) => `EXPENSE#${expenseId}`,
  SUMMARY: (date) => `SUMMARY#${date}`,
  INTEGRATION: (platform) => `INTEGRATION#${platform}`,
  METADATA: () => `METADATA`,
  SYNC: (platform) => `SYNC#${platform.toUpperCase()}`

};

// Entity Schemas
const ENTITY_SCHEMAS = {
  PROFILE: {
    required: ['merchantId', 'userId', 'email', 'firstName', 'lastName'],
    optional: ['authProvider', 'isVerified', 'onboardingCompleted', 'onboardingStep', 'createdAt', 'lastLogin']
  },
  USER: {
    required: ['merchantId', 'userId', 'email', 'firstName', 'lastName'],
    optional: ['authProvider', 'isVerified', 'onboardingCompleted', 'onboardingStep', 'createdAt', 'lastLogin']
  },
  ORDER: {
    required: ['merchantId', 'orderId', 'shopifyOrderId', 'orderTotal', 'currency', 'orderStatus', 'fulfillmentStatus', 'products', 'cogsAtSale'],
    optional: ['shopifyCustomerId', 'shopifyProductId', 'shopifyVariantId', 'paymentType', 'orderTimeline', 'rawDataS3Url']
  },
  PRODUCT: {
    required: ['merchantId', 'productId', 'productName'],
    optional: ['shopifyProductId', 'productType', 'tags', 'images', 'rawDataS3Url']
  },
  VARIANT: {
    required: ['merchantId', 'productId', 'variantId', 'costPrice'],
    optional: ['shopifyVariantId', 'variantName', 'salePrice', 'sku', 'inventoryQuantity', 'rawDataS3Url']
  },
  SHIPMENT: {
    required: ['merchantId', 'shipmentId', 'shiprocketShipmentId', 'orderId', 'orderStatus', 'shippingFee', 'deliveryStatus'],
    optional: ['awbCode', 'carrier', 'estimatedDelivery', 'rawDataS3Url']
  },
  ADS: {
    required: ['merchantId', 'campaignId', 'metaCampaignId', 'campaignName', 'spend', 'impressions', 'clicks', 'date'],
    optional: ['campaignStatus', 'objective', 'rawDataS3Url']
  },
  EXPENSE: {
    required: ['merchantId', 'expenseId', 'expenseType', 'amount', 'date', 'description'],
    optional: ['category', 'receiptUrl', 'rawDataS3Url']
  },
  SUMMARY: {
    required: ['merchantId', 'date', 'revenueEarned', 'adsSpend', 'shippingSpend', 'cogs', 'profit'],
    optional: ['totalOrders', 'deliveredOrders', 'rtoCount', 'cancelledOrders', 'businessExpenses']
  },
  INTEGRATION: {
    required: ['merchantId', 'platform', 'status', 'connectedAt'],
    optional: ['lastSyncTime', 'syncStatus', 'lastError', 'ordersSynced', 'productsSynced', 'shipmentsSynced', 'adsSynced', 'accessToken', 'shopifyStore', 'adAccountId', 'email', 'token', 'shopName', 'shopDomain', 'shopEmail', 'currency', 'timezone', 'testedAt']
  },
  METADATA: {
    required: ['merchantId', 'createdAt'],
    optional: ['onboardingCompleted', 'onboardingStep', 'lastSyncedOrderId', 'syncProgress']
  },
  SYNC_STATUS: {
    required: ['merchantId', 'platform', 'status', 'percent'],
    optional: ['sinceDate', 'startedAt', 'completedAt', 'lastSyncedId']
  }
};
 
// Global Secondary Indexes (GSI)
const GSIs = {
  // GSI for email lookup
  emailIndex: {
    name: 'email-index',
    partitionKey: 'email',
    sortKey: 'createdAt'
  },
  // GSI for sync status lookup
  syncStatusIndex: {
    name: 'sync-status-index',
    partitionKey: 'syncStatus',
    sortKey: 'lastSyncTime'
  },
  // GSI for date-based queries
  dateIndex: {
    name: 'date-index',
    partitionKey: 'date',
    sortKey: 'merchantId'
  }
};

// Export
module.exports = {
  ENTITY_TYPES,
  PK_PATTERNS,
  SK_PATTERNS,
  ENTITY_SCHEMAS,
  GSIs
};
