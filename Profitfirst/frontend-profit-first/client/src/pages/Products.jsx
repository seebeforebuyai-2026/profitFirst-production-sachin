import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import { FiSearch, FiPercent, FiBox, FiRefreshCw } from "react-icons/fi"; // 🟢 Added Icons
import axiosInstance from "../../axios";
import { useProfile } from "../ProfileContext";

const Products = () => {
  const { updateProfile, fetchProfile } = useProfile();

  const [products, setProducts] = useState([]);
  const [allVariantsList, setAllVariantsList] = useState([]);
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState(null);
  const [divisor, setDivisor] = useState("");
  const [searchTerm, setSearchTerm] = useState(""); // 🟢 Added Search
  const [loading, setLoading] = useState(true);
  const [syncingOrders, setSyncingOrders] = useState(false);

  const [syncStatus, setSyncStatus] = useState({
    shopify: { status: "pending", percent: 0 },
    meta: { status: "pending", percent: 0 },
    shiprocket: { status: "pending", percent: 0 },
  });
  const [cogs, setCogs] = useState({});

  useEffect(() => {
    const init = async () => {
      await triggerProductFetch();
      await fetchProducts();
      startSyncPolling();
    };
    init();
  }, []);

  const triggerProductFetch = async () => {
    try {
      await axiosInstance.post("/products/trigger-fetch");
    } catch (error) {
      console.error("Trigger fetch error:", error);
    }
  };

  const fetchProducts = async (isLoadMore = false) => {
    if (!isLoadMore) setLoading(true);
    try {
      const response = await axiosInstance.get("/products/list", {
        params: { limit: 50, lastKey: isLoadMore ? lastEvaluatedKey : null },
      });

      if (response.data.success) {
        // const newVariants = response.data.variants || [];
  const newVariants = (response.data.variants || []).filter(v => Number(v.salePrice) > 0);

        if (isLoadMore) {
          if (newVariants.length > 0) {
            toast.success(`Loaded ${newVariants.length} more variants`, {
              position: "bottom-center",
              autoClose: 1500,
              hideProgressBar: true,
              style: {
                minHeight: "50px",
                maxHeight: "60px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "12px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: "500",
                textAlign: "center",
                background: "#111",
                color: "#fff",
                boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
              },
            });
          } else {
            toast.info("No more products to load");
          }
        }




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
      }
    } catch (error) {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  // 🟢 Performance Optimization: Filter products using useMemo
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return products.filter((p) =>
      p.productName.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [products, searchTerm]);

  const applyGlobalFormula = () => {
    if (!divisor || divisor <= 0) {
      toast.error("Please enter a valid number (e.g., 2 or 3)");
      return;
    }
    const newCogs = { ...cogs };
    allVariantsList.forEach((v) => {
      newCogs[v.variantId] = Number((v.salePrice / divisor).toFixed(2));
    });
    setCogs(newCogs);
    toast.success(`Calculated costs using 1/${divisor} of sale price`);
  };

  const startSyncPolling = useCallback(() => {
    const poll = async () => {
      try {
        const response = await axiosInstance.get("/sync/status");
        if (response.data.success) {
          setSyncStatus({
            shopify: response.data.shopify || { status: "pending", percent: 0 },
            meta: response.data.meta || { status: "pending", percent: 0 },
            shiprocket: response.data.shiprocket || {
              status: "pending",
              percent: 0,
            },
          });
          if (response.data.shopify?.status === "completed") {
            await fetchProfile();
          }
        }
      } catch (error) {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [fetchProfile]);

  const handleCogsChange = (variantId, value) => {
    setCogs((prev) => ({
      ...prev,
      [variantId]: value === "" ? "" : Number(value),
    }));
  };

  const handleSaveCogs = async () => {
    const allComplete = Object.values(cogs).every((v) => v !== "" && v > 0);
    if (!allComplete) {
      toast.error("Please enter COGS for all variants before saving");
      return;
    }
    const variants = Object.entries(cogs).map(([variantId, costPrice]) => ({
      variantId,
      costPrice: Number(costPrice),
    }));

    try {
      const response = await axiosInstance.post("/products/save-cogs", {
        variants,
      });
      if (response.data.success) {
        toast.success("✅ COGS saved successfully!");
        updateProfile({ cogsCompleted: true });
        if (syncStatus.shopify.status === "pending") await startSync();
      }
    } catch (error) {
      toast.error("Failed to save costs");
    }
  };

  const startSync = async () => {
    setSyncingOrders(true);
    try {
      await axiosInstance.post("/sync/start-initial");
      toast.success("🔄 Background sync started!");
    } catch (error) {
      toast.error("Failed to start background sync");
    } finally {
      setSyncingOrders(false);
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
        <p className="text-green-500 text-sm animate-pulse">
          Initializing product catalog...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold">Product Costs</h2>
          <p className="text-gray-400 text-sm mt-1">
            Set your manufacturing costs to calculate accurate net profit.
          </p>
        </div>
        <button
          onClick={() => fetchProducts()}
          className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400"
        >
          <FiRefreshCw size={20} />
        </button>
      </div>

      {/* Sync Progress Bars */}
      <div className="p-4 bg-[#1E1E1E] rounded-xl border border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-6">
        <ProgressBar
          label="Shopify"
          color="bg-green-500"
          percent={syncStatus.shopify.percent}
        />
        <ProgressBar
          label="Meta Ads"
          color="bg-blue-500"
          percent={syncStatus.meta.percent}
        />
        <ProgressBar
          label="Shiprocket"
          color="bg-purple-500"
          percent={syncStatus.shiprocket.percent}
        />
      </div>

      {/* 🟢 TOP TOOLS: Search + Magic Formula */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <FiSearch className="absolute left-3 top-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#1E1E1E] border border-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        {/* Quick Estimator */}
        <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 p-2 px-4 rounded-lg">
          <div className="flex items-center gap-2 text-green-400 text-sm font-bold">
            <FiPercent /> Quick Estimator
          </div>
          <div className="h-4 w-[1px] bg-green-500/30 mx-1"></div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">Sale Price /</span>
            <input
              type="number"
              placeholder="2"
              value={divisor}
              onChange={(e) => setDivisor(e.target.value)}
              className="w-16 px-2 py-1 rounded bg-[#0a0a0a] border border-gray-700 text-white text-sm focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={applyGlobalFormula}
              className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded shadow-lg transition-all"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Table Container with Sticky Header */}
      <div className="bg-[#1E1E1E] rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
        <div className="max-h-[600px] overflow-y-auto hide-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#2A2A2A] z-10 shadow-md">
              <tr className="text-gray-400 text-[10px] uppercase tracking-widest">
                <th className="p-4 w-20">Photo</th>
                <th className="p-4">Product Details</th>
                <th className="p-4">Variant</th>
                <th className="p-4 w-32">Sale Price</th>
                <th className="p-4 w-44">COGS (Per Unit)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) =>
                  product.variants?.map((variant, idx) => (
                    <tr
                      key={variant.variantId}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="p-4">
                        {idx === 0 && (
                          <img
                            src={
                              variant.productImage ||
                              "https://via.placeholder.com/40?text=📦"
                            }
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover border border-gray-700 shadow-inner"
                          />
                        )}
                      </td>
                      <td className="p-4">
                        {idx === 0 && (
                          <div>
                            <div className="font-bold text-gray-100">
                              {product.productName}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-gray-400 text-sm">
                        {variant.variantName}
                      </td>
                      <td className="p-4 text-gray-300 font-mono">
                        ₹{variant.salePrice?.toLocaleString()}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                          <span className="text-gray-600 text-xs font-mono">
                            ₹
                          </span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={cogs[variant.variantId] || ""}
                            onChange={(e) =>
                              handleCogsChange(
                                variant.variantId,
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white focus:outline-none focus:ring-1 focus:ring-green-500 transition-all font-mono"
                          />
                        </div>
                      </td>
                    </tr>
                  )),
                )
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    className="p-20 text-center flex flex-col items-center gap-3"
                  >
                    <FiBox size={40} className="text-gray-700" />
                    <p className="text-gray-500">
                      {loading
                        ? "Loading items..."
                        : "No matching products found."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {lastEvaluatedKey && (
          <button
            onClick={() => fetchProducts(true)}
            disabled={loading}
            className="w-full p-4 bg-gray-800/30 text-green-400 hover:bg-gray-800/50 text-sm font-bold border-t border-gray-800 transition-all disabled:opacity-50"
          >
            {loading ? "FETCHING..." : "↓ LOAD MORE PRODUCTS"}
          </button>
        )}
      </div>

      <div className="flex justify-end pt-4 pb-10">
        <button
  onClick={handleSaveCogs}
  disabled={
    Object.values(cogs).some((v) => v === "" || v<=0 ) || syncingOrders
  }
  className="group px-10 py-4 
  bg-gradient-to-r from-green-400 to-green-500 
  hover:from-green-300 hover:to-green-400
  disabled:opacity-30 disabled:cursor-not-allowed 
  text-black font-black uppercase tracking-widest 
  rounded-2xl transition-all duration-300 
  shadow-[0_0_25px_rgba(34,197,94,0.6)] 
  hover:shadow-[0_0_40px_rgba(34,197,94,0.9)] 
  hover:scale-[1.02]
  flex items-center gap-3"
>
  {syncingOrders ? "Processing..." : "Save & Sync Dashboard"}

  <span className="group-hover:translate-x-1 transition-transform duration-300">
    →
  </span>
</button>
      </div>
    </div>
  );
};

const ProgressBar = ({ label, color, percent }) => (
  <div>
    <div className="flex justify-between text-[10px] mb-2">
      <span className="text-gray-500 font-black uppercase tracking-tighter">
        {label}
      </span>
      <span className="font-mono text-gray-400">{percent}%</span>
    </div>
    <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden border border-white/5">
      <div
        className={`h-full ${color} transition-all duration-1000 ease-in-out`}
        style={{ width: `${percent}%` }}
      />
    </div>
  </div>
);

export default Products;
