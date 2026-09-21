/**
 * Test Script: Shopify Delivery Status Fetch
 * Store: tekasfootcare.myshopify.com
 *
 * Run: node scripts/test-delivery-status.js
 */

require("dotenv").config();
const axios = require("axios");

// tekasfootcare ka token fetch karo profitfirst.co.in/token se
const SHOP = "tekasfootcare.myshopify.com";
const TOKEN_URL = "https://www.profitfirst.co.in/token";
const PASSWORD = "Sachin369";
const API_VERSION = "2025-04";

async function getAccessToken() {
  const res = await axios.get(TOKEN_URL, {
    params: { shop: SHOP, password: PASSWORD },
  });
  return res.data.accessToken;
}

async function fetchOrdersWithDeliveryStatus(accessToken) {
  const url = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

  const query = `{
    orders(first: 40, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          totalPriceSet { shopMoney { amount } }
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus

          tags

          note

          customAttributes {
            key
            value
          }

          fulfillments {
            status
            displayStatus
            trackingInfo {
              company
              number
              url
            }
          }

          shippingLines(first: 5) {
            edges {
              node {
                title
                carrierIdentifier
                requestedFulfillmentService {
                  handle
                }
              }
            }
          }
        }
      }
    }
  }`;

  const response = await axios.post(
    url,
    { query },
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.data.errors) {
    console.error("GraphQL Errors:", response.data.errors);
    return;
  }

  const orders = response.data.data.orders.edges;

  console.log(`\n✅ Fetched ${orders.length} orders from ${SHOP}\n`);
  console.log("=".repeat(80));
  const orders2 = response.data.data.orders.edges.map((e) => e.node);
  const totalOrders = orders2.length;
  const totalRevenue = orders2.reduce(
    (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount || 0),
    0,
  );

  orders.forEach(({ node: order }) => {
    console.log(`\n📦 Order: ${order.name}`);
    console.log(`   Created: ${order.createdAt}`);
    console.log(`   Financial Status: ${order.displayFinancialStatus}`);
    console.log(`   Fulfillment Status: ${order.displayFulfillmentStatus}`);
    console.log(
      `   Tags: ${order.tags.length > 0 ? order.tags.join(", ") : "NONE"}`,
    );
    console.log(`   Note: ${order.note || "NONE"}`);


    if (order.customAttributes.length > 0) {
      console.log(`   Custom Attributes:`);
      order.customAttributes.forEach((attr) => {
        console.log(`     ${attr.key}: ${attr.value}`);
      });
    } else {
      console.log(`   Custom Attributes: NONE`);
    }

    if (order.fulfillments.length > 0) {
      console.log(`   Fulfillments:`);
      order.fulfillments.forEach((f) => {
        console.log(`     status (raw): ${f.status}`);
        console.log(`     displayStatus: ${f.displayStatus}`);
        if (f.trackingInfo.length > 0) {
          f.trackingInfo.forEach((t) => {
            console.log(`     Tracking: ${t.company} | ${t.number}`);
          });
        }
      });
    } else {
      console.log(`   Fulfillments: NONE`);
    }

    console.log("-".repeat(60));
  });
      console.log(totalRevenue);
}

async function main() {
  try {
    console.log(`🔑 Fetching access token for ${SHOP}...`);
    const accessToken = await getAccessToken();
    console.log(`✅ Token received`);

    await fetchOrdersWithDeliveryStatus(accessToken);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
}

main();
