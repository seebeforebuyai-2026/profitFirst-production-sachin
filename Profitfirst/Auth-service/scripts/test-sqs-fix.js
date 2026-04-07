const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { GetCommand, QueryCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');
const shopifyUtil = require('../utils/shopify.util');
const encryption = require('../utils/encryption');
const axios = require('axios');
const { formatInTimeZone } = require('date-fns-tz');

const MERCHANT_ID = '41037dca-f0a1-7005-fcfe-6841ff1fc07b'; 
const TEST_DATES = ["2026-02-21", "2026-02-22", "2026-02-23"];

async function runThreeDayBatch() {
    console.log(`\n🚀 STARTING 3-DAY PRODUCTION BATCH TEST [${TEST_DATES[0]} to ${TEST_DATES[2]}]`);
    console.log("==========================================================================");

    try {
        // 1. PRE-SYNC: Fetch all saved Variant Costs (COGS)
        console.log("📥 Step 1: Loading COGS from Database...");
        const variantsRes = await newDynamoDB.send(new QueryCommand({
            TableName: newTableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `MERCHANT#${MERCHANT_ID}`, ':sk': 'VARIANT#' }
        }));
        const costMap = {};
        variantsRes.Items.forEach(v => costMap[v.variantId] = v.costPrice || 0);
        console.log(`✅ Loaded ${variantsRes.Items.length} variant costs.`);

        // 2. FETCH INTEGRATIONS
        const shopifyRec = await newDynamoDB.send(new GetCommand({ TableName: newTableName, Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: 'INTEGRATION#SHOPIFY' } }));
        const metaRec = await newDynamoDB.send(new GetCommand({ TableName: newTableName, Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: 'INTEGRATION#META' } }));
        const srRec = await newDynamoDB.send(new GetCommand({ TableName: newTableName, Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: 'INTEGRATION#SHIPROCKET' } }));

        // 3. LOOP THROUGH THE 3 DAYS
        for (const dateIST of TEST_DATES) {
            console.log(`\n📅 PROCESSING DAY: ${dateIST}`);
            console.log("----------------------------");

            // --- A. SHOPIFY ORDERS ---
            console.log(`📡 Fetching Shopify...`);
            const shopifyOrders = await shopifyUtil.fetchShopifyOrders(shopifyRec.Item.shopifyStore, shopifyRec.Item.accessToken, dateIST);
            
            let dailyRevGenerated = 0;
            let dailyRevEarned = 0;
            let dailyCogs = 0;

            // --- B. SHIPROCKET DELIVERIES ---
            console.log(`📡 Fetching Shiprocket...`);
            const srToken = encryption.decrypt(srRec.Item.token);
            const srRes = await axios.get('https://apiv2.shiprocket.in/v1/external/shipments', {
                headers: { 'Authorization': `Bearer ${srToken}` },
                params: { from: dateIST, to: dateIST }
            });
            const shipments = srRes.data.data || [];
            let dailyShipping = 0;

            // --- C. META ADS SPEND ---
            console.log(`📡 Fetching Meta Ads...`);
            const metaToken = encryption.decrypt(metaRec.Item.accessToken);
            const metaRes = await axios.get(`https://graph.facebook.com/v20.0/${metaRec.Item.adAccountId}/insights`, {
                params: {
                    access_token: metaToken,
                    time_range: JSON.stringify({ 'since': dateIST, 'until': dateIST }),
                    fields: 'spend',
                    time_increment: 1
                }
            });
            const dailyAds = Number(metaRes.data.data[0]?.spend || 0);

            // --- D. MATCHING & MATH ---
            shopifyOrders.edges.forEach(({ node: order }) => {
                const orderTotal = Number(order.totalPriceSet.shopMoney.amount);
                dailyRevGenerated += orderTotal;

                // Check if this order was delivered (matching by ID in SR shipments)
                const isDelivered = shipments.find(s => s.order_id.toString() === order.id.split('/').pop() && s.status.toLowerCase() === 'delivered');
                
                if (isDelivered) {
                    dailyRevEarned += orderTotal;
                    // Calculate Frozen COGS for this order
                    order.lineItems.edges.forEach(({ node: item }) => {
                        const vId = item.variant?.id?.split('/').pop();
                        dailyCogs += (costMap[vId] || 0) * item.quantity;
                    });
                }
            });

            shipments.forEach(s => dailyShipping += Number(s.freight_charges || 0));

            // --- E. SAVE TO SUMMARY# TABLE ---
            const gatewayFees = dailyRevEarned * 0.025;
            const moneyKept = dailyRevEarned - (dailyCogs + dailyAds + dailyShipping + gatewayFees);

            await newDynamoDB.send(new PutCommand({
                TableName: newTableName,
                Item: {
                    PK: `MERCHANT#${MERCHANT_ID}`,
                    SK: `SUMMARY#${dateIST}`,
                    entityType: 'SUMMARY',
                    date: dateIST,
                    revenueGenerated: dailyRevGenerated,
                    revenueEarned: dailyRevEarned,
                    adsSpend: dailyAds,
                    shippingSpend: dailyShipping,
                    cogs: dailyCogs,
                    gatewayFees: gatewayFees,
                    moneyKept: moneyKept,
                    updatedAt: new Date().toISOString()
                }
            }));

            console.log(`✅ Saved SUMMARY#${dateIST}: Profit ₹${moneyKept.toFixed(2)}`);
        }

        console.log("\n==========================================================================");
        console.log("🏆 BATCH TEST SUCCESSFUL!");
        console.log("You have successfully generated real data for 3 days.");
        console.log("Open your Dashboard and set the date range to Feb 21 - Feb 23.");
        console.log("==========================================================================\n");

    } catch (error) {
        console.error("\n❌ BATCH TEST FAILED!");
        console.error("Detail:", error.message);
    }
}

runThreeDayBatch();