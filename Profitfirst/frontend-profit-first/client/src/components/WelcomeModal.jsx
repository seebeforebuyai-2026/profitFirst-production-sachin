import React from "react";
import { useNavigate } from "react-router-dom";

const WelcomeModal = ({ isOpen }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

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

        <h2 className="text-2xl font-bold text-white mb-3">
          Welcome to ProfitFirst!
        </h2>
        
        <p className="text-gray-400 mb-8 leading-relaxed">
          To calculate your real-time profit analytics, we first need you to set your <br/>
          <span className="text-green-400 font-semibold"> Product Manufacturing Costs (COGS)</span>.
        </p>

        <button
          onClick={() => navigate("/dashboard/products")}
          className="w-full py-4 px-6 bg-green-500 hover:bg-green-600 active:scale-95 text-black font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
        >
          → Set Up Product Costs
        </button>
        
        <p className="mt-4 text-[10px] text-gray-600 uppercase tracking-widest">
          Setup Phase: Step 1 of 2
        </p>
      </div>
    </div>
  );
};

export default WelcomeModal;