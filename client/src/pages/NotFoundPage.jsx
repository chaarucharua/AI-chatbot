/**
 * NotFoundPage.jsx — 404 page.
 */

import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center text-brand-400 mb-4 shadow-lg">
        <span className="text-2xl font-black">404</span>
      </div>
      <h1 className="text-xl font-bold text-slate-100 mb-2">Page Not Found</h1>
      <p className="text-xs text-slate-400 max-w-sm mb-6">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/chat" className="btn-primary text-xs py-2 px-4">
        Return to Assistant Chat
      </Link>
    </div>
  );
}
