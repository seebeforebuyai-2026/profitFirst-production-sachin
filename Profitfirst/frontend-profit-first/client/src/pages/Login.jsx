/**
 * Login Page Component
 * 
 * Handles user authentication with email and password.
 * 
 * AUTHENTICATION FLOW:
 * 1. User enters email and password
 * 2. Form validates input (email format, required fields)
 * 3. Calls backend API: POST /api/auth/login
 * 4. Backend verifies credentials with AWS Cognito
 * 5. Backend returns: user data + JWT tokens + onboarding status
 * 6. Frontend stores tokens in localStorage
 * 7. Redirects based on onboarding status:
 *    - Not completed → /onboarding
 *    - Completed → /dashboard
 * 
 * ERROR HANDLING:
 * - Invalid credentials → User-friendly error message
 * - Email not verified → Redirect to /verify-email
 * - Network errors → Connection error message
 * - Rate limiting → Too many attempts message
 * 
 * MULTI-USER SUPPORT:
 * - Each user has unique userId in database
 * - Separate onboarding progress per user
 * - Independent authentication tokens
 * 
 * SECURITY FEATURES:
 * - Password visibility toggle
 * - Input sanitization
 * - HTTPS enforcement (production)
 * - JWT token expiration
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "../utils/toast";
import "react-toastify/dist/ReactToastify.css";
import { FiArrowLeft, FiEye, FiEyeOff } from "react-icons/fi";
import { login, storeTokens, storeUserData } from "../services/authService";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [firstTimeToast, setFirstTimeToast] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (firstTimeToast) {
      toast.success(
        "We’ve sent your ProfitFirst sign-in details to your registered email. Open your inbox to complete setup and start using ProfitFirst."
      );
      setFirstTimeToast(false);
    }
  }, [firstTimeToast]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  /**
   * Handle Login Form Submission
   * 
   * PROCESS:
   * 1. Validate form inputs (email format, required fields)
   * 2. Call backend login API
   * 3. Store authentication tokens
   * 4. Store user data (userId, email, name, onboarding status)
   * 5. Trigger auth state update
   * 6. Navigate to appropriate page based on onboarding status
   * 
   * BACKEND API: POST /api/auth/login
   * Request: { email, password }
   * Response: {
   *   user: { userId, email, firstName, lastName, onboardingCompleted, onboardingStep },
   *   tokens: { accessToken, idToken, refreshToken }
   * }
   * 
   * NAVIGATION LOGIC:
   * - onboardingCompleted = false → Navigate to /onboarding
   * - onboardingCompleted = true → Navigate to /dashboard
   * 
   * ERROR SCENARIOS:
   * - Invalid credentials → Show error, stay on login page
   * - Email not verified → Show error, redirect to /verify-email after 2.5s
   * - Network error → Show connection error
   * - Rate limited → Show "too many attempts" error
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { email, password } = formData;
    
    // CLIENT-SIDE VALIDATION
    // Validate required fields
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      setLoading(false);
      return;
    }

    // Validate email format using regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    try {
      const response = await login(email, password);
      
      // Store authentication tokens
      storeTokens(response.tokens);
      
      // Store user data
      storeUserData(response.user);

      // Extract onboarding status from backend response
      const onboardingCompleted = response.user?.onboardingCompleted || false;
      
      // Trigger custom event to update authentication state
      window.dispatchEvent(new Event('tokenUpdated'));
      
      // Show success message and navigate
      toast.success("Login successful!", {
        autoClose: 1500
      });

      if (onboardingCompleted) {
        setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 800);
      } else {
        setTimeout(() => {
          navigate("/onboarding", { replace: true });
        }, 800);
      }
    } catch (err) {
      // Extract error message with better handling
      let errorMessage = "Login failed. Please try again.";
      
      if (err.response) {
        const data = err.response.data;
        const backendError = data.error || data.message || data.msg;
        
        // Map backend errors to user-friendly messages
        if (backendError) {
          if (backendError.includes('Invalid email or password') || 
              backendError.includes('NotAuthorizedException')) {
            errorMessage = "Invalid email or password. Please check your credentials and try again.";
          } else if (backendError.includes('User not found') || 
                     backendError.includes('UserNotFoundException')) {
            errorMessage = "No account found with this email. Please sign up first or check if you used a different email.";
          } else if (backendError.includes('Email not verified') || 
                     backendError.includes('UserNotConfirmedException')) {
            errorMessage = "Your email is not verified yet. Please check your inbox for the verification code.";
            setTimeout(() => {
              navigate('/verify-email', { state: { email } });
            }, 2500);
          } else if (backendError.includes('Too many')) {
            errorMessage = "Too many login attempts. Please wait a few minutes and try again.";
          } else {
            errorMessage = backendError;
          }
        }
      } else if (err.request) {
        errorMessage = "Cannot connect to server. Please check your internet connection.";
      } else {
        errorMessage = err.message || errorMessage;
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Don't show loading screen, show inline loading in button instead
  // This prevents the entire page from being replaced

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#101218] text-white relative overflow-hidden">
      <style>{`
        .bg-blob {
          position: absolute;
          width: 380px;
          height: 380px;
          filter: blur(80px);
          opacity: 0.14;
          z-index: 0;
          border-radius: 50%;
        }
        .blob-left { left: -120px; top: 100%; background: #5fc61fff; transform: translateY(-50%); }
        .blob-right { right: -120px; top: 0%; background: #5fc61fff; transform: translateY(0%); }
        
        .auth-card-enter {
          animation: fadeInUp 0.6s ease-out;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .input-focus-transition {
          transition: all 0.3s ease;
        }
        
        .button-transition {
          transition: all 0.2s ease;
        }
      `}</style>
      <div className="bg-blob blob-left"></div>
      <div className="bg-blob blob-right"></div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 auth-card-enter">
        <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-lg">
          {/* Header with back arrow */}
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Back"
              className="p-1 rounded-full hover:bg-white/5 transition"
            >
              <FiArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-semibold">Log In</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="text-xs text-gray-300 block mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="example@gmail.com"
                className="w-full rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 input-focus-transition"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="text-xs text-gray-300 block mb-2"
              >
                Enter your password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="********"
                  className="w-full rounded-lg px-3 py-2 pr-10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 input-focus-transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-300">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  className="accent-green-400 h-4 w-4 mr-2"
                />
                Remember Me.
              </label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-sm text-gray-300 hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black py-2 rounded-full font-semibold hover:opacity-95 hover:scale-[1.02] button-transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Logging in...
                  </span>
                ) : "Login"}
              </button>
            </div>

            {/* sign up hint */}
            <div className="text-center text-xs text-gray-400 mt-2">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="text-white font-medium underline"
              >
                Sign Up
              </button>
            </div>

            {/* social follow area (small icons) */}
            <div className="mt-4 text-xs text-gray-400">
              <span className="mr-2">FOLLOW:</span>
              <span className="inline-flex items-center space-x-2">
                <span className="w-5 h-5 rounded-sm bg-white inline-block"></span>
                <span className="w-5 h-5 rounded-sm bg-white inline-block"></span>
                <span className="w-5 h-5 rounded-sm bg-white inline-block"></span>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
