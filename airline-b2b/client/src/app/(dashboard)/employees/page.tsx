"use client";

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AxiosError } from 'axios';

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
  const canLoadFirms = role === 'SUPERADMIN' || role === 'ADMIN';
  const employeeRoleOptions = [
    { value: 'MANAGER', label: tr('Manager', 'Menejer') },
    { value: 'KASSIR', label: tr('Kassir', 'Kassir') },
    { value: 'MONITOR', label: tr('Monitor', 'Monitor') },
    { value: 'OTHER', label: tr('Other', 'Boshqa') },
  ];

  const [draft, setDraft] = useState({ name: '', role: 'MANAGER', customRole: '', salary: '', currency: 'UZS', firmId: '' });
  const [accountDraft, setAccountDraft] = useState({ email: '', password: '', fullName: '', phone: '', firmRole: 'MANAGER' });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  const [employeeDrafts, setEmployeeDrafts] = useState<Record<string, EmployeeDraft>>({});
  const [accessDrafts, setAccessDrafts] = useState<Record<string, string[]>>({});
  const [resetDrafts, setResetDrafts] = useState<Record<string, string>>({});
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);

  const { data: firms = [] } = useQuery<FirmOption[]>({
    queryKey: ['firms'],
    queryFn: async () => (await api.get('/firms')).data,
    enabled: canLoadFirms,
  });

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => (await api.get('/employees')).data,
    enabled: canAccess,
  });

  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['auth-users'],
    queryFn: async () => (await api.get('/auth/users')).data,
    enabled: isSuperAdmin,
  });

  const admins = useMemo(() => users.filter((row) => String(row.role).toUpperCase() === 'ADMIN'), [users]);

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

    try {
      setSaving(true);
      await api.post('/employees', {
        name: draft.name.trim(),
        role: finalRole,
        salary: draft.salary.trim(),
        currency: draft.currency.trim().toUpperCase() || 'UZS',
        firmId: targetFirmId || undefined,
      });
      toast.success(tr('Employee saved', 'Hodim saqlandi'));
      setDraft({ name: '', role: 'MANAGER', customRole: '', salary: '', currency: 'UZS', firmId: '' });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to save employee', 'Hodimni saqlab bo\'lmadi'));
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (id: string) => {
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

  const createStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirmAdmin || creatingAccount) return;
    if (!accountDraft.email.trim() || !accountDraft.fullName.trim()) {
      toast.error(tr('Email and full name are required', 'Email va to\'liq ism kerak'));
      return;
    }
    if (accountDraft.password.length < 6) {
      toast.error(tr('Password must be at least 6 characters', 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'));
      return;
    }
    try {
      setCreatingAccount(true);
      await api.post('/invites', {
        email: accountDraft.email.trim(),
        password: accountDraft.password,
        fullName: accountDraft.fullName.trim(),
        phone: accountDraft.phone.trim() || undefined,
        role: 'FIRM',
        firmRole: accountDraft.firmRole,
      });
      toast.success(tr('Staff login created', 'Hodim login akkaunti yaratildi'));
      setAccountDraft({ email: '', password: '', fullName: '', phone: '', firmRole: 'MANAGER' });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to create staff login', 'Hodim loginini yaratib bo\'lmadi'));
    } finally {
      setCreatingAccount(false);
    }
  };

  const money = (value: unknown) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  const roleLabel = (value: string) => employeeRoleOptions.find((option) => option.value === value)?.label || value;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{tr('Employees', 'Hodimlar')}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr(
            'Track staff roles, salaries, and status. Employees do not need website accounts unless they also need login access.',
            'Hodimlarning roli, maoshi va statusini yuriting. Hodimlarga sayt akkaunti faqat login kerak bo\'lsa ochiladi.'
          )}
        </p>
      </div>

      {isFirmAdmin && (
        <form onSubmit={createStaffAccount} className="glass-panel compact-toolbar p-4">
          <div>
            <label className="compact-label">{tr('Login role', 'Login roli')}</label>
            <select value={accountDraft.firmRole} onChange={(e) => setAccountDraft({ ...accountDraft, firmRole: e.target.value })} className="compact-control">
              <option value="MANAGER">{tr('Manager - tickets and tours', 'Menejer - bilet va turlar')}</option>
              <option value="KASSIR">{tr('Kassir - kassa only', 'Kassir - faqat kassa')}</option>
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Full name', 'To\'liq ism')}</label>
            <input value={accountDraft.fullName} onChange={(e) => setAccountDraft({ ...accountDraft, fullName: e.target.value })} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">Email</label>
            <input type="email" value={accountDraft.email} onChange={(e) => setAccountDraft({ ...accountDraft, email: e.target.value })} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Phone', 'Telefon')}</label>
            <input value={accountDraft.phone} onChange={(e) => setAccountDraft({ ...accountDraft, phone: e.target.value })} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Initial password', 'Boshlang\'ich parol')}</label>
            <input type="password" value={accountDraft.password} onChange={(e) => setAccountDraft({ ...accountDraft, password: e.target.value })} className="compact-control" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={creatingAccount} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-ink hover:bg-primary/90 disabled:opacity-50">
              <Plus size={16} />
              {creatingAccount ? tr('Creating...', 'Yaratilmoqda...') : tr('Create login', 'Login yaratish')}
            </button>
          </div>
        </form>
      )}

      {canManageEmployees && (
      <form onSubmit={createEmployee} className="glass-panel compact-toolbar p-4">
        <div>
          <label className="compact-label">{tr('Name', 'Ism')}</label>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="compact-control" />
        </div>
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
            />
          )}
        </div>
        <div>
          <label className="compact-label">{tr('Salary', 'Maosh')}</label>
          <input inputMode="decimal" value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} className="compact-control" />
        </div>
        <div>
          <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
          <input maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} className="compact-control uppercase" />
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
            <select value={draft.firmId} onChange={(e) => setDraft({ ...draft, firmId: e.target.value })} className="compact-control">
              <option value="">{isSuperAdmin ? tr('System-wide', 'Butun system') : tr('Select firm', 'Firmani tanlang')}</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>{firm.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-ink hover:bg-primary/90 disabled:opacity-50">
            <Plus size={16} />
            {saving ? tr('Saving...', 'Saqlanmoqda...') : tr('Add', 'Qo\'shish')}
          </button>
        </div>
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
                        <button type="button" onClick={() => updateEmployee(employee)} disabled={savingEmployeeId === employee.id} className="inline-flex items-center gap-1 border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50">
                          <Save size={14} />
                          {savingEmployeeId === employee.id ? tr('Saving', 'Saqlanmoqda') : tr('Update', 'Yangilash')}
                        </button>
                        <button type="button" onClick={() => deleteEmployee(employee.id)} className="inline-flex items-center gap-1 border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/20">
                          <Trash2 size={14} />
                          {tr('Delete', 'O\'chirish')}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{tr('View only', 'Faqat ko\'rish')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                          type="text"
                          value={resetDrafts[account.id] || ''}
                          onChange={(e) => setResetDrafts((drafts) => ({ ...drafts, [account.id]: e.target.value }))}
                          className="compact-control min-w-[160px]"
                          placeholder={tr('Temporary password', 'Vaqtinchalik parol')}
                        />
                        <button
                          type="button"
                          onClick={() => resetUserPassword(account)}
                          disabled={resettingUserId === account.id}
                          className="inline-flex items-center gap-1 border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-50"
                        >
                          <Save size={14} />
                          {resettingUserId === account.id ? tr('Saving', 'Saqlanmoqda') : tr('Reset', 'Tiklash')}
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
                    <button type="button" onClick={() => saveAccess(admin)} className="inline-flex items-center justify-center gap-2 border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-background">
                      <Save size={16} />
                      {tr('Save access', 'Access saqlash')}
                    </button>
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
