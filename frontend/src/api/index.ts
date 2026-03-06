import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      // Don't redirect on login/register/refresh endpoints
      if (!url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/refresh')) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  profile: () => api.get('/auth/profile'),
  refresh: () => api.post('/auth/refresh'),
};

// Users
export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  getStats: () => api.get('/users/stats'),
};

// Companies
export const companiesApi = {
  create: (data: any) => api.post('/companies', data),
  getAll: () => api.get('/companies'),
  getOne: (id: string) => api.get(`/companies/${id}`),
  update: (id: string, data: any) => api.put(`/companies/${id}`, data),
  delete: (id: string) => api.delete(`/companies/${id}`),
  getClients: (id: string) => api.get(`/companies/${id}/clients`),
  getDashboard: (id: string) => api.get(`/companies/${id}/dashboard`),
};

// Transactions
export const transactionsApi = {
  create: (data: any) => api.post('/transactions', data),
  getByCompany: (companyId: string, params?: any) => api.get(`/transactions/company/${companyId}`, { params }),
  getOne: (id: string) => api.get(`/transactions/${id}`),
  update: (id: string, data: any) => api.put(`/transactions/${id}`, data),
  delete: (id: string) => api.delete(`/transactions/${id}`),
  getBalance: (companyId: string) => api.get(`/transactions/company/${companyId}/balance`),
  getSummary: (companyId: string, params?: any) => api.get(`/transactions/company/${companyId}/summary`, { params }),
};

// Counterparties
export const counterpartiesApi = {
  create: (data: any) => api.post('/counterparties', data),
  getByCompany: (companyId: string) => api.get(`/counterparties/company/${companyId}`),
  getOne: (id: string) => api.get(`/counterparties/${id}`),
  update: (id: string, data: any) => api.put(`/counterparties/${id}`, data),
  delete: (id: string) => api.delete(`/counterparties/${id}`),
  getDebtReport: (companyId: string) => api.get(`/counterparties/company/${companyId}/debt-report`),
};

// Inventory
export const inventoryApi = {
  create: (data: any) => api.post('/inventory', data),
  getByCompany: (companyId: string) => api.get(`/inventory/company/${companyId}`),
  getOne: (id: string) => api.get(`/inventory/${id}`),
  update: (id: string, data: any) => api.put(`/inventory/${id}`, data),
  delete: (id: string) => api.delete(`/inventory/${id}`),
  restore: (id: string) => api.put(`/inventory/${id}/restore`),
  getLowStock: (companyId: string) => api.get(`/inventory/company/${companyId}/low-stock`),
  getValue: (companyId: string) => api.get(`/inventory/company/${companyId}/value`),
};

// Employees
export const employeesApi = {
  create: (data: any) => api.post('/employees', data),
  getByCompany: (companyId: string) => api.get(`/employees/company/${companyId}`),
  getOne: (id: string) => api.get(`/employees/${id}`),
  update: (id: string, data: any) => api.put(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
  updateSalary: (id: string, data: any) => api.put(`/employees/${id}/salary`, data),
  getPayroll: (companyId: string) => api.get(`/employees/company/${companyId}/payroll`),
};

// Branches
export const branchesApi = {
  create: (data: any) => api.post('/branches', data),
  getByCompany: (companyId: string) => api.get(`/branches/company/${companyId}`),
  getOne: (id: string) => api.get(`/branches/${id}`),
  update: (id: string, data: any) => api.put(`/branches/${id}`, data),
  delete: (id: string) => api.delete(`/branches/${id}`),
  deactivate: (id: string) => api.put(`/branches/${id}/deactivate`),
};

// Reports
export const reportsApi = {
  getFinancialOverview: (companyId: string, params?: any) => api.get(`/reports/financial/${companyId}`, { params }),
  getDailyReport: (companyId: string, date: string) => api.get(`/reports/daily/${companyId}`, { params: { date } }),
  getMonthlyReport: (companyId: string, params: any) => api.get(`/reports/monthly/${companyId}`, { params }),
  getKPIs: (companyId: string) => api.get(`/reports/kpis/${companyId}`),
  getFirmOverview: (firmId: string) => api.get(`/reports/firm/${firmId}`),
  generate: (companyId: string, params: any) => api.post(`/reports/generate/${companyId}`, params),
  download: (companyId: string, params: any) => api.get(`/reports/download/${companyId}`, { params, responseType: 'blob' }),
};

// Chat
export const chatApi = {
  createRoom: (data: any) => api.post('/chat/rooms', data),
  getRooms: () => api.get('/chat/rooms'),
  getMessages: (roomId: string, params?: any) => api.get(`/chat/rooms/${roomId}/messages`, { params }),
  sendMessage: (roomId: string, data: any) => api.post(`/chat/rooms/${roomId}/messages`, data),
};

// Audit
export const auditApi = {
  getAll: (params?: any) => api.get('/audit', { params }),
  getSummary: () => api.get('/audit/summary'),
};

// Subscriptions
export const subscriptionsApi = {
  getPlans: () => api.get('/subscriptions/plans'),
  getPlan: (code: string) => api.get(`/subscriptions/plans/${code}`),
  getCompanySubscription: (companyId: string) => api.get(`/subscriptions/company/${companyId}`),
  checkFeature: (companyId: string, feature: string) => api.get(`/subscriptions/company/${companyId}/check/${feature}`),
};

// Payments
export const paymentsApi = {
  create: (data: any) => api.post('/payments', data),
  getByCompany: (companyId: string) => api.get(`/payments/company/${companyId}`),
  getOne: (id: string) => api.get(`/payments/${id}`),
  /** Poll this after redirect back from provider to get backend-confirmed status */
  getStatus: (id: string) => api.get(`/payments/${id}/status`),
  getStats: () => api.get('/payments/stats/overview'),
};
