const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');

class DashboardService {
  async getAggregatedSummary(merchantId, startDate, endDate) {
    try {
      // 1. Query all SUMMARY# records in range
      const result = await newDynamoDB.send(new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': `MERCHANT#${merchantId}`,
          ':start': `SUMMARY#${startDate}`,
          ':end': `SUMMARY#${endDate}`
        }
      }));
      const days = result.Items || [];

      // 2. Initialize Aggregator
      const totals = {
        revenueGenerated: 0, revenueEarned: 0, refunds: 0,
        cogs: 0, adsSpend: 0, shippingSpend: 0, rtoHandlingFees: 0,
        gatewayFees: 0, businessExpenses: 0, moneyKept: 0,
        totalOrders: 0, deliveredOrders: 0, rtoOrders: 0, 
        cancelledOrders: 0, inTransitOrders: 0, rtoRevenueLost: 0
      };

      // 3. Sum all raw values
      days.forEach(day => {
        Object.keys(totals).forEach(key => {
          if (totals[key] !== undefined) totals[key] += (day[key] || 0);
        });
      });

      // 4. 🟢 Weighted Calculations (Production Rule: Never sum percentages)
      const netRevenue = totals.revenueEarned - totals.refunds;
      const profitMargin = netRevenue > 0 ? (totals.moneyKept / netRevenue) * 100 : 0;
      const roas = totals.adsSpend > 0 ? (totals.revenueGenerated / totals.adsSpend) : 0;
      const poas = totals.adsSpend > 0 ? (totals.moneyKept / totals.adsSpend) : 0;
      const aov = totals.totalOrders > 0 ? (totals.revenueGenerated / totals.totalOrders) : 0;
      const rtoRate = (totals.deliveredOrders + totals.rtoOrders) > 0 
        ? (totals.rtoOrders / (totals.deliveredOrders + totals.rtoOrders)) * 100 : 0;
      
      const profitPerOrder = totals.deliveredOrders > 0 ? (totals.moneyKept / totals.deliveredOrders) : 0;
      const shippingPerOrder = totals.deliveredOrders > 0 ? (totals.shippingSpend / totals.deliveredOrders) : 0;

      // 5. 🔵 Logic Fix: Risk Level using Percentages (Issue 4)
      const successRate = 100 - rtoRate;
      const expectedDelivered = Math.round(totals.inTransitOrders * (successRate / 100));
      const expectedRevenue = expectedDelivered * aov;
      
      let riskLevel = "Low Risk";
      if (rtoRate > 30) riskLevel = "High Risk";
      else if (rtoRate > 15) riskLevel = "Medium Risk";

      // 6. 🟠 Top 5 Products (Actual Implementation - Issue 1)
      const topProducts = await this.calculateTopProducts(merchantId, startDate, endDate);

      return {
        success: true,
        summary: {
          ...totals,
          netRevenue, // 🟢 Fixed (Issue 5)
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(2)),
          rtoRate: Number(rtoRate.toFixed(2)), // 🟢 Fixed (Issue 3)
          profitPerOrder: Number(profitPerOrder.toFixed(2)), // 🟢 Fixed (Issue 2)
          shippingPerOrder: Number(shippingPerOrder.toFixed(2)), // 🟢 Fixed (Issue 2)
          poasDecision: this.getPoasDecision(poas)
        },
        forecast: {
          successRate: Number(successRate.toFixed(2)),
          expectedDelivered,
          expectedRevenue: Number(expectedRevenue.toFixed(2)),
          riskLevel
        },
        topProducts,
        chartData: days 
      };
    } catch (error) {
      console.error('Dashboard Service Error:', error);
      throw error;
    }
  }

  getPoasDecision(poas) {
    if (poas < 1.2) return "🚨 High Risk: Your ad spend is eating your profit.";
    if (poas <= 2.5) return "✅ Sustainable: Ads are profitable. Monitor closely.";
    return "🚀 Scale Now: You are earning great profit per ad dollar!";
  }

  /**
   * 🟢 Production Top Products Logic (Aggregates from raw ORDER# records)
   */
  async calculateTopProducts(merchantId, start, end) {
    try {
      // Query raw orders in the date range
      // Production Note: We use a FilterExpression on orderCreatedAt
      const params = {
        TableName: newTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'orderCreatedAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': `MERCHANT#${merchantId}`,
          ':sk': 'ORDER#',
          ':start': new Date(start).toISOString(),
          ':end': new Date(end).toISOString()
        }
      };

      const result = await newDynamoDB.send(new QueryCommand(params));
      const orders = result.Items || [];

      const productMap = {};

      orders.forEach(order => {
        // Only count products from delivered orders for profitability
        if (order.status === 'paid' || order.status === 'fulfilled') {
          (order.lineItems || []).forEach(item => {
            const name = item.title || "Unknown Product";
            if (!productMap[name]) {
              productMap[name] = { productName: name, qty: 0, revenue: 0, cogs: 0 };
            }
            productMap[name].qty += item.quantity;
            productMap[name].revenue += (item.price * item.quantity);
            productMap[name].cogs += (item.cogsAtSale * item.quantity);
          });
        }
      });

      // Sort by Quantity DESC and take top 5
      return Object.values(productMap)
        .map(p => ({
          ...p,
          profit: p.revenue - p.cogs
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    } catch (error) {
      console.error("Top Products Error:", error);
      return [];
    }
  }
}

module.exports = new DashboardService();