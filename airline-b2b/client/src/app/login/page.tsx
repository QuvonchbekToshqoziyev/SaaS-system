"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CircleCheck, Eye, Lock, Mail, ShieldCheck, UserCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';
import type { AxiosError } from 'axios';
import { defaultLoginPageContent, normalizeLoginPageContent, resolveLocalizedText, type LoginPageContent } from '@/lib/login-content';

type ApiErrorResponse = { error?: string };

function apiErrorMessage(err: unknown): string | undefined {
  return (err as AxiosError<ApiErrorResponse>)?.response?.data?.error;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaTicket, setMfaTicket] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<LoginPageContent>(defaultLoginPageContent);
  const router = useRouter();
  const { login, savedAccounts, switchAccount, forgetAccount } = useAuth();
  const { tr, language } = useLanguage();

  const goToUserHome = (nextUser: { role?: unknown; firmRole?: unknown }) => {
    const role = String(nextUser?.role || '').toLowerCase();
    if (role === 'firm') {
      router.push(String(nextUser?.firmRole || '').toUpperCase() === 'KASSIR' ? '/kassa' : '/firm');
    } else {
      router.push('/admin');
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadContent = async () => {
      try {
        const response = await api.get('/site-content/login-page');
        if (!cancelled) setContent(normalizeLoginPageContent(response.data?.content));
      } catch {
        if (!cancelled) setContent(defaultLoginPageContent);
      }
    };

    loadContent();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = mfaTicket
        ? await api.post(useRecoveryCode ? '/auth/mfa/recovery' : '/auth/mfa/verify', {
          mfaTicket,
          code: useRecoveryCode ? undefined : mfaCode,
          recoveryCode: useRecoveryCode ? mfaCode : undefined,
          sessionTransport: 'cookie',
        })
        : await api.post('/auth/login', { email, password, sessionTransport: 'cookie' });
      if (res.data?.mfaRequired && res.data?.mfaTicket) {
        setMfaTicket(res.data.mfaTicket);
        setMfaCode('');
        toast.success(tr('Enter your verification code', 'Tasdiqlash kodini kiriting'));
        return;
      }
      const { user } = res.data;
      login(user);
      if (res.data?.mfaSetupRequired) {
        router.push('/security/mfa-setup');
        return;
      }
      toast.success(tr('Logged in successfully', 'Muvaffaqiyatli kirdik'));
      goToUserHome(user);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Login failed', 'Kirishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#02050a] text-white font-outfit lg:h-screen lg:overflow-hidden">
      <main className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-[#030710] px-4 py-5 sm:px-10 lg:h-screen lg:px-12 lg:py-7 xl:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_47%_42%,rgba(235,12,33,0.2),transparent_23%),radial-gradient(circle_at_70%_72%,rgba(152,8,21,0.13),transparent_28%),linear-gradient(120deg,#040812_0%,#050915_42%,#02050b_100%)]" />
        <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(239,35,60,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(239,35,60,0.12)_1px,transparent_1px)] [background-size:96px_96px] [mask-image:radial-gradient(circle_at_48%_45%,black,transparent_58%)]" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <img src="/ADO-icon.png" alt="ADO Systems" className="h-16 w-16 object-contain sm:h-[108px] sm:w-[108px] lg:h-[122px] lg:w-[122px]" />
              <div className="leading-none">
                <div className="text-3xl font-black tracking-normal text-white sm:text-[2.8rem] lg:text-[3.2rem]">ADO</div>
                <div className="mt-1 text-2xl font-medium tracking-normal text-white sm:text-[2.35rem] lg:text-[2.7rem]">Systems</div>
                <div className="mt-2 text-xs font-medium text-white sm:mt-3 sm:text-lg">
                  powered by{' '}
                  <a
                    href={content.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-extrabold text-[#ff2337] underline decoration-[#ff2337]/50 underline-offset-4 transition hover:text-[#ff5969]"
                  >
                    {resolveLocalizedText(content.websiteLabel, language)}
                  </a>
                </div>
              </div>
            </div>
            <ThemeLanguageSwitcher />
          </div>

          <section className="grid min-h-0 flex-1 gap-5 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,576px)] lg:items-center lg:gap-8 lg:pt-0 xl:gap-12">
            <div className="relative hidden min-h-[560px] lg:block lg:min-h-0 lg:self-stretch">
              <div className="relative z-10 max-w-[620px] pt-10 lg:pt-16 xl:pt-20">
                <div className="mb-7 inline-flex items-center gap-3 text-base font-medium uppercase tracking-[0.08em] text-[#ff3046]">
                  <ShieldCheck size={28} strokeWidth={1.9} />
                  {resolveLocalizedText(content.sectionTagline, language)}
                </div>

                <h1 className="text-[clamp(3.4rem,6vw,5.35rem)] font-black leading-[0.96] tracking-normal text-white">
                  {resolveLocalizedText(content.heroTitle, language)}
                  <span className="mt-4 block text-[#e51428]">{resolveLocalizedText(content.heroAccent, language)}</span>
                </h1>
                <div className="mt-8 h-1 w-[72px] rounded-full bg-[#e51428]" />
                <p className="mt-8 max-w-[600px] text-[1.08rem] leading-8 text-[#d5d9e2]">
                  {resolveLocalizedText(content.heroDescription, language)}
                </p>
              </div>

              <div className="pointer-events-none absolute right-[2%] top-[20%] hidden h-[390px] w-[390px] lg:block xl:right-[5%] xl:h-[440px] xl:w-[440px]">
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(229,20,40,0.18),transparent_58%)]" />
                <div className="absolute inset-x-10 bottom-8 h-28 rounded-[50%] border border-[#e51428]/35 shadow-[0_0_70px_rgba(229,20,40,0.42)]" />
                <div className="absolute left-1/2 top-16 h-56 w-48 -translate-x-1/2 rounded-[2rem] border border-[#ef4052]/45 bg-gradient-to-b from-[#232530] via-[#151822] to-[#070a12] shadow-[0_34px_90px_rgba(229,20,40,0.32)] [clip-path:polygon(50%_0%,88%_14%,82%_74%,50%_100%,18%_74%,12%_14%)] xl:h-64 xl:w-56">
                  <div className="absolute inset-[1px] bg-gradient-to-br from-white/10 via-transparent to-black/40" />
                  <CircleCheck className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 text-[#e51428] drop-shadow-[0_0_28px_rgba(229,20,40,0.8)] xl:h-28 xl:w-28" strokeWidth={2.8} />
                </div>
                <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(229,20,40,0.55)_1.5px,transparent_2px)] [background-size:62px_52px] opacity-60" />
              </div>

              <div className="relative z-10 mt-8 flex max-w-[520px] items-center gap-4 text-[#8f98aa] lg:absolute lg:bottom-4 lg:left-0 lg:mt-0">
                <Lock className="h-6 w-6 shrink-0" />
                <div>
                  <div className="text-sm">{tr('Your trust is our responsibility.', 'Sizning ishonchingiz — bizning majburiyatimiz.')}</div>
                  <div className="mt-1 text-sm">{tr('Protected platform with the most advanced technologies.', 'Eng ilg‘or texnologiyalar bilan himoyalangan platforma.')}</div>
                </div>
              </div>
            </div>

            <div className="w-full rounded-none border border-[#273142] bg-[#070b15]/72 p-4 shadow-[0_28px_120px_rgba(0,0,0,0.46)] backdrop-blur-xl sm:rounded-[1.375rem] sm:p-10 lg:self-center xl:p-11">
              <div className="mb-6 sm:mb-10">
                <h2 className="text-2xl font-black tracking-normal text-white sm:text-[2rem]">
                  {resolveLocalizedText(content.panelTitle, language)}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#b2b8c5] sm:mt-4 sm:text-base">
                  {resolveLocalizedText(content.panelSubtitle, language)}
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="sr-only" htmlFor="email-address">{resolveLocalizedText(content.emailLabel, language)}</label>
                  <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[#273142] bg-[#111622]/78 px-4 text-[#a4abb8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[#ff2337] sm:min-h-[72px] sm:gap-4 sm:px-5">
                    <Mail size={22} />
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      required
                      className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[#a4abb8]"
                      placeholder={content.emailPlaceholder || resolveLocalizedText(content.emailLabel, language)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="sr-only" htmlFor="password">{resolveLocalizedText(content.passwordLabel, language)}</label>
                  <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[#273142] bg-[#111622]/78 px-4 text-[#a4abb8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[#ff2337] sm:min-h-[72px] sm:gap-4 sm:px-5">
                    <Lock size={22} />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[#a4abb8]"
                      placeholder={content.passwordPlaceholder || resolveLocalizedText(content.passwordLabel, language)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-[#a4abb8] transition hover:text-white" aria-label={tr('Show password', 'Parolni ko‘rsatish')}>
                      <Eye size={22} />
                    </button>
                  </div>
                </div>

                {mfaTicket && (
                  <div>
                    <label className="sr-only" htmlFor="mfa-code">{useRecoveryCode ? tr('Recovery code', 'Tiklash kodi') : tr('MFA code', 'MFA kodi')}</label>
                    <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[#273142] bg-[#111622]/78 px-4 text-[#a4abb8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus-within:border-[#ff2337] sm:min-h-[72px] sm:gap-4 sm:px-5">
                      <ShieldCheck size={22} />
                      <input
                        id="mfa-code"
                        name="mfa-code"
                        required
                        className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[#a4abb8]"
                        placeholder={useRecoveryCode ? tr('Recovery code', 'Tiklash kodi') : tr('6-digit code', '6 xonali kod')}
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                      />
                    </div>
                    <button type="button" onClick={() => setUseRecoveryCode((value) => !value)} className="mt-3 text-sm text-[#aeb4c0] transition hover:text-white">
                      {useRecoveryCode ? tr('Use authenticator code', 'Authenticator kodidan foydalanish') : tr('Use recovery code', 'Tiklash kodidan foydalanish')}
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-3 text-sm text-[#aeb4c0] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <label className="inline-flex items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 rounded border-[#303a4f] bg-[#101520] accent-[#ff2337]" />
                    {tr('Remember me', 'Meni eslab qolish')}
                  </label>
                  <button type="button" className="transition hover:text-white">
                    {tr('Forgot password?', 'Parolni unutdingizmi?')}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-[#ff142c] to-[#b60919] px-4 text-base font-extrabold text-white shadow-[0_18px_48px_rgba(239,35,60,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:mt-8 sm:min-h-[66px]"
                >
                  <Lock size={22} />
                  {loading ? resolveLocalizedText(content.submittingLabel, language) : mfaTicket ? tr('Verify', 'Tasdiqlash') : resolveLocalizedText(content.submitLabel, language)}
                </button>
              </form>

              {savedAccounts.length > 0 && (
                <div className="mt-7 rounded-lg border border-[#273142] bg-[#0d1320]/76 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-extrabold uppercase tracking-[0.08em] text-white">
                      {tr('Saved accounts', 'Saqlangan akkauntlar')}
                    </div>
                    <div className="text-xs text-[#9ea6b5]">
                      {tr('Office testing', 'Ofis testi')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {savedAccounts.map((account) => (
                      <div key={account.id || account.email} className="flex items-center gap-2 rounded-md border border-[#273142] bg-[#111622] p-2">
                        <button
                          type="button"
                          onClick={() => {
                            switchAccount(account.id || account.email);
                            toast.success(tr('Account switched', 'Akkaunt almashtirildi'));
                            goToUserHome(account);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ff2337]/15 text-[#ff5969]">
                            <UserCircle size={22} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-white">{account.fullName || account.email}</span>
                            <span className="block truncate text-xs uppercase tracking-wide text-[#9ea6b5]">
                              {account.email} · {account.role === 'firm' ? account.firmRole.replace('_', ' ') : account.role}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => forgetAccount(account.id || account.email)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#9ea6b5] transition hover:bg-[#1b2332] hover:text-white"
                          aria-label={tr('Remove saved account', 'Saqlangan akkauntni olib tashlash')}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="my-9 flex items-center gap-5 text-base text-[#b2b8c5]">
                <div className="h-px flex-1 bg-[#273142]" />
                {tr('or', 'yoki')}
                <div className="h-px flex-1 bg-[#273142]" />
              </div>

              <a
                href="https://t.me/ADO_FINANCE"
                target="_blank"
                rel="noreferrer"
                className="mb-4 flex min-h-12 items-center justify-center rounded-lg border border-[#273142] bg-[#111622]/72 px-4 text-sm font-bold text-white transition hover:border-[#ff2337]"
              >
                {tr('Telegram support', 'Telegram orqali yordam')}
              </a>

              <div className="rounded-lg border border-[#273142] bg-[#111622]/72 p-4 sm:p-6">
                <div className="flex items-center gap-5">
                  <ShieldCheck size={38} className="shrink-0 text-[#ff2337]" />
                  <div>
                    <div className="text-base font-extrabold leading-6 text-white">
                      {resolveLocalizedText(content.footerNote, language)}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#9ea6b5]">
                      {tr('All data is protected by modern encryption standards.', 'Barcha ma’lumotlar zamonaviy shifrlash standartlari bilan himoyalangan.')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
