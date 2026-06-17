"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();
  const { tr, t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      login(token, user);
      toast.success(tr('Logged in successfully', 'Muvaffaqiyatli kirdik'));
      const role = String(user?.role || '').toLowerCase();
      if (role === 'firm') {
        router.push('/firm');
      } else {
        router.push('/admin');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || tr('Login failed', 'Kirishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background relative font-outfit">
      {/* Left Branding Panel - Refined minimal aesthetic */}
      <div className="relative hidden w-0 flex-1 lg:block h-full group bg-surface overflow-hidden">
        {/* Background gradient from HTML */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_40%,rgba(75,163,227,0.06)_0%,transparent_60%),radial-gradient(ellipse_50%_40%_at_10%_80%,rgba(201,168,76,0.05)_0%,transparent_50%)]"></div>
        {/* Grid pattern */}
        <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(30,45,69,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(30,45,69,0.4)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_30%,transparent_100%)]"></div>

        {/* Huge Center Logo */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.15] transform scale-[1.5] pointer-events-none">
           <img src="/logo.png" alt="Big ADO Logo" className="w-1/2 h-auto object-contain drop-shadow-2xl grayscale mix-blend-luminosity" />
        </div>

        <div className="absolute top-10 left-10 z-10 flex items-center gap-4">
           <div className="w-12 h-12 bg-surface-2 flex items-center justify-center rounded-xl border border-border overflow-hidden">
             <img src="/logo.png" alt="ADO Logo" className="w-full h-full object-contain p-[3px]" />
           </div>
           <div className="h-4 w-px bg-border"></div>
           <span className="text-muted text-xs font-extrabold tracking-[0.2em] font-mono uppercase">ADO Financial</span>
        </div>

        <div className="absolute bottom-12 left-10 right-10 z-10">
          <div className="inline-flex items-center gap-2 font-mono text-[0.72rem] text-primary uppercase tracking-[0.12em] mb-8 before:content-[''] before:w-8 before:h-px before:bg-primary before:inline-block">
            {tr('Secure Access Portal', 'Xavfsiz Kirish Portali')}
          </div>
          <h2 className="text-4xl lg:text-5xl font-playfair font-bold text-foreground mb-6 tracking-wide leading-tight">
            Distribution.<br/><em className="italic text-primary">{tr('Refined.', 'Mukammal.')}</em>
          </h2>
          <p className="text-muted text-base font-light max-w-md leading-relaxed">
            {tr('A precise, ledger-driven airline inventory platform built for strict B2B financial accounting and operational integrity.', 'Qat\'iy B2B moliyaviy hisob-kitoblar va operatsion yaxlitlik uchun qurilgan havo yo\'llari inventarizatsiyasi platformasi.')}
          </p>
        </div>
      </div>

      {/* Right Login Panel - Dark and Elegant */}
      <div className="flex w-full flex-col justify-center bg-background px-8 py-16 lg:w-1/2 xl:w-1/3 relative border-l border-border">
        {/* Top Right Controls */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeLanguageSwitcher />
        </div>

        <div className="mx-auto w-full max-w-sm relative z-10">
          <div className="text-left mb-12">
            <h1 className="text-3xl font-playfair font-bold text-foreground tracking-wide">
              {tr('Welcome Back', 'Xush Kelibsiz')}
            </h1>
            <p className="mt-2 text-sm text-muted font-normal">
              {tr('Enter your credentials to continue', 'Davom etish uchun ma\'lumotlaringizni kiriting')}
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[11px] font-bold font-mono uppercase tracking-widest text-muted mb-2" htmlFor="email-address">
                {tr('Email Address', 'Elektron pochta')}
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                required
                className="block w-full rounded-none border-b border-border bg-transparent px-2 py-3 text-foreground placeholder-smoke focus:outline-none focus:border-primary transition-all sm:text-sm font-light"
                placeholder="agency@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[11px] font-bold font-mono uppercase tracking-widest text-muted" htmlFor="password">
                  {tr('Password', 'Parol')}
                </label>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="block w-full rounded-none border-b border-border bg-transparent px-2 py-3 text-foreground placeholder-smoke focus:outline-none focus:border-primary transition-all sm:text-sm font-light tracking-widest"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full flex items-center justify-center gap-2 bg-primary py-4 px-4 text-sm font-semibold uppercase tracking-wider text-white hover:bg-primary-hover focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-70 transition-all duration-200 shadow-[0_8px_32px_rgba(201,168,76,0.15)]"
            >
              <LogIn size={18} />
              {loading ? tr('Authenticating...', 'Tekshirilmoqda...') : tr('Sign In', 'Tizimga Kirish')}
            </button>
          </form>

          <div className="mt-16 text-left">
            <span className="text-muted text-[10px] uppercase tracking-[0.15em] font-semibold font-mono">
              {tr('Secured by ADO', 'ADO tomonidan himoyalangan')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
