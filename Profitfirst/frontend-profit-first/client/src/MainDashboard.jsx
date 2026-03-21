import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { useProfile } from "./ProfileContext";
import WelcomeModal from "./components/WelcomeModal";

function MainDashboard() {
  const location = useLocation();
  const { profile, loading } = useProfile();

  const hideTopbar =
    location.pathname === "/dashboard/growth" ||
    location.pathname === "/dashboard/chatbot";
  const hideBlur =
    location.pathname === "/dashboard/growth" ||
    location.pathname === "/dashboard/chatbot";

  // Dashboard is locked if dashboardUnlocked is false
  const isDashboardLocked = profile?.dashboardUnlocked === false;
  const showWelcomeModal = isDashboardLocked;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D1D1E]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  // Inside MainDashboard.jsx
  return (
    <div className="min-h-screen flex bg-[#0d1d1e] overflow-hidden relative">
      {/* Sidebar is NOT blurred, but we pass the locked state to it */}
      <Sidebar isLocked={isDashboardLocked} />

      <div className="flex-1 flex flex-col max-h-screen">
        {!hideTopbar && <Topbar isLocked={isDashboardLocked} />}

        {/* 🟢 ONLY BLUR THE CONTENT AREA */}
        <div
          className={`flex-1 overflow-y-auto p-4 hide-scrollbar ${isDashboardLocked ? "blur-[8px] pointer-events-none select-none" : ""}`}
        >
          <Outlet />
        </div>
      </div>

      {/* Welcome Modal sits ON TOP of everything */}
      {isDashboardLocked && <WelcomeModal isOpen={true} />}
    </div>
  );
}

export default MainDashboard;
