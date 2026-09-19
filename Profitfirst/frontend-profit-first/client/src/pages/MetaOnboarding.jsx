import { useEffect, useState } from "react";
import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL || "https://api.profitfirstanalytics.co.in";

const MetaOnboarding = () => {
  const [status, setStatus] = useState("loading"); // loading | syncing | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  const [data, setData] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetchInsight();
  }, []);

  const fetchInsight = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await axios.get(`${API_URL}/api/onboard/meta-insight`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = res.data;
      if (d.syncStatus === "in_progress") {
        setStatus("syncing");
        setTimeout(fetchInsight, 5000);
        return;
      }
      setData(d);
      setStatus("ready");
    } catch (err) {
      console.error("Meta insight error:", err);
      setErrorMsg(err.response?.data?.error || "Failed to load Meta data.");
      setStatus("error");
    }
  };

  const fmt = (num) =>
    "₹" +
    Number(num || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const storeEmail = localStorage.getItem("userData")
    ? JSON.parse(localStorage.getItem("userData"))?.email
    : "atlance-clothing";

  const storeInitial = (storeEmail || "A")[0].toUpperCase();

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
            <div style={styles.dsL}>Ad Spend (30d)</div>
            <div style={styles.dsV}>{data ? fmt(data.totalAdSpend) : "—"}</div>
          </div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Blended ROAS</div>
            <div style={styles.dsVG}>{data?.roas ? `${data.roas}x` : "—"}</div>
            <div style={styles.dsS}>Across all connected accounts</div>
          </div>

          <div style={{ ...styles.ds, borderBottom: "none", marginBottom: 0 }}>
            <div style={styles.dsL}>Shipping & RTO Cost</div>
            <div style={styles.dsVDim}>Connect Shiprocket →</div>
          </div>
        </div>

        {/* Store Pill Footer */}
        <div style={styles.foot}>
          <div style={styles.storePill}>
            <div style={styles.spAv}>{storeInitial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.spNm}>
                {storeEmail.replace(".myshopify.com", "")}
              </div>
            </div>
            <div style={styles.spDot}></div>
          </div>
        </div>
      </aside>

      {/* ── RIGHT MAIN CONTENT (.pf-right) ── */}
      <div style={styles.right}>
        <div style={styles.obRight}>
          <div style={styles.cardWrap}>
            {/* LOADING STATE */}
            {status === "loading" && (
              <div style={styles.centerBox}>
                <div style={styles.spinner}></div>
                <p style={{ fontSize: "13px", color: "var(--t2)" }}>
                  Loading Meta ad data...
                </p>
              </div>
            )}

            {/* SYNCING STATE */}
            {status === "syncing" && (
              <div style={styles.centerBox}>
                <div style={styles.spinner}></div>
                <h2
                  style={{
                    fontSize: "16px",
                    fontWeight: "700",
                    color: "var(--t1)",
                    marginBottom: "6px",
                  }}
                >
                  Fetching your ad spend...
                </h2>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--t2)",
                    marginBottom: "16px",
                  }}
                >
                  Pulling last 30 days metrics across accounts. This takes 20–40
                  seconds.
                </p>
                <div style={styles.progressBar}>
                  <div style={styles.progressFill}></div>
                </div>
              </div>
            )}

            {/* ERROR STATE */}
            {status === "error" && (
              <div style={styles.centerBox}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
                <h2
                  style={{
                    fontSize: "15px",
                    fontWeight: "700",
                    color: "#ff3d5a",
                    marginBottom: "8px",
                  }}
                >
                  {errorMsg || "Failed to load Meta data."}
                </h2>
                <button
                  style={styles.btnG}
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </div>
            )}

            {/* READY STATE */}
            {status === "ready" && data && (
              <>
                {/* ── REVEAL / INSIGHT CARD ── */}
                <div style={styles.reveal}>
                  <div style={styles.revT}>
                    Meta Ads connected — first insight
                  </div>

                  <div style={styles.revNums}>
                    <div style={styles.rnFirst}>
                      <div style={styles.rnV}>{fmt(data.totalAdSpend)}</div>
                      <div style={styles.rnL}>Ad spend (30d)</div>
                    </div>
                    <div style={styles.rnLast}>
                      <div style={styles.rnVG}>
                        {data.roas ? `${data.roas}x` : "—"}
                      </div>
                      <div style={styles.rnL}>Blended ROAS</div>
                    </div>
                  </div>

                  <div style={styles.revIns}>
                    <strong style={{ color: "var(--t1)" }}>
                      ROAS {data.roas} shows revenue per rupee spent — not real
                      profit.
                    </strong>{" "}
                    Connect Shiprocket next to add shipping and RTO costs — then
                    your real profit on ad spend becomes visible.
                  </div>
                </div>

                {/* ── EYEBROW STEP ── */}
                <div style={styles.eyebrow}>
                  <span style={styles.eyebrowLine}></span>
                  Step 3 of 7
                </div>

                {/* ── HEADLINE ── */}
                <h1 style={styles.h1}>
                  Ads are running.
                  <br />
                  Now track{" "}
                  <em style={{ color: "#00c853", fontStyle: "normal" }}>
                    real profit.
                  </em>
                </h1>

                {/* ── SUBTITLE ── */}
                <p style={styles.sub}>
                  Connect Shiprocket to see shipping costs and RTO losses
                  against your ad spend.
                </p>

                {/* ── BUTTON ROW ── */}
                <div style={styles.btnRow}>
                  <button
                    style={styles.btnG}
                    onClick={() => (window.location.href = "/onboarding")}
                  >
                    Connect Shiprocket →
                  </button>

                  <button
                    style={styles.btnOutline}
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("accessToken");
                        // Shiprocket skip kiya -> Step 5 (Products/COGS) pe bhejo
                        await axios
                          .post(
                            `${API_URL}/api/onboard/set-step`,
                            { step: 5 },
                            { headers: { Authorization: `Bearer ${token}` } },
                          )
                          .catch((e) =>
                            console.warn("set-step warning:", e.message),
                          );
                      } catch (e) {
                        console.warn("set-step failed:", e.message);
                      }
                      window.location.href = "/dashboard/products";
                    }}
                  >
                    I'll do this later →
                  </button>
                </div>

                {/* ── FOOTER CAPTION ── */}
                <div style={styles.ctaNote}>
                  Skipping shows ₹0 for shipping costs on your dashboard
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── EXACT CSS DESIGN SYSTEM FROM PROTOTYPE ─────────────────────────
const styles = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#0a1a12", // var(--bg)
    color: "#e0ede4", // var(--t1)
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
    width: "40%",
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
  dsS: {
    fontSize: "10px",
    color: "#3a5040",
    marginTop: "1px",
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
  reveal: {
    background: "rgba(0, 200, 83, 0.13)",
    border: "1px solid rgba(0, 200, 83, 0.18)",
    borderRadius: "10px",
    padding: "13px 16px",
    marginBottom: "18px",
  },
  revT: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#00c853",
    marginBottom: "9px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  revNums: {
    display: "flex",
    borderTop: "1px solid rgba(0, 200, 83, 0.15)",
    paddingTop: "9px",
    marginBottom: "9px",
  },
  rnFirst: {
    flex: 1,
    padding: "0 9px 0 0",
    borderRight: "1px solid rgba(0, 200, 83, 0.12)",
  },
  rnLast: {
    flex: 1,
    padding: "0 0 0 9px",
    borderRight: "none",
  },
  rnV: {
    fontSize: "17px",
    fontWeight: "800",
    color: "#e0ede4",
    letterSpacing: "-.04em",
    lineHeight: 1,
    marginBottom: "2px",
    fontVariantNumeric: "tabular-nums",
  },
  rnVG: {
    fontSize: "17px",
    fontWeight: "800",
    color: "#00c853",
    letterSpacing: "-.04em",
    lineHeight: 1,
    marginBottom: "2px",
    fontVariantNumeric: "tabular-nums",
  },
  rnL: {
    fontSize: "10px",
    color: "#7a9880",
  },
  revIns: {
    fontSize: "12px",
    color: "#7a9880",
    lineHeight: "1.6",
    borderTop: "1px solid rgba(0, 200, 83, 0.12)",
    paddingTop: "8px",
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
  ctaNote: {
    marginTop: "7px",
    fontSize: "11px",
    color: "#3a5040",
  },
  centerBox: {
    textAlign: "center",
    padding: "30px 0",
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
  progressBar: {
    width: "240px",
    height: "4px",
    background: "rgba(255,255,255,0.07)",
    borderRadius: "3px",
    margin: "0 auto",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "60%",
    background: "#00c853",
    animation: "pulse 1.5s ease-in-out infinite",
  },
};

// ── KEYFRAME ANIMATIONS ───────────────────────────────────────────
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes pls { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;
document.head.appendChild(styleSheet);

export default MetaOnboarding;
