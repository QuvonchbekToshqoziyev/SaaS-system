"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(err => console.log('Autoplay blocked:', err));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      login(token, user);
      toast.success('Logged in successfully');
      const role = String(user?.role || '').toLowerCase();
      if (role === 'firm') {
        router.push('/firm');
      } else {
        router.push('/admin');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Full-Height Video Section - Graceful aesthetics */}
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
        {/* Soft elegant gradients */}
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/60 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10"></div>
        
        <div className="absolute top-10 left-10 flex items-center gap-4 z-10 transition-opacity duration-1000">
           <div className="w-12 h-12 bg-white/10 backdrop-blur-md flex items-center justify-center rounded-xl border border-white/20 shadow-2xl">
             <span className="text-white text-xl font-bold tracking-widest">ADO</span>
           </div>
           <div className="h-4 w-px bg-white/30"></div>
           <span className="text-white/80 text-xs font-semibold tracking-[0.2em] uppercase">B2B Platform</span>
        </div>

        <div className="absolute bottom-12 left-10 right-10 z-10">
          <h2 className="text-4xl font-light text-white mb-3 tracking-tight">Rethink Distribution.</h2>
          <p className="text-white/60 text-sm font-light max-w-md leading-relaxed">
            A precise, ledger-driven airline inventory platform built for strict B2B financial accounting and operational integrity.
          </p>
        </div>
      </div>

      {/* Right Login Panel - Modern and Crisp */}
      <div className="flex w-full flex-col justify-center bg-white px-8 py-16 lg:w-1/2 xl:w-1/3 relative border-l border-gray-100">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-left mb-12">
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
              Tizimga kirish
            </h1>
            <p className="mt-2 text-sm text-gray-500 font-normal">
              Davom etish uchun hisob ma'lumotlarini kiriting
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2" htmlFor="email-address">
                Elektron pochta
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                required
                className="block w-full rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all sm:text-sm"
                placeholder="agency@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2" htmlFor="password">
                Parol
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="block w-full rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all sm:text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 px-4 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-70 transition-all duration-200"
            >
              <LogIn size={18} />
              {loading ? 'Kirish...' : 'Davom etish'}
            </button>
          </form>

          <div className="mt-16 text-left">
            <span className="text-gray-400 text-[10px] uppercase tracking-widest font-semibold">
              Platforma ADO tomonidan himoyalangan
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
