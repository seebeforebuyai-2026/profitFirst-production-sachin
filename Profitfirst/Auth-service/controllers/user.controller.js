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

      console.log(`📡 [API] Save Expenses request for: ${merchantId}`);

      // 1. Save expenses
      await dynamodbService.updateBusinessOverheads(merchantId, expenses);
      console.log("✅ [API] Overheads saved to Profile.");

      // 2. Fetch profile to check flags
      const profile = await dynamodbService.getUserProfile(merchantId);
      
      // 🟢 LOGGING: Check what the database actually says
      console.log("📊 [API] Current Flags:", {
        initialSyncCompleted: profile.data?.initialSyncCompleted,
        expensesCompleted: profile.data?.expensesCompleted
      });

      // 3. Trigger Sync logic
      if (profile.data?.initialSyncCompleted !== true) {
        console.log("🚀 [API] Triggering NEW Initial 1-Year Sync...");
        const syncService = require('../services/sync.service');
        await syncService.startInitialSync(merchantId);
      } else {
        console.log("🔄 [API] Sync already exists. Sending RECALCULATE message.");
      }

      res.json({ success: true, expensesCompleted: true });
    } catch (error) {
      // 🔴 CRITICAL: Log the actual error message!
      console.error(`❌ [API] updateBusinessExpenses FAILED:`, error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new UserController();