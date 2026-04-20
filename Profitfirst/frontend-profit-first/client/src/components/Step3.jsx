import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { PulseLoader } from "react-spinners";
import axiosInstance from "../../axios";

const Step3 = ({ onComplete }) => {
  const [platform, setPlatform] = useState("meta");
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState("");
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

useEffect(() => {
    const checkConnection = async () => {
      setFetchingAccounts(true);
      try {
        const response = await axiosInstance.get("/meta/connection");
        if (response.data.connected && response.data.connection) {
          const accounts = response.data.connection.adAccounts || [];
          console.log("📥 Accounts received from API:", accounts.length);
          setAdAccounts(accounts);
        }
      } catch (err) {
        console.error("Fetch failed");
      } finally {
        setFetchingAccounts(false);
      }
    };

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("meta") === "connected") {
      // 🟢 Add a 1-second delay to allow DynamoDB to finish writing (Eventual Consistency)
      setTimeout(() => checkConnection(), 1000);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      checkConnection();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedAdAccountId) {
      toast.error("Please select your Ad account.");
      return;
    }

    setSubmitting(true);

    try {
      console.log("💾 Saving ad account selection:", selectedAdAccountId);

      // Save selected account
      const res1 = await axiosInstance.post("/meta/select-account", {
        adAccountId: selectedAdAccountId,
      });

      if (!res1?.data?.success) {
        throw new Error("Failed to save ad account");
      }

      // Update onboarding
      await axiosInstance.post("/onboard/step", {
        step: 3,
        data: {
          adAccountId: selectedAdAccountId,
          platform,
          completedAt: new Date().toISOString(),
        },
      });

      toast.success("✅ Ad account connected!", { autoClose: 1500 });

      setTimeout(() => {
        toast.info("🎯 Loading premium plans...", { autoClose: 1000 });
        setTimeout(() => onComplete(), 500);
      }, 1000);
    } catch (err) {
      console.error("❌ Submission error:", err);

      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Failed to connect ad account.";

      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMetaConnect = async () => {
    try {
      console.log("🔗 Initiating Meta OAuth...");
      const response = await axiosInstance.post("/meta/connect");

      if (!response.data?.authUrl) {
        toast.error("Invalid auth response");
        return;
      }

      window.location.href = response.data.authUrl;
    } catch (err) {
      console.error("❌ Meta connect error:", err);
      toast.error("Failed to initiate Meta login.");
    }
  };

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
        .blob-left { left: -120px; top: 100%; background: #5fc61f; transform: translateY(-50%); }
        .blob-right { right: -120px; top: 0%; background: #5fc61f; }
      `}</style>

      <div className="bg-blob blob-left"></div>
      <div className="bg-blob blob-right"></div>

      {/* Header */}
      <header className="w-full max-w-7xl px-12 py-10 flex items-center gap-3">
        <img
          src="https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png"
          alt="Logo"
          className="w-35"
        />
      </header>

      <main className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-between px-12 gap-16">
        {/* LEFT CARD */}
        <div className="bg-[#1E1E1E] rounded-[20px] p-10 shadow-lg w-full max-w-md">
          
          {/* Tabs */}
          <div className="flex mb-6 justify-center">
            <button
              onClick={() => setPlatform("meta")}
              className={`px-4 py-1.5 rounded-md text-sm ${
                platform === "meta"
                  ? "bg-white text-black font-semibold"
                  : "text-gray-400"
              }`}
            >
              Meta
            </button>
            <button
              onClick={() => setPlatform("google")}
              className={`px-4 py-1.5 rounded-md text-sm ${
                platform === "google"
                  ? "bg-white text-black font-semibold"
                  : "text-gray-400"
              }`}
            >
              Google
            </button>
          </div>

          {/* Heading */}
          <h2 className="text-center text-2xl font-bold mb-2">
            Connect your Ad Account
          </h2>
          <p className="text-center text-sm text-gray-400 mb-6">
            Track performance and manage campaigns.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <label className="text-sm text-gray-400">
              {adAccounts.length > 0
                ? "Select your Ad account:"
                : "Please connect your Meta account first"}
            </label>

            {fetchingAccounts ? (
              <div className="flex justify-center py-4">
                <PulseLoader size={10} color="#12EB8E" />
              </div>
            ) : adAccounts.length > 0 ? (
              <select
                value={selectedAdAccountId}
                onChange={(e) => setSelectedAdAccountId(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-black border border-green-500/50"
              >
                <option value="">Select an Ad Account</option>
                {adAccounts.map((acc) => (
                  <option key={acc.accountId} value={acc.accountId}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-center py-4 border border-dashed border-gray-700 rounded-lg text-gray-500">
                No accounts linked yet
              </div>
            )}
          </form>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            {adAccounts.length === 0 ? (
              <button
                onClick={handleMetaConnect}
                className="w-full py-4 rounded-xl bg-blue-600 font-bold hover:bg-blue-700"
              >
                Connect to Meta Ads
              </button>
            ) : (
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting || !selectedAdAccountId}
                className="w-full py-4 rounded-xl bg-green-500 text-black font-bold disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Confirm & Continue →"}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="bg-[#141617] rounded-[20px] w-full max-w-xl h-[300px] flex items-center justify-center">
          <div className="w-20 h-20 rounded-full border-2 border-gray-400 flex items-center justify-center">
            ▶
          </div>
        </div>
      </main>
    </div>
  );
};

export default Step3;