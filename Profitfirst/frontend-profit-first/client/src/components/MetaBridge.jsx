import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../axios";
import { PulseLoader } from "react-spinners";

const MetaBridge = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Connecting to Meta Ads...");

  useEffect(() => {
    const processCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");

      if (code && state) {
        try {
          setStatus("Verifying credentials with Meta...");
          
          // 🟢 SILENT CALL: Backend ko code bhejo background mein
          // Hum backend ka wahi callback endpoint use karenge par usey redirect nahi karne denge
          const response = await axiosInstance.get(`/meta/callback`, {
            params: { code, state, isAjax: true } // isAjax flag helps backend know not to redirect
          });

          if (response.data.success) {
            // Success! Ab onboarding ke agle step par navigate karo
            navigate("/onboarding?meta=connected");
          }
        } catch (err) {
          console.error("Meta Bridge Error:", err);
          navigate("/onboarding?meta=error&message=Authentication Failed");
        }
      } else {
        navigate("/onboarding?meta=error&message=Missing Parameters");
      }
    };

    processCallback();
  }, [navigate]);

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white gap-4">
      <PulseLoader color="#22c55e" size={12} />
      <h2 className="text-xl font-bold tracking-tight">{status}</h2>
      <p className="text-gray-500 text-sm">Please do not refresh this page.</p>
    </div>
  );
};

export default MetaBridge;