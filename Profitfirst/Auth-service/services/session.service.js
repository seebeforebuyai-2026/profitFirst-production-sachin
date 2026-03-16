/**
 * Session Management Service
 * 
 * Handles OAuth sessions using DynamoDB instead of in-memory storage
 * More secure and scalable for production
 */

const { PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');
const crypto = require('crypto');

class SessionService {
  constructor() {
    this.sessionTTL = 600; // 10 minutes in seconds
  }

  /**
   * Create OAuth Session
   * 
   * @param {string} userId - User ID
   * @param {string} platform - OAuth platform (meta, google, etc.)
   * @returns {string} Session state token
   */
  async createOAuthSession(userId, platform = 'meta') {
    try {
      const state = crypto.randomBytes(32).toString('hex'); // 64 char hex string
      const expiresAt = Math.floor(Date.now() / 1000) + this.sessionTTL;
      
      const sessionData = {
        PK: `SESSION#${state}`,
        SK: 'OAUTH',
        entityType: 'SESSION',
        userId: userId,
        platform: platform,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
        TTL: expiresAt // DynamoDB TTL attribute
      };

      const command = new PutCommand({
        TableName: newTableName,
        Item: sessionData,
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent duplicates
      });

      await newDynamoDB.send(command);
      
      return state;
    } catch (error) {
      console.error('Create OAuth session error:', error);
      throw new Error('Failed to create OAuth session');
    }
  }

  /**
   * Get OAuth Session
   * 
   * @param {string} state - Session state token
   * @returns {Object|null} Session data or null if not found/expired
   */
  async getOAuthSession(state) {
    try {
      if (!state || typeof state !== 'string') {
        return null;
      }

      const command = new GetCommand({
        TableName: newTableName,
        Key: {
          PK: `SESSION#${state}`,
          SK: 'OAUTH'
        }
      });

      const result = await newDynamoDB.send(command);
      
      if (!result.Item) {
        return null;
      }

      const session = result.Item;
      const now = Math.floor(Date.now() / 1000);
      
      // Check if session is expired
      if (session.expiresAt < now) {
        // Clean up expired session
        await this.deleteOAuthSession(state);
        return null;
      }

      return {
        userId: session.userId,
        platform: session.platform,
        createdAt: session.createdAt
      };
    } catch (error) {
      console.error('Get OAuth session error:', error);
      return null;
    }
  }

  /**
   * Delete OAuth Session
   * 
   * @param {string} state - Session state token
   */
  async deleteOAuthSession(state) {
    try {
      if (!state) return;

      const command = new DeleteCommand({
        TableName: newTableName,
        Key: {
          PK: `SESSION#${state}`,
          SK: 'OAUTH'
        }
      });

      await newDynamoDB.send(command);
    } catch (error) {
      console.error('Delete OAuth session error:', error);
      // Don't throw - session cleanup is not critical
    }
  }

  /**
   * Clean up expired sessions (can be run periodically)
   * Note: DynamoDB TTL will automatically delete expired items
   */
  async cleanupExpiredSessions() {
    // DynamoDB TTL handles this automatically
  }
}

module.exports = new SessionService();