import { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../../axios";
import { PulseLoader } from "react-spinners";

const Step2 = ({ onComplete }) => {
  const [platform, setPlatform] = useState("Shopify");
  const [storeUrl, setStoreUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [shopInfo, setShopInfo] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState({
    step: 'idle', // 'connecting', 'installing', 'polling', 'verifying', 'connected'
    message: '',
    progress: 0
  });

  const pollIntervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // Detect mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Get status display information
  const getStatusDisplay = () => {
    switch (connectionStatus.step) {
      case 'connecting':
        return { icon: '🔗', message: 'Opening Shopify installation...', progress: 25 };
      case 'installing':
        return { icon: '📱', message: 'Please install the app in Shopify', progress: 50 };
      case 'polling':
        return { icon: '🔍', message: 'Waiting for installation to complete...', progress: 75 };
      case 'verifying':
        return { icon: '✅', message: 'Verifying connection...', progress: 90 };
      case 'connected':
        return { icon: '🎉', message: 'Successfully connected!', progress: 100 };
      default:
        return { icon: '📝', message: 'Ready to connect', progress: 0 };
    }
  };

  // Get dynamic button configuration
  const getButtonConfig = () => {
    if (connectionStatus.step === 'idle') {
      return { text: 'Connect Shopify', action: handleConnect, disabled: false, primary: true };
    } else if (connectionStatus.step === 'connecting') {
      return { text: 'Opening Shopify...', action: null, disabled: true, primary: true };
    } else if (connectionStatus.step === 'polling') {
      return { text: 'Checking Installation...', action: null, disabled: true, primary: true };
    } else if (connectionStatus.step === 'installing') {
      return { text: 'Verify Connection', action: handleVerifyConnection, disabled: false, primary: false };
    } else if (connectionStatus.step === 'verifying') {
      return { text: 'Verifying...', action: null, disabled: true, primary: true };
    } else if (connectionStatus.step === 'connected') {
      return { text: 'Continue to Next Step →', action: onComplete, disabled: false, primary: true };
    }
    return { text: 'Connect', action: handleConnect, disabled: false, primary: true };
  };

  // Show smart toast notifications
  const showSmartToast = (step) => {
    switch (step) {
      case 'connecting':
        toast.info("🔗 Opening Shopify in new tab...", { autoClose: 3000 });
        break;
      case 'installing':
        toast.info("📱 Please install our app in the Shopify tab, then we'll detect it automatically!", { autoClose: false });
        break;
      case 'polling':
        toast.info("🔍 Checking for installation... This may take a moment.", { autoClose: 5000 });
        break;
      case 'verified':
        toast.success("✅ Connection verified! Advancing to next step...", { autoClose: 3000 });
        break;
      case 'timeout':
        toast.warning("⏰ Taking longer than expected? Click 'Verify Connection' when ready, or try connecting again.", { autoClose: 10000 });
        break;
    }
  };

  // Auto-polling for token
  const startPollingForToken = () => {
    const maxAttempts = 30; // 5 minutes (10 second intervals)
    let attempts = 0;

    setConnectionStatus({ step: 'polling', message: 'Checking for installation...', progress: 75 });
    showSmartToast('polling');

    const checkToken = async () => {
      try {
        const tokenResponse = await axiosInstance.get('/onboard/proxy/token', {
          params: { 
            shop: storeUrl, 
            password: 'Sachin369' 
          }
        });

        if (tokenResponse.data?.success && tokenResponse.data?.accessToken) {
          console.log("✅ Token found via auto-polling!");
          await handleAutoVerify(tokenResponse.data.accessToken);
          return true;
        }
      } catch (error) {
        // Token not ready yet, continue polling
        console.log(`🔍 Polling attempt ${attempts + 1}: Token not ready yet`);
      }
      return false;
    };

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      const success = await checkToken();
      
      if (success) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      } else if (attempts >= maxAttempts) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setConnectionStatus({ step: 'installing', message: 'Manual verification needed', progress: 50 });
        showSmartToast('timeout');
      }
    }, 10000); // Check every 10 seconds

    // Set timeout for manual verification fallback
    timeoutRef.current = setTimeout(() => {
      if (connectionStatus.step === 'polling') {
        setConnectionStatus({ step: 'installing', message: 'Manual verification available', progress: 50 });
        showSmartToast('timeout');
      }
    }, 60000); // 1 minute timeout
  };

  // Auto-verify when token is found
  const handleAutoVerify = async (accessToken) => {
    try {
      setConnectionStatus({ step: 'verifying', message: 'Verifying connection...', progress: 90 });
      
      console.log("💾 Auto-saving connection via onboarding...");
      
      const saveResponse = await axiosInstance.post("/onboard/step", {
        step: 2,
        data: {
          shopifyStore: storeUrl,
          accessToken: accessToken,
          installationMode: "callback"
        }
      });

      if (saveResponse.data.message.includes("completed successfully")) {
        console.log("✅ Auto-verification successful!");
        
        // Extract shop info if available
        if (saveResponse.data.data?.shopInfo) {
          setShopInfo(saveResponse.data.data.shopInfo);
        }
        
        setConnectionStatus({ step: 'connected', message: 'Successfully connected!', progress: 100 });
        showSmartToast('verified');
        
        // Auto-advance after 2 seconds
        setTimeout(() => {
          if (onComplete) {
            onComplete();
          }
        }, 2000);
      } else {
        throw new Error("Failed to save connection");
      }
    } catch (error) {
      console.error("❌ Auto-verification error:", error);
      setConnectionStatus({ step: 'installing', message: 'Manual verification needed', progress: 50 });
      toast.error("❌ Auto-verification failed. Please click 'Verify Connection'.");
    }
  };

  const handleConnect = async () => {
    console.log("🔗 Connect button clicked");
    
    if (!storeUrl) {
      return toast.error("Please enter your Shopify store URL");
    }

    let correctedStoreUrl = storeUrl.trim().toLowerCase();
    
    // Remove protocol if present
    correctedStoreUrl = correctedStoreUrl.replace(/^https?:\/\//, '');
    
    // Auto-add .myshopify.com if not present
    if (!correctedStoreUrl.includes('.myshopify.com')) {
      correctedStoreUrl = `${correctedStoreUrl}.myshopify.com`;
    }
    
    // Validate Shopify URL format
    const shopifyRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
    if (!shopifyRegex.test(correctedStoreUrl)) {
      return toast.error("Invalid Shopify store URL format. Example: yourstore.myshopify.com");
    }

    console.log("🔗 Initiating Shopify connection via external service...");
    console.log("📍 Store URL:", correctedStoreUrl);

    setConnectionStatus({ step: 'connecting', message: 'Opening Shopify...', progress: 25 });
    showSmartToast('connecting');
    setLoading(true);
    
    try {
      // Call backend to get external OAuth URL
      const response = await axiosInstance.post("/shopify/connect", {
        storeUrl: correctedStoreUrl
      });

      console.log("✅ Backend response:", response.data);

      // Update state with corrected URL
      setStoreUrl(correctedStoreUrl);

      // Open external OAuth service
      if (response.data.success && response.data.authUrl) {
        console.log("🔗 Opening external OAuth service:", response.data.authUrl);
        
        if (isMobile) {
          // On mobile, open in same tab for better UX
          window.location.href = response.data.authUrl;
        } else {
          // On desktop, open in new tab
          window.open(response.data.authUrl, "_blank");
        }
        
        setConnectionStatus({ step: 'installing', message: 'Please install the app', progress: 50 });
        showSmartToast('installing');
        
        // Start auto-polling for token
        setTimeout(() => {
          startPollingForToken();
        }, 5000); // Wait 5 seconds before starting to poll
        
      } else {
        toast.error("❌ Failed to get authorization URL. Please try again.");
        setConnectionStatus({ step: 'idle', message: '', progress: 0 });
      }
    } catch (err) {
      console.error("❌ Connection error:", err);
      
      let errorMessage = "❌ Failed to connect to Shopify";
      
      if (err.response) {
        const backendError = err.response.data?.message || err.response.data?.error;
        
        if (err.response.status === 400) {
          errorMessage = `❌ Invalid store URL: ${backendError || "Please check your store name"}`;
        } else if (err.response.status === 404) {
          errorMessage = "❌ Store not found. Please check your store URL.";
        } else if (err.response.status === 500) {
          errorMessage = `❌ Server error: ${backendError || "Please try again later"}`;
        } else {
          errorMessage = backendError || errorMessage;
        }
      } else if (err.request) {
        errorMessage = "🔌 Cannot connect to server. Please check your internet connection.";
      }
      
      toast.error(errorMessage, { autoClose: 5000 });
      setConnectionStatus({ step: 'idle', message: '', progress: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyConnection = async () => {
    console.log("🔍 Manual verification requested");
    
    if (!storeUrl) {
      return toast.error("Please enter your store URL first");
    }

    setConnectionStatus({ step: 'verifying', message: 'Verifying connection...', progress: 90 });
    
    try {
      console.log("📡 Fetching token from external service...");
      
      // Get access token from external service
      const tokenResponse = await axiosInstance.get("/onboard/proxy/token", {
        params: {
          shop: storeUrl,
          password: "Sachin369"
        }
      });

      if (!tokenResponse.data.success || !tokenResponse.data.accessToken) {
        throw new Error("No access token received from external service");
      }

      console.log("✅ Token received:", tokenResponse.data.accessToken.substring(0, 20) + "...");

      await handleAutoVerify(tokenResponse.data.accessToken);
      
    } catch (err) {
      console.error("❌ Manual verification error:", err);
      
      let errorMessage = "❌ Failed to verify connection";
      
      if (err.response) {
        const backendError = err.response.data?.message || err.response.data?.error;
        
        if (err.response.status === 400) {
          errorMessage = `❌ Verification failed: ${backendError || "Please try connecting again"}`;
        } else if (err.response.status === 404) {
          errorMessage = "❌ App not installed. Please install the app first.";
        } else if (err.response.status === 500) {
          errorMessage = `❌ Server error: ${backendError || "Please try again later"}`;
        } else {
          errorMessage = backendError || errorMessage;
        }
      } else if (err.request) {
        errorMessage = "🔌 Cannot connect to server. Please check your internet connection.";
      } else {
        errorMessage = err.message || errorMessage;
      }
      
      toast.error(errorMessage, { autoClose: 5000 });
      setConnectionStatus({ step: 'installing', message: 'Verification failed', progress: 50 });
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setConnectionStatus({ step: 'idle', message: '', progress: 0 });
    setShopInfo(null);
    
    // Clear any existing intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    toast.info("🔄 Retrying connection...");
    setTimeout(() => handleConnect(), 500);
  };

  // Progress Bar Component
  const ProgressBar = ({ progress }) => (
    <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
      <div 
        className="bg-green-400 h-2 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  );

  // Status Indicator Component
  const StatusIndicator = ({ status }) => (
    <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg mb-4">
      <div className="text-2xl animate-pulse">{status.icon}</div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white mb-2">{status.message}</div>
        <ProgressBar progress={status.progress} />
      </div>
    </div>
  );

  if (loading && connectionStatus.step === 'idle') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D1D1E]">
        <PulseLoader size={60} color="#12EB8E" />
      </div>
    );
  }

  const buttonConfig = getButtonConfig();
  const statusDisplay = getStatusDisplay();

  return (
    <div className="min-h-screen bg-[#101218] text-white flex flex-col items-center justify-center relative overflow-hidden">
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
      `}</style>
      <div className="bg-blob blob-left"></div>
      <div className="bg-blob blob-right"></div>
      
      {/* Header logo */}
      <header className="w-full max-w-7xl px-12 py-10 flex items-center gap-3">
        <img
          src="https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png"
          alt="Profit First Logo"
          className="w-35"
        />
      </header>

      {/* Main layout */}
      <main className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-between px-12 gap-16">
        {/* LEFT CARD */}
        <div className="bg-[#1E1E1E] border-[#1E1E1E] rounded-[20px] p-10 shadow-lg w-full max-w-md">
          {/* Platform tabs */}
          <div className="rounded-lg p-1 flex mb-6 justify-center">
            <button
              onClick={() => setPlatform("Shopify")}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors duration-300 ${
                platform === "Shopify"
                  ? "bg-white text-black font-semibold"
                  : "bg-transparent text-gray-400"
              }`}
            >
              Shopify
            </button>
            <button
              onClick={() => setPlatform("Wordpress")}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors duration-300 ${
                platform === "Wordpress"
                  ? "bg-white text-black font-semibold"
                  : "bg-transparent text-gray-400"
              }`}
            >
              Wordpress
            </button>
          </div>

          {/* Shopify icon */}
          <div className="flex justify-center mb-5">
            <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center shadow-md">
              <img
                src="https://cdn.shopify.com/static/shopify-favicon.png"
                alt="Shopify Logo"
                className="w-10 h-10 object-contain"
              />
            </div>
          </div>

          {/* Heading */}
          <h2 className="text-center text-2xl font-bold mb-2">
            Connect your Shopify Store
          </h2>
          <p className="text-center text-sm text-gray-400 mb-6">
            Track your accounts profit, sells and buys in detail with your
            Shopify store.
          </p>

          {/* Status Indicator */}
          {connectionStatus.step !== 'idle' && (
            <StatusIndicator status={statusDisplay} />
          )}

          {/* Input */}
          <label className="block text-sm text-gray-400 mb-2">
            Shopify Store URL
          </label>
          <input
            type="text"
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="yourstore.myshopify.com"
            className="w-full px-4 py-3 rounded-lg bg-transparent border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 mb-6"
            disabled={connectionStatus.step !== 'idle' && connectionStatus.step !== 'installing'}
          />

          {/* Main Action Button */}
          <div className="flex flex-col gap-3">
            <button
              onClick={buttonConfig.action}
              disabled={buttonConfig.disabled || !storeUrl}
              className={`w-full py-3 px-6 rounded-full text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                buttonConfig.primary
                  ? "bg-white text-black hover:bg-gray-100"
                  : "bg-[#2E7D32] text-white hover:bg-[#1B5E20]"
              }`}
            >
              {buttonConfig.disabled && connectionStatus.step !== 'connected' ? (
                <>
                  <PulseLoader size={8} color={buttonConfig.primary ? "black" : "white"} />
                  {buttonConfig.text}
                </>
              ) : (
                buttonConfig.text
              )}
            </button>

            {/* Secondary Actions */}
            {connectionStatus.step === 'installing' && (
              <button
                onClick={handleVerifyConnection}
                className="w-full py-2 px-4 rounded-full bg-transparent border border-gray-600 text-gray-300 text-sm hover:bg-gray-800 transition"
              >
                Manual Verify Connection
              </button>
            )}

            {/* Retry Button */}
            {retryCount > 0 && connectionStatus.step === 'idle' && (
              <button 
                onClick={handleRetry} 
                className="text-xs text-blue-400 underline hover:text-blue-300 transition"
              >
                🔄 Try Again
              </button>
            )}
          </div>

          {/* Shop Info Display */}
          {shopInfo && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm font-medium">Connected Successfully</span>
              </div>
              <div className="text-xs text-gray-400">
                <div>Store: {shopInfo.name}</div>
                <div>Domain: {shopInfo.domain}</div>
                <div>Currency: {shopInfo.currency}</div>
              </div>
            </div>
          )}

          
          {connectionStatus.step === 'installing' && (
            <div className="mt-4 text-center text-xs text-gray-500">
              🔍 We're checking for your app installation automatically.<br/>
              If it takes too long, use "Manual Verify Connection" above.
            </div>
          )}
        </div>
        
        {/* RIGHT VIDEO SECTION */}
        <div className="bg-[#141617] rounded-[20px] w-full max-w-xl h-[300px] flex items-center justify-center shadow-md">
          <div className="w-20 h-20 rounded-full border-2 border-gray-400 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-gray-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7-11-7z" />
            </svg>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Step2;