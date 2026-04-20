"use client";

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ThemeLanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, toggleLanguage, t } = useLanguage();
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    try {
      const current = document.documentElement.dataset.theme;
      setTheme(current === 'light' ? 'light' : 'dark');
    } catch {
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('jetstream-theme', next);
        document.documentElement.dataset.theme = next;
      } catch {}
      return next;
    });
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        onClick={toggleTheme}
        className="p-2 bg-surface-2 border border-border hover:border-primary text-muted hover:text-primary rounded-full transition-all"
        aria-label={'Toggle theme'}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <button
        onClick={toggleLanguage}
        className="px-4 py-2 border border-border hover:border-primary text-muted hover:text-primary rounded-full transition-all text-[0.7rem] uppercase tracking-widest font-bold"
        aria-label={t('toggleLanguageAria')}
      >
        {language === 'en' ? 'UZ' : 'EN'}
      </button>
    </div>
  );
}
