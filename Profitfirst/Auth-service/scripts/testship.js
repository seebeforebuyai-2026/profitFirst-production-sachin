const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function findMeta() {
    console.log("🔍 Looking for ANY Meta records for this merchant...");
    const res = await newDynamoDB.send(new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { 
            ":pk": `MERCHANT#41037dca-f0a1-7005-fcfe-6841ff1fc07b`, 
            ":sk": "ADS#" 
        },
        Limit: 5
    }));

    if (res.Items.length > 0) {
        console.log(`✅ Found ${res.Items.length} Meta records!`);
        console.log("Sample Meta Record SK:", res.Items[0].SK);
        console.log("Full Item Data:", JSON.stringify(res.Items[0], null, 2));
    } else {
        console.log("❌ NO META RECORDS AT ALL IN DYNAMODB!");
    }
}
findMeta();