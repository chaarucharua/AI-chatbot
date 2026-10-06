/**
 * AuthContext.jsx — Authentication state provider.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('novacart_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('novacart_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verifyUser() {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          if (res.data) {
            setUser(res.data);
            localStorage.setItem('novacart_user', JSON.stringify(res.data));
          }
        } catch {
          logout();
        }
      }
      setLoading(false);
    }

    verifyUser();
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.token && res.data?.user) {
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('novacart_token', res.data.token);
      localStorage.setItem('novacart_user', JSON.stringify(res.data.user));
      return res.data.user;
    }
    throw new Error('Invalid login response');
  };

  const register = async (name, email, password) => {
    await api.post('/auth/register', { name, email, password });
    // Automatically log in after registration
    return await login(email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('novacart_token');
    localStorage.removeItem('novacart_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
