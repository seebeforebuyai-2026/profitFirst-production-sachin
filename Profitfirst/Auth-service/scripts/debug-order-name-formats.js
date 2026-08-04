/**
 * DEBUG: Understand exact order name formats for both stores
 * so we can write the correct normalization without guessing
 */
require("dotenv").config();
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");

const MERCHANT_ID = "898a557c-c0d1-708a-5249-cc713438c565";

async function queryAll(prefix) {
  const all = [];
  let lastKey;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": prefix },
      ExclusiveStartKey: lastKey,
    }));
    all.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

async function main() {
  const [orders, shipments] = await Promise.all([
    queryAll("ORDER#"),
    queryAll("SHIPMENT#"),
  ]);

  console.log(`Orders: ${orders.length} | Shipments: ${shipments.length}`);

  // ── 1. Show all DISTINCT order name patterns from ORDER# records ─────
  const orderNameSamples = {};
  for (const o of orders) {
    const name = o.orderName || "";
    // Classify by pattern
    let pattern;
    if (/^#[A-Z]+\d+$/.test(name))          pattern = "PREFIX+NUM (e.g. #ATL7584)";
    else if (/^#\d+$/.test(name))            pattern = "HASH+NUM only (e.g. #7584)";
    else if (/^#[A-Z]+\d+-\d+$/.test(name)) pattern = "PREFIX+NUM+DASH+NUM (e.g. #ATL6481-85915)";
    else if (/^\d+$/.test(name))             pattern = "pure number (e.g. 7584)";
    else                                      pattern = `OTHER: ${name.slice(0,20)}`;

    if (!orderNameSamples[pattern]) {
      orderNameSamples[pattern] = { count: 0, examples: [] };
    }
    orderNameSamples[pattern].count++;
    if (orderNameSamples[pattern].examples.length < 3) {
      orderNameSamples[pattern].examples.push(name);
    }
  }

  console.log("\n=== ORDER# name patterns ===");
  for (const [pattern, info] of Object.entries(orderNameSamples)) {
    console.log(`  ${pattern}: ${info.count} orders`);
    console.log(`    Examples: ${info.examples.join(" | ")}`);
  }

  // ── 2. Show all DISTINCT shopifyOrderName patterns from SHIPMENT# ────
  const shipNameSamples = {};
  for (const s of shipments) {
    const name = s.shopifyOrderName || "";
    let pattern;
    if (/^#[A-Z]+\d+-\d+$/.test(name))      pattern = "PREFIX+NUM+DASH+NUM (e.g. #ATL6481-85915)";
    else if (/^#[A-Z]+\d+$/.test(name))      pattern = "PREFIX+NUM (e.g. #ATL7584)";
    else if (/^#\d+$/.test(name))            pattern = "HASH+NUM only (e.g. #7584)";
    else if (/^[A-Z0-9#]+#[A-Z0-9]+$/.test(name)) pattern = "SPECIAL (e.g. EXC29#ATL6368RPR)";
    else if (/^\d+$/.test(name))             pattern = "pure number";
    else                                      pattern = `OTHER: ${name.slice(0,30)}`;

    if (!shipNameSamples[pattern]) {
      shipNameSamples[pattern] = { count: 0, examples: [] };
    }
    shipNameSamples[pattern].count++;
    if (shipNameSamples[pattern].examples.length < 3) {
      shipNameSamples[pattern].examples.push(name);
    }
  }

  console.log("\n=== SHIPMENT# shopifyOrderName patterns ===");
  for (const [pattern, info] of Object.entries(shipNameSamples)) {
    console.log(`  ${pattern}: ${info.count} shipments`);
    console.log(`    Examples: ${info.examples.join(" | ")}`);
  }

  // ── 3. For the compound format "#ATL6481-85915" — what is the ORDER name? ─
  // Shiprocket stores: #ATL6481-85915
  // Order might be stored as: #ATL6481 OR #5915 OR #85915
  // Let's check a sample to confirm
  console.log("\n=== Resolving compound name format ===");
  const compoundSamples = shipments
    .filter(s => /^#[A-Z]+\d+-\d+$/.test(s.shopifyOrderName || ""))
    .slice(0, 10);

  for (const s of compoundSamples) {
    const full    = s.shopifyOrderName;            // e.g. "#ATL6481-85915"
    const parts   = full.replace(/^#/, "").split("-"); // ["ATL6481", "85915"]
    const prefix  = "#" + parts[0];               // "#ATL6481"
    const suffix  = "#" + parts[1];               // "#85915"

    // Look for each variant in orders
    const byFull   = orders.find(o => o.orderName === full);
    const byPrefix = orders.find(o => o.orderName === prefix);
    const bySuffix = orders.find(o => o.orderName === suffix || o.orderName === parts[1]);

    console.log(`\nShipment: ${full}`);
    console.log(`  By full name "${full}":   ${byFull   ? "✅ FOUND (paymentType=" + byFull.paymentType   + ", cod=" + byFull.codAmount   + ")" : "❌ not found"}`);
    console.log(`  By prefix "${prefix}":    ${byPrefix ? "✅ FOUND (paymentType=" + byPrefix.paymentType + ", cod=" + byPrefix.codAmount + ")" : "❌ not found"}`);
    console.log(`  By suffix "${suffix}":    ${bySuffix ? "✅ FOUND (paymentType=" + bySuffix.paymentType + ", cod=" + bySuffix.codAmount + ")" : "❌ not found"}`);
  }

  // ── 4. Check the normalizedOrderName field on shipments ──────────────
  // The Shopify sync worker also stores normalizedOrderName on orders
  // Let's see if that field exists and what it looks like
  console.log("\n=== normalizedOrderName on ORDER# records (sample) ===");
  orders.slice(0, 5).forEach(o => {
    console.log(`  orderName: ${o.orderName} | normalizedOrderName: ${o.normalizedOrderName}`);
  });

  console.log("\n=== normalizedOrderName on SHIPMENT# records (sample compound) ===");
  compoundSamples.slice(0, 5).forEach(s => {
    console.log(`  shopifyOrderName: ${s.shopifyOrderName} | normalizedOrderName: ${s.normalizedOrderName}`);
  });

  // ── 5. Check if normalizedOrderName GSI lookup would work ────────────
  // The sync worker uses GSI "normalizedOrderNameGSI" with normalizedOrderName
  // Let's see if orders have normalizedOrderName that matches shipment's normalizedOrderName
  console.log("\n=== Does shipment.normalizedOrderName match any order.normalizedOrderName? ===");
  let gsiMatchCount = 0;
  let gsiNoMatchCount = 0;
  const orderByNormalized = new Map(orders.map(o => [o.normalizedOrderName, o]));
  for (const s of compoundSamples) {
    const match = orderByNormalized.get(s.normalizedOrderName);
    if (match) {
      gsiMatchCount++;
      console.log(`  ✅ ${s.shopifyOrderName} → order ${match.orderName} (cod=${match.codAmount})`);
    } else {
      gsiNoMatchCount++;
      console.log(`  ❌ ${s.shopifyOrderName} (normalizedOrderName="${s.normalizedOrderName}") → no match`);
    }
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
