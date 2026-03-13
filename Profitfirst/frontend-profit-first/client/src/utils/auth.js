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
