/**
 * FIX: Update wrong Meta ad account and trigger full sync
 *
 * What this does:
 *  1. Updates INTEGRATION#META with the correct ad account ID
 *  2. Resets SYNC#META to allow fresh sync
 *  3. Deletes any existing ADS# records (none in this case, but safe to run)
 *  4. Deletes SUMMARY# records so they recalculate with correct ads data
 *  5. Triggers full sync (Shopify → Meta → Shiprocket → Summary relay)
 *
 * Safe to run: COGS, expenses, profile, orders, shipments — all untouched.
 */
require("dotenv").config();
const {
  GetCommand, UpdateCommand, PutCommand,
  QueryCommand, DeleteCommand
} = require("@aws-sdk/lib-dynamodb");
const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { newDynamoDB, newTableName, sqsClient, shopifyQueueUrl } = require("../config/aws.config");

const MERCHANT_ID    = "999a654c-50c1-705b-bc4d-9813265dbc3b";
const CORRECT_AD_ACC = "act_722737497345004";   // correct account
const WRONG_AD_ACC   = "act_1651963739323126";  // was set before

async function deleteAllByPrefix(prefix) {
  let deleted = 0, lastKey;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": prefix },
      ProjectionExpression: "PK, SK",
      ExclusiveStartKey: lastKey,
    }));

    for (const item of res.Items || []) {
      await newDynamoDB.send(new DeleteCommand({
        TableName: newTableName,
        Key: { PK: item.PK, SK: item.SK },
      }));
      deleted++;
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return deleted;
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(  "║  FIX META AD ACCOUNT                                          ║");
  console.log(`║  Merchant : ${MERCHANT_ID}  ║`);
  console.log(`║  Old account : ${WRONG_AD_ACC}                     ║`);
  console.log(`║  New account : ${CORRECT_AD_ACC}                    ║`);
  console.log(  "╚══════════════════════════════════════════════════════════════╝\n");

  // ── Step 1: Verify current integration ───────────────────────────────
  console.log("🔍 Step 1: Verifying current Meta integration...");
  const metaRes = await newDynamoDB.send(new GetCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#META" },
  }));
  if (!metaRes.Item) {
    console.error("❌ No META integration found. Aborting.");
    process.exit(1);
  }
  console.log("  Current selectedAdAccountId:", metaRes.Item.selectedAdAccountId);
  console.log("  Status:", metaRes.Item.status);
  console.log("  ✅ Integration found.\n");

  // ── Step 2: Update ad account ID ─────────────────────────────────────
  console.log("✏️  Step 2: Updating ad account ID to correct value...");
  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#META" },
    UpdateExpression: "SET selectedAdAccountId = :acc, updatedAt = :t REMOVE lastSyncTime",
    ExpressionAttributeValues: {
      ":acc": CORRECT_AD_ACC,
      ":t"  : new Date().toISOString(),
    },
  }));
  console.log("  ✅ Updated selectedAdAccountId →", CORRECT_AD_ACC, "\n");

  // ── Step 3: Delete ADS# records (wrong account data) ─────────────────
  console.log("🗑️  Step 3: Deleting ADS# records from wrong account...");
  const adsDeleted = await deleteAllByPrefix("ADS#");
  console.log(`  ✅ Deleted ${adsDeleted} ADS# records.\n`);

  // ── Step 4: Delete SUMMARY# records (so they recalculate correctly) ──
  console.log("🗑️  Step 4: Deleting SUMMARY# records (will recalculate with correct ads)...");
  const sumDeleted = await deleteAllByPrefix("SUMMARY#");
  console.log(`  ✅ Deleted ${sumDeleted} SUMMARY# records.\n`);

  // ── Step 5: Reset SYNC#META so it will re-run from scratch ───────────
  console.log("🔄 Step 5: Resetting SYNC#META status...");
  await newDynamoDB.send(new PutCommand({
    TableName: newTableName,
    Item: {
      PK       : `MERCHANT#${MERCHANT_ID}`,
      SK       : "SYNC#META",
      status   : "pending",
      percent  : 0,
      updatedAt: new Date().toISOString(),
    },
  }));
  console.log("  ✅ SYNC#META reset to pending.\n");

  // ── Step 6: Reset SYNC#SHOPIFY and SYNC#SHIPROCKET to trigger full relay ──
  console.log("🔄 Step 6: Resetting all platform sync statuses for full relay...");
  for (const platform of ["SHOPIFY", "META", "SHIPROCKET"]) {
    await newDynamoDB.send(new PutCommand({
      TableName: newTableName,
      Item: {
        PK       : `MERCHANT#${MERCHANT_ID}`,
        SK       : `SYNC#${platform}`,
        status   : "in_progress",
        percent  : 0,
        sinceDate: new Date(Date.now() - 65 * 24 * 3600 * 1000).toISOString(), // 65 days back
        updatedAt: new Date().toISOString(),
      },
    }));
  }
  console.log("  ✅ All sync statuses set to in_progress.\n");

  // ── Step 7: Fire Shopify sync (starts the relay: Shopify→Meta→Shiprocket→Summary) ──
  console.log("🚀 Step 7: Triggering full sync (Shopify → Meta → Shiprocket → Summary)...");
  const sinceDate = new Date(Date.now() - 65 * 24 * 3600 * 1000).toISOString();
  await sqsClient.send(new SendMessageCommand({
    QueueUrl   : shopifyQueueUrl,
    MessageBody: JSON.stringify({
      type      : "SHOPIFY_SYNC",
      merchantId: MERCHANT_ID,
      mode      : "full",
      sinceDate,
      pageCount : 1,
    }),
  }));
  console.log("  ✅ Full sync triggered.\n");

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log(  "║  DONE — Summary                                               ║");
  console.log(  "╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Ad account updated : ${WRONG_AD_ACC} → ${CORRECT_AD_ACC}`);
  console.log(`  ADS# records deleted: ${adsDeleted}`);
  console.log(`  SUMMARY# records deleted: ${sumDeleted} (will recalculate)`);
  console.log("  Full sync started  : Shopify → Meta → Shiprocket → Summary");
  console.log("\n  ⚠️  Make sure all 4 workers are running on the server:");
  console.log("     node workers/shopify-sync.worker.js");
  console.log("     node workers/meta-sync.worker.js");
  console.log("     node workers/shiprocket-sync.worker.js");
  console.log("     node workers/summary-calculator.worker.js\n");
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
