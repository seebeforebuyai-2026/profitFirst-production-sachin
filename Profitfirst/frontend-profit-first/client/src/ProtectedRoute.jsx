import React from 'react';
import { Navigate } from 'react-router-dom';
import { useProfile } from './ProfileContext';

const ProtectedRoute = ({ children, requireUnlock = false }) => {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0D1D1E]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  // If requireUnlock is true, check dashboardUnlocked
  if (requireUnlock && profile?.dashboardUnlocked === false) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
