"use client";

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldCheck } from 'lucide-react';
import ThemeLanguageSwitcher from '@/components/ui/ThemeLanguageSwitcher';

type ApiErrorResponse = { error?: string; };
type AcceptInviteResponse = { success?: boolean; message?: string; token?: string; user?: unknown; };

function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.error;
}

function InviteContent() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { token: currentToken, login } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const id = searchParams.get('id') || '';
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(err => console.log('Autoplay blocked:', err));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) { toast.error('Yaroqsiz yoki eskirgan link.'); return; }
    if (password !== confirmPassword) { toast.error('Parollar mos kelmadi'); return; }

    setLoading(true);
    try {
      const res = await api.post<AcceptInviteResponse>('/invites/accept', { id, token, password });
      const apiToken = res.data?.token;
      const apiUser = res.data?.user;

      if (!currentToken && apiToken && apiUser) {
        login(apiToken, apiUser);
        toast.success('Hisob faollashtirildi. Tizimga kirdingiz.');
        const role = String((apiUser as any)?.role || '').toLowerCase();
        router.push(role === 'firm' ? '/firm' : '/admin');
      } else {
        toast.success('Hisob yaratildi. Iltimos login qiling.');
        router.push('/login');
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 relative bg-[#0a0a0a] overflow-hidden">
        <video 
          ref={videoRef}
          src="/hero-video.mp4" 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/60 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10"></div>
        
        <div className="absolute top-10 left-10 flex items-center gap-4 z-10 transition-opacity duration-1000">
           <div className="w-12 h-12 bg-white/10 backdrop-blur-md flex items-center justify-center rounded-xl border border-white/20 shadow-2xl">
             <span className="text-foreground text-xl font-bold tracking-widest">ADO</span>
           </div>
           <div className="h-4 w-px bg-white/30"></div>
           <span className="text-muted text-xs font-semibold tracking-[0.2em] uppercase">B2B Platform</span>
        </div>

        <div className="absolute bottom-12 left-10 right-10 z-10">
          <h2 className="text-4xl font-light text-foreground mb-3 tracking-tight">Secure Onboarding.</h2>
          <p className="text-muted text-sm font-light max-w-md leading-relaxed">
            Welcome to the closed B2B distribution network. Please secure your account to proceed.
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center bg-white px-8 py-16 lg:w-1/2 xl:w-1/3 relative border-l border-gray-100">
        {/* Top Right Controls */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeLanguageSwitcher />
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div className="text-left mb-12">
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
              Faollashtirish
            </h1>
            <p className="mt-2 text-sm text-gray-500 font-normal">
              Xavfsizlik uchun yangi shaxsiy parol o'rnating
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2" htmlFor="password">
                Yangi parol
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="block w-full rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:border-primary focus:ring-4 focus:ring-blue-600/10 transition-all sm:text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2" htmlFor="confirmPassword">
                Parolni tasdiqlash
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="block w-full rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:border-primary focus:ring-4 focus:ring-blue-600/10 transition-all sm:text-sm"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-3.5 px-4 text-sm font-semibold text-foreground shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-70 transition-all duration-200"
            >
              <ShieldCheck size={18} />
              {loading ? 'Tasdiqlanmoqda...' : 'Tasdiqlash va Kirish'}
            </button>
          </form>

          <div className="mt-16 text-left">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest font-semibold">
              Tizimga havoladan kirdingiz
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-white">
        <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 bg-[#0a0a0a]"></div>
        <div className="flex w-full lg:w-1/2 xl:w-1/3 flex-col items-center justify-center bg-white border-l border-gray-100">
          <div className="w-10 h-10 border-[3px] border-primary/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        </div>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
