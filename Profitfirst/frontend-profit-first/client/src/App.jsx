import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Homepage from "./pages/Homepage";
import Contactus from "./pages/Contactus";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ScrollToTop from "./utils/ScrollToTop";
import { ToastContainer, Slide } from "react-toastify";
import VerifyEmail from "./pages/VerifyEmail";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import MainDashboard from "./MainDashboard";
import Marketing from "./pages/Marketing";
import Analytics from "./pages/Analytics";
import Shipping from "./pages/Shipping";
import Products from "./pages/Products";
import Returns from "./pages/Returns";
import Blogs from "./pages/Blogs";
import PrivacyPolicy from "./components/PrivacyPolicy";
import RetryPage from "./pages/RetryPage";
import Settings from "./pages/Settings";
import Customerstory from "./pages/Customerstory";
import Profitcalculater from "./components/Profitcalculater";
import Aiprediction from "./pages/Aiprediction";
import ChatbotPage from "./pages/ChatbotPage";
import MetaAds from "./pages/MetaAds";
import MetaAdsMerge from "./pages/MetaAdsMerge";
import CampaignDetails from "./pages/CampaignDetails";
import CampaignSetup from "./pages/CampaignSetup";
import CarouselCompletion from "./pages/CarouselCompletion";
import ForgotPassword from "./pages/ForgotPassword";
import OAuthCallback from "./pages/OAuthCallback";
import BusinessExpenses from "./pages/BusinessExpenses";
import { isTokenValid } from "./utils/auth";
import { useState, useEffect } from "react";
import { ProfileProvider } from "./ProfileContext";
import ProtectedRoute from "./ProtectedRoute";
function AppWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // STEP 1: Check for OAuth tokens in URL hash FIRST
    // OAuth callback redirects with tokens in hash: #auth={...}
    const hash = window.location.hash;

    if (hash.includes("#auth=")) {
      try {
        // Extract and decode OAuth token data from URL hash
        const tokenParam = hash.split("#auth=")[1];
        const authData = JSON.parse(decodeURIComponent(tokenParam));

        // Validate that we have required tokens and user data
        if (authData.accessToken && authData.user) {
          // Store all tokens in localStorage for future requests
          localStorage.setItem("accessToken", authData.accessToken);
          if (authData.idToken)
            localStorage.setItem("idToken", authData.idToken);
          if (authData.refreshToken)
            localStorage.setItem("refreshToken", authData.refreshToken);
          localStorage.setItem("userData", JSON.stringify(authData.user));
          if (authData.user.userId)
            localStorage.setItem("userId", authData.user.userId);
          localStorage.setItem("token", authData.accessToken); // Legacy support

          // Clean URL by removing hash (better UX and security)
          window.history.replaceState(null, "", window.location.pathname);

          return true; // User is authenticated via OAuth
        }
      } catch (error) {
        // Continue to check localStorage tokens
      }
    }

    // STEP 2: Check existing tokens in localStorage
    // This handles normal login flow and returning users
    const isValid = isTokenValid();
    return isValid;
  });

  useEffect(() => {
    const checkAuth = () => {
      const isValid = isTokenValid();
      setIsAuthenticated(isValid);
    };

    // Listen for storage changes (cross-tab synchronization)
    // Fires when localStorage is modified in another tab
    window.addEventListener("storage", checkAuth);

    // Custom event for same-tab token updates
    // Fired after login, token refresh, or OAuth callback
    window.addEventListener("tokenUpdated", checkAuth);

    // Check auth when user returns to tab
    // Ensures tokens haven't expired while user was away
    document.addEventListener("visibilitychange", checkAuth);

    // Cleanup event listeners on unmount
    return () => {
      window.removeEventListener("storage", checkAuth);
      window.removeEventListener("tokenUpdated", checkAuth);
      document.removeEventListener("visibilitychange", checkAuth);
    };
  }, []);
  return (
    <>
      <ProfileProvider>
        <ScrollToTop />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={true}
          closeOnClick={true}
          rtl={false}
          pauseOnFocusLoss={false}
          draggable={true}
          pauseOnHover={true}
          theme="dark"
          closeButton={true}
          limit={3}
          transition={Slide}
          style={{
            zIndex: 99999,
            top: "20px",
            right: "20px",
          }}
        />
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/ourstorys" element={<Customerstory />} />
          <Route path="/Profitcalculater" element={<Profitcalculater />} />
          <Route path="/contact" element={<Contactus />} />
          <Route path="/blogs" element={<Blogs />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/retry" element={<RetryPage />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route
            path="/onboarding"
            element={(() => {
              // Check authentication with multiple fallbacks
              const hasAccessToken = localStorage.getItem("accessToken");
              const hasLegacyToken = localStorage.getItem("token");
              const hasToken = hasAccessToken || hasLegacyToken;

              if (isAuthenticated || hasToken) {
                // User is authenticated, show onboarding
                if (!isAuthenticated && hasToken) {
                  // State not updated yet, trigger update
                  setTimeout(
                    () => window.dispatchEvent(new Event("tokenUpdated")),
                    0,
                  );
                }
                return <Onboarding />;
              }

              // No authentication, redirect to login
              return <Navigate to="/login" replace />;
            })()}
          />
          <Route
            path="/dashboard"
            element={(() => {
              // Check authentication with multiple fallbacks
              const hasAccessToken = localStorage.getItem("accessToken");
              const hasLegacyToken = localStorage.getItem("token");
              const hasToken = hasAccessToken || hasLegacyToken;

              if (isAuthenticated || hasToken) {
                // User is authenticated, show dashboard
                if (!isAuthenticated && hasToken) {
                  // State not updated yet, trigger update
                  setTimeout(
                    () => window.dispatchEvent(new Event("tokenUpdated")),
                    0,
                  );
                }
                return <MainDashboard />;
              }

              // No authentication, redirect to login
              return <Navigate to="/login" replace />;
            })()}
          >
            <Route index element={<Dashboard />} />
            <Route path="chatbot" element={<ChatbotPage />} />
            <Route path="growth" element={<Aiprediction />} />
            <Route
              path="analytics"
              element={
                <ProtectedRoute requireUnlock={true}>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route path="marketing" element={<Marketing />} />
            <Route path="shipping" element={<Shipping />} />
            <Route path="returns" element={<Returns />} />
            <Route path="settings" element={<Settings />} />
            <Route path="meta-ads" element={<MetaAds />} />
            <Route path="meta-ads-merge" element={<MetaAdsMerge />} />
            <Route path="campaign-setup" element={<CampaignSetup />} />
            <Route
              path="meta-ads/campaign/:campaignId"
              element={<CampaignDetails />}
            />
            <Route
              path="meta-ads/carousel-completion"
              element={<CarouselCompletion />}
            />
            <Route path="products" element={<Products />} />
            <Route path="business-expenses" element={<BusinessExpenses />} />
          </Route>
          <Route path="*" element={<Homepage />} />
        </Routes>
      </ProfileProvider>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppWrapper />
    </Router>
  );
}

export default App;
