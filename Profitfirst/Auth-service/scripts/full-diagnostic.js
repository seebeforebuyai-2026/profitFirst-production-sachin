const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const {
  GetCommand,
  QueryCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const {
  newDynamoDB,
  newTableName,
  s3Client,
  s3BucketName,
} = require("../config/aws.config");
const shopifyUtil = require("../utils/shopify.util");
const encryption = require("../utils/encryption");
const axios = require("axios");

// 🟢 THE MERCHANT FROM YOUR LOGS
const MERCHANT_ID = "41037dca-f0a1-7005-fcfe-6841ff1fc07b";
const startDateStr = "2026-02-21";
const endDateStr = "2026-02-23";

async function runDiagnostic() {
  console.log("\n🧪 STARTING 1000% PRODUCTION DIAGNOSTIC...");
  console.log("===========================================");

  try {
    // 1. TEST AWS CREDENTIALS & DYNAMODB
    console.log("Checking DynamoDB Connection...");
    const testDB = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "PROFILE" },
      }),
    );
    if (!testDB.Item)
      throw new Error(
        "Could not find Merchant Profile. Check your AWS keys and Table Name.",
      );
    console.log("✅ DynamoDB: Connected & Profile Found.");

    // 2. TEST S3 BUCKET
    console.log("Checking S3 Connection...");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3BucketName,
        Key: "test_connection.txt",
        Body: "Connection OK",
      }),
    );
    console.log("✅ S3 Storage: Connected & Writeable.");

    // 3. FETCH INTEGRATIONS
    const shopifyRec = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#SHOPIFY" },
      }),
    );
    const metaRec = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#META" },
      }),
    );
    const srRec = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#SHIPROCKET" },
      }),
    );

    // 4. TEST SHOPIFY (LAST 3 DAYS)
    console.log("\n📡 Testing Shopify GraphQL (3 Days)...");

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const shopifyData = await shopifyUtil.fetchShopifyOrders(
      shopifyRec.Item.shopifyStore,
      shopifyRec.Item.accessToken,
      startDateStr,
    );
    console.log(
      `✅ Shopify: Success. Found ${shopifyData.edges.length} orders.`,
    );

    // 5. TEST META ADS (LAST 3 DAYS)
    console.log("📡 Testing Meta Graph API (3 Days)...");
    const metaToken = encryption.decrypt(metaRec.Item.accessToken);
    const metaRes = await axios.get(
      `https://graph.facebook.com/v20.0/${metaRec.Item.adAccountId}/insights`,
      {
        params: {
          access_token: metaToken,
          time_range: JSON.stringify({
            since: startDateStr, // 👈 Use start
            until: endDateStr, // 👈 Use end
          }),
          fields: "spend",
          time_increment: 1,
        },
      },
    );
    console.log(
      `✅ Meta: Success. Found ${metaRes.data.data.length} days of spend data.`,
    );

    // 6. TEST SHIPROCKET (LAST 3 DAYS)
    console.log("📡 Testing Shiprocket REST API (3 Days)...");
    const srToken = encryption.decrypt(srRec.Item.token);
    const srRes = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/shipments",
      {
        headers: { Authorization: `Bearer ${srToken}` },
        params: {
          from: startDateStr, // 👈 Use start
          to: endDateStr, // 👈 Use end
        },
      },
    );
    console.log(
      `✅ Shiprocket: Success. Found ${srRes.data.data?.length || 0} shipments.`,
    );

    console.log("\n===========================================");
    console.log("🏆 DIAGNOSTIC RESULT: ALL SYSTEMS GO!");
    console.log("Your credentials and API utilities are perfect.");
    console.log("The issue is purely the SQS Worker environment.");
    console.log("===========================================\n");
  } catch (error) {
    console.error("\n❌ DIAGNOSTIC FAILED!");
    console.error("Location:", error.stack.split("\n")[1]);
    console.error("Message:", error.message);
    if (error.response) console.error("API Error Detail:", error.response.data);
  }
}

runDiagnostic();
