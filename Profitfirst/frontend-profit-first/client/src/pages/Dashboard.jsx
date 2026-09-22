// import React, { useState, useEffect, useMemo, useCallback } from "react";
// import axiosInstance from "../../axios";
// import { format, parseISO } from "date-fns";
// import { FiRefreshCw, FiAlertCircle } from "react-icons/fi";
// import {
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   Tooltip,
//   ResponsiveContainer,
//   CartesianGrid,
//   ReferenceLine,
//   Cell,
// } from "recharts";
// import DateRangeSelector from "../components/DateRangeSelector";
// import { PulseLoader } from "react-spinners";
// import { toast } from "react-toastify";
// const MetricCard = ({
//   title,
//   value,
//   subtitle,
//   formula,
//   color = "text-white",
// }) => (
//   <div className="group relative bg-[#161616] p-4 rounded-2xl border border-gray-800 hover:border-green-500/30 transition-all shadow-sm">
//     {formula && (
//       <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-800 text-[10px] text-gray-200 py-1.5 px-3 rounded-lg border border-gray-700 z-50 shadow-2xl">
//         {formula}
//       </div>
//     )}
//     <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
//       {title}
//     </div>
//     <div className={`text-xl font-black ${color} mb-0.5 truncate`}>{value}</div>
//     {subtitle && (
//       <div className="text-[9px] text-gray-500 italic truncate">{subtitle}</div>
//     )}
//   </div>
// );

// const Row = ({ label, value, valueColor = "text-white" }) => (
//   <div className="flex justify-between items-center py-[14px] last-of-type:border-none py-2">
//     <div className="text-sm text-[#8f8f8f]">{label}</div>
//     <div className={`text-[15px] font-bold ${valueColor}`}>{value}</div>
//   </div>
// );

// const RowNew = ({ label, amount, orders, amountColor = "text-white" }) => {
//   return (
//     <div className="group flex items-center justify-between rounded-2xl bg-[#151515] px-5 py-4 transition-all duration-200 hover:bg-[#1a1a1a]">
//       {/* LEFT SIDE */}
//       <div className="flex items-center gap-3 min-w-0">
//         <span className="truncate text-[14px] font-medium text-[#8f8f8f]">
//           {label}
//         </span>

//         <span className={`text-[16px] font-bold tracking-tight ${amountColor}`}>
//           ₹{amount.toLocaleString()}
//         </span>
//       </div>

//       {/* RIGHT SIDE */}
//       <div className="flex items-center gap-2 shrink-0">
//         <span className="text-[12px] uppercase tracking-wider text-[#666]">
//           Orders
//         </span>

//         <span className="text-[16px] font-semibold text-white">{orders}</span>
//       </div>
//     </div>
//   );
// };
// const Highlight = ({ text }) => (
//   <div className="mt-5 p-[18px] bg-[#161616] rounded-[16px] text-sm leading-relaxed text-[#b8b8b8]">
//     {text}
//   </div>
// );

// const SideCard = ({
//   title,
//   bigNumber,
//   bigNumberColor = "text-white",
//   subtext,
//   children,
// }) => (
//   <div className="bg-[#0f0f0f] border border-[#1b1b1b] rounded-[24px] p-[26px]">
//     <div className="text-[13px] uppercase tracking-[1px] text-[#8f8f8f] mb-[22px] font-semibold">
//       {title}
//     </div>
//     <div className={`text-[40px] font-extrabold mb-3 ${bigNumberColor}`}>
//       {bigNumber}
//     </div>
//     <div className="text-sm leading-relaxed text-[#9d9d9d]">{subtext}</div>
//     <div className="mt-[34px]"></div>
//     {children}
//   </div>
// );

// const Dashboard = () => {
//   const [data, setData] = useState(null);
//   const [isLoading, setIsLoading] = useState(true);
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [error, setError] = useState(null);
//   const [showDateSelector, setShowDateSelector] = useState(false);

//   // Default range: Last 30 Days
//   const [dateRange, setDateRange] = useState({
//     startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
//     endDate: new Date(),
//     from: format(
//       new Date(new Date().setDate(new Date().getDate() - 30)),
//       "yyyy-MM-dd",
//     ),
//     to: format(new Date(), "yyyy-MM-dd"),
//     label: "Last 30 days",
//   });

//   const formatCurrency = (num) =>
//     `₹${Number(num || 0).toLocaleString("en-IN", {
//       minimumFractionDigits: 2,
//       maximumFractionDigits: 2,
//     })}`;

//   const fetchDashboardData = useCallback(
//     async (isFirstLoad = false) => {
//       if (isFirstLoad) setIsLoading(true);
//       else setIsRefreshing(true);

//       setError(null);
//       try {
//         // Fetching real-time aggregated summary from backend
//         const response = await axiosInstance.get("/dashboard/summary", {
//           params: { from: dateRange.from, to: dateRange.to },
//         });
//         setData(response.data);
//       } catch (err) {
//         console.error("Dashboard API Error:", err);
//         setError("Financial Data Engine Offline. Please check your workers.");
//       } finally {
//         setIsLoading(false);
//         setIsRefreshing(false);
//       }
//     },
//     [dateRange.from, dateRange.to],
//   );

//   const handleForceSync = async () => {
//     setIsRefreshing(true);
//     try {
//       const res = await axiosInstance.post("/sync/manual"); // Trigger the controller we built
//       if (res.data.success) {
//         toast.info("🔄 Sync started in background. Refreshing charts soon...");
//         // Auto-refresh data after 10 seconds to show changes
//         setTimeout(() => fetchDashboardData(), 10000);
//       }
//     } catch (err) {
//       toast.error("Failed to trigger sync.");
//     } finally {
//       setIsRefreshing(false);
//     }
//   };

//   useEffect(() => {
//     fetchDashboardData(data === null);
//   }, [fetchDashboardData]);

//   // 🟢 Real Data Chart Mapping
//   const formattedChartData = useMemo(() => {
//     if (!data?.chartData) return [];

//     return data.chartData
//       .map((day) => {
//         if (!day?.date) {
//           console.warn("Missing date in chartData:", day);
//           return null;
//         }

//         return {
//           name: format(parseISO(day.date), "MMM dd"),
//           netProfit: Number(day.moneyKept || 0),
//         };
//       })
//       .filter(Boolean);
//   }, [data]);

//   // 🟢 Real Money Flow Mapping
//   const moneyFlowData = useMemo(() => {
//     if (!data?.moneyFlowData) return [];
//     return data.moneyFlowData;
//   }, [data]);

//   if (isLoading) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] gap-4">
//         <PulseLoader size={12} color="#22c55e" />
//         <p className="text-green-500 text-xs font-bold tracking-widest animate-pulse uppercase">
//           Syncing Financial Truth...
//         </p>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] p-6 text-center">
//         <FiAlertCircle className="text-red-500 size-12 mb-4" />
//         <h2 className="text-white text-xl font-bold mb-2">
//           Sync Connection Lost
//         </h2>
//         <p className="text-gray-400 max-w-md mb-6">{error}</p>
//         <button
//           onClick={() => fetchDashboardData(true)}
//           className="px-8 py-3 bg-white text-black font-black rounded-xl hover:scale-105 transition-all"
//         >
//           Retry Connection
//         </button>
//       </div>
//     );
//   }

//   if (!data?.summary) return null;

//   const { summary, forecast, topProducts } = data;

//   return (
//     <div className="p-4 lg:p-8 space-y-10 animate-in fade-in duration-1000 min-h-screen relative">
//       {isRefreshing && (
//         <div className="fixed top-6 right-6 z-[200] bg-green-500 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg shadow-green-500/20">
//           <PulseLoader size={4} color="#000" />
//           <span className="text-[10px] font-black text-black uppercase">
//             Refreshing Data
//           </span>
//         </div>
//       )}

//       {/* HEADER SECTION */}
//       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
//         <div>
//           <h1 className="text-4xl font-black text-white tracking-tighter">
//             Financial Dashboard
//           </h1>
//         </div>
//         <div className="flex items-center gap-3">
//           <button
//             onClick={() => fetchDashboardData()}
//             className="p-3 bg-[#161616] border border-gray-800 rounded-xl text-gray-400 hover:text-green-500 transition-all"
//           >
//             <FiRefreshCw
//               size={18}
//               className={isRefreshing ? "animate-spin" : ""}
//             />
//           </button>

//           <button
//             onClick={handleForceSync}
//             disabled={isRefreshing}
//             className="flex items-center gap-2 px-4 py-2 bg-green-500 text-black font-bold rounded-lg hover:bg-green-400 transition-all"
//           >
//             <FiRefreshCw className={isRefreshing ? "animate-spin" : ""} />
//             {isRefreshing ? "Syncing..." : "Sync Now"}
//           </button>
//           <div className="relative">
//             <button
//               onClick={() => setShowDateSelector(!showDateSelector)}
//               className="flex items-center gap-3 px-5 py-3 bg-[#161616] border border-gray-800 rounded-xl hover:border-gray-600 transition-all text-sm font-bold text-white shadow-2xl"
//             >
//               {dateRange.label}
//             </button>
//             {showDateSelector && (
//               <div className="absolute right-0 mt-3 z-[200]">
//                 <DateRangeSelector
//                   initialRange={dateRange}
//                   onApply={(range) => {
//                     setDateRange(range);
//                     setShowDateSelector(false);
//                   }}
//                 />
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       <section>
//         <div
//           style={{
//             display: "grid",
//             gridTemplateColumns: "1.5fr 1fr",
//             gap: "32px",
//           }}
//         >
//           {/* LEFT PANEL */}
//           <div
//             style={{
//               border: "1px solid #1b1b1b",
//               borderRadius: "26px",
//             }}
//           >
//             <div
//               style={{
//                 display: "grid",
//                 gridTemplateColumns: "1fr 1fr",
//                 gap: "18px",
//               }}
//             >
//               {/* Gross Revenue */}
//               <div
//                 style={{
//                   background: "#151515",
//                   border: "1px solid #1f1f1f",
//                   borderRadius: "20px",
//                   padding: "22px",
//                   color: "#e5e7eb",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Gross Revenue
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                   }}
//                 >
//                   ₹{summary.revenueGenerated?.toLocaleString()}
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Total Shopify revenue before cancellations and returns.
//                 </div>
//               </div>

