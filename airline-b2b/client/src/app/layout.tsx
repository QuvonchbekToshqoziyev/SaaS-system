import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, IBM_Plex_Mono, Manrope } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AppProvider from '@/components/providers/Provider';
import { Toaster } from 'react-hot-toast';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600', '700', '800'] });
const barlowCondensed = Barlow_Condensed({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700'] });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-data', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'ADO Financial Accounting — Airline Platform',
  description: 'ADO Financial Accounting Platform',
  icons: {
    icon: '/ADO-icon.png',
    shortcut: '/ADO-icon.png',
    apple: '/ADO-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
    const lang = stored === 'en' ? 'en' : 'uz';
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  } catch {}
})();`;

  return (
    <html lang="uz" suppressHydrationWarning data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
      </head>
      <body className={`${manrope.variable} ${barlowCondensed.variable} ${ibmPlexMono.variable} font-sans`}>
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
