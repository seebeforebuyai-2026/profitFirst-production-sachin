const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const { format, subDays } = require("date-fns");
const dashboardService = require("../services/dashboard.service");

/**
 * 🛠️ TOOL 1: get_performance_summary
 * Use: AI ko trend dikhane ke liye (Day-by-Day data).
 */
const getPerformanceSummary = async (merchantId, days = 7) => {
    try {
        const endDate = format(new Date(), "yyyy-MM-dd");
        const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

        const params = {
            TableName: newTableName,
            KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
            ExpressionAttributeValues: {
                ":pk": `MERCHANT#${merchantId}`,
                ":start": `SUMMARY#${startDate}`,
                ":end": `SUMMARY#${endDate}`,
            }
        };

        const result = await newDynamoDB.send(new QueryCommand(params));
        const summaries = result.Items || [];

        if (summaries.length === 0) return "No data found. Sync might be in progress.";

        return JSON.stringify(summaries.map(s => ({
            date: s.date,
            revenue: s.revenueEarned,
            profit: s.moneyKept,
            ads: s.adsSpend,
            orders: s.totalOrders,
            rto: s.rtoOrders,
            margin: s.profitMargin + "%"
        })));
    } catch (error) {
        return "Error fetching performance data.";
    }
};

/**
 * 🛠️ TOOL 2: get_financial_summary
 * Use: Aggregated totals ke liye (e.g. "Total profit this month").
 */
const getFinancialSummary = async (merchantId, startDate, endDate) => {
    try {
        const result = await dashboardService.getAggregatedSummary(merchantId, startDate, endDate);
        if (!result.success) return "No financial records found.";

        const s = result.summary;
        return JSON.stringify({
            period: { from: startDate, to: endDate },
            revenue: { generated: s.revenueGenerated, earned: s.revenueEarned },
            costs: { ads: s.adsSpend, shipping: s.shippingSpend, cogs: s.cogs, overheads: s.businessExpenses },
            profitability: { net: s.moneyKept, margin: s.profitMargin + "%", adEfficiency: s.poasDecision },
            orders: { total: s.totalOrders, delivered: s.deliveredOrders, rtoRate: s.rtoRate + "%" }
        });
    } catch (error) {
        return "System error while fetching financial summary.";
    }
};

/**
 * 🛠️ TOOL 3: get_product_analytics
 * Use: Best/Worst selling products dhoondne ke liye.
 */
const getProductAnalytics = async (merchantId, startDate, endDate) => {
    try {
        const result = await dashboardService.calculateTopProducts(merchantId, startDate, endDate);
        if (!result || result.length === 0) return "No product data found.";
        return JSON.stringify(result);
    } catch (error) {
        return "Error fetching product analytics.";
    }
};

// 🟢 All tools exported together
module.exports = { 
    getPerformanceSummary, 
    getFinancialSummary, 
    getProductAnalytics 
};