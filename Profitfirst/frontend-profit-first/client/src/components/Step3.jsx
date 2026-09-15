import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../../axios";

const Step3 = ({ onComplete }) => {
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAdAccountIds, setSelectedAdAccountIds] = useState([]);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Load ad accounts on mount ─────────────────────────────
  useEffect(() => {
    const checkConnection = async () => {
      setFetchingAccounts(true);
      try {
        const response = await axiosInstance.get("/meta/connection");
        if (response.data.connected && response.data.connection) {
          const accounts = response.data.connection.adAccounts || [];
          setAdAccounts(accounts);
        }
      } catch (err) {
        console.error("Fetch failed", err);
      } finally {
        setFetchingAccounts(false);
      }
    };

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("meta") === "connected") {
      setTimeout(() => checkConnection(), 1000);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      checkConnection();
    }
  }, []);

  // ── Toggle checkbox ──────────────────────────────────────
  const toggleAccount = (accountId) => {
    setSelectedAdAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId],
    );
  };

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = async () => {
    if (selectedAdAccountIds.length === 0)
      return toast.error("Please select at least one Ad account.");

    setSubmitting(true);
    try {
      const res = await axiosInstance.post("/meta/select-account", {
        adAccountIds: selectedAdAccountIds,
      });

      if (res.data.success) {
        toast.success("✅ Meta Setup Complete!");
        setTimeout(() => {
          window.location.href = "/onboarding/meta";
        }, 1000);
      }
    } catch (err) {
      console.error("❌ Submission error:", err);
      toast.error(err.response?.data?.error || "Failed to save selection");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Meta OAuth ───────────────────────────────────────────
  const handleMetaConnect = async () => {
    try {
      const response = await axiosInstance.post("/meta/connect");
      if (!response.data?.authUrl) {
        toast.error("Invalid auth response");
        return;
      }
      window.location.href = response.data.authUrl;
    } catch (err) {
      console.error("❌ Meta connect error:", err);
      toast.error("Failed to initiate Meta login.");
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={{ ...styles.blob, ...styles.blobLeft }}></div>
      <div style={{ ...styles.blob, ...styles.blobRight }}></div>

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
            <span style={styles.badgeCurrent}>Setup</span>
          </div>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>🚚</span>
            <span style={styles.sideText}>Shiprocket</span>
            <span style={styles.badgePending}>Pending</span>
          </div>
        </div>

        <div style={styles.sideSection}>
          <p style={styles.sideLabel}>What you'll unlock</p>
          <p style={styles.sideStatSmall}>📊 Real ad spend vs revenue</p>
          <p style={styles.sideStatSmall}>📈 Accurate ROAS per campaign</p>
          <p style={styles.sideStatSmall}>💡 Profit on Ad Spend (POAS)</p>
          <p style={styles.sideStatSmall}>🎯 Break-even ROAS</p>
        </div>

        <div style={styles.sideBottom}>
          <span style={styles.shopDot}></span>
          <span style={styles.shopName}>Step 2 of 7</span>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT */}
      <div style={styles.main}>
        <p style={styles.stepText}>— Step 2 of 7</p>

        <h1 style={styles.headline}>
          Connect your <span style={styles.headlineGreen}>Meta Ads</span>{" "}
          account
        </h1>

        <p style={styles.subText}>
          We read your ad spend and campaign data. We never post, create, or
          change anything in your account.
        </p>

        {/* ── Meta not connected yet ── */}
        {adAccounts.length === 0 && !fetchingAccounts && (
          <div style={styles.connectCard}>
            <div style={styles.connectIcon}>📘</div>
            <div>
              <p style={styles.connectTitle}>Meta Ads not connected</p>
              <p style={styles.connectDesc}>
                Click below to authorize access to your Facebook Ad accounts.
              </p>
            </div>
            <button style={styles.btnConnect} onClick={handleMetaConnect}>
              Connect Meta Ads →
            </button>
          </div>
        )}

        {/* ── Loading accounts ── */}
        {fetchingAccounts && (
          <div style={styles.loadingBox}>
            <div style={styles.spinner}></div>
            <p style={{ color: "#aaa", fontSize: "0.9rem" }}>
              Loading your ad accounts...
            </p>
          </div>
        )}

        {/* ── Accounts list ── */}
        {adAccounts.length > 0 && !fetchingAccounts && (
          <>
            <p style={styles.selectLabel}>
              Select the ad accounts to track{" "}
              <span style={{ color: "#26b35e" }}>
                ({selectedAdAccountIds.length} selected)
              </span>
            </p>

            <div style={styles.accountsList}>
              {adAccounts.map((acc) => {
                const isSelected = selectedAdAccountIds.includes(acc.accountId);
                return (
                  <div
                    key={acc.accountId}
                    onClick={() => toggleAccount(acc.accountId)}
                    style={{
                      ...styles.accountItem,
                      border: isSelected
                        ? "1px solid #26b35e"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: isSelected
                        ? "rgba(38,179,94,0.08)"
                        : "rgba(255,255,255,0.03)",
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        ...styles.checkbox,
                        background: isSelected ? "#26b35e" : "transparent",
                        border: isSelected
                          ? "2px solid #26b35e"
                          : "2px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      {isSelected && (
                        <span style={{ color: "#fff", fontSize: "11px" }}>
                          ✓
                        </span>
                      )}
                    </div>

                    {/* Account info */}
                    <div style={{ flex: 1 }}>
                      <p style={styles.accName}>{acc.name}</p>
                      <p style={styles.accMeta}>
                        {acc.currency} · {acc.id}
                      </p>
                    </div>

                    {isSelected && (
                      <span style={styles.selectedBadge}>Selected</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* CTA Buttons */}
            <div style={styles.ctaRow}>
              <button
                style={{
                  ...styles.btnPrimary,
                  opacity:
                    selectedAdAccountIds.length === 0 || submitting ? 0.5 : 1,
                  cursor:
                    selectedAdAccountIds.length === 0 || submitting
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={handleSubmit}
                disabled={submitting || selectedAdAccountIds.length === 0}
              >
                {submitting ? "Saving..." : "Save & Continue →"}
              </button>
              <button
                style={styles.btnSecondary}
                onClick={() => (window.location.href = "/dashboard")}
              >
                I'll do this later →
              </button>
            </div>

            <p style={styles.ctaNote}>
              Skipping shows ₹0 for ad spend on your dashboard
            </p>
          </>
        )}

        {/* ── If connected but no accounts found ── */}
        {adAccounts.length === 0 && !fetchingAccounts && (
          <button
            style={{ ...styles.btnSecondary, marginTop: "16px" }}
            onClick={() => (window.location.href = "/dashboard")}
          >
            Skip for now →
          </button>
        )}
      </div>
    </div>
  );
};

// ── STYLES ──────────────────────────────────────────────────
const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    background: "#101218",
    position: "relative",
    overflow: "hidden",
  },
  sidebar: {
    width: "220px",
    minWidth: "220px",
    background: "rgba(255,255,255,0.02)",
    backdropFilter: "blur(10px)",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 1,
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
  badgeCurrent: {
    fontSize: "0.65rem",
    background: "#f59e0b",
    color: "#000",
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
  sideStatSmall: {
    fontSize: "0.75rem",
    color: "#888",
    marginBottom: "8px",
    lineHeight: "1.4",
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
  shopName: { fontSize: "0.75rem", color: "#aaa" },

  main: {
    flex: 1,
    padding: "48px 56px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
  },
  stepText: { fontSize: "0.8rem", color: "#26b35e", marginBottom: "12px" },
  headline: {
    fontSize: "2.2rem",
    fontWeight: "700",
    color: "#fff",
    lineHeight: "1.2",
    marginBottom: "16px",
    maxWidth: "520px",
  },
  headlineGreen: { color: "#26b35e" },
  subText: {
    fontSize: "0.95rem",
    color: "#aaa",
    marginBottom: "32px",
    maxWidth: "480px",
    lineHeight: "1.6",
  },

  // Not connected card
  connectCard: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    background: "rgba(38,179,94,0.06)",
    border: "1px solid rgba(38,179,94,0.2)",
    borderRadius: "12px",
    padding: "20px 24px",
    marginBottom: "24px",
    maxWidth: "520px",
    flexWrap: "wrap",
  },
  connectIcon: { fontSize: "32px" },
  connectTitle: { fontSize: "0.95rem", fontWeight: "600", marginBottom: "4px" },
  connectDesc: { fontSize: "0.82rem", color: "#aaa" },
  btnConnect: {
    background: "#1877f2",
    color: "#fff",
    border: "none",
    padding: "12px 24px",
    borderRadius: "8px",
    fontSize: "0.9rem",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  // Loading
  loadingBox: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "24px",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid rgba(38,179,94,0.15)",
    borderTop: "3px solid #26b35e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  // Accounts list
  selectLabel: {
    fontSize: "0.85rem",
    color: "#ccc",
    marginBottom: "12px",
    fontWeight: "500",
  },
  accountsList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "520px",
    maxHeight: "280px",
    overflowY: "auto",
    marginBottom: "28px",
  },
  accountItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  checkbox: {
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.15s ease",
  },
  accName: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "2px",
  },
  accMeta: { fontSize: "0.75rem", color: "#888" },
  selectedBadge: {
    fontSize: "0.65rem",
    background: "#26b35e",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: "20px",
    fontWeight: "600",
  },

  // CTA
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
    transition: "opacity 0.2s",
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
  blob: {
    position: "absolute",
    width: "380px",
    height: "380px",
    filter: "blur(80px)",
    opacity: 0.14,
    zIndex: 0,
    borderRadius: "50%",
    background: "#5fc61f",
    pointerEvents: "none",
  },
  blobLeft: {
    left: "-120px",
    top: "100%",
    transform: "translateY(-50%)",
  },
  blobRight: {
    right: "-120px",
    top: "0%",
  },
};

// CSS animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Step3;
