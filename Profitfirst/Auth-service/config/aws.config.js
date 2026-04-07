const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { S3Client } = require('@aws-sdk/client-s3');

require('dotenv').config();

const mainAwsConfig = {
  region: process.env.AWS_REGION, // ap-south-1
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

const newAwsConfig = {
  region: 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_SG,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_SG
  }
};

const mainDynamoDB = DynamoDBDocumentClient.from(new DynamoDBClient(mainAwsConfig), { marshallOptions: { removeUndefinedValues: true } });
const newDynamoDB = DynamoDBDocumentClient.from(new DynamoDBClient(newAwsConfig), { marshallOptions: { removeUndefinedValues: true } });
const cognito = new CognitoIdentityProviderClient(mainAwsConfig);
const sqsClient = new SQSClient(newAwsConfig);
const s3Client = new S3Client(newAwsConfig);

module.exports = {
  mainDynamoDB,
  cognito,
  newDynamoDB,
  newTableName: process.env.NEW_DYNAMODB_TABLE_NAME || 'ProfitFirst_Core',
  sqsClient,
  s3Client,
  shopifyQueueUrl: process.env.SHOPIFY_QUEUE_URL,
  metaQueueUrl: process.env.META_QUEUE_URL,
  shiprocketQueueUrl: process.env.SHIPROCKET_QUEUE_URL,
  summaryQueueUrl: process.env.SUMMARY_QUEUE_URL,
  productQueueUrl: process.env.PRODUCT_QUEUE_URL, // 👈 ADD THIS LINE
  s3BucketName: process.env.S3_BUCKET_NAME,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  redirectUri: process.env.COGNITO_REDIRECT_URI
};