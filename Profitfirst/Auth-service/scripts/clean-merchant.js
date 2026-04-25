const { QueryCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const MERCHANT_ID = "f173edda-a031-705d-cbb3-e868f0a6782a";

async function hardResetMerchant() {
    console.log(`🧹 Starting Deep Clean for Merchant: ${MERCHANT_ID}`);
    
    try {
        // 1. Fetch all records for this merchant
        const res = await newDynamoDB.send(new QueryCommand({
            TableName: newTableName,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}` }
        }));

        const items = res.Items || [];
        let deletedCount = 0;

        for (const item of items) {
            const sk = item.SK;

            // 🟢 In cheezon ko DELETE karna hai (Data)
            const shouldDelete = 
                sk.startsWith('ORDER#') || 
                sk.startsWith('ADS#') || 
                sk.startsWith('SUMMARY#') || 
                sk.startsWith('SHIPMENT#') || 
                sk.startsWith('SYNC#') || 
                sk.startsWith('VARIANT#') || 
                sk.startsWith('PRODUCT#');

            if (shouldDelete) {
                await newDynamoDB.send(new DeleteCommand({
                    TableName: newTableName,
                    Key: { PK: item.PK, SK: item.SK }
                }));
                deletedCount++;
            }
        }
        console.log(`✅ Deleted ${deletedCount} corrupted data records.`);

        // 2. Reset Profile Flags to "Setup Mode"
        console.log("🔄 Resetting Profile to Lock state...");
        await newDynamoDB.send(new UpdateCommand({
            TableName: newTableName,
            Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: 'PROFILE' },
            UpdateExpression: `SET 
                onboardingCompleted = :true, 
                onboardingStep = :step, 
                cogsCompleted = :false, 
                expensesCompleted = :false, 
                initialSyncCompleted = :false, 
                dashboardUnlocked = :false`,
            ExpressionAttributeValues: {
                ':true': true,
                ':step': 5, // Re-trigger from COGS setup
                ':false': false
            }
        }));

        console.log("🏆 SUCCESS: Merchant is ready for a fresh 365-day sync!");
    } catch (error) {
        console.error("❌ RESET FAILED:", error.message);
    }
}

hardResetMerchant();