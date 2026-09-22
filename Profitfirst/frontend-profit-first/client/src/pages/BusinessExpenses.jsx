import React, { useState, useEffect } from "react";
import axiosInstance from "../../axios";
import { toast } from "react-toastify";
import { useProfile } from "../ProfileContext";
import { useNavigate } from "react-router-dom";

const API_URL =
  import.meta.env.VITE_API_URL || "https://api.profitfirstanalytics.co.in";

const BusinessExpenses = () => {
  const navigate = useNavigate();
  const { updateProfile } = useProfile();

  const [expenses, setExpenses] = useState({
    staffSalary: 0,
    officeRent: 0,
    agencyFees: 0,
    otherExpenses: 0,
    rtoHandlingFees: 0,
    paymentGatewayFeePercent: 2.5,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.get("/user/business-expenses");
      if (response.data.success && response.data.expenses) {
        const ex = response.data.expenses;
        setExpenses({
          staffSalary: ex.staffSalary || 0,
          officeRent: ex.officeRent || 0,
          agencyFees: ex.agencyFees || 0,
          otherExpenses: ex.otherExpenses || 0,
          rtoHandlingFees: ex.rtoHandlingFees || 0,
          paymentGatewayFeePercent: ex.paymentGatewayFeePercent || 2.5,
        });
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setExpenses((prev) => ({ ...prev, [field]: numValue }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await axiosInstance.post("/user/business-expenses", {
        expenses,
      });

      if (response.data.success) {
        toast.success("✅ Fixed costs saved!");
        updateProfile({ expensesCompleted: true });

        // Step 7 complete karo aur dashboard unlock karo
        await axiosInstance
          .post("/onboard/set-step", { step: 7, onboardingCompleted: true })
          .catch(() => {});

        navigate("/dashboard");
      }
    } catch (error) {
      toast.error("Failed to save expenses");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    try {
      // Step 7 mark karo — Expenses skip kiya
      await axiosInstance
        .post("/onboard/set-step", { step: 7, onboardingCompleted: true })
        .catch(() => {});
    } catch (e) {}
    navigate("/dashboard");
  };

  const storeEmail = localStorage.getItem("userData")
    ? JSON.parse(localStorage.getItem("userData"))?.email
    : "atlance-clothing";

  const storeInitial = (storeEmail || "A")[0].toUpperCase();

  const totalFixedMonthly =
    (expenses.staffSalary || 0) +
    (expenses.officeRent || 0) +
    (expenses.agencyFees || 0) +
    (expenses.otherExpenses || 0);

  const fmt = (num) =>
    "₹" + Number(num || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div style={styles.shell}>
      {/* ── TOP FIXED PROGRESS BAR (86% - Step 6) ── */}
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

        {/* Connections Section - All 3 Live! */}
        <div style={styles.conns}>
          <div style={styles.pfcLabel}>Connections ✓</div>
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
            <span style={styles.connStLive}>Live</span>
          </div>
        </div>

        {/* Data Unlocked Section */}
        <div style={styles.pfd}>
          <div style={styles.pfdLabel}>Your numbers</div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Real revenue</div>
            <div style={styles.dsVG}>₹1,87,863</div>
          </div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Net profit</div>
            <div style={styles.dsVR}>−₹70,460</div>
          </div>

          <div style={{ ...styles.ds, borderBottom: "none", marginBottom: 0 }}>
            <div style={styles.dsL}>Fixed costs</div>
            <div style={styles.dsV}>{fmt(totalFixedMonthly)}</div>
            <div style={styles.dsS}>Update on right</div>
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

            {/* ── OPTIONAL PILL ── */}
            <div style={styles.optPill}>
              ⚡ Optional — one-time setup
            </div>

            {/* ── STEP EYEBROW ── */}
            <div style={styles.eyebrow}>
              <span style={styles.eyebrowLine}></span>
              Step 6 of 7
            </div>

            {/* ── HEADLINE ── */}
            <h1 style={styles.h1}>
              Add fixed costs for<br />
              <em style={{ color: "#00c853", fontStyle: "normal" }}>
                true net profit
              </em>
            </h1>

            {/* ── SUBTITLE ── */}
            <p style={styles.sub}>
              Monthly salary, rent, agency fees. Enter once, we subtract automatically. Edit anytime in Settings.
            </p>

            {/* ── FORM CARD (.ff-form) ── */}
            <div style={styles.ffForm}>
              {/* Row 1: Team Salaries */}
              <div style={styles.ffRow}>
                <div>
                  <div style={styles.ffNm}>Team Salaries</div>
                  <div style={styles.ffDesc}>Total monthly salary</div>
                </div>
                <div style={styles.ffIw}>
                  <span style={styles.ffCurr}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={expenses.staffSalary === 0 ? "" : expenses.staffSalary}
                    onChange={(e) => handleInputChange("staffSalary", e.target.value)}
                    placeholder="0"
                    style={styles.ffInp}
                  />
                </div>
              </div>

              {/* Row 2: Office Rent */}
              <div style={styles.ffRow}>
                <div>
                  <div style={styles.ffNm}>Office Rent</div>
                  <div style={styles.ffDesc}>Monthly rent</div>
                </div>
                <div style={styles.ffIw}>
                  <span style={styles.ffCurr}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={expenses.officeRent === 0 ? "" : expenses.officeRent}
                    onChange={(e) => handleInputChange("officeRent", e.target.value)}
                    placeholder="0"
                    style={styles.ffInp}
                  />
                </div>
              </div>

              {/* Row 3: Agency Fees */}
              <div style={styles.ffRow}>
                <div>
                  <div style={styles.ffNm}>Agency Fees</div>
                  <div style={styles.ffDesc}>Marketing agency retainer</div>
                </div>
                <div style={styles.ffIw}>
                  <span style={styles.ffCurr}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={expenses.agencyFees === 0 ? "" : expenses.agencyFees}
                    onChange={(e) => handleInputChange("agencyFees", e.target.value)}
                    placeholder="0"
                    style={styles.ffInp}
                  />
                </div>
              </div>

              {/* Row 4: RTO Handling Fees */}
              <div style={styles.ffRow}>
                <div>
                  <div style={styles.ffNm}>RTO Handling Fees</div>
                  <div style={styles.ffDesc}>Cost per returned shipment</div>
                </div>
                <div style={styles.ffIw}>
                  <span style={styles.ffCurr}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={expenses.rtoHandlingFees === 0 ? "" : expenses.rtoHandlingFees}
                    onChange={(e) => handleInputChange("rtoHandlingFees", e.target.value)}
                    placeholder="60"
                    style={styles.ffInp}
                  />
                </div>
              </div>

              {/* Row 5: Payment Gateway Fee */}
              <div style={styles.ffRow}>
                <div>
                  <div style={styles.ffNm}>Gateway Fee %</div>
                  <div style={styles.ffDesc}>Percentage charged per transaction</div>
                </div>
                <div style={styles.ffIw}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenses.paymentGatewayFeePercent === 0 ? "" : expenses.paymentGatewayFeePercent}
                    onChange={(e) => handleInputChange("paymentGatewayFeePercent", e.target.value)}
                    placeholder="2.5"
                    style={{ ...styles.ffInp, width: "65px", textAlign: "center" }}
                  />
                  <span style={styles.ffCurr}>%</span>
                </div>
              </div>

              {/* Row 6: Other Fixed Costs */}
              <div style={{ ...styles.ffRow, borderBottom: "none" }}>
                <div>
                  <div style={styles.ffNm}>Other Fixed Costs</div>
                  <div style={styles.ffDesc}>Software, tools, misc</div>
                </div>
                <div style={styles.ffIw}>
                  <span style={styles.ffCurr}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={expenses.otherExpenses === 0 ? "" : expenses.otherExpenses}
                    onChange={(e) => handleInputChange("otherExpenses", e.target.value)}
                    placeholder="0"
                    style={styles.ffInp}
                  />
                </div>
              </div>
            </div>

            {/* ── ACTION BUTTONS (.btn-row) ── */}
            <div style={styles.btnRow}>
              <button
                type="button"
                style={styles.btnG}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save & open dashboard →"}
              </button>
              <button
                type="button"
                style={styles.btnOutline}
                onClick={handleSkip}
              >
                Skip for now →
              </button>
            </div>

            {/* ── FOOTER CAPTION ── */}
            <div style={styles.ctaNote}>
              Skipping shows ₹0 for fixed costs on your dashboard
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

// ── EXACT CSS DESIGN SYSTEM FROM PROTOTYPE SCREEN H ─────────────────
const styles = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#0a1a12", // var(--bg)
    color: "#e0ede4",      // var(--t1)
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
    width: "86%", // Screen H: 86%
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
  },
  dsVG: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#00c853",
    letterSpacing: "-.03em",
    lineHeight: 1,
  },
  dsVR: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#ff3d5a",
    letterSpacing: "-.03em",
    lineHeight: 1,
  },
  dsS: {
    fontSize: "10px",
    color: "#3a5040",
    marginTop: "1px",
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
    flex: 1,
    minHeight: "100vh",
    background: "#0a1a12",
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
  optPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    fontWeight: "600",
    padding: "3px 10px",
    borderRadius: "16px",
    background: "rgba(245, 166, 35, 0.12)", // var(--ya)
    color: "#f5a623",                       // var(--y)
    marginBottom: "14px",
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

  // Form (.ff-form)
  ffForm: {
    width: "100%",
    maxWidth: "440px",
    background: "#112418", // var(--s2)
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "10px",
    overflow: "hidden",
    marginBottom: "18px",
  },
  ffRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 14px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  ffNm: {
    fontSize: "12.5px",
    fontWeight: "500",
    color: "#e0ede4",
    marginBottom: "1px",
  },
  ffDesc: {
    fontSize: "11px",
    color: "#3a5040",
  },
  ffIw: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  ffCurr: {
    fontSize: "12px",
    color: "#7a9880",
  },
  ffInp: {
    width: "95px",
    background: "#162e1c", // var(--s3)
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "6px",
    padding: "6px 9px",
    fontSize: "12.5px",
    color: "#e0ede4",
    textAlign: "right",
    outline: "none",
    boxSizing: "border-box",
  },

  // Buttons (.btn-row)
  btnRow: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    flexWrap: "wrap",
    maxWidth: "440px",
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
};

export default BusinessExpenses;