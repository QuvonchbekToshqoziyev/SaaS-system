import axios from 'axios';

const baseURL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000')
  : '/api';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined') {
      const status = error?.response?.status;
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        const path = window.location.pathname;
        if (path !== '/login' && path !== '/login/') {
          window.location.href = '/login/';
        }
      }
    }
    return Promise.reject(error);
  },
);
