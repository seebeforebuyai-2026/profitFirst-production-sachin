const { QueryCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { newDynamoDB, newTableName, s3Client, s3BucketName } = require("../config/aws.config");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const MERCHANT_ID = "c1c33d7a-d0a1-7089-bb93-76dff06d488b";
async function ultimateClean() {
    console.log(`🧹 Starting Targeted Clean for Merchant: ${MERCHANT_ID}`);

    try {
        // 1. DYNAMODB RECURSIVE DELETE (Targeted)
        console.log("⏳ Step 1: Cleaning DynamoDB Data Records...");
        let lastKey = null;
        let totalDeleted = 0;

        do {
            const params = {
                TableName: newTableName,
                KeyConditionExpression: "PK = :pk",
                ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}` }
            };
            if (lastKey) params.ExclusiveStartKey = lastKey;

            const res = await newDynamoDB.send(new QueryCommand(params));
            
            for (const item of res.Items) {
                const sk = item.SK;
                // Sirf in prefixes wale records ko delete karenge (Baki PROFILE/INTEGRATION safe rahenge)
                const isDataRecord = ['ORDER#', 'ADS#', 'SUMMARY#', 'SHIPMENT#', 'SYNC#', 'VARIANT#', 'PRODUCT#'].some(p => sk.startsWith(p));
                
                if (isDataRecord) {
                    await newDynamoDB.send(new DeleteCommand({ 
                        TableName: newTableName, 
                        Key: { PK: item.PK, SK: item.SK } 
                    }));
                    totalDeleted++;
                }
            }
            lastKey = res.LastEvaluatedKey;
        } while (lastKey);
        
        console.log(`✅ DynamoDB: ${totalDeleted} records deleted.`);

        // 2. WATERMARK & FLAG RESET
        console.log("⏳ Step 2: Resetting Watermarks and Flags...");
        const platforms = ['SHOPIFY', 'META', 'SHIPROCKET'];
        
        for (const p of platforms) {
            try {
                await newDynamoDB.send(new UpdateCommand({
                    TableName: newTableName,
                    Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: `INTEGRATION#${p}` },
                    UpdateExpression: "REMOVE lastSyncTime, lastSyncedOrderId, lastSyncedDate, lastSyncedShipmentId, syncStatus"
                }));
            } catch (e) { /* skip if record doesn't exist yet */ }
        }

        await newDynamoDB.send(new UpdateCommand({
            TableName: newTableName,
            Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: 'PROFILE' },
            UpdateExpression: "SET onboardingCompleted = :t, onboardingStep = :s, cogsCompleted = :f, expensesCompleted = :f, initialSyncCompleted = :f, dashboardUnlocked = :f REMOVE lastSyncTime",
            ExpressionAttributeValues: { ":t": true, ":s": 5, ":f": false }
        }));

        console.log("🏆 SUCCESS: All systems reset. You can now onboard/sync fresh.");
    } catch (error) {
        console.error("❌ CLEAN FAILED:", error.message);
    }
}

ultimateClean();














// const { QueryCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
// const { ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
// const { newDynamoDB, newTableName, s3Client, s3BucketName } = require("../config/aws.config");
// const path = require("path");
// require("dotenv").config({ path: path.join(__dirname, "../.env") });

// const MERCHANT_ID = "c1c33d7a-d0a1-7089-bb93-76dff06d488b";

// async function ultimateClean() {
//   console.log(`🧹 Starting Targeted Clean for Merchant: ${MERCHANT_ID}`);

//   try {
//     // 1. DYNAMODB DELETE - Sirf data records, integration safe rahenge
//     console.log("⏳ Step 1: Cleaning DynamoDB Data Records...");
//     let lastKey = null;
//     let totalDeleted = 0;

//     do {
//       const params = {
//         TableName: newTableName,
//         KeyConditionExpression: "PK = :pk",
//         ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}` }
//       };
//       if (lastKey) params.ExclusiveStartKey = lastKey;

//       const res = await newDynamoDB.send(new QueryCommand(params));

