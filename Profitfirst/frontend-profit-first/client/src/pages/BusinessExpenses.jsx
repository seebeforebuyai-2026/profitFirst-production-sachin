import React, { useState, useEffect } from "react";
import axiosInstance from "../../axios";
import { toast } from "react-toastify";
import { useProfile } from "../ProfileContext";
import { useNavigate } from "react-router-dom";

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
        toast.success("✅ Expenses saved!");
        updateProfile({ expensesCompleted: true });
        // Seedha dashboard open karo — koi 1-year sync job ya polling nahi
        navigate("/dashboard");
      }
    } catch (error) {
      toast.error("Failed to save expenses");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    // Skip karke direct dashboard open karo
    navigate("/dashboard");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#06140D]">
        <div className="w-10 h-10 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06140D] text-white flex flex-col justify-center items-center p-6 md:p-12">
      <div className="w-full max-w-xl space-y-6">

        {/* ── TOP BADGE ── */}
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            ⚡ Optional — one-time setup
          </span>
        </div>

        {/* ── STEP & HEADLINE ── */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[#26b35e] tracking-widest uppercase">
            — Step 6 of 7
          </p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white leading-tight">
            Add fixed costs for <br />
            <span className="text-[#26b35e]">true net profit</span>
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed pt-1">
            Monthly salary, rent, agency fees. Enter once, we subtract automatically. Edit anytime in Settings.
          </p>
        </div>

        {/* ── FORM CARD (SCREENSHOT EXACT DESIGN) ── */}
        <div className="bg-[#0b1b13] border border-green-900/40 rounded-2xl p-5 md:p-6 divide-y divide-gray-800/80 shadow-2xl">
          
          {/* Row 1: Team Salaries */}
          <div className="flex items-center justify-between py-4 first:pt-0">
            <div>
              <p className="font-semibold text-white text-sm">Team Salaries</p>
              <p className="text-xs text-gray-500 mt-0.5">Total monthly salary</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">₹</span>
              <input
                type="number"
                min="0"
                value={expenses.staffSalary === 0 ? "" : expenses.staffSalary}
                onChange={(e) => handleInputChange("staffSalary", e.target.value)}
                placeholder="0"
                className="w-36 px-3 py-2 rounded-xl bg-[#06140D] border border-gray-800 text-white text-right font-medium text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition-all"
              />
            </div>
          </div>

          {/* Row 2: Office Rent */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold text-white text-sm">Office Rent</p>
              <p className="text-xs text-gray-500 mt-0.5">Monthly rent</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">₹</span>
              <input
                type="number"
                min="0"
                value={expenses.officeRent === 0 ? "" : expenses.officeRent}
                onChange={(e) => handleInputChange("officeRent", e.target.value)}
                placeholder="0"
                className="w-36 px-3 py-2 rounded-xl bg-[#06140D] border border-gray-800 text-white text-right font-medium text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition-all"
              />
            </div>
          </div>

          {/* Row 3: Agency Fees */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold text-white text-sm">Agency Fees</p>
              <p className="text-xs text-gray-500 mt-0.5">Marketing agency retainer</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">₹</span>
              <input
                type="number"
                min="0"
                value={expenses.agencyFees === 0 ? "" : expenses.agencyFees}
                onChange={(e) => handleInputChange("agencyFees", e.target.value)}
                placeholder="0"
                className="w-36 px-3 py-2 rounded-xl bg-[#06140D] border border-gray-800 text-white text-right font-medium text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition-all"
              />
            </div>
          </div>

          {/* Row 4: Other Fixed Costs */}
          {/* Row 4: RTO Handling Fees */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold text-white text-sm">RTO Handling Fees</p>
              <p className="text-xs text-gray-500 mt-0.5">Monthly RTO and return handling costs</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">₹</span>
              <input
                type="number"
                min="0"
                value={expenses.rtoHandlingFees === 0 ? "" : expenses.rtoHandlingFees}
                onChange={(e) => handleInputChange("rtoHandlingFees", e.target.value)}
                placeholder="0"
                className="w-36 px-3 py-2 rounded-xl bg-[#06140D] border border-gray-800 text-white text-right font-medium text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition-all"
              />
            </div>
          </div>

          {/* Row 5: Payment Gateway Fee */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold text-white text-sm">Payment Gateway Fee</p>
              <p className="text-xs text-gray-500 mt-0.5">Percentage charged per payment</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={expenses.paymentGatewayFeePercent === 0 ? "" : expenses.paymentGatewayFeePercent}
                onChange={(e) => handleInputChange("paymentGatewayFeePercent", e.target.value)}
                placeholder="2.5"
                className="w-36 px-3 py-2 rounded-xl bg-[#06140D] border border-gray-800 text-white text-right font-medium text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition-all"
              />
              <span className="text-gray-500 text-sm">%</span>
            </div>
          </div>

          {/* Row 6: Other Fixed Costs */}
          <div className="flex items-center justify-between py-4 last:pb-0">
            <div>
              <p className="font-semibold text-white text-sm">Other Fixed Costs</p>
              <p className="text-xs text-gray-500 mt-0.5">Software, tools, misc</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">₹</span>
              <input
                type="number"
                min="0"
                value={expenses.otherExpenses === 0 ? "" : expenses.otherExpenses}
                onChange={(e) => handleInputChange("otherExpenses", e.target.value)}
                placeholder="0"
                className="w-36 px-3 py-2 rounded-xl bg-[#06140D] border border-gray-800 text-white text-right font-medium text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 transition-all"
              />
            </div>
          </div>

        </div>

        {/* ── ACTION BUTTONS ── */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3.5 px-6 rounded-xl bg-[#26b35e] hover:bg-[#209f53] text-black font-black text-sm transition-all shadow-lg shadow-green-500/20 disabled:opacity-40"
          >
            {isSaving ? "Saving..." : "Save & open dashboard →"}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="py-3.5 px-6 rounded-xl border border-gray-800 hover:border-gray-700 bg-transparent text-gray-300 font-semibold text-sm transition-all"
          >
            Skip for now →
          </button>
        </div>

        {/* ── FOOTER NOTE ── */}
        <p className="text-xs text-gray-500 text-center">
          Skipping shows ₹0 for fixed costs on your dashboard
        </p>

      </div>
    </div>
  );
};

export default BusinessExpenses;