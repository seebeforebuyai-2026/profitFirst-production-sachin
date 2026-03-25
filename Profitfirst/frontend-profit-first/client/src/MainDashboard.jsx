import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { useProfile } from "./ProfileContext";
import WelcomeModal from "./components/WelcomeModal";

function MainDashboard() {
  const location = useLocation();
  const { profile, loading } = useProfile();

  // 1. Loading State - Show spinner while fetching profile
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D1D1E]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  // 2. Routing Logic
  const isProductsPage = location.pathname === "/dashboard/products";
  
  // 3. Lock Logic: If it is NOT strictly true, it is locked.
  const isDashboardLocked = profile?.dashboardUnlocked !== true;

  // 4. Exception Rule: Only apply Blur/Modal if locked AND not on Products page
  const shouldApplyLockUI = isDashboardLocked && !isProductsPage;

  // 5. Layout Helpers
  const hideTopbar = ["/dashboard/growth", "/dashboard/chatbot"].includes(location.pathname);

  return (
    <div className="min-h-screen flex bg-[#0d1d1e] overflow-hidden relative">
      {/* Sidebar - Always visible, handles its own internal lock icons */}
      <Sidebar isLocked={isDashboardLocked} />

      <div className="flex-1 flex flex-col max-h-screen relative">
        {/* Topbar */}
        {!hideTopbar && <Topbar isLocked={isDashboardLocked} />}

        {/* Content Area - Blurs only if user is NOT on the Products page and is locked */}
        <main
          className={`flex-1 overflow-y-auto p-4 hide-scrollbar transition-all duration-500 ${
            shouldApplyLockUI ? "blur-md pointer-events-none select-none opacity-50" : ""
          }`}
        >
          <Outlet />
        </main>

        {/* Welcome Modal - Sits on top of the blur */}
        {shouldApplyLockUI && <WelcomeModal isOpen={true} />}
      </div>
    </div>
  );
}

export default MainDashboard;