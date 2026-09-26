import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../../axios";
import { useProfile } from "../ProfileContext";
import { useNavigate } from "react-router-dom";

const Products = () => {
  const { updateProfile } = useProfile();
  const navigate = useNavigate();

  // ── States ──────────────────────────────────────────────────
  const [topProducts, setTopProducts] = useState([]);
  const [remainingProducts, setRemainingProducts] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [topRevenuePercent, setTopRevenuePercent] = useState(84);

  const [showAll20, setShowAll20] = useState(false);
  const [bulkPercent, setBulkPercent] = useState(40);
  const [customPercent, setCustomPercent] = useState(40);
  const [bulkApplied, setBulkApplied] = useState(false);

  // Accordion state: Kaunse products ke variants open hain
  const [expandedProductIds, setExpandedProductIds] = useState(new Set());

  const [exactCogs, setExactCogs] = useState({}); // { [variantId]: number }
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Load on mount ───────────────────────────────────────────
  useEffect(() => {
    loadTopSelling();
  }, []);

  const loadTopSelling = async () => {
    setLoading(true);
    try {
      await axiosInstance.post("/products/trigger-fetch").catch(() => {});
      const res = await axiosInstance.get("/products/top-selling");

      if (res.data.success) {
        const top = res.data.topProducts || [];
        const rem = res.data.remainingProducts || [];
        setTopProducts(top);
        setRemainingProducts(rem);
        setTotalRevenue(res.data.totalRevenue || 0);
        setTopRevenuePercent(res.data.topRevenuePercent || 84);

        // Pre-fill existing costs
        const cogsMap = {};
        top.forEach((p) => {
          p.variants?.forEach((v) => {
            if (v.costPrice > 0) cogsMap[v.variantId] = v.costPrice;
          });
        });
        setExactCogs(cogsMap);
      }
    } catch (err) {
      console.error("Failed to load products:", err);
      toast.error("Failed to load top selling products");
    } finally {
      setLoading(false);
    }
  };

  const fmt = (num) =>
    "₹" + Number(num || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  // ── Toggle accordion for a product ──────────────────────────
  const toggleProductExpand = (productId) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // ── Top Products & Accuracy Calculation ─────────────────────
  const filledProductsCount = useMemo(() => {
    return topProducts.filter((p) =>
      p.variants?.some((v) => exactCogs[v.variantId] > 0)
    ).length;
  }, [topProducts, exactCogs]);

  const coveredRevenue = useMemo(() => {
    return topProducts.reduce((sum, p) => {
      const isFilled = p.variants?.some((v) => exactCogs[v.variantId] > 0);
      return isFilled ? sum + Number(p.revenue || 0) : sum;
    }, 0);
  }, [topProducts, exactCogs]);

  const coveredRevenuePercent =
    totalRevenue > 0
      ? Math.round((coveredRevenue / totalRevenue) * 100)
      : 0;

  const accuracyPercent = useMemo(() => {
    let acc = coveredRevenuePercent;
    if (bulkApplied) acc += 100 - topRevenuePercent;
    return Math.min(acc, 100);
  }, [coveredRevenuePercent, bulkApplied, topRevenuePercent]);

  // Main product cost change (applies to all its variants)
  const handleProductCostChange = (product, val) => {
    const costNum = val === "" ? "" : Number(val);
    setExactCogs((prev) => {
      const next = { ...prev };
      product.variants?.forEach((v) => {
        next[v.variantId] = costNum;
      });
      return next;
    });
  };

  // Specific single variant cost change
  const handleVariantCostChange = (variantId, val) => {
    const costNum = val === "" ? "" : Number(val);
    setExactCogs((prev) => ({
      ...prev,
      [variantId]: costNum,
    }));
  };

  // ── Save Handlers ───────────────────────────────────────────
  const handleSaveTop = async () => {
    if (filledProductsCount === 0) {
      toast.error("Please enter cost for at least one product");
      return;
    }

    setIsSaving(true);
    const exactVariants = Object.entries(exactCogs)
      .filter(([, v]) => v !== "" && Number(v) > 0)
      .map(([variantId, costPrice]) => ({
        variantId,
        costPrice: Number(costPrice),
      }));

    try {
      const res = await axiosInstance.post("/products/save-cogs-bulk", {
        exactVariants,
        bulkPercent: null,
        bulkVariantIds: [],
      });
      if (res.data?.success) {
        toast.success(`✅ Saved ${filledProductsCount} product costs!`);
      }
    } catch (err) {
      toast.error("Failed to save product costs");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyBulk = async () => {
    setIsSaving(true);
    const exactVariants = Object.entries(exactCogs)
      .filter(([, v]) => v !== "" && Number(v) > 0)
      .map(([variantId, costPrice]) => ({
        variantId,
        costPrice: Number(costPrice),
      }));

    const remainingVariantIds = remainingProducts.flatMap(
      (p) => p.variants?.map((v) => v.variantId) || []
    );

    try {
      await axiosInstance.post("/products/save-cogs-bulk", {
        exactVariants,
        bulkPercent: customPercent,
        bulkVariantIds: remainingVariantIds,
      });

      setBulkApplied(true);
      toast.success("✅ All product costs saved!");

      await axiosInstance.post("/onboard/set-step", { step: 6 }).catch(() => {});
      updateProfile({ cogsCompleted: true });

      navigate("/dashboard/business-expenses");
    } catch (err) {
      toast.error("Failed to apply bulk estimate");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    try {
      await axiosInstance.post("/onboard/set-step", { step: 6 }).catch(() => {});
    } catch (e) {}
    navigate("/dashboard/business-expenses");
  };

  const displayedTopProducts = showAll20 ? topProducts : topProducts.slice(0, 10);
  const sampleRefVariant =
    remainingProducts[0]?.variants?.[0] || topProducts[0]?.variants?.[0];
  const samplePrice = Number(sampleRefVariant?.salePrice || 599);

  return (
    <div style={styles.shell}>
      {/* ── TOP PROGRESS BAR (75%) ── */}
      <div style={styles.prog}>
        <div style={styles.progFill}></div>
      </div>

      {/* ── LEFT SIDEBAR (.pf-sb) ── */}
      <aside style={styles.sb}>
        <div style={styles.brand}>
          <div style={styles.mark}>P₹</div>
          <div style={styles.bname}>
            Profit <em style={styles.bnameEm}>First</em>
          </div>
        </div>

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

        <div style={styles.pfd}>
          <div style={styles.pfdLabel}>Data unlocked</div>
          <div style={styles.ds}>
            <div style={styles.dsL}>Profit Data Accuracy</div>
            <div style={styles.dsVG}>{accuracyPercent}%</div>
            <div style={styles.dsS}>
              {filledProductsCount} of {topProducts.length || 20} top products filled
            </div>
          </div>
          <div style={styles.ds}>
            <div style={styles.dsL}>Next Step</div>
            <div style={{ ...styles.dsV, color: "#f5a623" }}>Step 6 of 7</div>
            <div style={styles.dsS}>Fixed Business Expenses</div>
          </div>
        </div>

        <div style={styles.foot}>
          <div style={styles.storePill}>
            <div style={styles.spAv}>A</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.spNm}>atlance-clothing</div>
            </div>
            <div style={styles.spDot}></div>
          </div>
        </div>
      </aside>

      {/* ── RIGHT MAIN CONTENT (.pf-right) ── */}
      <div style={styles.right}>
        <div style={styles.mainContent}>
          {/* ── STEP HEADER ── */}
          <div style={{ marginBottom: "16px" }}>
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
              Two steps — exact costs for your top {topProducts.length || 20}{" "}
              products ({topRevenuePercent}% of your revenue), then a quick bulk
              estimate for the rest.
            </p>
          </div>

          {/* ── PROFIT DATA ACCURACY METER ── */}
          <div style={styles.accCard}>
            <div style={styles.acTop}>
              <div style={styles.acLabel}>Profit data accuracy</div>
              <div
                style={{
                  ...styles.acPct,
                  color:
                    accuracyPercent >= 80
                      ? "#00c853"
                      : accuracyPercent >= 30
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
                  width: `${Math.max(accuracyPercent, 5)}%`,
                  background:
                    accuracyPercent >= 80
                      ? "#00c853"
                      : accuracyPercent >= 30
                      ? "#f5a623"
                      : "#ff3d5a",
                }}
              ></div>
            </div>
            <div style={styles.acSub}>
              {filledProductsCount} of {topProducts.length || 20} top products
              filled ·{" "}
              {bulkApplied ? "bulk estimate set" : "bulk estimate pending"}
            </div>
          </div>

          {/* ── SECTION 1: TOP PRODUCTS (EXACT COST) ── */}
          <div style={styles.sectionCard}>
            {/* Header */}
            <div style={styles.secHeader}>
              <div
                style={
                  filledProductsCount > 0
                    ? styles.secBadgeDone
                    : styles.secBadge
                }
              >
                {filledProductsCount > 0 ? "✓" : "1"}
              </div>
              <div style={{ flex: 1 }}>
                <p style={styles.secTitle}>
                  Enter exact cost — top {topProducts.length || 20} products by
                  revenue
                </p>
                <p style={styles.secSub}>
                  These {topProducts.length || 20} products generated{" "}
                  {topRevenuePercent}% of your revenue last month
                </p>
              </div>
              {filledProductsCount > 0 && (
                <span style={styles.savedBadge}>
                  ✓ {filledProductsCount} saved
                </span>
              )}
            </div>

            {/* Product Rows List */}
            <div>
              {loading && topProducts.length === 0 ? (
                <div
                  style={{
                    padding: "36px",
                    textAlign: "center",
                    color: "#7a9880",
                    fontSize: "12px",
                  }}
                >
                  Analyzing top revenue products...
                </div>
              ) : (
                displayedTopProducts.map((product, idx) => {
                  const mainVariant = product.variants?.[0] || {};
                  const isSet =
                    Number(exactCogs[mainVariant.variantId] || 0) > 0;
                  const revShare =
                    totalRevenue > 0
                      ? Math.round(
                          (Number(product.revenue || 0) / totalRevenue) * 100
                        )
                      : 0;

                  const hasMultipleVariants =
                    product.variants && product.variants.length > 1;
                  const isExpanded = expandedProductIds.has(product.productId);

                  return (
                    <React.Fragment key={product.productId || idx}>
                      {/* Main Product Row */}
                      <div style={styles.productRow}>
                        {/* Rank */}
                        <span style={styles.rank}>{idx + 1}</span>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={styles.prodName}>{product.productName}</p>
                          <div style={styles.prodMeta}>
                            <span style={styles.revenueTag}>
                              {fmt(product.revenue)}
                            </span>
                            <span style={{ color: "#3a5040" }}>·</span>
                            <span
                              style={{ fontSize: "11px", color: "#7a9880" }}
                            >
                              {product.orders || 0} units
                            </span>

                            {/* Mini revenue bar */}
                            <div style={styles.miniBarWrap}>
                              <div
                                style={{
                                  ...styles.miniBar,
                                  width: `${Math.min(revShare * 4, 100)}%`,
                                }}
                              ></div>
                            </div>
                            <span
                              style={{ fontSize: "10px", color: "#7a9880" }}
                            >
                              {revShare}%
                            </span>

                            {/* Variant count badge */}
                            {hasMultipleVariants && (
                              <span style={styles.variantCountTag}>
                                {product.variants.length} variants
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Selling Price */}
                        <span style={styles.sellingPrice}>
                          {fmt(mainVariant.salePrice)}
                        </span>

                        {/* Main COGS Input */}
                        <div style={styles.cogsInputWrap}>
                          <span style={{ fontSize: "11px", color: "#7a9880" }}>
                            ₹
                          </span>
                          <input
                            type="number"
                            placeholder="cost"
                            value={exactCogs[mainVariant.variantId] ?? ""}
                            onChange={(e) =>
                              handleProductCostChange(product, e.target.value)
                            }
                            style={{
                              ...styles.cogsInput,
                              borderColor: isSet
                                ? "#00c853"
                                : "rgba(255,255,255,0.12)",
                            }}
                          />
                        </div>

                        {/* Done indicator */}
                        {isSet ? (
                          <div style={styles.chkDone}>✓</div>
                        ) : (
                          <div style={styles.chkPending}></div>
                        )}

                        {/* 🟢 Right side Arrow Button for Variants Accordion */}
                        {hasMultipleVariants ? (
                          <button
                            type="button"
                            onClick={() => toggleProductExpand(product.productId)}
                            style={styles.arrowBtn}
                            title={
                              isExpanded
                                ? "Hide variants"
                                : "View & edit individual variants"
                            }
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        ) : (
                          <div style={{ width: "24px" }}></div>
                        )}
                      </div>

                      {/* 🟢 EXPANDED SUB-ROWS: Specific Variants List */}
                      {isExpanded && hasMultipleVariants && (
                        <div style={styles.variantsContainer}>
                          <div style={styles.variantHeaderNote}>
                            ↳ Customize specific variant unit costs (optional):
                          </div>
                          {product.variants.map((variant, vIdx) => {
                            const vIsSet =
                              Number(exactCogs[variant.variantId] || 0) > 0;
                            return (
                              <div
                                key={variant.variantId}
                                style={styles.variantRow}
                              >
                                <span style={styles.variantIndex}>
                                  {idx + 1}.{vIdx + 1}
                                </span>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={styles.variantTitle}>
                                    {variant.variantName || `Variant ${vIdx + 1}`}
                                  </span>
                                </div>

                                <span style={styles.variantPrice}>
                                  {fmt(variant.salePrice)}
                                </span>

                                <div style={styles.cogsInputWrap}>
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      color: "#7a9880",
                                    }}
                                  >
                                    ₹
                                  </span>
                                  <input
                                    type="number"
                                    placeholder="cost"
                                    value={exactCogs[variant.variantId] ?? ""}
                                    onChange={(e) =>
                                      handleVariantCostChange(
                                        variant.variantId,
                                        e.target.value
                                      )
                                    }
                                    style={{
                                      ...styles.cogsInputSmall,
                                      borderColor: vIsSet
                                        ? "#00c853"
                                        : "rgba(255,255,255,0.1)",
                                    }}
                                  />
                                </div>

                                {vIsSet ? (
                                  <div style={styles.chkDoneSmall}>✓</div>
                                ) : (
                                  <div style={styles.chkPendingSmall}></div>
                                )}

                                <div style={{ width: "24px" }}></div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* Show All 20 Toggle */}
            <div style={styles.toggleRow}>
              <span style={styles.toggleLabel}>
                Showing{" "}
                {Math.min(displayedTopProducts.length, topProducts.length)} of{" "}
                {topProducts.length || 20} top products
              </span>
              {topProducts.length > 10 && (
                <button
                  type="button"
                  style={styles.toggleBtn}
                  onClick={() => setShowAll20(!showAll20)}
                >
                  {showAll20
                    ? "Show less ↑"
                    : `Show all ${topProducts.length} →`}
                </button>
              )}
            </div>

            {/* Summary + Save Button */}
            <div style={styles.secFooter}>
              <span style={styles.secFooterLabel}>
                <strong>{filledProductsCount}</strong> of{" "}
                {topProducts.length || 20} filled ·{" "}
                <strong>{coveredRevenuePercent}%</strong> of revenue covered
              </span>
              <button
                type="button"
                style={{
                  ...styles.btnG,
                  opacity:
                    filledProductsCount === 0 || isSaving ? 0.5 : 1,
                  cursor:
                    filledProductsCount === 0 || isSaving
                      ? "not-allowed"
                      : "pointer",
                }}
                disabled={filledProductsCount === 0 || isSaving}
                onClick={handleSaveTop}
              >
                {isSaving
                  ? "Saving..."
                  : `Save ${filledProductsCount} costs & continue →`}
              </button>
            </div>
          </div>

          {/* ── SECTION 2: BULK ESTIMATE FOR REMAINING ── */}
          {remainingProducts.length > 0 && (
            <div style={styles.sectionCard}>
              {/* Header */}
              <div style={styles.secHeader}>
                <div style={styles.secBadge}>2</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <p style={styles.secTitle}>
                      Bulk estimate for remaining products
                    </p>
                    <span style={styles.quickTag}>Quick estimate</span>
                  </div>
                  <p style={styles.secSub}>
                    Pick approximate cost % for remaining products
                  </p>
                </div>
              </div>

              <div
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <p
                  style={{
                    fontSize: "12px",
                    color: "#7a9880",
                    lineHeight: 1.6,
                  }}
                >
                  Remaining products drive only {100 - topRevenuePercent}% of your
                  revenue. Pick your approximate cost % — one click applies to
                  all of them.
                </p>

                {/* % Preset Cards Grid */}
                <div style={styles.pillsGrid}>
                  {[30, 40, 50, 60].map((pct) => {
                    const isSelected = customPercent === pct;
                    const previewCost = Math.round((samplePrice * pct) / 100);
                    return (
                      <div
                        key={pct}
                        onClick={() => {
                          setBulkPercent(pct);
                          setCustomPercent(pct);
                        }}
                        style={{
                          ...styles.pctPill,
                          ...(isSelected ? styles.pctPillOn : {}),
                        }}
                      >
                        <div
                          style={{
                            fontSize: "18px",
                            fontWeight: "900",
                            color: isSelected ? "#00c853" : "#e0ede4",
                          }}
                        >
                          {pct}%
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#7a9880",
                            marginTop: "2px",
                          }}
                        >
                          of selling price
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#3a5040",
                            marginTop: "2px",
                          }}
                        >
                          ₹{samplePrice} → ₹{previewCost}
                        </div>
                        {isSelected && <div style={styles.pillCheck}>✓</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Custom % Input */}
                <div style={styles.customPctRow}>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#7a9880",
                      fontWeight: "600",
                    }}
                  >
                    Custom %
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={customPercent}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCustomPercent(v);
                      setBulkPercent(v);
                    }}
                    style={styles.customPctInput}
                  />
                  <span style={{ fontSize: "12px", color: "#7a9880" }}>
                    % ₹{samplePrice} → cost{" "}
                    <strong style={{ color: "#00c853" }}>
                      ₹{Math.round((samplePrice * customPercent) / 100)}
                    </strong>
                  </span>
                </div>

                {/* Info Note */}
                <div style={styles.infoNote}>
                  <span>💡</span>
                  <span>
                    These show as{" "}
                    <strong style={{ color: "#f5a623" }}>"Estimated"</strong> on
                    your dashboard. Set exact costs anytime in Products tab.
                  </span>
                </div>

                {/* Apply Button */}
                <button
                  type="button"
                  style={{
                    ...styles.btnG,
                    width: "100%",
                    justifyContent: "center",
                  }}
                  onClick={handleApplyBulk}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving Costs..." : "Apply estimate & continue →"}
                </button>
              </div>
            </div>
          )}

          {/* ── FOOTER: SKIP LINK ── */}
          <div style={styles.footerRow}>
            <button
              type="button"
              style={styles.btnSkip}
              onClick={handleSkip}
            >
              Skip — add COGS later
            </button>
            <span style={{ fontSize: "11px", color: "#3a5040" }}>
              Dashboard shows ₹0 for COGS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── EXACT CSS DESIGN SYSTEM ────────────────────────────────────────
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
    width: "75%",
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
  mainContent: {
    maxWidth: "640px",
    margin: "0 auto",
    padding: "36px 24px 60px",
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
    lineHeight: "1.15",
    marginBottom: "6px",
  },
  sub: {
    fontSize: "13px",
    color: "#7a9880",
    lineHeight: "1.65",
  },

  // Accuracy Card
  accCard: {
    background: "#112418",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "10px",
    padding: "12px 16px",
    marginBottom: "14px",
  },
  acTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "7px",
  },
  acLabel: {
    fontSize: "11.5px",
    color: "#7a9880",
  },
  acPct: {
    fontSize: "15px",
    fontWeight: "800",
    letterSpacing: "-.03em",
  },
  acBarWrap: {
    height: "5px",
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
    fontSize: "10.5px",
    color: "#3a5040",
  },

  // Section Cards
  sectionCard: {
    background: "#112418",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    overflow: "hidden",
    marginBottom: "14px",
  },
  secHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  secBadge: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "#213626",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "800",
    color: "#7a9880",
    flexShrink: 0,
  },
  secBadgeDone: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "#00c853",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: "900",
    color: "#000",
    flexShrink: 0,
  },
  secTitle: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#e0ede4",
    marginBottom: "2px",
  },
  secSub: {
    fontSize: "11.5px",
    color: "#7a9880",
  },
  savedBadge: {
    fontSize: "10.5px",
    fontWeight: "700",
    color: "#00c853",
    background: "rgba(0, 200, 83, 0.12)",
    padding: "3px 8px",
    borderRadius: "6px",
    whiteSpace: "nowrap",
  },

  // Product Rows
  productRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "11px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  },
  rank: {
    fontSize: "11px",
    color: "#3a5040",
    width: "16px",
    flexShrink: 0,
    fontWeight: "700",
  },
  prodName: {
    fontSize: "12.5px",
    fontWeight: "600",
    color: "#e0ede4",
    maxWidth: "260px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  prodMeta: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "2px",
    flexWrap: "wrap",
  },
  revenueTag: {
    fontSize: "11px",
    color: "#7a9880",
    fontWeight: "600",
  },
  miniBarWrap: {
    width: "44px",
    height: "3px",
    background: "rgba(255, 255, 255, 0.07)",
    borderRadius: "2px",
    overflow: "hidden",
  },
  miniBar: {
    height: "100%",
    background: "#00c853",
    borderRadius: "2px",
  },
  variantCountTag: {
    fontSize: "9.5px",
    color: "#00c853",
    background: "rgba(0, 200, 83, 0.1)",
    padding: "1px 5px",
    borderRadius: "4px",
  },
  sellingPrice: {
    fontSize: "11.5px",
    color: "#7a9880",
    flexShrink: 0,
  },
  cogsInputWrap: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    flexShrink: 0,
  },
  cogsInput: {
    width: "74px",
    background: "#162e1c",
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "6px",
    padding: "5px 7px",
    fontSize: "11.5px",
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
    flexShrink: 0,
  },
  chkPending: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    display: "inline-block",
    flexShrink: 0,
  },
  arrowBtn: {
    background: "transparent",
    border: "none",
    color: "#7a9880",
    fontSize: "11px",
    cursor: "pointer",
    padding: "3px 6px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color .15s",
  },

  // 🟢 Sub-Rows Variants Container & Items
  variantsContainer: {
    background: "rgba(0, 0, 0, 0.25)",
    borderLeft: "2px solid #00c853",
    padding: "4px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  },
  variantHeaderNote: {
    fontSize: "10px",
    color: "#7a9880",
    padding: "4px 20px 6px 36px",
    fontStyle: "italic",
  },
  variantRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "7px 20px 7px 36px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
  },
  variantIndex: {
    fontSize: "10px",
    color: "#3a5040",
    fontFamily: "monospace",
    width: "22px",
    flexShrink: 0,
  },
  variantTitle: {
    fontSize: "11.5px",
    color: "#dceee2",
    fontWeight: "500",
  },
  variantPrice: {
    fontSize: "11px",
    color: "#7a9880",
    flexShrink: 0,
  },
  cogsInputSmall: {
    width: "68px",
    background: "#162e1c",
    border: "1.5px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "5px",
    padding: "4px 6px",
    fontSize: "11px",
    color: "#e0ede4",
    textAlign: "right",
    outline: "none",
  },
  chkDoneSmall: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "#00c853",
    color: "#000",
    fontSize: "7.5px",
    fontWeight: "900",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chkPendingSmall: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    display: "inline-block",
    flexShrink: 0,
  },

  // Toggle & Section Footer
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
  },
  toggleLabel: {
    fontSize: "11px",
    color: "#3a5040",
  },
  toggleBtn: {
    fontSize: "11.5px",
    fontWeight: "700",
    color: "#00c853",
    background: "none",
    border: "none",
    cursor: "pointer",
  },
  secFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    gap: "12px",
    flexWrap: "wrap",
  },
  secFooterLabel: {
    fontSize: "11px",
    color: "#7a9880",
  },

  // Section 2 Pills Grid
  pillsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "8px",
  },
  quickTag: {
    fontSize: "9.5px",
    fontWeight: "800",
    padding: "2px 7px",
    borderRadius: "5px",
    background: "rgba(245, 166, 35, 0.13)",
    color: "#f5a623",
  },
  pctPill: {
    background: "#0a1a12",
    border: "1.5px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "10px",
    padding: "12px 8px",
    cursor: "pointer",
    color: "#e0ede4",
    position: "relative",
    textAlign: "center",
    transition: "all .16s",
  },
  pctPillOn: {
    borderColor: "#00c853",
    background: "rgba(0, 200, 83, 0.08)",
  },
  pillCheck: {
    position: "absolute",
    top: "6px",
    right: "6px",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    background: "#00c853",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "8px",
    color: "#000",
    fontWeight: "900",
  },
  customPctRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#0a1a12",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "10px",
    padding: "10px 14px",
  },
  customPctInput: {
    width: "60px",
    background: "#162e1c",
    border: "1.5px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "6px",
    padding: "5px 8px",
    fontSize: "13px",
    fontWeight: "700",
    color: "#e0ede4",
    textAlign: "center",
    outline: "none",
  },
  infoNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "rgba(245, 166, 35, 0.07)",
    border: "1px solid rgba(245, 166, 35, 0.15)",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "12px",
    color: "#7a9880",
    lineHeight: 1.5,
  },

  // Buttons
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
  footerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: "6px",
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

// Keyframe Animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pls { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;
document.head.appendChild(styleSheet);

export default Products;