const axios = require("axios");
const encryption = require("../utils/encryption");
const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");

exports.refreshShiprocketToken = async (merchantId, email, encryptedPassword) => {
    try {
        const password = encryption.decrypt(encryptedPassword);
        
        // 1. Shiprocket Login API
        const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
            email: email,
            password: password
        });

        const newToken = res.data.token;
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + 10); // Token valid for 10 days

        // 2. Save new token to DynamoDB
        await newDynamoDB.send(new UpdateCommand({
            TableName: newTableName,
            Key: { PK: `MERCHANT#${merchantId}`, SK: "INTEGRATION#SHIPROCKET" },
            UpdateExpression: "SET #t = :t, expiresAt = :e, updatedAt = :u, #s = :active",
            ExpressionAttributeNames: { "#t": "token", "#s": "status" },
            ExpressionAttributeValues: {
                ":t": encryption.encrypt(newToken),
                ":e": newExpiry.toISOString(),
                ":active": "active",
                ":u": new Date().toISOString()
            }
        }));

        console.log(`✅ [TokenManager] Shiprocket Refreshed: ${merchantId}`);
        return true;
    } catch (err) {
        console.error(`❌ [TokenManager] Shiprocket Refresh Failed for ${merchantId}:`, err.message);
        return false;
    }
};