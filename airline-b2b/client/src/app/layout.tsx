import type { Metadata } from 'next';
import { Inter, Outfit, Playfair_Display, DM_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AppProvider from '@/components/providers/Provider';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['300', '400', '500', '600'] });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', weight: ['400', '600', '700'] });
const dm_mono = DM_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['300', '400', '500'] });

export const metadata: Metadata = {
  title: 'ADO Financial Accounting — Airline Platform',
  description: 'ADO Financial Accounting Platform',
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
      <body className={`${inter.variable} ${outfit.variable} ${playfair.variable} ${dm_mono.variable} font-sans`}>
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
