const dynamodbService = require('../services/dynamodb.service');
const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, sqsQueueUrl } = require('../config/aws.config');

class UserController {
  /**
   * 🟢 GET /api/user/business-expenses
   * Fetches the current overheads from the PROFILE record.
   */
  async getBusinessExpenses(req, res) {
    try {
      const merchantId = req.user.userId;
      
      // We use our existing getUserProfile method
      const result = await dynamodbService.getUserProfile(merchantId);
      
      if (!result.success) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Return only the expense fields or defaults
      const data = result.data;
      res.json({
        success: true,
        expenses: {
          agencyFees: data.agencyFees || 0,
          staffFees: data.staffFees || 0,
          officeRent: data.officeRent || 0,
          otherExpenses: data.otherExpenses || 0,
          rtoHandlingFees: data.rtoHandlingFees || 0,
          paymentGatewayFeePercent: data.paymentGatewayFeePercent || 2.5,
          expensesCompleted: data.expensesCompleted || false
        }
      });
    } catch (error) {
      console.error('Get Expenses Error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * 🟢 POST /api/user/business-expenses
   * Saves overheads to PROFILE and triggers the Summary Engine.
   */
  async updateBusinessExpenses(req, res) {
    try {
      const merchantId = req.user.userId;
      const { expenses } = req.body;

      if (!expenses) {
        return res.status(400).json({ error: "Expense data is required" });
      }

      // 1. Save to DynamoDB Service (The function you added in Step 1)
      await dynamodbService.updateBusinessOverheads(merchantId, expenses);

       const syncService = require('../services/sync.service');
      await syncService.startInitialSync(merchantId);
     

       res.json({
        success: true,
        message: "Final setup complete. Your dashboard is now syncing!",
        expensesCompleted: true
      });

    } catch (error) {
      console.error('Update Expenses Error:', error);
      res.status(500).json({ error: "Failed to save expenses" });
    }
  }
}

module.exports = new UserController();