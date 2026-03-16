/**
 * Check for Orphaned Integration Records
 * 
 * This script checks for integration records (SHOPIFY, META, SHIPROCKET)
 * that might be linked to merchant IDs that no longer have PROFILE records.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Load environment variables
require('dotenv').config();

// Initialize DynamoDB client for Singapore region
const dynamoDBClient = new DynamoDBClient({
  region: process.env.NEW_AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient);
const tableName = process.env.NEW_DYNAMODB_TABLE_NAME || 'ProfitFirst_Core';

async function scanAllRecords() {
  console.log('🔍 Scanning all records...');
  
  const params = {
    TableName: tableName
  };

  const records = [];
  let lastEvaluatedKey = null;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamoDB.send(new ScanCommand(params));
    records.push(...result.Items);
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`📊 Found ${records.length} total records`);
  return records;
}

function analyzeRecords(records) {
  const profiles = records.filter(r => r.SK === 'PROFILE');
  const integrations = records.filter(r => r.SK.startsWith('INTEGRATION#'));
  const products = records.filter(r => r.entityType === 'PRODUCT');
  const variants = records.filter(r => r.entityType === 'VARIANT');

  console.log(`\n📋 Record breakdown:`);
  console.log(`   PROFILE records: ${profiles.length}`);
  console.log(`   INTEGRATION records: ${integrations.length}`);
  console.log(`   PRODUCT records: ${products.length}`);
  console.log(`   VARIANT records: ${variants.length}`);

  // Get all merchant IDs from profiles
  const validMerchantIds = new Set(profiles.map(p => p.PK));
  
  console.log(`\n✅ Valid merchant IDs (have PROFILE):`);
  validMerchantIds.forEach(id => {
    console.log(`   ${id}`);
  });

  // Check for orphaned integrations
  const orphanedIntegrations = integrations.filter(i => !validMerchantIds.has(i.PK));
  const orphanedProducts = products.filter(p => !validMerchantIds.has(p.PK));
  const orphanedVariants = variants.filter(v => !validMerchantIds.has(v.PK));

  if (orphanedIntegrations.length > 0) {
    console.log(`\n⚠️  ORPHANED INTEGRATIONS (${orphanedIntegrations.length}):`);
    orphanedIntegrations.forEach(integration => {
      console.log(`   ${integration.PK} / ${integration.SK}`);
      console.log(`      Platform: ${integration.platform}`);
      console.log(`      Status: ${integration.status}`);
      console.log(`      Connected: ${integration.connectedAt}`);
    });
  } else {
    console.log(`\n✅ No orphaned integrations found`);
  }

  if (orphanedProducts.length > 0) {
    console.log(`\n⚠️  ORPHANED PRODUCTS (${orphanedProducts.length}):`);
    orphanedProducts.forEach(product => {
      console.log(`   ${product.PK} / ${product.SK}`);
    });
  } else {
    console.log(`\n✅ No orphaned products found`);
  }

  if (orphanedVariants.length > 0) {
    console.log(`\n⚠️  ORPHANED VARIANTS (${orphanedVariants.length}):`);
    orphanedVariants.forEach(variant => {
      console.log(`   ${variant.PK} / ${variant.SK}`);
    });
  } else {
    console.log(`\n✅ No orphaned variants found`);
  }

  return {
    profiles,
    integrations,
    products,
    variants,
    orphanedIntegrations,
    orphanedProducts,
    orphanedVariants
  };
}

async function main() {
  try {
    const records = await scanAllRecords();
    const analysis = analyzeRecords(records);

    const totalOrphaned = analysis.orphanedIntegrations.length + 
                         analysis.orphanedProducts.length + 
                         analysis.orphanedVariants.length;

    if (totalOrphaned === 0) {
      console.log(`\n🎉 DATABASE IS CLEAN!`);
      console.log(`   All integration, product, and variant records are properly linked to valid merchant profiles.`);
    } else {
      console.log(`\n⚠️  CLEANUP NEEDED:`);
      console.log(`   Found ${totalOrphaned} orphaned records that should be cleaned up.`);
      console.log(`   These records belong to merchant IDs that no longer have PROFILE records.`);
    }

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

main();