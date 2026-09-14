import { useNavigate } from "react-router-dom";

const ShopifyOnboarding = () => {
  const navigate = useNavigate();

  // ── Dummy data — baad mein API se replace karenge ──
  const shopName = "your-store.myshopify.com";
  const revenue = "₹3,27,642";
  const earned = "₹1,87,863";
  const gap = "₹1,39,779";
  const totalOrders = 499;
  const delivered = 481;
  const rto = 18;

  return (
    <div style={styles.page}>
      {/* ── LEFT SIDEBAR ── */}
      <div style={styles.sidebar}>
        {/* Logo */}
        <div style={styles.logo}>
          <img
            src="https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png"
            alt="ProfitFirst"
            style={{ width: "140px" }}
          />
        </div>

        {/* Connections */}
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

        {/* Data unlocked */}
        <div style={styles.sideSection}>
          <p style={styles.sideLabel}>Data unlocked</p>

          <p style={styles.sideStatLabel}>Shopify gross revenue</p>
          <p style={styles.sideStatValue}>{revenue}</p>

          <p style={styles.sideStatLabel}>{earned} delivered</p>
          <p style={styles.sideStatSmall}>Gap — {gap} in RTOs</p>

          <p style={styles.sideStatLabel}>{totalOrders} orders</p>
          <p style={styles.sideStatSmall}>
            {delivered} delivered · {rto} RTOs
          </p>

          <p style={styles.sideStatLabel}>Ad spend</p>
          <p style={styles.sideStatSmall}>Connect Meta Ads →</p>

          <p style={styles.sideStatLabel}>Net profit</p>
          <p style={styles.sideStatSmall}>Connect Shiprocket →</p>
        </div>

        {/* Bottom shop name */}
        <div style={styles.sideBottom}>
          <span style={styles.shopDot}></span>
          <span style={styles.shopName}>{shopName}</span>
        </div>
      </div>

      {/* ── RIGHT MAIN CONTENT ── */}
      <div style={styles.main}>
        {/* Insight card */}
        <div style={styles.insightCard}>
          <p style={styles.insightTitle}>
            ✅ Shopify connected — first insight
          </p>
          <div style={styles.insightNumbers}>
            <div>
              <p style={styles.numValue}>{revenue}</p>
              <p style={styles.numLabel}>Shopify shows</p>
            </div>
            <div>
              <p style={styles.numValue}>{earned}</p>
              <p style={styles.numLabel}>You actually earned</p>
            </div>
            <div>
              <p style={{ ...styles.numValue, color: "#ff6b6b" }}>{gap}</p>
              <p style={styles.numLabel}>Gap — never banked</p>
            </div>
          </div>
          <p style={styles.insightDesc}>
            <strong>{gap} showing in Shopify never reached your bank.</strong>{" "}
            RTOs and cancellations. Connect Meta Ads to see how much ad spend is
            contributing to this gap.
          </p>
        </div>

        {/* Step indicator */}
        <p style={styles.stepText}>— Step 2 of 7</p>

        {/* Headline */}
        <h1 style={styles.headline}>
          You can see the gap.{" "}
          <span style={styles.headlineGreen}>Now find where it went.</span>
        </h1>

        {/* Sub text */}
        <p style={styles.subText}>
          Connect Meta Ads to see real ad spend against actual earned revenue.
        </p>

        {/* CTA Buttons */}
        <div style={styles.ctaRow}>
          <button
            style={styles.btnPrimary}
            onClick={() => navigate("/onboarding")}
          >
            Connect Meta Ads →
          </button>
          <button
            style={styles.btnSecondary}
            onClick={() => navigate("/onboarding")}
          >
            I'll do this later →
          </button>
        </div>

        <p style={styles.ctaNote}>
          Skipping shows ₹0 for ad spend on your dashboard
        </p>
      </div>
    </div>
  );
};

// ── STYLES ──
const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    background: "#0a1628",
    color: "#fff",
    fontFamily: "Inter, sans-serif",
  },

  // Sidebar
  sidebar: {
    width: "220px",
    minWidth: "220px",
    background: "#0d1f35",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.06)",
  },
  logo: {
    marginBottom: "28px",
  },
  sideSection: {
    marginBottom: "24px",
  },
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
  sideStatLabel: {
    fontSize: "0.75rem",
    color: "#ccc",
    marginBottom: "2px",
  },
  sideStatValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#26b35e",
  },
  sideStatSmall: {
    fontSize: "0.72rem",
    color: "#888",
    marginBottom: "2px",
  },
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
  shopName: {
    fontSize: "0.75rem",
    color: "#aaa",
  },

  // Main content
  main: {
    flex: 1,
    padding: "48px 56px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
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
  insightNumbers: {
    display: "flex",
    gap: "32px",
    marginBottom: "14px",
  },
  numValue: {
    fontSize: "1.15rem",
    fontWeight: "700",
    color: "#fff",
    marginBottom: "2px",
  },
  numLabel: {
    fontSize: "0.72rem",
    color: "#aaa",
  },
  insightDesc: {
    fontSize: "0.82rem",
    color: "#ccc",
    lineHeight: "1.6",
  },
  stepText: {
    fontSize: "0.8rem",
    color: "#26b35e",
    marginBottom: "12px",
  },
  headline: {
    fontSize: "2.2rem",
    fontWeight: "700",
    color: "#fff",
    lineHeight: "1.2",
    marginBottom: "16px",
    maxWidth: "480px",
  },
  headlineGreen: {
    color: "#26b35e",
  },
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
  ctaNote: {
    fontSize: "0.78rem",
    color: "#666",
  },
};

export default ShopifyOnboarding;
