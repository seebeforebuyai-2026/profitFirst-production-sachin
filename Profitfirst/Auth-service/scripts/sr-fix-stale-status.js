/**
 * SR-FIX-STALE-STATUS
 * Patches the 6 specific DB records whose status doesn't match SR /shipments.
 * These were identified by the diagnostic. Safe, targeted, no side effects.
 */
require("dotenv").config();
const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");

const MERCHANT_ID = "493aa5ec-a011-701d-818a-ab89873da82d";

// Exact fixes from diagnostic bucket mismatch table:
// srOrderId | SR rawStatus | SR bucket | current DB rawStatus
const FIXES = [
  { srOrderId: "1406651940", rawStatus: "UNDELIVERED",                     deliveryStatus: "NDR"        },
  { srOrderId: "1408446041", rawStatus: "UNDELIVERED",                     deliveryStatus: "NDR"        },
  { srOrderId: "1418759813", rawStatus: "UNDELIVERED",                     deliveryStatus: "NDR"        },
  { srOrderId: "1417684034", rawStatus: "UNDELIVERED",                     deliveryStatus: "NDR"        },
  { srOrderId: "1421356123", rawStatus: "REACHED BACK AT THE SELLER CITY", deliveryStatus: "RTO"        },
  { srOrderId: "1425529006", rawStatus: "UNDELIVERED",                     deliveryStatus: "NDR"        },
];

async function main() {
  console.log("🔧 Patching 6 stale-status records…\n");

  // We need the SK for each record — query by srOrderId
  const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

  for (const fix of FIXES) {
    // Find the record
    const res = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      FilterExpression: "srOrderId = :id",
      ExpressionAttributeValues: {
        ":pk": `MERCHANT#${MERCHANT_ID}`,
        ":sk": "SHIPMENT#",
        ":id": fix.srOrderId,
      },
    }));

    const item = res.Items?.[0];
    if (!item) {
      console.log(`  ⚠️  srOrderId ${fix.srOrderId} not found in DB`);
      continue;
    }

    await newDynamoDB.send(new UpdateCommand({
      TableName: newTableName,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: "SET rawStatus = :rs, deliveryStatus = :ds, updatedAt = :ua",
      ExpressionAttributeValues: {
        ":rs": fix.rawStatus,
        ":ds": fix.deliveryStatus,
        ":ua": new Date().toISOString(),
      },
    }));

    console.log(`  ✅ ${fix.srOrderId}: rawStatus → "${fix.rawStatus}" | deliveryStatus → "${fix.deliveryStatus}"`);
  }

  console.log("\n✅ Done. Run diagnostic to verify:\n  node scripts/sr-match-diagnostic.js\n");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
