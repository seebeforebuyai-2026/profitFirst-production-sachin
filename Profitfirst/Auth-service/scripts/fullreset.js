const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
    ScanCommand,
    DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

const {
    ListObjectsV2Command,
    DeleteObjectsCommand
} = require('@aws-sdk/client-s3');

const {
    newDynamoDB,
    newTableName,
    s3Client,
    bucketName
} = require('../config/aws.config');

async function wipeDynamoDB() {
    console.log("🔥 Deleting ALL DynamoDB data...");

    let lastEvaluatedKey;
    let deletedCount = 0;

    do {
        const res = await newDynamoDB.send(new ScanCommand({
            TableName: newTableName,
            ExclusiveStartKey: lastEvaluatedKey
        }));

        const items = res.Items || [];

        for (const item of items) {
            await newDynamoDB.send(new DeleteCommand({
                TableName: newTableName,
                Key: {
                    PK: item.PK,
                    SK: item.SK
                }
            }));
            deletedCount++;
        }

        lastEvaluatedKey = res.LastEvaluatedKey;

    } while (lastEvaluatedKey);

    console.log(`✅ DynamoDB cleared (${deletedCount} records deleted)`);
}

async function wipeS3() {
    console.log("🔥 Deleting ALL S3 files...");

    let continuationToken;
    let deletedCount = 0;

    do {
        const res = await s3Client.send(new ListObjectsV2Command({
            Bucket: bucketName,
            ContinuationToken: continuationToken
        }));

        const objects = res.Contents || [];

        if (objects.length > 0) {
            await s3Client.send(new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: {
                    Objects: objects.map(obj => ({ Key: obj.Key }))
                }
            }));

            deletedCount += objects.length;
        }

        continuationToken = res.NextContinuationToken;

    } while (continuationToken);

    console.log(`✅ S3 cleared (${deletedCount} files deleted)`);
}

async function fullWipe() {
    console.log("🚨🚨 FULL SYSTEM WIPE STARTED 🚨🚨");
    console.log("--------------------------------------------------");

    try {
        await wipeDynamoDB();
        await wipeS3();

        console.log("--------------------------------------------------");
        console.log("🏆 SUCCESS: System is completely EMPTY");
        console.log("You can now onboard real users safely.");

    } catch (err) {
        console.error("❌ WIPE FAILED:", err.message);
    }
}

fullWipe();