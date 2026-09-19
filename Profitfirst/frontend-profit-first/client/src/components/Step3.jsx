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

  const storeName = localStorage.getItem("userData")
    ? JSON.parse(localStorage.getItem("userData"))?.email?.split("@")[0]
    : "atlance-clothing";

  return (
    <div style={styles.shell}>
      {/* ── TOP FIXED PROGRESS BAR (40%) ── */}
      <div style={styles.prog}>
        <div style={styles.progFill}></div>
      </div>

      {/* ── LEFT SIDEBAR (.pf-sb) ── */}
      <aside style={styles.sb}>
        {/* Brand */}
        <div style={styles.brand}>
          <div style={styles.mark}>P₹</div>
          <div style={styles.bname}>
            Profit <em style={styles.bnameEm}>First</em>
          </div>
        </div>

        {/* Connections Section */}
        <div style={styles.conns}>
          <div style={styles.pfcLabel}>Connections</div>
          <div style={styles.connRow}>
            <div style={styles.connIcoSh}>S</div>
            <span style={styles.connNm}>Shopify</span>
            <span style={styles.connStLive}>Live</span>
          </div>
          <div style={styles.connRow}>
            <div style={styles.connIcoMt}>M</div>
            <span style={styles.connNm}>Meta Ads</span>
            <span style={styles.connStLive}>Live</span>
          </div>
          <div style={{ ...styles.connRow, borderBottom: "none" }}>
            <div style={styles.connIcoNd}>🚚</div>
            <span style={styles.connNm}>Shiprocket</span>
            <span style={styles.connStNext}>Next</span>
          </div>
        </div>

        {/* Data Unlocked Section */}
        <div style={styles.pfd}>
          <div style={styles.pfdLabel}>Data unlocked</div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Real revenue</div>
            <div style={styles.dsVG}>₹1,87,863</div>
          </div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Ad spend</div>
            <div style={styles.dsV}>
              {selectedAdAccountIds.length > 0 ? "Connecting..." : "Pending"}
            </div>
          </div>

          <div style={styles.ds}>
            <div style={styles.dsL}>ROAS</div>
            <div style={styles.dsV}>
              {selectedAdAccountIds.length > 0 ? "Calculating..." : "—"}
            </div>
          </div>

          <div style={{ ...styles.ds, borderBottom: "none", marginBottom: 0 }}>
            <div style={styles.dsL}>Net profit</div>
            <div style={styles.dsVDim}>Connect Shiprocket →</div>
          </div>
        </div>

        {/* Store Pill Footer */}
        <div style={styles.foot}>
          <div style={styles.storePill}>
            <div style={styles.spAv}>{storeName[0]?.toUpperCase() || "A"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.spNm}>{storeName}</div>
            </div>
            <div style={styles.spDot}></div>
          </div>
        </div>
      </aside>

      {/* ── RIGHT MAIN CONTENT (.pf-right) ── */}
      <div style={styles.right}>
        <div style={styles.obRight}>
          <div style={styles.cardWrap}>
            {/* Step eyebrow */}
            <div style={styles.eyebrow}>
              <span style={styles.eyebrowLine}></span>
              Step 3 of 7
            </div>

            {/* Headline */}
            <h1 style={styles.h1}>
              Which ad account
              <br />
              should we{" "}
              <em style={{ color: "#00c853", fontStyle: "normal" }}>track?</em>
            </h1>

            {/* Subtitle */}
            <p style={styles.sub}>
              Select the accounts running ads for this store. You can manage more
              accounts later in Settings.
            </p>

            {/* ── STATE 1: Meta not connected yet ── */}
            {adAccounts.length === 0 && !fetchingAccounts && (
              <div style={styles.connCard}>
                <div style={styles.ccHd}>
                  <div style={styles.ccLogoMt}>M</div>
                  <div>
                    <div style={styles.ccPnm}>Meta Ads Manager</div>
                    <div style={styles.ccPs}>Facebook & Instagram ads</div>
                  </div>
                </div>

                <div style={styles.ccPerms}>
                  <div style={styles.ccPerm}>Ad spend by campaign and day</div>
                  <div style={styles.ccPerm}>Purchase and ROAS data</div>
                  <div style={styles.ccPerm}>Campaign performance — read only</div>
                </div>

                <button
                  style={{ ...styles.btnG, width: "100%" }}
                  onClick={handleMetaConnect}
                >
                  Continue with Facebook →
                </button>
              </div>
            )}

            {/* ── STATE 2: Loading accounts ── */}
            {fetchingAccounts && (
              <div style={styles.centerBox}>
                <div style={styles.spinner}></div>
                <p style={{ fontSize: "13px", color: "var(--t2)" }}>
                  Reading your Meta ad accounts...
                </p>
              </div>
            )}

            {/* ── STATE 3: Accounts list (Multiple Select Checkboxes) ── */}
            {adAccounts.length > 0 && !fetchingAccounts && (
              <>
                <div style={styles.accOpts}>
                  {adAccounts.map((acc) => {
                    const isSelected = selectedAdAccountIds.includes(
                      acc.accountId,
                    );
                    return (
                      <div
                        key={acc.accountId}
                        onClick={() => toggleAccount(acc.accountId)}
                        style={{
                          ...styles.accOpt,
                          ...(isSelected ? styles.accOptOn : {}),
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          style={{
                            ...styles.accCheckbox,
                            ...(isSelected ? styles.accCheckboxOn : {}),
                          }}
                        >
                          {isSelected && <span style={styles.checkMark}>✓</span>}
                        </div>

                        {/* Account Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={styles.accNm}>{acc.name}</div>
                          <div style={styles.accId}>
                            Act ID: {acc.id || acc.accountId} · {acc.currency}
                          </div>
                        </div>

                        {isSelected && (
                          <span style={styles.badgeSelected}>Selected</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Button Row */}
                <div style={styles.btnRow}>
                  <button
                    style={{
                      ...styles.btnG,
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
                    {submitting ? "Saving..." : "Confirm and continue →"}
                  </button>
                  <button
                    style={styles.btnOutline}
                    onClick={() => (window.location.href = "/dashboard")}
                  >
                    I'll do this later →
                  </button>
                </div>

                <div style={styles.secNote}>
                  <span>🔒</span> Read-only access. We never change your campaigns.
                </div>
              </>
            )}

            {/* ── Fallback if no accounts found ── */}
            {adAccounts.length === 0 && !fetchingAccounts && (
              <button
                style={{ ...styles.btnOutline, marginTop: "12px" }}
                onClick={() => (window.location.href = "/dashboard")}
              >
                Skip for now →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── EXACT CSS DESIGN SYSTEM MATCHING SHOPIFY ONBOARDING ──────────
const styles = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#0a1a12", // var(--bg)
    color: "#e0ede4",      // var(--t1)
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  prog: {
    position: "fixed",
    top: 0,
    left: "210px",
    right: 0,
    height: "3px",
    background: "rgba(255, 255, 255, 0.07)",
    zIndex: 99,
  },
  progFill: {
    height: "100%",
    background: "#00c853",
    width: "40%", // Step 3 of 7 in prototype
    transition: "width .6s cubic-bezier(.4, 0, .2, 1)",
  },
  sb: {
    width: "210px",
    minHeight: "100vh",
    background: "#0d1f15", // var(--s1)
    borderRight: "1px solid rgba(255, 255, 255, 0.07)",
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    zIndex: 100,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "14px 15px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  mark: {
    width: "26px",
    height: "26px",
    background: "#00c853",
    borderRadius: "7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: "800",
    color: "#000",
  },
  bname: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#e0ede4",
  },
  bnameEm: {
    color: "#00c853",
    fontStyle: "normal",
  },
  conns: {
    padding: "11px 13px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  pfcLabel: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#3a5040",
    marginBottom: "7px",
  },
  connRow: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "5px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  connIcoSh: {
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    background: "#96bf48",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "9px",
    fontWeight: "700",
    color: "#fff",
    flexShrink: 0,
  },
  connIcoMt: {
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    background: "#1877f2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "9px",
    fontWeight: "700",
    color: "#fff",
    flexShrink: 0,
  },
  connIcoNd: {
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    background: "#1c3a22",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "9px",
    color: "#7a9880",
    flexShrink: 0,
  },
  connNm: {
    flex: 1,
    fontSize: "11.5px",
    color: "#7a9880",
  },
  connStLive: {
    fontSize: "9px",
    fontWeight: "600",
    padding: "2px 6px",
    borderRadius: "7px",
    whiteSpace: "nowrap",
    background: "rgba(0, 200, 83, 0.13)",
    color: "#00c853",
  },
  connStNext: {
    fontSize: "9px",
    fontWeight: "600",
    padding: "2px 6px",
    borderRadius: "7px",
    whiteSpace: "nowrap",
    background: "rgba(76, 138, 255, 0.12)",
    color: "#4c8aff",
  },
  pfd: {
    flex: 1,
    padding: "11px 13px",
    overflowY: "auto",
  },
  pfdLabel: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#3a5040",
    marginBottom: "7px",
  },
  ds: {
    marginBottom: "9px",
    paddingBottom: "9px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  dsL: {
    fontSize: "10px",
    color: "#3a5040",
    marginBottom: "2px",
  },
  dsV: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#e0ede4",
    letterSpacing: "-.03em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  dsVG: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#00c853",
    letterSpacing: "-.03em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  dsVDim: {
    color: "#3a5040",
    fontSize: "11px",
    fontWeight: "400",
  },
  foot: {
    padding: "10px 13px",
    borderTop: "1px solid rgba(255, 255, 255, 0.07)",
    marginTop: "auto",
  },
  storePill: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    background: "#112418",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: "7px",
    padding: "7px 10px",
  },
  spAv: {
    width: "22px",
    height: "22px",
    borderRadius: "5px",
    background: "#96bf48",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "9px",
    fontWeight: "700",
    color: "#fff",
  },
  spNm: {
    fontSize: "11px",
    fontWeight: "500",
    color: "#e0ede4",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  spDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: "#00c853",
    marginLeft: "auto",
    animation: "pls 2s infinite",
  },
  right: {
    marginLeft: "210px",
    flex: 1,
    minHeight: "100vh",
  },
  obRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "36px",
  },
  cardWrap: {
    width: "100%",
    maxWidth: "440px",
  },
  eyebrow: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#7a9880",
    marginBottom: "11px",
    display: "flex",
    alignItems: "center",
    gap: "7px",
  },
  eyebrowLine: {
    width: "14px",
    height: "1.5px",
    background: "#00c853",
    display: "inline-block",
  },
  h1: {
    fontSize: "27px",
    fontWeight: "800",
    color: "#e0ede4",
    letterSpacing: "-.5px",
    lineHeight: "1.15",
    marginBottom: "8px",
    maxWidth: "460px",
  },
  sub: {
    fontSize: "13px",
    color: "#7a9880",
    lineHeight: "1.65",
    maxWidth: "420px",
    marginBottom: "22px",
  },

  // Connect Card if not authorized yet
  connCard: {
    background: "#112418",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "13px",
    padding: "20px 22px",
    width: "100%",
    maxWidth: "420px",
    marginBottom: "18px",
  },
  ccHd: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    marginBottom: "13px",
  },
  ccLogoMt: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    background: "#1877f2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    color: "#fff",
    fontWeight: "bold",
    flexShrink: 0,
  },
  ccPnm: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#e0ede4",
  },
  ccPs: {
    fontSize: "11px",
    color: "#7a9880",
    marginTop: "2px",
  },
  ccPerms: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "16px",
  },
  ccPerm: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    fontSize: "12px",
    color: "#7a9880",
  },

  // Accounts List
  accOpts: {
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    marginBottom: "16px",
    maxHeight: "300px",
    overflowY: "auto",
  },
  accOpt: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#112418", // var(--s2)
    border: "1.5px solid rgba(255, 255, 255, 0.07)",
    borderRadius: "8px",
    padding: "11px 13px",
    transition: "all .18s",
    cursor: "pointer",
  },
  accOptOn: {
    borderColor: "#00c853",
    background: "rgba(0, 200, 83, 0.06)",
  },
  accCheckbox: {
    width: "18px",
    height: "18px",
    borderRadius: "5px",
    border: "2px solid rgba(255, 255, 255, 0.12)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all .18s",
  },
  accCheckboxOn: {
    borderColor: "#00c853",
    background: "#00c853",
  },
  checkMark: {
    fontSize: "11px",
    fontWeight: "800",
    color: "#000",
  },
  accNm: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#e0ede4",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  accId: {
    fontSize: "10.5px",
    color: "#3a5040",
    marginTop: "1px",
  },
  badgeSelected: {
    fontSize: "9px",
    fontWeight: "600",
    padding: "2px 7px",
    borderRadius: "7px",
    background: "rgba(0, 200, 83, 0.13)",
    color: "#00c853",
    whiteSpace: "nowrap",
  },

  // Buttons
  btnRow: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    flexWrap: "wrap",
    maxWidth: "420px",
  },
  btnG: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    background: "#00c853",
    color: "#000",
    border: "none",
    borderRadius: "8px",
    padding: "11px 20px",
    fontSize: "13px",
    fontWeight: "700",
    transition: "all .18s",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  btnOutline: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    color: "#7a9880",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "12.5px",
    fontWeight: "500",
    transition: "all .18s",
    cursor: "pointer",
  },
  secNote: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "11px",
    color: "#3a5040",
    maxWidth: "420px",
    marginTop: "9px",
  },
  centerBox: {
    textAlign: "center",
    padding: "24px 0",
  },
  spinner: {
    width: "28px",
    height: "28px",
    border: "2.5px solid rgba(255, 255, 255, 0.12)",
    borderTopColor: "#00c853",
    borderRadius: "50%",
    animation: "spin .75s linear infinite",
    margin: "0 auto 12px",
  },
};

// Keyframe animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pls { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;
document.head.appendChild(styleSheet);

export default Step3;