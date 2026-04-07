const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
// 🟢 FIX 1: Import productQueueUrl (matching your aws.config.js exactly)
const { newDynamoDB, newTableName, sqsClient, productQueueUrl } = require('../config/aws.config');

class ProductsService {
  /**
   * 1. Trigger the background Product Fetch (SQS)
   */
  async queueProductFetch(merchantId) {
    try {
      // 🟢 Safety Check: Prevent undefined URL crash
      if (!productQueueUrl) {
        throw new Error("PRODUCT_QUEUE_URL is not defined in environment variables.");
      }

      const params = { 
        QueueUrl: productQueueUrl, // 👈 FIXED NAME
        MessageBody: JSON.stringify({ 
          type: 'PRODUCT_FETCH', 
          merchantId: merchantId,
          timestamp: new Date().toISOString()
        })
      };
      
      await sqsClient.send(new SendMessageCommand(params));
      console.log(`📥 [SQS] Product fetch queued for: ${merchantId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ SQS Queue Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 2. Fetch paginated variants for the COGS table
   */
  async getVariantsList(merchantId, limit = 50, exclusiveStartKey = null) {
    try {
      const params = {
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `MERCHANT#${merchantId}`,
          ':sk': 'VARIANT#'
        },
        Limit: limit
      };

      // 🟢 DYNAMIC PARAM FIX: Prevents "null to object" marshalling crash
      if (exclusiveStartKey) {
        params.ExclusiveStartKey = exclusiveStartKey;
      }

      const result = await newDynamoDB.send(new QueryCommand(params));
      
      const variants = (result.Items || []).map(v => ({
        variantId: v.variantId || v.SK.replace('VARIANT#', ''),
        productId: v.productId,
        productName: v.productName || 'Unknown Product',
        variantName: v.variantName || 'Default Variant',
        salePrice: v.salePrice || 0,
        costPrice: v.costPrice || 0,
        productImage: v.productImage || null
      }));
      
      return {
        success: true,
        variants,
        lastKey: result.LastEvaluatedKey || null
      };
    } catch (error) {
      console.error('❌ DynamoDB Query Error:', error.message);
      throw error;
    }
  }

  /**
   * 3. Save COGS in Chunks (Batch Processing)
   */
  async saveCogsBatch(merchantId, variants) {
    try {
      const timestamp = new Date().toISOString();
      const chunkSize = 25; // DynamoDB safety limit

      for (let i = 0; i < variants.length; i += chunkSize) {
        const chunk = variants.slice(i, i + chunkSize);
        
        await Promise.all(chunk.map(v => 
          newDynamoDB.send(new UpdateCommand({
            TableName: newTableName,
            Key: { PK: `MERCHANT#${merchantId}`, SK: `VARIANT#${v.variantId}` },
            // 🟢 FIX 2: Use ExpressionAttributeNames (#cp, #ua) to avoid reserved keyword errors
            UpdateExpression: 'SET #cp = :c, #set = :t, #ua = :t',
            ExpressionAttributeNames: {
              '#cp': 'costPrice',
              '#set': 'cogsSetAt',
              '#ua': 'updatedAt'
            },
            ExpressionAttributeValues: { 
              ':c': Number(v.costPrice), 
              ':t': timestamp 
            }
          }))
        ));
      }

      // 🟢 STEP 4: Update Profile to show Step 1 is done
      await newDynamoDB.send(new UpdateCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET #cc = :true, #ua = :t',
        ExpressionAttributeNames: {
          '#cc': 'cogsCompleted',
          '#ua': 'updatedAt'
        },
        ExpressionAttributeValues: { 
          ':true': true, 
          ':t': timestamp 
        }
      }));

      console.log(`✅ COGS saved and Profile updated for ${merchantId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Save COGS Error:', error.message);
      throw error;
    }
  }
}

module.exports = new ProductsService();