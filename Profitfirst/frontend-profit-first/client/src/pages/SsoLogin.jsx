import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";

const SsoLogin = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const verifySsoToken = async () => {
      try {
        // 1. URL se token lo
        const token = searchParams.get("token");

        if (!token) {
          setError("Login link is invalid. Please open the app from Shopify.");
          return;
        }

        console.log("🔐 Verifying SSO token...");

        // 2. Backend ko call karo
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || "http://api.profitfirstanalytics.co.in"}/api/auth/sso-verify`,
          { token },
          { headers: { "Content-Type": "application/json" } },
        );

        const { accessToken, idToken, refreshToken, user, redirectTo } =
          response.data;

        console.log("✅ SSO verified — storing tokens & redirecting...");

        // 3. Tokens localStorage me store karo (same format as normal login)
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("idToken", idToken);
        localStorage.setItem("refreshToken", refreshToken);
        localStorage.setItem("token", accessToken); // Legacy support
        localStorage.setItem("userData", JSON.stringify(user));
        if (user.userId) {
          localStorage.setItem("userId", user.userId);
        }

        // 4. tokenUpdated event dispatch karo (App.jsx ko notify karo)
        window.dispatchEvent(new Event("tokenUpdated"));

        // 5. redirectTo ke hisaab se navigate karo
        console.log(`🚀 Redirecting to ${redirectTo}`);
        // redirectTo ke hisaab se decide karo
        if (redirectTo === "/onboarding") {
          navigate("/onboarding/shopify", { replace: true });
        } else {
          navigate(redirectTo, {
            replace: true,
            state: { userId: user.userId, email: user.email },
          });
        }
      } catch (err) {
        console.error("❌ SSO verification failed:", err);

        // Error message set karo
        if (err.response?.data?.code === "TOKEN_EXPIRED") {
          setError(
            "Login link expired. Please open the app from Shopify again.",
          );
        } else if (err.response?.data?.code === "TOKEN_USED") {
          setError(
            "Login link already used. Please open the app from Shopify again.",
          );
        } else if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError("Login failed. Please try again or contact support.");
        }
      }
    };

    verifySsoToken();
  }, [searchParams, navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {!error ? (
          <>
            {/* Loading spinner */}
            <div style={styles.spinner}></div>
            <h2 style={styles.heading}>Logging you in...</h2>
            <p style={styles.text}>Please wait while we verify your session.</p>
          </>
        ) : (
          <>
            {/* Error state */}
            <div style={styles.errorIcon}>⚠️</div>
            <h2 style={styles.heading}>Login Failed</h2>
            <p style={styles.errorText}>{error}</p>
            <p style={styles.subText}>
              Please close this page and open the app from your Shopify admin
              panel.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// Inline styles (simple & clean)
const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0a1628 0%, #1a2a42 100%)",
  },
  card: {
    background: "white",
    padding: "48px 40px",
    borderRadius: "16px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
    textAlign: "center",
    maxWidth: "420px",
    width: "90%",
  },
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid rgba(38, 179, 94, 0.15)",
    borderTop: "4px solid #26b35e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto 24px",
  },
  heading: {
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: "12px",
  },
  text: {
    fontSize: "0.95rem",
    color: "#718096",
  },
  errorIcon: {
    fontSize: "56px",
    marginBottom: "20px",
  },
  errorText: {
    fontSize: "1rem",
    color: "#e53e3e",
    marginBottom: "16px",
    fontWeight: "500",
  },
  subText: {
    fontSize: "0.9rem",
    color: "#718096",
    marginTop: "12px",
  },
};

// CSS animation for spinner
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default SsoLogin;
