/**
 * api.js — Centralized Axios client for NovaCart API.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: inject JWT Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('novacart_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401s and standardize errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token on authentication failure
      localStorage.removeItem('novacart_token');
      localStorage.removeItem('novacart_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }

    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';

    return Promise.reject(new Error(message));
  }
);

export default api;
