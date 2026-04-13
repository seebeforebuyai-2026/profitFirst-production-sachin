const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const sqsClient = new SQSClient({ region: "ap-southeast-1" });
const queueUrl = process.env.TOKEN_REFRESH_QUEUE_URL; 

async function trigger() {
  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      type: "DISPATCH_TOKEN_AUDIT" // 🟢 Wahi type jo EventBridge bhejega
    }),
  };

  try {
    console.log("🚀 Sending DISPATCH_TOKEN_AUDIT to Queue...");
    await sqsClient.send(new SendMessageCommand(params));
    console.log("✅ Success! Job sent. Now check your Worker terminal.");
  } catch (err) {
    console.error("❌ Failed:", err.message);
  }
}

trigger();