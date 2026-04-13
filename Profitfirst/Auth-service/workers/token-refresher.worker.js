const { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { sqsClient, newDynamoDB, newTableName } = require("../config/aws.config");
const { refreshShiprocketToken } = require("../services/token-refresh.service");

const QUEUE_URL = process.env.TOKEN_REFRESH_QUEUE_URL;
async function pollQueue() {
    console.log("🚀 [TokenWorker] Listening for Token Jobs...");
    
    while (true) {
        try {
            const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
                QueueUrl: QUEUE_URL, WaitTimeSeconds: 20, MaxNumberOfMessages: 1
            }));

            if (!Messages) continue;
            const msg = Messages[0];
            const body = JSON.parse(msg.Body);

            // 🟢 CASE A: THE TRIGGER (EventBridge sends this)
            if (body.type === "DISPATCH_TOKEN_AUDIT") {
                await runManagerLogic();
            }

            // 🟢 CASE B: THE INDIVIDUAL WORK (Refresh one merchant)
            if (body.type === "TOKEN_REFRESH") {
                await runWorkerLogic(body);
            }

            // Successfully processed -> Delete from Queue
            await sqsClient.send(new DeleteMessageCommand({
                QueueUrl: QUEUE_URL, ReceiptHandle: msg.ReceiptHandle
            }));

        } catch (err) {
            console.error("❌ Worker Error:", err.message);
            // SQS will retry this message based on Redrive Policy
        }
    }
}

/**
 * 🕵️ MANAGER LOGIC: Finds expiring tokens and spreads them out
 */
async function runManagerLogic() {
    console.log("📡 [Manager] Querying GSI1 for expiring tokens...");
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 7); // Check for next 7 days

    const res = await newDynamoDB.send(new QueryCommand({
        TableName: newTableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND GSI1SK <= :expiry",
        ExpressionAttributeValues: { ":pk": "INTEGRATION", ":expiry": threshold.toISOString() }
    }));

    const items = res.Items || [];
    let delay = 0;

    for (const item of items) {
        await sqsClient.send(new SendMessageCommand({
            QueueUrl: QUEUE_URL,
            DelaySeconds: delay, // 🟢 Rate Limit Strategy: Spreads calls
            MessageBody: JSON.stringify({
                type: "TOKEN_REFRESH",
                merchantId: item.PK.replace("MERCHANT#", ""),
                platform: item.platform,
                email: item.email,
                password: item.password 
            })
        }));
        // Increase delay by 5 seconds for every next user
        delay = (delay + 5) % 900; 
    }
    console.log(`✉️ Dispatched ${items.length} refresh jobs with staggered delays.`);
}

async function runWorkerLogic(data) {
    console.log(`🔄 [Worker] Processing ${data.platform} for ${data.merchantId}`);
    if (data.platform === 'shiprocket') {
        const success = await refreshShiprocketToken(data.merchantId, data.email, data.password);
        if (!success) {
            await markActionRequired(data.merchantId, data.platform);
        }
    }
    // Meta/Shopify logic can be added here
}

async function markActionRequired(merchantId, platform) {
    await newDynamoDB.send(new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `INTEGRATION#${platform.toUpperCase()}` },
        UpdateExpression: "SET #s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":status": "ACTION_REQUIRED" }
    }));
}

pollQueue();