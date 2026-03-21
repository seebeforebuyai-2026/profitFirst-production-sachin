import React from "react";
import { useNavigate } from "react-router-dom";

const WelcomeModal = ({ isOpen }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] rounded-2xl p-8 max-w-md w-full border border-gray-700 shadow-2xl">
        <div className="text-center">
          <div className="text-6xl mb-4">👋</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to ProfitFirst!
          </h2>
          <p className="text-gray-400 mb-6">
            To see your real profit, first set your product costs (COGS).
          </p>
          <button
            onClick={() => navigate("/dashboard/products")} // 🟢 Actually takes them to setup
            className="w-full py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
          >
            → Set Up Products
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
