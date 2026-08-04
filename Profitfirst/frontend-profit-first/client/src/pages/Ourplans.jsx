import { useState } from "react";
import axiosInstance from "../../axios";

const plans = [
  {
    planId: "starter",
    name: "Starter",
    price: "₹4,999",
    rawAmount: 4999,
    description:
      "For brands doing ₹2L–₹10L monthly revenue who want to see their real numbers for the first time.",
    features: [
      "Full profit dashboard",
      "Shopify + Meta + Shiprocket",
      "Product profitability table",
      "Cost leakage tracking",
      "AI assistant",
    ],
  },
  {
    planId: "growth",
    name: "Growth",
    price: "₹9,999",
    rawAmount: 9999,
    description:
      "For brands spending ₹1L+ on Meta ads who need real-time ROAS tracking and profit alerts.",
    features: [
      "Everything in Starter",
      "Real-time ROAS alerts",
      "Daily P&L chart",
      "AI COD confirmation agent",
      "Growth Prediction Engine",
      "AI Meta Ads",
    ],
    popular: true,
  },
];

// ── Spinner component ──────────────────────────────────────────────────────
function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 18,
        height: 18,
        border: "2.5px solid rgba(0,0,0,0.25)",
        borderTopColor: "#000",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "middle",
        marginRight: 8,
      }}
    />
  );
}

