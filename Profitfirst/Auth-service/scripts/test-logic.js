const { GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');
const shopifyUtil = require('../utils/shopify.util');
const encryption = require('../utils/encryption');
const axios = require('axios');
const { formatInTimeZone } = require('date-fns-tz');

// 🟢 SET YOUR TEST MERCHANT ID HERE
const MERCHANT_ID = '41339d5a-20c1-70ad-918d-d70dbd346e14'; 

async function verifyEverything() {
    console.log("\n🚀 Starting 1000% Real-Data Verification Test...");
    console.log("====================================================");

    try {
        // 1. FETCH ALL INTEGRATIONS FROM DYNAMODB
        const integrationsRes = await newDynamoDB.send(new QueryCommand({
            TableName: newTableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `MERCHANT#${MERCHANT_ID}`, ':sk': 'INTEGRATION#' }
        }));

        const integrations = {};
        integrationsRes.Items.forEach(item => {
            integrations[item.platform.toUpperCase()] = item;
        });

        // 2. FETCH SAVED VARIANT COSTS (COGS)
        const variantsRes = await newDynamoDB.send(new QueryCommand({
            TableName: newTableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `MERCHANT#${MERCHANT_ID}`, ':sk': 'VARIANT#' }
        }));
        const costMap = {};
        variantsRes.Items.forEach(v => costMap[v.variantId] = v.costPrice || 0);

        // 3. DEFINE THE TEST DATE (Yesterday in IST)
        const targetDateIST = formatInTimeZone(new Date(Date.now() - 86400000), 'Asia/Kolkata', 'yyyy-MM-dd');
        console.log(`📅 Testing for IST Date: ${targetDateIST}`);

        // --- STEP A: REAL SHOPIFY DATA ---
        console.log("📡 Calling Shopify GraphQL...");
        const shopify = integrations.SHOPIFY;
        const shopifyOrders = await shopifyUtil.fetchShopifyOrders(shopify.shopifyStore, shopify.accessToken, targetDateIST);
        
        let revenueGenerated = 0;
        let shopifyOrderIds = [];

        shopifyOrders.edges.forEach(({ node: order }) => {
            revenueGenerated += Number(order.totalPriceSet.shopMoney.amount);
            shopifyOrderIds.push(order.id.split('/').pop());
        });

        // --- STEP B: REAL META ADS DATA ---
        console.log("📡 Calling Meta Graph API...");
        const meta = integrations.META;
        const metaToken = encryption.decrypt(meta.accessToken);
        const metaRes = await axios.get(`https://graph.facebook.com/v20.0/${meta.adAccountId}/insights`, {
            params: {
                access_token: metaToken,
                time_range: JSON.stringify({ 'since': targetDateIST, 'until': targetDateIST }),
                fields: 'spend',
                time_increment: 1
            }
        });
        const adsSpend = Number(metaRes.data.data[0]?.spend || 0);

        // --- STEP C: REAL SHIPROCKET DATA ---
        console.log("📡 Calling Shiprocket REST API...");
        const sr = integrations.SHIPROCKET;
        const srToken = encryption.decrypt(sr.token);
        const srRes = await axios.get('https://apiv2.shiprocket.in/v1/external/shipments', {
            headers: { 'Authorization': `Bearer ${srToken}` },
            params: { from: targetDateIST, to: targetDateIST }
        });

        let revenueEarned = 0;
        let shippingSpend = 0;
        let totalCogs = 0;

        srRes.data.data.forEach(shipment => {
            const shipCost = Number(shipment.freight_charges || 0);
            const returnCost = Number(shipment.return_freight_charges || 0);
            
            // Link to Shopify data to find the Order Value and Cogs
            const orderIdStr = shipment.order_id.toString();
            const originalOrder = shopifyOrders.edges.find(e => e.node.id.includes(orderIdStr))?.node;

            if (shipment.status.toLowerCase() === 'delivered') {
                revenueEarned += Number(originalOrder?.totalPriceSet.shopMoney.amount || 0);
                shippingSpend += shipCost;
                
                // Calculate real COGS from the items in that delivered order
                originalOrder?.lineItems.edges.forEach(({ node: item }) => {
                    const vId = item.variant?.id?.split('/').pop();
                    totalCogs += (costMap[vId] || 0) * item.quantity;
                });
            } else if (shipment.status.toLowerCase() === 'rto') {
                shippingSpend += (shipCost + returnCost);
            }
        });

        // --- STEP D: APPLY FINAL MASTER FORMULA ---
        const gatewayFees = revenueEarned * 0.025; // 2.5% on delivered prepaid revenue
        const netProfit = revenueEarned - (totalCogs + adsSpend + shippingSpend + gatewayFees);

        console.log("\n💰 ==========================================");
        console.log("💰   OFFICIAL PROFITFIRST VERIFICATION    ");
        console.log("==============================================");
        console.log(`Orders Found:       ${shopifyOrders.edges.length}`);
        console.log(`Revenue Generated:  ₹${revenueGenerated.toFixed(2)} (Shopify)`);
        console.log(`Revenue Earned:     ₹${revenueEarned.toFixed(2)} (Delivered)`);
        console.log(`----------------------------------------------`);
        console.log(`[-] Total COGS:     ₹${totalCogs.toFixed(2)}`);
        console.log(`[-] Meta Ads Spend: ₹${adsSpend.toFixed(2)}`);
        console.log(`[-] Shipping Spend: ₹${shippingSpend.toFixed(2)} (Incl. RTO)`);
        console.log(`[-] Gateway Fees:   ₹${gatewayFees.toFixed(2)}`);
        console.log(`----------------------------------------------`);
        console.log(`REAL NET PROFIT:    ₹${netProfit.toFixed(2)}`);
        console.log(`REAL PROFIT MARGIN: ${revenueEarned > 0 ? ((netProfit / revenueEarned) * 100).toFixed(2) : 0}%`);
        console.log("==============================================\n");

    } catch (error) {
        console.error("\n❌ VERIFICATION FAILED!");
        console.error("Error Detail:", error.response?.data || error.message);
    }
}

verifyEverything();