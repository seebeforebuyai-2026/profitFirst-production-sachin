const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const axios = require("axios");
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryption = require("../utils/encryption");

const MERCHANT_ID = "f173edda-a031-705d-cbb3-e868f0a6782a";

async function test() {
  // Load token
  const res = await newDynamoDB.send(new QueryCommand({
    TableName: newTableName,
    KeyConditionExpression: "PK = :pk AND SK = :sk",
    ExpressionAttributeValues: {
      ":pk": `MERCHANT#${MERCHANT_ID}`,
      ":sk": "INTEGRATION#SHIPROCKET"
    }
  }));

  const token = encryption.decrypt(res.Items[0].token);
  console.log("✅ Token loaded");

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const from = fromDate.toISOString().split("T")[0];
  const to = new Date().toISOString().split("T")[0];

  console.log(`📅 Date range: ${from} to ${to}`);

  // TEST 1: /orders endpoint
  console.log("\n🔍 TEST 1: /orders endpoint");
  try {
    const ordersRes = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/orders",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { from, to, page: 1, per_page: 50 }
      }
    );
    console.log(`✅ Success! Got ${ordersRes.data.data?.length || 0} orders`);
    
    if (ordersRes.data.data?.[0]) {
      const sample = ordersRes.data.data[0];
      console.log("\n📋 FIRST ORDER STRUCTURE:");
      console.log(`   id: ${sample.id}`);
      console.log(`   channel_order_id: ${sample.channel_order_id}`);
      console.log(`   status: ${sample.status}`);
      console.log(`   created_at: ${sample.created_at}`);
      console.log(`   updated_at: ${sample.updated_at}`);
      console.log(`   shipments count: ${sample.shipments?.length || 0}`);
      
      if (sample.shipments?.[0]) {
        console.log(`\n   shipments[0].status: ${sample.shipments[0].status}`);
        console.log(`   shipments[0].delivered_date: ${sample.shipments[0].delivered_date}`);
        console.log(`   shipments[0].id: ${sample.shipments[0].id}`);
      }
      
      console.log(`\n   awb_data.charges:`, sample.awb_data?.charges);
    }

    console.log(`\n📄 Pagination:`, ordersRes.data.meta?.pagination);
  } catch (err) {
    console.error(`❌ /orders FAILED:`, err.response?.status, err.response?.data);
  }

  // TEST 2: /shipments endpoint
  console.log("\n🔍 TEST 2: /shipments endpoint");
  try {
    const shipRes = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/shipments",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { from, to, page: 1, per_page: 50 }
      }
    );
    console.log(`✅ Success! Got ${shipRes.data.data?.length || 0} shipments`);
    
    if (shipRes.data.data?.[0]) {
      const sample = shipRes.data.data[0];
      console.log("\n📋 FIRST SHIPMENT STRUCTURE:");
      console.log(`   id: ${sample.id}`);
      console.log(`   channel_order_id: ${sample.channel_order_id}`);
      console.log(`   status: ${sample.status}`);
      console.log(`   order_id: ${sample.order_id}`);
      console.log(`   delivered_date: ${sample.delivered_date}`);
      console.log(`\n   charges:`, sample.charges);
      console.log(`   awb_data?.charges:`, sample.awb_data?.charges);
    }
  } catch (err) {
    console.error(`❌ /shipments FAILED:`, err.response?.status, err.response?.data);
  }

  // TEST 3: Test with large date range (90 days)
  console.log("\n🔍 TEST 3: /orders with 90 days range");
  const from90 = new Date();
  from90.setDate(from90.getDate() - 90);
  
  try {
    const res90 = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/orders",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { 
          from: from90.toISOString().split("T")[0], 
          to, 
          page: 1, 
          per_page: 50 
        }
      }
    );
    console.log(`✅ 90-day range works! Got ${res90.data.data?.length || 0} orders`);
    console.log(`📄 Total pages:`, res90.data.meta?.pagination?.last_page);
  } catch (err) {
    console.error(`❌ 90-day FAILED:`, err.response?.status, err.response?.data);
  }
}

test();