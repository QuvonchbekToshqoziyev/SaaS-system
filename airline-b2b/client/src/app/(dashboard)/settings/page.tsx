/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Bell, ChevronRight, CircleUserRound, Download, ExternalLink, FileSpreadsheet, KeyRound, Lock, LogIn, MoonStar, Send, Settings2, ShieldCheck, WalletCards } from 'lucide-react';
import { defaultLoginPageContent, normalizeLoginPageContent, resolveLocalizedText, type LoginPageContent } from '@/lib/login-content';
import { downloadCsv, downloadXlsx, uzbekTemplates } from '@/lib/data-export';
import ActionButtons from '@/components/ui/ActionButtons';
import { MIN_PASSWORD_LENGTH, passwordLengthMessage } from '@/lib/password-policy';

type LocalizedFieldKey =
  | 'brandName'
  | 'sectionTagline'
  | 'heroTitle'
  | 'heroAccent'
  | 'heroDescription'
  | 'panelTitle'
  | 'panelSubtitle'
  | 'emailLabel'
  | 'passwordLabel'
  | 'submitLabel'
  | 'submittingLabel'
  | 'footerNote'
  | 'websiteLabel';

type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  username?: string | null;
  enabled: boolean;
  linkedAt?: string | null;
};

type SettingsSectionProps = {
  title: string;
  description: string;
  icon: typeof Settings2;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function SettingsSection({ title, description, icon: Icon, open, onToggle, children }: SettingsSectionProps) {
  return (
    <section className={`overflow-hidden rounded-xl border bg-surface transition ${open ? 'border-primary/40 shadow-[0_12px_35px_-24px_rgba(34,197,94,0.65)]' : 'border-border hover:border-primary/25 hover:bg-surface-2/50'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${open ? 'bg-primary text-ink' : 'bg-surface-2 text-muted'}`}><Icon size={21} /></span>
        <span className="min-w-0 flex-1"><span className="block text-base font-bold text-foreground">{title}</span><span className="mt-0.5 block text-sm text-muted">{description}</span></span>
        <ChevronRight size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90 text-primary' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} aria-hidden={!open}>
        <div className="min-h-0 overflow-hidden"><div className="border-t border-border bg-surface-2/25 p-4 sm:p-5">{children}</div></div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { tr, language } = useLanguage();
  const financeValueLabel = (value: string) => ({
    MANAGEMENT_ONLY: tr('Management accounting only', 'Faqat boshqaruv hisobi'),
    OPERATING_EXPENSE: tr('Operating expense', 'Operatsion xarajat'), EMPLOYEE_EXPENSE: tr('Employee expense', 'Xodim xarajati'), TAX_PAYMENT: tr('Tax payment', 'Soliq to‘lovi'), FINANCE_COST: tr('Finance cost', 'Moliyaviy xarajat'), ASSET_ACQUISITION: tr('Asset purchase', 'Aktiv xaridi'), LIABILITY_SETTLEMENT: tr('Liability settlement', 'Majburiyatni yopish'), PREPAYMENT: tr('Advance payment', 'Oldindan to‘lov'), OTHER_EXPENSE: tr('Other expense', 'Boshqa xarajat'),
    EXPENSE: tr('Recognize as expense', 'Xarajat sifatida hisoblash'), ASSET: tr('Recognize as asset', 'Aktiv sifatida hisoblash'), EQUITY: tr('Equity movement', 'Kapital harakati'),
    OPERATING: tr('Operating cash flow', 'Asosiy faoliyat pul oqimi'), INVESTING: tr('Investing cash flow', 'Investitsion pul oqimi'), FINANCING: tr('Financing cash flow', 'Moliyalashtirish pul oqimi'), NON_CASH: tr('No cash movement', 'Pul harakatisiz'),
    WARNING: tr('Warn, but allow', 'Ogohlantirish, lekin ruxsat berish'), REQUIRE_APPROVAL: tr('Require approval', 'Tasdiq talab qilish'), BLOCK: tr('Block the expense', 'Xarajatni bloklash'),
  } as Record<string, string>)[value] || value;

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('jetstream-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgettingDevice, setForgettingDevice] = useState(false);
  const [firms, setFirms] = useState<Array<{ id: string; name: string; currency?: string; subscriptionEndsAt?: string | null; accountingFramework?: string; accountingPolicyVersion?: string; chartOfAccountsVersion?: string; reportingStartDate?: string | null; fiscalYearStart?: number; timezone?: string }>>([]);
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [firmCurrency, setFirmCurrency] = useState('UZS');
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [rateDate, setRateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateValue, setRateValue] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [currencyRates, setCurrencyRates] = useState<Array<{ id: string; targetCurrency: string; rate: string | number; source?: string; recordedAt: string }>>([]);
  const [loginContent, setLoginContent] = useState<LoginPageContent>(defaultLoginPageContent);
  const [savedLoginContent, setSavedLoginContent] = useState<LoginPageContent>(defaultLoginPageContent);
  const [loadingLoginContent, setLoadingLoginContent] = useState(true);
  const [savingLoginContent, setSavingLoginContent] = useState(false);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [loadingExpenseCategories, setLoadingExpenseCategories] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState({ code: '', name: '', parentId: '', categoryType: 'OPERATING_EXPENSE', accountingTreatment: 'EXPENSE', financialStatementGroup: 'OPERATING_EXPENSES', cashFlowGroup: 'OPERATING' });
  const [savingCategory, setSavingCategory] = useState(false);
  const [expenseBudgets, setExpenseBudgets] = useState<any[]>([]);
  const [budgetDraft, setBudgetDraft] = useState({ expenseCategoryId: '', month: new Date().toISOString().slice(0, 7), amount: '', limitAction: 'WARNING' });
  const [policyDraft, setPolicyDraft] = useState({ accountingFramework: 'MANAGEMENT_ONLY', accountingPolicyVersion: '1', chartOfAccountsVersion: '1', reportingStartDate: '', fiscalYearStart: 1, timezone: 'Asia/Tashkent' });
  const toggleSection = (section: string) => setActiveSection((current) => current === section ? null : section);

  const forgetCurrentDevice = async () => {
    setForgettingDevice(true);
    try {
      await api.post('/auth/device/forget');
      await logout();
      toast.success(tr('This device is no longer trusted', 'Bu qurilma endi ishonchli emas'));
    } catch {
      toast.error(tr('Could not remove this device', 'Qurilmani olib tashlab bo‘lmadi'));
      setForgettingDevice(false);
    }
  };

  const role = String(user?.role || '').toUpperCase();
  const canEditAnyFirm = role === 'SUPERADMIN';
  const canEditOwnFirm = role === 'FIRM' && Boolean(user?.firmId);
  const canEditLoginContent = role === 'SUPERADMIN';
  const canManageFinancialSettings = role === 'SUPERADMIN' || (role === 'FIRM' && String(user?.firmRole || '').toUpperCase() === 'FIRM_ADMIN');
  const selectedFirm = useMemo(() => firms.find((firm) => firm.id === selectedFirmId), [firms, selectedFirmId]);
  const editorFieldClassName = 'mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition disabled:opacity-60';
  const loginContentComplete = Object.values(loginContent).every((value) => (
    typeof value === 'string'
      ? Boolean(value.trim())
      : Boolean(value.en.trim() && value.uz.trim())
  ));

  const subscriptionLabel = (value?: string | null) => {
    if (!value) return tr('No subscription date set', 'Obuna muddati belgilanmagan');
    const end = new Date(value);
    if (Number.isNaN(end.getTime())) return '-';
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (days < 0) return tr('Subscription expired', 'Obuna muddati tugagan');
    return `${days} ${tr('days left', 'kun qoldi')} (${end.toLocaleDateString()})`;
  };

  useEffect(() => {
    const loadFirms = async () => {
      if (!user) return;
      try {
        if (role === 'FIRM' && user.firmId) {
          const res = await api.get(`/firms/${user.firmId}`);
          setFirms([res.data]);
          setSelectedFirmId(res.data.id);
          setFirmCurrency(String(res.data.currency || 'UZS'));
        } else if (role === 'ADMIN' || role === 'SUPERADMIN') {
          const res = await api.get('/firms');
          const rows = Array.isArray(res.data) ? res.data : [];
          setFirms(rows);
          if (rows[0]) {
            setSelectedFirmId(rows[0].id);
            setFirmCurrency(String(rows[0].currency || 'UZS'));
          }
        }
      } catch {
        // Settings still works without firm metadata.
      }
    };
    loadFirms();
  }, [role, user]);

  useEffect(() => {
    if (selectedFirm) {
      setFirmCurrency(String(selectedFirm.currency || 'UZS'));
      setPolicyDraft({ accountingFramework: selectedFirm.accountingFramework || 'MANAGEMENT_ONLY', accountingPolicyVersion: selectedFirm.accountingPolicyVersion || '1', chartOfAccountsVersion: selectedFirm.chartOfAccountsVersion || '1', reportingStartDate: String(selectedFirm.reportingStartDate || '').slice(0, 10), fiscalYearStart: Number(selectedFirm.fiscalYearStart || 1), timezone: selectedFirm.timezone || 'Asia/Tashkent' });
    }
  }, [selectedFirm]);

  useEffect(() => {
    if (!selectedFirmId || !canManageFinancialSettings) {
      setExpenseCategories([]);
      setLoadingExpenseCategories(false);
      return;
    }
    setLoadingExpenseCategories(true);
    Promise.all([
      api.get('/expense-categories', { params: { firmId: selectedFirmId, includeInactive: true } }),
      api.get('/expense-budgets', { params: { firmId: selectedFirmId } }),
    ]).then(([categoryResponse, budgetResponse]) => {
      setExpenseCategories(Array.isArray(categoryResponse.data) ? categoryResponse.data : []);
      setExpenseBudgets(Array.isArray(budgetResponse.data) ? budgetResponse.data : []);
    }).catch(() => { setExpenseCategories([]); setExpenseBudgets([]); }).finally(() => setLoadingExpenseCategories(false));
  }, [selectedFirmId, canManageFinancialSettings]);

  useEffect(() => {
    if (!user) return;
    const loadRates = async () => {
      try {
        const res = await api.get('/currency-rates', { params: { date: rateDate, firmId: selectedFirmId || undefined, effective: true, targetCurrency: 'USD' } });
        setCurrencyRates(Array.isArray(res.data) ? res.data : []);
      } catch {
        setCurrencyRates([]);
      }
    };
    loadRates();
  }, [rateDate, selectedFirmId, user]);

  useEffect(() => {
    let cancelled = false;

    const loadLoginContent = async () => {
      if (!canEditLoginContent) {
        setLoadingLoginContent(false);
        return;
      }

      try {
        setLoadingLoginContent(true);
        const response = await api.get('/site-content/login-page');
        if (!cancelled) {
          const content = normalizeLoginPageContent(response.data?.content);
          setLoginContent(content);
          setSavedLoginContent(content);
        }
      } catch {
        if (!cancelled) {
          setLoginContent(defaultLoginPageContent);
          setSavedLoginContent(defaultLoginPageContent);
        }
      } finally {
        if (!cancelled) setLoadingLoginContent(false);
      }
    };

    loadLoginContent();

    return () => {
      cancelled = true;
    };
  }, [canEditLoginContent]);

  const loadTelegramStatus = async () => {
    try {
      const response = await api.get('/telegram/status');
      setTelegram(response.data);
    } catch {
      setTelegram(null);
    }
  };

  useEffect(() => {
    if (user) void loadTelegramStatus();
  }, [user]);

  const connectTelegram = async () => {
    try {
      setTelegramBusy(true);
      const response = await api.post('/telegram/link');
      if (response.data?.botUrl) {
        window.open(response.data.botUrl, '_blank', 'noopener,noreferrer');
        toast.success(tr('Open Telegram and press Start', 'Telegramni ochib, Start tugmasini bosing'));
      } else {
        await navigator.clipboard.writeText(`/start ${response.data.code}`);
        toast.success(tr('Link command copied. Send it to the company bot.', 'Ulash buyrug‘i nusxalandi. Uni kompaniya botiga yuboring.'));
      }
      window.setTimeout(() => void loadTelegramStatus(), 4000);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Could not create Telegram link', 'Telegram ulanishini yaratib bo‘lmadi'));
    } finally {
      setTelegramBusy(false);
    }
  };

  const toggleTelegram = async () => {
    if (!telegram) return;
    try {
      setTelegramBusy(true);
      const enabled = !telegram.enabled;
      await api.patch('/telegram/preferences', { enabled });
      setTelegram({ ...telegram, enabled });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Could not update Telegram', 'Telegram sozlamasini yangilab bo‘lmadi'));
    } finally {
      setTelegramBusy(false);
    }
  };

  const disconnectTelegram = async () => {
    try {
      setTelegramBusy(true);
      await api.delete('/telegram/connection');
      await loadTelegramStatus();
      toast.success(tr('Telegram disconnected', 'Telegram uzildi'));
    } catch {
      toast.error(tr('Could not disconnect Telegram', 'Telegramni uzib bo‘lmadi'));
    } finally {
      setTelegramBusy(false);
    }
  };

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next);
    try {
      window.localStorage.setItem('jetstream-theme', next);
    } catch {
      // ignore
    }
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  };

  const updateLocalizedField = (field: LocalizedFieldKey, languageKey: 'en' | 'uz', value: string) => {
    setLoginContent((current) => ({
      ...current,
      [field]: {
        ...current[field],
        [languageKey]: value,
      },
    }));
  };

  const updatePlainField = (field: 'emailPlaceholder' | 'passwordPlaceholder' | 'websiteUrl', value: string) => {
    setLoginContent((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveLoginContent = async () => {
    if (!canEditLoginContent) return;
    try {
      setSavingLoginContent(true);
      const response = await api.put('/site-content/login-page', { content: loginContent });
      const content = normalizeLoginPageContent(response.data?.content);
      setLoginContent(content);
      setSavedLoginContent(content);
      toast.success(tr('Login page content updated', 'Kirish sahifasi matni yangilandi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to update login page content', "Kirish sahifasi matnini yangilab bo'lmadi"));
    } finally {
      setSavingLoginContent(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword) {
      toast.error(tr('Please fill in all fields', 'Iltimos, barcha maydonlarni to\'ldiring'));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(tr(passwordLengthMessage.en, passwordLengthMessage.uz));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(tr('Passwords do not match', 'Parollar mos kelmadi'));
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(tr('Password updated', 'Parol yangilandi'));
    } catch {
      toast.error(tr('Failed to update password', 'Parolni yangilab bo\'lmadi'));
    } finally {
      setSubmitting(false);
    }
  };

  const saveDefaultCurrency = async () => {
    if (!selectedFirmId) return;
    if (!/^[A-Z]{3}$/.test(firmCurrency.trim().toUpperCase())) {
      toast.error(tr('Currency must be a 3-letter code', 'Valyuta 3 harfli kod bo\'lishi kerak'));
      return;
    }
    try {
      setSavingCurrency(true);
      await api.patch(`/firms/${selectedFirmId}`, { currency: firmCurrency.trim().toUpperCase() });
      toast.success(tr('Default currency saved', 'Default valyuta saqlandi'));
      setFirms((rows) => rows.map((firm) => firm.id === selectedFirmId ? { ...firm, currency: firmCurrency.trim().toUpperCase() } : firm));
    } catch {
      toast.error(tr('Failed to save default currency', 'Default valyutani saqlab bo\'lmadi'));
    } finally {
      setSavingCurrency(false);
    }
  };

  const saveDailyRate = async () => {
    const currency = 'USD';
    if (!rateValue.trim() || Number(rateValue) <= 0) {
      toast.error(tr('Enter exchange rate to UZS', 'UZS kursini kiriting'));
      return;
    }
    try {
      setSavingRate(true);
      await api.post('/currency-rates', {
        baseCurrency: 'UZS',
        targetCurrency: currency,
        rate: rateValue.trim(),
        date: rateDate,
        firmId: selectedFirmId || undefined,
      });
      toast.success(tr('Exchange rate saved', 'Valyuta kursi saqlandi'));
      setRateValue('');
      const res = await api.get('/currency-rates', { params: { date: rateDate, firmId: selectedFirmId || undefined, effective: true, targetCurrency: 'USD' } });
      setCurrencyRates(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to save exchange rate', 'Valyuta kursini saqlab bo\'lmadi'));
    } finally {
      setSavingRate(false);
    }
  };

  const reloadExpenseCategories = async () => {
    if (!selectedFirmId) return;
    const response = await api.get('/expense-categories', { params: { firmId: selectedFirmId, includeInactive: true } });
    setExpenseCategories(Array.isArray(response.data) ? response.data : []);
  };

  const createExpenseCategory = async () => {
    if (!selectedFirmId || !categoryDraft.code.trim() || !categoryDraft.name.trim()) return;
    try {
      setSavingCategory(true);
      await api.post('/expense-categories', { ...categoryDraft, firmId: selectedFirmId, parentId: categoryDraft.parentId || undefined });
      await reloadExpenseCategories();
      setCategoryDraft({ code: '', name: '', parentId: '', categoryType: 'OPERATING_EXPENSE', accountingTreatment: 'EXPENSE', financialStatementGroup: 'OPERATING_EXPENSES', cashFlowGroup: 'OPERATING' });
      toast.success(tr('Expense category created', 'Xarajat kategoriyasi yaratildi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to create category', 'Kategoriyani yaratib bo‘lmadi'));
    } finally { setSavingCategory(false); }
  };

  const updateExpenseCategory = async (category: any, data: Record<string, unknown>) => {
    try {
      await api.patch(`/expense-categories/${category.id}`, data);
      await reloadExpenseCategories();
      toast.success(tr('Category updated', 'Kategoriya yangilandi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to update category', 'Kategoriyani yangilab bo‘lmadi'));
    }
  };

  const deactivateExpenseCategory = async (category: any) => {
    if (!window.confirm(tr('Deactivate this category?', 'Ushbu kategoriya nofaol qilinsinmi?'))) return;
    try {
      const response = await api.delete(`/expense-categories/${category.id}`);
      await reloadExpenseCategories();
      toast.success(response.data?.message || tr('Category deactivated', 'Kategoriya nofaol qilindi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to deactivate category', 'Kategoriyani nofaol qilib bo‘lmadi'));
    }
  };

  const createExpenseBudget = async () => {
    const [year, month] = budgetDraft.month.split('-').map(Number);
    if (!selectedFirmId || !year || !month || Number(budgetDraft.amount) <= 0) return;
    try {
      setSavingCategory(true);
      const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
      await api.post('/expense-budgets', { firmId: selectedFirmId, expenseCategoryId: budgetDraft.expenseCategoryId || undefined, periodType: 'MONTHLY', periodStart, periodEnd, amount: Number(budgetDraft.amount), currency: firmCurrency, limitAction: budgetDraft.limitAction });
      const response = await api.get('/expense-budgets', { params: { firmId: selectedFirmId } });
      setExpenseBudgets(Array.isArray(response.data) ? response.data : []);
      setBudgetDraft((draft) => ({ ...draft, amount: '' }));
      toast.success(tr('Budget saved', 'Budjet saqlandi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to save budget', 'Budjetni saqlab bo‘lmadi'));
    } finally { setSavingCategory(false); }
  };

  const saveAccountingPolicy = async () => {
    if (!selectedFirmId) return;
    try {
      setSavingCategory(true);
      const response = await api.patch(`/firms/${selectedFirmId}`, policyDraft);
      setFirms((rows) => rows.map((firm) => firm.id === selectedFirmId ? { ...firm, ...response.data } : firm));
      toast.success(tr('Accounting policy saved', 'Hisob siyosati saqlandi'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to save accounting policy', 'Hisob siyosatini saqlab bo‘lmadi'));
    } finally { setSavingCategory(false); }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{tr('Settings', 'Sozlamalar')}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr('Manage your account.', 'Hisobingizni boshqaring.')}
        </p>
      </div>

      {canManageFinancialSettings && <SettingsSection title={tr('Financial settings', 'Moliyaviy sozlamalar')} description={tr('Expense categories, budgets, and reporting rules.', 'Xarajat kategoriyalari, budjetlar va hisobot qoidalari.')} icon={WalletCards} open={activeSection === 'financial'} onToggle={() => toggleSection('financial')}>
        <div className="space-y-5">
          <div className="border-l-4 border-primary pl-4">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{tr('Expense register', 'Xarajatlar registri')}</div>
            <h3 className="mt-1 text-xl font-bold text-foreground">{tr('Expense categories', 'Xarajat kategoriyalari')}</h3>
            <p className="mt-1 text-sm text-muted">{tr('Names may change; stable system codes preserve historical reports.', 'Nomlar o‘zgarishi mumkin, barqaror tizim kodlari tarixiy hisobotlarni saqlaydi.')}</p>
          </div>
          {role === 'SUPERADMIN' && <label className="block max-w-md"><span className="compact-label">{tr('Firm', 'Firma')}</span><select className="compact-control mt-1" value={selectedFirmId} onChange={(event) => setSelectedFirmId(event.target.value)}>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}</select></label>}
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div><h4 className="font-bold text-foreground">{tr('Current expense types', 'Hozirgi xarajat turlari')}</h4><p className="text-xs text-muted">{tr('The complete list for the selected firm.', 'Tanlangan firma uchun to‘liq ro‘yxat.')}</p></div>
              <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">{loadingExpenseCategories ? '…' : `${expenseCategories.length} ta`}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="excel-table min-w-[920px]"><thead><tr><th>{tr('Order', 'Tartib')}</th><th>{tr('Code', 'Kod')}</th><th>{tr('Name', 'Nomi')}</th><th>{tr('Type', 'Turi')}</th><th>{tr('Accounting', 'Hisobda')}</th><th>{tr('Cash flow', 'Pul oqimi')}</th><th>{tr('Status', 'Holat')}</th><th>{tr('Actions', 'Amallar')}</th></tr></thead><tbody>
                {expenseCategories.map((category) => <tr key={category.id} className={!category.isActive ? 'opacity-50' : ''}>
                  <td><input type="number" className="compact-control w-20" value={category.sortOrder} onChange={(event) => setExpenseCategories((rows) => rows.map((row) => row.id === category.id ? { ...row, sortOrder: Number(event.target.value) } : row))} onBlur={() => updateExpenseCategory(category, { sortOrder: category.sortOrder })} /></td>
                  <td className="font-mono text-xs font-bold">{category.code}{category.isSystemDefault ? <span className="ml-2 text-primary">{tr('SYSTEM', 'TIZIM')}</span> : null}</td>
                  <td><input className="compact-control min-w-48" value={category.name} onChange={(event) => setExpenseCategories((rows) => rows.map((row) => row.id === category.id ? { ...row, name: event.target.value } : row))} onBlur={() => updateExpenseCategory(category, { name: category.name })} /></td>
                  <td className="text-xs">{financeValueLabel(category.categoryType)}</td><td className="text-xs">{financeValueLabel(category.accountingTreatment)}</td><td className="text-xs">{financeValueLabel(category.cashFlowGroup)}</td>
                  <td><button type="button" onClick={() => updateExpenseCategory(category, { isActive: !category.isActive })} className={`rounded-full px-3 py-1 text-xs font-bold ${category.isActive ? 'bg-emerald-500/15 text-emerald-600' : 'bg-surface-2 text-muted'}`}>{category.isActive ? tr('Active', 'Faol') : tr('Inactive', 'Nofaol')}</button></td>
                  <td><button type="button" onClick={() => deactivateExpenseCategory(category)} disabled={!category.isActive} className="text-xs font-semibold text-red-600 disabled:opacity-30">{tr('Deactivate', 'Nofaol qilish')}</button></td>
                </tr>)}
                {!loadingExpenseCategories && !expenseCategories.length && <tr><td colSpan={8} className="py-8 text-center text-muted">{tr('No categories found for this firm.', 'Bu firma uchun xarajat turlari topilmadi.')}</td></tr>}
              </tbody></table>
            </div>
          </div>
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted">
            <span className="font-bold text-foreground">{tr('How it works:', 'Qanday ishlaydi:')}</span> {tr('Choose the reporting standard once. Add everyday categories below; advanced accounting fields already have safe defaults.', 'Hisobot standartini bir marta tanlang. Kundalik kategoriyalarni pastda qo‘shing; murakkab hisob maydonlari xavfsiz standart qiymatlar bilan to‘ldirilgan.')}
          </div>
          <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-6">
            <label><span className="compact-label">{tr('Framework', 'Hisobot standarti')}</span><select className="compact-control mt-1" value={policyDraft.accountingFramework} onChange={(event) => setPolicyDraft({ ...policyDraft, accountingFramework: event.target.value })}><option value="IFRS">IFRS / MXXS</option><option value="BHMS">BHMS</option><option value="MANAGEMENT_ONLY">{financeValueLabel('MANAGEMENT_ONLY')}</option></select></label>
            <label><span className="compact-label">{tr('Policy version', 'Siyosat versiyasi')}</span><input className="compact-control mt-1" value={policyDraft.accountingPolicyVersion} onChange={(event) => setPolicyDraft({ ...policyDraft, accountingPolicyVersion: event.target.value })} /></label>
            <label><span className="compact-label">{tr('Accounts version', 'Schyotlar versiyasi')}</span><input className="compact-control mt-1" value={policyDraft.chartOfAccountsVersion} onChange={(event) => setPolicyDraft({ ...policyDraft, chartOfAccountsVersion: event.target.value })} /></label>
            <label><span className="compact-label">{tr('Reporting starts', 'Hisobot boshlanishi')}</span><input type="date" className="compact-control mt-1" value={policyDraft.reportingStartDate} onChange={(event) => setPolicyDraft({ ...policyDraft, reportingStartDate: event.target.value })} /></label>
            <label><span className="compact-label">{tr('Fiscal year month', 'Moliyaviy yil oyi')}</span><input type="number" min="1" max="12" className="compact-control mt-1" value={policyDraft.fiscalYearStart} onChange={(event) => setPolicyDraft({ ...policyDraft, fiscalYearStart: Number(event.target.value) })} /></label>
            <div className="flex items-end"><button type="button" onClick={saveAccountingPolicy} disabled={savingCategory} className="min-h-10 w-full rounded-md border border-primary/40 bg-primary/10 px-3 text-sm font-bold text-primary disabled:opacity-50">{tr('Save policy', 'Siyosatni saqlash')}</button></div>
            <label className="sm:col-span-2"><span className="compact-label">{tr('Timezone', 'Vaqt zonasi')}</span><input className="compact-control mt-1" value={policyDraft.timezone} onChange={(event) => setPolicyDraft({ ...policyDraft, timezone: event.target.value })} /></label>
          </div>
          <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-4">
            <h4 className="font-bold text-foreground md:col-span-2 xl:col-span-4">{tr('Add a new expense type', 'Yangi xarajat turi qo‘shish')}</h4>
            <label><span className="compact-label">{tr('Report code', 'Hisobot kodi')}</span><input className="compact-control mt-1 uppercase" value={categoryDraft.code} onChange={(event) => setCategoryDraft({ ...categoryDraft, code: event.target.value.toUpperCase() })} placeholder="MASALAN_MARKETING" /><span className="mt-1 block text-xs text-muted">{tr('Latin letters and underscore; it does not appear in daily kassa.', 'Lotin harflari va pastki chiziq; kundalik kassada ko‘rinmaydi.')}</span></label>
            <label><span className="compact-label">{tr('Name', 'Nomi')}</span><input className="compact-control mt-1" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label>
            <label><span className="compact-label">{tr('Parent category', 'Asosiy kategoriya')}</span><select className="compact-control mt-1" value={categoryDraft.parentId} onChange={(event) => setCategoryDraft({ ...categoryDraft, parentId: event.target.value })}><option value="">—</option>{expenseCategories.filter((category) => !category.parentId && category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label><span className="compact-label">{tr('Category type', 'Kategoriya turi')}</span><select className="compact-control mt-1" value={categoryDraft.categoryType} onChange={(event) => setCategoryDraft({ ...categoryDraft, categoryType: event.target.value })}>{['OPERATING_EXPENSE', 'EMPLOYEE_EXPENSE', 'TAX_PAYMENT', 'FINANCE_COST', 'ASSET_ACQUISITION', 'LIABILITY_SETTLEMENT', 'PREPAYMENT', 'OTHER_EXPENSE'].map((value) => <option key={value} value={value}>{financeValueLabel(value)}</option>)}</select></label>
            <details className="rounded-lg border border-border bg-surface-2/50 p-3 md:col-span-2 xl:col-span-4">
              <summary className="cursor-pointer text-sm font-bold text-foreground">{tr('Advanced accounting fields', 'Qo‘shimcha buxgalteriya sozlamalari')}</summary>
              <p className="mt-1 text-xs text-muted">{tr('Change these only together with your accountant.', 'Bu maydonlarni faqat buxgalter bilan kelishib o‘zgartiring.')}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label><span className="compact-label">{tr('How to recognize it', 'Hisobda qanday aks etadi')}</span><select className="compact-control mt-1" value={categoryDraft.accountingTreatment} onChange={(event) => setCategoryDraft({ ...categoryDraft, accountingTreatment: event.target.value })}>{['EXPENSE', 'ASSET', 'LIABILITY_SETTLEMENT', 'PREPAYMENT', 'EQUITY'].map((value) => <option key={value} value={value}>{financeValueLabel(value)}</option>)}</select></label>
                <label><span className="compact-label">{tr('Statement group code', 'Hisobot bo‘limi kodi')}</span><input className="compact-control mt-1 uppercase" value={categoryDraft.financialStatementGroup} onChange={(event) => setCategoryDraft({ ...categoryDraft, financialStatementGroup: event.target.value.toUpperCase() })} /></label>
                <label><span className="compact-label">{tr('Cash-flow group', 'Pul oqimi guruhi')}</span><select className="compact-control mt-1" value={categoryDraft.cashFlowGroup} onChange={(event) => setCategoryDraft({ ...categoryDraft, cashFlowGroup: event.target.value })}>{['OPERATING', 'INVESTING', 'FINANCING', 'NON_CASH'].map((value) => <option key={value} value={value}>{financeValueLabel(value)}</option>)}</select></label>
              </div>
            </details>
            <div className="flex justify-end md:col-span-2 xl:col-span-4"><button type="button" onClick={createExpenseCategory} disabled={savingCategory || !categoryDraft.code.trim() || !categoryDraft.name.trim()} className="min-h-10 rounded-md bg-primary px-6 text-sm font-bold text-ink disabled:opacity-50">{savingCategory ? tr('Saving…', 'Saqlanmoqda…') : tr('Add category', 'Kategoriya qo‘shish')}</button></div>
          </div>
          <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div>
              <h4 className="font-bold text-foreground">{tr('Monthly expense budget', 'Oylik xarajat budjeti')}</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label><span className="compact-label">{tr('Month', 'Oy')}</span><input type="month" className="compact-control mt-1" value={budgetDraft.month} onChange={(event) => setBudgetDraft({ ...budgetDraft, month: event.target.value })} /></label>
                <label><span className="compact-label">{tr('Category', 'Kategoriya')}</span><select className="compact-control mt-1" value={budgetDraft.expenseCategoryId} onChange={(event) => setBudgetDraft({ ...budgetDraft, expenseCategoryId: event.target.value })}><option value="">{tr('General budget', 'Umumiy budjet')}</option>{expenseCategories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label><span className="compact-label">{tr('Amount', 'Summa')} ({firmCurrency})</span><input type="number" min="0.01" step="0.01" className="compact-control mt-1" value={budgetDraft.amount} onChange={(event) => setBudgetDraft({ ...budgetDraft, amount: event.target.value })} /></label>
                <label><span className="compact-label">{tr('When exceeded', 'Limit oshganda')}</span><select className="compact-control mt-1" value={budgetDraft.limitAction} onChange={(event) => setBudgetDraft({ ...budgetDraft, limitAction: event.target.value })}>{['WARNING', 'REQUIRE_APPROVAL', 'BLOCK'].map((value) => <option key={value} value={value}>{financeValueLabel(value)}</option>)}</select></label>
              </div>
              <button type="button" onClick={createExpenseBudget} disabled={savingCategory || Number(budgetDraft.amount) <= 0} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-bold text-ink disabled:opacity-50">{tr('Save budget', 'Budjetni saqlash')}</button>
            </div>
            <div className="overflow-x-auto"><table className="excel-table"><thead><tr><th>{tr('Period', 'Davr')}</th><th>{tr('Category', 'Kategoriya')}</th><th className="text-right">{tr('Amount', 'Summa')}</th><th>{tr('Rule', 'Qoida')}</th></tr></thead><tbody>{expenseBudgets.slice(0, 12).map((budget) => <tr key={budget.id}><td>{String(budget.periodStart).slice(0, 7)}</td><td>{budget.expenseCategory?.name || tr('General', 'Umumiy')}</td><td className="text-right font-mono">{Number(budget.amount).toLocaleString()} {budget.currency}</td><td className="text-xs">{financeValueLabel(budget.limitAction)}</td></tr>)}{!expenseBudgets.length && <tr><td colSpan={4} className="text-center text-muted">{tr('No budget configured.', 'Budjet belgilanmagan.')}</td></tr>}</tbody></table></div>
          </div>
        </div>
      </SettingsSection>}

      <SettingsSection title={tr('Data templates', 'Ma’lumot shablonlari')} description={tr('Download ready-to-fill Excel and CSV templates.', 'Tayyor Excel va CSV shablonlarini yuklab oling.')} icon={FileSpreadsheet} open={activeSection === 'templates'} onToggle={() => toggleSection('templates')}>
      <section className="p-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{tr('Uzbek data templates', 'O‘zbekcha ma’lumot shablonlari')}</h3>
            <p className="mt-1 text-sm text-muted">
              {tr('Download ready-to-fill templates for firms, employees, transactions, and tours.', 'Firma, hodim, tranzaksiya va turlar uchun tayyor shablonlarni yuklab oling.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void downloadXlsx('ado-malumot-shablonlari', uzbekTemplates)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary/90"
          >
            <Download size={17} /> {tr('All templates (Excel)', 'Barcha shablonlar (Excel)')}
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {uzbekTemplates.map((template) => (
            <button
              key={template.name}
              type="button"
              onClick={() => downloadCsv(`ado-${template.name.toLowerCase().replace(/\s+/g, '-')}-shablon`, template.columns, template.rows)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              <Download size={15} /> {template.name} CSV
            </button>
          ))}
        </div>
      </section>
      </SettingsSection>

      {canEditLoginContent && (
        <SettingsSection title={tr('Login page content', 'Kirish sahifasi matnlari')} description={tr('Preview and edit the public login page.', 'Ommaviy kirish sahifasini ko‘ring va tahrirlang.')} icon={LogIn} open={activeSection === 'login'} onToggle={() => toggleSection('login')}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]">
          <div className="glass-panel overflow-hidden p-0">
            <div className="grid min-h-[560px] lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative hidden overflow-hidden bg-[#030711] p-6 text-white lg:block">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,rgba(239,35,60,0.22),transparent_32%),linear-gradient(90deg,rgba(2,5,11,0.98),rgba(3,7,17,0.82))]" />
                <div className="absolute right-8 top-20 h-72 w-72 rounded-full border border-[#ff2337]/20 bg-[radial-gradient(circle,rgba(255,35,55,0.16),transparent_62%)]" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <img src="/ADO-icon.png" alt="ADO Systems" className="h-16 w-16 object-contain" />
                    <div className="leading-none">
                      <div className="text-2xl font-black tracking-[-0.03em] text-white">ADO</div>
                      <div className="mt-0.5 text-xl font-medium tracking-[-0.03em] text-white">Systems</div>
                      <div className="mt-2 text-xs font-medium text-white">
                        powered by{' '}
                        <a href={loginContent.websiteUrl} target="_blank" rel="noopener noreferrer" className="font-extrabold text-[#ff2337] underline underline-offset-2">
                          {resolveLocalizedText(loginContent.websiteLabel, language)}
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="max-w-lg">
                    <div className="mb-5 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#ff2337]">
                      <ShieldCheck size={16} />
                      {resolveLocalizedText(loginContent.sectionTagline, language)}
                    </div>
                    <h3 className="text-4xl font-bold leading-tight tracking-normal xl:text-5xl">
                      {resolveLocalizedText(loginContent.heroTitle, language)} <span className="text-[#ff2337]">{resolveLocalizedText(loginContent.heroAccent, language)}</span>
                    </h3>
                    <div className="mt-4 h-1 w-10 rounded-full bg-[#ff2337]" />
                    <p className="mt-4 text-base leading-7 text-[#b8b1a5]">
                      {resolveLocalizedText(loginContent.heroDescription, language)}
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#202a38] bg-[#0d121d]/95 p-4">
                    <div className="flex items-center gap-3">
                      <Lock size={24} className="text-[#ff2337]" />
                      <div>
                        <div className="text-xs font-bold text-white">{tr('Your trust is our responsibility.', 'Sizning ishonchingiz - bizning majburiyatimiz.')}</div>
                        <div className="mt-1 text-[11px] text-[#8f98aa]">{tr('Protected platform preview.', 'Himoyalangan platforma previewi.')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center bg-[#070b15] px-5 py-8 text-white">
                <div className="w-full max-w-[390px]">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h3 className="mt-2 text-3xl font-bold tracking-normal text-white">
                        {resolveLocalizedText(loginContent.panelTitle, language)}
                      </h3>
                      <p className="mt-2 text-sm text-[#a8a29a]">{resolveLocalizedText(loginContent.panelSubtitle, language)}</p>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border border-[#263144] bg-[#101520] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.45)]">
                    <div>
                      <label className="mb-2 block text-xs font-bold text-[#d7d2c9]">
                        {resolveLocalizedText(loginContent.emailLabel, language)}
                      </label>
                      <input disabled value={loginContent.emailPlaceholder} className="block min-h-11 w-full rounded-md border border-[#263144] bg-[#070b15] px-3 text-sm text-white outline-none" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold text-[#d7d2c9]">
                        {resolveLocalizedText(loginContent.passwordLabel, language)}
                      </label>
                      <input disabled value={loginContent.passwordPlaceholder} className="block min-h-11 w-full rounded-md border border-[#263144] bg-[#070b15] px-3 text-sm tracking-widest text-white outline-none" />
                    </div>
                    <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#ff162d] to-[#b90919] px-4 text-sm font-bold text-white">
                      <LogIn size={18} />
                      {resolveLocalizedText(loginContent.submitLabel, language)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{tr('Login page editor', 'Kirish sahifasi editori')}</h3>
              <p className="mt-2 text-sm text-muted">
                {tr('Only superadmin can change the public login page content.', 'Public login sahifasini faqat superadmin o‘zgartira oladi.')}
              </p>
            </div>
            <ActionButtons
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Confirm', 'Tasdiqlash')}
              busyLabel={tr('Saving...', 'Saqlanmoqda...')}
              busy={savingLoginContent}
              canConfirm={canEditLoginContent && !loadingLoginContent && loginContentComplete}
              onCancel={() => setLoginContent(savedLoginContent)}
              onConfirm={saveLoginContent}
            />
          </div>

          <div className="mt-6 max-h-[720px] space-y-6 overflow-y-auto pr-1">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">{tr('Brand and hero', 'Brend va hero')}</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {([
                  ['brandName', 'Brand name', 'Brend nomi'],
                  ['sectionTagline', 'Tagline', 'Tagline'],
                  ['heroTitle', 'Hero title', 'Hero sarlavha'],
                  ['heroAccent', 'Hero accent', 'Hero urg‘u'],
                ] as const).map(([field, enLabel, uzLabel]) => (
                  <div key={field} className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <label className="block text-sm font-medium text-muted">
                      {tr(`${enLabel} (EN)`, `${uzLabel} (EN)`)}
                      <input value={loginContent[field].en} onChange={(e) => updateLocalizedField(field, 'en', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                    </label>
                    <label className="block text-sm font-medium text-muted">
                      {tr(`${enLabel} (UZ)`, `${uzLabel} (UZ)`)}
                      <input value={loginContent[field].uz} onChange={(e) => updateLocalizedField(field, 'uz', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                    </label>
                  </div>
                ))}
                <label className="block text-sm font-medium text-muted md:col-span-2">
                  {tr('Hero description (EN)', 'Hero tavsif (EN)')}
                  <textarea value={loginContent.heroDescription.en} onChange={(e) => updateLocalizedField('heroDescription', 'en', e.target.value)} className={editorFieldClassName} rows={3} disabled={!canEditLoginContent} />
                </label>
                <label className="block text-sm font-medium text-muted md:col-span-2">
                  {tr('Hero description (UZ)', 'Hero tavsif (UZ)')}
                  <textarea value={loginContent.heroDescription.uz} onChange={(e) => updateLocalizedField('heroDescription', 'uz', e.target.value)} className={editorFieldClassName} rows={3} disabled={!canEditLoginContent} />
                </label>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">{tr('Login form', 'Login forma')}</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {([
                  ['panelTitle', 'Panel title', 'Panel sarlavha'],
                  ['panelSubtitle', 'Panel subtitle', 'Panel pastki matn'],
                  ['emailLabel', 'Email label', 'Email yorliq'],
                  ['passwordLabel', 'Password label', 'Parol yorliq'],
                  ['submitLabel', 'Button label', 'Tugma matni'],
                  ['submittingLabel', 'Loading label', 'Yuklanish matni'],
                  ['footerNote', 'Footer note', 'Footer matni'],
                ] as const).map(([field, enLabel, uzLabel]) => (
                  <div key={field} className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <label className="block text-sm font-medium text-muted">
                      {tr(`${enLabel} (EN)`, `${uzLabel} (EN)`)}
                      <input value={loginContent[field].en} onChange={(e) => updateLocalizedField(field, 'en', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                    </label>
                    <label className="block text-sm font-medium text-muted">
                      {tr(`${enLabel} (UZ)`, `${uzLabel} (UZ)`)}
                      <input value={loginContent[field].uz} onChange={(e) => updateLocalizedField(field, 'uz', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                    </label>
                  </div>
                ))}
                <label className="block text-sm font-medium text-muted">
                  {tr('Email placeholder', 'Email placeholder')}
                  <input value={loginContent.emailPlaceholder} onChange={(e) => updatePlainField('emailPlaceholder', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                </label>
                <label className="block text-sm font-medium text-muted">
                  {tr('Password placeholder', 'Parol placeholder')}
                  <input value={loginContent.passwordPlaceholder} onChange={(e) => updatePlainField('passwordPlaceholder', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                </label>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">{tr('Website link', 'Veb-sayt havolasi')}</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-medium text-muted">
                  {tr('Link label (EN)', 'Havola matni (EN)')}
                  <input value={loginContent.websiteLabel.en} onChange={(e) => updateLocalizedField('websiteLabel', 'en', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                </label>
                <label className="block text-sm font-medium text-muted">
                  {tr('Link label (UZ)', 'Havola matni (UZ)')}
                  <input value={loginContent.websiteLabel.uz} onChange={(e) => updateLocalizedField('websiteLabel', 'uz', e.target.value)} className={editorFieldClassName} disabled={!canEditLoginContent} />
                </label>
                <label className="block text-sm font-medium text-muted md:col-span-2">
                  {tr('Website URL', 'Veb-sayt manzili')}
                  <input type="url" value={loginContent.websiteUrl} onChange={(e) => updatePlainField('websiteUrl', e.target.value)} placeholder="https://ado-finance.com" className={editorFieldClassName} disabled={!canEditLoginContent} />
                </label>
              </div>
            </div>
          </div>
        </div>
        </SettingsSection>
      )}

      <SettingsSection title={tr('Appearance', 'Ko‘rinish')} description={tr('Choose the dashboard color theme.', 'Dashboard rang mavzusini tanlang.')} icon={MoonStar} open={activeSection === 'theme'} onToggle={() => toggleSection('theme')}>
      <div className="p-1">
        <h3 className="text-lg font-semibold text-foreground">{tr('Theme', 'Mavzu')}</h3>
        <p className="mt-2 text-sm text-muted">
          {tr('Choose how the dashboard looks.', 'Dashboard ko\'rinishini tanlang.')}
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => applyTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={`px-4 py-2 text-sm font-medium transition ${theme === 'dark'
              ? 'bg-surface text-foreground'
              : 'bg-transparent text-muted hover:bg-surface'
            }`}
          >
            {tr('Dark', 'Qorong\'i')}
          </button>
          <button
            type="button"
            onClick={() => applyTheme('light')}
            aria-pressed={theme === 'light'}
            className={`px-4 py-2 text-sm font-medium transition ${theme === 'light'
              ? 'bg-surface text-foreground'
              : 'bg-transparent text-muted hover:bg-surface'
            }`}
          >
            {tr('Light', 'Yorug\'')}
          </button>
        </div>
      </div>
      </SettingsSection>

      <SettingsSection title={tr('Account information', 'Hisob ma’lumotlari')} description={tr('View your email, role and subscription.', 'Email, rol va obuna ma’lumotlarini ko‘ring.')} icon={CircleUserRound} open={activeSection === 'account'} onToggle={() => toggleSection('account')}>
      <div className="p-1">
        <h3 className="text-lg font-semibold text-foreground">{tr('Account', 'Hisob')}</h3>
        <p className="mt-2 text-sm text-foreground">
          <span className="text-muted">{tr('Email', 'Email')}:</span> {user?.email}
        </p>
        <p className="mt-1 text-sm text-foreground">
          <span className="text-muted">{tr('Role', 'Rol')}:</span> {user?.role}
        </p>
        {selectedFirm && (
          <p className="mt-1 text-sm text-foreground">
            <span className="text-muted">{tr('Subscription', 'Obuna')}:</span> {subscriptionLabel(selectedFirm.subscriptionEndsAt)}
          </p>
        )}
      </div>
      </SettingsSection>

      <SettingsSection title="Telegram" description={tr('Connect notifications to the company bot.', 'Bildirishnomalarni kompaniya botiga ulang.')} icon={Send} open={activeSection === 'telegram'} onToggle={() => toggleSection('telegram')}>
      <div className="p-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#229ED9]/15 text-[#229ED9]"><Send size={21} /></div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Telegram</h3>
              <p className="mt-1 text-sm text-muted">{tr('Receive your ADO notifications in the company bot.', 'ADO bildirishnomalarini kompaniya botida oling.')}</p>
              {telegram?.connected && (
                <p className="mt-2 text-sm text-foreground">
                  {telegram.username ? `@${telegram.username}` : tr('Telegram connected', 'Telegram ulangan')}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${telegram.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-surface-2 text-muted'}`}>
                    {telegram.enabled ? tr('Active', 'Faol') : tr('Paused', 'To‘xtatilgan')}
                  </span>
                </p>
              )}
            </div>
          </div>
          {!telegram?.connected ? (
            <button type="button" onClick={connectTelegram} disabled={telegramBusy || telegram?.configured === false} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              <ExternalLink size={17} />
              {telegramBusy ? tr('Opening...', 'Ochilmoqda...') : tr('Connect Telegram', 'Telegramni ulash')}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleTelegram} disabled={telegramBusy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm font-semibold text-foreground disabled:opacity-50">
                <Bell size={16} />{telegram.enabled ? tr('Pause', 'To‘xtatish') : tr('Enable', 'Yoqish')}
              </button>
              <button type="button" onClick={disconnectTelegram} disabled={telegramBusy} className="min-h-10 rounded-lg border border-red-500/25 px-3 text-sm font-semibold text-red-500 disabled:opacity-50">
                {tr('Disconnect', 'Uzish')}
              </button>
            </div>
          )}
        </div>
        {telegram?.configured === false && <p className="mt-3 text-sm text-amber-500">{tr('Telegram bot is not configured on this server yet.', 'Bu serverda Telegram bot hali sozlanmagan.')}</p>}
      </div>
      </SettingsSection>

      <SettingsSection title={tr('Firm defaults', 'Firma asosiy sozlamalari')} description={tr('Select the firm and its default currency.', 'Firma va uning asosiy valyutasini tanlang.')} icon={Settings2} open={activeSection === 'firm'} onToggle={() => toggleSection('firm')}>
      <div className="p-1">
        <h3 className="text-lg font-semibold text-foreground">{tr('Firm defaults', 'Firma default sozlamalari')}</h3>
        <p className="mt-2 text-sm text-muted">
          {tr('Reports and new financial entries use this currency unless another currency is selected.', 'Hisobotlar va yangi moliyaviy yozuvlar boshqa valyuta tanlanmasa shu valyutadan foydalanadi.')}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
          <div>
            <label className="compact-label">{tr('Firm', 'Firma')}</label>
            <select value={selectedFirmId} onChange={(e) => setSelectedFirmId(e.target.value)} className="compact-control" disabled={role === 'FIRM'}>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>{firm.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="compact-label">{tr('Default currency', 'Default valyuta')}</label>
            <input
              value={firmCurrency}
              maxLength={3}
              onChange={(e) => setFirmCurrency(e.target.value.toUpperCase())}
              className="compact-control uppercase"
              disabled={!canEditAnyFirm && !canEditOwnFirm}
            />
          </div>
          {(canEditAnyFirm || canEditOwnFirm) && (
            <ActionButtons
              className="md:col-span-3"
              cancelLabel={tr('Cancel', 'Bekor qilish')}
              confirmLabel={tr('Confirm', 'Tasdiqlash')}
              busyLabel={tr('Saving...', 'Saqlanmoqda...')}
              busy={savingCurrency}
              canConfirm={Boolean(selectedFirmId && /^[A-Z]{3}$/.test(firmCurrency.trim().toUpperCase()))}
              onCancel={() => setFirmCurrency(String(selectedFirm?.currency || 'UZS'))}
              onConfirm={saveDefaultCurrency}
            />
          )}
        </div>
        {selectedFirm && (
          <p className="mt-3 text-sm text-muted">
            {tr('Subscription', 'Obuna')}: {subscriptionLabel(selectedFirm.subscriptionEndsAt)}
          </p>
        )}
      </div>
      </SettingsSection>

      <SettingsSection title={tr('Exchange rates', 'Valyuta kurslari')} description={tr('Set the daily USD to UZS rate.', 'Kunlik USD–UZS kursini kiriting.')} icon={WalletCards} open={activeSection === 'rates'} onToggle={() => toggleSection('rates')}>
      <div className="p-1">
        <h3 className="text-lg font-semibold text-foreground">{tr('Daily exchange rates', 'Kunlik valyuta kurslari')}</h3>
        <p className="mt-2 text-sm text-muted">
          {tr('Non-UZS payments and kassa transactions use this rate by default; each entry can still override it.', 'UZSdan boshqa to\'lov va kassa tranzaksiyalari default shu kursdan foydalanadi; har bir yozuvda alohida o\'zgartirish mumkin.')}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[160px_140px_180px_auto] md:items-end">
          <div>
            <label className="compact-label">{tr('Date', 'Sana')}</label>
            <input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} className="compact-control" />
          </div>
          <div>
            <label className="compact-label">{tr('Currency', 'Valyuta')}</label>
            <input value="USD" readOnly className="compact-control uppercase" />
          </div>
          <div>
            <label className="compact-label">{tr('Rate to UZS', 'UZS kursi')}</label>
            <input inputMode="decimal" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className="compact-control" placeholder={currencyRates[0] ? Number(currencyRates[0].rate).toLocaleString('en-US') : '12600'} />
          </div>
          <ActionButtons
            className="md:col-span-4"
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Confirm', 'Tasdiqlash')}
            busyLabel={tr('Saving...', 'Saqlanmoqda...')}
            busy={savingRate}
            canConfirm={Boolean(rateDate && Number(rateValue) > 0)}
            onCancel={() => setRateValue('')}
            onConfirm={saveDailyRate}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {currencyRates.length === 0 ? (
            <span className="text-sm text-muted">{tr('No rates saved for this date.', 'Bu sana uchun kurs saqlanmagan.')}</span>
          ) : currencyRates.map((rate) => (
            <span key={rate.id} className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-mono">
              {rate.targetCurrency}: {Number(rate.rate).toLocaleString('en-US')} UZS · {new Date(rate.recordedAt).toISOString().slice(0, 10)}
            </span>
          ))}
        </div>
      </div>
      </SettingsSection>

      <SettingsSection title={tr('Security', 'Xavfsizlik')} description={tr('Manage your password and trusted device.', 'Parol va ishonchli qurilmani boshqaring.')} icon={KeyRound} open={activeSection === 'password'} onToggle={() => toggleSection('password')}>
      <div className="p-1">
        <h3 className="text-lg font-semibold text-foreground mb-4">{tr('Change password', 'Parolni almashtirish')}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Current password', 'Joriy parol')}</label>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
              minLength={6}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition placeholder:text-muted"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('New password', 'Yangi parol')}</label>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              minLength={6}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition placeholder:text-muted"
              placeholder={tr('At least 6 characters', 'Kamida 6 ta belgi')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Confirm new password', 'Yangi parolni tasdiqlang')}</label>
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              minLength={6}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition placeholder:text-muted"
              placeholder={tr('Repeat new password', 'Yangi parolni qayta kiriting')}
              required
            />
          </div>

          <ActionButtons
            cancelLabel={tr('Cancel', 'Bekor qilish')}
            confirmLabel={tr('Confirm', 'Tasdiqlash')}
            busyLabel={tr('Updating...', 'Yangilanmoqda...')}
            busy={submitting}
            canConfirm={newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword}
            onCancel={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
          />
        </form>

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-base font-semibold text-foreground">{tr('Trusted device', 'Ishonchli qurilma')}</h3>
          <button
            type="button"
            disabled={forgettingDevice}
            onClick={forgetCurrentDevice}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-500/30 px-4 text-sm font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldCheck size={18} />
            {forgettingDevice ? tr('Removing...', 'Olib tashlanmoqda...') : tr('Forget this device and sign out', 'Bu qurilmani unutish va chiqish')}
          </button>
        </div>
      </div>
      </SettingsSection>
    </div>
  );
}