//       for (const item of res.Items) {
//         const sk = item.SK;
//         // Data records delete karo, PROFILE aur INTEGRATION safe
//         const isDataRecord = [
//           'ORDER#', 'ADS#', 'SUMMARY#', 'SHIPMENT#', 
//           'SYNC#', 'VARIANT#', 'PRODUCT#'
//         ].some(p => sk.startsWith(p));

//         if (isDataRecord) {
//           await newDynamoDB.send(new DeleteCommand({
//             TableName: newTableName,
//             Key: { PK: item.PK, SK: item.SK }
//           }));
//           totalDeleted++;
//         }
//       }
//       lastKey = res.LastEvaluatedKey;
//     } while (lastKey);

//     console.log(`✅ DynamoDB: ${totalDeleted} records deleted.`);

//     // 2. S3 CLEANUP (Optional but Good)
//     console.log("⏳ Step 2: Cleaning S3 Raw Data...");
//     const s3Prefixes = [
//       `${MERCHANT_ID}/orders/`,
//       `${MERCHANT_ID}/shipments/`,
//       `${MERCHANT_ID}/ads/`,
//     ];

//     for (const prefix of s3Prefixes) {
//       try {
//         const listRes = await s3Client.send(new ListObjectsV2Command({
//           Bucket: s3BucketName,
//           Prefix: prefix
//         }));

//         if (listRes.Contents && listRes.Contents.length > 0) {
//           await s3Client.send(new DeleteObjectsCommand({
//             Bucket: s3BucketName,
//             Delete: {
//               Objects: listRes.Contents.map(obj => ({ Key: obj.Key }))
//             }
//           }));
//           console.log(`✅ S3: Deleted ${listRes.Contents.length} files from ${prefix}`);
//         }
//       } catch (e) {
//         console.log(`⚠️ S3 cleanup skipped for ${prefix}`);
//       }
//     }

//     // 3. INTEGRATION WATERMARK RESET (Integration record INTACT)
//     console.log("⏳ Step 3: Resetting Integration Watermarks...");
//     const platforms = ['SHOPIFY', 'META', 'SHIPROCKET'];

//     for (const p of platforms) {
//       try {
//         await newDynamoDB.send(new UpdateCommand({
//           TableName: newTableName,
//           Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: `INTEGRATION#${p}` },
//           UpdateExpression: "REMOVE lastSyncTime, lastSyncedOrderId, lastSyncedDate, lastSyncedShipmentId, syncStatus"
//         }));
//         console.log(`✅ Reset watermark for ${p}`);
//       } catch (e) {
//         console.log(`⚠️ ${p} integration not found, skipping`);
//       }
//     }

//     // 4. 🟢 PROFILE RESET - CRITICAL FIX
//     console.log("⏳ Step 4: Resetting Profile Flags...");
//     await newDynamoDB.send(new UpdateCommand({
//       TableName: newTableName,
//       Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: 'PROFILE' },
//       UpdateExpression: `
//         SET onboardingCompleted = :t, 
//             onboardingStep = :s, 
//             cogsCompleted = :t,
//             expensesCompleted = :f, 
//             initialSyncCompleted = :f, 
//             dashboardUnlocked = :f 
//         REMOVE lastSyncTime, lastFullSyncAt
//       `,
//       ExpressionAttributeValues: { 
//         ":t": true,    // onboarding done, cogs done
//         ":s": 6,       // step 6 = after onboarding, before expense save
//         ":f": false    // expenses, sync, dashboard all fresh
//       }
//     }));

//     console.log("\n🏆 SUCCESS: All systems reset!");
//     console.log("\n📋 NEXT STEPS:");
//     console.log("1. Start all 4 workers (shopify, meta, shiprocket, summary)");
//     console.log("2. Login to frontend");
//     console.log("3. Go to Business Expenses page");
//     console.log("4. Click 'Finalize & Sync Dashboard →' button");
//     console.log("5. Wait 3-5 minutes for sync to complete");
//     console.log("6. Dashboard will auto-unlock and redirect\n");

//   } catch (error) {
//     console.error("❌ CLEAN FAILED:", error.message);
//   }
// }

// ultimateClean();