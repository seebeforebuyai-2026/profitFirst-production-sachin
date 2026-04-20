/**
 * Meta/Facebook Ads Controller
 * Handles Facebook OAuth and ad account connection with production security features
 */

const axios = require("axios");
const dynamodbService = require("../services/dynamodb.service");
const sessionService = require("../services/session.service");
const encryptionService = require("../utils/encryption");
const MetaErrorHandler = require("../utils/meta-errors");

// Meta/Facebook API Configuration
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI;
const FB_API_VERSION = "v23.0";

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
      const state = await sessionService.createOAuthSession(userId, "meta");

      // Build OAuth URL with required scopes
      const scopes = [
        "public_profile",
        "email",
        "ads_read",
        "ads_management",
        "business_management",
      ].join(",");

      const authUrl =
        `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?` +
        `client_id=${FB_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${state}&` +
        `response_type=code`;

      res.json({
        success: true,
        authUrl: authUrl,
        message: "Redirect to Facebook for authorization",
      });
    } catch (error) {
      console.error("❌ OAuth initiation error:", error);
      res.status(500).json({
        error: "Failed to initiate OAuth",
        message: error.message,
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
        const frontendUrl =
          process.env.FRONTEND_URL || "https://profitfirstanalytics.co.in";
        return res.redirect(
          `${frontendUrl}/onboarding?meta=error&message=${encodeURIComponent(error_description || error)}`,
        );
      }

      // Validate session using secure session service
      const session = await sessionService.getOAuthSession(state);

      if (!session) {
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        return res.redirect(
          `${frontendUrl}/onboarding?meta=error&message=Invalid or expired session`,
        );
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
            code,
          },
        },
      );

      const shortLivedToken = tokenResponse.data.access_token;

      // Exchange for long-lived token
      const longLivedResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`,
        {
          params: {
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortLivedToken,
          },
        },
      );

      const accessToken = longLivedResponse.data.access_token;
      const expiresIn = longLivedResponse.data.expires_in;

      // Get user profile
      const profileResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/me`,
        {
          params: {
            access_token: accessToken,
            fields: "id,name,email",
          },
        },
      );

      const profile = profileResponse.data;

      // Get ad accounts
      const adAccountsResponse = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/me/adaccounts`,
        {
          params: {
            access_token: accessToken,
            fields: "id,account_id,name,currency",
          },
        },
      );

      const adAccounts = adAccountsResponse.data.data || [];

      // Save connection to database
      await saveConnection(userId, accessToken, profile, adAccounts, expiresIn);

      // Clean up session after successful completion
      await sessionService.deleteOAuthSession(state);

      // Redirect to frontend
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(
        `${frontendUrl}/onboarding?meta=connected&accounts=${adAccounts.length}`,
      );
    } catch (error) {
      console.error("❌ OAuth callback error:", error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(
        `${frontendUrl}/onboarding?meta=error&message=${encodeURIComponent(error.message)}`,
      );
    }
  }

  /**
   * Get Meta Connection Status
   * @route GET /api/meta/connection
   * @access Protected
   */
async getConnection(req, res) {
  try {
    // ✅ Auth check
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const merchantId = req.user.userId;

    const integrationResult = await dynamodbService.getIntegrationsByMerchant(merchantId);

    // ✅ Validate DB response
    if (!integrationResult.success || !integrationResult.data) {
      return res.status(200).json({ connected: false });
    }

    const metaIntegration = integrationResult.data.find(
      (i) => i.platform === "meta"
    );

    if (!metaIntegration) {
      return res.status(200).json({ connected: false });
    }

    // ✅ Safe normalized response
    const safeConnection = {
      platform: metaIntegration.platform,
      status: metaIntegration.status || "inactive",
      connectedAt: metaIntegration.connectedAt || null,
      adAccounts: metaIntegration.adAccounts || [],
      selectedAdAccountId: metaIntegration.selectedAdAccountId || null,
      selectedAdAccount: metaIntegration.selectedAdAccount || null,
      profileName: metaIntegration.profileName || null,
      profileId: metaIntegration.profileId || null,
    };

    return res.json({
      connected: true,
      connection: safeConnection,
    });

  } catch (error) {
    console.error("getConnection error:", error); // ✅ logging
    return res.status(500).json({ error: "Internal server error" });
  }
}

  /**
   * Update selected ad account
   * @route POST /api/meta/select-account
   * @access Protected
   */
async selectAdAccount(req, res) {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const merchantId = req.user.userId;
    const { adAccountId } = req.body;

    if (!adAccountId) {
      return res.status(400).json({ error: "adAccountId is required" });
    }

    const integrationResult = await dynamodbService.getIntegrationsByMerchant(merchantId);

    if (!integrationResult.success || !integrationResult.data) {
      return res.status(404).json({ error: "No integrations found" });
    }

    const metaIntegration = integrationResult.data.find(i => i.platform === "meta");

    if (!metaIntegration) {
      return res.status(404).json({ error: "No Meta connection found" });
    }

    const adAccounts = metaIntegration.adAccounts || [];

    const selectedAccount = adAccounts.find(
      acc => acc.accountId === adAccountId || acc.id === adAccountId
    );

    if (!selectedAccount) {
      return res.status(400).json({ error: "Invalid ad account ID" });
    }

    const safeAccount = {
      id: selectedAccount.id,
      accountId: selectedAccount.accountId,
      name: selectedAccount.name,
    };

    const updateResult = await dynamodbService.updateIntegration(merchantId, "meta", {
      selectedAdAccountId: adAccountId,
      selectedAdAccount: safeAccount,
      status: "active",
    });

    if (!updateResult.success) {
      return res.status(500).json({ error: "Failed to update integration" });
    }

    await dynamodbService.updateUserProfileOnboarding(merchantId, {
      onboardingStep: 4
    });

    res.json({ success: true, message: "Ad account selected", selectedAccount: safeAccount });

  } catch (error) {
    console.error("selectAdAccount error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Save Meta connection to database with encrypted tokens
 */
async function saveConnection(
  userId,
  accessToken,
  profile,
  adAccounts,
  expiresIn,
) {
  const merchantId = userId;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Check for existing integration to preserve user preferences
  let existingCredentials = {};
  try {
    const integrationResult =
      await dynamodbService.getIntegrationsByMerchant(merchantId);
    if (integrationResult.success) {
      const metaIntegration = integrationResult.data.find(
        (integration) => integration.platform === "meta",
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
    throw new Error("Failed to secure access token");
  }

  // Use new createIntegration method
  const integrationData = {
    merchantId: merchantId,
    platform: "meta",
    credentials: {
      accessToken: encryptedAccessToken, // Store encrypted token
      facebookId: profile.id,
      profileName: profile.name,
      profileId: profile.id,
      email: profile.email,
      adAccounts: adAccounts.map((acc) => ({
        id: acc.id,
        accountId: acc.account_id,
        name: acc.name,
        currency: acc.currency,
      })),
      expiresAt: expiresAt,
      apiVersion: FB_API_VERSION,
      // Preserve existing settings
      selectedAdAccountId: existingCredentials.selectedAdAccountId,
      selectedAdAccount: existingCredentials.selectedAdAccount,
      lastSyncAt: existingCredentials.lastSyncAt,
      // Add security metadata
      tokenEncrypted: true,
      tokenCreatedAt: new Date().toISOString(),
    },
  };

  const result = await dynamodbService.createIntegration(integrationData);

  if (!result.success) {
    throw new Error(`Failed to save Meta integration: ${result.error}`);
  }
}

module.exports = new MetaController();
