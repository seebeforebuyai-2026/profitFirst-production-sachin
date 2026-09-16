import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { FiSearch, FiPercent, FiBox, FiRefreshCw, FiCheck } from "react-icons/fi";
import axiosInstance from "../../axios";
import { useProfile } from "../ProfileContext";
import { useNavigate } from "react-router-dom";

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
  const [isInitialSync, setIsInitialSync] = useState(true);

  useEffect(() => {
    let pollInterval;
    const init = async () => {
      await triggerProductFetch(); // Fire the SQS job
      const found = await fetchProducts(); // Try to get data immediately

      // If nothing in DB yet, start polling
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
        setIsInitialSync(false);
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
      newCogs[v.variantId] = Number((Number(v.salePrice) / Number(divisor)).toFixed(2));
    });
    setCogs(newCogs);
    toast.success(`Calculated costs using 1/${divisor} of sale price for all variants`);
  };

  const handleCogsChange = (variantId, value) => {
    setCogs((prev) => ({
      ...prev,
      [variantId]: value === "" ? "" : Number(value),
    }));
  };

  const filledCount = useMemo(() => {
    const total = allVariantsList.length;
    const filled = Object.values(cogs).filter((v) => v !== "" && Number(v) > 0).length;
    return { filled, total };
  }, [allVariantsList, cogs]);

  const handleSaveCogs = async () => {
    const hasAnyCosts = Object.values(cogs).some((v) => v !== "" && Number(v) > 0);
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
        toast.success("✅ Product costs saved successfully!");
        updateProfile({ cogsCompleted: true });
        navigate("/dashboard/business-expenses"); // 🟢 Move to next step
      }
    } catch (error) {
      toast.error("Failed to save costs. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    navigate("/dashboard/business-expenses"); // Skip to next step without blocking
  };

  // ── Full Page Loader ──────────────────────────────────────────
  if (loading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a1628] gap-4">
        <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
        <p className="text-green-400 text-sm font-semibold tracking-widest uppercase animate-pulse">
          Connecting to Shopify Catalog...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── HEADER ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-gray-800 pb-6">
          <div>
            <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-1">
              — Step 5 of 7
            </p>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Add Product Costs <span className="text-green-400">(COGS)</span>
            </h1>
            <p className="text-gray-400 text-sm mt-1.5 max-w-xl leading-relaxed">
              Set per-unit cost for each variant to calculate your real Gross Margin and Net Profit.
              You can also use the quick estimator or skip and add later.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 bg-white/5 border border-gray-800 px-3 py-1.5 rounded-lg">
              Filled: <strong className="text-green-400">{filledCount.filled}</strong> / {filledCount.total} variants
            </span>
            <button
              onClick={() => fetchProducts()}
              title="Refresh Products"
              className="p-2.5 bg-white/5 hover:bg-white/10 border border-gray-800 rounded-xl text-gray-300 transition-all"
            >
              <FiRefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* ── SEARCH & QUICK ESTIMATOR TOOL ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-[#0d1f35] p-4 rounded-2xl border border-gray-800/80">
          
          {/* Search bar */}
          <div className="relative md:col-span-6">
            <FiSearch className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search products by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[#061424] border border-gray-700/60 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40"
            />
          </div>

          {/* Quick Estimator Formula */}
          <div className="md:col-span-6 flex items-center justify-start md:justify-end gap-3 bg-green-500/5 border border-green-500/20 p-2 px-4 rounded-xl">
            <span className="text-green-400 text-xs font-bold flex items-center gap-1.5 flex-shrink-0">
              <FiPercent size={14} /> Quick Formula:
            </span>
            <span className="text-gray-400 text-xs flex-shrink-0">Sale Price ÷</span>
            <input
              type="number"
              placeholder="e.g. 2"
              value={divisor}
              onChange={(e) => setDivisor(e.target.value)}
              className="w-20 px-2.5 py-1 rounded-lg bg-[#061424] border border-gray-700 text-white text-xs text-center focus:outline-none focus:border-green-500"
            />
            <button
              onClick={applyGlobalFormula}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-400 text-black font-black text-xs rounded-lg transition-all shadow-md shadow-green-500/20 flex-shrink-0"
            >
              Apply All
            </button>
          </div>
        </div>

        {/* ── PRODUCT & VARIANTS TABLE ── */}
        <div className="bg-[#0d1f35] rounded-2xl overflow-hidden border border-gray-800 shadow-xl">
          <div className="max-h-[620px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#061424] z-10 border-b border-gray-800">
                <tr className="text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                  <th className="py-3.5 px-4 w-16">Photo</th>
                  <th className="py-3.5 px-4">Product</th>
                  <th className="py-3.5 px-4">Variant Title</th>
                  <th className="py-3.5 px-4">Selling Price</th>
                  <th className="py-3.5 px-4 w-44">Your Cost (COGS)</th>
                  <th className="py-3.5 px-4 w-12 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product) =>
                    product.variants?.map((variant, idx) => {
                      const hasCost = cogs[variant.variantId] !== "" && Number(cogs[variant.variantId]) > 0;
                      return (
                        <tr
                          key={variant.variantId}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          {/* Image (only first row per product) */}
                          <td className="py-3 px-4 align-middle">
                            {idx === 0 && (
                              <img
                                src={
                                  product.productImage ||
                                  variant.productImage ||
                                  "https://via.placeholder.com/44?text=📦"
                                }
                                className="w-11 h-11 rounded-lg object-cover border border-gray-700/80 bg-black/40"
                                alt={product.productName}
                              />
                            )}
                          </td>

                          {/* Product Name (only first row per product) */}
                          <td className="py-3 px-4 align-middle">
                            {idx === 0 && (
                              <div>
                                <p className="font-semibold text-gray-200 text-sm">
                                  {product.productName}
                                </p>
                                <span className="text-[11px] text-gray-500">
                                  {product.variants.length} variant{product.variants.length > 1 ? "s" : ""}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Variant Name (Every variant) */}
                          <td className="py-3 px-4 align-middle text-gray-300 text-sm">
                            <span className="inline-block bg-white/5 border border-gray-700/60 px-2.5 py-1 rounded-md text-xs">
                              {variant.variantName || "Default"}
                            </span>
                          </td>

                          {/* Sale Price */}
                          <td className="py-3 px-4 align-middle text-gray-200 text-sm font-medium">
                            ₹{Number(variant.salePrice || 0).toLocaleString("en-IN")}
                          </td>

                          {/* COGS Input per Variant */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-500 text-xs">₹</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                value={cogs[variant.variantId] ?? ""}
                                onChange={(e) =>
                                  handleCogsChange(variant.variantId, e.target.value)
                                }
                                className="w-28 px-3 py-1.5 rounded-lg bg-[#061424] border border-gray-700 text-white text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40"
                              />
                            </div>
                          </td>

                          {/* Save Status Checkmark */}
                          <td className="py-3 px-4 align-middle text-center">
                            {hasCost ? (
                              <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 inline-flex items-center justify-center">
                                <FiCheck size={13} />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-gray-700 inline-block opacity-40"></div>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  )
                ) : (
                  <tr>
                    <td colSpan="6" className="py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FiBox size={38} className="text-gray-600 mb-2" />
                        <p className="text-gray-400 text-sm font-medium">
                          No active products found.
                        </p>
                        <p className="text-gray-500 text-xs">
                          Click the refresh icon above if you recently created products on Shopify.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Load More Pagination */}
          {lastEvaluatedKey && (
            <button
              onClick={() => fetchProducts(true)}
              className="w-full py-3.5 text-green-400 font-bold text-xs uppercase tracking-wider hover:bg-white/5 border-t border-gray-800 transition-all text-center"
            >
              Load More Products ↓
            </button>
          )}
        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 pb-12">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-gray-400 hover:text-white underline transition-colors order-2 sm:order-1"
          >
            Skip for now — add costs later from Products tab →
          </button>

          <button
            type="button"
            onClick={handleSaveCogs}
            disabled={isSaving}
            className="w-full sm:w-auto px-8 py-3.5 bg-green-500 hover:bg-green-400 text-black font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-green-500/20 disabled:opacity-40 order-1 sm:order-2"
          >
            {isSaving ? "Saving Costs..." : "Save & Continue →"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default Products;