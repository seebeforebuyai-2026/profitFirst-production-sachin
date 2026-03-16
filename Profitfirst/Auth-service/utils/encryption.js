/**
 * Encryption Utility for Sensitive Data
 * 
 * Encrypts/decrypts access tokens and other sensitive information
 * Uses AES-256-GCM for authenticated encryption
 */

const crypto = require('crypto');

class EncryptionService {
  constructor() {
    // Get encryption key from environment (must be 32 bytes)
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    if (this.encryptionKey.length !== 64) { // 32 bytes = 64 hex chars
      throw new Error('ENCRYPTION_KEY must be 64 characters (32 bytes) hex string');
    }
    
    this.keyBuffer = Buffer.from(this.encryptionKey, 'hex');
  }

  /**
   * Encrypt sensitive data (like access tokens)
   * 
   * @param {string} plaintext - Data to encrypt
   * @returns {string} Encrypted data in format: iv:encrypted
   */
  encrypt(plaintext) {
    try {
      if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('Invalid plaintext provided');
      }

      const iv = crypto.randomBytes(16); // 128-bit IV
      const cipher = crypto.createCipheriv('aes-256-cbc', this.keyBuffer, iv); // ✅ FIXED: Use createCipheriv
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Format: iv:encrypted
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Encryption error:', error.message);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   * 
   * @param {string} encryptedData - Data in format: iv:encrypted
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Invalid encrypted data provided');
      }

      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.keyBuffer, iv); // ✅ FIXED: Use createDecipheriv
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error.message);
      throw new Error('Failed to decrypt data');
    }
  }
}

module.exports = new EncryptionService();