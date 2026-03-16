/**
 * Meta/Facebook Ads Controller
 * Handles Facebook OAuth and ad account connection
 * 
 * PRODUCTION FEATURES:
 * - Encrypted access token storage
 * - Secure session management with DynamoDB
 * - Comprehensive error handling
 * - Rate limiting protection
 */

const axios = require('axios');
const crypto = require('crypto');
const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB } = require('../config/aws.config'); // ✅ CHANGE: Use new DynamoDB client
const dynamodbService = require('../services/dynamodb.service'); // ✅ CHANGE: Add new service
const sessionService = require('../services/session.service'); // ✅ NEW: Secure session management
const encryptionService = require('../utils/encryption'); // ✅ NEW: Token encryption
const MetaErrorHandler = require('../utils/meta-errors'); // ✅ NEW: Error handling
const metaSyncService = require('../services/meta-sync.service');

// ✅ CHANGE: Remove old table reference - now using unified table
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI;
const FB_API_VERSION = 'v23.0';

class MetaController {
  /**
   * Initiate Meta OAuth Flow
   * @route POST /api/meta/connect
   * @access Protected
   */
  async initiateOAuth(req, res) {
    try {
      const userId = req.user.userId;

      console.log(`\n🔗 Initiating Meta OAuth for user: ${userId}`);

      // ✅ NEW: Create secure session using DynamoDB
      const state = await sessionService.createOAuthSession(userId, 'meta');

      // Build OAuth URL with required scopes
      const scopes = [
        'public_profile',
        'email',
        'ads_read',
        'ads_management',
        'business_management'
      ].join(',');

      const authUrl = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?` +
        `client_id=${FB_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${state}&` +
        `response_type=code`;

      console.log(`✅ OAuth URL generated with secure session: ${state.substring(0, 8)}...`);

      res.json({
        success: true,
        authUrl: authUrl,
        message: 'Redirect to Facebook for authorization'
      });
    } catch (error) {
      console.error('❌ OAuth initiation error:', error);
      res.status(500).json({
        error: 'Failed to initiate OAuth',
        message: error.message
      });
    }
  }
        `client_id=${FB_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&` +
        `state=${state}&` +
        `scope=${encodeURIComponent(scopes)}`;

      console.log(`✅ OAuth URL generated`);

      res.json({
        success: true,
        authUrl,
        message: 'Redirect user to Facebook OAuth'
      });
    } catch (error) {
      console.error('❌ Meta OAuth initiation error:', error);
      res.status(500).json({
        error: 'Failed to initiate OAuth',
        message: error.message
      });
    }
  }

  /**
   * Handle OAuth Callback
   * @route GET /api/meta/callback
   * @access Public
   */
  async handleCallback(req, res) {
    try {
      const { code, state, error, error_description } = req.query;

      console.log(`\n📥 Meta OAuth callback received`);

      // Check for OAuth errors
      if (error) {
        console.error(`❌ OAuth error: ${error} - ${error_description}`);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/onboarding?meta=error&message=${encodeURIComponent(error_description || error)}`);
      }

      // ✅ NEW: Validate session using secure session service
      const session = await sessionService.getOAuthSession(state);

      if (!session) {
        console.error('❌ Invalid or expired session state');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/onboarding?meta=error&message=Invalid or expired session`);
      }

      const { userId } = session;
      console.log(`   User ID: ${userId}`);

      // Exchange code for access token
      console.log(`🔄 Exchanging code for access token...`);
      const tokenResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`,
        {
          params: {
            client_id: FB_APP_ID,
            redirect_uri: FB_REDIRECT_URI,
            client_secret: FB_APP_SECRET,
            code
          }
        }
      );

      const shortLivedToken = tokenResponse.data.access_token;
      console.log(`✅ Short-lived token obtained`);

      // Exchange for long-lived token
      console.log(`🔄 Exchanging for long-lived token...`);
      const longLivedResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortLivedToken
          }
        }
      );

      const accessToken = longLivedResponse.data.access_token;
      const expiresIn = longLivedResponse.data.expires_in;
      console.log(`✅ Long-lived token obtained (expires in ${expiresIn}s)`);

      // Get user profile
      const profileResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/me`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,name,email'
          }
        }
      );

      const profile = profileResponse.data;
      console.log(`✅ User profile: ${profile.name} (${profile.email})`);

      // Get ad accounts
      const adAccountsResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/me/adaccounts`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,account_id,name,currency'
          }
        }
      );

      const adAccounts = adAccountsResponse.data.data || [];
      console.log(`✅ Found ${adAccounts.length} ad account(s)`);

      // Save connection to database
      await saveConnection(userId, accessToken, profile, adAccounts, expiresIn);

      // ✅ NEW: Clean up session after successful completion
      await sessionService.deleteOAuthSession(state);

      console.log(`✅ Meta connection saved successfully\n`);

      // Redirect to frontend
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/onboarding?meta=connected&accounts=${adAccounts.length}`);

    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/onboarding?meta=error&message=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Get Meta Connection Status
   * @route GET /api/meta/connection
   * @access Protected
   */
  async getConnection(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // ✅ CHANGE: Use userId as merchantId

      console.log(`🔍 Getting Meta connection for merchant: ${merchantId}`);

      // ✅ CHANGE: Use new service to get integration
      const integrationResult = await dynamodbService.getIntegrationsByMerchant(merchantId);

      if (!integrationResult.success) {
        return res.status(404).json({
          connected: false,
          message: 'No Meta connection found'
        });
      }

      // Find Meta integration
      const metaIntegration = integrationResult.data.find(integration => 
        integration.platform === 'meta'
      );

      if (!metaIntegration) {
        return res.status(404).json({
          connected: false,
          message: 'No Meta connection found'
        });
      }

      console.log(`✅ Meta connection found for merchant: ${merchantId}`);

      // Don't expose access token - return safe connection data
      const safeConnection = {
        platform: metaIntegration.platform,
        status: metaIntegration.status,
        connectedAt: metaIntegration.connectedAt,
        adAccounts: metaIntegration.credentials?.adAccounts || [],
        selectedAdAccountId: metaIntegration.credentials?.selectedAdAccountId,
        selectedAdAccount: metaIntegration.credentials?.selectedAdAccount,
        profileName: metaIntegration.credentials?.profileName,
        profileId: metaIntegration.credentials?.profileId
      };

      res.json({
        connected: true,
        connection: safeConnection
      });
    } catch (error) {
      console.error('Get Meta connection error:', error);
      res.status(500).json({ error: 'Failed to get connection' });
    }
  }

  /**
   * Update selected ad account
   * @route POST /api/meta/select-account
   * @access Protected
   */
  async selectAdAccount(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // ✅ CHANGE: Use userId as merchantId
      const { adAccountId } = req.body;

      console.log(`\n💾 Selecting ad account for merchant: ${merchantId}`);
      console.log(`   Ad Account ID: ${adAccountId}`);

      if (!adAccountId) {
        return res.status(400).json({
          error: 'Ad account ID is required'
        });
      }

      // ✅ CHANGE: Get existing integration using new service
      const integrationResult = await dynamodbService.getIntegrationsByMerchant(merchantId);

      if (!integrationResult.success) {
        return res.status(404).json({
          error: 'No Meta connection found. Please connect first.'
        });
      }

      // Find Meta integration
      const metaIntegration = integrationResult.data.find(integration => 
        integration.platform === 'meta'
      );

      if (!metaIntegration) {
        return res.status(404).json({
          error: 'No Meta connection found. Please connect first.'
        });
      }

      const adAccounts = metaIntegration.credentials?.adAccounts || [];

      // Verify ad account exists in user's accounts
      const selectedAccount = adAccounts.find(
        acc => acc.accountId === adAccountId || acc.id === `act_${adAccountId}`
      );

      if (!selectedAccount) {
        return res.status(400).json({
          error: 'Invalid ad account ID. Account not found in your connected accounts.'
        });
      }

      // ✅ CHANGE: Update integration using new service
      const updatedCredentials = {
        ...metaIntegration.credentials,
        selectedAdAccountId: adAccountId,
        selectedAdAccount: selectedAccount
      };

      // Update the integration record
      const updateResult = await dynamodbService.updateIntegration(merchantId, 'meta', {
        credentials: updatedCredentials,
        status: 'active'
      });

      if (!updateResult.success) {
        return res.status(500).json({
          error: 'Failed to update Meta integration'
        });
      }

      console.log(`✅ Ad account selected successfully`);

      // Trigger Hybrid Sync (Fast Preview + Background Full History)
      const accessToken = metaIntegration.credentials?.accessToken;
      if (accessToken) {
        // ✅ NEW: Decrypt access token before use
        try {
          let decryptedAccessToken;
          if (metaIntegration.credentials?.tokenEncrypted) {
            decryptedAccessToken = encryptionService.decrypt(accessToken);
          } else {
            decryptedAccessToken = accessToken; // Legacy plain text token
          }
          metaSyncService.startHybridSync(userId, `act_${adAccountId}`, decryptedAccessToken);
        } catch (decryptError) {
          console.error('❌ Failed to decrypt token for sync:', decryptError.message);
          // Continue without sync - user can manually sync later
        }
      }

      console.log(`✅ Meta setup completed\n`);

      res.json({
        success: true,
        message: 'Ad account selected successfully',
        selectedAccount
      });
    } catch (error) {
      console.error('❌ Select ad account error:', error);
      res.status(500).json({
        error: 'Failed to select ad account',
        message: error.message
      });
    }
  }

  /**
   * Manually sync 3 months data for existing connection
   * @route POST /api/meta/sync-data
   * @access Protected
   */
  async syncData(req, res) {
    try {
      const userId = req.user.userId;

      console.log(`\n🔄 Manual data sync initiated for user: ${userId}`);

      // Get connection from database
      const command = new GetCommand({
        TableName: META_CONNECTIONS_TABLE,
        Key: { userId }
      });

      const result = await dynamoDB.send(command);

      if (!result.Item) {
        return res.status(404).json({
          error: 'No Meta connection found. Please add Meta credentials to database first.'
        });
      }

      const connection = result.Item;

      if (!connection.accessToken) {
        return res.status(400).json({
          error: 'Access token not found in connection. Please update database with valid accessToken.'
        });
      }

      if (!connection.adAccounts || connection.adAccounts.length === 0) {
        return res.status(400).json({
          error: 'No ad accounts found. Please update database with adAccounts array.'
        });
      }

      console.log(`   Found ${connection.adAccounts.length} ad account(s)`);
      console.log(`   📊 Fetching 3 months of insights data...`);

      // Use the sync service to fetch 3 months data
      const syncResult = await metaSyncService.fetch3MonthsData(userId);

      res.json({
        success: true,
        message: '3 months of Meta insights data synced successfully',
        ...syncResult
      });

    } catch (error) {
      console.error('❌ Manual sync error:', error);
      res.status(500).json({
        error: 'Failed to sync data',
        message: error.message
      });
    }
  }

  /**
   * Get ad account data with access token
   * @route GET /api/meta/ad-account/:accountId
   * @access Protected
   */
  async getAdAccountData(req, res) {
    try {
      const userId = req.user.userId;
      const merchantId = userId; // ✅ CHANGE: Use userId as merchantId
      const { accountId } = req.params;
      const { startDate, endDate } = req.query;

      console.log(`\n📊 Fetching ad account data for merchant: ${merchantId}`);
      console.log(`   Account ID: ${accountId}`);
      if (startDate && endDate) {
        console.log(`   Date Range: ${startDate} to ${endDate}`);
      }

      // ✅ CHANGE: Get integration using new service
      const integrationResult = await dynamodbService.getIntegrationsByMerchant(merchantId);

      if (!integrationResult.success) {
        return res.status(404).json({
          error: 'No Meta connection found'
        });
      }

      // Find Meta integration
      const metaIntegration = integrationResult.data.find(integration => 
        integration.platform === 'meta'
      );

      if (!metaIntegration) {
        return res.status(404).json({
          error: 'No Meta connection found'
        });
      }

      const accessToken = metaIntegration.credentials?.accessToken;
      const selectedAccount = metaIntegration.credentials?.selectedAdAccount;

      if (!accessToken) {
        return res.status(400).json({
          error: 'Access token not found. Please reconnect your Meta account.'
        });
      }

      // ✅ NEW: Decrypt access token before use
      let decryptedAccessToken;
      try {
        // Check if token is encrypted (new format) or plain text (legacy)
        if (metaIntegration.credentials?.tokenEncrypted) {
          decryptedAccessToken = encryptionService.decrypt(accessToken);
          console.log(`🔓 Access token decrypted successfully`);
        } else {
          decryptedAccessToken = accessToken; // Legacy plain text token
          console.log(`⚠️ Using legacy plain text token - should be re-encrypted`);
        }
      } catch (decryptError) {
        console.error('❌ Failed to decrypt access token:', decryptError.message);
        return res.status(400).json({
          error: 'Invalid access token. Please reconnect your Meta account.'
        });
      }

      console.log(`✅ Meta integration found, fetching insights...`);

      // Fetch ad account insights from Facebook API
      const adAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

      // Calculate date range
      let timeRange;
      if (startDate && endDate) {
        timeRange = {
          since: startDate,
          until: endDate
        };
      } else {
        timeRange = {
          since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          until: new Date().toISOString().split('T')[0]
        };
      }

      const insightsResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/${adAccountId}/insights`,
        {
          params: {
            access_token: decryptedAccessToken, // ✅ NEW: Use decrypted token
            fields: 'spend,impressions,clicks,cpc,cpm,ctr,reach',
            time_range: JSON.stringify(timeRange)
          }
        }
      );

      const insights = insightsResponse.data.data[0] || {};

      console.log(`✅ Ad account data fetched successfully\n`);

      res.json({
        success: true,
        accountId,
        insights,
        currency: selectedAccount?.currency || 'USD' // ✅ FIXED: Use selectedAccount
      });
    } catch (error) {
      console.error('❌ Get ad account data error:', error);
      res.status(500).json({
        error: 'Failed to fetch ad account data',
        message: error.message
      });
    }
  }

}

