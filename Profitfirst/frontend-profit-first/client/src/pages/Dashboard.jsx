import React, { useState, useEffect, useMemo, useCallback } from "react";
import axiosInstance from "../../axios";
import { format, parseISO } from "date-fns";
import { FiRefreshCw, FiAlertCircle } from "react-icons/fi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import DateRangeSelector from "../components/DateRangeSelector";
import { PulseLoader } from "react-spinners";
import { toast } from "react-toastify";
// 🟢 Reusable Metric Card (Design Optimized for Production Data)
const MetricCard = ({
  title,
  value,
  subtitle,
  formula,
  color = "text-white",
}) => (
  <div className="group relative bg-[#161616] p-4 rounded-2xl border border-gray-800 hover:border-green-500/30 transition-all shadow-sm">
    {formula && (
      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-800 text-[10px] text-gray-200 py-1.5 px-3 rounded-lg border border-gray-700 z-50 shadow-2xl">
        {formula}
      </div>
    )}
    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
      {title}
    </div>
    <div className={`text-xl font-black ${color} mb-0.5 truncate`}>{value}</div>
    {subtitle && (
      <div className="text-[9px] text-gray-500 italic truncate">{subtitle}</div>
    )}
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showDateSelector, setShowDateSelector] = useState(false);

  // Default range: Last 30 Days
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
    endDate: new Date(),
    from: format(
      new Date(new Date().setDate(new Date().getDate() - 30)),
      "yyyy-MM-dd",
    ),
    to: format(new Date(), "yyyy-MM-dd"),
    label: "Last 30 days",
  });

  const fetchDashboardData = useCallback(
    async (isFirstLoad = false) => {
      if (isFirstLoad) setIsLoading(true);
      else setIsRefreshing(true);

      setError(null);
      try {
        // Fetching real-time aggregated summary from backend
        const response = await axiosInstance.get("/dashboard/summary", {
          params: { from: dateRange.from, to: dateRange.to },
        });
        setData(response.data);
      } catch (err) {
        console.error("Dashboard API Error:", err);
        setError("Financial Data Engine Offline. Please check your workers.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [dateRange.from, dateRange.to],
  );

  const handleForceSync = async () => {
    setIsRefreshing(true);
    try {
      const res = await axiosInstance.post("/sync/manual"); // Trigger the controller we built
      if (res.data.success) {
        toast.info("🔄 Sync started in background. Refreshing charts soon...");
        // Auto-refresh data after 10 seconds to show changes
        setTimeout(() => fetchDashboardData(), 10000);
      }
    } catch (err) {
      toast.error("Failed to trigger sync.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(data === null);
  }, [fetchDashboardData]);

  // 🟢 Real Data Chart Mapping
  const formattedChartData = useMemo(() => {
    if (!data?.chartData) return [];
    return data.chartData.map((day) => ({
      name: format(parseISO(day.date), "MMM dd"),
      netProfit: Number(day.moneyKept || 0), // Truth from Summary Table
    }));
  }, [data]);

  // 🟢 Real Money Flow Mapping
  const moneyFlowData = useMemo(() => {
    if (!data?.moneyFlowData) return [];
    return data.moneyFlowData; // Direct waterfall array from Dashboard Service
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] gap-4">
        <PulseLoader size={12} color="#22c55e" />
        <p className="text-green-500 text-xs font-bold tracking-widest animate-pulse uppercase">
          Syncing Financial Truth...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] p-6 text-center">
        <FiAlertCircle className="text-red-500 size-12 mb-4" />
        <h2 className="text-white text-xl font-bold mb-2">
          Sync Connection Lost
        </h2>
        <p className="text-gray-400 max-w-md mb-6">{error}</p>
        <button
          onClick={() => fetchDashboardData(true)}
          className="px-8 py-3 bg-white text-black font-black rounded-xl hover:scale-105 transition-all"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!data?.summary) return null;

  const { summary, forecast, topProducts } = data;

  return (
    <div className="p-4 lg:p-8 space-y-10 animate-in fade-in duration-1000 min-h-screen relative">
      {isRefreshing && (
        <div className="fixed top-6 right-6 z-[200] bg-green-500 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg shadow-green-500/20">
          <PulseLoader size={4} color="#000" />
          <span className="text-[10px] font-black text-black uppercase">
            Refreshing Data
          </span>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter">
            Financial Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboardData()}
            className="p-3 bg-[#161616] border border-gray-800 rounded-xl text-gray-400 hover:text-green-500 transition-all"
          >
            <FiRefreshCw
              size={18}
              className={isRefreshing ? "animate-spin" : ""}
            />
          </button>

          <button
            onClick={handleForceSync}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-black font-bold rounded-lg hover:bg-green-400 transition-all"
          >
            <FiRefreshCw className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Syncing..." : "Sync Now"}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowDateSelector(!showDateSelector)}
              className="flex items-center gap-3 px-5 py-3 bg-[#161616] border border-gray-800 rounded-xl hover:border-gray-600 transition-all text-sm font-bold text-white shadow-2xl"
            >
              {dateRange.label}
            </button>
            {showDateSelector && (
              <div className="absolute right-0 mt-3 z-[200]">
                <DateRangeSelector
                  initialRange={dateRange}
                  onApply={(range) => {
                    setDateRange(range);
                    setShowDateSelector(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: ACTUAL MONEY (Bank Statement Level Data) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          Actual Money
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Revenue Generated"
            value={`₹${summary.revenueGenerated.toLocaleString()}`}
            formula="Total Order Value - Discounts (Non-Cancelled)"
          />
          <MetricCard
            title="Revenue Earned"
            value={`₹${summary.revenueEarned.toLocaleString()}`}
            formula="Net Revenue of DELIVERED orders only"
          />
          <MetricCard
            title="Total COGS"
            value={`₹${summary.cogs.toLocaleString()}`}
            formula="Sum of variant costs (at sale time) for delivered qty"
          />
          <MetricCard
            title="Total Cost"
            value={`₹${(summary.totalCost || 0).toLocaleString()}`} // 🟢 Backend Truth
            formula="COGS + Ads + Shipping + Fees + Overheads"
            color="text-red-400"
          />
          <MetricCard
            title="Money Kept"
            value={`₹${summary.moneyKept.toLocaleString()}`}
            formula="Net Profit after Revenue - Costs - Leaks"
            color="text-green-400"
          />
          <MetricCard
            title="Profit Margin"
            value={`${summary.profitMargin}%`}
            color={
              summary.profitMargin > 15 ? "text-green-400" : "text-yellow-500"
            }
            formula="Profitability Efficiency (Money Kept / Revenue Earned)"
          />
        </div>
      </section>

      {/* SECTION 2: ADS PERFORMANCE (Meta Truth) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          Ads Performance
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Ads Spend"
            value={`₹${summary.adsSpend.toLocaleString()}`}
            subtitle="Direct from Meta API"
          />
          <MetricCard
            title="ROAS"
            value={summary.roas}
            formula="Revenue Generated / Ads Spend"
          />
          <MetricCard
            title="POAS"
            value={summary.poas}
            formula="Money Kept / Ads Spend"
          />
          <div className="bg-green-500/5 border border-green-500/10 p-5 rounded-2xl flex flex-col justify-center">
            <span className="text-[9px] font-black text-green-500 uppercase mb-1 tracking-widest">
              Growth Decision
            </span>
            <div className="text-xs font-bold text-green-400 italic">
              "{summary.poasDecision}"
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: ORDER ECONOMICS (Linked Shopify & Shiprocket Truths) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          Order Economics
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Orders"
            value={summary.totalOrders}
            subtitle="Non-Test / Non-Cancelled"
          />
          <MetricCard
            title="Delivered Orders"
            value={summary.deliveredOrders}
            subtitle="Confirmed by Shiprocket"
          />
          <MetricCard
            title="RTO Count"
            value={summary.rtoOrders}
            subtitle="Returned to Origin"
          />
          <MetricCard
            title="Cancelled"
            value={summary.cancelledOrders}
            subtitle="Cancelled via Shopify"
          />
          <MetricCard
            title="Prepaid Orders"
            value={summary.prepaidOrders}
            subtitle="Payment method matching"
          />
          <MetricCard
            title="AOV"
            value={`₹${summary.aov.toLocaleString()}`}
            subtitle="Generated Revenue / Total Orders"
          />
          <MetricCard
            title="Profit Per Order"
            value={`₹${summary.profitPerOrder.toLocaleString()}`}
            subtitle="Money Kept / Delivered"
          />
          <MetricCard
            title="Shipping / Order"
            value={`₹${summary.shippingPerOrder.toLocaleString()}`}
            subtitle="Total Shipping / Delivered"
          />
        </div>
      </section>

      {/* SECTION 4: PRODUCT PROFITABILITY (Top 5 Sellers) */}
      <div className="lg:col-span-2 bg-[#161616] overflow-hidden shadow-2xl rounded-2xl border border-gray-800">
        <div className="px-8 py-6">
          <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
            Product Profitability
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#111] text-[#6b7280] uppercase text-[11px] tracking-wider">
            <tr>
              <th className="px-8 py-4 text-left">Product</th>
              <th className="px-8 py-4 text-center">Delivered Qty</th>
              <th className="px-8 py-4 text-right">Revenue</th>
              <th className="px-8 py-4 text-right">COGS</th>
              <th className="px-8 py-4 text-right">Gross Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f2937]">
            {topProducts.length > 0 ? (
              topProducts.map((product, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-[#111827]/50 transition-all duration-200"
                >
                  <td className="px-8 py-5 text-[#e5e7eb] font-medium">
                    {product.name}
                  </td>
                  <td className="px-8 py-5 text-center text-[#9ca3af] font-mono">
                    {product.deliveredQty}
                  </td>
                  <td className="px-8 py-5 text-right text-[#e5e7eb] font-mono">
                    ₹{product.revenue.toLocaleString()}
                  </td>
                  <td className="px-8 py-5 text-right text-[#9ca3af] font-mono">
                    ₹{product.cogs.toLocaleString()}
                  </td>
                  <td className="px-8 py-5 text-right text-[#22c55e] font-semibold font-mono">
                    ₹{product.profit.toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="5"
                  className="py-10 text-center text-[#6b7280] italic"
                >
                  No product data available for this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* SECTION 5: COST LEAKAGE (Where the money goes) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          Cost Leakage
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Shipping Spent"
            value={`₹${summary.shippingSpend.toLocaleString()}`}
            formula="Total Forward + Return Freight Charges"
          />
          <MetricCard
            title="RTO Handling"
            value={`₹${summary.rtoHandlingFees.toLocaleString()}`}
            subtitle="Merchant defined RTO per order fee"
          />
          <MetricCard
            title="Gateway Fees"
            value={`₹${summary.gatewayFees.toLocaleString()}`}
            subtitle="Processing Fees (Prepaid Delivered Only)"
          />
          <MetricCard
            title="Fixed Costs"
            value={`₹${summary.businessExpenses.toLocaleString()}`}
            subtitle="Monthly Overheads divided by 30"
          />
          <MetricCard
            title="RTO Revenue Lost"
            value={`₹${summary.rtoRevenueLost.toLocaleString()}`}
            subtitle="Potential Sales value lost to RTO"
          />
        </div>
      </section>

      {/* SECTION 6: PENDING OUTCOME (Financial Forecast) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          Pending Outcome / Money
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="In-Transit Orders"
            value={forecast.inTransit}
            subtitle="Currently with carrier"
          />
          <MetricCard
            title="Expected Delivery"
            value={forecast.expectedDelivered}
            subtitle={`${forecast.successRate}% Real Success Rate`}
          />
          <MetricCard
            title="Expected Revenue"
            value={`₹${forecast.expectedRevenue.toLocaleString()}`}
            formula="Estimated realization from in-transit"
          />
          <MetricCard
            title="Risk Level"
            value={forecast.riskLevel}
            color={
              forecast.riskLevel === "Low Risk"
                ? "text-green-400"
                : "text-red-400"
            }
          />
        </div>
      </section>

      {/* SECTION 7: DAILY PROFIT TREND CHART */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-3xl border border-gray-800 p-8 shadow-3xl">
        <h3 className="text-xl font-black text-white mb-1 tracking-tight">
          Daily Profit Status
        </h3>
        <p className="text-sm text-gray-400 mb-8">
          Dynamic profitability based on your IST business day.
        </p>
        <div className="h-96 bg-[#0D1D1E]/50 rounded-2xl p-4 border border-gray-800/50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedChartData}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#12EB8E" />
                  <stop offset="100%" stopColor="#0A9F6E" />
                </linearGradient>
                <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="#1F2937"
                vertical={false}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="name"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`)}
              />
              <Tooltip
                cursor={{ fill: "#22c55e10" }}
                formatter={(v) => `₹${v.toLocaleString("en-IN")}`}
                contentStyle={{
                  backgroundColor: "#dbd8d8ff",
                  border: "1px solid #333",
                  borderRadius: "12px",
                }}
              />
              <ReferenceLine y={0} stroke="#4B5563" />
              <Bar dataKey="netProfit" radius={[4, 4, 0, 0]}>
                {formattedChartData.map((item, i) => (
                  <Cell
                    key={i}
                    fill={
                      item.netProfit >= 0
                        ? "url(#profitGradient)"
                        : "url(#lossGradient)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 8: MONEY FLOW (Waterfall Representation) */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-3xl border border-gray-800 p-8 shadow-3xl">
        <h3 className="text-xl font-black text-white mb-1 tracking-tight">
          Revenue Breakdown
        </h3>
        <p className="text-sm text-gray-400 mb-8">
          How your Revenue Earned is distributed across costs.
        </p>
        <div className="h-96 bg-[#0D1D1E]/50 rounded-2xl p-4 border border-gray-800/50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moneyFlowData}>
              <defs>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#12EB8E" />
                  <stop offset="100%" stopColor="#0A9F6E" />
                </linearGradient>
                <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="#1F2937"
                vertical={false}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="name"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${Math.abs(v / 1000)}k`}
              />
              <Tooltip
                cursor={{ fill: "transparent" }}
                formatter={(v) => `₹${Math.abs(v).toLocaleString("en-IN")}`}
                contentStyle={{
                  backgroundColor: "#dbdadaff",
                  border: "1px solid #333",
                  borderRadius: "12px",
                }}
              />
              <ReferenceLine y={0} stroke="#4B5563" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {moneyFlowData.map((item, i) => (
                  <Cell
                    key={i}
                    fill={
                      item.type === "positive"
                        ? "url(#greenGrad)"
                        : "url(#redGrad)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-6 mt-8">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-gray-400 text-xs font-bold uppercase">
              Cash In
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-gray-400 text-xs font-bold uppercase">
              Cash Out
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
