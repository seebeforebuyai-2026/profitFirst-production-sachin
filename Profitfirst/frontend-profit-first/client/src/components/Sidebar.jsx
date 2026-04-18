import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HiMenuAlt3, HiX } from "react-icons/hi";
import { useProfile } from "../ProfileContext";
import {
  FiHome,
  FiPackage,
  FiSettings,
  FiHelpCircle,
  FiMessageSquare,
  FiTrendingUp,
  FiChevronDown,
  FiZap,
  FiCpu,
  FiCheckCircle,
  FiPhoneCall,
  FiLogOut,
} from "react-icons/fi";
import logo from "../assets/logo.png";

const Sidebar = ({ isLocked = false }) => {
  const { profile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [showAffiliate, setShowAffiliate] = useState(true);
  const [showAIAgentMenu, setShowAIAgentMenu] = useState(false);
  const navigate = useNavigate();

  const cogsDone = profile?.cogsCompleted === true;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile Topbar */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <button onClick={() => setIsOpen(true)} className="text-white">
          <HiMenuAlt3 size={28} />
        </button>
      </div>

      <div
        className={`fixed top-0 left-0 h-screen w-56 2xl:w-64 bg-[#0a0a0a] text-white z-50 transform transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} 
        md:static md:translate-x-0 md:block border-r border-gray-800`}
      >
        <div className="p-4 2xl:p-5 flex flex-col justify-between h-full">
          <div>
            {/* Mobile Header */}
            <div className="flex justify-between items-center mb-8 md:hidden">
              <img src={logo} alt="Logo" className="h-8 w-auto" />
              <button onClick={() => setIsOpen(false)}>
                <HiX size={28} />
              </button>
            </div>

            {/* Desktop Logo */}
            <div className="flex items-center gap-2 mb-6 hidden md:flex">
              <img src={logo} alt="Logo" className="h-6 2xl:h-8 w-auto" />
            </div>

            <div className="space-y-0.5 2xl:space-y-1">
              {/* Dashboard */}
              <NavLink
                to={isLocked ? "#" : "/dashboard"}
                end
                onClick={(e) => {
                  if (isLocked) e.preventDefault();
                  setIsOpen(false);
                }}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg transition-colors text-xs 2xl:text-sm ${
                    isActive && !isLocked
                      ? "bg-[#1a1a1a] text-white"
                      : isLocked
                      ? "text-gray-600 cursor-not-allowed opacity-50"
                      : "text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
                  }`
                }
              >
                <FiHome className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                <span>Dashboard</span>
                {isLocked && <span className="ml-auto text-[10px]">🔒</span>}
              </NavLink>

              {/* Chatbot (DISABLED) */}
              <NavLink
                to="#"
                onClick={(e) => e.preventDefault()}
                className="flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg text-xs 2xl:text-sm text-gray-600 cursor-not-allowed opacity-50 pointer-events-none"
              >
                <FiMessageSquare className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                <span>Chatbot</span>
              </NavLink>

              {/* Growth (DISABLED) */}
              <NavLink
                to="#"
                onClick={(e) => e.preventDefault()}
                className="flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg text-xs 2xl:text-sm text-gray-600 cursor-not-allowed opacity-50 pointer-events-none"
              >
                <FiTrendingUp className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                <span>Growth</span>
              </NavLink>

              {/* Customer Analytics (Soon) */}
              <div className="relative group">
                <div className="flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg text-xs 2xl:text-sm text-gray-600 cursor-not-allowed opacity-60 pointer-events-none">
                  <FiZap className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                  <span>Customer Analytics</span>
                  <span className="ml-auto text-[9px] bg-gray-800 px-1 py-0.5 rounded">
                    Soon
                  </span>
                </div>
              </div>

              {/* Products */}
              <NavLink
                to="/dashboard/products"
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg transition-colors text-xs 2xl:text-sm ${
                    isActive
                      ? "bg-[#1a1a1a] text-white"
                      : "text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
                  }`
                }
              >
                <FiPackage className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                <span>Products</span>
              </NavLink>

              {/* AI Agent (DISABLED) */}
              <div className="relative pointer-events-none opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg text-xs 2xl:text-sm text-gray-600">
                  <FiCpu className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                  <span>AI Agent</span>
                </div>
              </div>

              {/* Business Expenses */}
              <NavLink
                to={!cogsDone ? "#" : "/dashboard/business-expenses"}
                onClick={(e) => {
                  if (!cogsDone) {
                    e.preventDefault();
                    toast.info("Please complete product costs first!");
                  }
                  setIsOpen(false);
                }}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-1.5 2xl:p-2 rounded-lg transition-colors text-xs 2xl:text-sm ${
                    isActive
                      ? "bg-[#1a1a1a] text-white"
                      : isLocked && !profile?.cogsCompleted
                      ? "text-gray-600 cursor-not-allowed opacity-50"
                      : "text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
                  }`
                }
              >
                <FiSettings className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                <span>Business Expenses</span>
                {isLocked && !profile?.cogsCompleted && (
                  <span className="ml-auto text-[10px]">🔒</span>
                )}
              </NavLink>
            </div>
          </div>

          {/* Footer */}
          <div className="space-y-0.5 border-t border-gray-800 pt-3 pb-4">
            <NavLink
              to="/dashboard/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 p-1.5 rounded-lg text-gray-400 hover:bg-[#1a1a1a] hover:text-white text-xs"
            >
              <FiSettings size={14} />
              <span>Settings</span>
            </NavLink>

            {/* Help Center (DISABLED) */}
            <button
              disabled
              className="w-full flex items-center gap-2 p-1.5 rounded-lg text-gray-500 text-xs opacity-50 cursor-not-allowed"
            >
              <FiHelpCircle size={14} />
              <span>Help Center</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
            >
              <FiLogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;