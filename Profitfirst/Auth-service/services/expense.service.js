const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName, sqsClient, sqsQueueUrl } = require('../config/aws.config');
const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

class ExpenseService {
  /**
   * Adds a new business expense and triggers a summary recalculation
   */
  async addExpense(merchantId, expenseData) {
    try {
      const expenseId = uuidv4().split('-')[0];
      const timestamp = new Date().toISOString();

      const item = {
        PK: `MERCHANT#${merchantId}`,
        SK: `EXPENSE#${expenseData.date}#${expenseId}`,
        entityType: 'EXPENSE',
        expenseId: expenseId,
        date: expenseData.date, // YYYY-MM-DD
        category: expenseData.category, // e.g., 'staff_salary'
        amount: Number(expenseData.amount),
        description: expenseData.description || '',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: item
      }));

      // 🟢 PRODUCTION RULE: Whenever an expense is added, 
      // we must tell the Summary Calculator to re-run for that date.
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: sqsQueueUrl,
        MessageBody: JSON.stringify({
          type: 'SUMMARY_CALC',
          merchantId: merchantId
        })
      }));

      return { success: true, data: item };
    } catch (error) {
      console.error('Add Expense Error:', error);
      throw error;
    }
  }

  async getExpenses(merchantId, startDate, endDate) {
    const result = await newDynamoDB.send(new QueryCommand({
      TableName: newTableName,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': `MERCHANT#${merchantId}`,
        ':start': `EXPENSE#${startDate}`,
        ':end': `EXPENSE#${endDate}`
      }
    }));
    return { success: true, data: result.Items || [] };
  }
}

module.exports = new ExpenseService();