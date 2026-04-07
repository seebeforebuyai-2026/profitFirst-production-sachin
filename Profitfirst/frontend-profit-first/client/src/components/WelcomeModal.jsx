import React from "react";
import { useNavigate } from "react-router-dom";

const WelcomeModal = ({ isOpen,step }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;
  const isCogsStep = step === "cogs";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Dark Overlay Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>

      {/* Modal Card */}
      <div className="relative bg-[#1a1a1a] rounded-3xl p-10 max-w-md w-full border border-gray-800 shadow-2xl text-center">
        <div className="mb-6">
          <img 
            className="w-48 mx-auto" 
            src="https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png" 
            alt="ProfitFirst"
          />
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">
        {isCogsStep ? "Step 1: Product Costs" : "Step 2: Business Expense"}
      </h2>
        
        <p className="text-gray-400 mb-6">
        {isCogsStep 
          ? "To see your real profit, first set your product costs (COGS)."
          : "Almost there! Now set your monthly rent and salaries to unlock the dashboard."}
      </p>

        <button
        onClick={() => navigate(isCogsStep ? "/dashboard/products" : "/dashboard/business-expenses")}
          className="w-full py-4 px-6 bg-green-500 hover:bg-green-600 active:scale-95 text-black font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
        >
        {isCogsStep ? "→ Set Up Products" : "→ Set Up Expenses"}
        </button>
        
      
      </div>
    </div>
  );
};

export default WelcomeModal;