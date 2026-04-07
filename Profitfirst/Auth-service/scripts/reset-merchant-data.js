const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { QueryCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');

// 🟢 SET THE MERCHANT ID YOU WANT TO RESET
const MERCHANT_ID = '41037dca-f0a1-7005-fcfe-6841ff1fc07b'; 

async function resetMerchant() {
    console.log(`🧹 Starting Safe Reset for Merchant: ${MERCHANT_ID}`);
    console.log("--------------------------------------------------");
    try {
        // 1. Fetch all records for this merchant
        const res = await newDynamoDB.send(new QueryCommand({
            TableName: newTableName,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}` }
        }));

        const items = res.Items || [];
        let deletedCount = 0;

        // 2. Filter and Delete only data records (KEEP Profile and Integrations)
        for (const item of items) {
            const sk = item.SK;

            // 🟢 List of things to DELETE
            const shouldDelete = 
                sk.startsWith('ORDER#') || 
                sk.startsWith('VARIANT#') || 
                sk.startsWith('PRODUCT#') || 
                sk.startsWith('ADS#') || 
                sk.startsWith('SUMMARY#') || 
                sk.startsWith('SHIPMENT#') || 
                sk.startsWith('EXPENSE#') ||
                sk.startsWith('SYNC#'); // Reset progress bars too

            if (shouldDelete) {
                await newDynamoDB.send(new DeleteCommand({
                    TableName: newTableName,
                    Key: { PK: item.PK, SK: item.SK }
                }));
                deletedCount++;
            }
        }

        console.log(`✅ Deleted ${deletedCount} data records.`);

        // 3. Reset the Flags in the PROFILE so the Dashboard locks again
        console.log("🔄 Resetting Profile setup flags...");
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
                ':step': 5, // 🟢 Forces user to start at the Dashboard setup
                ':false': false
            }
        }));

        console.log("--------------------------------------------------");
        console.log("🏆 SUCCESS: Merchant is reset to 'Just Onboarded' state.");
        console.log("Keep your terminals open and refresh your browser to start the test!");

    } catch (error) {
        console.error("❌ RESET FAILED:", error.message);
    }
}

resetMerchant();