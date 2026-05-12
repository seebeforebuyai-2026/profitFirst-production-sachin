// =====================================================================
// ULTIMATE DIAGNOSTIC - Compares Real API Data vs DynamoDB Stored Data
// =====================================================================

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const axios = require("axios");
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryption = require("../utils/encryption");
const { formatInTimeZone } = require("date-fns-tz");

// ⚠️ CONFIGURE
const MERCHANT_ID = "f173edda-a031-705d-cbb3-e868f0a6782a";
const DAYS = 30; // Change to 7 or 3 as needed

// =====================================================================
// HELPERS
// =====================================================================

const normalize = (name) => {
  if (!name) return "";
  return name.toString().replace(/^#/, "").replace(/-[A-Z]$/i, "").trim().toLowerCase();
};

const parseSRDate = (dateStr) => {
  if (!dateStr || dateStr === "0000-00-00 00:00:00") return null;
  const clean = dateStr.replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  if (isNaN(d.getTime())) return null;
  return formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd");
};

const getNormalizedStatus = (status = "") => {
  const s = status.toLowerCase();
  if (s.includes("rto")) return "RTO";
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("cancel")) return "CANCELLED";
  return "IN_TRANSIT";
};

// =====================================================================
// LOAD CREDENTIALS
// =====================================================================

async function loadCredentials() {
  console.log("🔐 Loading credentials from DB...");
  const res = await newDynamoDB.send(new QueryCommand({
    TableName: newTableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `MERCHANT#${MERCHANT_ID}`,
      ":sk": "INTEGRATION#"
    }
  }));

  const integrations = {};
  res.Items.forEach(i => integrations[i.platform.toUpperCase()] = i);

  return {
    SHOPIFY_SHOP: integrations.SHOPIFY.shopifyStore,
    SHOPIFY_TOKEN: encryption.decrypt(integrations.SHOPIFY.accessToken),
    SHIPROCKET_TOKEN: encryption.decrypt(integrations.SHIPROCKET.token),
    META_TOKEN: integrations.META ? encryption.decrypt(integrations.META.accessToken) : null,
    META_AD_ACCOUNT: integrations.META?.selectedAdAccountId
  };
}

// =====================================================================
// FETCH REAL DATA FROM SHOPIFY
// =====================================================================

async function fetchRealShopifyOrders(CONFIG) {
  console.log(`\n📡 Fetching REAL Shopify data (last ${DAYS} days)...`);
  
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - DAYS);
  const queryStr = `created_at:>=${sinceDate.toISOString().split("T")[0]} AND test:false`;

  let allOrders = [];
  let cursor = null;

  while (true) {
    const query = `
      query getOrders($cursor: String) {
        orders(first: 250, after: $cursor, sortKey: CREATED_AT, query: "${queryStr}") {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id name createdAt cancelledAt
              displayFinancialStatus
              paymentGatewayNames
              totalPriceSet { shopMoney { amount } }
              totalOutstandingSet { shopMoney { amount } }
              totalDiscountsSet { shopMoney { amount } }
              totalRefundedSet { shopMoney { amount } }
              lineItems(first: 20) {
                edges { node { title quantity } }
              }
            }
          }
        }
      }
    `;

    const res = await axios.post(
      `https://${CONFIG.SHOPIFY_SHOP}/admin/api/2024-04/graphql.json`,
      { query, variables: { cursor } },
      { headers: { "X-Shopify-Access-Token": CONFIG.SHOPIFY_TOKEN } }
    );

    if (res.data.errors) throw new Error(res.data.errors[0].message);

    const edges = res.data.data.orders.edges;
    allOrders.push(...edges.map(e => e.node));

    if (!res.data.data.orders.pageInfo.hasNextPage) break;
    cursor = res.data.data.orders.pageInfo.endCursor;
    await new Promise(r => setTimeout(r, 500));
  }

  return allOrders;
}

// =====================================================================
// FETCH REAL DATA FROM SHIPROCKET
// =====================================================================

