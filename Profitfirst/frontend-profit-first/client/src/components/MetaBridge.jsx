import { useEffect } from "react";

const MetaBridge = () => {
  useEffect(() => {
    console.log("MetaBridge HIT");
    const params = window.location.search;

    if (params && params.includes("code")) {
      // redirect to backend
      window.location.replace(
        `https://api.profitfirstanalytics.co.in/api/meta/callback${params}`
      );
    } else {
      console.error("Meta callback params missing");
    }
  }, []);

  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
      }}
    >
      <h2>Connecting to Meta Ads... Please wait...</h2>
    </div>
  );
};

export default MetaBridge;