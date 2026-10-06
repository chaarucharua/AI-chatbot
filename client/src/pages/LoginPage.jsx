/**
 * LoginPage.jsx — Authentication login page with quick demo account credentials.
 */

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/chat';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user.role === 'ADMIN' && from === '/chat') {
        navigate('/admin');
      } else if (user.role === 'SUPPORT_AGENT' && from === '/chat') {
        navigate('/agent');
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (fillEmail, fillPass) => {
    setEmail(fillEmail);
    setPassword(fillPass);
    setError('');
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-surface-900 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 mx-auto flex items-center justify-center shadow-lg shadow-brand-500/25 mb-4">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Sign in to NovaCart Support
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          AI-Powered Support with Grounded RAG & Human Escalation
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="card p-6 sm:p-8 backdrop-blur-xl bg-surface-800/90 shadow-xl border-surface-700">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="input"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-sm font-semibold"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="mt-6 pt-6 border-t border-surface-700">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
              Quick Test Accounts (Click to Fill)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('customer@novacart.com', 'CustomerPass123!')}
                className="p-2 rounded-lg bg-surface-900 border border-surface-700 hover:border-brand-500/50 hover:bg-surface-700/50 text-left transition-all group"
              >
                <div className="text-[11px] font-medium text-slate-200 group-hover:text-brand-400">Customer</div>
                <div className="text-[9px] text-slate-500 truncate">John Doe</div>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('agent@novacart.com', 'AgentPass123!')}
                className="p-2 rounded-lg bg-surface-900 border border-surface-700 hover:border-emerald-500/50 hover:bg-surface-700/50 text-left transition-all group"
              >
                <div className="text-[11px] font-medium text-slate-200 group-hover:text-emerald-400">Agent</div>
                <div className="text-[9px] text-slate-500 truncate">Alex Rivera</div>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('admin@novacart.com', 'AdminPass123!')}
                className="p-2 rounded-lg bg-surface-900 border border-surface-700 hover:border-purple-500/50 hover:bg-surface-700/50 text-left transition-all group"
              >
                <div className="text-[11px] font-medium text-slate-200 group-hover:text-purple-400">Admin</div>
                <div className="text-[9px] text-slate-500 truncate">Sarah Connor</div>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
