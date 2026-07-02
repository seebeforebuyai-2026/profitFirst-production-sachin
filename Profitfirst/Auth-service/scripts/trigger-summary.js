/**
 * Trigger summary recalculation for a merchant.
 * Run this after any DB patch to refresh dashboard numbers.
 */
require("dotenv").config();
const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { sqsClient, summaryQueueUrl } = require("../config/aws.config");

const MERCHANT_ID = "493aa5ec-a011-701d-818a-ab89873da82d";

async function main() {
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: summaryQueueUrl,
    MessageBody: JSON.stringify({
      type: "SUMMARY_CALC",
      merchantId: MERCHANT_ID,
      affectedDates: [],  // empty = recalculate all 365 days
    }),
  }));
  console.log("✅ Summary recalculation triggered for", MERCHANT_ID);
  console.log("   Make sure summary-calculator.worker.js is running.");
}

main().catch(e => console.error("❌", e.message));
