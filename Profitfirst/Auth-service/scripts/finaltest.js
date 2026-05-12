// =====================================================================
// DIAGNOSTIC SCRIPT - AUTO LOAD TOKENS FROM DB
// Safe Read-Only Script
// =====================================================================

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const axios = require("axios");

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryption = require("../utils/encryption");

// ⚠️ CHANGE THIS ONLY
const MERCHANT_ID = "f173edda-a031-705d-cbb3-e868f0a6782a";

// =====================================================================
// LOAD TOKENS FROM DB
// =====================================================================

async function loadCredentials() {
  console.log("\n🔐 Loading integrations from DynamoDB...");

  const intRes = await newDynamoDB.send(
    new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${MERCHANT_ID}`,
        ":sk": "INTEGRATION#",
      },
    }),
  );

  if (!intRes.Items || intRes.Items.length === 0) {
    throw new Error("No integrations found");
  }

  const integrations = {};

  intRes.Items.forEach((i) => {
    integrations[i.platform.toUpperCase()] = i;
  });

  if (!integrations.SHOPIFY) {
    throw new Error("Shopify integration missing");
  }

  if (!integrations.SHIPROCKET) {
    throw new Error("Shiprocket integration missing");
  }

  const CONFIG = {
    SHOPIFY_SHOP: integrations.SHOPIFY.shopifyStore,

    SHOPIFY_ACCESS_TOKEN: encryption.decrypt(integrations.SHOPIFY.accessToken),

    SHIPROCKET_TOKEN: encryption.decrypt(integrations.SHIPROCKET.token),
  };

  console.log("✅ Credentials loaded");

  return CONFIG;
}

// =====================================================================
// SECTION 1: SHOPIFY ORDERS DIAGNOSTIC
// =====================================================================

async function checkShopifyOrders(CONFIG) {
  console.log("\n" + "=".repeat(70));
  console.log("🛍️  SECTION 1: SHOPIFY ORDERS - Last 30 Days");
  console.log("=".repeat(70));

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);

  const queryStr = `created_at:>=${sinceDate.toISOString().split("T")[0]}`;

  const query = `
  query {
    orders(first: 30, sortKey: CREATED_AT, reverse: true, query: "${queryStr}") {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          paymentGatewayNames
          totalPriceSet         { shopMoney { amount } }
          totalReceivedSet      { shopMoney { amount } }
          totalOutstandingSet   { shopMoney { amount } }
          totalRefundedSet      { shopMoney { amount } }
        }
      }
    }
  }
`;

  const url = `https://${CONFIG.SHOPIFY_SHOP}/admin/api/2024-04/graphql.json`;

  const res = await axios.post(
    url,
    { query },
    {
      headers: {
        "X-Shopify-Access-Token": CONFIG.SHOPIFY_ACCESS_TOKEN,

        "Content-Type": "application/json",
      },
    },
  );

  if (res.data.errors) {
    console.error("❌ Shopify Error:", res.data.errors);
    return [];
  }

  const orders = res.data.data.orders.edges.map((e) => e.node);

  console.log(`\n✅ Total orders fetched: ${orders.length}\n`);

  const statusCount = {};

  orders.forEach((o) => {
    statusCount[o.displayFinancialStatus] =
      (statusCount[o.displayFinancialStatus] || 0) + 1;
  });

  console.log("📊 displayFinancialStatus DISTRIBUTION:");
  console.table(statusCount);

  console.log("\n📋 SAMPLE ORDERS:\n");

  orders.slice(0, 10).forEach((o, i) => {
    const total = parseFloat(o.totalPriceSet?.shopMoney?.amount || 0);

    const paid = parseFloat(o.totalPaidSet?.shopMoney?.amount || 0);

    const outstanding = parseFloat(
      o.totalOutstandingSet?.shopMoney?.amount || 0,
    );

    const refunded = parseFloat(o.totalRefundedSet?.shopMoney?.amount || 0);

    console.log(`--- Order #${i + 1} ---`);
    console.log(`  Name              : ${o.name}`);
    console.log(`  Created At        : ${o.createdAt}`);
    console.log(`  Financial Status  : ${o.displayFinancialStatus}`);
    console.log(`  Fulfillment Status: ${o.displayFulfillmentStatus}`);
    console.log(`  Gateways          : ${o.paymentGatewayNames?.join(", ")}`);
    console.log(`  Total Price       : ₹${total}`);
    console.log(`  Total Paid        : ₹${paid}`);
    console.log(`  Outstanding       : ₹${outstanding}`);
    console.log(`  Refunded          : ₹${refunded}`);
    console.log(`  Calculated COD    : ₹${(total - paid).toFixed(2)}`);
    console.log(`  Inferred Type     : ${inferPaymentType(o)}`);
    console.log("");
  });

  return orders;
}

