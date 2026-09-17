import { jwtDecode } from "jwt-decode";

/**
 * Check if a token is valid and not expired
 * @param {string} token - Optional token to validate, defaults to stored accessToken
 */
export const isTokenValid = (token) => {
  const tokenToValidate = token || localStorage.getItem("accessToken");
  if (!tokenToValidate) return false;

  try {
    const { exp } = jwtDecode(tokenToValidate);
    return Date.now() < exp * 1000;
  } catch (err) {
    return false;
  }
};

/**
 * Logout user and clear all stored data
 */
export const logout = () => {
  // Clear token structure
  localStorage.removeItem("accessToken");
  localStorage.removeItem("idToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userData");
  
  window.location.href = "/login";
};



import axios from "axios";

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.profitfirstanalytics.co.in";

export const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;

  try {
    // ⚠️ IMPORTANT: Plain axios use karo — axiosInstance NAHI
    // axiosInstance use karne se infinite loop ho jaayega (interceptor loop)
    const res = await axios.post(
      `${API_URL}/api/auth/refresh-token`,
      { refreshToken }
    );

    const tokens = res.data?.tokens;
    if (tokens?.accessToken) {
      localStorage.setItem("accessToken", tokens.accessToken);
      localStorage.setItem("token", tokens.accessToken); // legacy support
      if (tokens.idToken) {
        localStorage.setItem("idToken", tokens.idToken);
      }
      window.dispatchEvent(new Event("tokenUpdated"));
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Token refresh failed:", err.message);
    return false;
  }
};
