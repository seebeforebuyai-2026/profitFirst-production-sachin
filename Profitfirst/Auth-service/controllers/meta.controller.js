/**
 * Meta/Facebook Ads Controller
 * Handles Facebook OAuth and ad account connection with production security features
 */

const axios = require('axios');
const dynamodbService = require('../services/dynamodb.service');
const sessionService = require('../services/session.service');
const encryptionService = require('../utils/encryption');
const MetaErrorHandler = require('../utils/meta-errors');
const metaSyncService = require('../services/meta-sync.service');

// Meta/Facebook API Configuration
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

      // Create secure session using DynamoDB
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

  /**
   * Handle OAuth Callback
   * @route GET /api/meta/callback
   * @access Public
   */
  async handleCallback(req, res) {
    try {
      const { code, state, error, error_description } = req.query;

      // Check for OAuth errors
      if (error) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/onboarding?meta=error&message=${encodeURIComponent(error_description || error)}`);
      }

      // Validate session using secure session service
      const session = await sessionService.getOAuthSession(state);

      if (!session) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/onboarding?meta=error&message=Invalid or expired session`);
      }

      const { userId } = session;

      // Exchange code for access token
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

      // Exchange for long-lived token
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

      // Save connection to database
      await saveConnection(userId, accessToken, profile, adAccounts, expiresIn);

      // Clean up session after successful completion
      await sessionService.deleteOAuthSession(state);

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
      const merchantId = userId;

      // Get integration using new service
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
      const merchantId = userId;
      const { adAccountId } = req.body;

      if (!adAccountId) {
        return res.status(400).json({
          error: 'Ad account ID is required'
        });
      }

      // Get existing integration using new service
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

      // Trigger Hybrid Sync (Fast Preview + Background Full History)
      const accessToken = metaIntegration.credentials?.accessToken;
      if (accessToken) {
        try {
          let decryptedAccessToken;
          if (metaIntegration.credentials?.tokenEncrypted) {
            decryptedAccessToken = encryptionService.decrypt(accessToken);
          } else {
            decryptedAccessToken = accessToken; // Legacy plain text token
          }
          metaSyncService.startHybridSync(userId, `act_${adAccountId}`, decryptedAccessToken);
        } catch (decryptError) {
          // Continue without sync - user can manually sync later
        }
      }

      res.json({
        success: true,
        message: 'Ad account selected successfully',
        selectedAccount
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to select ad account',
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
      const merchantId = userId;
      const { accountId } = req.params;
      const { startDate, endDate } = req.query;

      // Get integration using new service
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

      // Decrypt access token before use
      let decryptedAccessToken;
      try {
        // Check if token is encrypted (new format) or plain text (legacy)
        if (metaIntegration.credentials?.tokenEncrypted) {
          decryptedAccessToken = encryptionService.decrypt(accessToken);
        } else {
          decryptedAccessToken = accessToken; // Legacy plain text token
        }
      } catch (decryptError) {
        return res.status(400).json({
          error: 'Invalid access token. Please reconnect your Meta account.'
        });
      }

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

      res.json({
        success: true,
        accountId,
        insights,
        currency: selectedAccount?.currency || 'USD'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch ad account data',
        message: error.message
      });
    }
  }

}

/**
 * Save Meta connection to database with encrypted tokens
 */
async function saveConnection(userId, accessToken, profile, adAccounts, expiresIn) {
  const merchantId = userId;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

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
      }
    }
  } catch (err) {
    // Continue without existing credentials
  }

  // Encrypt the access token before storing
  let encryptedAccessToken;
  try {
    encryptedAccessToken = encryptionService.encrypt(accessToken);
  } catch (encryptError) {
    throw new Error('Failed to secure access token');
  }

  // Use new createIntegration method
  const integrationData = {
    merchantId: merchantId,
    platform: 'meta',
    credentials: {
      accessToken: encryptedAccessToken, // Store encrypted token
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
      // Add security metadata
      tokenEncrypted: true,
      tokenCreatedAt: new Date().toISOString()
    }
  };

  const result = await dynamodbService.createIntegration(integrationData);
  
  if (!result.success) {
    throw new Error(`Failed to save Meta integration: ${result.error}`);
  }
}

module.exports = new MetaController();
