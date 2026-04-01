const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const shopifyUtil = require("../utils/shopify.util");
const encryption = require("../utils/encryption.js");
const axios = require("axios");

const MERCHANT_ID = "41037dca-f0a1-7005-fcfe-6841ff1fc07b";
const targetDateIST = "2026-02-21";

async function verifyEverything() {
  console.log(`\n🚀 Testing 1000% Real-Data for: ${targetDateIST}`);
  console.log("====================================================");

  try {
    // 1. Get Integration Tokens
    const integrationsRes = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": "INTEGRATION#" },
    }));
    const integrations = {};
    integrationsRes.Items.forEach((item) => { integrations[item.platform.toUpperCase()] = item; });

    // 2. Fetch costs from DB (to check COGS)
    const variantsRes = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": "VARIANT#" },
    }));
    const costMap = {};
    variantsRes.Items.forEach((v) => (costMap[v.variantId] = v.costPrice || 0));

    // --- STEP A: REVENUE GENERATED (Shopify) ---
    console.log("📡 Shopify: Fetching orders placed on this day...");
    const shopify = integrations.SHOPIFY;
    const shopifyOrders = await shopifyUtil.fetchShopifyOrders(shopify.shopifyStore, shopify.accessToken, targetDateIST);
    
    let revenueGenerated = 0;
    shopifyOrders.edges.forEach(({ node: order }) => {
      revenueGenerated += Number(order.totalPriceSet.shopMoney.amount);
    });
    console.log(`✅ Shopify found ${shopifyOrders.edges.length} orders totaling ₹${revenueGenerated}`);

    // --- STEP B: ADS SPEND (Meta) ---
    console.log("📡 Meta: Fetching marketing spend...");
    const meta = integrations.META;
    const metaToken = encryption.decrypt(meta.accessToken);
    const metaRes = await axios.get(`https://graph.facebook.com/v20.0/${meta.adAccountId}/insights`, {
      params: {
        access_token: metaToken,
        time_range: JSON.stringify({ since: targetDateIST, until: targetDateIST }),
        fields: "spend",
        time_increment: 1,
      },
    });
    const adsSpend = Number(metaRes.data.data[0]?.spend || 0);
    console.log(`✅ Meta Spend: ₹${adsSpend}`);

    // --- STEP C: REVENUE EARNED & SHIPPING (Shiprocket) ---
    console.log("📡 Shiprocket: Fetching deliveries updated on this day...");
    const sr = integrations.SHIPROCKET;
    const srToken = encryption.decrypt(sr.token);
    const srRes = await axios.get("https://apiv2.shiprocket.in/v1/external/shipments", {
      headers: { Authorization: `Bearer ${srToken}` },
      params: { from: targetDateIST, to: targetDateIST },
    });

    let revenueEarned = 0;
    let shippingSpend = 0;
    let totalCogs = 0;
    let deliveredCount = 0;

    const shipments = srRes.data.data || [];
    console.log(`📦 Shiprocket returned ${shipments.length} shipment updates.`);

    for (const shipment of shipments) {
      const shipCost = Number(shipment.freight_charges || 0);
      const returnCost = Number(shipment.return_freight_charges || 0);
      
      // 🟢 THE FIX: If delivered, we need to find the order value from DynamoDB
      if (shipment.status.toLowerCase() === "delivered") {
        deliveredCount++;
        shippingSpend += shipCost;

        // Fetch the full order from your database using the ID provided by Shiprocket
        const orderRes = await newDynamoDB.send(new GetCommand({
          TableName: newTableName,
          Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: `ORDER#${shipment.order_id}` }
        }));

        if (orderRes.Item) {
          revenueEarned += Number(orderRes.Item.totalPrice || 0);
          totalCogs += Number(orderRes.Item.totalCogs || 0);
        } else {
            console.warn(`⚠️  Shipment delivered but ORDER#${shipment.order_id} not found in DB yet. Run Shopify sync worker first!`);
        }
      } else if (shipment.status.toLowerCase() === "rto") {
        shippingSpend += shipCost + returnCost;
      }
    }

    // --- STEP D: FINAL CALCULATION ---
    const gatewayFees = revenueEarned * 0.025; 
    const netProfit = revenueEarned - (totalCogs + adsSpend + shippingSpend + gatewayFees);

    console.log("\n💰 ==========================================");
    console.log(`Revenue Generated:  ₹${revenueGenerated.toFixed(2)} (Shopify)`);
    console.log(`Revenue Earned:     ₹${revenueEarned.toFixed(2)} (Delivered Today)`);
    console.log(`Delivered Count:    ${deliveredCount}`);
    console.log(`----------------------------------------------`);
    console.log(`[-] Total COGS:     ₹${totalCogs.toFixed(2)}`);
    console.log(`[-] Meta Ads Spend: ₹${adsSpend.toFixed(2)}`);
    console.log(`[-] Shipping Spend: ₹${shippingSpend.toFixed(2)}`);
    console.log(`[-] Gateway Fees:   ₹${gatewayFees.toFixed(2)}`);
    console.log(`----------------------------------------------`);
    console.log(`REAL NET PROFIT:    ₹${netProfit.toFixed(2)}`);
    console.log("==============================================\n");

  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("Error:", error.message);
  }
}

verifyEverything();