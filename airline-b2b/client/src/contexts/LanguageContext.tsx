'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'uz';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  tr: (en: string, uz: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('en');

  const tr = (en: string, uz: string) => {
    return language === 'uz' ? uz : en;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, tr }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