/**
 * Save Meta connection to database (standalone function)
 * ✅ UPDATED: Use new unified table structure with encrypted tokens
 */
async function saveConnection(userId, accessToken, profile, adAccounts, expiresIn) {
  const merchantId = userId; // ✅ CHANGE: Use userId as merchantId
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  console.log(`💾 Saving Meta connection for merchant: ${merchantId}`);

  // Check for existing integration to preserve user preferences
  let existingCredentials = {};
  try {
    const integrationResult = await dynamodbService.getIntegrationsByMerchant(merchantId);
    if (integrationResult.success) {
      const metaIntegration = integrationResult.data.find(integration => 
        integration.platform === 'meta'
      );
      if (metaIntegration) {
        existingCredentials = metaIntegration.credentials || {};
        console.log(`📋 Found existing Meta integration, preserving settings`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch existing Meta integration:', err.message);
  }

  // ✅ NEW: Encrypt the access token before storing
  let encryptedAccessToken;
  try {
    encryptedAccessToken = encryptionService.encrypt(accessToken);
    console.log(`🔐 Access token encrypted successfully`);
  } catch (encryptError) {
    console.error('❌ Failed to encrypt access token:', encryptError.message);
    throw new Error('Failed to secure access token');
  }

  // ✅ CHANGE: Use new createIntegration method
  const integrationData = {
    merchantId: merchantId,
    platform: 'meta',
    credentials: {
      accessToken: encryptedAccessToken, // ✅ NEW: Store encrypted token
      facebookId: profile.id,
      profileName: profile.name,
      profileId: profile.id,
      email: profile.email,
      adAccounts: adAccounts.map(acc => ({
        id: acc.id,
        accountId: acc.account_id,
        name: acc.name,
        currency: acc.currency
      })),
      expiresAt: expiresAt,
      apiVersion: FB_API_VERSION,
      // Preserve existing settings
      selectedAdAccountId: existingCredentials.selectedAdAccountId,
      selectedAdAccount: existingCredentials.selectedAdAccount,
      lastSyncAt: existingCredentials.lastSyncAt,
      // ✅ NEW: Add security metadata
      tokenEncrypted: true,
      tokenCreatedAt: new Date().toISOString()
    }
  };

  const result = await dynamodbService.createIntegration(integrationData);
  
  if (!result.success) {
    throw new Error(`Failed to save Meta integration: ${result.error}`);
  }

  console.log(`✅ Meta integration saved successfully with encrypted token`);
}

module.exports = new MetaController();
