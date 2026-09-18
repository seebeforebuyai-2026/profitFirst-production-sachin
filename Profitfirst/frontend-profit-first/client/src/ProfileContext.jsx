import React, { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../axios";
import { isTokenValid } from "./utils/auth";

const ProfileContext = createContext();

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
};

export const ProfileProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async (silent = false) => {
    if (window.location.pathname.startsWith("/sso-login")) {
      if (!silent) setLoading(false);
      return null;
    }

    const token =
      localStorage.getItem("accessToken") || localStorage.getItem("token");
    // 🚨 THE REAL FIX: Agar token nahi hai YA token EXPIRED hai, toh API call mat karo!
    if (!token || !isTokenValid(token)) {
      if (!silent) setLoading(false);
      setProfile(null);
      return null;
    }
    if (!silent) setLoading(true);
    try {
      const response = await axiosInstance.get("/auth/profile");
      setProfile(response.data.user);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = (updates) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  };

  return (
    <ProfileContext.Provider
      value={{ profile, loading, updateProfile, fetchProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
};
