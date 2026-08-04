/**
 * DEBUG: COD Revenue = 0 Issue
 * Merchant: 898a557c-c0d1-708a-5249-cc713438c565
 * Range: 2026-07-05 to 2026-08-03
 */
require("dotenv").config();
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");

const MERCHANT_ID = "898a557c-c0d1-708a-5249-cc713438c565";
const FROM = "2026-07-05";
const TO   = "2026-08-03";

const normalize = (name) =>
  name ? name.toString().replace(/^#/, "").trim().toLowerCase() : "";

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
  console.log("Loading orders and shipments...");
  const [orders, shipments] = await Promise.all([
    queryAll("ORDER#"),
    queryAll("SHIPMENT#"),
  ]);

  // Build orderMap same way summary worker does
  const orderMap = new Map(orders.map(o => [normalize(o.orderName), o]));
  console.log(`Orders: ${orders.length} | Shipments: ${shipments.length}`);
  console.log(`orderMap size: ${orderMap.size}`);

  // ── Check 1: How many shipments have deliveredAtIST in range? ─────────
  const deliveredInRange = shipments.filter(s =>
    s.deliveredAtIST >= FROM &&
    s.deliveredAtIST <= TO &&
    (s.deliveryStatus || "").toUpperCase() === "DELIVERED" &&
    !s.isPhantom
  );
  console.log(`\n=== Shipments with deliveredAtIST in ${FROM}–${TO}: ${deliveredInRange.length} ===`);

  // ── Check 2: Of those, how many have codAmount > 0 on shipment record? ─
  const withCodOnShipment = deliveredInRange.filter(s => Number(s.codAmount || 0) > 0);
  console.log(`Shipments with codAmount > 0 on shipment record: ${withCodOnShipment.length}`);

  // ── Check 3: Of those, how many match an order in orderMap? ──────────
  let matchedCount = 0;
  let notMatchedCount = 0;
  let matchedCodTotal = 0;
  let notMatchedSamples = [];

  for (const s of deliveredInRange) {
    const key = normalize(s.shopifyOrderName);
    const order = orderMap.get(key);
    if (order) {
      matchedCount++;
      matchedCodTotal += Number(order.codAmount || 0);
    } else {
      notMatchedCount++;
      if (notMatchedSamples.length < 10) {
        notMatchedSamples.push({
          shopifyOrderName : s.shopifyOrderName,
          normalizedKey    : key,
          deliveredAtIST   : s.deliveredAtIST,
          srOrderId        : s.srOrderId,
          codAmountOnShip  : s.codAmount,
        });
      }
    }
  }

  console.log(`\nOf ${deliveredInRange.length} delivered shipments in range:`);
  console.log(`  Matched to order in orderMap: ${matchedCount}`);
  console.log(`  NOT matched (ORDER MATCH FAILED): ${notMatchedCount}`);
  console.log(`  Total codRevenue from MATCHED orders: ₹${matchedCodTotal}`);

  if (notMatchedSamples.length > 0) {
    console.log("\n=== NOT MATCHED samples ===");
    console.table(notMatchedSamples);
  }

  // ── Check 4: Why are orders not matching? ─────────────────────────────
  // Check if orderNames in DB use a different format
  if (notMatchedCount > 0) {
    const sampleShip = deliveredInRange.find(s => !orderMap.get(normalize(s.shopifyOrderName)));
    if (sampleShip) {
      console.log("\n=== Checking why order not found ===");
      console.log("Shipment shopifyOrderName:", JSON.stringify(sampleShip.shopifyOrderName));
      console.log("Normalized key we look up:", JSON.stringify(normalize(sampleShip.shopifyOrderName)));

      // Check if any order has a similar name
      const targetNum = normalize(sampleShip.shopifyOrderName);
      const closeMatches = orders.filter(o => {
        const n = normalize(o.orderName);
        return n.includes(targetNum) || targetNum.includes(n);
      }).slice(0, 5);

      if (closeMatches.length > 0) {
        console.log("Close matches in orderMap:");
        closeMatches.forEach(o => console.log("  orderName:", JSON.stringify(o.orderName), "→ normalized:", JSON.stringify(normalize(o.orderName)), "| paymentType:", o.paymentType, "| codAmount:", o.codAmount));
      } else {
        console.log("No close matches found — this Shopify order is completely missing from DB");
        // Check what orders we DO have in that date range
        const ordersInRange = orders.filter(o => o.orderCreatedAtIST >= FROM && o.orderCreatedAtIST <= TO);
        console.log(`\nOrders with orderCreatedAtIST in range: ${ordersInRange.length}`);
        console.log("Sample order names:", ordersInRange.slice(0,5).map(o => normalize(o.orderName)));
      }
    }
  }

  // ── Check 5: What are the paymentTypes of matched delivered orders? ────
  console.log("\n=== PaymentType breakdown of MATCHED delivered orders ===");
  const payTypeDist = {};
  let codAmountZeroCount = 0;
  for (const s of deliveredInRange) {
    const key   = normalize(s.shopifyOrderName);
    const order = orderMap.get(key);
    if (!order) continue;
    const pt = order.paymentType || "NONE";
    payTypeDist[pt] = (payTypeDist[pt] || 0) + 1;
    if (Number(order.codAmount || 0) === 0) codAmountZeroCount++;
  }
  console.table(payTypeDist);
  console.log(`Matched orders with codAmount = 0: ${codAmountZeroCount}`);

  // ── Check 6: What does orderMap key look like for a sample COD order? ──
  const sampleCodOrder = orders.find(o => o.paymentType === "COD" && Number(o.codAmount || 0) > 0);
  if (sampleCodOrder) {
    console.log("\n=== Sample COD order ===");
    console.log("orderName:", JSON.stringify(sampleCodOrder.orderName));
    console.log("normalized:", JSON.stringify(normalize(sampleCodOrder.orderName)));
    console.log("codAmount:", sampleCodOrder.codAmount);
    console.log("paymentType:", sampleCodOrder.paymentType);
  }

  // Check how Shopify order names look vs shipment names
  const sampleShipDelivered = deliveredInRange[0];
  if (sampleShipDelivered) {
    console.log("\n=== Sample delivered shipment ===");
    console.log("shopifyOrderName:", JSON.stringify(sampleShipDelivered.shopifyOrderName));
    console.log("normalized:", JSON.stringify(normalize(sampleShipDelivered.shopifyOrderName)));
    console.log("codAmount on shipment:", sampleShipDelivered.codAmount);
    console.log("deliveredAtIST:", sampleShipDelivered.deliveredAtIST);
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
