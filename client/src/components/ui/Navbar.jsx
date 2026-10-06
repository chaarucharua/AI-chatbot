/**
 * Navbar.jsx — Role-aware navigation bar.
 * Shows only the links relevant to each role.
 * Customers never see Agent/Admin links.
 * Agents/Admins never see the Assistant Chat link.
 */

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const isCustomer     = user.role === 'CUSTOMER';
  const isAgent        = user.role === 'SUPPORT_AGENT';
  const isAdmin        = user.role === 'ADMIN';
  const isAgentOrAdmin = isAgent || isAdmin;

  const roleBadgeColor = {
    ADMIN:         'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30',
    SUPPORT_AGENT: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
    CUSTOMER:      'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30',
  }[user.role] || 'bg-slate-500/15 text-slate-400';

  const roleLabel = {
    ADMIN:         'Admin',
    SUPPORT_AGENT: 'Support Agent',
    CUSTOMER:      'Customer',
  }[user.role] || user.role;

  // Logo link — takes each role to their own home
  const homeHref = isAdmin ? '/admin' : isAgent ? '/agent' : '/chat';

  return (
    <header className="border-b border-surface-700 bg-surface-900/90 backdrop-blur-md sticky top-0 z-30 shrink-0">
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-8">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-800 focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Logo — links to role home */}
          <Link to={homeHref} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-slate-100 text-sm sm:text-base tracking-tight flex items-center gap-1.5">
                <span>NovaCart</span>
                <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-semibold uppercase tracking-wider">AI</span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-slate-400 -mt-0.5">Support Platform</p>
            </div>
          </Link>

          {/* Desktop Navigation — role-aware links */}
          <nav className="hidden md:flex items-center gap-1">
            {/* Customers see: Assistant Chat only */}
            {isCustomer && (
              <Link
                to="/chat"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/chat')
                    ? 'bg-surface-800 text-brand-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/60'
                }`}
              >
                Assistant Chat
              </Link>
            )}

            {/* Agents & Admins see: Ticket Queue */}
            {isAgentOrAdmin && (
              <Link
                to="/agent"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/agent')
                    ? 'bg-surface-800 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/60'
                }`}
              >
                Ticket Queue
              </Link>
            )}

            {/* Admins see: Admin Console */}
            {isAdmin && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/admin')
                    ? 'bg-surface-800 text-purple-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/60'
                }`}
              >
                Admin Console
              </Link>
            )}
          </nav>
        </div>

        {/* User Status and Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">{user.name}</div>
            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{user.email}</div>
          </div>

          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadgeColor}`}>
            {roleLabel}
          </span>

          <button
            onClick={logout}
            title="Sign out"
            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-surface-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer — role-aware links */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-surface-700 bg-surface-850 p-4 space-y-2">
          <div className="pb-3 mb-2 border-b border-surface-700/60 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-200">{user.name}</div>
              <div className="text-[10px] text-slate-400">{user.email}</div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadgeColor}`}>
              {roleLabel}
            </span>
          </div>

          {/* Customer-only link */}
          {isCustomer && (
            <Link
              to="/chat"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                location.pathname.startsWith('/chat')
                  ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                  : 'text-slate-300 hover:bg-surface-800'
              }`}
            >
              💬 Assistant Chat
            </Link>
          )}

          {/* Agent/Admin links */}
          {isAgentOrAdmin && (
            <Link
              to="/agent"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                location.pathname.startsWith('/agent')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-300 hover:bg-surface-800'
              }`}
            >
              🎫 Ticket Queue
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                location.pathname.startsWith('/admin')
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'text-slate-300 hover:bg-surface-800'
              }`}
            >
              ⚙️ Admin Console
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
