import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import {
  FiSearch,
  FiPercent,
  FiBox,
  FiRefreshCw,
  FiCheck,
} from "react-icons/fi";
import axiosInstance from "../../axios";
import { useProfile } from "../ProfileContext";
import { useNavigate } from "react-router-dom";

const API_URL =
  import.meta.env.VITE_API_URL || "https://api.profitfirstanalytics.co.in";

const Products = () => {
  const { updateProfile } = useProfile();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [allVariantsList, setAllVariantsList] = useState([]);
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState(null);
  const [divisor, setDivisor] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [cogs, setCogs] = useState({});

  useEffect(() => {
    let pollInterval;
    const init = async () => {
      await triggerProductFetch(); // Fire the SQS job
      const found = await fetchProducts(); // Try to get data immediately

      if (!found) {
        pollInterval = setInterval(async () => {
          const nowFound = await fetchProducts();
          if (nowFound) {
            clearInterval(pollInterval);
          }
        }, 5000);
      }
    };

    init();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  const triggerProductFetch = async () => {
    try {
      await axiosInstance.post("/products/trigger-fetch");
    } catch (error) {
      console.error("Trigger fetch error:", error);
    }
  };

  const fetchProducts = async (isLoadMore = false) => {
    if (!isLoadMore && !allVariantsList.length) setLoading(true);
    try {
      const response = await axiosInstance.get("/products/list", {
        params: { limit: 50, lastKey: isLoadMore ? lastEvaluatedKey : null },
      });

      if (response.data.success && response.data.variants?.length > 0) {
        const newVariants = (response.data.variants || []).filter(
          (v) => Number(v.salePrice) > 0,
        );

        const updatedVariants = isLoadMore
          ? [...allVariantsList, ...newVariants]
          : newVariants;
        setAllVariantsList(updatedVariants);

        const productsMap = {};
        updatedVariants.forEach((v) => {
          if (!productsMap[v.productId]) {
            productsMap[v.productId] = {
              productId: v.productId,
              productName: v.productName || "Unnamed Product",
              productImage: v.productImage || "",
              variants: [],
            };
          }
          productsMap[v.productId].variants.push(v);
        });

        setProducts(Object.values(productsMap));
        setLoading(false);
        setLastEvaluatedKey(response.data.lastKey);

        setCogs((prev) => {
          const newCogs = { ...prev };
          newVariants.forEach((v) => {
            if (newCogs[v.variantId] === undefined) {
              newCogs[v.variantId] = v.costPrice || "";
            }
          });
          return newCogs;
        });
        return true;
      }
      return false;
    } catch (error) {
      toast.error("Failed to load products");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return products.filter((p) =>
      p.productName.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [products, searchTerm]);

  // Quick formula: 1 / divisor
  const applyGlobalFormula = () => {
    if (!divisor || Number(divisor) <= 0) {
      toast.error("Please enter a valid number (e.g., 2 or 2.5)");
      return;
    }
    const newCogs = { ...cogs };
    allVariantsList.forEach((v) => {
      newCogs[v.variantId] = Number(
        (Number(v.salePrice) / Number(divisor)).toFixed(2),
      );
    });
    setCogs(newCogs);
    toast.success(
      `Calculated costs using 1/${divisor} of sale price for all variants`,
    );
  };

  const handleCogsChange = (variantId, value) => {
    setCogs((prev) => ({
      ...prev,
      [variantId]: value === "" ? "" : Number(value),
    }));
  };

  const filledCount = useMemo(() => {
    const total = allVariantsList.length;
    const filled = Object.values(cogs).filter(
      (v) => v !== "" && Number(v) > 0,
    ).length;
    return { filled, total };
  }, [allVariantsList, cogs]);

  const accuracyPercent =
    filledCount.total > 0
      ? Math.round((filledCount.filled / filledCount.total) * 100)
      : 0;

  const handleSaveCogs = async () => {
    const hasAnyCosts = Object.values(cogs).some(
      (v) => v !== "" && Number(v) > 0,
    );
    if (!hasAnyCosts) {
      toast.error("Please enter at least one product cost before saving");
      return;
    }

    setIsSaving(true);
    const variants = Object.entries(cogs)
      .filter(([, costPrice]) => costPrice !== "" && Number(costPrice) > 0)
      .map(([variantId, costPrice]) => ({
        variantId,
        costPrice: Number(costPrice),
      }));

    try {
      const response = await axiosInstance.post("/products/save-cogs", {
        variants,
      });
      if (response.data.success) {
        toast.success("✅ Product costs saved!");
        updateProfile({ cogsCompleted: true });

        // Step 6 (Business Expenses) update karo
        await axiosInstance
          .post("/onboard/set-step", { step: 6 })
          .catch(() => {});

        navigate("/dashboard/business-expenses");
      }
    } catch (error) {
      toast.error("Failed to save costs. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    try {
      // Step 6 set karo — COGS skip kiya
      await axiosInstance
        .post("/onboard/set-step", { step: 6 })
        .catch(() => {});
    } catch (e) {}
    navigate("/dashboard/business-expenses");
  };

  const storeEmail = localStorage.getItem("userData")
    ? JSON.parse(localStorage.getItem("userData"))?.email
    : "atlance-clothing";

  const storeInitial = (storeEmail || "A")[0].toUpperCase();

  const fmt = (num) =>
    "₹" +
    Number(num || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div style={styles.shell}>
      {/* ── TOP FIXED PROGRESS BAR (75%) ── */}
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
          <div style={styles.pfdLabel}>Data unlocked</div>

          <div style={styles.ds}>
            <div style={styles.dsL}>COGS Accuracy</div>
            <div style={styles.dsVG}>{accuracyPercent}%</div>
            <div style={styles.dsS}>
              {filledCount.filled} of {filledCount.total} variants filled
            </div>
          </div>

          <div style={styles.ds}>
            <div style={styles.dsL}>Next Step</div>
            <div style={{ ...styles.dsV, color: "#f5a623" }}>Step 6 of 7</div>
            <div style={styles.dsS}>Fixed Business Overheads</div>
          </div>

          <div style={{ ...styles.ds, borderBottom: "none", marginBottom: 0 }}>
            <div style={styles.dsL}>Net Profit Truth</div>
            <div style={styles.dsVDim}>Unlocks on completion</div>
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
        <div style={styles.mainContent}>
          {/* ── HEADER ── */}
          <div style={{ marginBottom: "20px" }}>
            <div style={styles.eyebrow}>
              <span style={styles.eyebrowLine}></span>
              Step 5 of 7
            </div>
            <h1 style={styles.h1}>
              Add product costs for{" "}
              <em style={{ color: "#00c853", fontStyle: "normal" }}>
                exact profit
              </em>
            </h1>
            <p style={styles.sub}>
              Set unit cost for each variant to calculate your real Gross Margin
              and Net Profit. You can also use the quick formula tool or skip
              and set costs anytime later.
            </p>
          </div>

          {/* ── ACCURACY PROGRESS CARD (.acc-card-ob) ── */}
          <div style={styles.accCard}>
            <div style={styles.acTop}>
              <div style={styles.acLabel}>Profit Data Accuracy</div>
              <div
                style={{
                  ...styles.acPct,
                  color:
                    accuracyPercent >= 80
                      ? "#00c853"
                      : accuracyPercent >= 40
                        ? "#f5a623"
                        : "#ff3d5a",
                }}
              >
                {accuracyPercent}%
              </div>
            </div>
            <div style={styles.acBarWrap}>
              <div
                style={{
                  ...styles.acBar,
                  width: `${Math.min(accuracyPercent, 100)}%`,
                  background:
                    accuracyPercent >= 80
                      ? "#00c853"
                      : accuracyPercent >= 40
                        ? "#f5a623"
                        : "#ff3d5a",
                }}
              ></div>
            </div>
            <div style={styles.acSub}>
              {filledCount.filled} of {filledCount.total} variants filled ·{" "}
              {accuracyPercent === 100
                ? "100% SKU accurate"
                : "Remaining show ₹0 until set"}
            </div>
          </div>

          {/* ── SEARCH & QUICK ESTIMATOR TOOL ── */}
          <div style={styles.toolCard}>
            {/* Search */}
            <div style={styles.searchBox}>
              <FiSearch size={15} color="#7a9880" />
              <input
                type="text"
                placeholder="Search products by title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            {/* Quick Estimator Formula */}
            <div style={styles.estimatorBox}>
              <span style={styles.estimatorTitle}>
                <FiPercent size={12} /> Quick Formula:
              </span>
              <span style={{ fontSize: "11px", color: "#7a9880" }}>
                Sale Price ÷
              </span>
              <input
                type="number"
                placeholder="e.g. 2"
                value={divisor}
                onChange={(e) => setDivisor(e.target.value)}
                style={styles.estimatorInput}
              />
              <button
                type="button"
                onClick={applyGlobalFormula}
                style={styles.estimatorBtn}
              >
                Apply All
              </button>
            </div>
          </div>

          {/* ── PRODUCTS TABLE CARD ── */}
          <div style={styles.tableCard}>
            <div style={{ maxHeight: "540px", overflowY: "auto" }}>
              <table style={styles.table}>
                <thead style={styles.thead}>
                  <tr>
                    <th style={{ ...styles.th, width: "54px" }}>PHOTO</th>
                    <th style={{ ...styles.th, textAlign: "left" }}>PRODUCT</th>
                    <th style={{ ...styles.th, textAlign: "left" }}>
                      VARIANT TITLE
                    </th>
                    <th style={{ ...styles.th, textAlign: "right" }}>
                      SELLING PRICE
                    </th>
                    <th
                      style={{
                        ...styles.th,
                        textAlign: "right",
                        width: "130px",
                      }}
                    >
                      YOUR COST (COGS)
                    </th>
                    <th
                      style={{
                        ...styles.th,
                        width: "40px",
                        textAlign: "center",
                      }}
                    >
                      STATUS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product) =>
                      product.variants?.map((variant, idx) => {
                        const hasCost =
                          cogs[variant.variantId] !== "" &&
                          Number(cogs[variant.variantId]) > 0;
                        return (
                          <tr key={variant.variantId} style={styles.tr}>
                            {/* Photo (first row only per product) */}
                            <td style={styles.td}>
                              {idx === 0 && (
                                <img
                                  src={
                                    product.productImage ||
                                    variant.productImage ||
                                    "https://via.placeholder.com/38?text=📦"
                                  }
                                  alt={product.productName}
                                  style={styles.prodThumb}
                                />
                              )}
                            </td>

                            {/* Product Name */}
                            <td style={styles.td}>
                              {idx === 0 && (
                                <div>
                                  <div style={styles.prodTitle}>
                                    {product.productName}
                                  </div>
                                  <span style={styles.prodMeta}>
                                    {product.variants.length} variant
                                    {product.variants.length > 1 ? "s" : ""}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Variant Name */}
                            <td style={styles.td}>
                              <span style={styles.variantBadge}>
                                {variant.variantName || "Default"}
                              </span>
                            </td>

                            {/* Selling Price */}
                            <td
                              style={{
                                ...styles.td,
                                textAlign: "right",
                                fontWeight: "600",
                              }}
                            >
                              {fmt(variant.salePrice)}
                            </td>

                            {/* COGS Input */}
                            <td style={{ ...styles.td, textAlign: "right" }}>
                              <div style={styles.inputWrap}>
                                <span
                                  style={{ fontSize: "11px", color: "#7a9880" }}
                                >
                                  ₹
                                </span>
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  min="0"
                                  step="0.01"
                                  value={cogs[variant.variantId] ?? ""}
                                  onChange={(e) =>
                                    handleCogsChange(
                                      variant.variantId,
                                      e.target.value,
                                    )
                                  }
                                  style={styles.cogsInput}
                                />
                              </div>
                            </td>

                            {/* Status */}
                            <td style={{ ...styles.td, textAlign: "center" }}>
                              {hasCost ? (
                                <div style={styles.chkDone}>✓</div>
                              ) : (
                                <div style={styles.chkPending}></div>
                              )}
                            </td>
                          </tr>
                        );
                      }),
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan="6"
                        style={{ padding: "48px 16px", textAlign: "center" }}
                      >
                        <FiBox
                          size={32}
                          color="#3a5040"
                          style={{ margin: "0 auto 8px" }}
                        />
                        <p style={{ fontSize: "12.5px", color: "#7a9880" }}>
                          No active products found. Click refresh above to sync
                          catalog.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Load More Pagination */}
            {lastEvaluatedKey && (
              <button
                type="button"
                onClick={() => fetchProducts(true)}
                style={styles.btnLoadMore}
              >
                Load More Products ↓
              </button>
            )}
          </div>

          {/* ── FOOTER ACTIONS ── */}
          <div style={styles.footerRow}>
            <button type="button" onClick={handleSkip} style={styles.btnSkip}>
              Skip — add costs later in Products tab →
            </button>

            <button
              type="button"
              onClick={handleSaveCogs}
              disabled={isSaving}
              style={{
                ...styles.btnG,
                opacity: isSaving ? 0.6 : 1,
                cursor: isSaving ? "not-allowed" : "pointer",
              }}
            >
              {isSaving ? "Saving Costs..." : "Save & Continue →"}
            </button>
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
    width: "75%", // Step 5 of 7
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
    background: "#0a1a12",
  },
  mainContent: {
    maxWidth: "860px",
    margin: "0 auto",
    padding: "40px 32px 80px",
  },
  eyebrow: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#7a9880",
    marginBottom: "8px",
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
    lineHeight: "1.2",
    marginBottom: "6px",
  },
  sub: {
    fontSize: "13px",
    color: "#7a9880",
    lineHeight: "1.6",
    maxWidth: "580px",
  },

  // Accuracy card
  accCard: {
    background: "#112418", // var(--s2)
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "12px",
    padding: "14px 18px",
    marginBottom: "16px",
  },
  acTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  acLabel: {
    fontSize: "11.5px",
    color: "#7a9880",
    fontWeight: "600",
  },
  acPct: {
    fontSize: "15px",
    fontWeight: "800",
    letterSpacing: "-.03em",
  },
  acBarWrap: {
    height: "6px",
    background: "#162e1c",
    borderRadius: "3px",
    overflow: "hidden",
    marginBottom: "6px",
  },
  acBar: {
    height: "100%",
    borderRadius: "3px",
    transition: "width .6s cubic-bezier(.4, 0, .2, 1)",
  },
  acSub: {
    fontSize: "11px",
    color: "#3a5040",
  },

  // Tool card (Search + Estimator)
  toolCard: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    background: "#112418",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "10px 14px",
    marginBottom: "16px",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#0a1a12",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    padding: "6px 12px",
    flex: "1 1 260px",
  },
  searchInput: {
    background: "transparent",
    border: "none",
    color: "#e0ede4",
    fontSize: "12.5px",
    outline: "none",
    width: "100%",
  },
  estimatorBox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(0, 200, 83, 0.06)",
    border: "1px solid rgba(0, 200, 83, 0.18)",
    borderRadius: "8px",
    padding: "4px 10px",
  },
  estimatorTitle: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#00c853",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  estimatorInput: {
    width: "50px",
    background: "#0a1a12",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "5px",
    color: "#e0ede4",
    fontSize: "11.5px",
    padding: "3px 6px",
    textAlign: "center",
    outline: "none",
  },
  estimatorBtn: {
    background: "#00c853",
    color: "#000",
    border: "none",
    borderRadius: "6px",
    padding: "5px 10px",
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer",
  },

  // Table Card
  tableCard: {
    background: "#112418",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    overflow: "hidden",
    marginBottom: "16px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  thead: {
    background: "#0d1f15",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  th: {
    fontSize: "10px",
    fontWeight: "700",
    color: "#3a5040",
    letterSpacing: ".06em",
    padding: "10px 14px",
  },
  tr: {
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    transition: "background .15s",
  },
  td: {
    padding: "9px 14px",
    fontSize: "12px",
    verticalAlign: "middle",
  },
  prodThumb: {
    width: "36px",
    height: "36px",
    borderRadius: "6px",
    objectCover: "cover",
    background: "#0a1a12",
    border: "1px solid rgba(255, 255, 255, 0.08)",
  },
  prodTitle: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#e0ede4",
    maxWidth: "240px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  prodMeta: {
    fontSize: "10.5px",
    color: "#7a9880",
  },
  variantBadge: {
    fontSize: "11px",
    color: "#7a9880",
    background: "rgba(255, 255, 255, 0.04)",
    padding: "3px 8px",
    borderRadius: "5px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
  },
  inputWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  cogsInput: {
    width: "84px",
    background: "#162e1c",
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "6px",
    padding: "6px 8px",
    fontSize: "12px",
    color: "#e0ede4",
    textAlign: "right",
    outline: "none",
  },
  chkDone: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    background: "#00c853",
    color: "#000",
    fontSize: "8.5px",
    fontWeight: "900",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  chkPending: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    display: "inline-block",
  },
  btnLoadMore: {
    width: "100%",
    padding: "10px",
    background: "transparent",
    border: "none",
    borderTop: "1px solid rgba(255, 255, 255, 0.07)",
    color: "#00c853",
    fontSize: "11.5px",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "center",
  },

  // Footer Actions
  footerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
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
    padding: "11px 24px",
    fontSize: "13px",
    fontWeight: "700",
    transition: "all .18s",
    cursor: "pointer",
  },
  btnSkip: {
    background: "transparent",
    border: "none",
    color: "#7a9880",
    fontSize: "12px",
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
};

export default Products;
