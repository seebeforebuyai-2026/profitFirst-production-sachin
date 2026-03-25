const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName, sqsClient, sqsQueueUrl } = require('../config/aws.config');

class ProductsService {
  async queueProductFetch(merchantId) {
    const params = {
      QueueUrl: sqsQueueUrl,
      MessageBody: JSON.stringify({ type: 'PRODUCT_FETCH', merchantId })
    };
    await sqsClient.send(new SendMessageCommand(params));
    return { success: true };
  }

  async getVariantsList(merchantId, limit = 50, exclusiveStartKey = null) {
    // 1. Build the base parameters
    const params = {
      TableName: newTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `MERCHANT#${merchantId}`,
        ':sk': 'VARIANT#'
      },
      Limit: limit
    };

    // 🟢 CRITICAL FIX: Only add the key to the object if it exists.
    // AWS SDK v3 will crash if you provide "ExclusiveStartKey: null"
    if (exclusiveStartKey) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    const result = await newDynamoDB.send(new QueryCommand(params));
    
    const variants = (result.Items || []).map(v => ({
      variantId: v.SK.replace('VARIANT#', ''),
      productId: v.productId,
      productName: v.productName || 'Unknown Product',
      variantName: v.variantName || 'Default Variant',
      salePrice: v.salePrice || 0,
      costPrice: v.costPrice || 0,
      productImage: v.productImage || null // 🟢 Added image support
    }));
    
    return {
      success: true,
      variants,
      lastKey: result.LastEvaluatedKey || null
    };
  }

 async saveCogsBatch(merchantId, variants) {
    const timestamp = new Date().toISOString();
    
    // 🟢 PRODUCTION FIX: Process in chunks of 25 to avoid overwhelming the database
    const chunkSize = 25;
    for (let i = 0; i < variants.length; i += chunkSize) {
      const chunk = variants.slice(i, i + chunkSize);
      await Promise.all(chunk.map(v => 
        newDynamoDB.send(new UpdateCommand({
          TableName: newTableName,
          Key: { PK: `MERCHANT#${merchantId}`, SK: `VARIANT#${v.variantId}` },
          UpdateExpression: 'SET costPrice = :c, cogsSetAt = :t, updatedAt = :t',
          ExpressionAttributeValues: { ':c': Number(v.costPrice), ':t': timestamp }
        }))
      ));
    }

    // Update Profile
    await newDynamoDB.send(new UpdateCommand({
      TableName: newTableName,
      Key: { PK: `MERCHANT#${merchantId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET cogsCompleted = :true, updatedAt = :t',
      ExpressionAttributeValues: { ':true': true, ':t': timestamp }
    }));

    return { success: true };
  }
}

module.exports = new ProductsService(); 