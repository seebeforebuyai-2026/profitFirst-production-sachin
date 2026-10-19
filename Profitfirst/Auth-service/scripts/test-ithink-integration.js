/**
 * Test Script: Ithink Logistics Integration
 * Tests the full flow:
 * 1. Save Ithink credentials to DynamoDB via onboarding service
 * 2. Read them back from DynamoDB and verify
 *
 * Merchant: seebeforebuy.ai@gmail.com
 * merchantId: 493aa5ec-a011-701d-818a-ab89873da82d
 *
 * Run: node scripts/test-ithink-integration.js
 */

require("dotenv").config();

const dynamodbService = require("../services/dynamodb.service");
const onboardingService = require("../services/onboarding.service");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const MERCHANT_ID = "493aa5ec-a011-701d-818a-ab89873da82d";

// ── DUMMY CREDENTIALS FOR TESTING ──────────────────────────────
const DUMMY_ACCESS_TOKEN = "ithink_test_access_token_abc123";
const DUMMY_SECRET_KEY = "ithink_test_secret_key_xyz789";

async function runTest() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 ITHINK LOGISTICS INTEGRATION TEST");
  console.log("=".repeat(60));
  console.log(`📦 Merchant ID: ${MERCHANT_ID}`);
  console.log(`🔑 Dummy Access Token: ${DUMMY_ACCESS_TOKEN}`);
  console.log(`🔐 Dummy Secret Key: ${DUMMY_SECRET_KEY}`);
  console.log("=".repeat(60) + "\n");

  // ── STEP 1: Save via onboardingService ─────────────────────────
  console.log("📝 STEP 1: Saving Ithink Logistics credentials...");
  try {
    const result = await onboardingService.updateStep4TokenIntegration(
      MERCHANT_ID,
      {
        platform: "Ithink Logistics",
        access_token: DUMMY_ACCESS_TOKEN,
        secret_key: DUMMY_SECRET_KEY,
      },
    );

    if (result.success) {
      console.log("✅ Save successful!");
      console.log("   currentStep:", result.data?.currentStep);
      console.log("   onboardingCompleted:", result.data?.onboardingCompleted);
      console.log("   platform:", result.data?.platform);
    } else {
      console.error("❌ Save FAILED:", result.error);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Exception during save:", err.message);
    process.exit(1);
  }

  console.log();

  // ── STEP 2: Read back from DynamoDB ────────────────────────────
  console.log(
    "📖 STEP 2: Reading back INTEGRATION#ithink_logistics from DynamoDB...",
  );
  try {
    const readResult = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${MERCHANT_ID}`,
          SK: "INTEGRATION#ITHINK_LOGISTICS", // uppercase — createIntegration ye banata hai
        },
      }),
    );

    const item = readResult.Item;

    if (!item) {
      console.error("❌ Record NOT FOUND in DynamoDB!");
      console.error("   SK queried: INTEGRATION#ithink_logistics");
      process.exit(1);
    }

    console.log("✅ Record found in DynamoDB!");
    console.log("   PK:", item.PK);
    console.log("   SK:", item.SK);
    console.log("   platform:", item.platform);
    console.log("   platformDisplay:", item.platformDisplay);
    console.log("   status:", item.status);
    console.log(
      "   access_token (encrypted):",
      item.access_token
        ? item.access_token.substring(0, 20) + "..."
        : "MISSING ❌",
    );
    console.log(
      "   secret_key (encrypted):",
      item.secret_key ? item.secret_key.substring(0, 20) + "..." : "MISSING ❌",
    );
    console.log("   connectedAt:", item.connectedAt);
    console.log("   updatedAt:", item.updatedAt);
  } catch (err) {
    console.error("❌ Exception during read:", err.message);
    process.exit(1);
  }

  console.log();

  // ── STEP 3: Decrypt and verify tokens ──────────────────────────
  console.log("🔓 STEP 3: Decrypting and verifying tokens...");
  try {
    const encryptionService = require("../utils/encryption");

    const readResult = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${MERCHANT_ID}`,
          SK: "INTEGRATION#ITHINK_LOGISTICS", // uppercase
        },
      }),
    );

    const item = readResult.Item;

    if (!item) {
      console.error("❌ Record not found for decryption test");
      process.exit(1);
    }

    if (!item.access_token) {
      console.error("❌ access_token missing in record");
      process.exit(1);
    }

    if (!item.secret_key) {
      console.error("❌ secret_key missing in record");
      process.exit(1);
    }

    const decryptedAccessToken = encryptionService.decrypt(item.access_token);
    const decryptedSecretKey = encryptionService.decrypt(item.secret_key);

    const accessTokenMatch = decryptedAccessToken === DUMMY_ACCESS_TOKEN;
    const secretKeyMatch = decryptedSecretKey === DUMMY_SECRET_KEY;

    console.log("   access_token decrypted:", decryptedAccessToken);
    console.log("   secret_key decrypted:", decryptedSecretKey);
    console.log();
    console.log(
      "   access_token match:",
      accessTokenMatch ? "✅ CORRECT" : "❌ MISMATCH",
    );
    console.log(
      "   secret_key match:  ",
      secretKeyMatch ? "✅ CORRECT" : "❌ MISMATCH",
    );

    if (!accessTokenMatch || !secretKeyMatch) {
      console.error("\n❌ Encryption/Decryption FAILED — tokens do not match!");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Exception during decryption:", err.message);
    process.exit(1);
  }

  console.log();

  // ── STEP 4: Check PROFILE onboardingStep updated ───────────────
  console.log(
    "👤 STEP 4: Checking PROFILE record — onboardingStep and onboardingCompleted...",
  );
  try {
    const profileResult = await dynamodbService.getUserProfile(MERCHANT_ID);

    if (!profileResult.success) {
      console.error("❌ Profile not found");
      process.exit(1);
    }

    const profile = profileResult.data;
    console.log("   onboardingStep:", profile.onboardingStep);
    console.log("   onboardingCompleted:", profile.onboardingCompleted);

    if (profile.onboardingStep === 6 && profile.onboardingCompleted === true) {
      console.log(
        "   ✅ Step correctly updated to 6 and onboardingCompleted = true",
      );
    } else {
      console.warn(
        "   ⚠️  Expected onboardingStep: 6, onboardingCompleted: true",
      );
      console.warn(
        `   Got onboardingStep: ${profile.onboardingStep}, onboardingCompleted: ${profile.onboardingCompleted}`,
      );
    }
  } catch (err) {
    console.error("❌ Exception during profile check:", err.message);
  }

  console.log();

  // ── STEP 5: Check via getIntegrationsByMerchant ─────────────────
  console.log("🔍 STEP 5: Checking via getIntegrationsByMerchant...");
  try {
    const intResult =
      await dynamodbService.getIntegrationsByMerchant(MERCHANT_ID);

    if (!intResult.success) {
      console.error("❌ getIntegrationsByMerchant failed:", intResult.error);
    } else {
      const ithink = intResult.data.find(
        (i) =>
          i.SK === "INTEGRATION#ITHINK_LOGISTICS" ||
          i.platform === "ithink_logistics",
      );

      if (ithink) {
        console.log(
          "✅ Ithink integration found in merchant integrations list!",
        );
        console.log("   SK:", ithink.SK);
        console.log("   platform:", ithink.platform);
        console.log("   status:", ithink.status);
      } else {
        console.warn("⚠️  Ithink integration NOT found in integrations list");
        console.warn(
          "   Available integrations:",
          intResult.data.map((i) => i.SK || i.platform),
        );
      }
    }
  } catch (err) {
    console.error("❌ Exception:", err.message);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("🏁 TEST COMPLETE");
  console.log("=".repeat(60));
}

runTest().catch((err) => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
});
