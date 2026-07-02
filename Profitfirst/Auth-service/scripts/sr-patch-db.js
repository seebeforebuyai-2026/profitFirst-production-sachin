/**
 * SR-PATCH-DB
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Fetches ALL shipments from Shiprocket /shipments API (all pages, full
 *   history) and patches every matching SHIPMENT# record in DynamoDB with:
 *     - srCreatedAtIST  ← shipment created_at from SR (the correct anchor date)
 *     - rawStatus       ← current status from SR /shipments (most accurate)
 *     - deliveryStatus  ← re-derived from rawStatus
 *     - deliveredAtIST  ← delivered_date from SR
 *     - rtoAtIST        ← rto_delivered_date from SR
 *
 *   After this runs, the diagnostic should show ✅ 0 on total/cancelled/delivered.
 *   The remaining diffs (stale status on 6 records) will also be fixed.
 *
 * USAGE:
 *   node scripts/sr-patch-db.js
 *
 *   It is safe to re-run — it only updates records that exist in DynamoDB.
 *   It does NOT delete or create records.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const axios = require("axios");
const { QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const encryptionService = require("../utils/encryption");
const { formatInTimeZone } = require("date-fns-tz");

// ── CONFIG ────────────────────────────────────────────────────────────────
const MERCHANT_ID = "493aa5ec-a011-701d-818a-ab89873da82d";

// Fetch shipments for this full window (covers all orders in DB, not just 30 days)
// Set wide enough to cover every shipment you have in DynamoDB
const FETCH_FROM = "2026-04-01";   // go back far enough to cover all DB records
const FETCH_TO   = "2026-07-01";   // today (adjust if needed)

const PER_PAGE       = 100;
const RATE_LIMIT_MS  = 1200;  // 1.2s between API calls (50 req/min safe)
const DDB_BATCH_SIZE = 25;
// ─────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Parse any SR date string → yyyy-MM-dd IST ────────────────────────────
function parseIST(dateStr) {
  if (!dateStr || dateStr === "0000-00-00 00:00:00" || dateStr === "0000-00-00") return null;
  const clean = String(dateStr).replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  if (isNaN(d.getTime())) return null;
  return formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd");
}

// ── Canonical status → deliveryStatus (matches getNormalizedStatus in sync worker) ──
function getDeliveryStatus(rawStatus) {
  if (!rawStatus) return "IN_TRANSIT";
  const s = String(rawStatus).toLowerCase().trim();
  if (s.includes("cancel")) return "CANCELLED";
  if (
    s === "rto delivered" || s === "rto_delivered" ||
    s === "rto in intransit" || s === "rto_in_intransit" ||
    s === "rto_ofd" || s === "rto ofd" ||
    s === "reached back at the seller city" ||
    s === "reached back at seller city" ||
    s === "reached_back_at_the_seller_city" ||
    s.includes("return_to_seller")
  ) return "RTO";
  if (s === "delivered" || s === "partial_delivered" || s === "partial delivered")
    return "DELIVERED";
  if (s === "undelivered" || s === "undelivered_1st" || s === "undelivered_2nd" || s === "undelivered_3rd")
    return "NDR";  // store as NDR in deliveryStatus for our internal use
  const up = String(rawStatus).toUpperCase().trim();
  const PICKUP = new Set([
    "NEW","READY_TO_SHIP","PICKUP_SCHEDULED","PICKUP_GENERATED","PICKUP_QUEUED",
    "LABEL_GENERATED","MANIFEST_GENERATED","PICKUP RESCHEDULED","PICKUP_RESCHEDULED",
    "AWB_ASSIGNED",
  ]);
  if (PICKUP.has(up)) return "PICKUP_PENDING";
  return "IN_TRANSIT";
}

// ── Fetch ALL pages of /shipments using next-link pagination ─────────────
async function fetchAllShipments(token, fromDate, toDate) {
  const all  = [];
  let   page = 1;
  while (true) {
    await sleep(RATE_LIMIT_MS);
    let res;
    try {
      res = await axios.get("https://apiv2.shiprocket.in/v1/external/shipments", {
        headers: { Authorization: `Bearer ${token}` },
        params : { from: fromDate, to: toDate, page, per_page: PER_PAGE },
        timeout: 60000,
      });
    } catch (e) {
      const status = e.response?.status;
      if (status === 429) { console.warn("  ⏳ Rate limited — waiting 10s"); await sleep(10000); continue; }
      console.warn(`  ⚠️  Page ${page} error: ${e.message}`); break;
    }
    const items  = res.data?.data || [];
    const next   = res.data?.meta?.pagination?.links?.next;
    all.push(...items);
    console.log(`  Page ${page}: ${items.length} items | hasNext: ${next ? "YES" : "NO "} | total: ${all.length}`);
    if (!next || items.length === 0) break;
    page++;
  }
  return all;
}

// ── Load all SHIPMENT# records from DB ───────────────────────────────────
async function getAllDBShipments() {
  const all = [];
  let   lastKey;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${MERCHANT_ID}`, ":sk": "SHIPMENT#" },
      ExclusiveStartKey: lastKey,
    }));
    all.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

// ── Patch one DB record ───────────────────────────────────────────────────
async function patchRecord(dbItem, srShipment) {
  const rawStatus      = String(srShipment.status || "").trim();
  const deliveryStatus = getDeliveryStatus(rawStatus);
  const srCreatedAtIST = parseIST(srShipment.created_at);
  const deliveredAtIST = parseIST(srShipment.delivered_date);
  const rtoAtIST       = parseIST(srShipment.rto_delivered_date);

  // Only update if something actually changed
  const changed =
    dbItem.srCreatedAtIST !== srCreatedAtIST ||
    dbItem.rawStatus      !== rawStatus      ||
    dbItem.deliveryStatus !== deliveryStatus ||
    dbItem.deliveredAtIST !== deliveredAtIST ||
    dbItem.rtoAtIST       !== rtoAtIST;

  if (!changed) return false;

  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: dbItem.PK, SK: dbItem.SK },
    UpdateExpression:
      "SET srCreatedAtIST = :sc, rawStatus = :rs, deliveryStatus = :ds, " +
      "deliveredAtIST = :da, rtoAtIST = :ra, updatedAt = :ua",
    ExpressionAttributeValues: {
      ":sc": srCreatedAtIST,
      ":rs": rawStatus,
      ":ds": deliveryStatus,
      ":da": deliveredAtIST,
      ":ra": rtoAtIST,
      ":ua": new Date().toISOString(),
    },
  }));
  return true;
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(  "║  SR-PATCH-DB — Patch DynamoDB with fresh SR /shipments data  ║");
  console.log(`║  Merchant : ${MERCHANT_ID}  ║`);
  console.log(`║  Fetching : ${FETCH_FROM} → ${FETCH_TO}                        ║`);
  console.log(  "╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Load token
  console.log("📡 Step 1: Loading Shiprocket token…");
  const intRes = await newDynamoDB.send(new GetCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#SHIPROCKET" },
  }));
  if (!intRes.Item) { console.error("❌ No integration found."); process.exit(1); }
  const token = encryptionService.decrypt(intRes.Item.token);
  console.log("  ✅ Token ready.\n");

  // 2. Fetch all SR shipments
  console.log(`📡 Step 2: Fetching ALL /shipments pages (${FETCH_FROM} → ${FETCH_TO})…`);
  const srShipments = await fetchAllShipments(token, FETCH_FROM, FETCH_TO);
  console.log(`\n  ✅ Fetched ${srShipments.length} shipments from SR API.\n`);

  // 3. Build lookup: srOrderId → shipment record
  const srMap = new Map();
  for (const s of srShipments) {
    if (s.order_id) srMap.set(String(s.order_id), s);
  }
  console.log(`  Unique SR order IDs in map: ${srMap.size}\n`);

  // 4. Load DB records
  console.log("📦 Step 3: Loading DB records…");
  const dbRecords = await getAllDBShipments();
  console.log(`  ✅ ${dbRecords.length} SHIPMENT# records in DB.\n`);

  // 5. Patch matching records
  console.log("🔧 Step 4: Patching DB records with fresh SR data…\n");

  let matched   = 0;  // found in SR map
  let patched   = 0;  // actually updated (had changes)
  let unchanged = 0;  // matched but no changes needed
  let notInSR   = 0;  // DB record has no matching SR shipment

  // Process in batches to avoid overwhelming DynamoDB
  const CONCURRENCY = 10;
  for (let i = 0; i < dbRecords.length; i += CONCURRENCY) {
    const batch = dbRecords.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (dbItem) => {
      const srShipment = srMap.get(dbItem.srOrderId);
      if (!srShipment) { notInSR++; return; }
      matched++;
      const updated = await patchRecord(dbItem, srShipment);
      if (updated) patched++; else unchanged++;
    }));

    if (i % 100 === 0) {
      console.log(`  Progress: ${i}/${dbRecords.length} processed | patched: ${patched} | unchanged: ${unchanged} | notInSR: ${notInSR}`);
    }
  }

  console.log("\n  ─────────────────────────────────────────────────────────");
  console.log(`  Total DB records   : ${dbRecords.length}`);
  console.log(`  Matched in SR      : ${matched}`);
  console.log(`  Patched (updated)  : ${patched}`);
  console.log(`  Unchanged (no diff): ${unchanged}`);
  console.log(`  Not in SR fetch    : ${notInSR}`);
  console.log("  ─────────────────────────────────────────────────────────\n");

  if (notInSR > 0) {
    console.log(`  ℹ️  ${notInSR} DB records not found in SR /shipments for ${FETCH_FROM}→${FETCH_TO}.`);
    console.log(`     This means those shipments were created BEFORE ${FETCH_FROM}.`);
    console.log(`     Extend FETCH_FROM in this script if needed, or run a full sync.\n`);
  }

  console.log("  ✅ Patch complete.\n");
  console.log("  ── NEXT STEP ──────────────────────────────────────────────");
  console.log("  Run the diagnostic to verify counts match SR dashboard:");
  console.log("    node scripts/sr-match-diagnostic.js\n");
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
