/**
 * SHIPROCKET MATCH DIAGNOSTIC
 * ────────────────────────────────────────────────────────────────────────────
 * The Shiprocket DASHBOARD counts shipments (not orders) using the
 * /shipments API filtered by shipment created_at date.
 *
 * This script:
 *  1. Fetches ALL pages of /shipments for the date range (= SR dashboard source)
 *  2. Computes exact counts from raw /shipments data
 *  3. Compares against our DynamoDB records
 *  4. Shows every mismatch with reason
 *
 * USAGE:  node scripts/sr-match-diagnostic.js
 * ────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const axios         = require("axios");
const fs            = require("fs");
const path          = require("path");
const { QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryptionService             = require("../utils/encryption");
const { formatInTimeZone }          = require("date-fns-tz");

// ══════════════════════════════════════════════════════════════════
// CONFIG — edit these
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
  merchantId : "493aa5ec-a011-701d-818a-ab89873da82d",
  FROM       : "2026-06-03",
  TO         : "2026-07-02",
  PER_PAGE   : 100,
  SAVE_RAW   : true,
  RAW_DIR    : "./scripts/sr-raw-dump",
};
// ══════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Parse any Shiprocket date → "yyyy-MM-dd" IST ─────────────────
function parseIST(dateStr) {
  if (!dateStr || dateStr === "0000-00-00 00:00:00" || dateStr === "0000-00-00") return null;
  const clean = String(dateStr).replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  if (isNaN(d.getTime())) return null;
  return formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd");
}

// ── Single canonical bucket function ─────────────────────────────────────
// MUST be identical to getNormalizedStatus in shiprocket-sync.worker.js
// Derived from real /shipments API data: 257 total, 22 cancelled = 235
// Mapping: Delivered=68, RTO=60, InTransit=84, NDR=22, Pickup=1, Cancelled=22
function getBucket(rawStatus) {
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
    return "NDR";

  const up = String(rawStatus).toUpperCase().trim();
  const PICKUP = new Set([
    "NEW","READY_TO_SHIP","PICKUP_SCHEDULED","PICKUP_GENERATED","PICKUP_QUEUED",
    "LABEL_GENERATED","MANIFEST_GENERATED","PICKUP RESCHEDULED","PICKUP_RESCHEDULED",
    "AWB_ASSIGNED",
  ]);
  if (PICKUP.has(up)) return "PICKUP_PENDING";

  return "IN_TRANSIT";
}

// ── Fetch ALL pages using next-link pagination (SR /shipments has no total_pages) ──
async function fetchAllPages(token, url, params, label) {
  const all = [];
  let page  = 1;
  while (true) {
    await sleep(1200);
    let res;
    try {
      res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params : { ...params, page, per_page: CONFIG.PER_PAGE },
        timeout: 60000,
      });
    } catch (e) {
      console.warn(`  ⚠️  ${label} p${page}: ${e.message}`);
      break;
    }
    const items = res.data?.data || [];
    const next  = res.data?.meta?.pagination?.links?.next;
    all.push(...items);
    console.log(`  ${label} page ${page}: ${items.length} items | hasNext: ${next ? "YES" : "NO"} (total so far: ${all.length})`);
    // SR /shipments uses next-link pagination — total_pages is always null
    if (!next || items.length === 0) break;
    page++;
  }
  return all;
}

// ── Load all DB shipments ─────────────────────────────────────────
async function getAllDBShipments(merchantId) {
  const all = [];
  let lastKey;
  do {
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `MERCHANT#${merchantId}`, ":sk": "SHIPMENT#" },
      ExclusiveStartKey: lastKey,
    }));
    all.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

function zeroCounts() {
  return { total:0, delivered:0, rto:0, inTransit:0, ndr:0, pickup:0, cancelled:0 };
}
function addToCounts(c, bucket) {
  c.total++;
  if      (bucket === "DELIVERED")      c.delivered++;
  else if (bucket === "RTO")            c.rto++;
  else if (bucket === "NDR")            c.ndr++;
  else if (bucket === "PICKUP_PENDING") c.pickup++;
  else if (bucket === "CANCELLED")      c.cancelled++;
  else                                  c.inTransit++;
}

// ═════════════════════════════════════════════════════════════════
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(  "║        SHIPROCKET MATCH DIAGNOSTIC v3                        ║");
  console.log(`║  Merchant : ${CONFIG.merchantId}  ║`);
  console.log(`║  Range    : ${CONFIG.FROM}  →  ${CONFIG.TO}             ║`);
  console.log(  "╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  KEY FACT: Shiprocket dashboard uses /shipments API (not /orders).");
  console.log("  /shipments filters by shipment created_at date.\n");

  // ── 1. Token ──────────────────────────────────────────────────
  console.log("📡 Step 1: Loading token…");
  const intRes = await newDynamoDB.send(new GetCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${CONFIG.merchantId}`, SK: "INTEGRATION#SHIPROCKET" },
  }));
  if (!intRes.Item) { console.error("❌ No integration found."); process.exit(1); }
  const token = encryptionService.decrypt(intRes.Item.token);
  console.log("  ✅ Token ready.\n");

  // ── 2. Fetch ALL /shipments pages ─────────────────────────────
  // This is EXACTLY what Shiprocket dashboard queries.
  // The /shipments from+to filter is by shipment created_at date.
  console.log(`📡 Step 2: Fetching ALL /shipments pages (${CONFIG.FROM} → ${CONFIG.TO})…`);
  console.log("  (This is the exact same dataset Shiprocket dashboard shows.)\n");
  const srShipments = await fetchAllPages(token,
    "https://apiv2.shiprocket.in/v1/external/shipments",
    { from: CONFIG.FROM, to: CONFIG.TO }, "shipments");
  console.log(`\n  ✅ Total shipments from SR API: ${srShipments.length}`);
  console.log(`  (Shiprocket dashboard should show exactly this many total shipments)\n`);

  if (CONFIG.SAVE_RAW) {
    if (!fs.existsSync(CONFIG.RAW_DIR)) fs.mkdirSync(CONFIG.RAW_DIR, { recursive: true });
    fs.writeFileSync(path.join(CONFIG.RAW_DIR,"sr_shipments_all.json"), JSON.stringify(srShipments, null, 2));
    console.log(`  💾 All shipments saved → ${CONFIG.RAW_DIR}/sr_shipments_all.json\n`);
  }

  // ── 3. Compute SR ground-truth from /shipments ────────────────
  console.log("🔍 Step 3: Computing SR ground-truth counts…\n");

  const srCounts  = zeroCounts();
  const srMap     = new Map();    // srOrderId → record (for diff)
  const srRawDist = {};
  const srByAwb   = new Map();    // awb → record (secondary lookup)

  for (const s of srShipments) {
    const rawStatus  = String(s.status || "UNKNOWN").trim();
    const bucket     = getBucket(rawStatus);
    const createdIST = parseIST(s.created_at);
    const srOrderId  = String(s.order_id || "");
    const awb        = String(s.awb || "");

    srRawDist[rawStatus] = (srRawDist[rawStatus] || 0) + 1;
    addToCounts(srCounts, bucket);

    const record = {
      srShipmentId : String(s.id || ""),
      srOrderId,
      awb,
      rawStatus,
      bucket,
      createdIST,
      deliveredDate: parseIST(s.delivered_date),
      rtoDate      : parseIST(s.rto_delivered_date),
    };
    if (srOrderId) srMap.set(srOrderId, record);
    if (awb)       srByAwb.set(awb, record);
  }

  console.log("  ┌──────────────────────────────────────────────────────────┐");
  console.log(  "  │  SHIPROCKET DASHBOARD — EXACT NUMBERS (from /shipments) │");
  console.log(  "  └──────────────────────────────────────────────────────────┘");
  console.table(srCounts);
  console.log(`\n  Compare Total (${srCounts.total}) against Shiprocket dashboard Total Shipments.`);
  console.log(`  If they match → this is the correct source data.\n`);

  console.log("  Raw status distribution (from /shipments):");
  console.table(srRawDist);

  // ── 4. Load DB shipments ──────────────────────────────────────
  console.log("📦 Step 4: Loading DB shipments…");
  const dbAll = await getAllDBShipments(CONFIG.merchantId);
  console.log(`  ✅ ${dbAll.length} total SHIPMENT# records in DB.\n`);

  // ── 5. Compute DB counts ──────────────────────────────────────
  console.log("🔍 Step 5: Computing DB counts (same logic as summary worker)…\n");
  const dbCounts  = zeroCounts();
  const dbMap     = new Map();
  let   noAnchor  = 0;
  let   noSrDate  = 0;
  const dbRawDist = {};

  for (const s of dbAll) {
    const anchor = s.srCreatedAtIST || s.orderCreatedAtIST || s.shipActivityDateIST;
    if (!anchor)          { noAnchor++; continue; }
    if (!s.srCreatedAtIST) noSrDate++;
    if (anchor < CONFIG.FROM || anchor > CONFIG.TO) continue;
    if (s.isPhantom) continue;  // phantom = not in SR API, exclude from counts

    const rawUp  = (s.rawStatus || "").toUpperCase().trim();
    const bucket = getBucket(rawUp);
    addToCounts(dbCounts, bucket);
    dbRawDist[rawUp] = (dbRawDist[rawUp] || 0) + 1;
    dbMap.set(s.srOrderId, { ...s, anchor, bucket });
  }

  console.log("  ┌──────────────────────────────────────────────────────────┐");
  console.log(  "  │  OUR DB — COMPUTED COUNTS                                │");
  console.log(  "  └──────────────────────────────────────────────────────────┘");
  console.table(dbCounts);
  console.log(`  No anchor date (skipped entirely): ${noAnchor}`);
  console.log(`  Missing srCreatedAtIST (using fallback): ${noSrDate}\n`);

  // ── 6. Side-by-side ───────────────────────────────────────────
  const fields = ["total","delivered","rto","inTransit","ndr","pickup","cancelled"];
  const comparison = {};
  let   allMatch   = true;
  for (const f of fields) {
    const diff = dbCounts[f] - srCounts[f];
    if (diff !== 0) allMatch = false;
    comparison[f] = {
      "Shiprocket (/shipments)": srCounts[f],
      "Our DB"                 : dbCounts[f],
      "Diff (DB−SR)"           : diff === 0 ? "✅  0" : `❌ ${diff > 0 ? "+" : ""}${diff}`,
    };
  }
  console.log("  ┌──────────────────────────────────────────────────────────┐");
  console.log(  "  │  SIDE-BY-SIDE COMPARISON                                 │");
  console.log(  "  └──────────────────────────────────────────────────────────┘");
  console.table(comparison);

  if (allMatch) {
    console.log("  🎉 PERFECT MATCH — all numbers agree!\n");
    return;
  }

  // ── 7. Deep diff ─────────────────────────────────────────────
  console.log("🔬 Step 6: Deep diff…\n");

  // 7a. In SR but not in DB (matched by srOrderId)
  const inSRNotDB = [];
  for (const [srOrderId, sr] of srMap) {
    if (!dbMap.has(srOrderId)) {
      inSRNotDB.push({
        srOrderId, awb: sr.awb, bucket: sr.bucket,
        rawStatus: sr.rawStatus, createdIST: sr.createdIST,
      });
    }
  }
  console.log(`  Shipments in SR /shipments BUT NOT in our DB range: ${inSRNotDB.length}`);
  if (inSRNotDB.length) {
    console.table(inSRNotDB.slice(0, 30));
    if (inSRNotDB.length > 30) console.log(`  … ${inSRNotDB.length - 30} more`);
    console.log("  ⚠️  These are missing from our DB or have wrong anchor date.");
    console.log("      Fix: full re-sync will write srCreatedAtIST correctly.\n");
  }

  // 7b. In DB range but not in SR /shipments
  const inDBNotSR = [];
  for (const [srOrderId, db] of dbMap) {
    if (!srMap.has(srOrderId)) {
      inDBNotSR.push({
        srOrderId, shopifyOrder: db.shopifyOrderName,
        anchor: db.anchor, srCreatedAtIST: db.srCreatedAtIST || "(fallback)",
        bucket: db.bucket, rawStatus: db.rawStatus,
      });
    }
  }
  console.log(`  DB records NOT found in SR /shipments: ${inDBNotSR.length}`);
  if (inDBNotSR.length) {
    console.table(inDBNotSR.slice(0, 30));
    if (inDBNotSR.length > 30) console.log(`  … ${inDBNotSR.length - 30} more`);
    console.log("  ⚠️  DB anchor date is wrong — these orders fall inside our range");
    console.log("      but their shipment was created outside it in Shiprocket.");
    console.log("      Fix: full re-sync populates srCreatedAtIST = SR shipment created_at.\n");
  }

  // 7c. Bucket mismatch (same srOrderId, different bucket)
  const bucketMismatch = [];
  for (const [srOrderId, sr] of srMap) {
    const db = dbMap.get(srOrderId);
    if (!db || db.bucket === sr.bucket) continue;
    bucketMismatch.push({
      srOrderId,
      "SR bucket"   : sr.bucket,
      "SR rawStatus": sr.rawStatus,
      "DB bucket"   : db.bucket,
      "DB rawStatus": db.rawStatus,
    });
  }
  console.log(`  Same shipment, DIFFERENT status bucket: ${bucketMismatch.length}`);
  if (bucketMismatch.length) {
    // Summarise patterns
    const patterns = {};
    for (const m of bucketMismatch) {
      const k = `SR:"${m["SR rawStatus"]}" → DB:"${m["DB rawStatus"]}"`;
      patterns[k] = (patterns[k] || 0) + 1;
    }
    console.log("  Mismatch patterns:");
    console.table(patterns);
    console.table(bucketMismatch.slice(0, 20));
    if (bucketMismatch.length > 20) console.log(`  … ${bucketMismatch.length - 20} more`);
    console.log("  ⚠️  DB has stale status from an old sync. Full re-sync will fix.\n");
  }

  // ── 8. Root-cause summary ─────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log(  "║  ROOT CAUSES & ACTION PLAN                                   ║");
  console.log(  "╚══════════════════════════════════════════════════════════════╝");

  const totalDiff = dbCounts.total - srCounts.total;
  if (inDBNotSR.length > 0) {
    console.log(`\n  CAUSE 1: +${inDBNotSR.length} extra DB records (wrong anchor date)`);
    console.log(`    ${inDBNotSR.length} shipments' anchor date falls inside ${CONFIG.FROM}–${CONFIG.TO}`);
    console.log(`    but their SR shipment created_at is OUTSIDE this range.`);
    console.log(`    This adds ${inDBNotSR.length} to our total vs SR's.`);
  }
  if (inSRNotDB.length > 0) {
    console.log(`\n  CAUSE 2: -${inSRNotDB.length} missing DB records (anchor date outside range)`);
    console.log(`    ${inSRNotDB.length} SR shipments' srCreatedAtIST would put them IN range`);
    console.log(`    but DB uses fallback date which is OUTSIDE range.`);
    console.log(`    This removes ${inSRNotDB.length} from our total vs SR's.`);
  }
  if (bucketMismatch.length > 0) {
    console.log(`\n  CAUSE 3: ${bucketMismatch.length} stale status records`);
    console.log(`    DB has old rawStatus from a previous sync.`);
    console.log(`    SR has updated the status since then.`);
  }

  console.log(`\n  ── THE ONE FIX THAT SOLVES EVERYTHING ──`);
  console.log(`  Run a FULL Shiprocket re-sync (all pages, all date chunks).`);
  console.log(`  This will:`);
  console.log(`    ✓ Write srCreatedAtIST = shipment created_at from SR API for every record`);
  console.log(`    ✓ Overwrite stale rawStatus/deliveryStatus with current SR status`);
  console.log(`    ✓ After sync: run diagnostic again → should show ✅ 0 on all diffs`);
  console.log(`\n  Missing srCreatedAtIST right now: ${noSrDate} / ${dbAll.length} records (${Math.round(noSrDate/dbAll.length*100)}%)`);
  console.log(`  After full sync: 0 / ${srShipments.length} (0%) — complete match expected.\n`);

  // ── 9. Save report ────────────────────────────────────────────
  if (CONFIG.SAVE_RAW) {
    const report = {
      generatedAt: new Date().toISOString(), config: CONFIG,
      srTotal: srShipments.length,
      srCounts, dbCounts, comparison: Object.fromEntries(fields.map(f =>
        [f, { sr:srCounts[f], db:dbCounts[f], diff:dbCounts[f]-srCounts[f] }])),
      dbFieldCoverage: { total:dbAll.length, noAnchor, missingSrCreatedAtIST:noSrDate },
      inSRNotDB, inDBNotSR, bucketMismatch,
    };
    fs.writeFileSync(path.join(CONFIG.RAW_DIR,"diff_report.json"), JSON.stringify(report,null,2));
    console.log(`  💾 Report saved → ${CONFIG.RAW_DIR}/diff_report.json\n`);
  }
  console.log("  Done.\n");
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
