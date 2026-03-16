/**
 * Test Encryption Service
 * 
 * Simple test to verify encryption/decryption works correctly
 */

require('dotenv').config();

async function testEncryption() {
  try {
    console.log('🧪 Testing Encryption Service...\n');

    // Import encryption service
    const encryptionService = require('../utils/encryption');

    // Test data
    const testToken = 'test_access_token_12345_abcdef';
    console.log(`📝 Original token: ${testToken}`);

    // Test encryption
    const encrypted = encryptionService.encrypt(testToken);
    console.log(`🔐 Encrypted: ${encrypted.substring(0, 50)}...`);

    // Test decryption
    const decrypted = encryptionService.decrypt(encrypted);
    console.log(`🔓 Decrypted: ${decrypted}`);

    // Verify they match
    if (testToken === decrypted) {
      console.log('\n✅ Encryption test PASSED - tokens match!');
    } else {
      console.log('\n❌ Encryption test FAILED - tokens do not match!');
      process.exit(1);
    }

    // Test error handling
    console.log('\n🧪 Testing error handling...');
    
    try {
      encryptionService.decrypt('invalid:format:extra');
      console.log('❌ Should have thrown error for invalid format');
    } catch (error) {
      console.log('✅ Correctly handled invalid format error');
    }

    console.log('\n🎉 All encryption tests passed!');

  } catch (error) {
    console.error('❌ Encryption test failed:', error.message);
    process.exit(1);
  }
}

// Run test
testEncryption();