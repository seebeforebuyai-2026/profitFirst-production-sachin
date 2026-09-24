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
        <FiAlertCircle
          color="#ff3355"
          size={48}
          style={{ marginBottom: "16px" }}
        />
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "700",
            color: "#fff",
            marginBottom: "8px",
          }}
        >
          Sync Connection Lost
        </h2>
        <p
          style={{
            color: "#7a9b82",
            maxWidth: "420px",
            marginBottom: "24px",
            textAlign: "center",
          }}
        >
          {error}
        </p>
        <button onClick={() => fetchDashboardData(true)} style={styles.btnSync}>
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
  const rtoLost = summary.rtoRevenueLost || grossRev - realRev;
  const earnedPct = grossRev > 0 ? ((realRev / grossRev) * 100).toFixed(1) : 0;
  const lostPct = (100 - Number(earnedPct)).toFixed(1);

  const totalOrders = summary.totalOrders || 0;
  const deliveredOrders = summary.deliveredOrders || 0;
  const rtoOrders = summary.rtoOrders || 0;
  const cancelledOrders = summary.cancelledOrders || 0;
  const movingOrders = Math.max(
    0,
    totalOrders - deliveredOrders - rtoOrders - cancelledOrders,
  );

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
  const accountSpendMax = Math.max(
    ...(summary.adAccounts || []).map((account) => Number(account.spend || 0)),
    1,
  );

  const isProfitNegative = (summary.moneyKept || 0) < 0;

  return (
    <div style={styles.dashboardContainer}>
      {isRefreshing && (
        <div style={styles.refreshingBadge}>
          <PulseLoader size={4} color="#000" />
          <span
            style={{
              fontSize: "10px",
              fontWeight: "800",
              color: "#000",
              textTransform: "uppercase",
            }}
          >
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            position: "relative",
          }}
        >
          <button
            onClick={() => fetchDashboardData()}
            title="Refresh"
            style={styles.btnIcon}
          >
            <FiRefreshCw
              size={15}
              className={isRefreshing ? "animate-spin" : ""}
            />
          </button>

          <button
            onClick={handleForceSync}
            disabled={isRefreshing}
            style={styles.btnSync}
          >
            <FiRefreshCw
              size={13}
              className={isRefreshing ? "animate-spin" : ""}
            />
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
        <div style={styles.aabLabel}>
          YOUR AD ACCOUNTS — FILTER METRICS BY ACCOUNT
        </div>
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
            {selectedAccFilter === "all" && (
              <span style={styles.accPillCheck}>✓</span>
            )}
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
                <div
                  style={{ ...styles.accPillDot, background: "#5b8cff" }}
                ></div>
                <span style={{ fontWeight: 500 }}>
                  {acc.name || `Account ${idx + 1}`}
                </span>
                <span style={styles.accPillSpend}>{fmt(acc.spend || 0)}</span>
                <span style={styles.roasTag}>
                  ROAS {acc.roas || summary.roas || 0}
                </span>
                {selectedAccFilter === acc.id && (
                  <span style={styles.accPillCheck}>✓</span>
                )}
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
              <div
                style={{ ...styles.accPillDot, background: "#5b8cff" }}
              ></div>
              <span style={{ fontWeight: 500 }}>Primary Meta Account</span>
              <span style={styles.accPillSpend}>{fmt(adsSpend)}</span>
              <span style={styles.roasTag}>ROAS {summary.roas || 0}</span>
              {selectedAccFilter === "main" && (
                <span style={styles.accPillCheck}>✓</span>
              )}
            </div>
          )}

          <div style={styles.aabCombined}>
            Total: <b>{fmt(adsSpend)}</b> spent · Current ROAS{" "}
            <b style={{ color: "var(--y)" }}>{summary.roas || 0}</b>
          </div>
        </div>
      </div>

      {/* ── 2. SCORE CARD (MONEY YOU KEEP) ── */}
      <div style={styles.scoreCard}>
        <div style={styles.scTop}>
          <div>
            <div style={styles.scEyebrow}>MONEY YOU KEEP THIS MONTH</div>
            <div
              style={{
                ...styles.scNumber,
                color: isProfitNegative ? "var(--r)" : "var(--g)",
              }}
            >
              {fmt(summary.moneyKept)}
            </div>
            <div style={styles.scSub}>
              Final amount left after paying for ads, products, shipping, salary
              — everything.
            </div>
          </div>

          <div style={styles.scBreakdown}>
            <div style={styles.scb}>
              <div style={styles.scbLabel}>Profit %</div>
              <div
                style={{
                  ...styles.scbVal,
                  color: isProfitNegative ? "var(--r)" : "var(--g)",
                }}
              >
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

        <div
          style={isProfitNegative ? styles.scInsightRed : styles.scInsightGreen}
        >
          <span style={{ fontSize: "15px" }}>
            {isProfitNegative ? "⚠️" : "🚀"}
          </span>
          <div>
            {isProfitNegative ? (
              <>
                <b>
                  Fixed costs{" "}
                  {fmt(
                    summary.staffSalary +
                      summary.officeRent +
                      summary.agencyFees || 0,
                  )}{" "}
                  are eating into an already negative operating profit.
                </b>{" "}
                Even before salaries, you are losing{" "}
                {fmt(summary.contributionProfit)}. on every rupee you spend on
                ads and products. Reducing ad spend or increasing prepaid orders
                are the fastest levers.
              </>
            ) : (
              <>
                <b>Your operations are healthy and net profitable.</b> You are
                currently retaining {summary.profitMargin}% of your gross
                revenue after all operational and marketing deductions.
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. BIG 4 TILES ROW ── */}
      <div style={styles.tileRow}>
        <div style={styles.tile}>
          <div style={styles.tileLabel}>Shopify Total (before returns)</div>
          <div style={{ ...styles.tileNum, color: "var(--t1)" }}>
            {fmt(grossRev)}
          </div>
          <div style={styles.tileSub}>What Shopify shows as revenue</div>
        </div>

        <div style={styles.tile}>
          <div style={styles.tileLabel}>Money You Actually Earned</div>
          <div style={{ ...styles.tileNum, color: "var(--g)" }}>
            {fmt(realRev)}
          </div>
          <div style={styles.tileSub}>
            Only from delivered orders ({earnedPct}%)
          </div>
          <div style={styles.tileBar}>
            <div
              style={{
                ...styles.tileBarFill,
                width: `${Math.min(earnedPct, 100)}%`,
                background: "var(--g)",
              }}
            ></div>
          </div>
        </div>

        <div style={styles.tile}>
          <div style={styles.tileLabel}>Total Money Spent</div>
          <div style={{ ...styles.tileNum, color: "var(--r)" }}>
            {fmt(totalCosts)}
          </div>
          <div style={styles.tileSub}>Ads + products + shipping + salaries</div>
        </div>

        <div style={styles.tile}>
          <div style={styles.tileLabel}>Profit After Ads & Products</div>
          <div
            style={{
              ...styles.tileNum,
              color:
                (summary.contributionProfit || 0) >= 0
                  ? "var(--g)"
                  : "var(--r)",
            }}
          >
            {fmt(summary.contributionProfit)}
          </div>
          <div style={styles.tileSub}>
            Contribution margin: {summary.contributionMargin || 0}%
          </div>
          <div style={styles.tileTagRed}>Before fixed costs</div>
        </div>
      </div>

      {/* ── 4. REVENUE BREAKDOWN + WATERFALL ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>Revenue & Cost Breakdown</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "14px",
        }}
      >
        {/* Revenue Card */}
        <div style={styles.revCard}>
          <div style={{ padding: "18px 20px" }}>
            <div style={styles.revCardLabel}>
              Shopify Total vs What You Earned
            </div>
            <div style={styles.revNums}>
              <div style={styles.rnFirst}>
                <div style={styles.rnLabel}>Shopify shows</div>
                <div style={styles.rnVal}>{fmt(grossRev)}</div>
              </div>
              <div style={styles.rn}>
                <div style={styles.rnLabel}>You earned</div>
                <div style={{ ...styles.rnVal, color: "var(--g)" }}>
                  {fmt(realRev)}
                </div>
              </div>
              <div style={styles.rnLast}>
                <div style={styles.rnLabel}>Lost to RTOs & cancels</div>
                <div style={{ ...styles.rnVal, color: "var(--r)" }}>
                  −{fmt(rtoLost)}
                </div>
              </div>
            </div>

            <div style={styles.revBarTrack}>
              <div
                style={{
                  ...styles.revBarEarned,
                  width: `${Math.min(earnedPct, 100)}%`,
                }}
              ></div>
            </div>
            <div style={styles.revPctRow}>
              <span style={{ color: "var(--g)", fontSize: "11px" }}>
                {earnedPct}% earned ({fmt(realRev)})
              </span>
              <span style={{ color: "var(--r)", fontSize: "11px" }}>
                {lostPct}% lost to RTOs & cancels
              </span>
            </div>
          </div>

          <div style={styles.revBottom}>
            <div style={styles.rbi}>
              <div style={styles.rbiLabel}>PREPAID REVENUE</div>
              <div style={styles.rbiVal}>{fmt(summary.prepaidRevenue)}</div>
              <div style={styles.rbiSub}>
                {prepaidOrders} orders ({prepaidPct}%)
              </div>
              <div style={styles.rbiBar}>
                <div
                  style={{
                    ...styles.rbiBarFill,
                    width: `${Math.min(prepaidPct, 100)}%`,
                    background: "var(--g)",
                  }}
                ></div>
              </div>
            </div>

            <div style={{ ...styles.rbi, borderRight: "none" }}>
              <div style={styles.rbiLabel}>COD REVENUE</div>
              <div style={{ ...styles.rbiVal, color: "var(--y)" }}>
                {fmt(summary.codRevenue)}
              </div>
              <div style={styles.rbiSub}>
                {codOrders} orders ({codPct}%)
              </div>
              <div style={styles.rbiBar}>
                <div
                  style={{
                    ...styles.rbiBarFill,
                    width: `${Math.min(codPct, 100)}%`,
                    background: "var(--y)",
                  }}
                ></div>
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
              <div style={styles.wfTag}>
                Meta Ads ·{" "}
                {totalCosts > 0
                  ? ((adsSpend / totalCosts) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>

            <div style={styles.wfBar}>
              <div
                style={{
                  ...styles.wfBarFill,
                  width: `${Math.min(
                    totalCosts > 0 ? (adsSpend / totalCosts) * 100 : 0,
                    100,
                  )}%`,
                  background: "var(--r)",
                }}
              />
            </div>

            <div style={styles.wfAmt}>{fmt(adsSpend)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ya)" }}>📦</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Product Cost (COGS)</div>
              <div style={styles.wfTag}>
                {totalCosts > 0 ? ((cogs / totalCosts) * 100).toFixed(1) : 0}%
              </div>
            </div>

            <div style={styles.wfBar}>
              <div
                style={{
                  ...styles.wfBarFill,
                  width: `${Math.min(
                    totalCosts > 0 ? (cogs / totalCosts) * 100 : 0,
                    100,
                  )}%`,
                  background: "var(--y)",
                }}
              />
            </div>

            <div style={styles.wfAmt}>{fmt(cogs)}</div>
          </div>

          <div style={styles.wfRow}>
            <div
              style={{
                ...styles.wfIco,
                background: "rgba(168, 85, 247, 0.15)",
              }}
            >
              👥
            </div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Team Salaries & Overheads</div>
              <div style={styles.wfTag}>
                {totalCosts > 0
                  ? (((salaries + rent + agency) / totalCosts) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>

            <div style={styles.wfBar}>
              <div
                style={{
                  ...styles.wfBarFill,
                  width: `${Math.min(
                    totalCosts > 0
                      ? ((salaries + rent + agency) / totalCosts) * 100
                      : 0,
                    100,
                  )}%`,
                  background: "#a855f7",
                }}
              />
            </div>

            <div style={styles.wfAmt}>{fmt(salaries + rent + agency)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ba)" }}>🚚</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Shipping Spend</div>
              <div style={styles.wfTag}>
                {totalCosts > 0
                  ? ((shippingSpend / totalCosts) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>

            <div style={styles.wfBar}>
              <div
                style={{
                  ...styles.wfBarFill,
                  width: `${Math.min(
                    totalCosts > 0 ? (shippingSpend / totalCosts) * 100 : 0,
                    100,
                  )}%`,
                  background: "var(--b)",
                }}
              />
            </div>
            <div style={styles.wfAmt}>{fmt(shippingSpend)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--s4)" }}>💳</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Gateway & Payment Fees</div>
              <div style={styles.wfTag}>
                {totalCosts > 0 ? ((gateway / totalCosts) * 100).toFixed(1) : 0}
                %
              </div>
            </div>

            <div style={styles.wfBar}>
              <div
                style={{
                  ...styles.wfBarFill,
                  width: `${Math.min(
                    totalCosts > 0 ? (gateway / totalCosts) * 100 : 0,
                    100,
                  )}%`,
                  background: "#14b8a6",
                }}
              />
            </div>
            <div style={styles.wfAmt}>{fmt(gateway)}</div>
          </div>

          <div style={styles.wfRow}>
            <div style={{ ...styles.wfIco, background: "var(--ra)" }}>↩️</div>
            <div style={styles.wfInfo}>
              <div style={styles.wfName}>Return Handling Cost</div>
              <div style={styles.wfTag}>
                {totalCosts > 0
                  ? ((rtoHandling / totalCosts) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>
            <div style={styles.wfBar}>
              <div
                style={{
                  ...styles.wfBarFill,
                  width: `${Math.min(
                    totalCosts > 0 ? (rtoHandling / totalCosts) * 100 : 0,
                    100,
                  )}%`,
                  background: "#f43f5e",
                }}
              />
            </div>
            <div style={styles.wfAmt}>{fmt(rtoHandling)}</div>
          </div>

          <div style={{ ...styles.wfRow, background: "var(--s2)" }}>
            <div style={{ ...styles.wfIco, background: "var(--s4)" }}>Σ</div>
            <div style={styles.wfInfo}>
              <div style={{ ...styles.wfName, fontWeight: 700 }}>
                Total Costs
              </div>
            </div>
            <div
              style={{
                ...styles.wfAmt,
                color: "var(--r)",
                fontSize: "15px",
                fontWeight: 800,
                gridColumn: "4",
              }}
            >
              {fmt(totalCosts)}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. AD PERFORMANCE ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>Ad Performance</span>
      </div>
      <div style={styles.adPerfCard}>
        <div style={styles.apcHd}>
          <div style={styles.apcLabel}>HOW YOUR ADS ARE PERFORMING</div>
          <div style={styles.roasPoasRow}>
            <div style={styles.rpBox}>
              <div style={styles.rpLabel}>
                ROAS — Revenue earned per ₹1 spent on ads
              </div>
              <div style={{ ...styles.rpVal, color: "var(--y)" }}>
                {summary.roas || 0}
              </div>

              <div
                style={{ ...styles.wfBar, width: "100%", marginBottom: "8px" }}
              >
                <div
                  style={{
                    ...styles.wfBarFill,
                    width: `${Math.min(
                      summary.breakEvenROAS > 0
                        ? ((summary.roas || 0) / summary.breakEvenROAS) * 100
                        : 0,
                      100,
                    )}%`,
                    background: "var(--y)",
                  }}
                />
              </div>

              <div style={styles.rpContext}>
                You generate{" "}
                <b style={{ color: "var(--y)" }}>
                  ₹{summary.roas || 0} revenue
                </b>{" "}
                for every ₹1 spent on ads. But revenue is not profit — it
                includes product, shipping and returns.
              </div>
            </div>

            <div style={styles.rpBox}>
              <div style={styles.rpLabel}>
                POAS — Profit earned per ₹1 spent on ads
              </div>
              <div
                style={{
                  ...styles.rpVal,
                  color: (summary.poas || 0) >= 0 ? "var(--g)" : "var(--r)",
                }}
              >
                {summary.poas || 0}
              </div>

              <div
                style={{ ...styles.wfBar, width: "100%", marginBottom: "8px" }}
              >
                <div
                  style={{
                    ...styles.wfBarFill,
                    width: `${Math.min(
                      summary.breakEvenROAS > 0
                        ? ((summary.poas || 0) / summary.breakEvenROAS) * 100
                        : 0,
                      100,
                    )}%`,
                    background: "var(--y)",
                  }}
                />
              </div>

              <div style={styles.rpContext}>
                After all costs,you lose{" "}
                <b style={{ color: "var(--r)" }}>{summary.poas || 0}</b>. for
                every ₹1 you spend on ads. POAS needs to be above 1.0 to make
                profit.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <div style={styles.miniStatCard}>
              <div style={styles.miniStatLabel}>ROAS Needed to Break Even</div>
              <div style={{ ...styles.miniStatVal, color: "var(--y)" }}>
                {summary.breakEvenROAS || 0}
              </div>
              <div style={styles.miniStatDesc}>
                Required to cover product and delivery costs
              </div>
            </div>

            <div style={styles.miniStatCard}>
              <div style={styles.miniStatLabel}>
                Profit After Ads & Products
              </div>
              <div
                style={{
                  ...styles.miniStatVal,
                  color:
                    (summary.contributionProfit || 0) >= 0
                      ? "var(--g)"
                      : "var(--r)",
                }}
              >
                {fmt(summary.contributionProfit)}
              </div>
              <div style={styles.miniStatDesc}>
                Operating margin: {summary.contributionMargin || 0}%
              </div>
            </div>

            <div style={styles.miniStatCard}>
              <div style={styles.miniStatLabel}>
                Profit % After Ads &amp; Products
              </div>
              <div
                style={{
                  ...styles.miniStatVal,
                  color:
                    (summary.contributionMargin || 0) >= 0
                      ? "var(--g)"
                      : "var(--r)",
                }}
              >
                {summary.contributionMargin || 0}%
              </div>
              <div style={styles.miniStatDesc}>Of money earned</div>
            </div>
          </div>

          <div style={styles.adAccountBar}>
            <div style={styles.aabLabel}>Ad Spend Per Account</div>
            <div style={styles.adSpendRows}>
              {summary.adAccounts && summary.adAccounts.length > 0 ? (
                summary.adAccounts.map((acc, idx) => {
                  const accountSpend = Number(acc.spend || 0);
                  const accountProgress = Math.min(
                    (accountSpend / accountSpendMax) * 100,
                    100,
                  );

                  return (
                    <div
                      key={acc.id || idx}
                      onClick={() => setSelectedAccFilter(acc.id)}
                      style={{
                        ...styles.adSpendRow,
                        ...(selectedAccFilter === acc.id
                          ? styles.adSpendRowOn
                          : {}),
                      }}
                    >
                      <div style={styles.adSpendAccount}>
                        <div
                          style={{
                            ...styles.accPillDot,
                            background: idx % 2 === 0 ? "#5b8cff" : "#a855f7",
                          }}
                        ></div>
                        <span>{acc.name || `Account ${idx + 1}`}</span>
                      </div>
                      <div style={styles.adSpendTrack}>
                        <div
                          style={{
                            ...styles.adSpendFill,
                            width: `${accountProgress}%`,
                            background: idx % 2 === 0 ? "#5b8cff" : "#a855f7",
                          }}
                        ></div>
                      </div>
                      <span style={styles.adSpendAmount}>
                        {fmt(accountSpend)}
                      </span>
                      <span style={styles.roasTag}>
                        ROAS {acc.roas || summary.roas || 0}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div
                  onClick={() => setSelectedAccFilter("main")}
                  style={{
                    ...styles.adSpendRow,
                    ...(selectedAccFilter === "main"
                      ? styles.adSpendRowOn
                      : {}),
                  }}
                >
                  <div style={styles.adSpendAccount}>
                    <div
                      style={{ ...styles.accPillDot, background: "#5b8cff" }}
                    ></div>
                    <span>Primary Meta Account</span>
                  </div>
                  <div style={styles.adSpendTrack}>
                    <div
                      style={{
                        ...styles.adSpendFill,
                        width: "100%",
                        background: "#5b8cff",
                      }}
                    ></div>
                  </div>
                  <span style={styles.adSpendAmount}>{fmt(adsSpend)}</span>
                  <span style={styles.roasTag}>ROAS {summary.roas || 0}</span>
                </div>
              )}

              <div style={styles.adSpendTotal}>
                Total: <b>{fmt(adsSpend)}</b> spent · Current ROAS{" "}
                <b style={{ color: "var(--y)" }}>{summary.roas || 0}</b>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.insightStrip}>
          <span>💡</span>
          <span>
            Break-even ROAS is <strong>{summary.breakEvenROAS || 0}</strong>.
            Campaigns performing below this number are losing money on every
            order once packaging and shipping are deducted.
          </span>
        </div>
      </div>

      {/* ── 6. ORDER HEALTH | PAYMENT SPLIT | PER ORDER NUMBERS ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>Order & Payment Health</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "14px",
        }}
      >
        {/* Order Health */}
        <div style={styles.ohCard}>
          <div style={styles.cardHeaderTitle}>TOTAL ORDERS THIS MONTH</div>
          <div style={styles.ohTotal}>{totalOrders}</div>
          <div style={styles.ohSub}>Across all order fulfillment stages</div>

          <div style={styles.ohBar}>
            <div
              style={{
                width: `${(deliveredOrders / (totalOrders || 1)) * 100}%`,
                background: "var(--g)",
                height: "100%",
              }}
            ></div>
            <div
              style={{
                width: `${(rtoOrders / (totalOrders || 1)) * 100}%`,
                background: "var(--r)",
                height: "100%",
              }}
            ></div>
            <div
              style={{
                width: `${(cancelledOrders / (totalOrders || 1)) * 100}%`,
                background: "var(--y)",
                height: "100%",
              }}
            ></div>
            <div
              style={{
                flex: 1,
                background: "rgba(91,140,255,.5)",
                height: "100%",
              }}
            ></div>
          </div>

          <div style={styles.ohLegend}>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "var(--g)" }}></span>
              <span style={styles.ohlLabel}>Delivered</span>
              <span style={styles.ohlVal}>{deliveredOrders}</span>
              <span style={{ color: "var(--g)", fontSize: "11px" }}>
                {((deliveredOrders / (totalOrders || 1)) * 100).toFixed(1)}%
              </span>
            </div>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "var(--r)" }}></span>
              <span style={styles.ohlLabel}>Returned (RTO)</span>
              <span style={styles.ohlVal}>{rtoOrders}</span>
              <span style={{ color: "var(--r)", fontSize: "11px" }}>
                {((rtoOrders / (totalOrders || 1)) * 100).toFixed(1)}%
              </span>
            </div>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "var(--y)" }}></span>
              <span style={styles.ohlLabel}>Cancelled</span>
              <span style={styles.ohlVal}>{cancelledOrders}</span>
              <span style={{ color: "var(--y)", fontSize: "11px" }}>
                {((cancelledOrders / (totalOrders || 1)) * 100).toFixed(1)}%
              </span>
            </div>
            <div style={styles.ohlRow}>
              <span style={{ ...styles.ohlDot, background: "#5b8cff" }}></span>
              <span style={styles.ohlLabel}>Still Moving / In-Transit</span>
              <span style={styles.ohlVal}>{movingOrders}</span>
              <span style={{ color: "#5b8cff", fontSize: "11px" }}>
                {((movingOrders / (totalOrders || 1)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Payment Split */}
        <div style={styles.payCard}>
          <div style={styles.cardHeaderTitle}>HOW CUSTOMERS PAID</div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "900",
              color: "var(--g)",
              letterSpacing: "-.05em",
              marginBottom: "4px",
            }}
          >
            {prepaidPct}% Prepaid
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--t2)",
              marginBottom: "14px",
            }}
          >
            Prepaid orders have near zero cancellation rate
          </div>

          <div style={styles.payBar}>
            <div
              style={{
                width: `${prepaidPct}%`,
                background: "var(--g)",
                height: "100%",
              }}
            ></div>
            <div
              style={{
                width: `${codPct}%`,
                background: "var(--y)",
                height: "100%",
              }}
            ></div>
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
                {(
                  ((summary.partialCodOrders || 0) / (totalOrders || 1)) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
          </div>
        </div>

        {/* Per Order Numbers */}
        <div style={styles.poeCard}>
          <div style={styles.cardHeaderTitle}>PER ORDER NUMBERS</div>
          <div
            style={{
              ...styles.poeHero,
              color:
                (summary.profitPerOrder || 0) >= 0 ? "var(--g)" : "var(--r)",
            }}
          >
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
                {realRev > 0 ? ((shippingSpend / realRev) * 100).toFixed(1) : 0}
                %
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 7. PRODUCT PROFITABILITY TABLE ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>Product Profitability</span>
      </div>
      <div style={styles.prodCard}>
        <table style={styles.prodTable}>
          <thead>
            <tr style={styles.prodThRow}>
              <th style={{ ...styles.prodTh, textAlign: "left" }}>
                PRODUCT NAME
              </th>
              <th style={{ ...styles.prodTh, textAlign: "center" }}>
                DELIVERED
              </th>
              <th style={{ ...styles.prodTh, textAlign: "right" }}>
                REVENUE EARNED
              </th>
              <th style={{ ...styles.prodTh, textAlign: "right" }}>
                PRODUCT COST (COGS)
              </th>
              <th style={{ ...styles.prodTh, textAlign: "right" }}>
                GROSS PROFIT
              </th>
               <th style={{ ...styles.prodTh, textAlign: "right" }}>
                GROSS PROFIT percentage
              </th>
            </tr>
          </thead>
          <tbody>
            {topProducts && topProducts.length > 0 ? (
              topProducts.map((p, idx) => (
                <tr key={idx} style={styles.prodTr}>
                  <td style={styles.prodTdName}>{p.name}</td>
                  <td
                    style={{
                      ...styles.prodTd,
                      textAlign: "center",
                      color: "var(--t2)",
                    }}
                  >
                    {p.deliveredQty || 0}
                  </td>
                  <td style={{ ...styles.prodTd, textAlign: "right" }}>
                    {fmt(p.revenue)}
                  </td>
                  <td
                    style={{
                      ...styles.prodTd,
                      textAlign: "right",
                      color: "var(--t2)",
                    }}
                  >
                    {fmt(p.cogs)}
                  </td>
                  <td
                    style={{
                      ...styles.prodTd,
                      textAlign: "right",
                      color: "var(--g)",
                      fontWeight: 700,
                    }}
                  >
                    {fmt(p.profit)}
                  </td>
                  <td
                    style={{
                      ...styles.prodTd,
                      textAlign: "right",
                      color: "var(--g)",
                      fontWeight: 700,
                    }}
                  >
                    {fmt(p.profitPercentage)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="6"
                  style={{
                    padding: "28px",
                    textAlign: "center",
                    color: "var(--t3)",
                    fontStyle: "italic",
                  }}
                >
                  No product profitability records for this period. Add COGS in
                  Products tab to unlock.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 8. COST LEAKAGE ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>
          Cost Leakage (Where Money Is Leaking)
        </span>
      </div>
      <div style={styles.lkGrid}>
        <div style={styles.lk}>
          <div style={styles.lkLabel}>SHIPPING SPENT</div>
          <div style={{ ...styles.lkVal, color: "var(--r)" }}>
            {fmt(shippingSpend)}
          </div>
          <div style={styles.lkSub}>
            {summary.totalShipments || 0} shipments total
          </div>
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
          <div style={{ ...styles.lkVal, color: "var(--r)" }}>
            {fmt(rtoLost)}
          </div>
          <div style={styles.lkSub}>Gross sale value lost</div>
        </div>
      </div>

      {/* ── 9. PENDING OUTCOME (ORDERS STILL MOVING) ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>
          Orders Still Moving (Pending Outcome)
        </span>
      </div>
      <div style={styles.pendingGrid}>
        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>CURRENTLY WITH COURIER</div>
          <div style={styles.pgVal}>{forecast.inTransit || movingOrders}</div>
          <div style={styles.pgSub}>Orders actively in transit</div>
        </div>

        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>EXPECTED TO DELIVER</div>
          <div style={{ ...styles.pgVal, color: "var(--g)" }}>
            {forecast.expectedDelivered || 0}
          </div>
          <div style={styles.pgSub}>
            {forecast.successRate || 85}% estimated success rate
          </div>
        </div>

        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>EXPECTED REVENUE COMING</div>
          <div style={{ ...styles.pgVal, color: "var(--g)" }}>
            {fmt(forecast.expectedRevenue)}
          </div>
          <div style={styles.pgSub}>Estimated realization upon delivery</div>
        </div>

        <div style={styles.pgCard}>
          <div style={styles.pgLabel}>DELIVERY RISK LEVEL</div>
          <div
            style={{
              ...styles.pgVal,
              color:
                forecast.riskLevel === "Low Risk" ? "var(--g)" : "var(--y)",
            }}
          >
            {forecast.riskLevel || "Moderate"}
          </div>
          <div style={styles.pgSub}>Tracked via carrier NDR telemetry</div>
        </div>
      </div>

      {/* ── 10. DAILY PROFIT & LOSS CHART ── */}
      <div style={styles.sdiv}>
        <span style={styles.sdivText}>Daily Profit & Loss</span>
      </div>
      <div style={styles.chartCard}>
        <div style={styles.chartHd}>
          <div>
            <div style={styles.chartTitle}>Daily Profit Status</div>
            <div style={styles.chartSub}>
              Green = Profit day · Red = Loss day · Dynamic based on IST
              business calendar
            </div>
          </div>
          <div style={styles.chartLegend}>
            <div style={styles.clItem}>
              <div style={{ ...styles.clDot, background: "var(--g)" }}></div>
              Profit Day
            </div>
            <div style={styles.clItem}>
              <div style={{ ...styles.clDot, background: "var(--r)" }}></div>
              Loss Day
            </div>
          </div>
        </div>

        <div style={{ height: "260px", width: "100%", marginTop: "16px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedChartData}>
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
                strokeDasharray="3 3"
              />
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
                tickFormatter={(v) =>
                  `₹${v >= 1000 || v <= -1000 ? Math.round(v / 1000) + "k" : v}`
                }
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
                formatter={(v) => [
                  `₹${Number(v).toLocaleString("en-IN")}`,
                  "Net Profit",
                ]}
                contentStyle={{
                  backgroundColor: "#0f1e13",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#dceee2",
                  fontSize: "12px",
                }}
                itemStyle={{
                  color: "#ffffff",
                }}
                labelStyle={{
                  color: "#ffffff",
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
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="name"
                stroke="#3d5442"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#3d5442"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${Math.round(Math.abs(v) / 1000)}k`}
              />
              <Tooltip
                formatter={(v) => [
                  `₹${Math.abs(v).toLocaleString("en-IN")}`,
                  "Amount",
                ]}
                contentStyle={{
                  backgroundColor: "#0f1e13",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#dceee2",
                  fontSize: "12px",
                }}
                itemStyle={{
                  color: "#ffffff",
                }}
                labelStyle={{
                  color: "#ffffff",
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
  adSpendRows: {
    display: "flex",
    flexDirection: "column",
  },
  adSpendRow: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1fr) minmax(100px, 1fr) 90px auto",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
    padding: "11px 0",
    borderBottom: "1px solid var(--bd)",
    color: "var(--t1)",
    cursor: "pointer",
    transition: "background .16s",
  },
  adSpendRowOn: {
    background: "rgba(0, 212, 106, 0.04)",
  },
  adSpendAccount: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  adSpendTrack: {
    height: "5px",
    background: "var(--s4)",
    borderRadius: "3px",
    overflow: "hidden",
  },
  adSpendFill: {
    height: "100%",
    borderRadius: "3px",
    minWidth: "3px",
    transition: "width .25s ease",
    width: "200px",
  },
  adSpendAmount: {
    minWidth: "90px",
    fontSize: "12px",
    fontWeight: "700",
    color: "var(--t1)",
    textAlign: "right",
  },
  adSpendTotal: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "var(--t2)",
    padding: "11px 0 0",
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
    display: "grid",
    gridTemplateColumns: "26px minmax(0, 1fr) 160px 90px",
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
  wfBar: {
    width: "100%",
    height: "4px",
    background: "var(--s4)",
    borderRadius: "2px",
    overflow: "hidden",
  },
  wfBarFill: {
    height: "100%",
    borderRadius: "2px",
  },
  wfAmt: {
    width: "90px",
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
