"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, KeyRound, Copy, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type SetupPayload = {
  secret: string;
  otpauthUri: string;
};

export default function MfaSetupPage() {
  const { user, login, isLoading } = useAuth();
  const { tr } = useLanguage();
  const router = useRouter();
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!['superadmin', 'admin'].includes(user.role)) {
      router.replace(user.role === 'firm' ? '/firm' : '/admin');
      return;
    }
    if (user.mfaConfirmedAt) {
      router.replace('/admin');
      return;
    }

    let cancelled = false;
    api.post('/auth/mfa/setup')
      .then((response) => {
        if (!cancelled) setSetup(response.data);
      })
      .catch(() => toast.error(tr('Failed to start MFA setup', 'MFA sozlash boshlanmadi')));
    return () => { cancelled = true; };
  }, [isLoading, router, tr, user]);

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/auth/mfa/confirm', { code, sessionTransport: 'cookie' });
      login(response.data.user);
      setRecoveryCodes(Array.isArray(response.data.recoveryCodes) ? response.data.recoveryCodes : []);
      toast.success(tr('MFA enabled', 'MFA yoqildi'));
    } catch {
      toast.error(tr('Invalid verification code', 'Tasdiqlash kodi noto‘g‘ri'));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(tr('Copied', 'Nusxalandi'));
  };

  return (
    <main className="min-h-dvh bg-[#030710] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-2xl rounded-lg border border-[#273142] bg-[#070b15] p-6 shadow-[0_28px_120px_rgba(0,0,0,0.46)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-[#ff2337]" />
          <div>
            <h1 className="text-2xl font-black">{tr('Secure admin login', 'Admin kirishini himoyalash')}</h1>
            <p className="mt-1 text-sm text-[#aeb4c0]">{tr('Add this account to an authenticator app before opening the dashboard.', 'Dashboardga kirishdan oldin bu akkauntni authenticator ilovasiga qo‘shing.')}</p>
          </div>
        </div>

        {recoveryCodes.length > 0 ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
              <CheckCircle2 />
              <span>{tr('Save these recovery codes now. They are shown only once.', 'Bu tiklash kodlarini hozir saqlang. Ular faqat bir marta ko‘rsatiladi.')}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((item) => <code key={item} className="rounded-md bg-[#111622] px-3 py-2 text-center text-sm">{item}</code>)}
            </div>
            <button onClick={() => router.replace('/admin')} className="min-h-11 w-full rounded-lg bg-[#ff2337] px-4 font-bold">
              {tr('Continue to dashboard', 'Dashboardga o‘tish')}
            </button>
          </div>
        ) : (
          <form onSubmit={confirm} className="space-y-5">
            <div className="rounded-lg border border-[#273142] bg-[#111622] p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold uppercase text-[#aeb4c0]">{tr('Manual setup key', 'Qo‘lda sozlash kaliti')}</span>
                {setup?.secret && <button type="button" onClick={() => copy(setup.secret)} className="text-[#aeb4c0] hover:text-white"><Copy size={18} /></button>}
              </div>
              <code className="break-all text-lg text-white">{setup?.secret || tr('Loading...', 'Yuklanmoqda...')}</code>
            </div>

            <div className="rounded-lg border border-[#273142] bg-[#111622] p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold uppercase text-[#aeb4c0]">otpauth URI</span>
                {setup?.otpauthUri && <button type="button" onClick={() => copy(setup.otpauthUri)} className="text-[#aeb4c0] hover:text-white"><Copy size={18} /></button>}
              </div>
              <code className="break-all text-xs text-[#d5d9e2]">{setup?.otpauthUri || '-'}</code>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#d5d9e2]">{tr('Verification code', 'Tasdiqlash kodi')}</span>
              <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[#273142] bg-[#111622] px-4 text-[#a4abb8] focus-within:border-[#ff2337]">
                <KeyRound size={20} />
                <input value={code} onChange={(event) => setCode(event.target.value)} required placeholder="123456" className="min-w-0 flex-1 bg-transparent text-white outline-none" />
              </div>
            </label>

            <button disabled={loading || !setup} className="min-h-12 w-full rounded-lg bg-[#ff2337] px-4 font-bold disabled:opacity-60">
              {loading ? tr('Verifying...', 'Tekshirilmoqda...') : tr('Enable MFA', 'MFA yoqish')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
