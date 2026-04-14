import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AppProvider from '@/components/providers/Provider';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Airline B2B MVP',
  description: 'Airline B2B Ticket Distribution and Financial Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem('jetstream-theme');
    const theme = stored === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

  const langInitScript = `(() => {
  try {
    const stored = localStorage.getItem('jetstream-lang');
    const lang = stored === 'uz' ? 'uz' : 'en';
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  } catch {}
})();`;

  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
      </head>
      <body className={inter.className}>
        <AppProvider>
          <AuthProvider>
            <LanguageProvider>
              {children}
              <Toaster position="top-right" />
            </LanguageProvider>
          </AuthProvider>
        </AppProvider>
      </body>
    </html>
  );
}
