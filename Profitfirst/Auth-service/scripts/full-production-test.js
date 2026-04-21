const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const encryption = require("../utils/encryption");
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");

const MERCHANT_ID = "41037dca-f0a1-7005-fcfe-6841ff1fc07b";

async function verifyScopeAndNames() {
    console.log(`\n🔍 VERIFYING ACCESS SCOPES & TARGET ORDERS`);
    console.log("=".repeat(50));

    // 1. Get Token
    const intRes = await newDynamoDB.send(new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": "INTEGRATION#SHOPIFY" }
    }));
    const shopifyToken = encryption.decrypt(intRes.Items[0].accessToken);
    const shop = intRes.Items[0].shopifyStore;

    // 2. CHECK SCOPES (Asli Sach yahan hai)
    try {
        const scopeRes = await axios.get(`https://${shop}/admin/oauth/access_scopes.json`, {
            headers: { "X-Shopify-Access-Token": shopifyToken }
        });
        const scopes = scopeRes.data.access_scopes.map(s => s.handle);
        console.log("📜 Active Scopes:", scopes.join(", "));
        if (!scopes.includes("read_all_orders")) {
            console.error("🚨 ALERT: 'read_all_orders' is MISSING in this token!");
        } else {
            console.log("✅ 'read_all_orders' is present.");
        }
    } catch (e) { console.error("Could not fetch scopes:", e.message); }

    // 3. SEARCH SPECIFIC FEB 19 ORDERS BY NAME
    // Boss ne bola Feb 19 ko 55 orders hain. Let's find some.
    console.log("\n📡 Searching for specific Feb 19 orders by name...");
    const searchRes = await axios.post(`https://${shop}/admin/api/2024-04/graphql.json`, {
        query: `query { 
            orders(first: 5, query: "created_at:>=2026-02-19 AND created_at:<=2026-02-19") { 
                edges { node { name createdAt } } 
            } 
        }`
    }, { headers: { "X-Shopify-Access-Token": shopifyToken } });

    console.log("Orders found for Feb 19 using date filter:", searchRes.data.data.orders.edges.length);

    const manualSearch = await axios.post(`https://${shop}/admin/api/2024-04/graphql.json`, {
        query: `query { 
            orders(first: 5, query: "name:#luxc3123 OR name:#luxc3124") { 
                edges { node { name createdAt } } 
            } 
        }`
    }, { headers: { "X-Shopify-Access-Token": shopifyToken } });

    console.log("Orders found by manual name search:", manualSearch.data.data.orders.edges.map(e => e.node.name));
}

verifyScopeAndNames();