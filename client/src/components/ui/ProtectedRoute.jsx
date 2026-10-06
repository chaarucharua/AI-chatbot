/**
 * ProtectedRoute.jsx — Role-based route guard.
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900 text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // If authenticated but unauthorized for this role, redirect to appropriate home
    if (user?.role === 'CUSTOMER') {
      return <Navigate to="/chat" replace />;
    } else if (user?.role === 'SUPPORT_AGENT') {
      return <Navigate to="/agent" replace />;
    }
    return <Navigate to="/chat" replace />;
  }

  return <Outlet />;
}
