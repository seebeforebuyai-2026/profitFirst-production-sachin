import React, { useState, useEffect, useMemo } from "react";
import axiosInstance from "../../axios";
import { toast } from "react-toastify";
import { useProfile } from "../ProfileContext";
import { PulseLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import {
  FiSave,
  FiDollarSign,
  FiTrendingDown,
  FiUsers,
  FiHome,
  FiRefreshCw,
  FiCheckCircle,
} from "react-icons/fi";

const BusinessExpenses = () => {
  const navigate = useNavigate();
  const { profile, updateProfile, fetchProfile } = useProfile();
  
  // 🟢 LOGIC: Differentiate between Onboarding vs Settings Update
  const isInitialSetup = profile?.initialSyncCompleted !== true;

  const [expenses, setExpenses] = useState({
    agencyFees: 0,
    rtoHandlingFees: 0,
    paymentGatewayFeePercent: 2.5,
    staffSalary: 0, 
    officeRent: 0,
    otherExpenses: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 🟢 Sync Progress State
  const [syncStatus, setSyncStatus] = useState({
    shopify: { status: "pending", percent: 0 },
    meta: { status: "pending", percent: 0 },
    shiprocket: { status: "pending", percent: 0 },
  });

  useEffect(() => {
    fetchExpenses();
  }, []);

  // 🟢 LOGIC 1: Polling for Initial Sync (Only for New Users)
  useEffect(() => {
    let interval;
    if (isInitialSetup && profile?.expensesCompleted) {
      const poll = async () => {
        try {
          const response = await axiosInstance.get("/sync/status");
          if (response.data.success) {
            setSyncStatus(response.data);

            const allSyncsDone =
              response.data.shopify?.status === "completed" &&
              response.data.meta?.status === "completed" &&
              response.data.shiprocket?.status === "completed";

            if (allSyncsDone) {
              console.log("🏁 All syncs finished. Waiting for dashboard unlock...");
              // Small delay to let the summary worker finish the final math
              setTimeout(async () => {
                await fetchProfile();
                navigate("/dashboard"); 
              }, 2000);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      };
      poll();
      interval = setInterval(poll, 5000);
    }
    return () => clearInterval(interval);
  }, [profile?.expensesCompleted, isInitialSetup, fetchProfile, navigate]);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.get("/user/business-expenses");
      if (response.data.success && response.data.expenses) {
        const ex = response.data.expenses;
        setExpenses({
          agencyFees: ex.agencyFees || 0,
          rtoHandlingFees: ex.rtoHandlingFees || 0,
          paymentGatewayFeePercent: ex.paymentGatewayFeePercent || 2.5,
          staffSalary: ex.staffSalary || 0,
          officeRent: ex.officeRent || 0,
          otherExpenses: ex.otherExpenses || 0,
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
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await axiosInstance.post("/user/business-expenses", {
        expenses,
      });

      if (response.data.success) {
        toast.success(isInitialSetup ? "🚀 Setup started! Fetching data..." : "✅ Expenses updated!");
        setHasChanges(false);
        
        // Update local state to trigger progress bars if new user
        updateProfile({ expensesCompleted: true });
        
        // Refresh full profile from DB
        await fetchProfile();
      }
    } catch (error) {
      toast.error("Failed to save expenses");
    } finally {
      setIsSaving(false);
    }
  };

  const totalFixedMonthly = useMemo(() => {
    return (
      expenses.agencyFees +
      expenses.staffSalary +
      expenses.officeRent +
      expenses.otherExpenses
    );
  }, [expenses]);

  const dailyHit = (totalFixedMonthly / 30).toFixed(2);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D1D1E]">
        <PulseLoader size={10} color="#12EB8E" />
      </div>
    );
  }

  return (
    <div className="p-6 text-white space-y-6 max-w-6xl mx-auto pb-32 relative">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight uppercase">
            {isInitialSetup ? "Step 2: Business Overheads" : "Business Expenses"}
          </h2>
          <p className="text-gray-400 text-sm">
            {isInitialSetup 
                ? "Set your monthly fixed costs to calculate real net profit."
                : "Update your monthly overheads for future profit calculations."}
          </p>
        </div>

        {/* Show button only if user is updating OR if it's the very first setup save */}
        {(!isInitialSetup || !profile?.expensesCompleted) && (
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="px-10 py-4 bg-green-500 text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] disabled:opacity-30"
          >
            {isSaving ? "Saving..." : isInitialSetup ? "Finalize & Sync Dashboard →" : "Update Expenses"}
          </button>
        )}
      </div>

      {/* SYNC PROGRESS: Visible only for New Users during their first 90-day sync */}
      {isInitialSetup && profile?.expensesCompleted && (
        <div className="bg-[#1a1a1a] border-2 border-green-500/30 p-8 rounded-[2rem] shadow-2xl space-y-6 animate-in zoom-in duration-500">
          <div className="flex items-center gap-4">
            <div className="bg-green-500/20 p-3 rounded-full">
              <FiRefreshCw className="text-green-500 animate-spin" size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold">
                {syncStatus.shopify.percent === 100 && syncStatus.meta.percent === 100
                  ? "🎉 Wrapping up your data..."
                  : "Syncing Store History"}
              </h3>
              <p className="text-gray-500 text-xs">
                We are pulling 90 days of Shopify, Meta, and Shiprocket data.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <SyncProgressBar label="Shopify Orders" percent={syncStatus.shopify.percent} color="bg-green-500" />
            <SyncProgressBar label="Meta Ads" percent={syncStatus.meta.percent} color="bg-blue-500" />
            <SyncProgressBar label="Logistics" percent={syncStatus.shiprocket.percent} color="bg-purple-500" />
          </div>
        </div>
      )}

      {/* INPUT GRID: Only lock if sync is running for the first time */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${isInitialSetup && profile?.expensesCompleted ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-green-400 flex items-center gap-2">
            <FiDollarSign /> Marketing & Growth
          </h3>
          <InputField label="Monthly Agency Fees" value={expenses.agencyFees} onChange={(val) => handleInputChange("agencyFees", val)} icon="₹" />
          <InputField label="Other Tools/Software" value={expenses.otherExpenses} onChange={(val) => handleInputChange("otherExpenses", val)} icon="₹" />
        </div>

        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-orange-400 flex items-center gap-2">
            <FiTrendingDown /> Operations & Logistics
          </h3>
          <InputField label="RTO Handling Fee (Per Order)" value={expenses.rtoHandlingFees} onChange={(val) => handleInputChange("rtoHandlingFees", val)} icon="₹" />
          <InputField label="Payment Gateway Fee (%)" value={expenses.paymentGatewayFeePercent} onChange={(val) => handleInputChange("paymentGatewayFeePercent", val)} icon="%" />
        </div>

        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-purple-400 flex items-center gap-2">
            <FiUsers /> Human Resources
          </h3>
          <InputField label="Total Monthly Salaries" value={expenses.staffSalary} onChange={(val) => handleInputChange("staffSalary", val)} icon="₹" />
        </div>

        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-blue-400 flex items-center gap-2">
            <FiHome /> Infrastructure
          </h3>
          <InputField label="Monthly Office Rent" value={expenses.officeRent} onChange={(val) => handleInputChange("officeRent", val)} icon="₹" />
        </div>
      </div>

      {/* FOOTER CALCULATION */}
      <div className="bg-gradient-to-r from-[#111] to-[#161616] border border-gray-800 rounded-3xl p-8 shadow-2xl flex flex-col md:flex-row justify-around items-center gap-8 text-center">
        <div>
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-1">Total Monthly Burn</div>
          <div className="text-5xl font-black text-white">₹{totalFixedMonthly.toLocaleString("en-IN")}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-1">Daily Profit Deduction</div>
          <div className="text-5xl font-black text-red-500">- ₹{dailyHit}</div>
        </div>
      </div>
    </div>
  );
};

// 🟢 INTERNAL REUSABLE COMPONENTS
const InputField = ({ label, value, onChange, icon }) => (
  <div className="space-y-1.5">
    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</label>
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold">{icon}</span>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-xl text-white font-mono focus:border-green-500 focus:outline-none transition-all"
        placeholder="0.00"
      />
    </div>
  </div>
);

const SyncProgressBar = ({ label, percent=0, color }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-end">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-black font-mono">{percent}%</span>
    </div>
    <div className="h-2 bg-gray-800 rounded-full overflow-hidden border border-white/5">
      <div
        className={`h-full ${color} transition-all duration-1000 ease-in-out`}
        style={{ width: `${percent || 0}%` }}
      />
    </div>
    {percent === 100 && (
      <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold uppercase tracking-tighter">
        <FiCheckCircle size={10} /> Sync Complete
      </div>
    )}
  </div>
);

export default BusinessExpenses;