import React, { useState, useEffect, useMemo } from "react";
import axiosInstance from "../../axios";
import { toast } from "react-toastify";
import { PulseLoader } from "react-spinners";
import { FiSave, FiDollarSign, FiTrendingDown, FiInfo, FiUsers, FiHome } from "react-icons/fi";

const BusinessExpenses = () => {
  // 🟢 Exactly matching the Backend Object Structure
  const [expenses, setExpenses] = useState({
    agencyFees: 0,
    rtoHandlingFees: 0,
    paymentGatewayFeePercent: 2.5,
    staffFees: 0,
    officeRent: 0,
    otherExpenses: 0
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      // 🟢 ISSUE 2 FIX: Calling the specific business-expenses endpoint
      const response = await axiosInstance.get("/user/business-expenses");
      if (response.data.success && response.data.expenses) {
        setExpenses(response.data.expenses);
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
      toast.error("Failed to load existing expenses");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setExpenses(prev => ({ ...prev, [field]: numValue }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 🟢 ISSUE 1 & 3 FIX: Correct endpoint and structure
      // We don't need the extra sync call because the Backend Controller now handles the SQS trigger!
      const response = await axiosInstance.post("/user/business-expenses", { 
        expenses 
      });
      
      if (response.data.success) {
        toast.success("Settings saved! Recalculating your dashboard profit...");
        setHasChanges(false);
        
        // 🟢 Production UX: Wait 2 seconds for the worker to start, then refresh dashboard
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save expenses");
    } finally {
      setIsSaving(false);
    }
  };

  const totalFixedMonthly = useMemo(() => {
    return (
      expenses.agencyFees + 
      expenses.staffFees + 
      expenses.officeRent + 
      expenses.otherExpenses
    );
  }, [expenses]);

  const dailyHit = (totalFixedMonthly / 30).toFixed(2);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D1D1E] gap-4">
        <PulseLoader size={10} color="#12EB8E" />
        <p className="text-gray-500 text-xs uppercase tracking-widest">Checking Overheads...</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-white space-y-6 max-w-6xl mx-auto pb-20">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Business Overheads</h2>
          <p className="text-gray-400 text-sm">Fixed monthly costs (Rent, Salaries) are divided by 30 days.</p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg ${
            hasChanges && !isSaving
              ? "bg-green-500 text-black hover:bg-green-400 scale-105"
              : "bg-gray-800 text-gray-500 cursor-not-allowed"
          }`}
        >
          {isSaving ? <PulseLoader size={5} color="#000" /> : <FiSave />}
          {isSaving ? "Updating Profit Engine..." : "Save All Changes"}
        </button>
      </div>

      {/* Logic Info */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 flex items-start gap-4">
        <FiInfo className="text-blue-400 size-6 mt-1" />
        <div className="text-sm text-blue-100/70">
          <strong className="text-blue-400 block mb-1">Production Logic (Snapshotting)</strong>
          Once saved, these rates are "frozen" into your daily profit records. Past data remains accurate 
          even if you change your rent next month.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-green-400 flex items-center gap-2">
            <FiDollarSign /> Marketing & Growth
          </h3>
          <InputField label="Monthly Agency Fees" value={expenses.agencyFees} onChange={(val) => handleInputChange('agencyFees', val)} icon="₹" />
          <InputField label="Other Tools/Software" value={expenses.otherExpenses} onChange={(val) => handleInputChange('otherExpenses', val)} icon="₹" />
        </div>

        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-orange-400 flex items-center gap-2">
            <FiTrendingDown /> Operations & Logistics
          </h3>
          <InputField label="RTO Handling Fee (Per Order)" value={expenses.rtoHandlingFees} onChange={(val) => handleInputChange('rtoHandlingFees', val)} icon="₹" />
          <InputField label="Payment Gateway Fee (%)" value={expenses.paymentGatewayFeePercent} onChange={(val) => handleInputChange('paymentGatewayFeePercent', val)} icon="%" />
        </div>

        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-purple-400 flex items-center gap-2">
            <FiUsers /> Human Resources
          </h3>
          <InputField label="Total Monthly Salaries" value={expenses.staffFees} onChange={(val) => handleInputChange('staffFees', val)} icon="₹" />
        </div>

        <div className="bg-[#161616] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-blue-400 flex items-center gap-2">
            <FiHome /> Infrastructure
          </h3>
          <InputField label="Monthly Office Rent" value={expenses.officeRent} onChange={(val) => handleInputChange('officeRent', val)} icon="₹" />
        </div>
      </div>

      {/* Summary Logic Visualization */}
      <div className="bg-gradient-to-r from-[#111] to-[#161616] border border-gray-800 rounded-3xl p-8 shadow-2xl flex flex-col md:flex-row justify-around items-center gap-8 text-center">
          <div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-1">Total Monthly Burn</div>
            <div className="text-5xl font-black text-white">₹{totalFixedMonthly.toLocaleString('en-IN')}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-1">Daily Profit Deduction</div>
            <div className="text-5xl font-black text-red-500">- ₹{dailyHit}</div>
          </div>
      </div>
    </div>
  );
};

const InputField = ({ label, value, onChange, icon }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</label>
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

export default BusinessExpenses;