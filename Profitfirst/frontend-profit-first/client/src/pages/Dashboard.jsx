import React, { useState, useEffect, useMemo, useCallback } from "react";
import axiosInstance from "../../axios";
import { format, parseISO } from "date-fns";
import { FiRefreshCw, FiAlertCircle, FiTrendingUp, FiDollarSign, FiTruck, FiActivity } from "react-icons/fi";
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

// 🟢 Reusable Metric Card - Improved for High Density
const MetricCard = ({ title, value, subtitle, formula, color = "text-white" }) => (
  <div className="group relative bg-[#161616] p-4 rounded-2xl border border-gray-800 hover:border-green-500/30 transition-all shadow-sm">
    {formula && (
      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-800 text-[10px] text-gray-200 py-1.5 px-3 rounded-lg border border-gray-700 z-50 shadow-2xl">
        {formula}
      </div>
    )}
    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{title}</div>
    <div className={`text-xl font-black ${color} mb-0.5 truncate`}>{value}</div>
    {subtitle && <div className="text-[9px] text-gray-500 italic truncate">{subtitle}</div>}
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // 🟢 Handle silent updates
  const [error, setError] = useState(null);
  const [showDateSelector, setShowDateSelector] = useState(false);

  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
    endDate: new Date(),
    from: format(new Date(new Date().setDate(new Date().getDate() - 30)), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
    label: "Last 30 days"
  });

  const fetchDashboardData = useCallback(async (isFirstLoad = false) => {
    if (isFirstLoad) setIsLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    try {
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
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchDashboardData(data === null);
  }, [fetchDashboardData]);

  // 🟢 Format chart dates for readability (Issue 5)
  const formattedChartData = useMemo(() => {
    if (!data?.chartData) return [];
    return data.chartData.map(day => ({
      ...day,
      displayDate: format(parseISO(day.date), "MMM dd")
    }));
  }, [data]);

  const moneyFlowData = useMemo(() => {
    if (!data?.summary) return [];
    const s = data.summary;
    return [
      { name: "Revenue", value: s.revenueEarned, color: "#22c55e" },
      { name: "COGS", value: -s.cogs, color: "#ef4444" },
      { name: "Ads", value: -s.adsSpend, color: "#ef4444" },
      { name: "Shipping", value: -s.shippingSpend, color: "#ef4444" },
      { name: "Fees/RTO", value: -(s.gatewayFees + (s.rtoHandlingFees || 0)), color: "#f97316" },
      { name: "Expenses", value: -s.businessExpenses, color: "#6366f1" },
      { name: "Net Profit", value: s.moneyKept, color: "#10b981" }
    ];
  }, [data]);

  // 🟢 ISSUE 1 FIX: Safety Guard
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] gap-4">
        <PulseLoader size={12} color="#22c55e" />
        <p className="text-green-500 text-xs font-bold tracking-widest animate-pulse uppercase">Syncing Financial Truth...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] p-6 text-center">
        <FiAlertCircle className="text-red-500 size-12 mb-4" />
        <h2 className="text-white text-xl font-bold mb-2">Sync Connection Lost</h2>
        <p className="text-gray-400 max-w-md mb-6">{error}</p>
        <button onClick={() => fetchDashboardData(true)} className="px-8 py-3 bg-white text-black font-black rounded-xl hover:scale-105 transition-all">Retry Connection</button>
      </div>
    );
  }

  if (!data?.summary) return null;

  const { summary, forecast, topProducts } = data;

  return (
    <div className="p-4 lg:p-8 space-y-10 animate-in fade-in duration-1000 bg-[#0D1D1E] min-h-screen relative">
      
      {/* 🟢 Silent Refresh Indicator (Issue 4) */}
      {isRefreshing && (
        <div className="fixed top-6 right-6 z-[200] bg-green-500 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg shadow-green-500/20">
          <PulseLoader size={4} color="#000" />
          <span className="text-[10px] font-black text-black uppercase">Refreshing Data</span>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter">Dashboard</h1>
          <p className="text-gray-500 text-sm">Aggregated results for {dateRange.label}</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => fetchDashboardData()} className="p-3 bg-[#161616] border border-gray-800 rounded-xl text-gray-400 hover:text-green-500 transition-all">
            <FiRefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowDateSelector(!showDateSelector)}
              className="flex items-center gap-3 px-5 py-3 bg-[#161616] border border-gray-800 rounded-xl hover:border-gray-600 transition-all text-sm font-bold text-white shadow-2xl"
            >
              📅 {dateRange.label}
            </button>
            {showDateSelector && (
              <div className="absolute right-0 mt-3 z-[200]">
                <DateRangeSelector 
                  initialRange={dateRange} 
                  onApply={(range) => { setDateRange(range); setShowDateSelector(false); }} 
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: FINANCIAL ENGINE (Bank Level) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
          <FiDollarSign className="text-green-500" /> Financial Engine
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Revenue Generated" value={`₹${summary.revenueGenerated.toLocaleString()}`} formula="Total Shopify Sales (Inc. Unfulfilled)" />
          <MetricCard title="Revenue Earned" value={`₹${summary.revenueEarned.toLocaleString()}`} color="text-green-400" formula="Realized Cash from Delivered Orders" />
          <MetricCard title="Total COGS" value={`₹${summary.cogs.toLocaleString()}`} color="text-red-400" formula="Delivered Qty * Frozen Sale Cost" />
          <MetricCard title="Money Kept" value={`₹${summary.moneyKept.toLocaleString()}`} color="text-emerald-400" formula="Final Net Profit after ALL leakage" />
          <MetricCard title="Net Margin" value={`${summary.profitMargin}%`} color={summary.profitMargin > 15 ? "text-green-400" : "text-yellow-500"} formula="Profitability Efficiency" />
        </div>
      </section>

      {/* SECTION 2: ORDER ECONOMICS (Operational) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
          <FiActivity className="text-blue-500" /> Order Economics
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="AOV" value={`₹${summary.aov.toLocaleString()}`} subtitle="Revenue Per Total Orders" />
          <MetricCard title="Profit Per Order" value={`₹${summary.profitPerOrder.toLocaleString()}`} color="text-green-400" subtitle="Net Profit / Delivered" />
          <MetricCard title="RTO Count" value={summary.rtoOrders} color="text-red-400" subtitle={`${summary.rtoRate}% RTO Rate (Last 30 days)`} />
          <MetricCard title="Delivered Orders" value={summary.deliveredOrders} subtitle={`${summary.totalOrders} total orders placed`} />
        </div>
      </section>

      {/* SECTION 3: COST LEAKAGE (The Profit Killers) */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
          <FiAlertCircle className="text-red-500" /> Cost Leakage
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Shipping Spent" value={`₹${summary.shippingSpend.toLocaleString()}`} formula="Total Freight (Inc. RTO Return)" />
          <MetricCard title="Gateway Fees" value={`₹${summary.gatewayFees.toLocaleString()}`} subtitle="Processing Cost" />
          <MetricCard title="RTO Handling" value={`₹${summary.rtoHandlingFees.toLocaleString()}`} subtitle="Manual RTO Losses" />
          <MetricCard title="Fixed Costs" value={`₹${summary.businessExpenses.toLocaleString()}`} subtitle="Monthly Overheads" />
          <MetricCard title="RTO Revenue Lost" value={`₹${summary.rtoRevenueLost.toLocaleString()}`} color="text-orange-400" subtitle="Lost potential sales" />
        </div>
      </section>

      {/* SECTION 4: ADS PERFORMANCE */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
          <FiTrendingUp className="text-purple-500" /> Marketing Metrics
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <MetricCard title="Meta Spend" value={`₹${summary.adsSpend.toLocaleString()}`} />
          <MetricCard title="ROAS" value={summary.roas} formula="Generated / Ads Spend" />
          <MetricCard title="POAS" value={summary.poas} color="text-yellow-400" formula="Money Kept / Ads Spend" />
          <div className="bg-green-500/5 border border-green-500/10 p-5 rounded-2xl flex flex-col justify-center">
            <span className="text-[9px] font-black text-green-500 uppercase mb-1">AI Scaling Insight</span>
            <div className="text-xs font-bold text-green-400 italic">"{summary.poasDecision}"</div>
          </div>
        </div>
      </section>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#161616] p-8 rounded-[2rem] border border-gray-800 shadow-2xl">
          <h3 className="text-sm font-bold mb-8 flex items-center justify-between">Net Profit Trend <span className="text-[10px] text-gray-600 font-normal tracking-widest uppercase">IST Timeline</span></h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{fill: '#666', fontSize: 10}} />
                <YAxis hide />
                <Tooltip 
                   contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px' }}
                   itemStyle={{ color: '#10b981', fontSize: '12px' }}
                   labelStyle={{ color: '#666', marginBottom: '4px' }}
                />
                <ReferenceLine y={0} stroke="#333" />
                <Bar dataKey="moneyKept" radius={[6, 6, 0, 0]} barSize={30}>
                  {formattedChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.moneyKept > 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#161616] p-8 rounded-[2rem] border border-gray-800 shadow-2xl">
          <h3 className="text-sm font-bold mb-8">Profit & Loss Breakdown</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moneyFlowData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fill: '#666', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'white', opacity: 0.05 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {moneyFlowData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* BOTTOM AREA: TOP PRODUCTS & FORECAST */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
        <div className="lg:col-span-2 bg-[#161616] rounded-[2rem] border border-gray-800 overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-gray-800">
            <h3 className="text-sm font-bold uppercase tracking-widest">Top 5 Performing Products</h3>
          </div>
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-[10px] text-gray-600 uppercase tracking-[0.2em]">
              <tr>
                <th className="p-6">Product</th>
                <th className="p-6 text-center">Delivered</th>
                <th className="p-6 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {topProducts.length > 0 ? topProducts.map((product, idx) => (
                <tr key={idx} className="hover:bg-white/[0.01] transition-colors group">
                  <td className="p-6 text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">{product.name}</td>
                  <td className="p-6 text-sm text-center text-gray-500 font-mono">{product.deliveredQty} units</td>
                  <td className="p-6 text-sm text-right text-green-500 font-black">₹{product.profit.toLocaleString()}</td>
                </tr>
              )) : (
                <tr><td colSpan="3" className="p-10 text-center text-gray-600 text-sm italic">No product data available for this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-gradient-to-b from-[#161616] to-[#0a0a0a] p-8 rounded-[2rem] border border-gray-800 shadow-2xl flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-sm font-bold flex items-center gap-2"><FiTruck className="text-blue-500" /> Pending Forecast</h3>
            <div className="space-y-1">
              <div className="text-[10px] text-gray-600 uppercase font-black tracking-widest">Expected Revenue</div>
              <div className="text-4xl font-black text-white">₹{forecast.expectedRevenue.toLocaleString()}</div>
              <div className="text-[10px] text-gray-500 italic font-mono uppercase tracking-tighter">Current In-Transit: {summary.inTransitOrders}</div>
            </div>
            
            <div className="pt-6 border-t border-gray-800 space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-[10px] text-gray-500 uppercase font-bold">Safeguard Success Rate</span>
                <span className="text-blue-400 font-black font-mono">{forecast.successRate}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${forecast.successRate}%` }}></div>
              </div>
            </div>
          </div>

          {/* 🟢 ISSUE 8 FIX: Detailed Risk Logic */}
          <div className={`mt-10 p-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-[0.2em] border ${
            forecast.riskLevel === 'Low Risk' 
              ? 'bg-green-500/5 border-green-500/20 text-green-500' 
              : forecast.riskLevel === 'Medium Risk'
                ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-500'
                : 'bg-red-500/5 border-red-500/20 text-red-500'
          }`}>
            Risk Index: {forecast.riskLevel}
          </div>
        </div>
      </div>
    </div>
  );
};



export default Dashboard;