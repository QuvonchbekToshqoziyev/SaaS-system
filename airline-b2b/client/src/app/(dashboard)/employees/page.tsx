"use client";

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AxiosError } from 'axios';
import ExportActions from '@/components/ui/ExportActions';
import ActionButtons from '@/components/ui/ActionButtons';

type FirmOption = { id: string; name: string };
type Employee = {
  id: string;
  name: string;
  role: string;
  salary: string | number;
  currency: string;
  firmId?: string | null;
  firm?: FirmOption | null;
  status: 'ACTIVE' | 'SUSPENDED';
};
type UserRow = {
  id: string;
  email: string;
  role: string;
  firmRole?: string;
  fullName?: string | null;
  phone?: string | null;
  firmId?: string | null;
  firm?: (FirmOption & { kind?: string | null; currency?: string | null }) | null;
  status?: string;
  firmAccesses?: Array<{ firmId: string; firm?: FirmOption }>;
};

type EmployeeDraft = {
  name: string;
  role: string;
  salary: string;
  currency: string;
  firmId: string;
  status: 'ACTIVE' | 'SUSPENDED';
};

type ApiErrorResponse = { error?: string };

const emptyEmployeeDraft = { name: '', role: 'MANAGER', customRole: '', salary: '', currency: 'UZS', firmId: '', email: '', password: '' };

