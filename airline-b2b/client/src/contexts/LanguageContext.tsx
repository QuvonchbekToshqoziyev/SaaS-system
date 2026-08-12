"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type Language = 'en' | 'uz';

type TranslationKey =
  | 'navDashboard'
  | 'navAdminDashboard'
  | 'navAdmins'
  | 'navAuditLog'
  | 'navMonitoring'
  | 'navAirlines'
  | 'navFirms'
  | 'navFlights'
  | 'navTours'
  | 'navServices'
  | 'navTransactions'
  | 'navKassa'
  | 'navInventory'
  | 'navEmployees'
  | 'navChat'
  | 'navReports'
  | 'navSettings'
  | 'sectionAgencyPortal'
  | 'sectionAdminConsole'
  | 'pageFallbackTitle'
  | 'themeLight'
  | 'themeDark'
  | 'account'
  | 'signOut'
  | 'cancel'
  | 'toggleLanguageAria';

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    navDashboard: 'Dashboard',
    navAdminDashboard: 'Admin Dashboard',
    navAdmins: 'Admins',
    navAuditLog: 'Audit jurnali',
    navMonitoring: 'Business monitoring',
    navAirlines: 'Airlines',
    navFirms: 'Firms',
    navFlights: 'Flights',
    navTours: 'Tours',
    navServices: 'Services',
    navTransactions: 'Transactions',
    navKassa: 'Kassa',
    navInventory: 'Warehouse',
    navEmployees: 'Employees',
    navChat: 'Chat',
    navReports: 'Reports',
    navSettings: 'Settings',
    sectionAgencyPortal: 'Agency Portal',
    sectionAdminConsole: 'Admin Console',
    pageFallbackTitle: 'Dashboard',
    themeLight: 'Light mode',
    themeDark: 'Dark mode',
    account: 'Account',
    signOut: 'Sign out',
    cancel: 'Cancel',
    toggleLanguageAria: 'Toggle language',
  },
  uz: {
    navDashboard: 'Bosh sahifa',
    navAdminDashboard: 'Admin panel',
    navAdmins: 'Adminlar',
    navAuditLog: 'Audit Log',
    navMonitoring: 'Biznes monitoring',
    navAirlines: 'Aviakompaniyalar',
    navFirms: 'Firmalar',
    navFlights: 'Reyslar',
    navTours: 'Turlar',
    navServices: 'Xizmatlar',
    navTransactions: 'Tranzaksiyalar',
    navKassa: 'Kassa',
    navInventory: 'Ombor',
    navEmployees: 'Xodimlar',
    navChat: 'Chat',
    navReports: 'Hisobotlar',
    navSettings: 'Sozlamalar',
    sectionAgencyPortal: 'Agentlik',
    sectionAdminConsole: 'Admin boshqaruvi',
    pageFallbackTitle: 'Bosh sahifa',
    themeLight: 'Yorug‘ rejim',
    themeDark: 'Qorong‘i rejim',
    account: 'Hisob',
    signOut: 'Chiqish',
    cancel: 'Bekor qilish',
    toggleLanguageAria: 'Tilni almashtirish',
  },
};

function normalizeLanguage(value: unknown): Language {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  return 'uz';
}

function applyDocumentLanguage(lang: Language) {
  try {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  } catch {
    // ignore
  }
}

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey) => string;
  tr: (en: string, uz: string) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'uz';
    try {
      return normalizeLanguage(localStorage.getItem('jetstream-lang'));
    } catch {
      return 'uz';
    }
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('jetstream-lang', lang);
    } catch {
      // ignore
    }
    applyDocumentLanguage(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'uz' : 'en');
  }, [language, setLanguage]);

  const value = useMemo<LanguageContextType>(() => {
    const table = translations[language] || translations.en;
    return {
      language,
      setLanguage,
      toggleLanguage,
      t: (key) => table[key] || translations.en[key] || key,
      tr: (en, uz) => (language === 'uz' ? uz : en),
    };
  }, [language, setLanguage, toggleLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
