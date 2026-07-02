const { QueryCommand,GetCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");


class DashboardService {
  async getAggregatedSummary(merchantId, startDate, endDate) {
    try {

       const profileResult = await newDynamoDB.send(new GetCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${merchantId}`,
          SK: "PROFILE"
        }
      }));
      
      const profile = profileResult.Item || {};
      const staffSalary = Number(profile.staffSalary || 0);
      const officeRent = Number(profile.officeRent || 0);
      const agencyFees = Number(profile.agencyFees || 0);


      let days = [];
      let lastKey = null;

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

      const totals = {
        staffSalary: staffSalary,
        officeRent: officeRent,
        agencyFees: agencyFees,
        pastOrdersCount: 0,    
        currentOrdersCount: 0, 
        revenueGenerated: 0,
        revenueEarned: 0, 
        prepaidRevenue: 0, 
        codRevenue: 0,
        revenueFromPastOrders: 0, 
        revenueFromCurrentOrders: 0, 
        partialCodOrders: 0,
        partialPrepaidAmount: 0,
        partialCodAmount: 0,
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
        pickupPendingOrders: 0,
        ndrPendingOrders: 0,
        orphanShipmentsCount: 0,
        totalShipments: 0,
        inTransitOrders: 0,
        prepaidOrders: 0,
        codOrders: 0,
        rtoRevenueLost: 0,
        totalCost: 0,
      };

      // 3. Raw Summation logic
      days.forEach((day) => {
        Object.keys(totals).forEach((key) => {
          if (day[key] !== undefined) {
            totals[key] += Number(day[key] || 0);
          }
        });
      });

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

          const realaov = totals.deliveredOrders > 0
          ? totals.revenueEarned / totals.deliveredOrders
          : 0;

      const totalCost =
        totals.cogs +
        totals.adsSpend +
        totals.shippingSpend +
        totals.gatewayFees +
        totals.rtoHandlingFees +
        totals.businessExpenses;

      const contributionProfit =
        totals.revenueEarned -
        (totals.cogs +
          totals.adsSpend +
          totals.shippingSpend +
          totals.gatewayFees +
          totals.rtoHandlingFees);
      const contributionMargin =
        totals.revenueEarned > 0
          ? (contributionProfit / totals.revenueEarned) * 100
          : 0;


      const marginBeforeAds =
        totals.revenueEarned > 0
          ? (contributionProfit + totals.adsSpend) / totals.revenueEarned
          : 0;
      // const breakEvenROAS = marginBeforeAds > 0 ? 1 / marginBeforeAds : 0;
      const breakEvenROAS = 1 / contributionMargin * 100;

      // 5. PERIOD FORECASTING (Merchant Specific)
      const totalDecided = totals.deliveredOrders + totals.rtoOrders;
      const successRate =
        totalDecided > 0 ? (totals.deliveredOrders / totalDecided) * 100 : 80;
      const rtoRate = 100 - successRate;

      const expectedDelivered = Math.round(
        totals.inTransitOrders * (successRate / 100),
      );
      const expectedRevenue = expectedDelivered * aov;

      // 6. TOP PRODUCTS
      const topProducts = await this.calculateTopProducts(
        merchantId,
        startDate,
        endDate,
      );
      const contributionCost = totals.cogs + totals.shippingSpend + totals.gatewayFees + totals.rtoHandlingFees + totals.adsSpend;
      return {
        success: true,
        summary: {
          ...totals,
          // Rounding for Frontend
          profitMargin: Number(profitMargin.toFixed(2)),
          roas: Number(roas.toFixed(2)),
          poas: Number(poas.toFixed(2)),
          aov: Number(aov.toFixed(0)),
          realaov: Number(realaov.toFixed(0)),
          contributionProfit: Number(contributionProfit.toFixed(2)),
          contributionMargin: Number(contributionMargin.toFixed(2)),
          breakEvenROAS: Number(breakEvenROAS.toFixed(2)),
          contributionCost: Number(contributionCost.toFixed(2)),
          profitPerOrder:
            totals.deliveredOrders > 0
              ? Number((totals.moneyKept / totals.deliveredOrders).toFixed(0))
              : 0,
          shippingPerOrder:
            totals.deliveredOrders > 0
              ? Number(
                  (totals.shippingSpend / totals.deliveredOrders).toFixed(0),
                )
              : 0,
          poasDecision: this.getPoasDecision(poas),
          totalCost: Number(totalCost.toFixed(2)),
          rtoRate: Number(rtoRate.toFixed(2)),
        },
        moneyFlowData: [
          // { name: "Prepaid", value: totals.prepaidRevenue, type: "positive" },
          {name :"Shopify Generated / Gross Revenue  ", value: totals.revenueGenerated, type: "positive"},
          {
            name: "Revenue Earned",
            value: totals.revenueEarned,
            type: "positive",
          },

          { name: "COGS", value: -totals.cogs, type: "negative" },
          { name: "Ads", value: -totals.adsSpend, type: "negative" },
          { name: "Shipping", value: -totals.shippingSpend, type: "negative" },
          { name: "Gateway Fees", value: -totals.gatewayFees, type: "negative" },
          { name: "RTO Repacking Cost", value: -totals.rtoHandlingFees, type: "negative" },
          
          // {
          //   name: "Fees",
          //   value: -(totals.gatewayFees + totals.rtoHandlingFees),
          //   type: "negative",
          // },
          {
            name: "Business Expenses",
            value: -totals.businessExpenses,
            type: "negative",
          },
          {
  name: "Money Kept",
  value: totals.moneyKept,
  type: totals.moneyKept >= 0 ? "positive" : "negative",
},
        ],
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
        staffSalary,
        officeRent,
        agencyFees,
        
        revenueSourceBreakdown: {
          fromPastOrders: Number(totals.revenueFromPastOrders.toFixed(2)),
          fromCurrentOrders: Number(totals.revenueFromCurrentOrders.toFixed(2)),
          pastOrdersCount: totals.pastOrdersCount,       
          currentOrdersCount: totals.currentOrdersCount, 
          totalPrepaid: Number(totals.prepaidRevenue.toFixed(2)),
          totalCOD: Number(totals.codRevenue.toFixed(2)),
        },
        chartData: days
          .map((day) => ({
            ...day,
            date: day.SK?.replace("SUMMARY#", ""),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
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
      const lookbackStart = new Date(start);
      lookbackStart.setDate(lookbackStart.getDate() - 30);

      // Dashboard Range (IST Strings)
      const sDateIST = start;
      const eDateIST = end;

      let allPotentialOrders = [];
      let lastKey = null;

      do {
        const params = {
          TableName: newTableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          // Pichle 30 dino se lekar aaj tak ke saare orders uthao
          FilterExpression: "orderCreatedAt >= :lookback",
          ExpressionAttributeValues: {
            ":pk": `MERCHANT#${merchantId}`,
            ":sk": "ORDER#",
            ":lookback": lookbackStart.toISOString(),
          },
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const result = await newDynamoDB.send(new QueryCommand(params));
        allPotentialOrders.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      const productMap = {};

      allPotentialOrders.forEach((order) => {
        let isRealizedInPeriod = false;

        const pType = (order.paymentType || "").toUpperCase();

        // Case A: Prepaid / Partial — realized on order creation date
        if (
          (pType === "PREPAID" || pType === "PARTIAL_COD") &&
          order.orderCreatedAtIST >= sDateIST &&
          order.orderCreatedAtIST <= eDateIST
        ) {
          isRealizedInPeriod = true;
        }
        // Case B: COD — realized only on delivery
        else if (
          pType === "COD" &&
          order.deliveredAtIST &&
          order.deliveredAtIST >= sDateIST &&
          order.deliveredAtIST <= eDateIST
        ) {
          isRealizedInPeriod = true;
        }

        if (isRealizedInPeriod && !order.isCancelled) {
          (order.lineItems || []).forEach((item) => {
            const name = item.title || "Unknown Product";
            if (!productMap[name]) {
              productMap[name] = { name, deliveredQty: 0, revenue: 0, cogs: 0 };
            }
            productMap[name].deliveredQty += item.quantity || 0;
            productMap[name].revenue +=
              (Number(item.price) || 0) * (item.quantity || 0);
            productMap[name].cogs +=
              (Number(item.cogsAtSale) || 0) * (item.quantity || 0);
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
      console.error("Top Products Error:", error.message);
      return [];
    }
  }
}

module.exports = new DashboardService();