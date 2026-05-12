const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const sqsClient = new SQSClient({ region: "ap-southeast-1" });

const trigger = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await sqsClient.send(new SendMessageCommand({
    QueueUrl: process.env.SHOPIFY_QUEUE_URL,
    MessageBody: JSON.stringify({
      type: "SHOPIFY_SYNC",
      merchantId: "f173edda-a031-705d-cbb3-e868f0a6782a",
      mode: "full",
      sinceDate: thirtyDaysAgo.toISOString() // 🟢 SIRF 30 DIN
    })
  }));
  console.log("🚀 30-Day Sync Triggered for audit.");
};
trigger();