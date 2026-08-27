import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api';
const savedAccountsKey = 'ado-b2b-saved-accounts';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-ADO-CSRF': '1',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined') {
      const status = error?.response?.status;
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem(savedAccountsKey);

        const path = window.location.pathname;
        if (path !== '/login' && path !== '/login/') {
          window.location.href = '/login/';
        }
      }
    }
    return Promise.reject(error);
  },
);
