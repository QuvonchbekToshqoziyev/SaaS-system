import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api';
const savedAccountsKey = 'ado-b2b-saved-accounts';

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
        try {
          const rawUser = localStorage.getItem('user');
          const user = rawUser ? JSON.parse(rawUser) : null;
          const rawAccounts = localStorage.getItem(savedAccountsKey);
          const accounts = rawAccounts ? JSON.parse(rawAccounts) : [];
          if (user && Array.isArray(accounts)) {
            localStorage.setItem(
              savedAccountsKey,
              JSON.stringify(accounts.filter((account) => account?.id !== user?.id && account?.email !== user?.email)),
            );
          }
        } catch {
          // ignore malformed local test data
        }
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
