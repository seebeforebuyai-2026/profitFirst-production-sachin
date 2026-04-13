const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");

class DashboardService {
  /**
   * Aggregates daily SUMMARY# records into a single period response.
   * Rule: Sum the raw totals, then calculate ratios at the end.
   */
  async getAggregatedSummary(merchantId, startDate, endDate) {
    try {
      let days = [];
      let lastKey = null;

      // 1. Fetch all SUMMARY# records for the date range
      // SUMMARY#2026-03-01 to SUMMARY#2026-03-07
      do {
        const params = {
          TableName: newTableName,
          KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
          ExpressionAttributeValues: {
            ":pk": `MERCHANT#${merchantId}`,
            ":start": `SUMMARY#${startDate}`,
            ":end": `SUMMARY#${endDate}`,
          },
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;

        const result = await newDynamoDB.send(new QueryCommand(params));
        days.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      // 2. Initialize the Master Aggregator
      const totals = {
        revenueGenerated: 0,
        revenueEarned: 0,
        cogs: 0,
        adsSpend: 0,
        shippingSpend: 0,
        gatewayFees: 0,
        rtoHandlingFees: 0,
        businessExpenses: 0,
        moneyKept: 0,
        totalOrders: 0,
        deliveredOrders: 0,
        rtoOrders: 0,
        cancelledOrders: 0,
        inTransitOrders: 0,
        prepaidOrders: 0,
        codOrders: 0,
        rtoRevenueLost: 0,
      };

      // 3. Raw Summation of all days
      days.forEach((day) => {
        Object.keys(totals).forEach((key) => {
          if (day[key] !== undefined) {
            totals[key] += Number(day[key] || 0);
          }
        });
      });

      // 4. WEIGHTED RATIO CALCULATIONS (Crucial for Accuracy)
      // We calculate these based on the SUMMED totals, not average of daily averages.
      const profitMargin =
        totals.revenueEarned > 0
          ? (totals.moneyKept / totals.revenueEarned) * 100
          : 0;
      const roas =
        totals.adsSpend > 0 ? totals.revenueGenerated / totals.adsSpend : 0;
      const poas = totals.adsSpend > 0 ? totals.moneyKept / totals.adsSpend : 0;
      const aov =
        totals.totalOrders > 0
          ? totals.revenueGenerated / totals.totalOrders
          : 0;
      const profitPerOrder =
        totals.deliveredOrders > 0
          ? totals.moneyKept / totals.deliveredOrders
          : 0;
      const shippingPerOrder =
        totals.deliveredOrders > 0
          ? totals.shippingSpend / totals.deliveredOrders
          : 0;

      // 5. PERIOD FORECASTING (Merchant Specific)
      const totalDecided = totals.deliveredOrders + totals.rtoOrders;
      const successRate =
        totalDecided > 0 ? (totals.deliveredOrders / totalDecided) * 100 : 0;
      const rtoRate = 100 - successRate;
      const totalCost =
        totals.cogs +
        totals.adsSpend +
        totals.shippingSpend +
        totals.gatewayFees +
        totals.rtoHandlingFees +
        totals.businessExpenses;
      // Expected realization from currently in-transit orders
      const expectedDelivered = Math.round(
        totals.inTransitOrders * (successRate / 100),
      );
      const expectedRevenue = expectedDelivered * aov;

      // 6. TOP PRODUCTS (Delivered Only Profitability)
      const topProducts = await this.calculateTopProducts(
        merchantId,
        startDate,
        endDate,
      );

      // 7. BUILD MONEY FLOW DATA (For Recharts in Frontend)
      const moneyFlowData = [
        {
          name: "Revenue",
          value: Number(totals.revenueEarned.toFixed(0)),
          type: "positive",
        },
        {
          name: "COGS",
          value: -Number(totals.cogs.toFixed(0)),
          type: "negative",
        },
        {
          name: "Marketing",
          value: -Number(totals.adsSpend.toFixed(0)),
          type: "negative",
        },
        {
          name: "Shipping",
          value: -Number(totals.shippingSpend.toFixed(0)),
          type: "negative",
        },
        {
          name: "Expenses/Fees",
          value: -Number(
            (
              totals.businessExpenses +
              totals.gatewayFees +
              totals.rtoHandlingFees
            ).toFixed(0),
          ),
          type: "negative",
        },
        {
          name: "Net Profit",
          value: Number(totals.moneyKept.toFixed(0)),
          type: "positive",
        },
      ];

      return {
        success: true,
        summary: {
          ...totals,
          // Rounding for UI
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(0)),
          profitPerOrder: Number(profitPerOrder.toFixed(0)),
          shippingPerOrder: Number(shippingPerOrder.toFixed(0)),
          poasDecision: this.getPoasDecision(poas),
          totalCost: Number(totalCost.toFixed(2)),
          rtoRate: Number(rtoRate.toFixed(2)),
        },
        forecast: {
          successRate: Number(successRate.toFixed(2)),
          inTransit: totals.inTransitOrders,
          expectedDelivered,
          expectedRevenue: Number(expectedRevenue.toFixed(0)),
          riskLevel:
            rtoRate > 30
              ? "High Risk"
              : rtoRate > 15
                ? "Medium Risk"
                : "Low Risk",
        },
        topProducts,
        moneyFlowData, // Simplified for Recharts
        chartData: days.sort((a, b) => a.date.localeCompare(b.date)), // Sorted for the chart
      };
    } catch (error) {
      console.error("❌ Dashboard Aggregator Error:", error.message);
      throw error;
    }
  }

  getPoasDecision(poas) {
    if (poas < 1.2) return "🚨 High Risk: Ad spend is eating your profit.";
    if (poas <= 2.5)
      return "✅ Sustainable: Ads are profitable. Monitor closely.";
    return "🚀 Scale Now: You earn great profit for every ad dollar spent!";
  }

  async calculateTopProducts(merchantId, start, end) {
    try {
      const sDate = new Date(start);
      sDate.setUTCHours(0, 0, 0, 0);

      const eDate = new Date(end);
      eDate.setUTCHours(23, 59, 59, 999);
      let allOrders = [];
      let lastKey = null;

      // Important: Filtering ORDER# records to find best sellers in the period
      do {
        const params = {
          TableName: newTableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          // Note: Filtering by orderCreatedAt ensures we look at this period's sales
          FilterExpression: "orderCreatedAt BETWEEN :start AND :end",
          ExpressionAttributeValues: {
            ":pk": `MERCHANT#${merchantId}`,
            ":sk": "ORDER#",
            ":start": sDate.toISOString(),
            ":end": eDate.toISOString(),
          },
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;

        const result = await newDynamoDB.send(new QueryCommand(params));
        allOrders.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      const productMap = {};

      allOrders.forEach((order) => {
        // Logic: Only delivered orders should show up in "Product Profitability"
        // This matches the Dashboard's "Actual Money" logic.
        // We assume Summary Worker has already updated individual order status where possible.
        if (order.status !== "cancelled") {
          (order.lineItems || []).forEach((item) => {
            const name = item.productName || "Unknown Product";
            if (!productMap[name]) {
              productMap[name] = { name, deliveredQty: 0, revenue: 0, cogs: 0 };
            }
            productMap[name].deliveredQty += item.quantity || 0;
            productMap[name].revenue +=
              (item.price || 0) * (item.quantity || 0);
            productMap[name].cogs +=
              (item.cogsAtSale || 0) * (item.quantity || 0);
          });
        }
      });

      return Object.values(productMap)
        .map((p) => ({
          ...p,
          profit: Number((p.revenue - p.cogs).toFixed(0)),
          revenue: Number(p.revenue.toFixed(0)),
          cogs: Number(p.cogs.toFixed(0)),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    } catch (error) {
      console.error("Top Products Calculation Error:", error.message);
      return [];
    }
  }
}

module.exports = new DashboardService();
