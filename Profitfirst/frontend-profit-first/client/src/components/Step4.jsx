import React, { useState } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../../axios";

const Step4 = ({ onComplete }) => {
  const [platform, setPlatform] = useState("Shiprocket");
  const [formData, setFormData] = useState({
    access_token: "",
    secret_key: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let payload = { platform };

      switch (platform) {
        case "Shiprocket":
        case "Nimbuspost":
        case "Shipway":
          payload.email = formData.email;
          payload.password = formData.password;
          break;

        case "Dilevery":
          payload.access_token = formData.access_token;
          break;

        case "Ithink Logistics":
          payload.access_token = formData.access_token;
          payload.secret_key = formData.secret_key;
          break;

        default:
          break;
      }

      const response = await axiosInstance.post("/onboard/step4", payload);

      if (response.data.success) {
        toast.success("✅ Shipping account connected!", { autoClose: 1500 });

        setTimeout(() => {
          window.location.href = "/onboarding/shiprocket";
        }, 1500);
      } else {
        console.log("Step 4 failed:", response.data);
        toast.error(response.data.message || "Connection failed");
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Failed to connect shipping account.";

      toast.error(errorMessage);
      console.error("Submission error:", err.response || err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      // Step 5 (Products/COGS) set karke aage badho ya direct Dashboard
      await axiosInstance
        .post("/onboard/set-step", { step: 5 })
        .catch(() => {});
    } catch (e) {}
    window.location.href = "/dashboard/products";
  };

  const storeName = localStorage.getItem("userData")
    ? JSON.parse(localStorage.getItem("userData"))?.email?.split("@")[0]
    : "atlance-clothing";

  const renderFields = () => {
    switch (platform) {
      case "Shiprocket":
        return (
          <>
            <InputField
              label="Shiprocket Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
            />
          </>
        );
      case "Dilevery":
        return (
          <InputField
            label="Access Token"
            name="access_token"
            value={formData.access_token}
            onChange={handleChange}
          />
        );
      case "Shipway":
        return (
          <>
            <InputField
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              label="License Key"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
            />
          </>
        );
      case "Ithink Logistics":
        return (
          <>
            <InputField
              label="Access Token"
              name="access_token"
              value={formData.access_token}
              onChange={handleChange}
            />
            <InputField
              label="Secret Key"
              name="secret_key"
              value={formData.secret_key}
              onChange={handleChange}
            />
          </>
        );
      case "Nimbuspost":
        return (
          <>
            <InputField
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.shell}>
      {/* ── TOP FIXED PROGRESS BAR (54%) ── */}
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
            <div style={styles.connIcoSr}>🚚</div>
            <span style={styles.connNm}>Shiprocket</span>
            <span style={styles.connStNext}>Connecting</span>
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
            <div style={styles.dsV}>₹96,090</div>
          </div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Shipping & RTOs</div>
            <div style={styles.dsVDim}>Connecting...</div>
          </div>

          <div style={{ ...styles.ds, borderBottom: "none", marginBottom: 0 }}>
            <div style={styles.dsL}>Net profit</div>
            <div style={styles.dsVDim}>Almost there...</div>
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
            {/* Step Eyebrow */}
            <div style={styles.eyebrow}>
              <span style={styles.eyebrowLine}></span>
              Step 4 of 7
            </div>

            {/* Headline */}
            <h1 style={styles.h1}>
              One more connection.
              <br />
              Then your{" "}
              <em style={{ color: "#00c853", fontStyle: "normal" }}>
                real profit
              </em>
              <br />
              is visible.
            </h1>

            {/* Subtitle */}
            <p style={styles.sub}>
              Shiprocket tells us which orders delivered and what shipping
              actually cost you — the most important number for your net profit.
            </p>

            {/* Form Card */}
            <div style={styles.formCard}>
              {/* Platform Tabs */}
              <div style={styles.tabRow}>
                {[
                  "Shiprocket",
                  "Dilevery",
                  "Shipway",
                  "Ithink Logistics",
                  "Nimbuspost",
                ].map((name) => {
                  const isActive = platform === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPlatform(name)}
                      style={{
                        ...styles.tab,
                        ...(isActive ? styles.tabActive : {}),
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>

              {/* Form fields */}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "18px" }}>{renderFields()}</div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...styles.btnG,
                    width: "100%",
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Connecting..." : "Connect Shiprocket →"}
                </button>
              </form>
            </div>

            {/* Skip Button */}
            <button
              type="button"
              style={styles.btnSkip}
              onClick={handleSkip}
            >
              I don't use Shiprocket — skip this →
            </button>

            {/* Coming soon chips */}
            <div style={styles.chipsRow}>
              {[
                "Shipway — coming soon",
                "Delhivery — coming soon",
                "Xpressbees — coming soon",
              ].map((chip) => (
                <span key={chip} style={styles.chip}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Reusable InputField matching the new design palette
const InputField = ({ label, name, value, onChange, type = "text" }) => (
  <div style={{ marginBottom: "14px" }}>
    <label style={styles.fieldLabel}>{label}</label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      style={styles.fieldInput}
      autoComplete="off"
      required
    />
  </div>
);

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
    width: "54%", // Step 4 in prototype
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
  connIcoSr: {
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    background: "#e83b3b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "9px",
    color: "#fff",
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
    marginBottom: "20px",
  },

  // Form Card
  formCard: {
    background: "#112418", // var(--s2)
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "13px",
    padding: "20px 22px",
    width: "100%",
    maxWidth: "420px",
    marginBottom: "16px",
  },
  tabRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginBottom: "16px",
  },
  tab: {
    padding: "4px 10px",
    borderRadius: "20px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "transparent",
    color: "#7a9880",
    fontSize: "11.5px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all .18s",
  },
  tabActive: {
    background: "#00c853",
    color: "#000",
    fontWeight: "700",
    borderColor: "#00c853",
  },
  fieldLabel: {
    display: "block",
    fontSize: "11px",
    color: "#7a9880",
    marginBottom: "6px",
    fontWeight: "500",
  },
  fieldInput: {
    width: "100%",
    background: "#162e1c", // var(--s3)
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "6px",
    padding: "8px 11px",
    fontSize: "12.5px",
    color: "#e0ede4",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color .2s",
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
  btnSkip: {
    background: "transparent",
    border: "none",
    color: "#3a5040",
    fontSize: "12px",
    cursor: "pointer",
    marginBottom: "14px",
    display: "block",
    textAlign: "left",
    padding: 0,
    transition: "color .15s",
  },
  chipsRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  chip: {
    fontSize: "10.5px",
    padding: "3px 9px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    color: "#3a5040",
  },
};

export default Step4;