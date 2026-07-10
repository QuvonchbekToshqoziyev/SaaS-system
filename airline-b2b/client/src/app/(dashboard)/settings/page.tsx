"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Lock, LogIn, Save, ShieldCheck } from 'lucide-react';
import { defaultLoginPageContent, normalizeLoginPageContent, resolveLocalizedText, type LoginPageContent } from '@/lib/login-content';

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
  | 'footerNote';

export default function SettingsPage() {
  const { user } = useAuth();
  const { tr, language } = useLanguage();

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('jetstream-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [firms, setFirms] = useState<Array<{ id: string; name: string; currency?: string; subscriptionEndsAt?: string | null }>>([]);
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [firmCurrency, setFirmCurrency] = useState('UZS');
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [rateDate, setRateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateCurrency, setRateCurrency] = useState('USD');
  const [rateValue, setRateValue] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [currencyRates, setCurrencyRates] = useState<Array<{ id: string; targetCurrency: string; rate: string | number; source?: string; recordedAt: string }>>([]);
  const [loginContent, setLoginContent] = useState<LoginPageContent>(defaultLoginPageContent);
  const [loadingLoginContent, setLoadingLoginContent] = useState(true);
  const [savingLoginContent, setSavingLoginContent] = useState(false);

  const role = String(user?.role || '').toUpperCase();
  const canEditAnyFirm = role === 'SUPERADMIN';
  const canEditOwnFirm = role === 'FIRM' && Boolean(user?.firmId);
  const canEditLoginContent = role === 'SUPERADMIN';
  const selectedFirm = useMemo(() => firms.find((firm) => firm.id === selectedFirmId), [firms, selectedFirmId]);
  const editorFieldClassName = 'mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted outline-none focus:border-primary transition disabled:opacity-60';

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
    if (selectedFirm) setFirmCurrency(String(selectedFirm.currency || 'UZS'));
  }, [selectedFirm]);

  useEffect(() => {
    if (!user) return;
    const loadRates = async () => {
      try {
        const res = await api.get('/currency-rates', { params: { date: rateDate } });
        setCurrencyRates(Array.isArray(res.data) ? res.data : []);
      } catch {
        setCurrencyRates([]);
      }
    };
    loadRates();
  }, [rateDate, user]);

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
        if (!cancelled) setLoginContent(normalizeLoginPageContent(response.data?.content));
      } catch {
        if (!cancelled) setLoginContent(defaultLoginPageContent);
      } finally {
        if (!cancelled) setLoadingLoginContent(false);
      }
    };

    loadLoginContent();

    return () => {
      cancelled = true;
    };
  }, [canEditLoginContent]);

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

  const updatePlainField = (field: 'emailPlaceholder' | 'passwordPlaceholder', value: string) => {
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
      setLoginContent(normalizeLoginPageContent(response.data?.content));
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
    if (newPassword.length < 6) {
      toast.error(tr('Password must be at least 6 characters', "Parol kamida 6 ta belgidan iborat bo'lishi kerak"));
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
    const currency = rateCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || currency === 'UZS') {
      toast.error(tr('Choose a non-UZS currency code', 'UZSdan boshqa valyuta kodini tanlang'));
      return;
    }
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
      });
      toast.success(tr('Exchange rate saved', 'Valyuta kursi saqlandi'));
      setRateValue('');
      const res = await api.get('/currency-rates', { params: { date: rateDate } });
      setCurrencyRates(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || tr('Failed to save exchange rate', 'Valyuta kursini saqlab bo\'lmadi'));
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{tr('Settings', 'Sozlamalar')}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr('Manage your account.', 'Hisobingizni boshqaring.')}
        </p>
      </div>

      {canEditLoginContent && (
        <>
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
                        powered by <span className="font-extrabold text-[#ff2337]">ADO-FINANCE</span>
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
            <button
              type="button"
              onClick={saveLoginContent}
              disabled={!canEditLoginContent || savingLoginContent || loadingLoginContent}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold uppercase tracking-wider text-ink transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} />
              {savingLoginContent ? tr('Saving...', 'Saqlanmoqda...') : tr('Save', 'Saqlash')}
            </button>
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
          </div>
        </div>
        </>
      )}

      <div className="glass-panel p-6">
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

      <div className="glass-panel p-6">
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

      <div className="glass-panel p-6">
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
            <button
              type="button"
              onClick={saveDefaultCurrency}
              disabled={savingCurrency || !selectedFirmId}
              className="inline-flex items-center justify-center px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
            >
              {savingCurrency ? tr('Saving...', 'Saqlanmoqda...') : tr('Save', 'Saqlash')}
            </button>
          )}
        </div>
        {selectedFirm && (
          <p className="mt-3 text-sm text-muted">
            {tr('Subscription', 'Obuna')}: {subscriptionLabel(selectedFirm.subscriptionEndsAt)}
          </p>
        )}
      </div>

      <div className="glass-panel p-6">
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
            <input value={rateCurrency} maxLength={3} onChange={(e) => setRateCurrency(e.target.value.toUpperCase())} className="compact-control uppercase" />
          </div>
          <div>
            <label className="compact-label">{tr('Rate to UZS', 'UZS kursi')}</label>
            <input inputMode="decimal" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className="compact-control" placeholder="12600" />
          </div>
          <button
            type="button"
            onClick={saveDailyRate}
            disabled={savingRate}
            className="inline-flex items-center justify-center px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
          >
            {savingRate ? tr('Saving...', 'Saqlanmoqda...') : tr('Save rate', 'Kursni saqlash')}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {currencyRates.length === 0 ? (
            <span className="text-sm text-muted">{tr('No rates saved for this date.', 'Bu sana uchun kurs saqlanmagan.')}</span>
          ) : currencyRates.map((rate) => (
            <span key={rate.id} className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-mono">
              {rate.targetCurrency}: {Number(rate.rate).toLocaleString('en-US')} UZS
            </span>
          ))}
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">{tr('Change password', 'Parolni almashtirish')}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">{tr('Current password', 'Joriy parol')}</label>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
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
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-foreground outline-none focus:border-primary transition placeholder:text-muted"
              placeholder={tr('Repeat new password', 'Yangi parolni qayta kiriting')}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-bold uppercase tracking-wider rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? tr('Updating...', 'Yangilanmoqda...') : tr('Update password', 'Parolni yangilash')}
          </button>
        </form>
      </div>
    </div>
  );
}
