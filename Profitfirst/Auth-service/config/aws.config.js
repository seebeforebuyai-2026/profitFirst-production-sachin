/**
 * AWS Configuration
 * 
 * Initializes AWS SDK v3 clients for Cognito and DynamoDB
 * Uses environment variables for credentials and configuration
 * Supports multiple regions for different databases
 */

const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

// AWS SDK v3 Configuration - Main Region (for Cognito)
const mainAwsConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

// Initialize DynamoDB Document Client - Main Region
const mainDdbClient = new DynamoDBClient(mainAwsConfig);
const mainDynamoDB = DynamoDBDocumentClient.from(mainDdbClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

// Initialize Cognito Identity Provider Client - Main Region
const cognito = new CognitoIdentityProviderClient(mainAwsConfig);

// New Database Configuration - Asia Pacific (Singapore) Region
const newAwsConfig = {
  region: 'ap-southeast-1', // Asia Pacific (Singapore)
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

// Initialize DynamoDB Document Client - New Region
const newDdbClient = new DynamoDBClient(newAwsConfig);
const newDynamoDB = DynamoDBDocumentClient.from(newDdbClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

// Export configured clients and environment variables
module.exports = {
  // Main region clients (Cognito + old DynamoDB)
  mainDynamoDB,
  cognito,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  tableName: process.env.DYNAMODB_TABLE_NAME,
  
  // New region clients (new DynamoDB for all data)
  newDynamoDB,
  newTableName: process.env.NEW_DYNAMODB_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME,
  
  // OAuth configuration for Cognito Hosted UI
  cognitoDomain: process.env.COGNITO_DOMAIN,
  redirectUri: process.env.COGNITO_REDIRECT_URI
};
