require("dotenv").config();
const axios = require("axios");
const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const enc = require("../utils/encryption");
const { formatInTimeZone } = require("date-fns-tz");

function parseIST(d) {
  if (!d || d === "0000-00-00 00:00:00") return null;
  const c = String(d).replace(/(\d+)(st|nd|rd|th)/, "$1");
  const dt = new Date(c);
  if (isNaN(dt.getTime())) return null;
  return formatInTimeZone(dt, "Asia/Kolkata", "yyyy-MM-dd");
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const r = await newDynamoDB.send(new GetCommand({
    TableName: newTableName,
    Key: { PK: "MERCHANT#493aa5ec-a011-701d-818a-ab89873da82d", SK: "INTEGRATION#SHIPROCKET" }
  }));
  const token = enc.decrypt(r.Item.token);

  // These are DB records with srCreatedAtIST=Jun5 but NOT in the Jun2-Jul1 /shipments results
  // We need to know their REAL shipment created_at from Shiprocket
  const testOrderIds = ["1381868061", "1381070162", "1382016385", "1382136029"];

  // Check the /shipments API with a wider range (going back to May)
  console.log("Checking /shipments API for May 1 - Jun 15...");
  await sleep(1200);
  let page = 1;
  const found = {};
  while (true) {
    await sleep(1200);
    const res = await axios.get("https://apiv2.shiprocket.in/v1/external/shipments", {
      headers: { Authorization: "Bearer " + token },
      params: { from: "2026-05-01", to: "2026-06-15", page, per_page: 100 },
      timeout: 30000,
    }).catch(e => { console.log("Error:", e.message); return null; });
    if (!res) break;
    const items = res.data?.data || [];
    const next = res.data?.meta?.pagination?.links?.next;
    for (const s of items) {
      if (testOrderIds.includes(String(s.order_id))) {
        found[String(s.order_id)] = { created_at: s.created_at, status: s.status, parsedIST: parseIST(s.created_at) };
      }
    }
    console.log("Page", page, ":", items.length, "items | found so far:", Object.keys(found).length);
    if (!next || items.length === 0) break;
    page++;
  }

  console.log("\nResult — SR /shipments created_at for our 'wrong' DB records:");
  for (const id of testOrderIds) {
    if (found[id]) {
      console.log("  srOrderId:", id, "| SR created_at:", found[id].created_at, "| parsed IST:", found[id].parsedIST, "| status:", found[id].status);
    } else {
      console.log("  srOrderId:", id, "| NOT FOUND in May1-Jun15 range either");
    }
  }

  // Also show what we have in DB for these
  console.log("\nWhat our DB has for these records:");
  const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
  const dbRes = await newDynamoDB.send(new QueryCommand({
    TableName: newTableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "MERCHANT#493aa5ec-a011-701d-818a-ab89873da82d", ":sk": "SHIPMENT#" },
    FilterExpression: "srOrderId IN (:id1, :id2, :id3, :id4)",
    ExpressionAttributeValues: {
      ":pk": "MERCHANT#493aa5ec-a011-701d-818a-ab89873da82d",
      ":sk": "SHIPMENT#",
      ":id1": "1381868061",
      ":id2": "1381070162",
      ":id3": "1382016385",
      ":id4": "1382136029",
    }
  })).catch(() => null);
  (dbRes?.Items || []).forEach(s => {
    console.log("  srOrderId:", s.srOrderId, "| srCreatedAtIST:", s.srCreatedAtIST || "(none)", "| orderCreatedAtIST:", s.orderCreatedAtIST, "| rawStatus:", s.rawStatus);
  });
}

main().catch(e => console.error("Fatal:", e.message));
