const dynamodbService = require('../services/dynamodb.service');
const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, sqsQueueUrl , newDynamoDB, newTableName} = require('../config/aws.config');
const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");


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
          staffSalary: data.staffSalary || 0,
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




  async getFullProfile(req, res) {
    try {
      const merchantId = req.user.userId; // From JWT Token

      // 🟢 Logic: Query all records for this merchant (PK = MERCHANT#ID)
      const result = await newDynamoDB.send(new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `MERCHANT#${merchantId}` }
      }));

      const items = result.Items || [];

      // 🟢 Logic: Segregate data into clean buckets for Frontend
      const profile = items.find(i => i.SK === "PROFILE") || {};
      const shopify = items.find(i => i.SK === "INTEGRATION#SHOPIFY") || {};
      const meta = items.find(i => i.SK === "INTEGRATION#META") || {};
      const shiprocket = items.find(i => i.SK === "INTEGRATION#SHIPROCKET") || {};

      // 🟢 Logic: Calculate Days Left for Meta/Shiprocket
      const getDaysLeft = (expiryDate) => {
        if (!expiryDate) return 0;
        const diff = new Date(expiryDate) - new Date();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      };

      res.status(200).json({
        success: true,
        basic: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          businessName: profile.businessName
        },
        shopify: {
          store: shopify.shopifyStore,
          status: shopify.status || 'inactive',
          connectedAt: shopify.connectedAt
        },
        meta: {
          adAccountId: meta.adAccountId,
          status: meta.status || 'inactive',
          daysLeft: getDaysLeft(meta.expiresAt),
          isExpired: new Date() > new Date(meta.expiresAt)
        },
        shiprocket: {
          email: shiprocket.email,
          status: shiprocket.status || 'inactive',
          daysLeft: getDaysLeft(shiprocket.expiresAt),
          connectedAt: shiprocket.connectedAt
        }
      });

    } catch (error) {
      console.error("❌ Full Profile Error:", error.message);
      res.status(500).json({ error: "Failed to fetch settings data" });
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