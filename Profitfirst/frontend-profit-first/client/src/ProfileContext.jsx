import React, { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../axios";

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
