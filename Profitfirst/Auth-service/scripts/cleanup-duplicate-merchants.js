/**
 * Cleanup Script: Remove Duplicate Merchant Records
 * 
 * This script helps identify and clean up duplicate merchant records
 * that were created before the Cognito ID fix was implemented.
 * 
 * WHAT IT DOES:
 * 1. Scans for all PROFILE records
 * 2. Groups them by email address
 * 3. Identifies duplicates (same email, different merchant IDs)
 * 4. Shows which records should be kept vs deleted
 * 5. Optionally removes duplicate records
 * 
 * USAGE:
 * node scripts/cleanup-duplicate-merchants.js --dry-run    (show what would be deleted)
 * node scripts/cleanup-duplicate-merchants.js --execute   (actually delete duplicates)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

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

async function scanAllProfiles() {
  console.log('🔍 Scanning for all PROFILE records...');
  
  const params = {
    TableName: tableName,
    FilterExpression: 'SK = :sk',
    ExpressionAttributeValues: {
      ':sk': 'PROFILE'
    }
  };

  const profiles = [];
  let lastEvaluatedKey = null;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamoDB.send(new ScanCommand(params));
    profiles.push(...result.Items);
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`📊 Found ${profiles.length} PROFILE records`);
  return profiles;
}

function analyzeProfiles(profiles) {
  console.log('\n📋 Analyzing profiles for duplicates...');
  
  const emailGroups = {};
  
  // Group profiles by email
  profiles.forEach(profile => {
    const email = profile.email;
    if (!emailGroups[email]) {
      emailGroups[email] = [];
    }
    emailGroups[email].push(profile);
  });

  const duplicates = [];
  const singles = [];

  Object.entries(emailGroups).forEach(([email, profileList]) => {
    if (profileList.length > 1) {
      duplicates.push({ email, profiles: profileList });
    } else {
      singles.push(profileList[0]);
    }
  });

  console.log(`✅ ${singles.length} unique profiles (no duplicates)`);
  console.log(`⚠️  ${duplicates.length} emails with duplicate profiles`);

  return { duplicates, singles };
}

function decideDuplicateStrategy(duplicateGroup) {
  const { email, profiles } = duplicateGroup;
  
  console.log(`\n📧 Email: ${email}`);
  console.log(`   Found ${profiles.length} duplicate profiles:`);
  
  profiles.forEach((profile, index) => {
    const merchantId = profile.PK.replace('MERCHANT#', '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantId);
    const isCognitoId = merchantId.length > 20 && !isUUID; // Cognito IDs are longer and not UUIDs
    const hasOnboarding = profile.onboardingStep > 1 || profile.onboardingCompleted;
    
    console.log(`   ${index + 1}. PK: ${profile.PK}`);
    console.log(`      Merchant ID: ${merchantId}`);
    console.log(`      Type: ${isCognitoId ? 'Cognito ID ✅' : isUUID ? 'UUID ❌' : 'Unknown'}`);
    console.log(`      Onboarding: Step ${profile.onboardingStep || 1}${hasOnboarding ? ' (has progress)' : ' (no progress)'}`);
    console.log(`      Created: ${profile.createdAt}`);
    console.log(`      Last Login: ${profile.lastLogin || 'Never'}`);
  });

  // Strategy: Keep the one with Cognito ID, or the one with most onboarding progress
  let keepProfile = profiles[0];
  let reason = 'first found';

  // Prefer Cognito ID
  const cognitoProfile = profiles.find(p => {
    const merchantId = p.PK.replace('MERCHANT#', '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantId);
    return !isUUID && merchantId.length > 20;
  });

  if (cognitoProfile) {
    keepProfile = cognitoProfile;
    reason = 'has Cognito ID';
  } else {
    // If no Cognito ID, keep the one with most onboarding progress
    const mostProgress = profiles.reduce((best, current) => {
      const currentStep = current.onboardingStep || 1;
      const bestStep = best.onboardingStep || 1;
      return currentStep > bestStep ? current : best;
    });
    
    keepProfile = mostProgress;
    reason = `most onboarding progress (step ${mostProgress.onboardingStep || 1})`;
  }

  const deleteProfiles = profiles.filter(p => p.PK !== keepProfile.PK);

  console.log(`\n   🎯 DECISION:`);
  console.log(`      KEEP: ${keepProfile.PK} (${reason})`);
  console.log(`      DELETE: ${deleteProfiles.length} duplicate(s)`);
  
  deleteProfiles.forEach(profile => {
    console.log(`         - ${profile.PK}`);
  });

  return { keep: keepProfile, delete: deleteProfiles };
}

async function executeCleanup(duplicates, dryRun = true) {
  console.log(`\n${dryRun ? '🔍 DRY RUN' : '🗑️  EXECUTING CLEANUP'} - Processing ${duplicates.length} duplicate groups...`);
  
  let totalToDelete = 0;
  const deletionPlan = [];

  for (const duplicateGroup of duplicates) {
    const strategy = decideDuplicateStrategy(duplicateGroup);
    deletionPlan.push(strategy);
    totalToDelete += strategy.delete.length;
  }

  console.log(`\n📊 SUMMARY:`);
  console.log(`   Total profiles to delete: ${totalToDelete}`);
  console.log(`   Total profiles to keep: ${duplicates.length}`);

  if (dryRun) {
    console.log(`\n✅ DRY RUN COMPLETE - No records were deleted`);
    console.log(`   To execute the cleanup, run with --execute flag`);
    return;
  }

  // Execute deletions
  console.log(`\n🗑️  EXECUTING DELETIONS...`);
  let deletedCount = 0;

  for (const plan of deletionPlan) {
    for (const profileToDelete of plan.delete) {
      try {
        const deleteParams = {
          TableName: tableName,
          Key: {
            PK: profileToDelete.PK,
            SK: profileToDelete.SK
          }
        };

        await dynamoDB.send(new DeleteCommand(deleteParams));
        console.log(`   ✅ Deleted: ${profileToDelete.PK}`);
        deletedCount++;
      } catch (error) {
        console.error(`   ❌ Failed to delete ${profileToDelete.PK}:`, error.message);
      }
    }
  }

  console.log(`\n🎉 CLEANUP COMPLETE:`);
  console.log(`   Successfully deleted: ${deletedCount} duplicate profiles`);
  console.log(`   Database is now clean with unique merchant IDs`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made');
  } else {
    console.log('⚠️  EXECUTING mode - duplicate records will be DELETED');
  }

  try {
    // Scan all profiles
    const profiles = await scanAllProfiles();
    
    if (profiles.length === 0) {
      console.log('✅ No profiles found - database is empty');
      return;
    }

    // Analyze for duplicates
    const { duplicates, singles } = analyzeProfiles(profiles);
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate profiles found - database is clean!');
      return;
    }

    // Execute cleanup
    await executeCleanup(duplicates, dryRun);

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
main();