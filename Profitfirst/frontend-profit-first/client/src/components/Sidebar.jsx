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

const Sidebar = () => {
  const { profile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const cogsDone = profile?.cogsCompleted === true;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // 🔒 Disabled class
  const disabledClass =
    "text-gray-600 opacity-50 cursor-not-allowed pointer-events-none";

  // ✅ Active class
  const activeClass = "bg-[#1a1a1a] text-white";

  // ✅ Normal class
  const normalClass =
    "text-gray-400 hover:bg-[#1a1a1a] hover:text-white";

  return (
    <>
      {/* Mobile Topbar */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <button onClick={() => setIsOpen(true)} className="text-white">
          <HiMenuAlt3 size={28} />
        </button>
      </div>

      <div
        className={`fixed top-0 left-0 h-screen w-56 2xl:w-64 bg-[#0a0a0a] text-white z-50 transform transition-transform duration-300
        ${isOpen ? "translate-x-0" : "-translate-x-full"} 
        md:static md:translate-x-0 md:block border-r border-gray-800`}
      >
        <div className="p-4 flex flex-col justify-between h-full">
          <div>
            {/* Mobile Header */}
            <div className="flex justify-between items-center mb-8 md:hidden">
              <img src={logo} alt="Logo" className="h-8 w-auto" />
              <button onClick={() => setIsOpen(false)}>
                <HiX size={28} />
              </button>
            </div>

            {/* Desktop Logo */}
            <div className="mb-6 hidden md:flex">
              <img src={logo} alt="Logo" className="h-6 w-auto" />
            </div>

            <div className="space-y-1">
              {/* ✅ Dashboard */}
              <NavLink
                to="/dashboard"
                end
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-2 rounded-lg text-xs ${
                    isActive ? activeClass : normalClass
                  }`
                }
              >
                <FiHome />
                <span>Dashboard</span>
              </NavLink>

              {/* ❌ Chatbot */}
              <div
                className={`flex items-center gap-2 p-2 rounded-lg text-xs ${disabledClass}`}
              >
                <FiMessageSquare />
                <span>Chatbot</span>
              </div>

              {/* ❌ Growth */}
              <div
                className={`flex items-center gap-2 p-2 rounded-lg text-xs ${disabledClass}`}
              >
                <FiTrendingUp />
                <span>Growth</span>
              </div>

              {/* ❌ Customer Analytics */}
              <div
                className={`flex items-center gap-2 p-2 rounded-lg text-xs ${disabledClass}`}
              >
                <FiZap />
                <span>Customer Analytics</span>
                <span className="ml-auto text-[9px] bg-gray-800 px-1 py-0.5 rounded">
                  Soon
                </span>
              </div>

              {/* ✅ Products */}
              <NavLink
                to="/dashboard/products"
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-2 rounded-lg text-xs ${
                    isActive ? activeClass : normalClass
                  }`
                }
              >
                <FiPackage />
                <span>Products</span>
              </NavLink>

              {/* ❌ AI Agent */}
              <div
                className={`flex items-center gap-2 p-2 rounded-lg text-xs ${disabledClass}`}
              >
                <FiCpu />
                <span>AI Agent</span>
              </div>

              {/* ✅ Business Expenses */}
              <NavLink
                to={cogsDone ? "/dashboard/business-expenses" : "#"}
                onClick={(e) => {
                  if (!cogsDone) e.preventDefault();
                  setIsOpen(false);
                }}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-2 rounded-lg text-xs ${
                    !cogsDone
                      ? disabledClass
                      : isActive
                      ? activeClass
                      : normalClass
                  }`
                }
              >
                <FiSettings />
                <span>Business Expenses</span>
                {!cogsDone && <span className="ml-auto text-[10px]">🔒</span>}
              </NavLink>
            </div>
          </div>

          {/* Footer */}
          <div className="space-y-1 border-t border-gray-800 pt-3">
            {/* ✅ Settings */}
            <NavLink
              to="/dashboard/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 p-2 rounded-lg text-gray-400 hover:bg-[#1a1a1a] hover:text-white text-xs"
            >
              <FiSettings />
              <span>Settings</span>
            </NavLink>

            {/* ❌ Help Center */}
            <button
              disabled
              className="w-full flex items-center gap-2 p-2 rounded-lg text-gray-500 text-xs opacity-50 cursor-not-allowed"
            >
              <FiHelpCircle />
              <span>Help Center</span>
            </button>

            {/* ✅ Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
            >
              <FiLogOut />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;