//               {/* Real Revenue */}
//               <div
//                 style={{
//                   background: "#151515",
//                   border: "1px solid #1f1f1f",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Real Revenue
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                     color: "#22d37d",
//                   }}
//                 >
//                   {formatCurrency(summary.revenueEarned || 0)}
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Actual money generated from delivered orders.
//                 </div>
//               </div>

//               {/* Contribution Profit */}
//               <div
//                 style={{
//                   background: "#151515",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Contribution Profit
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                     color: "#ffcc4d",
//                   }}
//                 >
//                   {formatCurrency(summary.contributionProfit || 0)}
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Profit remaining after variable operational costs but before
//                   fixed business expenses.
//                 </div>

//                 <div style={{ marginTop: "34px" }} />

//                 <Row
//                   label="Contribution Cost"
//                   value={`${summary.contributionCost || 0}`}
//                   valueColor="text-[#ff6262]"
//                   style={{ borderBottom: "none" }}
//                 />
//                 <Row
//                   label="Contribution Margin"
//                   value={`${summary.contributionMargin || 0}%`}
//                   valueColor="text-[#ffcc4d]"
//                   style={{ borderBottom: "none" }}
//                 />

//                 <Row
//                   label="Break-even ROAS"
//                   value={`${summary.breakEvenROAS || 0}`}
//                 />
//                 <Row label="Current ROAS" value={`${summary.roas || 0}`} />
//                 <Row label=" POAS" value={`${summary.poas || 0}`} />

//                 <Highlight text="Operationally healthy before fixed overhead expenses." />
//               </div>

//               {/* Total Cost */}
//               <div
//                 style={{
//                   background: "#151515",
//                   border: "1px solid #1f1f1f",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Total Cost
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                     color: "#ff6262",
//                   }}
//                 >
//                   {formatCurrency(summary.totalCost || 0)}
//                 </div>

//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Complete operational spend across advertising, fulfillment and
//                   product costs.
//                 </div>

//                 <div style={{ marginTop: "34px" }} />

//                 <Row
//                   label="Ad Spend"
//                   value={`${formatCurrency(summary.adsSpend || 0)}`}
//                 />

//                 <Row
//                   label="COGS"
//                   value={`${formatCurrency(summary.cogs || 0)}`}
//                 />

//                 <Row
//                   label="Shipping Spend"
//                   value={`${formatCurrency(summary.shippingSpend || 0)}`}
//                 />

//                 <Row
//                   label="Gateway Fees"
//                   value={`${formatCurrency(summary.gatewayFees || 0)}`}
//                 />

//                 <Row
//                   label="RTO Repackaging Cost"
//                   value={`${formatCurrency(summary.rtoHandlingFees || 0)}`}
//                   valueColor="text-[#ff6262]"
//                 />
//                 <Row
//                   label="Staff Salaries , Agency Fees & Office Rent"
//                   value={`${formatCurrency(summary.staffSalary + summary.officeRent + summary.agencyFees || 0)}`}
//                 />

//                 <Highlight text="Advertising and COD losses are consuming the majority of business margin." />
//               </div>
//             </div>
//           </div>

//           {/* RIGHT PANEL */}
//           <div
//             style={{
//               gap: "18px",
//               display: "grid",
//               gridTemplateRows: "repeat(2, auto)",
//             }}
//           >
//             <div>
//               {/* new matrix added  */}
//               <div
//                 style={{
//                   background: "#151515",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#fcfcfc",
//                     marginBottom: "2px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Revenue Intelligence
//                 </div>

//                 <RowNew
//                   label="Prepaid Revenue"
//                   amount={summary.prepaidRevenue || 0}
//                   orders={summary.prepaidOrders || 0}
//                 />

//                 <RowNew
//                   label="COD Revenue"
//                   amount={summary.codRevenue || 0}
//                   orders={summary.codOrders || 0}
//                 />

//                 <RowNew
//                   label="Revenue From Current Month Orders"
//                   amount={summary.revenueFromCurrentOrders || 0}
//                   orders={summary.currentOrdersCount || 0}
//                 />

//                 <RowNew
//                   label="Revenue From Previous Month Orders"
//                   amount={summary.revenueFromPastOrders || 0}
//                   orders={summary.pastOrdersCount || 0}
//                 />
//               </div>
//             </div>

//             <div
//               style={{
//                 background: "#151515",
//                 border: "1px solid #1f1f1f",
//                 borderRadius: "20px",
//                 padding: "22px",
//               }}
//             >
//               <div
//                 style={{
//                   fontSize: "12px",
//                   textTransform: "uppercase",
//                   letterSpacing: "0.8px",
//                   color: "#8f8f8f",
//                   marginBottom: "14px",
//                   fontWeight: "600",
//                 }}
//               >
//                 Net Business Profit
//               </div>

//               <div
//                 style={{
//                   fontSize: "40px",
//                   fontWeight: "800",
//                   marginBottom: "10px",
//                   color: summary.moneyKept >= 0 ? "#22d37d" : "#ff6262",
//                 }}
//               >
//                 {formatCurrency(summary.moneyKept || 0)}
//               </div>

//               <div
//                 style={{
//                   fontSize: "14px",
//                   lineHeight: "1.6",
//                   color: "#9d9d9d",
//                 }}
//               >
//                 Final company profit after salaries, rent, agency fees and fixed
//                 operational expenses.
//               </div>

//               <div style={{ marginTop: "34px" }} />

//               <Row
//                 label="Profit Margin"
//                 value={`${summary.profitMargin || 0}%`}
//               />
//               {/* <Row
//                 label="Average Order Value"
//                 value={`${formatCurrency(summary.aov || 0)}`}
//               /> */}

//               <Row
//                 label="Team Salaries"
//                 value={`${formatCurrency(summary.staffSalary || 2)}`}
//               />

//               <Row
//                 label="Office Rent"
//                 value={`${formatCurrency(summary.officeRent || 2)}`}
//               />

//               <Row
//                 label="Agency Fees"
//                 value={`${formatCurrency(summary.agencyFees || 2)}`}
//               />

//               <Highlight text="Fixed overhead is currently pushing the business into negative profitability." />
//             </div>
//           </div>
//         </div>
//       </section>

//       <section>
//         <div>
//           <div
//             style={{
//               border: "1px solid #1b1b1b",
//               borderRadius: "26px",
//             }}
//           >
//             <div
//               style={{
//                 display: "grid",
//                 gridTemplateColumns: "1fr 1fr 1fr",
//                 gap: "18px",
//               }}
//             >
//               {/* ORDER HEALTH */}
//               <div
//                 style={{
//                   background: "#151515",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Order Health
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                     color: "#ffcc4d",
//                   }}
//                 >
//                   {summary.totalOrders || 0}
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Overall order flow across delivery, returns and cancellations.
//                 </div>
//                 <div style={{ marginTop: "34px" }} />

//                 <Row
//                   label="Delivered Orders"
//                   value={`${summary.deliveredOrders || 0}`}
//                   style={{ borderBottom: "none" }}
//                 />
//                 <Row label="RTO Orders" value={`${summary.rtoOrders || 0}`} />
//                 <Row
//                   label="Cancelled Orders"
//                   value={`${summary.cancelledOrders || 0}`}
//                 />
//               </div>

//               {/* PAYMENT BEHAVIOR */}
//               <div
//                 style={{
//                   background: "#151515",
//                   border: "1px solid #1f1f1f",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Payment Behavior
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                     color: "#22d37d",
//                   }}
//                 >
//                   {summary.totalOrders - summary.cancelledOrders || 0}
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Customer payment distribution across prepaid, COD and partial
//                   COD.
//                 </div>
//                 <div style={{ marginTop: "34px" }} />

//                 <Row
//                   label="Prepaid Orders"
//                   value={`${summary.prepaidOrders || 0}`}
//                 />
//                 <Row label="COD Orders" value={`${summary.codOrders || 0}`} />
//                 <Row
//                   label="Partial COD Orders"
//                   value={`${summary.partialCodOrders || 0}`}
//                 />
//               </div>

//               {/* UNIT ECONOMICS */}
//               <div
//                 style={{
//                   background: "#151515",
//                   border: "1px solid #1f1f1f",
//                   borderRadius: "20px",
//                   padding: "22px",
//                 }}
//               >
//                 <div
//                   style={{
//                     fontSize: "12px",
//                     textTransform: "uppercase",
//                     letterSpacing: "0.8px",
//                     color: "#8f8f8f",
//                     marginBottom: "14px",
//                     fontWeight: "600",
//                   }}
//                 >
//                   Unit Economics
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "40px",
//                     fontWeight: "800",
//                     marginBottom: "10px",
//                     color: "#ff6262",
//                   }}
//                 >
//                   {formatCurrency(summary.profitPerOrder || 0)}
//                 </div>
//                 <div
//                   style={{
//                     fontSize: "14px",
//                     lineHeight: "1.6",
//                     color: "#9d9d9d",
//                   }}
//                 >
//                   Per-order efficiency and profitability metrics.
//                 </div>
//                 <div style={{ marginTop: "34px" }} />

