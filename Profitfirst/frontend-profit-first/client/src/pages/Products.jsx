import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { FiSearch, FiPercent, FiBox, FiRefreshCw } from "react-icons/fi";
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

      // 🟢 If nothing in DB yet, start polling
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
              newCogs[v.variantId] = v.costPrice || 0;
            }
          });
          return newCogs;
        });
        return true;
      }
      return false;
    } catch (error) {
      toast.error("Failed to load products");
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

  const applyGlobalFormula = () => {
    if (!divisor || divisor <= 0) {
      toast.error("Please enter a valid number (e.g., 2)");
      return;
    }
    const newCogs = { ...cogs };
    allVariantsList.forEach((v) => {
      newCogs[v.variantId] = Number((v.salePrice / divisor).toFixed(2));
    });
    setCogs(newCogs);
    toast.success(`Calculated costs using 1/${divisor} of sale price`);
  };

  const handleCogsChange = (variantId, value) => {
    setCogs((prev) => ({
      ...prev,
      [variantId]: value === "" ? "" : Number(value),
    }));
  };

  const handleSaveCogs = async () => {
    const allComplete = Object.values(cogs).every((v) => v !== "" && v > 0);
    if (!allComplete) {
      toast.error("Please enter costs for all visible variants");
      return;
    }

    setIsSaving(true);
    const variants = Object.entries(cogs).map(([variantId, costPrice]) => ({
      variantId,
      costPrice: Number(costPrice),
    }));

    try {
      const response = await axiosInstance.post("/products/save-cogs", {
        variants,
      });
      if (response.data.success) {
        toast.success("✅ Product costs saved!");
        updateProfile({ cogsCompleted: true }); // Update global state
        navigate("/dashboard/business-expenses"); // 🟢 Move to next step
      }
    } catch (error) {
      toast.error("Failed to save costs");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
        <p className="text-green-500 text-sm animate-pulse font-bold tracking-widest uppercase">
          Fetching Store Products...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black">Step 1: Product Costs</h2>
          <p className="text-gray-400 text-sm mt-1">
            Set your per-unit costs. This allows us to calculate your real Gross
            Profit.
          </p>
        </div>
        <button
          onClick={() => fetchProducts()}
          className="p-2 hover:bg-white/5 rounded-full text-gray-400"
        >
          <FiRefreshCw size={20} />
        </button>
      </div>

      {/* Quick Estimator Tool */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#161616] p-4 rounded-2xl border border-gray-800">
        <div className="relative w-full md:w-96">
          <FiSearch className="absolute left-3 top-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#0a0a0a] border border-gray-800 focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/10 p-2 px-4 rounded-xl">
          <span className="text-green-400 text-sm font-bold flex items-center gap-2">
            <FiPercent /> Quick Estimator
          </span>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">Sale Price /</span>
            <input
              type="number"
              placeholder="2"
              value={divisor}
              onChange={(e) => setDivisor(e.target.value)}
              className="w-16 px-2 py-1 rounded bg-[#0a0a0a] border border-gray-700 text-white text-sm"
            />
            <button
              onClick={applyGlobalFormula}
              className="px-3 py-1 bg-green-500 hover:bg-green-600 text-black font-bold text-xs rounded transition-all"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#161616] rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#222] z-10">
              <tr className="text-gray-500 text-[10px] uppercase tracking-widest font-black">
                <th className="p-4 w-20">Photo</th>
                <th className="p-4">Product</th>
                <th className="p-4">Variant</th>
                <th className="p-4">Sale Price</th>
                <th className="p-4">Your Cost (COGS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filteredProducts.length > 0 ? (
                // 🟢 CASE 1: Data exists, show the rows
                filteredProducts.map((product) =>
                  product.variants?.map((variant, idx) => (
                    <tr
                      key={variant.variantId}
                      className="hover:bg-white/[0.02]"
                    >
                      <td className="p-4">
                        {idx === 0 && (
                          <img
                            src={
                              variant.productImage ||
                              "https://via.placeholder.com/40?text=📦"
                            }
                            className="w-10 h-10 rounded-lg object-cover border border-gray-700"
                            alt=""
                          />
                        )}
                      </td>
                      <td className="p-4">
                        {idx === 0 && (
                          <div className="font-bold text-gray-200">
                            {product.productName}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-gray-400 text-sm">
                        {variant.variantName}
                      </td>
                      <td className="p-4 text-gray-300">
                        ₹{variant.salePrice?.toLocaleString()}
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={cogs[variant.variantId] || ""}
                          onChange={(e) =>
                            handleCogsChange(variant.variantId, e.target.value)
                          }
                          className="w-full max-w-[120px] px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white focus:ring-1 focus:ring-green-500"
                        />
                      </td>
                    </tr>
                  )),
                )
              ) : (
                // 🟢 CASE 2: No data yet - Choose between Loader or "No Products"
                <tr>
                  <td colSpan="5" className="p-20 text-center">
                    {loading ? (
                      <div className="flex flex-col items-center justify-center gap-4">
                        <PulseLoader size={10} color="#12EB8E" />
                        <div className="space-y-1">
                          <p className="text-green-500 font-bold animate-pulse text-sm uppercase tracking-widest">
                            Connecting to Shopify...
                          </p>
                          <p className="text-gray-500 text-xs">
                            We are fetching your product catalog. This will only
                            take a moment.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FiBox size={40} className="text-gray-700 mb-2" />
                        <p className="text-gray-500 text-sm font-medium">
                          No active products found in your store.
                        </p>
                        <p className="text-gray-600 text-xs">
                          Try clicking the refresh icon above if you just added
                          products.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {lastEvaluatedKey && (
          <button
            onClick={() => fetchProducts(true)}
            className="w-full p-4 text-green-400 font-bold text-xs uppercase hover:bg-white/5 border-t border-gray-800"
          >
            Load More Products
          </button>
        )}
      </div>

      <div className="flex justify-end pb-10">
        <button
          onClick={handleSaveCogs}
          disabled={
            Object.values(cogs).some((v) => v === "" || v <= 0) || isSaving
          }
          className="px-10 py-4 bg-green-500 hover:bg-green-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-green-500/20 disabled:opacity-30"
        >
          {isSaving ? "Saving..." : "Save & Continue →"}
        </button>
      </div>
    </div>
  );
};

export default Products;
