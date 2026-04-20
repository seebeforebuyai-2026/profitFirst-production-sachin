const axios = require("axios");
const dynamodbService = require("../services/dynamodb.service");
const sessionService = require("../services/session.service");
const encryptionService = require("../utils/encryption");

// Meta/Facebook API Configuration
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI;
const FB_API_VERSION = "v23.0";

class MetaController {
  // =========================
  // INITIATE OAUTH
  // =========================
  async initiateOAuth(req, res) {
    try {
      const userId = req.user.userId;
      const state = await sessionService.createOAuthSession(userId, "meta");

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

      return res.json({ success: true, authUrl });
    } catch (error) {
      console.error("❌ OAuth initiation error:", error);
      return res.status(500).json({ error: "Failed to initiate OAuth" });
    }
  }

  // =========================
  // HANDLE CALLBACK
  // =========================
  async handleCallback(req, res) {
    const frontendUrl =
      process.env.FRONTEND_URL || "https://profitfirstanalytics.co.in";

    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        return res.redirect(
          `${frontendUrl}/onboarding?meta=error&message=${encodeURIComponent(
            error_description || error
          )}`
        );
      }

      const session = await sessionService.getOAuthSession(state);
      if (!session) {
        return res.redirect(
          `${frontendUrl}/onboarding?meta=error&message=Invalid or expired session`
        );
      }

      const { userId } = session;

      // =========================
      // STEP 1: SHORT TOKEN
      // =========================
      const tokenRes = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`,
        {
          params: {
            client_id: FB_APP_ID,
            redirect_uri: FB_REDIRECT_URI,
            client_secret: FB_APP_SECRET,
            code,
          },
        }
      );

      const shortToken = tokenRes.data.access_token;
      if (!shortToken) throw new Error("Failed to get short-lived token");

      // =========================
      // STEP 2: LONG TOKEN
      // =========================
      const longLivedRes = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`,
        {
          params: {
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortToken,
          },
        }
      );

      const accessToken = longLivedRes.data.access_token;
      const expiresIn = longLivedRes.data.expires_in;

      if (!accessToken) throw new Error("Failed to get long-lived token");

      // =========================
      // STEP 3: PROFILE + ACCOUNTS
      // =========================
      const [profileRes, adAccountsRes] = await Promise.all([
        axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me`, {
          params: {
            access_token: accessToken,
            fields: "id,name,email",
          },
        }),
        axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me/adaccounts`, {
          params: {
            access_token: accessToken,
            fields: "id,account_id,name,currency",
          },
        }),
      ]);

      const adAccounts = adAccountsRes.data?.data || [];

      // =========================
      // STEP 4: SAVE
      // =========================
      await saveConnection(
        userId,
        accessToken,
        profileRes.data,
        adAccounts,
        expiresIn
      );

      await sessionService.deleteOAuthSession(state);

      return res.redirect(
        `${frontendUrl}/onboarding?meta=connected&accounts=${adAccounts.length}`
      );
    } catch (error) {
      console.error("❌ OAuth callback error:", error);

      return res.redirect(
        `${frontendUrl}/onboarding?meta=error&message=Internal Server Error`
      );
    }
  }

  // =========================
  // GET CONNECTION
  // =========================
  async getConnection(req, res) {
    try {
      const merchantId = req.user.userId;
      const result =
        await dynamodbService.getIntegrationsByMerchant(merchantId);

      if (!result.success || !result.data) {
        return res.json({ connected: false });
      }

      const meta = result.data.find((i) => i.platform === "meta");
      if (!meta) return res.json({ connected: false });

      const adAccountsList =
        meta.adAccounts || meta.credentials?.adAccounts || [];

      const safeConnection = {
        platform: meta.platform,
        status: meta.status || "active",
        connectedAt: meta.connectedAt,
        adAccounts: adAccountsList,
        selectedAdAccountId: meta.selectedAdAccountId || null,
        selectedAdAccount: meta.selectedAdAccount || null,
        profileName:
          meta.profileName || meta.credentials?.profileName || null,
      };

      return res.json({ connected: true, connection: safeConnection });
    } catch (error) {
      console.error("getConnection error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // =========================
  // SELECT AD ACCOUNT
  // =========================
  async selectAdAccount(req, res) {
    try {
      const merchantId = req.user.userId;
      const { adAccountId } = req.body;

      if (!adAccountId) {
        return res.status(400).json({ error: "adAccountId required" });
      }

      const result =
        await dynamodbService.getIntegrationsByMerchant(merchantId);

      const meta = result.data?.find((i) => i.platform === "meta");
      if (!meta) {
        return res.status(404).json({ error: "Meta connection not found" });
      }

      const adAccounts =
        meta.adAccounts || meta.credentials?.adAccounts || [];

      const selected = adAccounts.find(
        (acc) =>
          acc.accountId === adAccountId ||
          acc.id === adAccountId ||
          acc.id === `act_${adAccountId}`
      );

      if (!selected) {
        return res
          .status(400)
          .json({ error: "Invalid ad account selected" });
      }

      await dynamodbService.updateIntegration(merchantId, "meta", {
        selectedAdAccountId: selected.id,
        selectedAdAccount: selected,
        status: "active",
      });

      await dynamodbService.updateUserProfileOnboarding(merchantId, {
        onboardingStep: 4,
      });

      return res.json({
        success: true,
        message: "Account selected and Step 3 completed",
      });
    } catch (error) {
      console.error("selectAdAccount error:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}

// =========================
// SAVE CONNECTION (SAFE)
// =========================
async function saveConnection(
  userId,
  accessToken,
  profile,
  adAccounts,
  expiresIn
) {
  // 🔐 Encrypt token safely
  const encryptedToken = encryptionService.encrypt(accessToken);

  if (!encryptedToken) {
    throw new Error("Token encryption failed");
  }

  // Normalize ad accounts
  const normalizedAccounts = (adAccounts || []).map((acc) => ({
    id: acc.id,
    accountId: acc.account_id,
    name: acc.name,
    currency: acc.currency,
  }));

  const integrationData = {
    merchantId: userId,
    platform: "meta",
    credentials: {
      accessToken: encryptedToken,
      facebookId: profile.id,
      profileName: profile.name,
      email: profile.email,
      adAccounts: normalizedAccounts,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      tokenEncrypted: true,
      tokenCreatedAt: new Date().toISOString(),
      apiVersion: FB_API_VERSION,
    },
    status: "active",
    updatedAt: new Date().toISOString(),
  };

  // 🔁 UPSERT LOGIC (safe for reconnect)
  let result;
  if (dynamodbService.upsertIntegration) {
    result = await dynamodbService.upsertIntegration(integrationData);
  } else {
    // fallback
    result = await dynamodbService.createIntegration(integrationData);
  }

  if (!result.success) {
    throw new Error(result.error || "Failed to save integration");
  }
}

module.exports = new MetaController();