// ── Success overlay ────────────────────────────────────────────────────────
function SuccessScreen({ planName, onContinue }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#161616",
          border: "2px solid rgba(0,224,154,0.4)",
          borderRadius: 16,
          padding: "48px 40px",
          textAlign: "center",
          maxWidth: 400,
          width: "90%",
          boxShadow: "0 0 60px rgba(0,224,154,0.15)",
        }}
      >
        {/* Checkmark */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(0,224,154,0.12)",
            border: "2px solid #00e09a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 28,
          }}
        >
          ✓
        </div>
        <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Payment Successful!
        </h2>
        <p style={{ color: "#9ca3af", marginBottom: 6 }}>
          You're now on the <strong style={{ color: "#00e09a" }}>{planName}</strong> plan.
        </p>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 28 }}>
          Your subscription is active for the next 30 days.
        </p>
        <button
          onClick={onContinue}
          style={{
            background: "#02b47b",
            color: "#000",
            fontWeight: 700,
            border: "none",
            borderRadius: 10,
            padding: "12px 32px",
            fontSize: 16,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
const Ourplans = () => {
  const [loadingPlan,   setLoadingPlan]   = useState(null);
  const [verifyingPlan, setVerifyingPlan] = useState(null);
  const [error,         setError]         = useState("");
  const [successPlan,   setSuccessPlan]   = useState(null); // plan name after payment

  const handleSubscribe = async (plan) => {
    setError("");
    setLoadingPlan(plan.planId);

    try {
      // 1. Create order on backend
      const res = await axiosInstance.post("/payment/create-order", {
        planId: plan.planId,
      });
      const { sessionId, orderId, environment } = res.data;

      // 2. Init Cashfree JS SDK
      const cashfree = window.Cashfree({
        mode: environment === "PRODUCTION" ? "production" : "sandbox",
      });

      setLoadingPlan(null);

      // 3. Open payment popup
      const result = await cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget: "_modal",
      });

      if (result.error) {
        // User closed popup or payment failed at gateway
        if (result.error.message?.toLowerCase().includes("cancel")) {
          setError("Payment was cancelled. You can try again anytime.");
        } else {
          setError(result.error.message || "Payment could not be completed. Please try again.");
        }
        return;
      }

      // 4. Payment attempted — poll backend to verify
      setVerifyingPlan(plan.planId);

      let attempts = 0;
      const poll = async () => {
        attempts++;
        try {
          const verifyRes = await axiosInstance.get(`/payment/verify/${orderId}`);
          const { status } = verifyRes.data;

          if (status === "SUCCESS") {
            setVerifyingPlan(null);
            setSuccessPlan(plan.name);
            return;
          }
          if (status === "FAILED" || status === "USER_DROPPED") {
            setVerifyingPlan(null);
            setError("Payment was not completed. No amount has been charged. Please try again.");
            return;
          }
          // Still PENDING — retry (max 20 seconds)
          if (attempts < 10) {
            setTimeout(poll, 2000);
          } else {
            setVerifyingPlan(null);
            setError(
              "Payment received but activation is taking longer than expected. Please refresh the page in a moment."
            );
          }
        } catch {
          setVerifyingPlan(null);
          setError("Could not verify payment status. Please refresh the page.");
        }
      };
      poll();

    } catch (err) {
      setLoadingPlan(null);
      const msg = err.response?.data?.error || err.message || "Something went wrong. Please try again.";
      setError(msg);
    }
  };

  const anyBusy = !!loadingPlan || !!verifyingPlan;

  return (
    <>
      {/* Spinner keyframe injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Success overlay */}
      {successPlan && (
        <SuccessScreen
          planName={successPlan}
          onContinue={() => window.location.href = "/dashboard"}
        />
      )}

      <main className="font-sans padding-40 background-[#f9fafb]">
        <section className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-white font-bold tracking-wider uppercase mb-3 border-[2px] border-[#00e09a] inline-block px-3 py-1 rounded-full">
              Our Plans
            </p>
            <h1 className="text-white text-4xl font-bold mb-4">
              Simple, <span className="text-[#00e09a]">Honest</span> Pricing
            </h1>
            <p className="text-white text-lg mt-4 leading-relaxed">
              For D2C brands spending ₹1L+ on ads every month. Pays for itself in the first week.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.35)",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 24,
                textAlign: "center",
              }}
            >
              <p style={{ color: "#f87171", fontSize: 14, margin: 0 }}>
                {error}
              </p>
              <button
                onClick={() => setError("")}
                style={{ color: "#9ca3af", fontSize: 12, background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Plan cards */}
          <div className="grid gap-15 grid-cols-1 md:grid-cols-2">
            {plans.map((plan) => {
              const isLoading    = loadingPlan   === plan.planId;
              const isVerifying  = verifyingPlan === plan.planId;
              const isProcessing = isLoading || isVerifying;

              return (
                <article
                  key={plan.planId}
                  className="bg-[#161616] rounded-lg shadow-md pt-16 pb-16 pl-6 pr-6 flex flex-col justify-between"
                  style={{
                    position: "relative",
                    transition: "all .3s ease-in-out",
                    backgroundColor: "#161616",
                    border: plan.popular
                      ? "2px solid rgba(0,224,154,.6)"
                      : "2px solid rgba(0,224,154,.25)",
                    boxShadow: plan.popular
                      ? "0 0 48px rgba(0,224,154,.15)"
                      : "0 0 32px rgba(0,224,154,.07)",
                  }}
                >
                  {/* Most Popular badge */}
                  {plan.popular && (
                    <span
                      style={{
                        position: "absolute",
                        top: -14,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "#00e09a",
                        color: "#000",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        padding: "3px 14px",
                        borderRadius: 20,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Most Popular
                    </span>
                  )}

                  <div className="mb-6">
                    <p className="text-[#00e09a] font-semibold tracking-wide uppercase">
                      {plan.name}
                    </p>
                    <h2 className="text-white text-2xl font-bold mt-2">
                      {plan.price}
                      <span className="text-gray-500 text-base font-normal ml-1">/month</span>
                    </h2>
                    <p className="text-gray-500 leading-relaxed">{plan.description}</p>
                  </div>

                  <ul className="text-gray-500">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center mb-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 mr-3 text-xs font-bold text-[#00e09a] rounded-full">
                          ✓
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={anyBusy}
                    className="mt-6 w-full text-black font-bold border-none rounded-lg py-3 px-4 text-lg cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#02b47b", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {isLoading   && <><Spinner />Creating order…</>}
                    {isVerifying && <><Spinner />Confirming payment…</>}
                    {!isProcessing && `Start with ${plan.name}`}
                  </button>
                </article>
              );
            })}
          </div>

          {/* Trust badges */}
          <div style={{ textAlign: "center", marginTop: 36 }}>
            <p style={{ color: "#4b5563", fontSize: 13 }}>
              🔒 Secure payments powered by Cashfree &nbsp;·&nbsp; Cancel anytime &nbsp;·&nbsp; 30-day subscription
            </p>
          </div>

        </section>
      </main>
    </>
  );
};

export default Ourplans;
