const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { newDynamoDB, newTableName } = require('../config/aws.config');

class DashboardService {
  /**
   * Aggregates daily SUMMARY records into a single dashboard response.
   * Follows the "Weighted Aggregation Rule" from Official Specification.
   */
  async getAggregatedSummary(merchantId, startDate, endDate) {
    try {

      let days = [];
      let lastKey = null;

       do {
        const result = await newDynamoDB.send(new QueryCommand({
          TableName: newTableName,
          KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':pk': `MERCHANT#${merchantId}`,
            ':start': `SUMMARY#${startDate}`,
            ':end': `SUMMARY#${endDate}`
          },
          ExclusiveStartKey: lastKey
        }));
        
        days.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
      // 2. Initialize the Aggregator with all fields from Section 1-8 of Spec
      const totals = {
        revenueGenerated: 0,
        revenueEarned: 0,
        netRevenue: 0,
        refunds: 0,
        cogs: 0,
        adsSpend: 0,
        shippingSpend: 0,
        rtoHandlingFees: 0,
        gatewayFees: 0,
        businessExpenses: 0,
        moneyKept: 0,
        totalOrders: 0,
        deliveredOrders: 0,
        rtoOrders: 0,
        cancelledOrders: 0,
        inTransitOrders: 0,
        rtoRevenueLost: 0
      };

      // 3. Sum the raw data (Rule: sum the numbers, never the percentages)
      days.forEach(day => {
        Object.keys(totals).forEach(key => {
          if (day[key] !== undefined) {
            totals[key] += Number(day[key] || 0);
          }
        });
      });

      // 4. Calculate Final Ratios based on the Sums (Enterprise Aggregation Rule)
      const finalNetRevenue = totals.revenueEarned - totals.refunds;
      
      // Profit Margin: (Money Kept / Net Revenue) * 100
      const profitMargin = finalNetRevenue > 0 
        ? (totals.moneyKept / finalNetRevenue) * 100 
        : 0;

      // ROAS: Revenue Generated / Ads Spend
      const roas = totals.adsSpend > 0 
        ? (totals.revenueGenerated / totals.adsSpend) 
        : 0;

      // POAS: Money Kept / Ads Spend
      const poas = totals.adsSpend > 0 
        ? (totals.moneyKept / totals.adsSpend) 
        : 0;

      // AOV: Revenue Generated / Total Orders (Spec Section 3)
      const aov = totals.totalOrders > 0 
        ? (totals.revenueGenerated / totals.totalOrders) 
        : 0;

      const profitPerOrder = totals.deliveredOrders > 0 
        ? (totals.moneyKept / totals.deliveredOrders) 
        : 0;

      const shippingPerOrder = totals.deliveredOrders > 0 
        ? (totals.shippingSpend / totals.deliveredOrders) 
        : 0;

      // 5. Pending Outcome Forecasting (Spec Section 6)
      const rtoRate = (totals.deliveredOrders + totals.rtoOrders) > 0 
        ? (totals.rtoOrders / (totals.deliveredOrders + totals.rtoOrders)) * 100 
        : 0;
      
      const successRate = 100 - rtoRate;
      const expectedDelivered = Math.round(totals.inTransitOrders * (successRate / 100));
      const expectedRevenue = expectedDelivered * aov;

      // 6. Top Products Calculation
      const topProducts = await this.calculateTopProducts(merchantId, startDate, endDate);

      return {
        success: true,
        summary: {
          ...totals,
          finalNetRevenue: Number(finalNetRevenue.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(2)),
          profitPerOrder: Number(profitPerOrder.toFixed(2)),
          shippingPerOrder: Number(shippingPerOrder.toFixed(2)),
          poasDecision: this.getPoasDecision(poas),
          rtoRate: Number(rtoRate.toFixed(2))
        },
        forecast: {
          successRate: Number(successRate.toFixed(2)),
          expectedDelivered,
          expectedRevenue: Number(expectedRevenue.toFixed(2)),
          riskLevel: rtoRate > 30 ? 'High Risk' : rtoRate > 15 ? 'Medium Risk' : 'Low Risk'
        },
        topProducts,
        chartData: days // Raw days for Recharts line/bar graphs
      };
    } catch (error) {
      console.error('❌ Dashboard Aggregator Error:', error);
      throw error;
    }
  }

  // Implementation of POAS Decision Logic (Spec Section 2)
  getPoasDecision(poas) {
    if (poas < 1.2) return "🚨 High Risk: Ad spend is eating your profit.";
    if (poas <= 2.5) return "✅ Sustainable: Ads are profitable. Monitor closely.";
    return "🚀 Scale Now: You are earning great profit per ad dollar!";
  }

  /**
   * Calculates Top 5 Products by delivered quantity.
   * Queries raw ORDER# records within the date range.
   */
 /**
   * 🟢 ISSUE 1 & 2 FIX: Paginated Top Products with correct status check
   */
  async calculateTopProducts(merchantId, start, end) {
    try {
      let allOrders = [];
      let lastKey = null;

      // 🔄 ISSUE 2: Pagination Loop to handle 10k+ orders
      do {
        const params = {
          TableName: newTableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          FilterExpression: 'orderCreatedAt BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':pk': `MERCHANT#${merchantId}`,
            ':sk': 'ORDER#',
            ':start': new Date(start).toISOString(),
            ':end': new Date(end).toISOString()
          },
          ExclusiveStartKey: lastKey
        };

        const result = await newDynamoDB.send(new QueryCommand(params));
        allOrders.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      const productMap = {};

      allOrders.forEach(order => {
        // 🟢 ISSUE 1: Only count if deliveryStatus is explicitly 'delivered'
        if (order.status === 'delivered' || order.deliveryStatus === 'delivered') {
          (order.lineItems || []).forEach(item => {
            const name = item.productName || item.title || "Unknown Product";
            if (!productMap[name]) {
              productMap[name] = { name, deliveredQty: 0, revenue: 0, cogs: 0 };
            }
            productMap[name].deliveredQty += (item.quantity || 0);
            productMap[name].revenue += ((item.price || 0) * (item.quantity || 0));
            productMap[name].cogs += ((item.cogsAtSale || 0) * (item.quantity || 0));
          });
        }
      });

      return Object.values(productMap)
        .map(p => ({ ...p, profit: p.revenue - p.cogs }))
        .sort((a, b) => b.deliveredQty - a.deliveredQty)
        .slice(0, 5);
    } catch (error) {
      console.error("Top Products Error:", error);
      return [];
    }
  }
}

module.exports = new DashboardService();