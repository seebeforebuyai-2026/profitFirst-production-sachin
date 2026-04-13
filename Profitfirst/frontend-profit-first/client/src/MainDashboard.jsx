import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { useProfile } from "./ProfileContext";
import WelcomeModal from "./components/WelcomeModal";
import { PulseLoader } from "react-spinners";

function MainDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
const { profile, loading, fetchProfile } = useProfile();
  // -------------------------------
  // 🔐 Lock Logic
  // -------------------------------
  const isDashboardLocked = profile?.dashboardUnlocked !== true;
  const isProductsPage = location.pathname.includes("products");
  const isExpensesPage = location.pathname.includes("business-expenses");

  const cogsDone = profile?.cogsCompleted === true;
  const expensesDone = profile?.expensesCompleted === true;


  const syncDone = profile?.initialSyncCompleted === true;

  const setupFinished = cogsDone && expensesDone && syncDone;

 useEffect(() => {
    let interval;
    if (isDashboardLocked) {
      // Har 5 second mein profile refresh karo jab tak dashboard locked hai
      interval = setInterval(() => {
        fetchProfile(true); // true = silent refresh (no loader)
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isDashboardLocked]);


  // -------------------------------
  // 🔄 Auto Redirect Logic
  // -------------------------------
  useEffect(() => {
    if (!loading && profile) {
      if (!cogsDone && !isProductsPage) {
        navigate("/dashboard/products");
      } else if (
        cogsDone &&
        !expensesDone &&
        !isExpensesPage
      ) {
        navigate("/dashboard/business-expenses");
      }
    }
  }, [
    profile,
    loading,
    location.pathname,
    navigate,
    cogsDone,
    expensesDone,
    isProductsPage,
    isExpensesPage,
  ]);

  // -------------------------------
  // 🌫 Blur Logic (OLD DESIGN PRESERVED)
  // -------------------------------
  const shouldApplyBlur =
    isDashboardLocked && !isProductsPage && !isExpensesPage;

  // -------------------------------
  // 👋 Welcome Modal Logic
  // -------------------------------
  const shouldShowWelcomeModal =
    !loading &&
    profile &&
    isDashboardLocked &&
    !isProductsPage &&
    !isExpensesPage &&
    (!cogsDone || !expensesDone);

  // -------------------------------
  // 🔝 Topbar Hide Logic (OLD LOGIC KEPT)
  // -------------------------------
  const hideTopbar =
    location.pathname === "/dashboard/growth" ||
    location.pathname === "/dashboard/chatbot";

  const hideBlur =
    location.pathname === "/dashboard/growth" ||
    location.pathname === "/dashboard/chatbot";

  // -------------------------------
  // ⏳ Loader
  // -------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D1D1E]">
        <PulseLoader size={10} color="#12EB8E" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0d1d1e] overflow-hidden relative">
      
      {/* ---------------- OLD BLUR BACKGROUND DESIGN ---------------- */}
      {!hideBlur && (
        <>
          <div
            className="absolute left-80 -top-48 w-full h-64 rounded-full blur-[190px] opacity-50 z-0"
            style={{
              background:
                "linear-gradient(to right, rgb(18, 235, 142), rgb(18, 235, 142))",
            }}
          ></div>
          <div
            className="absolute left-80 -bottom-24 w-full h-24 rounded-full blur-[190px] opacity-50 z-0"
            style={{
              background:
                "linear-gradient(to left, rgb(18, 235, 142), rgb(18, 235, 142))",
            }}
          ></div>
        </>
      )}

      {/* Sidebar */}
      <Sidebar isLocked={isDashboardLocked} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-h-screen relative z-10">
        {!hideTopbar && <Topbar isLocked={isDashboardLocked} />}

        <div
          className={`flex-1 overflow-y-auto p-4 hide-scrollbar transition-all duration-500 ${
            shouldApplyBlur
              ? "blur-md pointer-events-none select-none opacity-50"
              : ""
          }`}
        >
          <Outlet />
        </div>

        {/* Welcome Modal */}
        {shouldShowWelcomeModal && (
          <WelcomeModal
            isOpen={true}
            step={!cogsDone ? "cogs" : "expenses"}
          />
        )}
      </div>
    </div>
  );
}

export default MainDashboard;