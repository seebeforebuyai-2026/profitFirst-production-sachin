import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL || "https://api.profitfirstanalytics.co.in";

const ShopifyOnboarding = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | syncing | ready | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // ── Auth check ───────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetchInsight();
  }, []);

  const handleMetaConnect = async () => {
    try {
      console.log("🔗 Initiating Meta OAuth...");
      const token = localStorage.getItem("accessToken");

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || "https://api.profitfirstanalytics.co.in"}/api/meta/connect`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!response.data?.authUrl) {
        console.log("Invalid auth response");
        return;
      }

      // Meta OAuth page pe redirect karo
      window.location.href = response.data.authUrl;
    } catch (err) {
      console.error("❌ Meta connect error:", err);
    }
  };

  // ── Polling + Fetch ───────────────────────────────────────────
  const fetchInsight = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await axios.get(`${API_URL}/api/onboard/shopify-insight`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const d = res.data;

      if (d.syncStatus === "in_progress") {
        // Sync chal raha hai — 5 sec baad dobara try karo
        setStatus("syncing");
        setTimeout(fetchInsight, 5000);
        return;
      }

      // Data ready hai
      setData(d);
      setStatus("ready");
    } catch (err) {
      console.error("Insight fetch error:", err);
      setErrorMsg(err.response?.data?.error || "Failed to load store data.");
      setStatus("error");
    }
  };

  // ── Format numbers ────────────────────────────────────────────
  const fmt = (num) =>
    "₹" +
    Number(num || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* LEFT SIDEBAR */}
      <div style={styles.sidebar}>
        <div style={styles.logo}>
          <img
            src="https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png"
            alt="ProfitFirst"
            style={{ width: "140px" }}
          />
        </div>

        <div style={styles.sideSection}>
          <p style={styles.sideLabel}>Connections</p>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>🛍️</span>
            <span style={styles.sideText}>Shopify</span>
            <span style={styles.badgeLive}>Live</span>
          </div>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>📘</span>
            <span style={styles.sideText}>Meta Ads</span>
            <span style={styles.badgeNext}>Next</span>
          </div>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>🚚</span>
            <span style={styles.sideText}>Shiprocket</span>
            <span style={styles.badgePending}>Pending</span>
          </div>
        </div>

        {/* Sidebar data — sirf ready state mein */}
        {status === "ready" && data && (
          <div style={styles.sideSection}>
            <p style={styles.sideLabel}>Data unlocked</p>
            <p style={styles.sideStatLabel}>Shopify gross revenue</p>
            <p style={styles.sideStatValue}>{fmt(data.totalRevenue)}</p>
            <p style={{ ...styles.sideStatLabel, marginTop: "12px" }}>
              {fmt(data.actualEarned)} earned
            </p>
            <p style={styles.sideStatSmall}>Gap — {fmt(data.gap)} in RTOs</p>
            <p style={{ ...styles.sideStatLabel, marginTop: "12px" }}>
              {data.totalOrders} orders
            </p>
            <p
              style={{
                ...styles.sideStatLabel,
                marginTop: "12px",
                color: "#aaa",
              }}
            >
              Ad spend
            </p>
            <p style={styles.sideStatSmall}>Connect Meta Ads →</p>
            <p
              style={{
                ...styles.sideStatLabel,
                marginTop: "12px",
                color: "#aaa",
              }}
            >
              Net profit
            </p>
            <p style={styles.sideStatSmall}>Connect Shiprocket →</p>
          </div>
        )}

        <div style={styles.sideBottom}>
          <span style={styles.shopDot}></span>
          <span style={styles.shopName}>
            {data?.shopDomain || "your-store.myshopify.com"}
          </span>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT */}
      <div style={styles.main}>
        {/* ── LOADING STATE ── */}
        {status === "loading" && (
          <div style={styles.centerBox}>
            <div style={styles.spinner}></div>
            <h2 style={styles.heading}>Setting up your dashboard...</h2>
            <p style={styles.subText}>Please wait a moment.</p>
          </div>
        )}

        {/* ── SYNCING STATE ── */}
        {status === "syncing" && (
          <div style={styles.centerBox}>
            <div style={styles.spinner}></div>
            <h2 style={styles.heading}>Fetching your store data...</h2>
            <p style={styles.subText}>
              We are pulling your last 30 days of orders.
              <br />
              This usually takes 30–60 seconds.
            </p>
            <div style={styles.progressBar}>
              <div style={styles.progressFill}></div>
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {status === "error" && (
          <div style={styles.centerBox}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={styles.heading}>Something went wrong</h2>
            <p style={{ color: "#ff6b6b", marginBottom: "24px" }}>{errorMsg}</p>
            <button style={styles.btnPrimary} onClick={fetchInsight}>
              Try Again
            </button>
          </div>
        )}

        {/* ── READY STATE ── */}
        {status === "ready" && data && (
          <>
            {/* Insight card */}
            <div style={styles.insightCard}>
              <p style={styles.insightTitle}>
                ✅ Shopify connected — first insight
              </p>
              <div style={styles.insightNumbers}>
                <div>
                  <p style={styles.numValue}>{fmt(data.totalRevenue)}</p>
                  <p style={styles.numLabel}>Shopify shows</p>
                </div>
                <div>
                  <p style={styles.numValue}>{fmt(data.actualEarned)}</p>
                  <p style={styles.numLabel}>You actually earned</p>
                </div>
                <div>
                  <p style={{ ...styles.numValue, color: "#ff6b6b" }}>
                    {fmt(data.gap)}
                  </p>
                  <p style={styles.numLabel}>Gap — never banked</p>
                </div>
              </div>
              <p style={styles.insightDesc}>
                <strong>
                  {fmt(data.gap)} showing in Shopify never reached your bank.
                </strong>{" "}
                RTOs and cancellations. Connect Meta Ads to see how much ad
                spend is contributing to this gap.
              </p>
            </div>

            <p style={styles.stepText}>— Step 2 of 7</p>

            <h1 style={styles.headline}>
              You can see the gap.{" "}
              <span style={styles.headlineGreen}>Now find where it went.</span>
            </h1>

            <p style={styles.subText}>
              Connect Meta Ads to see real ad spend against actual earned
              revenue.
            </p>

            <div style={styles.ctaRow}>
              <button style={styles.btnPrimary} onClick={handleMetaConnect}>
                Connect Meta Ads →
              </button>
              <button
                style={styles.btnSecondary}
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("accessToken");
                    await axios.post(
                      `${import.meta.env.VITE_API_URL || "https://api.profitfirstanalytics.co.in"}/api/onboard/complete-shopify`,
                      {},
                      { headers: { Authorization: `Bearer ${token}` } },
                    );
                  } catch (e) {
                    // Non-critical — dashboard pe jaana zaroori hai
                    console.warn(
                      "Could not mark onboarding complete:",
                      e.message,
                    );
                  }
                  window.location.href = "/dashboard";
                }}
              >
                I'll do this later →
              </button>
            </div>

            <p style={styles.ctaNote}>
              Skipping shows ₹0 for ad spend on your dashboard
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ── STYLES ───────────────────────────────────────────────────────
const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    background: "#0a1628",
    color: "#fff",
    fontFamily: "Inter, sans-serif",
  },
  sidebar: {
    width: "220px",
    minWidth: "220px",
    background: "#0d1f35",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.06)",
  },
  logo: { marginBottom: "28px" },
  sideSection: { marginBottom: "24px" },
  sideLabel: {
    fontSize: "0.7rem",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "10px",
  },
  sideItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  },
  sideIcon: { fontSize: "14px" },
  sideText: { fontSize: "0.85rem", flex: 1 },
  badgeLive: {
    fontSize: "0.65rem",
    background: "#26b35e",
    color: "#fff",
    padding: "2px 7px",
    borderRadius: "20px",
    fontWeight: "600",
  },
  badgeNext: {
    fontSize: "0.65rem",
    background: "#3b82f6",
    color: "#fff",
    padding: "2px 7px",
    borderRadius: "20px",
    fontWeight: "600",
  },
  badgePending: {
    fontSize: "0.65rem",
    background: "rgba(255,255,255,0.1)",
    color: "#aaa",
    padding: "2px 7px",
    borderRadius: "20px",
  },
  sideStatLabel: { fontSize: "0.75rem", color: "#ccc", marginBottom: "2px" },
  sideStatValue: { fontSize: "1.1rem", fontWeight: "700", color: "#26b35e" },
  sideStatSmall: { fontSize: "0.72rem", color: "#888", marginBottom: "2px" },
  sideBottom: {
    marginTop: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  shopDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#26b35e",
    display: "inline-block",
  },
  shopName: { fontSize: "0.75rem", color: "#aaa" },
  main: {
    flex: 1,
    padding: "48px 56px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems:"center",
  },
  centerBox: { textAlign: "center", maxWidth: "420px", margin: "0 auto" },
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid rgba(38,179,94,0.15)",
    borderTop: "4px solid #26b35e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto 24px",
  },
  progressBar: {
    width: "280px",
    height: "4px",
    background: "rgba(255,255,255,0.1)",
    borderRadius: "4px",
    margin: "24px auto 0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "60%",
    background: "#26b35e",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  heading: {
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "12px",
  },
  insightCard: {
    background: "rgba(38,179,94,0.08)",
    border: "1px solid rgba(38,179,94,0.25)",
    borderRadius: "12px",
    padding: "20px 24px",
    marginBottom: "32px",
    maxWidth: "560px",
  },
  insightTitle: {
    fontSize: "0.85rem",
    color: "#26b35e",
    marginBottom: "14px",
    fontWeight: "600",
  },
  insightNumbers: { display: "flex", gap: "32px", marginBottom: "14px" },
  numValue: {
    fontSize: "1.15rem",
    fontWeight: "700",
    color: "#fff",
    marginBottom: "2px",
  },
  numLabel: { fontSize: "0.72rem", color: "#aaa" },
  insightDesc: { fontSize: "0.82rem", color: "#ccc", lineHeight: "1.6" },
  stepText: { fontSize: "0.8rem", color: "#26b35e", marginBottom: "12px" },
  headline: {
    fontSize: "2.2rem",
    fontWeight: "700",
    color: "#fff",
    lineHeight: "1.2",
    marginBottom: "16px",
    maxWidth: "480px",
  },
  headlineGreen: { color: "#26b35e" },
  subText: {
    fontSize: "0.95rem",
    color: "#aaa",
    marginBottom: "28px",
    maxWidth: "440px",
  },
  ctaRow: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
    marginBottom: "12px",
  },
  btnPrimary: {
    background: "#26b35e",
    color: "#fff",
    border: "none",
    padding: "14px 28px",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  btnSecondary: {
    background: "transparent",
    color: "#aaa",
    border: "1px solid rgba(255,255,255,0.15)",
    padding: "14px 24px",
    borderRadius: "8px",
    fontSize: "0.95rem",
    cursor: "pointer",
  },
  ctaNote: { fontSize: "0.78rem", color: "#666" },
};

// CSS animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
`;
document.head.appendChild(styleSheet);

export default ShopifyOnboarding;
