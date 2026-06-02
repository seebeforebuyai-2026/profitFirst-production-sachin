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

const Row = ({ label, value, valueColor = "text-white" }) => (
  <div className="flex justify-between items-center py-[14px] last-of-type:border-none py-2">
    <div className="text-sm text-[#8f8f8f]">{label}</div>
    <div className={`text-[15px] font-bold ${valueColor}`}>{value}</div>
  </div>
);

const RowNew = ({ label, amount, orders, amountColor = "text-white" }) => {
  return (
    <div className="group flex items-center justify-between rounded-2xl bg-[#151515] px-5 py-4 transition-all duration-200 hover:bg-[#1a1a1a]">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="truncate text-[14px] font-medium text-[#8f8f8f]">
          {label}
        </span>

        <span className={`text-[16px] font-bold tracking-tight ${amountColor}`}>
          ₹{amount.toLocaleString()}
        </span>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[12px] uppercase tracking-wider text-[#666]">
          Orders
        </span>

        <span className="text-[16px] font-semibold text-white">{orders}</span>
      </div>
    </div>
  );
};
const Highlight = ({ text }) => (
  <div className="mt-5 p-[18px] bg-[#161616] rounded-[16px] text-sm leading-relaxed text-[#b8b8b8]">
    {text}
  </div>
);

const SideCard = ({
  title,
  bigNumber,
  bigNumberColor = "text-white",
  subtext,
  children,
}) => (
  <div className="bg-[#0f0f0f] border border-[#1b1b1b] rounded-[24px] p-[26px]">
    <div className="text-[13px] uppercase tracking-[1px] text-[#8f8f8f] mb-[22px] font-semibold">
      {title}
    </div>
    <div className={`text-[40px] font-extrabold mb-3 ${bigNumberColor}`}>
      {bigNumber}
    </div>
    <div className="text-sm leading-relaxed text-[#9d9d9d]">{subtext}</div>
    <div className="mt-[34px]"></div>
    {children}
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

  const formatCurrency = (num) =>
    `₹${Number(num || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

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

    return data.chartData
      .map((day) => {
        if (!day?.date) {
          console.warn("Missing date in chartData:", day);
          return null;
        }

        return {
          name: format(parseISO(day.date), "MMM dd"),
          netProfit: Number(day.moneyKept || 0),
        };
      })
      .filter(Boolean);
  }, [data]);

  // 🟢 Real Money Flow Mapping
  const moneyFlowData = useMemo(() => {
    if (!data?.moneyFlowData) return [];
    return data.moneyFlowData;
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

      <section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr",
            gap: "32px",
          }}
        >
          {/* LEFT PANEL */}
          <div
            style={{
              border: "1px solid #1b1b1b",
              borderRadius: "26px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "18px",
              }}
            >
              {/* Gross Revenue */}
              <div
                style={{
                  background: "#151515",
                  border: "1px solid #1f1f1f",
                  borderRadius: "20px",
                  padding: "22px",
                  color: "#e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Gross Revenue
                </div>

                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                  }}
                >
                  ₹{summary.revenueGenerated?.toLocaleString()}
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Total Shopify revenue before cancellations and returns.
                </div>
              </div>

              {/* Real Revenue */}
              <div
                style={{
                  background: "#151515",
                  border: "1px solid #1f1f1f",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Real Revenue
                </div>

                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "#22d37d",
                  }}
                >
                  {formatCurrency(summary.revenueEarned || 0)}
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Actual money generated from delivered orders.
                </div>
              </div>

              {/* Contribution Profit */}
              <div
                style={{
                  background: "#151515",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Contribution Profit
                </div>

                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "#ffcc4d",
                  }}
                >
                  {formatCurrency(summary.contributionProfit || 0)}
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Profit remaining after variable operational costs but before
                  fixed business expenses.
                </div>

                <div style={{ marginTop: "34px" }} />

                <Row
                  label="Contribution Cost"
                  value={`${summary.contributionCost || 0}`}
                  valueColor="text-[#ff6262]"
                  style={{ borderBottom: "none" }}
                />
                <Row
                  label="Contribution Margin"
                  value={`${summary.contributionMargin || 0}%`}
                  valueColor="text-[#ffcc4d]"
                  style={{ borderBottom: "none" }}
                />

                <Row
                  label="Break-even ROAS"
                  value={`${summary.breakEvenROAS || 0}`}
                />
                <Row label="Current ROAS" value={`${summary.roas || 0}`} />
                <Row label=" POAS" value={`${summary.poas || 0}`} />

                <Highlight text="Operationally healthy before fixed overhead expenses." />
              </div>

              {/* Total Cost */}
              <div
                style={{
                  background: "#151515",
                  border: "1px solid #1f1f1f",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Total Cost
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "#ff6262",
                  }}
                >
                  {formatCurrency(summary.totalCost || 0)}
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Complete operational spend across advertising, fulfillment and
                  product costs.
                </div>

                <div style={{ marginTop: "34px" }} />

                <Row
                  label="Ad Spend"
                  value={`${formatCurrency(summary.adsSpend || 0)}`}
                />

                <Row
                  label="COGS"
                  value={`${formatCurrency(summary.cogs || 0)}`}
                />

                <Row
                  label="Shipping Spend"
                  value={`${formatCurrency(summary.shippingSpend || 0)}`}
                />

                <Row
                  label="Gateway Fees"
                  value={`${formatCurrency(summary.gatewayFees || 0)}`}
                />

                <Row
                  label="RTO Repackaging Cost"
                  value={`${formatCurrency(summary.rtoHandlingFees || 0)}`}
                  valueColor="text-[#ff6262]"
                />
                <Row
                  label="Staff Salaries , Agency Fees & Office Rent"
                  value={`${formatCurrency(summary.staffSalary + summary.officeRent + summary.agencyFees || 0)}`}
                />

                <Highlight text="Advertising and COD losses are consuming the majority of business margin." />
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div
            style={{
              gap: "18px",
              display: "grid",
              gridTemplateRows: "repeat(2, auto)",
            }}
          >
            <div>
              {/* new matrix added  */}
              <div
                style={{
                  background: "#151515",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#fcfcfc",
                    marginBottom: "2px",
                    fontWeight: "600",
                  }}
                >
                  Revenue Intelligence
                </div>

                <RowNew
                  label="Prepaid Revenue"
                  amount={summary.prepaidRevenue || 0}
                  orders={summary.prepaidOrders || 0}
                />

                <RowNew
                  label="COD Revenue"
                  amount={summary.codRevenue || 0}
                  orders={summary.codOrders || 0}
                />

                <RowNew
                  label="Revenue From Current Month Orders"
                  amount={summary.revenueFromCurrentOrders || 0}
                  orders={summary.currentOrdersCount || 0}
                />

                <RowNew
                  label="Revenue From Previous Month Orders"
                  amount={summary.revenueFromPastOrders || 0}
                  orders={summary.pastOrdersCount || 0}
                />
              </div>
            </div>

            <div
              style={{
                background: "#151515",
                border: "1px solid #1f1f1f",
                borderRadius: "20px",
                padding: "22px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  color: "#8f8f8f",
                  marginBottom: "14px",
                  fontWeight: "600",
                }}
              >
                Net Business Profit
              </div>

              <div
                style={{
                  fontSize: "40px",
                  fontWeight: "800",
                  marginBottom: "10px",
                  color: summary.moneyKept >= 0 ? "#22d37d" : "#ff6262",
                }}
              >
                {formatCurrency(summary.moneyKept || 0)}
              </div>

              <div
                style={{
                  fontSize: "14px",
                  lineHeight: "1.6",
                  color: "#9d9d9d",
                }}
              >
                Final company profit after salaries, rent, agency fees and fixed
                operational expenses.
              </div>

              <div style={{ marginTop: "34px" }} />

              <Row
                label="Profit Margin"
                value={`${summary.profitMargin || 0}%`}
              />
              {/* <Row
                label="Average Order Value"
                value={`${formatCurrency(summary.aov || 0)}`}
              /> */}

              <Row
                label="Team Salaries"
                value={`${formatCurrency(summary.staffSalary || 2)}`}
              />

              <Row
                label="Office Rent"
                value={`${formatCurrency(summary.officeRent || 2)}`}
              />

              <Row
                label="Agency Fees"
                value={`${formatCurrency(summary.agencyFees || 2)}`}
              />

              <Highlight text="Fixed overhead is currently pushing the business into negative profitability." />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div>
          <div
            style={{
              border: "1px solid #1b1b1b",
              borderRadius: "26px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "18px",
              }}
            >
              {/* ORDER HEALTH */}
              <div
                style={{
                  background: "#151515",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Order Health
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "#ffcc4d",
                  }}
                >
                  {summary.totalOrders || 0}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Overall order flow across delivery, returns and cancellations.
                </div>
                <div style={{ marginTop: "34px" }} />

                <Row
                  label="Delivered Orders"
                  value={`${summary.deliveredOrders || 0}`}
                  style={{ borderBottom: "none" }}
                />
                <Row label="RTO Orders" value={`${summary.rtoOrders || 0}`} />
                <Row
                  label="Cancelled Orders"
                  value={`${summary.cancelledOrders || 0}`}
                />
              </div>

              {/* PAYMENT BEHAVIOR */}
              <div
                style={{
                  background: "#151515",
                  border: "1px solid #1f1f1f",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Payment Behavior
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "#22d37d",
                  }}
                >
                  {summary.totalOrders - summary.cancelledOrders || 0}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Customer payment distribution across prepaid, COD and partial
                  COD.
                </div>
                <div style={{ marginTop: "34px" }} />

                <Row
                  label="Prepaid Orders"
                  value={`${summary.prepaidOrders || 0}`}
                />
                <Row label="COD Orders" value={`${summary.codOrders || 0}`} />
                <Row
                  label="Partial COD Orders"
                  value={`${summary.partialCodOrders || 0}`}
                />
              </div>

              {/* UNIT ECONOMICS */}
              <div
                style={{
                  background: "#151515",
                  border: "1px solid #1f1f1f",
                  borderRadius: "20px",
                  padding: "22px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    color: "#8f8f8f",
                    marginBottom: "14px",
                    fontWeight: "600",
                  }}
                >
                  Unit Economics
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "#ff6262",
                  }}
                >
                  {formatCurrency(summary.profitPerOrder || 0)}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#9d9d9d",
                  }}
                >
                  Per-order efficiency and profitability metrics.
                </div>
                <div style={{ marginTop: "34px" }} />

                <Row
                  label="Shipping / Order"
                  value={`${formatCurrency(summary.shippingPerOrder || 0)}`}
                />
                <Row
                  label="Real AOV"
                  value={`${formatCurrency(summary.realaov || 0)}`}
                />
                <Row
                  label="Average Order Value"
                  value={`${formatCurrency(summary.aov || 0)}`}
                />
              </div>
            </div>
          </div>
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
            value={`${formatCurrency(summary.gatewayFees || 0).toLocaleString()}`}
            subtitle="Processing Fees (Prepaid Delivered Only)"
          />
          <MetricCard
            title="Fixed Costs"
            value={`${formatCurrency(summary.businessExpenses || 0).toLocaleString()}`}
            subtitle="Monthly Overheads divided by 30"
          />
          <MetricCard
            title="RTO Revenue Lost"
            value={`${formatCurrency(summary.rtoRevenueLost || 0).toLocaleString()}`}
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
              {/* <XAxis
                dataKey="name"
                stroke="#6B7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              /> */}
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
