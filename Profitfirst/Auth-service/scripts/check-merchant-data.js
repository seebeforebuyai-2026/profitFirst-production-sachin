require('dotenv').config({ path: 'D:\\Profitfirst-Production\\Profitfirst\\Auth-service\\.env' });

const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');

const MERCHANT_ID = '898a557c-c0d1-708a-5249-cc713438c565';
const PK = `MERCHANT#${MERCHANT_ID}`;

async function queryAll(params) {
  let items = [];
  let lastKey = undefined;
  do {
    const cmd = new QueryCommand({ ...params, ExclusiveStartKey: lastKey });
    const resp = await newDynamoDB.send(cmd);
    items = items.concat(resp.Items || []);
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log(`\n========================================`);
  console.log(`Merchant Diagnostic: ${MERCHANT_ID}`);
  console.log(`Table: ${newTableName}`);
  console.log(`========================================\n`);

  // ─── 1. ORDER# records ───────────────────────────────────────────────────
  console.log('--- 1. ORDER# Records ---');
  const orders = await queryAll({
    TableName: newTableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: { ':pk': PK, ':skPrefix': 'ORDER#' },
  });

  const paymentBreakdown = { PREPAID: 0, COD: 0, PARTIAL_COD: 0, OTHER: 0 };
  let codAmountGt0 = 0;
  let prepaidAmountGt0 = 0;

  for (const o of orders) {
    const pt = o.paymentType || 'OTHER';
    if (paymentBreakdown[pt] !== undefined) paymentBreakdown[pt]++;
    else paymentBreakdown.OTHER++;
    if ((o.codAmount || 0) > 0) codAmountGt0++;
    if ((o.prepaidAmount || 0) > 0) prepaidAmountGt0++;
  }

  console.log(`  Total ORDER# records : ${orders.length}`);
  console.log(`  paymentType breakdown:`);
  console.log(`    PREPAID     : ${paymentBreakdown.PREPAID}`);
  console.log(`    COD         : ${paymentBreakdown.COD}`);
  console.log(`    PARTIAL_COD : ${paymentBreakdown.PARTIAL_COD}`);
  console.log(`    OTHER       : ${paymentBreakdown.OTHER}`);
  console.log(`  codAmount > 0       : ${codAmountGt0}`);
  console.log(`  prepaidAmount > 0   : ${prepaidAmountGt0}`);

  // ─── 2. SHIPMENT# records ─────────────────────────────────────────────────
  console.log('\n--- 2. SHIPMENT# Records ---');
  const shipments = await queryAll({
    TableName: newTableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: { ':pk': PK, ':skPrefix': 'SHIPMENT#' },
  });

  const deliveryStatusBreakdown = {};
  let phantomCount = 0;
  let srCreatedAtISTCount = 0;

  for (const s of shipments) {
    const ds = s.deliveryStatus || 'UNKNOWN';
    deliveryStatusBreakdown[ds] = (deliveryStatusBreakdown[ds] || 0) + 1;
    if (s.isPhantom === true) phantomCount++;
    if (s.srCreatedAtIST !== undefined && s.srCreatedAtIST !== null) srCreatedAtISTCount++;
  }

  console.log(`  Total SHIPMENT# records : ${shipments.length}`);
  console.log(`  deliveryStatus breakdown:`);
  for (const [status, count] of Object.entries(deliveryStatusBreakdown).sort()) {
    console.log(`    ${status.padEnd(30)}: ${count}`);
  }
  console.log(`  isPhantom = true        : ${phantomCount}`);
  console.log(`  has srCreatedAtIST      : ${srCreatedAtISTCount}`);

  // ─── 3. SUMMARY# records ─────────────────────────────────────────────────
  console.log('\n--- 3. SUMMARY# Records ---');
  const summaries = await queryAll({
    TableName: newTableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: { ':pk': PK, ':skPrefix': 'SUMMARY#' },
  });
  console.log(`  Total SUMMARY# records : ${summaries.length}`);

  // ─── 4. PROFILE record ───────────────────────────────────────────────────
  console.log('\n--- 4. PROFILE Record ---');
  const profileResp = await newDynamoDB.send(new QueryCommand({
    TableName: newTableName,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': PK, ':sk': 'PROFILE' },
  }));
  if (profileResp.Items && profileResp.Items.length > 0) {
    const p = profileResp.Items[0];
    const fields = ['subscription', 'staffSalary', 'officeRent', 'agencyFees', 'rtoHandlingFees', 'paymentGatewayFeePercent'];
    for (const f of fields) {
      console.log(`  ${f.padEnd(30)}: ${p[f] !== undefined ? JSON.stringify(p[f]) : '(not set)'}`);
    }
  } else {
    console.log('  No PROFILE record found.');
  }

  // ─── 5. Date-range SUMMARY# aggregation (2026-07-05 to 2026-08-03) ───────
  console.log('\n--- 5. SUMMARY# Aggregation: 2026-07-05 → 2026-08-03 ---');
  const rangeStart = 'SUMMARY#2026-07-05';
  const rangeEnd   = 'SUMMARY#2026-08-03~'; // tilde sorts after all chars for that date

  const rangeSummaries = await queryAll({
    TableName: newTableName,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
    ExpressionAttributeValues: { ':pk': PK, ':start': rangeStart, ':end': rangeEnd },
  });

  console.log(`  Matching SUMMARY# records in range: ${rangeSummaries.length}`);

  const numericFields = [
    'totalOrders', 'deliveredOrders', 'rtoOrders', 'cancelledOrders',
    'codOrders', 'prepaidOrders',
    'codRevenue', 'prepaidRevenue', 'revenueEarned', 'revenueGenerated',
    'shippingSpend', 'adsSpend',
    'rtoRevenueLost', 'rtoHandlingFees',
    'totalShipments',
  ];

  const totals = {};
  for (const f of numericFields) totals[f] = 0;

  for (const s of rangeSummaries) {
    for (const f of numericFields) {
      totals[f] += Number(s[f] || 0);
    }
  }

  console.log('\n  Aggregated Totals:');
  for (const f of numericFields) {
    console.log(`    ${f.padEnd(30)}: ${totals[f].toFixed(2)}`);
  }

  console.log('\n========================================');
  console.log('Diagnostic complete.');
  console.log('========================================\n');
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