// =====================================================================
// PAYMENT TYPE DETECTION
// =====================================================================

function inferPaymentType(order) {
  const total = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);

  const paid = parseFloat(order.totalPaidSet?.shopMoney?.amount || 0);

  const status = order.displayFinancialStatus;

  if (status === "PAID" && paid >= total) return "PREPAID";

  if (status === "PENDING" && paid === 0) return "COD";

  if (status === "PARTIALLY_PAID" && paid > 0 && paid < total) {
    return "PARTIAL_COD";
  }

  if (status === "REFUNDED") return "REFUNDED";

  return `UNKNOWN (${status})`;
}

// =====================================================================
// SECTION 2: SHIPROCKET DIAGNOSTIC
// =====================================================================

async function checkShiprocket(CONFIG) {
  console.log("\n" + "=".repeat(70));
  console.log("📦 SECTION 2: SHIPROCKET SHIPMENTS");
  console.log("=".repeat(70));

  const fromDate = new Date();

  fromDate.setDate(fromDate.getDate() - 30);

  const from = fromDate.toISOString().split("T")[0];

  const to = new Date().toISOString().split("T")[0];

  const ordersRes = await axios.get(
    `https://apiv2.shiprocket.in/v1/external/orders?from=${from}&to=${to}&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${CONFIG.SHIPROCKET_TOKEN}`,
      },
    },
  );

  const shipments = ordersRes.data.data || [];

  console.log(`\n✅ Total shipments fetched: ${shipments.length}\n`);

  const statusCount = {};

  shipments.forEach((s) => {
    statusCount[s.status] = (statusCount[s.status] || 0) + 1;
  });

  console.log("📊 Shiprocket STATUS DISTRIBUTION:");
  console.table(statusCount);

  if (shipments.length > 0) {
    console.log("\n📋 FULL RAW SAMPLE:");
    console.log(JSON.stringify(shipments[0], null, 2));
  }

  return shipments;
}

// =====================================================================
// MATCH CHECK
// =====================================================================

function checkOrderMatching(shopifyOrders, shipments) {
  console.log("\n" + "=".repeat(70));
  console.log("🔗 SECTION 3: ORDER MATCHING");
  console.log("=".repeat(70));

  const normalize = (str) =>
    String(str || "")
      .replace(/^#/, "")
      .trim();

  const shopifyNames = shopifyOrders.map((o) => normalize(o.name));

  const shiprocketIds = shipments.map((s) => normalize(s.channel_order_id));

  const matched = shiprocketIds.filter((id) => shopifyNames.includes(id));

  const unmatched = shiprocketIds.filter((id) => !shopifyNames.includes(id));

  console.log(`\n✅ Matched: ${matched.length}`);
  console.log(`❌ Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log("Unmatched samples:", unmatched.slice(0, 5));
  }
}

// =====================================================================
// MAIN
// =====================================================================

(async () => {
  try {
    const CONFIG = await loadCredentials();

    const shopifyOrders = await checkShopifyOrders(CONFIG);

    const shipments = await checkShiprocket(CONFIG);

    checkOrderMatching(shopifyOrders, shipments);

    console.log("\n" + "=".repeat(70));
    console.log("✅ DIAGNOSTIC COMPLETE");
    console.log("=".repeat(70));
  } catch (err) {
    console.error("\n❌ ERROR:", err.response?.data || err.message);
  }
})();
