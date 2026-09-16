import React, { useState } from "react";
import { toast } from "react-toastify";
import axiosInstance from "../../axios";
import { useNavigate } from "react-router-dom";

const Step4 = ({ onComplete }) => {
  const [platform, setPlatform] = useState("Shiprocket");
  const [formData, setFormData] = useState({
    access_token: "",
    secret_key: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let payload = { platform };

      switch (platform) {
        case "Shiprocket":
        case "Nimbuspost":
        case "Shipway":
          payload.email = formData.email;
          payload.password = formData.password;
          break;

        case "Dilevery":
          payload.access_token = formData.access_token;
          break;

        case "Ithink Logistics":
          payload.access_token = formData.access_token;
          payload.secret_key = formData.secret_key;
          break;

        default:
          break;
      }

      const response = await axiosInstance.post("/onboard/step4", payload);

      if (response.data.success) {
        toast.success("✅ Shipping account connected!", { autoClose: 1500 });

        setTimeout(() => {
          window.location.href = "/onboarding/shiprocket";
        }, 1500);
      } else {
        console.log("Step 4 failed:", response.data);
        toast.error(response.data.message || "Connection failed");
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Failed to connect shipping account.";

      toast.error(errorMessage);
      console.error("Submission error:", err.response || err);
    } finally {
      setLoading(false);
    }
  };

  const renderFields = () => {
    switch (platform) {
      case "Shiprocket":
        return (
          <>
            <InputField
              label="Shiprocket Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
            />
          </>
        );
      case "Dilevery":
        return (
          <InputField
            label="Access Token"
            name="access_token"
            value={formData.access_token}
            onChange={handleChange}
          />
        );
      case "Shipway":
        return (
          <>
            <InputField
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              label="License Key"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
            />
          </>
        );
      case "Ithink Logistics":
        return (
          <>
            <InputField
              label="Access Token"
              name="access_token"
              value={formData.access_token}
              onChange={handleChange}
            />
            <InputField
              label="Secret Key"
              name="secret_key"
              value={formData.secret_key}
              onChange={handleChange}
            />
          </>
        );
      case "Nimbuspost":
        return (
          <>
            <InputField
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.page}>
      {/* Background Blobs */}
      <div style={{ ...styles.blob, ...styles.blobLeft }}></div>
      <div style={{ ...styles.blob, ...styles.blobRight }}></div>

      {/* LEFT SIDEBAR */}
      <div style={styles.sidebar}>
        <div style={styles.logo}>
          <img
            src="https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png"
            alt="ProfitFirst"
            style={{ width: "140px" }}
          />
        </div>

        <div style={styles.sideSection}>
          <p style={styles.sideLabel}>Connections</p>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>🛍️</span>
            <span style={styles.sideText}>Shopify</span>
            <span style={styles.badgeLive}>Live</span>
          </div>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>📘</span>
            <span style={styles.sideText}>Meta Ads</span>
            <span style={styles.badgeLive}>Live</span>
          </div>
          <div style={styles.sideItem}>
            <span style={styles.sideIcon}>🚚</span>
            <span style={styles.sideText}>Shiprocket</span>
            <span style={styles.badgeCurrent}>Setup</span>
          </div>
        </div>

        <div style={styles.sideSection}>
          <p style={styles.sideLabel}>What you'll unlock</p>
          <p style={styles.sideStatSmall}>📦 Real shipping cost per order</p>
          <p style={styles.sideStatSmall}>🔄 RTO tracking & losses</p>
          <p style={styles.sideStatSmall}>💰 Actual net profit</p>
          <p style={styles.sideStatSmall}>📊 Delivery success rate</p>
        </div>

        <div style={styles.sideBottom}>
          <span style={styles.shopDot}></span>
          <span style={styles.shopName}>Step 4 of 7</span>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT */}
      <div style={styles.main}>
        <p style={styles.stepText}>— Step 4 of 7</p>

        <h1 style={styles.headline}>
          One more connection. <br />
          Then your <span style={styles.headlineGreen}>real profit</span> <br />
          is visible.
        </h1>

        <p style={styles.subText}>
          Shiprocket tells us which orders delivered and what shipping actually
          cost you — the most important number for your net profit.
        </p>

        {/* Form Card */}
        <div style={styles.formCard}>
          {/* Platform tabs */}
          <div style={styles.tabRow}>
            {[
              "Shiprocket",
              "Dilevery",
              "Shipway",
              "Ithink Logistics",
              "Nimbuspost",
            ].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setPlatform(name)}
                style={{
                  ...styles.tab,
                  ...(platform === name ? styles.tabActive : {}),
                }}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>{renderFields()}</div>

            {/* Connect button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.btnPrimary,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Connecting..." : "Connect →"}
            </button>
          </form>
        </div>

        {/* Skip button */}
        <button
          type="button"
          style={styles.btnSkip}
          onClick={() => (window.location.href = "/dashboard")}
        >
          I don't use Shiprocket — skip this →
        </button>

        {/* Coming soon chips */}
        <div style={styles.chipsRow}>
          {[
            "Shipway — coming soon",
            "Delhivery — coming soon",
            "Xpressbees — coming soon",
          ].map((chip) => (
            <span key={chip} style={styles.chip}>
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// Reusable InputField with clean theme styling
const InputField = ({ label, name, value, onChange, type = "text" }) => (
  <div style={{ marginBottom: "16px" }}>
    <label
      style={{
        display: "block",
        fontSize: "0.85rem",
        color: "#aaa",
        marginBottom: "8px",
      }}
    >
      {label}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.05)",
        color: "#fff",
        fontSize: "0.9rem",
        outline: "none",
        boxSizing: "border-box",
      }}
      autoComplete="off"
      required
    />
  </div>
);

// Consistent Styles Object
const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    background: "#101218",
    color: "#fff",
    fontFamily: "Inter, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    width: "380px",
    height: "380px",
    filter: "blur(80px)",
    opacity: 0.14,
    borderRadius: "50%",
    background: "#5fc61f",
    pointerEvents: "none",
  },
  blobLeft: { left: "-120px", top: "100%", transform: "translateY(-50%)" },
  blobRight: { right: "-120px", top: "0%" },
  sidebar: {
    width: "220px",
    minWidth: "220px",
    background: "rgba(255,255,255,0.02)",
    backdropFilter: "blur(10px)",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 1,
  },
  logo: { marginBottom: "28px" },
  sideSection: { marginBottom: "24px" },
  sideLabel: {
    fontSize: "0.7rem",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "10px",
  },
  sideItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  },
  sideIcon: { fontSize: "14px" },
  sideText: { fontSize: "0.85rem", flex: 1 },
  badgeLive: {
    fontSize: "0.65rem",
    background: "#26b35e",
    color: "#fff",
    padding: "2px 7px",
    borderRadius: "20px",
    fontWeight: "600",
  },
  badgeSkipped: {
    fontSize: "0.65rem",
    background: "rgba(255,255,255,0.1)",
    color: "#aaa",
    padding: "2px 7px",
    borderRadius: "20px",
  },
  badgeCurrent: {
    fontSize: "0.65rem",
    background: "#f59e0b",
    color: "#000",
    padding: "2px 7px",
    borderRadius: "20px",
    fontWeight: "600",
  },
  sideStatSmall: {
    fontSize: "0.75rem",
    color: "#888",
    marginBottom: "8px",
    lineHeight: "1.4",
  },
  sideBottom: {
    marginTop: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  shopDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#26b35e",
    display: "inline-block",
  },
  shopName: { fontSize: "0.75rem", color: "#aaa" },
  main: {
    flex: 1,
    padding: "48px 56px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
  },
  stepText: { fontSize: "0.8rem", color: "#26b35e", marginBottom: "12px" },
  headline: {
    fontSize: "2.2rem",
    fontWeight: "700",
    color: "#fff",
    lineHeight: "1.2",
    marginBottom: "16px",
    maxWidth: "480px",
  },
  headlineGreen: { color: "#26b35e" },
  subText: {
    fontSize: "0.95rem",
    color: "#aaa",
    marginBottom: "28px",
    maxWidth: "480px",
    lineHeight: "1.6",
  },
  formCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "24px",
    maxWidth: "480px",
    marginBottom: "20px",
  },
  tabRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "20px",
  },
  tab: {
    padding: "6px 14px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "#aaa",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  tabActive: {
    background: "#fff",
    color: "#000",
    fontWeight: "600",
    border: "1px solid #fff",
  },
  btnPrimary: {
    background: "#26b35e",
    color: "#fff",
    border: "none",
    padding: "14px 28px",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: "600",
    width: "100%",
  },
  btnSkip: {
    background: "transparent",
    border: "none",
    color: "#aaa",
    fontSize: "0.85rem",
    cursor: "pointer",
    marginBottom: "20px",
    textDecoration: "underline",
    padding: 0,
    textAlign: "left",
  },
  chipsRow: { display: "flex", flexWrap: "wrap", gap: "8px" },
  chip: {
    fontSize: "0.75rem",
    color: "#666",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "4px 12px",
    borderRadius: "20px",
  },
};

export default Step4;