async function fetchRealShiprocket(CONFIG) {
  console.log(`\n📡 Fetching REAL Shiprocket data (last ${DAYS} days)...`);
  
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - DAYS);
  const from = fromDate.toISOString().split("T")[0];
  const to = new Date().toISOString().split("T")[0];

  let allShipments = [];
  let page = 1;

  while (true) {
    const res = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/shipments",
      {
        headers: { Authorization: `Bearer ${CONFIG.SHIPROCKET_TOKEN}` },
        params: { from, to, page, per_page: 50 }
      }
    );

    const shipments = res.data.data || [];
    if (shipments.length === 0) break;
    
    allShipments.push(...shipments);
    
    const nextLink = res.data.meta?.pagination?.links?.next;
    if (!nextLink) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return allShipments;
}

// =====================================================================
// FETCH STORED DATA FROM DYNAMODB
// =====================================================================

async function fetchStoredOrders() {
  console.log("\n💾 Fetching STORED Orders from DynamoDB...");
  let items = [];
  let lastKey;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": "ORDER#" },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function fetchStoredShipments() {
  console.log("💾 Fetching STORED Shipments from DynamoDB...");
  let items = [];
  let lastKey;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": "SHIPMENT#" },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// =====================================================================
// ANALYSIS: SHOPIFY ORDERS
// =====================================================================

function analyzeShopifyOrders(realOrders, storedOrders) {
  console.log("\n" + "=".repeat(70));
  console.log("🛍️  SHOPIFY ORDERS ANALYSIS");
  console.log("=".repeat(70));

  console.log(`\n📊 COUNT CHECK:`);
  console.log(`   Real API:     ${realOrders.length} orders`);
  console.log(`   Stored in DB: ${storedOrders.length} orders`);
  console.log(`   Difference:   ${Math.abs(realOrders.length - storedOrders.length)} ${realOrders.length !== storedOrders.length ? "⚠️" : "✅"}`);

  // Payment type distribution
  console.log(`\n💳 PAYMENT TYPE DISTRIBUTION:`);
  
  const realTypes = {};
  realOrders.forEach(o => {
    const status = o.displayFinancialStatus;
    const outstanding = Number(o.totalOutstandingSet?.shopMoney?.amount || 0);
    const total = Number(o.totalPriceSet?.shopMoney?.amount || 0);
    
    let type;
    if (status === "PAID") type = "PREPAID";
    else if (status === "PARTIALLY_PAID") type = "PARTIAL_COD";
    else if (status === "PENDING") type = "COD";
    else if (status === "REFUNDED") type = "REFUNDED";
    else type = "OTHER";
    
    realTypes[type] = (realTypes[type] || 0) + 1;
  });

  const storedTypes = {};
  storedOrders.forEach(o => {
    const type = o.paymentType || "UNKNOWN";
    storedTypes[type] = (storedTypes[type] || 0) + 1;
  });

  console.table({
    "Real API": realTypes,
    "Stored DB": storedTypes
  });

  // Revenue check
  console.log(`\n💰 REVENUE CHECK:`);
  
  const realRevenue = realOrders.reduce((sum, o) => {
    if (o.cancelledAt) return sum;
    const total = Number(o.totalPriceSet?.shopMoney?.amount || 0);
    const disc = Number(o.totalDiscountsSet?.shopMoney?.amount || 0);
    const refund = Number(o.totalRefundedSet?.shopMoney?.amount || 0);
    return sum + (total - disc - refund);
  }, 0);

  const storedRevenue = storedOrders.reduce((sum, o) => {
    if (o.isCancelled) return sum;
    return sum + Number(o.netRevenue || 0);
  }, 0);

  console.log(`   Real API Net Revenue:  ₹${realRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  console.log(`   Stored DB Net Revenue: ₹${storedRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  console.log(`   Difference:            ₹${Math.abs(realRevenue - storedRevenue).toFixed(2)} ${Math.abs(realRevenue - storedRevenue) > 10 ? "⚠️ BUG!" : "✅"}`);

  // Find mismatches
  console.log(`\n🔍 FINDING MISMATCHES:`);
  const storedMap = new Map(storedOrders.map(o => [o.orderId, o]));
  
  let mismatchCount = 0;
  realOrders.slice(0, 50).forEach(real => {
    const realId = real.id.split("/").pop();
    const stored = storedMap.get(realId);
    
    if (!stored) {
      console.log(`   ❌ MISSING IN DB: ${real.name} (${realId})`);
      mismatchCount++;
      return;
    }

    const realTotal = Number(real.totalPriceSet?.shopMoney?.amount || 0);
    const storedTotal = Number(stored.totalPrice || 0);
    
    if (Math.abs(realTotal - storedTotal) > 0.5) {
      console.log(`   ⚠️ PRICE MISMATCH: ${real.name} | Real: ₹${realTotal} | Stored: ₹${storedTotal}`);
      mismatchCount++;
    }
  });

  if (mismatchCount === 0) {
    console.log(`   ✅ All sampled orders match perfectly`);
  }
}

// =====================================================================
// ANALYSIS: SHIPROCKET
// =====================================================================

function analyzeShipments(realShipments, storedShipments) {
  console.log("\n" + "=".repeat(70));
  console.log("📦 SHIPROCKET ANALYSIS");
  console.log("=".repeat(70));

  console.log(`\n📊 COUNT CHECK:`);
  console.log(`   Real API:     ${realShipments.length} shipments`);
  console.log(`   Stored in DB: ${storedShipments.length} shipments`);
  console.log(`   Difference:   ${Math.abs(realShipments.length - storedShipments.length)} ${realShipments.length !== storedShipments.length ? "⚠️" : "✅"}`);

  // Status distribution
  console.log(`\n📊 STATUS DISTRIBUTION (Real vs Stored):`);
  
  const realStatus = {};
  realShipments.forEach(s => {
    const norm = getNormalizedStatus(s.status);
    realStatus[norm] = (realStatus[norm] || 0) + 1;
  });

  const storedStatus = {};
  storedShipments.forEach(s => {
    const st = s.deliveryStatus || "UNKNOWN";
    storedStatus[st] = (storedStatus[st] || 0) + 1;
  });

  console.table({ "Real API": realStatus, "Stored DB": storedStatus });

  // Raw status details from Shiprocket
  console.log(`\n📋 RAW SHIPROCKET STATUSES (first 30):`);
  const rawStatuses = {};
  realShipments.forEach(s => {
    rawStatuses[s.status] = (rawStatuses[s.status] || 0) + 1;
  });
  console.table(rawStatuses);

  // Check delivered dates
  console.log(`\n🚚 DELIVERED ORDER CHECK:`);
  const deliveredInReal = realShipments.filter(s => {
    const norm = getNormalizedStatus(s.status);
    return norm === "DELIVERED";
  });

  console.log(`   Real API delivered: ${deliveredInReal.length}`);
  
  if (deliveredInReal.length > 0) {
    console.log(`\n   📋 SAMPLE DELIVERED SHIPMENTS:`);
    deliveredInReal.slice(0, 3).forEach((s, i) => {
      console.log(`   --- Shipment ${i + 1} ---`);
      console.log(`      ID: ${s.id}`);
      console.log(`      Channel Order: ${s.channel_order_id}`);
      console.log(`      Status: ${s.status}`);
      console.log(`      Delivered Date: ${s.delivered_date || s.shipments?.[0]?.delivered_date || "NULL"}`);
      console.log(`      Parsed IST: ${parseSRDate(s.delivered_date || s.shipments?.[0]?.delivered_date)}`);
    });
  }

  // Check IN TRANSIT
  const inTransitInReal = realShipments.filter(s => getNormalizedStatus(s.status) === "IN_TRANSIT");
  console.log(`\n   Real API in-transit: ${inTransitInReal.length}`);

  const inTransitInStored = storedShipments.filter(s => s.deliveryStatus === "IN_TRANSIT");
  console.log(`   Stored DB in-transit: ${inTransitInStored.length}`);

  // Charges check
  console.log(`\n💰 SHIPPING CHARGES CHECK:`);
  let realChargesTotal = 0;
  let realChargesCount = 0;
  realShipments.forEach(s => {
    const charges = s.awb_data?.charges || s.charges || {};
    const freight = Number(charges.freight_charges || 0);
    if (freight > 0) {
      realChargesTotal += freight;
      realChargesCount++;
    }
  });

  let storedChargesTotal = 0;
  storedShipments.forEach(s => {
    storedChargesTotal += Number(s.totalShippingPaid || 0);
  });

  console.log(`   Real API shipping (with charges): ₹${realChargesTotal.toFixed(2)} (${realChargesCount} shipments)`);
  console.log(`   Stored DB shipping total:         ₹${storedChargesTotal.toFixed(2)}`);
  
  if (realChargesCount === 0) {
    console.log(`   ℹ️  No shipments have freight charges yet (AWB not assigned)`);
  }
}

// =====================================================================
// ANALYSIS: ORDER-SHIPMENT LINKING
// =====================================================================

function analyzeLinking(realShipments, storedOrders, storedShipments) {
  console.log("\n" + "=".repeat(70));
  console.log("🔗 ORDER-SHIPMENT LINKING CHECK");
  console.log("=".repeat(70));

  const orderMap = new Map(storedOrders.map(o => [normalize(o.orderName), o]));

  let linkedCount = 0;
  let unlinkedCount = 0;
  let enrichedShipments = 0;
  const unlinkedSamples = [];

  storedShipments.forEach(s => {
    const normName = normalize(s.shopifyOrderName);
    const matchingOrder = orderMap.get(normName);
    
    if (matchingOrder) {
      linkedCount++;
      if (s.paymentType && s.paymentType !== "unknown") enrichedShipments++;
    } else {
      unlinkedCount++;
      if (unlinkedSamples.length < 5) {
        unlinkedSamples.push(s.shopifyOrderName);
      }
    }
  });

  console.log(`\n   ✅ Linked shipments (has matching order):     ${linkedCount}`);
  console.log(`   ❌ Unlinked shipments (no matching order):    ${unlinkedCount}`);
  console.log(`   💎 Enriched shipments (has paymentType):      ${enrichedShipments}`);

  if (unlinkedSamples.length > 0) {
    console.log(`\n   🔍 Unlinked sample order names: ${unlinkedSamples.join(", ")}`);
  }

  if (unlinkedCount > 0) {
    console.log(`\n   ⚠️ BUG: ${unlinkedCount} shipments not linked to orders!`);
    console.log(`      This means deliveredOrders, codRevenue will be WRONG`);
  }
}

// =====================================================================
// FINAL SUMMARY
// =====================================================================

function printFinalDiagnosis(realOrders, storedOrders, realShipments, storedShipments) {
  console.log("\n" + "=".repeat(70));
  console.log("🎯 FINAL DIAGNOSIS");
  console.log("=".repeat(70));

  const issues = [];

  // Check 1: Order count match
  if (realOrders.length !== storedOrders.length) {
    issues.push({
      severity: "HIGH",
      issue: "Order count mismatch",
      detail: `API has ${realOrders.length}, DB has ${storedOrders.length}`,
      fix: "Run Shopify sync worker again"
    });
  }

  // Check 2: Shipment count match
  if (realShipments.length !== storedShipments.length) {
    issues.push({
      severity: "HIGH",
      issue: "Shipment count mismatch",
      detail: `API has ${realShipments.length}, DB has ${storedShipments.length}`,
      fix: "Run Shiprocket sync worker again"
    });
  }

  // Check 3: Delivered orders not being marked
  const realDelivered = realShipments.filter(s => getNormalizedStatus(s.status) === "DELIVERED").length;
  const storedDelivered = storedShipments.filter(s => s.deliveryStatus === "DELIVERED").length;
  
  if (realDelivered !== storedDelivered) {
    issues.push({
      severity: "CRITICAL",
      issue: "Delivered status not syncing",
      detail: `API shows ${realDelivered} delivered, DB shows ${storedDelivered}`,
      fix: "Check shipment-sync worker's delivery status mapping"
    });
  }

  // Check 4: Shipments not enriched with order data
  const unenriched = storedShipments.filter(s => !s.paymentType || s.paymentType === "unknown").length;
  if (unenriched > 0) {
    issues.push({
      severity: "HIGH",
      issue: "Shipments missing order linking",
      detail: `${unenriched} shipments have no paymentType`,
      fix: "normalizedOrderNameGSI lookup failing - check normalizedName logic"
    });
  }

  // Check 5: PARTIALLY_PAID handling
  const realPartial = realOrders.filter(o => o.displayFinancialStatus === "PARTIALLY_PAID").length;
  const storedPartial = storedOrders.filter(o => o.paymentType === "PARTIAL_COD").length;
  
  if (realPartial !== storedPartial) {
    issues.push({
      severity: "HIGH",
      issue: "PARTIAL_COD mismatch",
      detail: `API: ${realPartial}, DB: ${storedPartial}`,
      fix: "Shopify worker's paymentType logic for PARTIALLY_PAID is broken"
    });
  }

  // Print
  if (issues.length === 0) {
    console.log("\n🎉 NO ISSUES FOUND! Your data pipeline is working perfectly.");
  } else {
    console.log(`\n❌ FOUND ${issues.length} ISSUES:\n`);
    issues.forEach((i, idx) => {
      console.log(`${idx + 1}. [${i.severity}] ${i.issue}`);
      console.log(`   Detail: ${i.detail}`);
      console.log(`   Fix: ${i.fix}\n`);
    });
  }

  // What dashboard would show
  console.log("=".repeat(70));
  console.log("📊 WHAT DASHBOARD SHOULD SHOW (Based on Real API Data):");
  console.log("=".repeat(70));
  console.log(`   Total Orders:        ${realOrders.length}`);
  console.log(`   Cancelled:           ${realOrders.filter(o => o.cancelledAt).length}`);
  console.log(`   Prepaid:             ${realOrders.filter(o => o.displayFinancialStatus === "PAID").length}`);
  console.log(`   Partial COD:         ${realOrders.filter(o => o.displayFinancialStatus === "PARTIALLY_PAID").length}`);
  console.log(`   Pure COD:            ${realOrders.filter(o => o.displayFinancialStatus === "PENDING").length}`);
  console.log(`   Total Shipments:     ${realShipments.length}`);
  console.log(`   Delivered:           ${realShipments.filter(s => getNormalizedStatus(s.status) === "DELIVERED").length}`);
  console.log(`   In Transit:          ${realShipments.filter(s => getNormalizedStatus(s.status) === "IN_TRANSIT").length}`);
  console.log(`   RTO:                 ${realShipments.filter(s => getNormalizedStatus(s.status) === "RTO").length}`);
}

// =====================================================================
// MAIN
// =====================================================================

(async () => {
  try {
    console.log("🚀 Starting Ultimate Diagnostic");
    console.log(`📅 Period: Last ${DAYS} days`);
    console.log(`🏢 Merchant: ${MERCHANT_ID}\n`);

    const CONFIG = await loadCredentials();

    const [realOrders, storedOrders, realShipments, storedShipments] = await Promise.all([
      fetchRealShopifyOrders(CONFIG),
      fetchStoredOrders(),
      fetchRealShiprocket(CONFIG),
      fetchStoredShipments()
    ]);

    analyzeShopifyOrders(realOrders, storedOrders);
    analyzeShipments(realShipments, storedShipments);
    analyzeLinking(realShipments, storedOrders, storedShipments);
    printFinalDiagnosis(realOrders, storedOrders, realShipments, storedShipments);

    console.log("\n✅ DIAGNOSTIC COMPLETE\n");
  } catch (err) {
    console.error("\n❌ ERROR:", err.response?.data || err.message);
    console.error(err.stack);
  }
})();