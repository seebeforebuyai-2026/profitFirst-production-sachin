/**
 * TEST: Meta API connection for a merchant
 * Read-only — no DB writes, no code changes
 */
require("dotenv").config();
const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryptionService = require("../utils/encryption");
const axios = require("axios");

const MERCHANT_ID = "999a654c-50c1-705b-bc4d-9813265dbc3b";

async function main() {
  console.log("\n=== META CONNECTION TEST ===");
  console.log("Merchant:", MERCHANT_ID);

  // 1. Load Meta integration from DB
  const res = await newDynamoDB.send(new GetCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#META" },
  }));

  const item = res.Item;
  if (!item) {
    console.log("❌ No META integration found in DB for this merchant.");
    return;
  }

  console.log("\n✅ META integration found in DB:");
  console.log("  status       :", item.status);
  console.log("  connectedAt  :", item.connectedAt);
  console.log("  expiresAt    :", item.expiresAt);
  console.log("  adAccountId  :", item.selectedAdAccountId || item.adAccountId || item.credentials?.selectedAdAccountId || "(not set)");

  // Decrypt the token
  const encryptedToken = item.accessToken || item.credentials?.accessToken;
  if (!encryptedToken) {
    console.log("❌ No accessToken found in integration record.");
    return;
  }

  let token;
  try {
    token = encryptionService.decrypt(encryptedToken);
    console.log("  token preview:", token.slice(0, 20) + "...");
  } catch (e) {
    console.log("❌ Failed to decrypt token:", e.message);
    return;
  }

//   Get ad account ID
  let adAccountId = item.selectedAdAccountId || item.adAccountId ||
    item.credentials?.selectedAdAccountId || item.credentials?.adAccountId;
    
    // let adAccountId =722737497345004;

  if (!adAccountId) {
    console.log("\n⚠️  No adAccountId stored. Fetching ad accounts from Meta API...");
    try {
      const meRes = await axios.get("https://graph.facebook.com/v24.0/me/adaccounts", {
        params: { access_token: token, fields: "id,name,account_status,currency,spend_cap,amount_spent" },
        timeout: 10000,
      });
      const accounts = meRes.data?.data || [];
      console.log(`  Found ${accounts.length} ad account(s):`);
      accounts.forEach(a => {
        console.log(`    ID: ${a.id} | Name: ${a.name} | Status: ${a.account_status} | Spent: ${a.amount_spent}`);
      });
      if (accounts.length > 0) adAccountId = accounts[0].id;
    } catch (e) {
      console.log("❌ Failed to fetch ad accounts:", e.response?.data || e.message);
      return;
    }
  }

  if (!adAccountId) {
    console.log("❌ No ad account available to test.");
    return;
  }

  if (!String(adAccountId).startsWith("act_")) adAccountId = `act_${adAccountId}`;
  console.log("\n📊 Testing ad account:", adAccountId);

  // 2. Fetch campaign list
  console.log("\n--- CAMPAIGNS ---");
  try {
    const campRes = await axios.get(
      `https://graph.facebook.com/v24.0/${adAccountId}/campaigns`,
      {
        params: {
          access_token: token,
          fields: "id,name,status,objective,created_time",
          limit: 10,
        },
        timeout: 10000,
      }
    );
    const campaigns = campRes.data?.data || [];
    console.log(`Found ${campaigns.length} campaign(s):`);
    campaigns.forEach(c => {
      console.log(`  [${c.status}] ${c.name} | ID: ${c.id} | Objective: ${c.objective} | Created: ${c.created_time}`);
    });
  } catch (e) {
    console.log("❌ Campaign fetch failed:", e.response?.data || e.message);
  }

  // 3. Fetch last 7 days spend
  console.log("\n--- LAST 7 DAYS SPEND ---");
  try {
    const today = new Date();
    const since = new Date(today - 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
    const until = today.toISOString().split("T")[0];

    const insightRes = await axios.get(
      `https://graph.facebook.com/v24.0/${adAccountId}/insights`,
      {
        params: {
          access_token: token,
          time_range: JSON.stringify({ since, until }),
          fields: "spend,impressions,clicks,reach",
          time_increment: 1,
          limit: 10,
        },
        timeout: 10000,
      }
    );
    const insights = insightRes.data?.data || [];
    if (insights.length === 0) {
      console.log("  No spend data for last 7 days.");
    } else {
      let totalSpend = 0;
      insights.forEach(d => {
        console.log(`  ${d.date_start}: ₹${d.spend} spend | ${d.impressions} impressions | ${d.clicks} clicks`);
        totalSpend += Number(d.spend || 0);
      });
      console.log(`  TOTAL SPEND: ₹${totalSpend.toFixed(2)}`);
    }
  } catch (e) {
    console.log("❌ Insights fetch failed:", e.response?.data || e.message);
  }

  console.log("\n=== TEST COMPLETE ===\n");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
