import axios from "axios";
import { isTokenValid, logout, refreshAccessToken } from "./src/utils/auth";

const isDev =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE_URL = isDev
  ? "http://localhost:3000/api"
  : "https://api.profitfirstanalytics.co.in/api";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// ── Request interceptor ───────────────────────────────────────
axiosInstance.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem("accessToken");
  const legacyToken = localStorage.getItem("token");
  const token = accessToken || legacyToken;

  if (token) {
    // Token expired check — but DON'T logout here
    // Let response interceptor handle refresh
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ── Concurrent refresh lock ───────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ── Response interceptor ─────────────────────────────────────
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    // Only handle 401 — not refresh endpoint itself
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh-token")
    ) {
      if (isRefreshing) {
        // Another refresh already in progress — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // refreshAccessToken uses plain axios — no loop
        const refreshed = await refreshAccessToken();

        if (refreshed) {
          const newToken = localStorage.getItem("accessToken");
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axiosInstance(originalRequest);
        } else {
          processQueue(new Error("Refresh failed"), null);
          const hasToken = !!(
            localStorage.getItem("accessToken") || localStorage.getItem("token")
          );
          const isAlreadyOnLogin = window.location.pathname === "/login";

          if (hasToken && !isAlreadyOnLogin) {
            logout();
          }
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