function apiErrorMessage(err: unknown): string | undefined {
  return (err as AxiosError<ApiErrorResponse>)?.response?.data?.error;
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const queryClient = useQueryClient();
  const role = String(user?.role || '').toUpperCase();
  const isSuperAdmin = role === 'SUPERADMIN';
  const isFirmUser = role === 'FIRM';
  const firmRole = user?.firmRole || 'FIRM_ADMIN';
  const isFirmAdmin = isFirmUser && firmRole === 'FIRM_ADMIN';
  const canAccess = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'FIRM';
  const canManageEmployees = role === 'SUPERADMIN' || role === 'ADMIN' || isFirmAdmin;
  const canCreateEmployeeLogin = isSuperAdmin || isFirmAdmin;
  const canLoadFirms = role === 'SUPERADMIN' || role === 'ADMIN';
  const employeeRoleOptions = [
    { value: 'MANAGER', label: tr('Manager', 'Menejer') },
    { value: 'KASSIR', label: tr('Kassir', 'Kassir') },
    { value: 'OMBOR_MUDIRI', label: tr('Warehouse manager', 'Ombor mudiri') },
    { value: 'MONITOR', label: tr('Monitor', 'Monitor') },
    { value: 'OTHER', label: tr('Other', 'Boshqa') },
  ];

  const [draft, setDraft] = useState(emptyEmployeeDraft);
  const [saving, setSaving] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  const [employeeDrafts, setEmployeeDrafts] = useState<Record<string, EmployeeDraft>>({});
  const [accessDrafts, setAccessDrafts] = useState<Record<string, string[]>>({});
  const [resetDrafts, setResetDrafts] = useState<Record<string, string>>({});
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [savingAccessId, setSavingAccessId] = useState<string | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<any | null>(null);
  const [loadingSalaryEmployeeId, setLoadingSalaryEmployeeId] = useState<string | null>(null);
  const [salaryFilters, setSalaryFilters] = useState({ from: '', to: '', month: '', year: '', method: '', account: '', currency: '', status: '' });

  const { data: firms = [] } = useQuery<FirmOption[]>({
    queryKey: ['firms', user?.id || user?.email || role],
    queryFn: async () => (await api.get('/firms')).data,
    enabled: canLoadFirms,
  });

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', user?.id || user?.email || role],
    queryFn: async () => (await api.get('/employees')).data,
    enabled: canAccess,
  });

  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['auth-users', user?.id || user?.email || role],
    queryFn: async () => (await api.get('/auth/users')).data,
    enabled: isSuperAdmin,
  });

  const admins = useMemo(() => users.filter((row) => String(row.role).toUpperCase() === 'ADMIN'), [users]);
  const salaryRows = useMemo(() => {
    const rows = Array.isArray(salaryHistory?.rows) ? salaryHistory.rows : [];
    return rows.filter((row: any) => {
      const date = String(row.date || '');
      const month = String(row.salaryPeriod || date.slice(0, 7));
      const account = String(row.kassaDesk?.id || row.paymentCard?.id || row.sourceAccount?.id || '');
      return (!salaryFilters.from || date >= salaryFilters.from)
        && (!salaryFilters.to || date <= salaryFilters.to)
        && (!salaryFilters.month || month === salaryFilters.month)
        && (!salaryFilters.year || date.startsWith(salaryFilters.year))
        && (!salaryFilters.method || String(row.paymentMethod || '').toUpperCase() === salaryFilters.method)
        && (!salaryFilters.account || account === salaryFilters.account)
        && (!salaryFilters.currency || String(row.originalCurrency || '').toUpperCase() === salaryFilters.currency)
        && (!salaryFilters.status || String(row.status || '').toUpperCase() === salaryFilters.status);
    });
  }, [salaryHistory, salaryFilters]);
  const salaryAccountOptions = useMemo(() => {
    const rows = Array.isArray(salaryHistory?.rows) ? salaryHistory.rows : [];
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = row.kassaDesk?.id || row.paymentCard?.id || row.sourceAccount?.id;
      const label = row.kassaDesk?.name || row.paymentCard?.ownerName || row.sourceAccount?.name;
      if (id && label) map.set(id, label);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [salaryHistory]);
  const salaryExportSheet = useMemo(() => ({
    name: 'Ish haqi tarixi',
    columns: [
      { header: 'Sana', key: 'date', width: 14 },
      { header: 'Vaqt', key: 'time', width: 20 },
      { header: 'Ish haqi davri', key: 'salaryPeriod', width: 16 },
      { header: 'Hisoblangan maosh', key: 'accruedSalary', width: 18 },
      { header: 'To‘langan summa', key: 'paidAmount', width: 18 },
      { header: 'Original valyuta', key: 'originalCurrency', width: 14 },
      { header: 'UZS ekvivalenti', key: 'uzsEquivalent', width: 18 },
      { header: 'Kurs', key: 'exchangeRate', width: 14 },
      { header: 'To‘lov usuli', key: 'paymentMethod', width: 16 },
      { header: 'Naqd / Karta / Bank', key: 'account', width: 24 },
      { header: 'Kim to‘ladi', key: 'paidBy', width: 24 },
      { header: 'Izoh', key: 'note', width: 28 },
      { header: 'Hujjat', key: 'documentNumber', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Audit', key: 'audit', width: 18 },
    ],
    rows: salaryRows.map((row: any) => ({
      date: row.date,
      time: row.time ? new Date(row.time).toLocaleTimeString() : '',
      salaryPeriod: row.salaryPeriod,
      accruedSalary: Number(row.accruedSalary || 0),
      paidAmount: Number(row.paidAmount || 0),
      originalCurrency: row.originalCurrency,
      uzsEquivalent: Number(row.uzsEquivalent || 0),
      exchangeRate: Number(row.exchangeRate || 0),
      paymentMethod: row.paymentMethod || '',
      account: row.kassaDesk?.name || row.paymentCard?.ownerName || row.sourceAccount?.name || '',
      paidBy: row.paidBy?.fullName || row.paidBy?.email || '',
      note: row.note || '',
      documentNumber: row.documentNumber || '',
      status: row.status || '',
      audit: row.audit?.operationType || row.audit?.sourceMode || '',
    })),
  }), [salaryRows]);

  if (!canAccess) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-foreground">{tr('Employees', 'Hodimlar')}</h2>
        <p className="mt-2 text-muted">{tr('You do not have access to this page.', 'Bu sahifaga kirish huquqingiz yo\'q.')}</p>
      </div>
    );
  }

  const createEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const finalRole = draft.role === 'OTHER' ? draft.customRole.trim() : draft.role.trim();
    if (!draft.name.trim() || !finalRole) {
      toast.error(tr('Name and role are required', 'Ism va rol kerak'));
      return;
    }
    if (!draft.salary.trim() || !Number.isFinite(Number(draft.salary)) || Number(draft.salary) < 0) {
      toast.error(tr('Enter a valid salary', 'To\'g\'ri maosh kiriting'));
      return;
    }
    const targetFirmId = isFirmUser ? user?.firmId || '' : draft.firmId;
    if (!targetFirmId && !isSuperAdmin) {
      toast.error(tr('Select a firm', 'Firmani tanlang'));
      return;
    }
    const wantsLogin = canCreateEmployeeLogin && Boolean(draft.email.trim() || draft.password || ['KASSIR', 'OMBOR_MUDIRI'].includes(draft.role));
    if (wantsLogin && !draft.email.trim()) {
      toast.error(tr('Email is required for login access', 'Login uchun email kerak'));
      return;
    }
    if (wantsLogin && draft.password.length < 6) {
      toast.error(tr('Password must be at least 6 characters', 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'));
      return;
    }

    try {
      setSaving(true);
      await api.post('/employees', {
        name: draft.name.trim(),
        role: finalRole,
        salary: draft.salary.trim(),
        currency: draft.currency.trim().toUpperCase() || 'UZS',
        firmId: targetFirmId || undefined,
        email: wantsLogin ? draft.email.trim() : undefined,
        password: wantsLogin ? draft.password : undefined,
      });
      toast.success(wantsLogin ? tr('Employee and login created', 'Hodim va login yaratildi') : tr('Employee saved', 'Hodim saqlandi'));
      setDraft(emptyEmployeeDraft);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to save employee', 'Hodimni saqlab bo\'lmadi'));
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!window.confirm(tr('Delete this employee?', 'Ushbu hodim o‘chirilsinmi?'))) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success(tr('Employee deleted', 'Hodim o\'chirildi'));
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to delete employee', 'Hodimni o\'chirib bo\'lmadi'));
    }
  };

  const employeeDraft = (employee: Employee): EmployeeDraft => employeeDrafts[employee.id] ?? {
    name: employee.name || '',
    role: employee.role || 'MANAGER',
    salary: String(employee.salary ?? '0'),
    currency: employee.currency || 'UZS',
    firmId: employee.firmId || '',
    status: employee.status || 'ACTIVE',
  };

  const setEmployeeDraft = (employee: Employee, patch: Partial<EmployeeDraft>) => {
    setEmployeeDrafts((drafts) => ({
      ...drafts,
      [employee.id]: { ...employeeDraft(employee), ...patch },
    }));
  };

  const updateEmployee = async (employee: Employee) => {
    const row = employeeDraft(employee);
    if (!row.name.trim() || !row.role.trim()) {
      toast.error(tr('Name and role are required', 'Ism va rol kerak'));
      return;
    }
    if (!row.salary.trim() || !Number.isFinite(Number(row.salary)) || Number(row.salary) < 0) {
      toast.error(tr('Enter a valid salary', 'To\'g\'ri maosh kiriting'));
      return;
    }

    try {
      setSavingEmployeeId(employee.id);
      await api.patch(`/employees/${employee.id}`, {
        name: row.name.trim(),
        role: row.role.trim(),
        salary: row.salary.trim(),
        currency: row.currency.trim().toUpperCase() || 'UZS',
        firmId: row.firmId || null,
        status: row.status,
      });
      toast.success(tr('Employee updated', 'Hodim yangilandi'));
      setEmployeeDrafts((drafts) => {
        const next = { ...drafts };
        delete next[employee.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to update employee', 'Hodimni yangilab bo\'lmadi'));
    } finally {
      setSavingEmployeeId(null);
    }
  };

  const currentAccess = (admin: UserRow) => accessDrafts[admin.id] ?? (admin.firmAccesses || []).map((item) => item.firmId);

  const toggleAccess = (admin: UserRow, firmId: string) => {
    const current = currentAccess(admin);
    const next = current.includes(firmId) ? current.filter((id) => id !== firmId) : [...current, firmId];
    setAccessDrafts((drafts) => ({ ...drafts, [admin.id]: next }));
  };

  const saveAccess = async (admin: UserRow) => {
    try {
      setSavingAccessId(admin.id);
      await api.patch(`/auth/users/${admin.id}/firm-access`, { firmIds: currentAccess(admin) });
      toast.success(tr('Access saved', 'Access saqlandi'));
      setAccessDrafts((drafts) => {
        const next = { ...drafts };
        delete next[admin.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to save access', 'Access saqlanmadi'));
    } finally {
      setSavingAccessId(null);
    }
  };

  const resetUserPassword = async (account: UserRow) => {
    const password = (resetDrafts[account.id] || '').trim();
    if (password.length < 6) {
      toast.error(tr('Password must be at least 6 characters', 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'));
      return;
    }
    try {
      setResettingUserId(account.id);
      await api.patch(`/auth/users/${account.id}`, { password });
      toast.success(tr('Password reset saved', 'Parol yangilandi'));
      setResetDrafts((drafts) => {
        const next = { ...drafts };
        delete next[account.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to reset password', 'Parolni yangilab bo\'lmadi'));
    } finally {
      setResettingUserId(null);
    }
  };

  const loadSalaryHistory = async (employee: Employee) => {
    try {
      setLoadingSalaryEmployeeId(employee.id);
      const response = await api.get(`/employees/${employee.id}/salary-history`);
      setSalaryHistory(response.data);
      setSalaryFilters({ from: '', to: '', month: '', year: '', method: '', account: '', currency: '', status: '' });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to load salary history', 'Ish haqi tarixini yuklab bo‘lmadi'));
    } finally {
      setLoadingSalaryEmployeeId(null);
    }
  };

  const money = (value: unknown) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  const roleLabel = (value: string) => employeeRoleOptions.find((option) => option.value === value)?.label || value;
  const newEmployeeRole = draft.role === 'OTHER' ? draft.customRole.trim() : draft.role.trim();
  const newEmployeeWantsLogin = canCreateEmployeeLogin && Boolean(draft.email.trim() || draft.password || ['KASSIR', 'OMBOR_MUDIRI'].includes(draft.role));
  const newEmployeeDraftValid = Boolean(
    draft.name.trim()
    && newEmployeeRole
    && Number.isFinite(Number(draft.salary))
    && Number(draft.salary) >= 0
    && /^[A-Z]{3}$/.test(draft.currency.trim().toUpperCase())
    && (isFirmUser || isSuperAdmin || draft.firmId)
    && (!newEmployeeWantsLogin || (draft.email.trim() && draft.password.length >= 6))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{tr('Employees', 'Hodimlar')}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr('Track staff roles, salaries, and status. Login credentials can be created together with a new employee.', 'Hodimlarning roli, maoshi va statusini yuriting. Yangi hodim bilan birga login ma\'lumotlarini ham yarating.')}
          </p>
        </div>
        <ExportActions filename="ado-hodimlar" sheet={{
          name: 'Hodimlar',
          columns: [{ header: 'Ism', key: 'name' }, { header: 'Rol', key: 'role' }, { header: 'Firma', key: 'firm' }, { header: 'Maosh', key: 'salary' }, { header: 'Valyuta', key: 'currency' }, { header: 'Status', key: 'status' }],
          rows: employees.map((employee) => ({ name: employee.name, role: employee.role, firm: employee.firm?.name || '', salary: Number(employee.salary || 0), currency: employee.currency, status: employee.status })),
        }} />
      </div>

      {canManageEmployees && (
      <form onSubmit={createEmployee} className="glass-panel compact-toolbar p-4">
        <div>
          <label className="compact-label">{tr('Name', 'Ism')}</label>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="compact-control" required />
        </div>
        {canCreateEmployeeLogin && (
          <>
            <div>
              <label className="compact-label">{tr('Login email', 'Login email')}</label>
              <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="compact-control" required={['KASSIR', 'OMBOR_MUDIRI'].includes(draft.role)} />
            </div>
            <div>
              <label className="compact-label">{tr('Initial password', 'Boshlang\'ich parol')}</label>
              <input type="password" minLength={6} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className="compact-control" required={['KASSIR', 'OMBOR_MUDIRI'].includes(draft.role)} />
            </div>
          </>
        )}
        <div>
          <label className="compact-label">{tr('Role', 'Rol')}</label>
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className="compact-control">
            {employeeRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {draft.role === 'OTHER' && (
            <input
              value={draft.customRole}
              onChange={(e) => setDraft({ ...draft, customRole: e.target.value })}
              className="compact-control mt-2"
              placeholder={tr('Role name', 'Rol nomi')}
              required
            />
          )}
        </div>
        <div>
          <label className="compact-label">{tr('Salary', 'Maosh')}</label>
          <input type="number" min="0" step="0.01" value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} className="compact-control" required />
        </div>
        <div>
          <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
          <input minLength={3} maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} className="compact-control uppercase" required />
        </div>
        {isFirmUser ? (
          <div>
            <label className="compact-label">{tr('Firm', 'Firma')}</label>
            <div className="compact-control flex items-center text-muted">
              {tr('Current firm only', 'Faqat joriy firma')}
            </div>
          </div>
        ) : (
          <div>
            <label className="compact-label">{tr('Firm', 'Firma')}</label>
            <select value={draft.firmId} onChange={(e) => setDraft({ ...draft, firmId: e.target.value })} className="compact-control" required={!isSuperAdmin}>
              <option value="">{isSuperAdmin ? tr('System-wide', 'Butun system') : tr('Select firm', 'Firmani tanlang')}</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>{firm.name}</option>
              ))}
            </select>
          </div>
        )}
        <ActionButtons
          className="col-span-full"
          cancelLabel={tr('Cancel', 'Bekor qilish')}
          confirmLabel={tr('Confirm', 'Tasdiqlash')}
          busyLabel={tr('Saving...', 'Saqlanmoqda...')}
          busy={saving}
          canConfirm={newEmployeeDraftValid}
          onCancel={() => setDraft(emptyEmployeeDraft)}
        />
      </form>
      )}

      <div className="glass-panel overflow-x-auto scroller-minimal">
        <table className="excel-table">
          <thead>
            <tr>
              <th>{tr('Name', 'Ism')}</th>
              <th>{tr('Role', 'Rol')}</th>
              <th>{tr('Firm', 'Firma')}</th>
              <th className="text-right">{tr('Salary', 'Maosh')}</th>
              <th>{tr('Status', 'Status')}</th>
              <th>{tr('Action', 'Amal')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center text-muted">{tr('Loading...', 'Yuklanmoqda...')}</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted">{tr('No employees found.', 'Hodimlar topilmadi.')}</td></tr>
            ) : employees.map((employee) => {
              const row = employeeDraft(employee);
              return (
                <tr key={employee.id}>
                  <td className="font-semibold">
                    {canManageEmployees ? (
                      <input value={row.name} onChange={(e) => setEmployeeDraft(employee, { name: e.target.value })} className="compact-control min-w-[160px]" />
                    ) : employee.name}
                  </td>
                  <td>
                    {canManageEmployees ? (
                      <select value={row.role} onChange={(e) => setEmployeeDraft(employee, { role: e.target.value })} className="compact-control min-w-[150px]">
                        {!employeeRoleOptions.some((option) => option.value === row.role) && (
                          <option value={row.role}>{row.role}</option>
                        )}
                        {employeeRoleOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : roleLabel(employee.role)}
                  </td>
                  <td>
                    {isSuperAdmin ? (
                      <select value={row.firmId} onChange={(e) => setEmployeeDraft(employee, { firmId: e.target.value })} className="compact-control min-w-[160px]">
                        <option value="">{tr('System-wide', 'Butun system')}</option>
                        {firms.map((firm) => (
                          <option key={firm.id} value={firm.id}>{firm.name}</option>
                        ))}
                      </select>
                    ) : employee.firm?.name || tr('System-wide', 'Butun system')}
                  </td>
                  <td className="text-right font-mono">
                    {canManageEmployees ? (
                      <div className="flex items-center justify-end gap-2">
                        <input inputMode="decimal" value={row.salary} onChange={(e) => setEmployeeDraft(employee, { salary: e.target.value })} className="compact-control w-28 text-right font-mono" />
                        <input maxLength={3} value={row.currency} onChange={(e) => setEmployeeDraft(employee, { currency: e.target.value.toUpperCase() })} className="compact-control w-20 uppercase" />
                      </div>
                    ) : `${money(employee.salary)} ${employee.currency}`}
                  </td>
                  <td>
                    {canManageEmployees ? (
                      <select value={row.status} onChange={(e) => setEmployeeDraft(employee, { status: e.target.value as 'ACTIVE' | 'SUSPENDED' })} className="compact-control min-w-[130px]">
                        <option value="ACTIVE">{tr('Active', 'Faol')}</option>
                        <option value="SUSPENDED">{tr('Suspended', 'To\'xtatilgan')}</option>
                      </select>
                    ) : employee.status}
                  </td>
                  <td>
                    {canManageEmployees ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => loadSalaryHistory(employee)} disabled={loadingSalaryEmployeeId === employee.id} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50">
                          {loadingSalaryEmployeeId === employee.id ? tr('Loading', 'Yuklanmoqda') : tr('Salary history', 'Ish haqi tarixi')}
                        </button>
                        <button type="button" onClick={() => updateEmployee(employee)} disabled={savingEmployeeId === employee.id || !row.name.trim() || !row.role.trim() || !Number.isFinite(Number(row.salary)) || Number(row.salary) < 0 || !/^[A-Z]{3}$/.test(row.currency.trim().toUpperCase())} className="inline-flex items-center gap-1 border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50">
                          <Save size={14} />
                          {savingEmployeeId === employee.id ? tr('Saving', 'Saqlanmoqda') : tr('Confirm', 'Tasdiqlash')}
                        </button>
                        <button type="button" onClick={() => setEmployeeDrafts((drafts) => { const next = { ...drafts }; delete next[employee.id]; return next; })} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface">
                          {tr('Cancel', 'Bekor qilish')}
                        </button>
                        <button type="button" onClick={() => deleteEmployee(employee.id)} className="inline-flex items-center gap-1 border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/20">
                          <Trash2 size={14} />
                          {tr('Delete', 'O\'chirish')}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => loadSalaryHistory(employee)} disabled={loadingSalaryEmployeeId === employee.id} className="border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50">
                        {loadingSalaryEmployeeId === employee.id ? tr('Loading', 'Yuklanmoqda') : tr('Salary history', 'Ish haqi tarixi')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {salaryHistory && (
        <div className="glass-panel p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{salaryHistory.employee?.name} · {tr('Salary history', 'Ish haqi tarixi')}</h3>
              <p className="text-sm text-muted">{salaryHistory.employee?.firm?.name || ''}</p>
            </div>
            <button type="button" onClick={() => setSalaryHistory(null)} className="border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface">{tr('Close', 'Yopish')}</button>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [tr('Current salary', 'Joriy maosh'), salaryHistory.summary?.currentSalary],
              [tr('Current month accrued', 'Joriy oy hisoblandi'), salaryHistory.summary?.currentMonthAccrued],
              [tr('Current month paid', 'Joriy oy to‘landi'), salaryHistory.summary?.currentMonthPaid],
              [tr('Remaining', 'Qolgan'), salaryHistory.summary?.currentMonthRemaining],
              [tr('YTD accrued', 'Yil boshidan hisoblandi'), salaryHistory.summary?.yearToDateAccrued],
              [tr('YTD paid', 'Yil boshidan to‘landi'), salaryHistory.summary?.yearToDatePaid],
              [tr('Advance', 'Avans'), salaryHistory.summary?.advance],
              [tr('Debt', 'Qarzdorlik'), salaryHistory.summary?.debt],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-surface p-3"><div className="text-xs font-bold uppercase text-muted">{label}</div><div className="mt-1 font-mono text-lg font-black">{money(value)} {salaryHistory.employee?.currency || 'UZS'}</div></div>)}
          </div>
          <div className="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 md:grid-cols-4 xl:grid-cols-8">
            <input type="date" value={salaryFilters.from} onChange={(event) => setSalaryFilters((current) => ({ ...current, from: event.target.value }))} className="compact-control" />
            <input type="date" value={salaryFilters.to} onChange={(event) => setSalaryFilters((current) => ({ ...current, to: event.target.value }))} className="compact-control" />
            <input type="month" value={salaryFilters.month} onChange={(event) => setSalaryFilters((current) => ({ ...current, month: event.target.value }))} className="compact-control" />
            <input inputMode="numeric" maxLength={4} value={salaryFilters.year} onChange={(event) => setSalaryFilters((current) => ({ ...current, year: event.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="Yil" className="compact-control" />
            <select value={salaryFilters.method} onChange={(event) => setSalaryFilters((current) => ({ ...current, method: event.target.value }))} className="compact-control"><option value="">CASH / CARD / BANK</option><option value="CASH">CASH</option><option value="CARD">CARD</option><option value="BANK">BANK</option></select>
            <select value={salaryFilters.account} onChange={(event) => setSalaryFilters((current) => ({ ...current, account: event.target.value }))} className="compact-control"><option value="">Kassa / karta / bank</option>{salaryAccountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
            <select value={salaryFilters.currency} onChange={(event) => setSalaryFilters((current) => ({ ...current, currency: event.target.value }))} className="compact-control"><option value="">Valyuta</option><option value="UZS">UZS</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
            <select value={salaryFilters.status} onChange={(event) => setSalaryFilters((current) => ({ ...current, status: event.target.value }))} className="compact-control"><option value="">Status</option><option value="CONFIRMED">CONFIRMED</option><option value="APPLIED">APPLIED</option><option value="POSTED">POSTED</option><option value="CANCELLED">CANCELLED</option><option value="REVERSED">REVERSED</option></select>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-muted">{salaryRows.length} ta yozuv</div>
            <ExportActions filename={`ish-haqi-${salaryHistory.employee?.name || 'xodim'}`} sheet={salaryExportSheet} />
          </div>
          <div className="overflow-x-auto scroller-minimal">
            <table className="excel-table">
              <thead><tr><th>{tr('Date', 'Sana')}</th><th>{tr('Time', 'Vaqt')}</th><th>{tr('Period', 'Davr')}</th><th>{tr('Accrued', 'Hisoblangan')}</th><th>{tr('Paid amount', 'To‘langan summa')}</th><th>{tr('Original currency', 'Original valyuta')}</th><th>{tr('UZS equivalent', 'UZS ekvivalenti')}</th><th>{tr('Rate', 'Kurs')}</th><th>{tr('Method', 'Usul')}</th><th>{tr('Cash/Card/Bank', 'Naqd / Karta / Bank')}</th><th>{tr('Paid by', 'Kim to‘ladi')}</th><th>{tr('Note', 'Izoh')}</th><th>{tr('Document', 'Hujjat')}</th><th>{tr('Status', 'Status')}</th><th>{tr('Audit', 'Audit')}</th></tr></thead>
              <tbody>{salaryRows.length ? salaryRows.map((row: any) => <tr key={row.id}><td>{row.date}</td><td>{row.time ? new Date(row.time).toLocaleTimeString() : '-'}</td><td>{row.salaryPeriod}</td><td className="font-mono">{money(row.accruedSalary)} {salaryHistory.employee?.currency}</td><td className="font-mono">{money(row.paidAmount)} {row.originalCurrency}</td><td>{row.originalCurrency}</td><td className="font-mono">{money(row.uzsEquivalent)}</td><td className="font-mono">{money(row.exchangeRate)}</td><td>{row.paymentMethod || '-'}</td><td>{row.kassaDesk?.name || row.paymentCard?.ownerName || row.sourceAccount?.name || '-'}</td><td>{row.paidBy?.fullName || row.paidBy?.email || '-'}</td><td>{row.note || '-'}</td><td>{row.documentNumber || '-'}</td><td>{row.status}</td><td>{row.audit?.operationType || row.audit?.sourceMode || '-'}</td></tr>) : <tr><td colSpan={15} className="text-center text-muted">{tr('No salary payments found.', 'Ish haqi to‘lovlari topilmadi.')}</td></tr>}</tbody>
            </table>
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <div className="glass-panel p-4">
          <h3 className="text-lg font-semibold text-foreground">{tr('Registered login accounts', 'Ro\'yxatdan o\'tgan login akkauntlar')}</h3>
          <p className="mt-1 text-sm text-muted">
            {tr('Superadmin can review account ownership and set a temporary password when a user asks for reset help.', 'Superadmin akkaunt egasini ko\'rib, foydalanuvchi parol tiklash so\'raganda vaqtinchalik parol berishi mumkin.')}
          </p>
          <div className="mt-4 overflow-x-auto scroller-minimal">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>{tr('Name', 'Ism')}</th>
                  <th>{tr('Role', 'Rol')}</th>
                  <th>{tr('Firm', 'Firma')}</th>
                  <th>{tr('Phone', 'Telefon')}</th>
                  <th>{tr('Status', 'Status')}</th>
                  <th>{tr('Password reset', 'Parol tiklash')}</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted">{tr('No accounts found.', 'Akkauntlar topilmadi.')}</td></tr>
                ) : users.map((account) => (
                  <tr key={account.id}>
                    <td className="font-semibold">{account.email}</td>
                    <td>{account.fullName || '-'}</td>
                    <td>
                      <span className="font-mono text-xs">{String(account.role).toUpperCase()}</span>
                      {String(account.role).toUpperCase() === 'FIRM' && account.firmRole ? (
                        <span className="ml-2 text-xs text-muted">{account.firmRole}</span>
                      ) : null}
                    </td>
                    <td>{account.firm?.name || (account.firmAccesses || []).map((item) => item.firm?.name).filter(Boolean).join(', ') || '-'}</td>
                    <td>{account.phone || '-'}</td>
                    <td>{account.status || 'ACTIVE'}</td>
                    <td>
                      <div className="flex min-w-[260px] items-center gap-2">
                        <input
                          type="password"
                          minLength={6}
                          value={resetDrafts[account.id] || ''}
                          onChange={(e) => setResetDrafts((drafts) => ({ ...drafts, [account.id]: e.target.value }))}
                          className="compact-control min-w-[160px]"
                          placeholder={tr('Temporary password', 'Vaqtinchalik parol')}
                        />
                        <button
                          type="button"
                          onClick={() => resetUserPassword(account)}
                          disabled={resettingUserId === account.id || (resetDrafts[account.id] || '').trim().length < 6}
                          className="inline-flex items-center gap-1 border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50"
                        >
                          <Save size={14} />
                          {resettingUserId === account.id ? tr('Saving', 'Saqlanmoqda') : tr('Confirm reset', 'Tiklashni tasdiqlash')}
                        </button>
                        <button type="button" onClick={() => setResetDrafts((drafts) => { const next = { ...drafts }; delete next[account.id]; return next; })} className="border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface">
                          {tr('Cancel', 'Bekor qilish')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <div className="glass-panel p-4">
          <h3 className="text-lg font-semibold text-foreground">{tr('Admin firm access', 'Admin firmalar accessi')}</h3>
          <div className="mt-4 space-y-4">
            {admins.length === 0 ? (
              <p className="text-sm text-muted">{tr('No admins found.', 'Adminlar topilmadi.')}</p>
            ) : admins.map((admin) => {
              const selected = currentAccess(admin);
              return (
                <div key={admin.id} className="glass-panel p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{admin.email}</div>
                      <div className="text-xs text-muted">{selected.length} {tr('firms selected', 'firma tanlangan')}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setAccessDrafts((drafts) => { const next = { ...drafts }; delete next[admin.id]; return next; })} className="border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-background">
                        {tr('Cancel', 'Bekor qilish')}
                      </button>
                      <button type="button" onClick={() => saveAccess(admin)} disabled={savingAccessId === admin.id} className="inline-flex items-center justify-center gap-2 border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-50">
                        <Save size={16} />
                        {savingAccessId === admin.id ? tr('Saving...', 'Saqlanmoqda...') : tr('Confirm access', 'Accessni tasdiqlash')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {firms.map((firm) => (
                      <label key={firm.id} className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={selected.includes(firm.id)} onChange={() => toggleAccess(admin, firm.id)} />
                        <span>{firm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