//                 <Row
//                   label="Shipping / Order"
//                   value={`${formatCurrency(summary.shippingPerOrder || 0)}`}
//                 />
//                 <Row
//                   label="Real AOV"
//                   value={`${formatCurrency(summary.realaov || 0)}`}
//                 />
//                 <Row
//                   label="Average Order Value"
//                   value={`${formatCurrency(summary.aov || 0)}`}
//                 />
//               </div>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* SECTION 4: PRODUCT PROFITABILITY (Top 5 Sellers) */}
//       <div className="lg:col-span-2 bg-[#161616] overflow-hidden shadow-2xl rounded-2xl border border-gray-800">
//         <div className="px-8 py-6">
//           <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
//             Product Profitability
//           </h3>
//         </div>
//         <table className="w-full text-sm">
//           <thead className="bg-[#111] text-[#6b7280] uppercase text-[11px] tracking-wider">
//             <tr>
//               <th className="px-8 py-4 text-left">Product</th>
//               <th className="px-8 py-4 text-center">Delivered Qty</th>
//               <th className="px-8 py-4 text-right">Revenue</th>
//               <th className="px-8 py-4 text-right">COGS</th>
//               <th className="px-8 py-4 text-right">Gross Profit</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-[#1f2937]">
//             {topProducts.length > 0 ? (
//               topProducts.map((product, idx) => (
//                 <tr
//                   key={idx}
//                   className="hover:bg-[#111827]/50 transition-all duration-200"
//                 >
//                   <td className="px-8 py-5 text-[#e5e7eb] font-medium">
//                     {product.name}
//                   </td>
//                   <td className="px-8 py-5 text-center text-[#9ca3af] font-mono">
//                     {product.deliveredQty}
//                   </td>
//                   <td className="px-8 py-5 text-right text-[#e5e7eb] font-mono">
//                     ₹{product.revenue.toLocaleString()}
//                   </td>
//                   <td className="px-8 py-5 text-right text-[#9ca3af] font-mono">
//                     ₹{product.cogs.toLocaleString()}
//                   </td>
//                   <td className="px-8 py-5 text-right text-[#22c55e] font-semibold font-mono">
//                     ₹{product.profit.toLocaleString()}
//                   </td>
//                 </tr>
//               ))
//             ) : (
//               <tr>
//                 <td
//                   colSpan="5"
//                   className="py-10 text-center text-[#6b7280] italic"
//                 >
//                   No product data available for this range.
//                 </td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//       </div>

//       {/* SECTION 5: COST LEAKAGE (Where the money goes) */}
//       <section className="space-y-4">
//         <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
//           Cost Leakage
//         </h3>
//         <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
//           <MetricCard
//             title="Shipping Spent"
//             value={`₹${summary.shippingSpend.toLocaleString()}`}
//             formula="Total Forward + Return Freight Charges"
//           />
         
//           <MetricCard
//             title="Total Shipments"
//             value={`${summary.totalShipments-summary.cancelledOrders.toLocaleString()}`}
//             // value={`${summary.totalShipments.toLocaleString() - }`}
//             formula="Total Forward + Return Shipments - Cancelled"
//           />
         
//           <MetricCard
//             title="Pickup Pending Orders"
//             value={`${summary.pickupPendingOrders.toLocaleString()}`}
//             formula="Orders that haven't been picked up by the carrier yet"
//           />
//           {/* <MetricCard
//             title="NDR Pending Orders"
//             value={`${summary.ndrPendingOrders.toLocaleString()}`}
//             formula="Orders marked as Not Delivered Ready but not yet returned or delivered"
//           /> */}
//           {/* <MetricCard
//             title="Orphan Shipments"
//             value={`${summary.orphanShipmentsCount.toLocaleString()}`}
//             formula="Shipments without a corresponding order in Shopify"
//           />  */}
//           <MetricCard
//             title="RTO Handling"
//             value={`₹${summary.rtoHandlingFees.toLocaleString()}`}
//             subtitle="Merchant defined RTO per order fee"
//           />
//           <MetricCard
//             title="Gateway Fees"
//             value={`${formatCurrency(summary.gatewayFees || 0).toLocaleString()}`}
//             subtitle="Processing Fees (Prepaid Delivered Only)"
//           />
//           <MetricCard
//             title="Fixed Costs"
//             value={`${formatCurrency(summary.businessExpenses || 0).toLocaleString()}`}
//             subtitle="Monthly Overheads divided by 30"
//           />
//           <MetricCard
//             title="RTO Revenue Lost"
//             value={`${formatCurrency(summary.rtoRevenueLost || 0).toLocaleString()}`}
//             subtitle="Potential Sales value lost to RTO"
//           />
//         </div>
//       </section>

//       {/* SECTION 6: PENDING OUTCOME (Financial Forecast) */}
//       <section className="space-y-4">
//         <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
//           Pending Outcome / Money
//         </h3>
//         <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//           <MetricCard
//             title="In-Transit Orders"
//             value={forecast.inTransit}
//             subtitle="Currently with carrier"
//           />
//           <MetricCard
//             title="Expected Delivery"
//             value={forecast.expectedDelivered}
//             subtitle={`${forecast.successRate}% Real Success Rate`}
//           />
//           <MetricCard
//             title="Expected Revenue"
//             value={`₹${forecast.expectedRevenue.toLocaleString()}`}
//             formula="Estimated realization from in-transit"
//           />
//           <MetricCard
//             title="Risk Level"
//             value={forecast.riskLevel}
//             color={
//               forecast.riskLevel === "Low Risk"
//                 ? "text-green-400"
//                 : "text-red-400"
//             }
//           />
//         </div>
//       </section>

//       {/* SECTION 7: DAILY PROFIT TREND CHART */}
//       <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-3xl border border-gray-800 p-8 shadow-3xl">
//         <h3 className="text-xl font-black text-white mb-1 tracking-tight">
//           Daily Profit Status
//         </h3>
//         <p className="text-sm text-gray-400 mb-8">
//           Dynamic profitability based on your IST business day.
//         </p>
//         <div className="h-96 bg-[#0D1D1E]/50 rounded-2xl p-4 border border-gray-800/50">
//           <ResponsiveContainer width="100%" height="100%">
//             <BarChart data={formattedChartData}>
//               <defs>
//                 <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
//                   <stop offset="0%" stopColor="#12EB8E" />
//                   <stop offset="100%" stopColor="#0A9F6E" />
//                 </linearGradient>
//                 <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
//                   <stop offset="0%" stopColor="#EF4444" />
//                   <stop offset="100%" stopColor="#DC2626" />
//                 </linearGradient>
//               </defs>
//               <CartesianGrid
//                 stroke="#1F2937"
//                 vertical={false}
//                 strokeDasharray="3 3"
//               />
//               {/* <XAxis
//                 dataKey="name"
//                 stroke="#6B7280"
//                 fontSize={10}
//                 tickLine={false}
//                 axisLine={false}
//               /> */}
//               <YAxis
//                 stroke="#6B7280"
//                 fontSize={10}
//                 tickLine={false}
//                 axisLine={false}
//                 tickFormatter={(v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`)}
//               />
//               <Tooltip
//                 cursor={{ fill: "#22c55e10" }}
//                 formatter={(v) => `₹${v.toLocaleString("en-IN")}`}
//                 contentStyle={{
//                   backgroundColor: "#dbd8d8ff",
//                   border: "1px solid #333",
//                   borderRadius: "12px",
//                 }}
//               />
//               <ReferenceLine y={0} stroke="#4B5563" />
//               <Bar dataKey="netProfit" radius={[4, 4, 0, 0]}>
//                 {formattedChartData.map((item, i) => (
//                   <Cell
//                     key={i}
//                     fill={
//                       item.netProfit >= 0
//                         ? "url(#profitGradient)"
//                         : "url(#lossGradient)"
//                     }
//                   />
//                 ))}
//               </Bar>
//             </BarChart>
//           </ResponsiveContainer>
//         </div>
//       </div>

