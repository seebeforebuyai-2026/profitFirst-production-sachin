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
    const params = {
      TableName: newTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `MERCHANT#${merchantId}`,
        ':sk': 'VARIANT#'
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey
    };

    const result = await newDynamoDB.send(new QueryCommand(params));
    
    // Clean up the data for the frontend
    const variants = (result.Items || []).map(v => ({
      variantId: v.SK.replace('VARIANT#', ''),
      productId: v.productId,
      productName: v.productName || 'Unknown Product', // 🟢 This must be saved by the worker later
      variantName: v.variantName || 'Default Variant',
      salePrice: v.salePrice || 0,
      costPrice: v.costPrice || 0
    }));
    
    return {
      success: true,
      variants,
      lastKey: result.LastEvaluatedKey || null
    };
  }

  async saveCogsBatch(merchantId, variants) {
    const timestamp = new Date().toISOString();
    
    // 🟢 PRODUCTION TIP: Using Promise.all for faster parallel updates
    await Promise.all(variants.map(v => 
      newDynamoDB.send(new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `VARIANT#${v.variantId}` },
        UpdateExpression: 'SET costPrice = :c, cogsSetAt = :t, updatedAt = :t',
        ExpressionAttributeValues: { ':c': Number(v.costPrice), ':t': timestamp }
      }))
    ));

    // Update Profile to show COGS is done
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