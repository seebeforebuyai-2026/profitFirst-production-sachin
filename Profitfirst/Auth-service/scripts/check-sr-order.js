require("dotenv").config();
const axios = require("axios");
const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
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

  // Check these orders directly from SR orders API
  const orderIds = ["1381868061", "1381070162", "1382016385"];

  for (const id of orderIds) {
    await sleep(1500);
    const res = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/${id}`, {
      headers: { Authorization: "Bearer " + token },
      timeout: 10000,
    }).catch(e => ({ data: null, err: e.response?.status || e.message }));

    if (res.err) {
      console.log(`SR Order ${id}: ERROR ${res.err}`);
      continue;
    }
    const o = res.data;
    const shipCreated = o?.shipments?.[0] ? "shipment exists" : "NO shipment";
    console.log(`SR Order ${id}:`);
    console.log(`  created_at: ${o?.created_at} → IST: ${parseIST(o?.created_at)}`);
    console.log(`  status: ${o?.status}`);
    console.log(`  channel_order_id: ${o?.channel_order_id}`);
    console.log(`  shipments: ${shipCreated}`);
    if (o?.shipments?.[0]) {
      console.log(`  shipment status code: ${o.shipments[0].status}`);
      console.log(`  shipment awb: ${o.shipments[0].awb}`);
    }
    console.log();
  }

  // Now the KEY question: what does the /shipments API return for THESE orders?
  // Let's search by channel_order_id (Shopify order name) in shipments
  console.log("--- Checking /shipments with wider date windows ---");
  const windows = [
    { from: "2026-06-01", to: "2026-06-10" },
    { from: "2026-06-10", to: "2026-06-20" },
    { from: "2026-05-15", to: "2026-06-01" },
  ];
  for (const w of windows) {
    await sleep(1500);
    const res = await axios.get("https://apiv2.shiprocket.in/v1/external/shipments", {
      headers: { Authorization: "Bearer " + token },
      params: { from: w.from, to: w.to, per_page: 100 },
      timeout: 30000,
    }).catch(e => null);
    const items = res?.data?.data || [];
    const found = items.filter(s => orderIds.includes(String(s.order_id)));
    if (found.length) {
      console.log(`Found in ${w.from}→${w.to}:`);
      found.forEach(s => console.log("  order_id:", s.order_id, "created_at:", s.created_at, "status:", s.status));
    } else {
      console.log(`${w.from}→${w.to}: not found (${items.length} items total)`);
    }
  }
}
main().catch(e => console.error("Fatal:", e.message));
