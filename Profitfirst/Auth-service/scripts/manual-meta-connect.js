const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');
const encryption = require('../utils/encryption.js');
const axios = require('axios');

// 🟢 STEP 1: PASTE YOUR DATA HERE
const MERCHANT_ID = '41037dca-f0a1-7005-fcfe-6841ff1fc07b'; 
const MANUAL_AD_ACCOUNT_ID = 'act_1547752953096076'; 
const MANUAL_ACCESS_TOKEN = 'EAAKukgoT7N8BRKdeYdbRHZBANrgdyZCbgRxJcYVkbAohboZBWXG6lfRBbHehLCJNZBaWrmjXhrkjrWfe54LdZBKaCZA2AJSyvTUBLvWBzl5Oo20wZBLZCAQdEIxKaKDQR1BgJRtTaVejIHUZBLZB0MrjqQglMwyMoe7su76kZAABFAF7TKgTY0YGk65JKzijwTsIQhnkvEgakWTfKNfw5y2'; 
async function validateMetaToken(token, adAccountId) {
    console.log("🔍 Testing token validity with Meta...");
    try {
        // We attempt to fetch the account name. If this fails, the token or ID is bad.
        const response = await axios.get(`https://graph.facebook.com/v20.0/${adAccountId}`, {
            params: {
                fields: 'name,account_status',
                access_token: token
            }
        });
        
        console.log(`✅ Token Valid! Connected to: ${response.data.name}`);
        return true;
    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.error("❌ INVALID TOKEN or AD ACCOUNT ID:", errorMsg);
        return false;
    }
}

async function injectMetaIntegration() {
    console.log(`🚀 Starting Meta Ads link for Merchant: ${MERCHANT_ID}`);

    // 🛡️ PRE-SAVE VALIDATION
    const isValid = await validateMetaToken(MANUAL_ACCESS_TOKEN, MANUAL_AD_ACCOUNT_ID);
    
    if (!isValid) {
        console.log("⛔ ABORTING: Will not save invalid credentials to Database.");
        return;
    }

    try {
        const timestamp = new Date().toISOString();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 60);

        // 🔒 Encrypt only AFTER validation passes
        const encryptedToken = encryption.encrypt(MANUAL_ACCESS_TOKEN);

        const params = {
            TableName: newTableName,
            Item: {
                PK: `MERCHANT#${MERCHANT_ID}`,
                SK: `INTEGRATION#META`,
                entityType: 'INTEGRATION',
                platform: 'meta',
                adAccountId: MANUAL_AD_ACCOUNT_ID,
                accessToken: encryptedToken,
                status: 'active',
                expiresAt: expiresAt.toISOString(),
                connectedAt: timestamp,
                updatedAt: timestamp
            }
        };

        await newDynamoDB.send(new PutCommand(params));

        console.log("------------------------------------------");
        console.log("✨ SUCCESS: Verified and Saved to DB!");
        console.log(`Merchant:   ${MERCHANT_ID}`);
        console.log(`Ad Account: ${MANUAL_AD_ACCOUNT_ID}`);
        console.log(`Expires:    ${expiresAt.toDateString()}`);
        console.log("------------------------------------------");

    } catch (error) {
        console.error("❌ DYNAMODB ERROR:", error.message);
    }
}

injectMetaIntegration();