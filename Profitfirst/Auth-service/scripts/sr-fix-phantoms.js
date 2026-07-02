/**
 * SR-FIX-PHANTOMS
 * ─────────────────────────────────────────────────────────────────────────────
 * The diagnostic found 84 DB records that appear in our date range but are NOT
 * in Shiprocket's /shipments API. These are phantom records whose SR orders
 * return 404 — they no longer exist in Shiprocket.
 *
 * This script:
 *  1. Fetches ALL SR shipments for the full range (same as diagnostic)
 *  2. Finds every DB SHIPMENT# record whose srOrderId does NOT exist in SR
 *  3. Sets isOrphan=true and srCreatedAtIST=null on those records so they
 *     are excluded from date-range counts (since we can't trust their anchor)
 *
 * SAFE TO RE-RUN. Only modifies records confirmed absent from SR API.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const axios = require("axios");
const { GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const enc = require("../utils/encryption");
const { formatInTimeZone } = require("date-fns-tz");

const MERCHANT_ID = "493aa5ec-a011-701d-818a-ab89873da82d";
const PER_PAGE    = 100;
// Fetch from the earliest possible date to catch all shipments
// SR API max range seems ~30-45 days. We'll chunk it.
const RANGE_START = "2026-04-27";  // 65 days before Jul 1
const RANGE_END   = "2026-07-01";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseIST(d) {
  if (!d || d === "0000-00-00 00:00:00") return null;
  const c = String(d).replace(/(\d+)(st|nd|rd|th)/, "$1");
  const dt = new Date(c);
  if (isNaN(dt.getTime())) return null;
  return formatInTimeZone(dt, "Asia/Kolkata", "yyyy-MM-dd");
}

// Chunk date range into 3-week windows (SR seems to reject large ranges)
function chunkDateRange(from, to, days = 21) {
  const chunks = [];
  let cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + days - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      from: cur.toISOString().split("T")[0],
      to: chunkEnd.toISOString().split("T")[0],
    });
    cur = new Date(chunkEnd);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

async function fetchAllShipmentIds(token) {
  const srOrderIds = new Set();
  const chunks = chunkDateRange(RANGE_START, RANGE_END, 21);
  console.log(`  Fetching ${chunks.length} date chunks…`);

  for (const chunk of chunks) {
    let page = 1;
    while (true) {
      await sleep(1300);
      let res;
      try {
        res = await axios.get("https://apiv2.shiprocket.in/v1/external/shipments", {
          headers: { Authorization: `Bearer ${token}` },
          params: { from: chunk.from, to: chunk.to, page, per_page: PER_PAGE },
          timeout: 30000,
        });
      } catch (e) {
        if (e.response?.status === 400) {
          console.log(`    ${chunk.from}→${chunk.to}: 400 (no data), skip`);
          break;
        }
        console.warn(`    Page ${page} error: ${e.message}`);
        break;
      }
      const items = res.data?.data || [];
      const next  = res.data?.meta?.pagination?.links?.next;
      items.forEach(s => { if (s.order_id) srOrderIds.add(String(s.order_id)); });
      console.log(`    ${chunk.from}→${chunk.to} p${page}: ${items.length} items | total SR IDs: ${srOrderIds.size}`);
      if (!next || items.length === 0) break;
      page++;
    }
  }
  return srOrderIds;
}

async function getAllDBShipments() {
  const all = [];
  let lastKey;
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

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(  "║  SR-FIX-PHANTOMS                                              ║");
  console.log(  "╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Token
  const intRes = await newDynamoDB.send(new GetCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "INTEGRATION#SHIPROCKET" },
  }));
  const token = enc.decrypt(intRes.Item.token);
  console.log("✅ Token loaded.\n");

  // 2. Fetch all SR shipment order IDs across the full range
  console.log(`📡 Fetching all SR shipment IDs (${RANGE_START} → ${RANGE_END})…`);
  const srOrderIds = await fetchAllShipmentIds(token);
  console.log(`\n  ✅ Found ${srOrderIds.size} unique SR order IDs in Shiprocket.\n`);

  // 3. Load DB records
  console.log("📦 Loading DB records…");
  const dbAll = await getAllDBShipments();
  console.log(`  ✅ ${dbAll.length} SHIPMENT# records in DB.\n`);

  // 4. Find phantoms — DB records whose srOrderId is NOT in SR API at all
  const phantoms = dbAll.filter(s => s.srOrderId && !srOrderIds.has(s.srOrderId));
  console.log(`🔍 Phantoms (DB records not found in SR API): ${phantoms.length}`);

  if (phantoms.length === 0) {
    console.log("  ✅ No phantoms found. DB is clean.\n");
    return;
  }

  // Show sample
  console.log("  Sample phantom records:");
  phantoms.slice(0, 10).forEach(s => {
    const anchor = s.srCreatedAtIST || s.orderCreatedAtIST || s.shipActivityDateIST;
    console.log(`    srOrderId: ${s.srOrderId} | shopifyOrder: ${s.shopifyOrderName} | anchor: ${anchor} | status: ${s.rawStatus}`);
  });
  if (phantoms.length > 10) console.log(`    … and ${phantoms.length - 10} more`);

  // 5. Mark phantoms: set isPhantom=true, clear srCreatedAtIST so they fall out of range
  // We DON'T delete them — they may still be needed for financial accounting
  // We just mark them so the summary/diagnostic ignores them in status counts
  console.log(`\n🔧 Marking ${phantoms.length} phantom records (isPhantom=true, clear srCreatedAtIST)…`);

  let patched = 0;
  const CONCURRENCY = 10;
  for (let i = 0; i < phantoms.length; i += CONCURRENCY) {
    const batch = phantoms.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (s) => {
      try {
        await newDynamoDB.send(new UpdateCommand({
          TableName: newTableName,
          Key: { PK: s.PK, SK: s.SK },
          UpdateExpression: "SET isPhantom = :t, updatedAt = :ua REMOVE srCreatedAtIST",
          ExpressionAttributeValues: {
            ":t": true,
            ":ua": new Date().toISOString(),
          },
        }));
        patched++;
      } catch (e) {
        console.error(`  Error patching ${s.srOrderId}: ${e.message}`);
      }
    }));
    if ((i + CONCURRENCY) % 50 === 0) console.log(`  Progress: ${i + CONCURRENCY}/${phantoms.length}`);
  }

  console.log(`\n  ✅ Patched ${patched} phantom records.\n`);
  console.log("── NEXT STEPS ──────────────────────────────────────────────────");
  console.log("1. Update summary-calculator to skip isPhantom records in status counts");
  console.log("2. Update sr-match-diagnostic to skip isPhantom records in DB counts");
  console.log("3. Run: node scripts/sr-match-diagnostic.js");
  console.log();
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