//       {/* SECTION 8: MONEY FLOW (Waterfall Representation) */}
//       <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-3xl border border-gray-800 p-8 shadow-3xl">
//         <h3 className="text-xl font-black text-white mb-1 tracking-tight">
//           Revenue Breakdown
//         </h3>
//         <p className="text-sm text-gray-400 mb-8">
//           How your Revenue Earned is distributed across costs.
//         </p>
//         <div className="h-96 bg-[#0D1D1E]/50 rounded-2xl p-4 border border-gray-800/50">
//           <ResponsiveContainer width="100%" height="100%">
//             <BarChart data={moneyFlowData}>
//               <defs>
//                 <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
//                   <stop offset="0%" stopColor="#12EB8E" />
//                   <stop offset="100%" stopColor="#0A9F6E" />
//                 </linearGradient>
//                 <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
//                   <stop offset="0%" stopColor="#EF4444" />
//                   <stop offset="100%" stopColor="#DC2626" />
//                 </linearGradient>
//               </defs>
//               <CartesianGrid
//                 stroke="#1F2937"
//                 vertical={false}
//                 strokeDasharray="3 3"
//               />
//               <XAxis
//                 dataKey="name"
//                 stroke="#6B7280"
//                 fontSize={10}
//                 tickLine={false}
//                 axisLine={false}
//               />
//               <YAxis
//                 stroke="#6B7280"
//                 fontSize={10}
//                 tickLine={false}
//                 axisLine={false}
//                 tickFormatter={(v) => `₹${Math.abs(v / 1000)}k`}
//               />
//               <Tooltip
//                 cursor={{ fill: "transparent" }}
//                 formatter={(v) => `₹${Math.abs(v).toLocaleString("en-IN")}`}
//                 contentStyle={{
//                   backgroundColor: "#dbdadaff",
//                   border: "1px solid #333",
//                   borderRadius: "12px",
//                 }}
//               />
//               <ReferenceLine y={0} stroke="#4B5563" />
//               <Bar dataKey="value" radius={[4, 4, 0, 0]}>
//                 {moneyFlowData.map((item, i) => (
//                   <Cell
//                     key={i}
//                     fill={
//                       item.type === "positive"
//                         ? "url(#greenGrad)"
//                         : "url(#redGrad)"
//                     }
//                   />
//                 ))}
//               </Bar>
//             </BarChart>
//           </ResponsiveContainer>
//         </div>
//         <div className="flex flex-wrap justify-center gap-6 mt-8">
//           <div className="flex items-center gap-2">
//             <div className="w-3 h-3 bg-green-500 rounded-full"></div>
//             <span className="text-gray-400 text-xs font-bold uppercase">
//               Cash In
//             </span>
//           </div>
//           <div className="flex items-center gap-2">
//             <div className="w-3 h-3 bg-red-500 rounded-full"></div>
//             <span className="text-gray-400 text-xs font-bold uppercase">
//               Cash Out
//             </span>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Dashboard;




















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

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showDateSelector, setShowDateSelector] = useState(false);
  const [selectedAccFilter, setSelectedAccFilter] = useState("all");

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

  const fmt = (num) =>
    "₹" +
    Number(num || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    });

  const fmtExact = (num) =>
    "₹" +
    Number(num || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fetchDashboardData = useCallback(
    async (isFirstLoad = false) => {
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
    },
    [dateRange.from, dateRange.to],
  );

  const handleForceSync = async () => {
    setIsRefreshing(true);
    try {
      const res = await axiosInstance.post("/sync/manual");
      if (res.data.success) {
        toast.info("🔄 Sync started in background. Refreshing charts soon...");
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

  // ── Real Data Chart Mapping ──
  const formattedChartData = useMemo(() => {
    if (!data?.chartData) return [];
    return data.chartData
      .map((day) => {
        if (!day?.date) return null;
        return {
          name: format(parseISO(day.date), "MMM dd"),
          netProfit: Number(day.moneyKept || 0),
        };
      })
      .filter(Boolean);
  }, [data]);

  const moneyFlowData = useMemo(() => {
    if (!data?.moneyFlowData) return [];
    return data.moneyFlowData;
  }, [data]);

  if (isLoading) {
    return (
      <div style={styles.loadingScreen}>
        <PulseLoader size={12} color="#00d46a" />
        <p style={styles.loadingText}>Syncing Financial Truth...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingScreen}>
        <FiAlertCircle color="#ff3355" size={48} style={{ marginBottom: "16px" }} />
        <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>
          Sync Connection Lost
        </h2>
        <p style={{ color: "#7a9b82", maxWidth: "420px", marginBottom: "24px", textAlign: "center" }}>
          {error}
        </p>
        <button
          onClick={() => fetchDashboardData(true)}
          style={styles.btnSync}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!data?.summary) return null;

  const { summary, forecast = {}, topProducts = [] } = data;

  // Derived Calculations
  const grossRev = summary.revenueGenerated || 0;
  const realRev = summary.revenueEarned || 0;
  const rtoLost = summary.rtoRevenueLost || (grossRev - realRev);
  const earnedPct = grossRev > 0 ? ((realRev / grossRev) * 100).toFixed(1) : 0;
  const lostPct = (100 - Number(earnedPct)).toFixed(1);

  const totalOrders = summary.totalOrders || 0;
  const deliveredOrders = summary.deliveredOrders || 0;
  const rtoOrders = summary.rtoOrders || 0;
  const cancelledOrders = summary.cancelledOrders || 0;
  const movingOrders = Math.max(0, totalOrders - deliveredOrders - rtoOrders - cancelledOrders);

  const prepaidOrders = summary.prepaidOrders || 0;
  const codOrders = summary.codOrders || 0;
  const totalCompletedOrders = prepaidOrders + codOrders || 1;
  const prepaidPct = ((prepaidOrders / totalCompletedOrders) * 100).toFixed(1);
  const codPct = ((codOrders / totalCompletedOrders) * 100).toFixed(1);

  const totalCosts = summary.totalCost || 0;
  const adsSpend = summary.adsSpend || 0;
  const cogs = summary.cogs || 0;
  const shippingSpend = summary.shippingSpend || 0;
  const salaries = summary.staffSalary || 0;
  const rent = summary.officeRent || 0;
  const agency = summary.agencyFees || 0;
  const gateway = summary.gatewayFees || 0;
  const rtoHandling = summary.rtoHandlingFees || 0;

  const isProfitNegative = (summary.moneyKept || 0) < 0;

  return (
    <div style={styles.dashboardContainer}>
      {isRefreshing && (
        <div style={styles.refreshingBadge}>
          <PulseLoader size={4} color="#000" />
          <span style={{ fontSize: "10px", fontWeight: "800", color: "#000", textTransform: "uppercase" }}>
            Refreshing Data
          </span>
        </div>
      )}

      {/* ── TOP HEADER SECTION ── */}
      <div style={styles.pageHd}>
        <div>
          <h1 style={styles.pageTitle}>Financial Dashboard</h1>
          <p style={styles.pagePeriod}>
            {dateRange.label} · Last synced recently
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", position: "relative" }}>
          <button
            onClick={() => fetchDashboardData()}
            title="Refresh"
            style={styles.btnIcon}
          >
            <FiRefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
          </button>

          <button
            onClick={handleForceSync}
            disabled={isRefreshing}
            style={styles.btnSync}
          >
            <FiRefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Syncing..." : "Sync Now"}
          </button>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowDateSelector(!showDateSelector)}
              style={styles.tbPeriod}
            >
              {dateRange.label} ▾
            </button>
            {showDateSelector && (
              <div style={styles.dateDropdown}>
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

      {/* ── 1. MULTI AD ACCOUNT FILTER BAR ── */}
      <div style={styles.adAccountBar}>
        <div style={styles.aabLabel}>YOUR AD ACCOUNTS — FILTER METRICS BY ACCOUNT</div>
        <div style={styles.aabPills}>
          <div
            onClick={() => setSelectedAccFilter("all")}
            style={{
              ...styles.accPill,
              ...(selectedAccFilter === "all" ? styles.accPillOn : {}),
            }}
          >
            <div style={{ ...styles.accPillDot, background: "var(--g)" }}></div>
            <span style={{ fontWeight: 600 }}>All Accounts</span>
            <span style={styles.accPillSpend}>{fmt(adsSpend)}</span>
            {selectedAccFilter === "all" && <span style={styles.accPillCheck}>✓</span>}
          </div>

          {summary.adAccounts && summary.adAccounts.length > 0 ? (
            summary.adAccounts.map((acc, idx) => (
              <div
                key={acc.id || idx}
                onClick={() => setSelectedAccFilter(acc.id)}
                style={{
                  ...styles.accPill,
                  ...(selectedAccFilter === acc.id ? styles.accPillOn : {}),
                }}
              >
                <div style={{ ...styles.accPillDot, background: "#5b8cff" }}></div>
                <span style={{ fontWeight: 500 }}>{acc.name || `Account ${idx + 1}`}</span>
                <span style={styles.accPillSpend}>{fmt(acc.spend || 0)}</span>
                <span style={styles.roasTag}>ROAS {acc.roas || summary.roas || 0}</span>
                {selectedAccFilter === acc.id && <span style={styles.accPillCheck}>✓</span>}
              </div>
            ))
          ) : (
            <div
              onClick={() => setSelectedAccFilter("main")}
              style={{
                ...styles.accPill,
                ...(selectedAccFilter === "main" ? styles.accPillOn : {}),
              }}
            >
              <div style={{ ...styles.accPillDot, background: "#5b8cff" }}></div>
              <span style={{ fontWeight: 500 }}>Primary Meta Account</span>
              <span style={styles.accPillSpend}>{fmt(adsSpend)}</span>
              <span style={styles.roasTag}>ROAS {summary.roas || 0}</span>
              {selectedAccFilter === "main" && <span style={styles.accPillCheck}>✓</span>}
            </div>
          )}

          <div style={styles.aabCombined}>
            Total: <b>{fmt(adsSpend)}</b> spent · Current ROAS <b style={{ color: "var(--y)" }}>{summary.roas || 0}</b>
          </div>
        </div>
      </div>

      {/* ── 2. SCORE CARD (MONEY YOU KEEP) ── */}
      <div style={styles.scoreCard}>
        <div style={styles.scTop}>
          <div>
            <div style={styles.scEyebrow}>MONEY YOU KEEP THIS MONTH</div>
            <div style={{ ...styles.scNumber, color: isProfitNegative ? "var(--r)" : "var(--g)" }}>
              {fmt(summary.moneyKept)}
            </div>
            <div style={styles.scSub}>
              Final amount left after paying for ads, products, shipping, salary — everything.
            </div>
          </div>

          <div style={styles.scBreakdown}>
            <div style={styles.scb}>
              <div style={styles.scbLabel}>Profit %</div>
              <div style={{ ...styles.scbVal, color: isProfitNegative ? "var(--r)" : "var(--g)" }}>
                {summary.profitMargin || 0}%
              </div>
            </div>
            <div style={styles.scb}>
              <div style={styles.scbLabel}>Monthly Salary</div>
              <div style={styles.scbVal}>{fmt(salaries)}</div>
            </div>
            <div style={styles.scb}>
              <div style={styles.scbLabel}>Office Rent</div>
              <div style={styles.scbVal}>{fmt(rent)}</div>
            </div>
            <div style={styles.scb}>
              <div style={styles.scbLabel}>Agency Fees</div>
              <div style={styles.scbVal}>{fmt(agency)}</div>
            </div>
          </div>
        </div>

        <div style={isProfitNegative ? styles.scInsightRed : styles.scInsightGreen}>
          <span style={{ fontSize: "15px" }}>{isProfitNegative ? "⚠️" : "🚀"}</span>
          <div>
            {isProfitNegative ? (
              <>
                <b>Fixed costs and advertising losses are eating into your margins.</b> Even before salaries, your contribution profit is {fmt(summary.contributionProfit)}. Reducing dead ad spend and increasing prepaid orders are your fastest levers.
              </>
            ) : (
              <>
                <b>Your operations are healthy and net profitable.</b> You are currently retaining {summary.profitMargin}% of your gross revenue after all operational and marketing deductions.
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. BIG 4 TILES ROW ── */}
      <div style={styles.tileRow}>
        <div style={styles.tile}>
          <div style={styles.tileLabel}>Shopify Total (before returns)</div>
          <div style={{ ...styles.tileNum, color: "var(--t1)" }}>{fmt(grossRev)}</div>
          <div style={styles.tileSub}>What Shopify shows as revenue</div>
        </div>

        <div style={styles.tile}>
          <div style={styles.tileLabel}>Money You Actually Earned</div>
          <div style={{ ...styles.tileNum, color: "var(--g)" }}>{fmt(realRev)}</div>
          <div style={styles.tileSub}>Only from delivered orders ({earnedPct}%)</div>
          <div style={styles.tileBar}>
            <div style={{ ...styles.tileBarFill, width: `${Math.min(earnedPct, 100)}%`, background: "var(--g)" }}></div>
          </div>
        </div>

        <div style={styles.tile}>
          <div style={styles.tileLabel}>Total Money Spent</div>
          <div style={{ ...styles.tileNum, color: "var(--r)" }}>{fmt(totalCosts)}</div>
          <div style={styles.tileSub}>Ads + products + shipping + salaries</div>
        </div>

        <div style={styles.tile}>
          <div style={styles.tileLabel}>Profit After Ads & Products</div>
          <div style={{ ...styles.tileNum, color: (summary.contributionProfit || 0) >= 0 ? "var(--g)" : "var(--r)" }}>
            {fmt(summary.contributionProfit)}
          </div>
          <div style={styles.tileSub}>Contribution margin: {summary.contributionMargin || 0}%</div>
          <div style={styles.tileTagRed}>Before fixed costs</div>
        </div>
      </div>

      {/* ── 4. REVENUE BREAKDOWN + WATERFALL ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Revenue & Cost Breakdown</span></div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px" }}>
        {/* Revenue Card */}
        <div style={styles.revCard}>
          <div style={{ padding: "18px 20px" }}>
            <div style={styles.revCardLabel}>Shopify Total vs What You Earned</div>
            <div style={styles.revNums}>
              <div style={styles.rnFirst}>
                <div style={styles.rnLabel}>Shopify shows</div>
                <div style={styles.rnVal}>{fmt(grossRev)}</div>
              </div>
              <div style={styles.rn}>
                <div style={styles.rnLabel}>You earned</div>
                <div style={{ ...styles.rnVal, color: "var(--g)" }}>{fmt(realRev)}</div>
              </div>
              <div style={styles.rnLast}>
                <div style={styles.rnLabel}>Lost to RTOs & cancels</div>
                <div style={{ ...styles.rnVal, color: "var(--r)" }}>−{fmt(rtoLost)}</div>
              </div>
            </div>

            <div style={styles.revBarTrack}>
              <div style={{ ...styles.revBarEarned, width: `${Math.min(earnedPct, 100)}%` }}></div>
            </div>
            <div style={styles.revPctRow}>
              <span style={{ color: "var(--g)", fontSize: "11px" }}>{earnedPct}% earned ({fmt(realRev)})</span>
              <span style={{ color: "var(--r)", fontSize: "11px" }}>{lostPct}% lost to RTOs & cancels</span>
            </div>
          </div>

          <div style={styles.revBottom}>
            <div style={styles.rbi}>
              <div style={styles.rbiLabel}>PREPAID REVENUE</div>
              <div style={styles.rbiVal}>{fmt(summary.prepaidRevenue)}</div>
              <div style={styles.rbiSub}>{prepaidOrders} orders ({prepaidPct}%)</div>
              <div style={styles.rbiBar}>
                <div style={{ ...styles.rbiBarFill, width: `${Math.min(prepaidPct, 100)}%`, background: "var(--g)" }}></div>
              </div>
            </div>

            <div style={{ ...styles.rbi, borderRight: "none" }}>
              <div style={styles.rbiLabel}>COD REVENUE</div>
              <div style={{ ...styles.rbiVal, color: "var(--y)" }}>{fmt(summary.codRevenue)}</div>
              <div style={styles.rbiSub}>{codOrders} orders ({codPct}%)</div>
              <div style={styles.rbiBar}>
                <div style={{ ...styles.rbiBarFill, width: `${Math.min(codPct, 100)}%`, background: "var(--y)" }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Where Money Goes Waterfall */}
        <div style={styles.wfCard}>
          <div style={styles.wfHd}>Where Your Money Goes</div>
          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ra)" }}>📢</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Ad Spend</div>
              <div style={styles.wfTag}>Meta Ads · {totalCosts > 0 ? ((adsSpend / totalCosts) * 100).toFixed(1) : 0}%</div>
            </div>
            <div style={styles.wfAmt}>{fmt(adsSpend)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ya)" }}>📦</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Product Cost (COGS)</div>
              <div style={styles.wfTag}>{totalCosts > 0 ? ((cogs / totalCosts) * 100).toFixed(1) : 0}%</div>
            </div>
            <div style={styles.wfAmt}>{fmt(cogs)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "rgba(168, 85, 247, 0.15)" }}>👥</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Team Salaries & Overheads</div>
              <div style={styles.wfTag}>Fixed expenses</div>
            </div>
            <div style={styles.wfAmt}>{fmt(salaries + rent + agency)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ba)" }}>🚚</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Shipping Spend</div>
              <div style={styles.wfTag}>Shiprocket / Courier</div>
            </div>
            <div style={styles.wfAmt}>{fmt(shippingSpend)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--s4)" }}>💳</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Gateway & Payment Fees</div>
              <div style={styles.wfTag}>PG Fees</div>
            </div>
            <div style={styles.wfAmt}>{fmt(gateway)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ra)" }}>↩️</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Return Handling Cost</div>
              <div style={styles.wfTag}>{rtoOrders} returns</div>
            </div>
            <div style={styles.wfAmt}>{fmt(rtoHandling)}</div>
          </div>

          <div style={{ ...styles.wfRow, background: "var(--s2)" }}>
            <div style={{ ...styles.wfIco, background: "var(--s4)" }}>Σ</div>
            <div style={styles.wfInfo}>
              <div style={{ ...styles.wfName, fontWeight: 700 }}>Total Costs</div>
            </div>
            <div style={{ ...styles.wfAmt, color: "var(--r)", fontSize: "15px", fontWeight: 800 }}>
              {fmt(totalCosts)}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. AD PERFORMANCE ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Ad Performance</span></div>
      <div style={styles.adPerfCard}>
        <div style={styles.apcHd}>
          <div style={styles.apcLabel}>HOW YOUR ADS ARE PERFORMING</div>
          <div style={styles.roasPoasRow}>
            <div style={styles.rpBox}>
              <div style={styles.rpLabel}>ROAS — Revenue earned per ₹1 spent on ads</div>
              <div style={{ ...styles.rpVal, color: "var(--y)" }}>{summary.roas || 0}</div>
              <div style={styles.rpContext}>
                You generate <b>₹{summary.roas || 0} revenue</b> for every ₹1 spent on ads. But revenue is not profit — it includes product, shipping and returns.
              </div>
            </div>

            <div style={styles.rpBox}>
              <div style={styles.rpLabel}>POAS — Profit earned per ₹1 spent on ads</div>
              <div style={{ ...styles.rpVal, color: (summary.poas || 0) >= 0 ? "var(--g)" : "var(--r)" }}>
                {summary.poas || 0}
              </div>
              <div style={styles.rpContext}>
                After subtracting variable costs, your POAS is <b>{summary.poas || 0}</b>. A healthy target is {">"} 1.0 to ensure true net business growth.
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginTop: "10px" }}>
            <div style={styles.miniStatCard}>
              <div style={styles.miniStatLabel}>ROAS Needed to Break Even</div>
              <div style={{ ...styles.miniStatVal, color: "var(--y)" }}>{summary.breakEvenROAS || 0}</div>
              <div style={styles.miniStatDesc}>Required to cover product and delivery costs</div>
            </div>

            <div style={styles.miniStatCard}>
              <div style={styles.miniStatLabel}>Profit After Ads & Products</div>
              <div style={{ ...styles.miniStatVal, color: (summary.contributionProfit || 0) >= 0 ? "var(--g)" : "var(--r)" }}>
                {fmt(summary.contributionProfit)}
              </div>
              <div style={styles.miniStatDesc}>Operating margin: {summary.contributionMargin || 0}%</div>
            </div>

            <div style={styles.miniStatCard}>
              <div style={styles.miniStatLabel}>Total Ad Spend</div>
              <div style={styles.miniStatVal}>{fmt(adsSpend)}</div>
              <div style={styles.miniStatDesc}>Across all connected ad accounts</div>
            </div>
          </div>
        </div>

        <div style={styles.insightStrip}>
          <span>💡</span>
          <span>Break-even ROAS is <strong>{summary.breakEvenROAS || 0}</strong>. Campaigns performing below this number are losing money on every order once packaging and shipping are deducted.</span>
        </div>
      </div>

      {/* ── 6. ORDER HEALTH | PAYMENT SPLIT | PER ORDER NUMBERS ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Order & Payment Health</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
        {/* Order Health */}
        <div style={styles.ohCard}>
          <div style={styles.cardHeaderTitle}>TOTAL ORDERS THIS MONTH</div>
          <div style={styles.ohTotal}>{totalOrders}</div>
          <div style={styles.ohSub}>Across all order fulfillment stages</div>

          <div style={styles.ohBar}>
            <div style={{ width: `${(deliveredOrders / (totalOrders || 1)) * 100}%`, background: "var(--g)", height: "100%" }}></div>
            <div style={{ width: `${(rtoOrders / (totalOrders || 1)) * 100}%`, background: "var(--r)", height: "100%" }}></div>
            <div style={{ width: `${(cancelledOrders / (totalOrders || 1)) * 100}%`, background: "var(--y)", height: "100%" }}></div>
            <div style={{ flex: 1, background: "rgba(91,140,255,.5)", height: "100%" }}></div>
          </div>

          <div style={styles.ohLegend}>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "var(--g)" }}></span>
              <span style={styles.ohlLabel}>Delivered</span>
              <span style={styles.ohlVal}>{deliveredOrders}</span>
              <span style={{ color: "var(--g)", fontSize: "11px" }}>{((deliveredOrders / (totalOrders || 1)) * 100).toFixed(1)}%</span>
            </div>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "var(--r)" }}></span>
              <span style={styles.ohlLabel}>Returned (RTO)</span>
              <span style={styles.ohlVal}>{rtoOrders}</span>
              <span style={{ color: "var(--r)", fontSize: "11px" }}>{((rtoOrders / (totalOrders || 1)) * 100).toFixed(1)}%</span>
            </div>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "var(--y)" }}></span>
              <span style={styles.ohlLabel}>Cancelled</span>
              <span style={styles.ohlVal}>{cancelledOrders}</span>
              <span style={{ color: "var(--y)", fontSize: "11px" }}>{((cancelledOrders / (totalOrders || 1)) * 100).toFixed(1)}%</span>
            </div>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "#5b8cff" }}></span>
              <span style={styles.ohlLabel}>Still Moving / In-Transit</span>
              <span style={styles.ohlVal}>{movingOrders}</span>
              <span style={{ color: "#5b8cff", fontSize: "11px" }}>{((movingOrders / (totalOrders || 1)) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Payment Split */}
        <div style={styles.payCard}>
          <div style={styles.cardHeaderTitle}>HOW CUSTOMERS PAID</div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "var(--g)", letterSpacing: "-.05em", marginBottom: "4px" }}>
            {prepaidPct}% Prepaid
          </div>
          <div style={{ fontSize: "12px", color: "var(--t2)", marginBottom: "14px" }}>
            Prepaid orders have near zero cancellation rate
          </div>

          <div style={styles.payBar}>
            <div style={{ width: `${prepaidPct}%`, background: "var(--g)", height: "100%" }}></div>
            <div style={{ width: `${codPct}%`, background: "var(--y)", height: "100%" }}></div>
          </div>

          <div style={styles.payLegend}>
            <div style={styles.plRow}>
              <span style={{ ...styles.plDot, background: "var(--g)" }}></span>
              <span style={styles.plLabel}>Paid online (Prepaid)</span>
              <span style={styles.plVal}>{prepaidOrders}</span>
              <span style={{ color: "var(--g)" }}>{prepaidPct}%</span>
            </div>
            <div style={styles.plRow}>
              <span style={{ ...styles.plDot, background: "var(--y)" }}></span>
              <span style={styles.plLabel}>Pay on Delivery (COD)</span>
              <span style={styles.plVal}>{codOrders}</span>
              <span style={{ color: "var(--y)" }}>{codPct}%</span>
            </div>
            <div style={styles.plRow}>
              <span style={{ ...styles.plDot, background: "var(--b)" }}></span>
              <span style={styles.plLabel}>Partial COD</span>
              <span style={styles.plVal}>{summary.partialCodOrders || 0}</span>
              <span style={{ color: "var(--b)" }}>
                {(((summary.partialCodOrders || 0) / (totalOrders || 1)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Per Order Numbers */}
        <div style={styles.poeCard}>
          <div style={styles.cardHeaderTitle}>PER ORDER NUMBERS</div>
          <div style={{ ...styles.poeHero, color: (summary.profitPerOrder || 0) >= 0 ? "var(--g)" : "var(--r)" }}>
            {fmt(summary.profitPerOrder)}
          </div>
          <div style={styles.poeSub}>
            Net contribution per completed shipment
          </div>

          <div style={styles.poeGrid}>
            <div style={styles.poeItem}>
              <div style={styles.poeLabel}>Shipping / order</div>
              <div style={styles.poeVal}>{fmt(summary.shippingPerOrder)}</div>
            </div>
            <div style={styles.poeItem}>
              <div style={styles.poeLabel}>Real AOV</div>
              <div style={styles.poeVal}>{fmt(summary.realaov)}</div>
            </div>
            <div style={styles.poeItem}>
              <div style={styles.poeLabel}>Average Order Value</div>
              <div style={styles.poeVal}>{fmt(summary.aov)}</div>
            </div>
            <div style={styles.poeItem}>
              <div style={styles.poeLabel}>Shipping as %</div>
              <div style={{ ...styles.poeVal, color: "var(--r)" }}>
                {realRev > 0 ? ((shippingSpend / realRev) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 7. PRODUCT PROFITABILITY TABLE ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Product Profitability</span></div>
      <div style={styles.prodCard}>
        <table style={styles.prodTable}>
          <thead>
            <tr style={styles.prodThRow}>
              <th style={{ ...styles.prodTh, textAlign: "left" }}>PRODUCT NAME</th>
              <th style={{ ...styles.prodTh, textAlign: "center" }}>DELIVERED</th>
              <th style={{ ...styles.prodTh, textAlign: "right" }}>REVENUE EARNED</th>
              <th style={{ ...styles.prodTh, textAlign: "right" }}>PRODUCT COST (COGS)</th>
              <th style={{ ...styles.prodTh, textAlign: "right" }}>GROSS PROFIT</th>
            </tr>
          </thead>
          <tbody>
            {topProducts && topProducts.length > 0 ? (
              topProducts.map((p, idx) => (
                <tr key={idx} style={styles.prodTr}>
                  <td style={styles.prodTdName}>{p.name}</td>
                  <td style={{ ...styles.prodTd, textAlign: "center", color: "var(--t2)" }}>
                    {p.deliveredQty || 0}
                  </td>
                  <td style={{ ...styles.prodTd, textAlign: "right" }}>{fmt(p.revenue)}</td>
                  <td style={{ ...styles.prodTd, textAlign: "right", color: "var(--t2)" }}>
                    {fmt(p.cogs)}
                  </td>
                  <td style={{ ...styles.prodTd, textAlign: "right", color: "var(--g)", fontWeight: 700 }}>
                    {fmt(p.profit)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ padding: "28px", textAlign: "center", color: "var(--t3)", fontStyle: "italic" }}>
                  No product profitability records for this period. Add COGS in Products tab to unlock.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 8. COST LEAKAGE ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Cost Leakage (Where Money Is Leaking)</span></div>
      <div style={styles.lkGrid}>
        <div style={styles.lk}>
          <div style={styles.lkLabel}>SHIPPING SPENT</div>
          <div style={{ ...styles.lkVal, color: "var(--r)" }}>{fmt(shippingSpend)}</div>
          <div style={styles.lkSub}>{summary.totalShipments || 0} shipments total</div>
        </div>

        <div style={styles.lk}>
          <div style={styles.lkLabel}>FIXED OVERHEADS (30D)</div>
          <div style={styles.lkVal}>{fmt(salaries + rent + agency)}</div>
          <div style={styles.lkSub}>Monthly salaries + rent ÷ 30</div>
        </div>

        <div style={styles.lk}>
          <div style={styles.lkLabel}>GATEWAY CHARGES</div>
          <div style={styles.lkVal}>{fmt(gateway)}</div>
          <div style={styles.lkSub}>Prepaid delivered processing</div>
        </div>

        <div style={styles.lk}>
          <div style={styles.lkLabel}>RTO HANDLING FEES</div>
          <div style={styles.lkVal}>{fmt(rtoHandling)}</div>
          <div style={styles.lkSub}>{rtoOrders} returned shipments</div>
        </div>

        <div style={styles.lk}>
          <div style={styles.lkLabel}>REVENUE LOST TO RTO</div>
          <div style={{ ...styles.lkVal, color: "var(--r)" }}>{fmt(rtoLost)}</div>
          <div style={styles.lkSub}>Gross sale value lost</div>
        </div>
      </div>

      {/* ── 9. PENDING OUTCOME (ORDERS STILL MOVING) ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Orders Still Moving (Pending Outcome)</span></div>
      <div style={styles.pendingGrid}>
        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>CURRENTLY WITH COURIER</div>
          <div style={styles.pgVal}>{forecast.inTransit || movingOrders}</div>
          <div style={styles.pgSub}>Orders actively in transit</div>
        </div>

        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>EXPECTED TO DELIVER</div>
          <div style={{ ...styles.pgVal, color: "var(--g)" }}>{forecast.expectedDelivered || 0}</div>
          <div style={styles.pgSub}>{forecast.successRate || 85}% estimated success rate</div>
        </div>

        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>EXPECTED REVENUE COMING</div>
          <div style={{ ...styles.pgVal, color: "var(--g)" }}>{fmt(forecast.expectedRevenue)}</div>
          <div style={styles.pgSub}>Estimated realization upon delivery</div>
        </div>

        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>DELIVERY RISK LEVEL</div>
          <div style={{ ...styles.pgVal, color: forecast.riskLevel === "Low Risk" ? "var(--g)" : "var(--y)" }}>
            {forecast.riskLevel || "Moderate"}
          </div>
          <div style={styles.pgSub}>Tracked via carrier NDR telemetry</div>
        </div>
      </div>

      {/* ── 10. DAILY PROFIT & LOSS CHART ── */}
      <div style={styles.sdiv}><span style={styles.sdivText}>Daily Profit & Loss</span></div>
      <div style={styles.chartCard}>
        <div style={styles.chartHd}>
          <div>
            <div style={styles.chartTitle}>Daily Profit Status</div>
            <div style={styles.chartSub}>
              Green = Profit day · Red = Loss day · Dynamic based on IST business calendar
            </div>
          </div>
          <div style={styles.chartLegend}>
            <div style={styles.clItem}>
              <div style={{ ...styles.clDot, background: "var(--g)" }}></div>Profit Day
            </div>
            <div style={styles.clItem}>
              <div style={{ ...styles.clDot, background: "var(--r)" }}></div>Loss Day
            </div>
          </div>
        </div>

        <div style={{ height: "260px", width: "100%", marginTop: "16px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedChartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                stroke="#3d5442"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#3d5442"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${v >= 1000 || v <= -1000 ? Math.round(v / 1000) + "k" : v}`}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
                formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Net Profit"]}
                contentStyle={{
                  backgroundColor: "#0f1e13",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#dceee2",
                  fontSize: "12px",
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Bar dataKey="netProfit" radius={[3, 3, 0, 0]}>
                {formattedChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.netProfit >= 0 ? "#00d46a" : "#ff3355"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 11. REVENUE BREAKDOWN CHART ── */}
      <div style={styles.chartCard}>
        <div style={styles.chartHd}>
          <div>
            <div style={styles.chartTitle}>Revenue Breakdown</div>
            <div style={styles.chartSub}>
              How your {fmt(realRev)} earned revenue is distributed across costs
            </div>
          </div>
        </div>

        <div style={{ height: "240px", width: "100%", marginTop: "16px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moneyFlowData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#3d5442" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#3d5442"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${Math.round(Math.abs(v) / 1000)}k`}
              />
              <Tooltip
                formatter={(v) => [`₹${Math.abs(v).toLocaleString("en-IN")}`, "Amount"]}
                contentStyle={{
                  backgroundColor: "#0f1e13",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#dceee2",
                  fontSize: "12px",
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {moneyFlowData.map((entry, index) => (
                  <Cell
                    key={`mf-cell-${index}`}
                    fill={entry.type === "positive" ? "#00d46a" : "#ff3355"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};

// ── EXACT CSS DESIGN SYSTEM FROM PROTOTYPE ─────────────────────────
const styles = {
  dashboardContainer: {
    padding: "24px 28px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    maxWidth: "1380px",
    margin: "0 auto",
    color: "var(--t1)",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  loadingScreen: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "80vh",
    gap: "16px",
  },
  loadingText: {
    color: "#00d46a",
    fontSize: "12px",
    fontWeight: "800",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  refreshingBadge: {
    position: "fixed",
    top: "20px",
    right: "24px",
    zIndex: 200,
    background: "#00d46a",
    padding: "6px 14px",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    boxShadow: "0 6px 20px rgba(0,212,106,0.3)",
  },
  pageHd: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  pageTitle: {
    fontSize: "24px",
    fontWeight: "900",
    color: "var(--t1)",
    letterSpacing: "-.03em",
  },
  pagePeriod: {
    fontSize: "12px",
    color: "var(--t2)",
    marginTop: "3px",
  },
  btnIcon: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "8px",
    padding: "8px 11px",
    color: "var(--t2)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  btnSync: {
    background: "#00d46a",
    color: "#000",
    border: "none",
    borderRadius: "8px",
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: "800",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
  },
  tbPeriod: {
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--t1)",
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "8px",
    padding: "8px 14px",
    cursor: "pointer",
  },
  dateDropdown: {
    position: "absolute",
    right: 0,
    marginTop: "8px",
    zIndex: 200,
  },

  // 1. Multi Ad Account Bar
  adAccountBar: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    padding: "14px 18px",
  },
  aabLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "var(--t3)",
    marginBottom: "10px",
    letterSpacing: ".06em",
  },
  aabPills: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  accPill: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "7px 12px",
    borderRadius: "8px",
    border: "1.5px solid var(--bd2)",
    background: "var(--s2)",
    fontSize: "12px",
    color: "var(--t2)",
    cursor: "pointer",
    transition: "all .16s",
  },
  accPillOn: {
    borderColor: "var(--g)",
    background: "var(--gb)",
    color: "var(--t1)",
  },
  accPillDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  accPillSpend: {
    fontSize: "11px",
    color: "var(--t2)",
  },
  roasTag: {
    fontSize: "10px",
    fontWeight: "800",
    padding: "2px 6px",
    borderRadius: "5px",
    background: "var(--ya)",
    color: "var(--y)",
  },
  accPillCheck: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "var(--g)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "8px",
    color: "#000",
    fontWeight: "900",
  },
  aabCombined: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "var(--t2)",
    paddingLeft: "12px",
    borderLeft: "1px solid var(--bd)",
  },

  // 2. Score Card (Headline)
  scoreCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "14px",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  scTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "20px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },
  scEyebrow: {
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".06em",
    marginBottom: "6px",
  },
  scNumber: {
    fontSize: "52px",
    fontWeight: "900",
    letterSpacing: "-.08em",
    lineHeight: 1,
    marginBottom: "6px",
  },
  scSub: {
    fontSize: "13px",
    color: "var(--t2)",
  },
  scBreakdown: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  scb: {
    background: "var(--s2)",
    border: "1px solid var(--bd)",
    borderRadius: "10px",
    padding: "10px 16px",
    minWidth: "115px",
  },
  scbLabel: {
    fontSize: "10px",
    color: "var(--t3)",
    marginBottom: "4px",
    fontWeight: "600",
  },
  scbVal: {
    fontSize: "15px",
    fontWeight: "800",
    color: "var(--t1)",
  },
  scInsightRed: {
    background: "var(--ra)",
    border: "1px solid rgba(255,51,85,.2)",
    borderRadius: "8px",
    padding: "11px 14px",
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "12.5px",
    color: "var(--t2)",
    lineHeight: "1.55",
  },
  scInsightGreen: {
    background: "var(--ga)",
    border: "1px solid rgba(0,212,106,.2)",
    borderRadius: "8px",
    padding: "11px 14px",
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "12.5px",
    color: "var(--t2)",
    lineHeight: "1.55",
  },

  // 3. Tile Row
  tileRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "12px",
  },
  tile: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    padding: "18px 16px",
  },
  tileLabel: {
    fontSize: "10.5px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".04em",
    marginBottom: "10px",
  },
  tileNum: {
    fontSize: "30px",
    fontWeight: "900",
    letterSpacing: "-.06em",
    lineHeight: 1,
    marginBottom: "5px",
  },
  tileSub: {
    fontSize: "11.5px",
    color: "var(--t2)",
    lineHeight: "1.4",
  },
  tileBar: {
    height: "3px",
    background: "var(--s4)",
    borderRadius: "2px",
    overflow: "hidden",
    marginTop: "10px",
  },
  tileBarFill: {
    height: "100%",
    borderRadius: "2px",
  },
  tileTagRed: {
    display: "inline-flex",
    fontSize: "9.5px",
    fontWeight: "800",
    padding: "2px 7px",
    borderRadius: "5px",
    background: "var(--ra)",
    color: "var(--r)",
    marginTop: "8px",
  },

  // Dividers
  sdiv: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginTop: "6px",
  },
  sdivText: {
    fontSize: "18px",
    fontWeight: "900",
    color: "var(--t1)",
    letterSpacing: "-.3px",
  },

  // 4. Revenue Card
  revCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  revCardLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "var(--t3)",
    marginBottom: "12px",
    letterSpacing: ".04em",
  },
  revNums: {
    display: "flex",
    marginBottom: "14px",
  },
  rnFirst: {
    flex: 1,
    paddingRight: "14px",
    borderRight: "1px solid var(--bd)",
  },
  rn: {
    flex: 1,
    padding: "0 14px",
    borderRight: "1px solid var(--bd)",
  },
  rnLast: {
    flex: 1,
    paddingLeft: "14px",
  },
  rnLabel: {
    fontSize: "10.5px",
    color: "var(--t2)",
    marginBottom: "4px",
  },
  rnVal: {
    fontSize: "22px",
    fontWeight: "900",
    letterSpacing: "-.05em",
    color: "var(--t1)",
  },
  revBarTrack: {
    height: "8px",
    background: "var(--s4)",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "6px",
  },
  revBarEarned: {
    height: "100%",
    background: "linear-gradient(90deg, #00d46a, #009e4f)",
    borderRadius: "4px",
  },
  revPctRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  revBottom: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    borderTop: "1px solid var(--bd)",
  },
  rbi: {
    padding: "14px 18px",
    borderRight: "1px solid var(--bd)",
  },
  rbiLabel: {
    fontSize: "9.5px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".05em",
    marginBottom: "4px",
  },
  rbiVal: {
    fontSize: "18px",
    fontWeight: "900",
    color: "var(--t1)",
  },
  rbiSub: {
    fontSize: "11px",
    color: "var(--t2)",
    marginTop: "2px",
  },
  rbiBar: {
    height: "3px",
    background: "var(--s4)",
    borderRadius: "2px",
    overflow: "hidden",
    marginTop: "8px",
  },
  rbiBarFill: {
    height: "100%",
    borderRadius: "2px",
  },

  // 4b. Waterfall Card
  wfCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  wfHd: {
    padding: "14px 18px 8px",
    fontSize: "10px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".06em",
  },
  wfRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 18px",
    borderBottom: "1px solid var(--bd)",
  },
  wfIco: {
    width: "26px",
    height: "26px",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    flexShrink: 0,
  },
  wfInfo: {
    flex: 1,
    minWidth: 0,
  },
  wfName: {
    fontSize: "12.5px",
    fontWeight: "600",
    color: "var(--t1)",
  },
  wfTag: {
    fontSize: "10px",
    color: "var(--t3)",
  },
  wfAmt: {
    fontSize: "13px",
    fontWeight: "700",
    color: "var(--t1)",
    textAlign: "right",
  },

  // 5. Ad Performance Card
  adPerfCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  apcHd: {
    padding: "18px 20px",
  },
  apcLabel: {
    fontSize: "10.5px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".06em",
    marginBottom: "12px",
  },
  roasPoasRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  rpBox: {
    background: "var(--s2)",
    border: "1px solid var(--bd)",
    borderRadius: "10px",
    padding: "14px 16px",
  },
  rpLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "var(--t3)",
    marginBottom: "6px",
  },
  rpVal: {
    fontSize: "26px",
    fontWeight: "900",
    letterSpacing: "-.06em",
    marginBottom: "6px",
  },
  rpContext: {
    fontSize: "11px",
    color: "var(--t2)",
    lineHeight: "1.5",
  },
  miniStatCard: {
    background: "var(--s2)",
    border: "1px solid var(--bd)",
    borderRadius: "8px",
    padding: "11px 14px",
  },
  miniStatLabel: {
    fontSize: "9.5px",
    color: "var(--t3)",
    fontWeight: "700",
    marginBottom: "4px",
  },
  miniStatVal: {
    fontSize: "18px",
    fontWeight: "900",
    color: "var(--t1)",
  },
  miniStatDesc: {
    fontSize: "10px",
    color: "var(--t3)",
    marginTop: "2px",
  },
  insightStrip: {
    padding: "11px 20px",
    background: "var(--ya)",
    borderTop: "1px solid rgba(245,166,35,.2)",
    fontSize: "12px",
    color: "var(--t2)",
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
  },

  // 6. 3-Card Grid (Order Health, etc.)
  ohCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    padding: "18px 20px",
  },
  cardHeaderTitle: {
    fontSize: "10.5px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".05em",
    marginBottom: "10px",
  },
  ohTotal: {
    fontSize: "38px",
    fontWeight: "900",
    letterSpacing: "-.08em",
    color: "var(--y)",
    lineHeight: 1,
    marginBottom: "4px",
  },
  ohSub: {
    fontSize: "12px",
    color: "var(--t2)",
    marginBottom: "14px",
  },
  ohBar: {
    display: "flex",
    height: "8px",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "12px",
    gap: "1px",
  },
  ohLegend: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  ohlRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
  },
  ohlDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  ohlLabel: {
    flex: 1,
    color: "var(--t2)",
  },
  ohlVal: {
    fontWeight: "700",
    color: "var(--t1)",
  },

  payCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    padding: "18px 20px",
  },
  payBar: {
    display: "flex",
    height: "8px",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "14px",
  },
  payLegend: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  plRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
  },
  plDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  plLabel: {
    flex: 1,
    color: "var(--t2)",
  },
  plVal: {
    fontWeight: "700",
    color: "var(--t1)",
  },

  poeCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    padding: "18px 20px",
  },
  poeHero: {
    fontSize: "38px",
    fontWeight: "900",
    letterSpacing: "-.08em",
    lineHeight: 1,
    marginBottom: "4px",
  },
  poeSub: {
    fontSize: "12px",
    color: "var(--t2)",
    marginBottom: "14px",
  },
  poeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },
  poeItem: {
    background: "var(--s2)",
    border: "1px solid var(--bd)",
    borderRadius: "8px",
    padding: "10px 12px",
  },
  poeLabel: {
    fontSize: "9.5px",
    color: "var(--t3)",
    fontWeight: "600",
    marginBottom: "3px",
  },
  poeVal: {
    fontSize: "15px",
    fontWeight: "800",
    color: "var(--t1)",
  },

  // 7. Product Profitability Table
  prodCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  prodTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  prodThRow: {
    background: "var(--s2)",
    borderBottom: "1px solid var(--bd)",
  },
  prodTh: {
    fontSize: "9.5px",
    fontWeight: "700",
    color: "var(--t3)",
    padding: "11px 18px",
    letterSpacing: ".06em",
  },
  prodTr: {
    borderBottom: "1px solid var(--bd)",
  },
  prodTdName: {
    padding: "13px 18px",
    fontSize: "12.5px",
    fontWeight: "600",
    color: "var(--t1)",
    maxWidth: "320px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  prodTd: {
    padding: "13px 18px",
    fontSize: "12.5px",
    color: "var(--t1)",
  },

  // 8. Cost Leakage
  lkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "12px",
  },
  lk: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "10px",
    padding: "14px 16px",
  },
  lkLabel: {
    fontSize: "9.5px",
    fontWeight: "700",
    color: "var(--t3)",
    letterSpacing: ".06em",
    marginBottom: "8px",
  },
  lkVal: {
    fontSize: "20px",
    fontWeight: "900",
    letterSpacing: "-.05em",
    color: "var(--t1)",
  },
  lkSub: {
    fontSize: "10.5px",
    color: "var(--t3)",
    marginTop: "4px",
  },

  // 9. Pending Outcome Grid
  pendingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "12px",
  },
  pgCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "10px",
    padding: "15px 18px",
  },
  pgLabel: {
    fontSize: "9.5px",
    fontWeight: "700",
    color: "var(--t3)",
    marginBottom: "8px",
    letterSpacing: ".05em",
  },
  pgVal: {
    fontSize: "26px",
    fontWeight: "900",
    letterSpacing: "-.07em",
    lineHeight: 1,
    marginBottom: "4px",
    color: "var(--t1)",
  },
  pgSub: {
    fontSize: "11px",
    color: "var(--t2)",
  },

  // 10. Chart Cards
  chartCard: {
    background: "var(--s1)",
    border: "1px solid var(--bd)",
    borderRadius: "12px",
    padding: "20px 22px",
  },
  chartHd: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartTitle: {
    fontSize: "15px",
    fontWeight: "800",
    color: "var(--t1)",
  },
  chartSub: {
    fontSize: "12px",
    color: "var(--t2)",
    marginTop: "2px",
  },
  chartLegend: {
    display: "flex",
    gap: "12px",
    fontSize: "11px",
    color: "var(--t2)",
  },
  clItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  clDot: {
    width: "8px",
    height: "8px",
    borderRadius: "2px",
  },
};

// Global Scoped Stylesheet for CSS variables and tabs
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  :root {
    --bg:#070f09;--s1:#0b1710;--s2:#0f1e13;--s3:#132016;--s4:#1a2d1f;--s5:#213626;
    --bd:rgba(255,255,255,.06);--bd2:rgba(255,255,255,.10);
    --g:#00d46a;--ga:rgba(0,212,106,.12);--gb:rgba(0,212,106,.06);
    --r:#ff3355;--ra:rgba(255,51,85,.13);--rb:rgba(255,51,85,.07);
    --y:#f5a623;--ya:rgba(245,166,35,.13);
    --b:#5b8cff;--ba:rgba(91,140,255,.12);
    --t1:#dceee2;--t2:#7a9b82;--t3:#3d5442;--t4:#243529;
  }
`;
document.head.appendChild(styleSheet);

export default Dashboard;