export type LocalizedText = {
  en: string;
  uz: string;
};

export type LoginPageContent = {
  brandName: LocalizedText;
  sectionTagline: LocalizedText;
  heroTitle: LocalizedText;
  heroAccent: LocalizedText;
  heroDescription: LocalizedText;
  panelTitle: LocalizedText;
  panelSubtitle: LocalizedText;
  emailLabel: LocalizedText;
  emailPlaceholder: string;
  passwordLabel: LocalizedText;
  passwordPlaceholder: string;
  submitLabel: LocalizedText;
  submittingLabel: LocalizedText;
  footerNote: LocalizedText;
  websiteLabel: LocalizedText;
  websiteUrl: string;
};

export const defaultLoginPageContent: LoginPageContent = {
  brandName: { en: 'ADO Systems', uz: 'ADO Systems' },
  sectionTagline: { en: 'Secure Access Portal', uz: 'Xavfsiz Kirish Portali' },
  heroTitle: { en: 'Distribution.', uz: 'Taqsimot.' },
  heroAccent: { en: 'Perfect.', uz: 'Mukammal.' },
  heroDescription: {
    en: 'Accurate data. Full control. Maximum security. A trusted B2B financial management ecosystem for your business, where every operation is controlled and every decision is based on data.',
    uz: 'Aniq ma’lumot. To‘liq nazorat. Maksimal xavfsizlik. Biznesingiz uchun yaratilgan eng ishonchli B2B moliyaviy boshqaruv ekotizimi — har bir operatsiya nazorat ostida, har bir qaror ma’lumotga tayanadi.',
  },
  panelTitle: { en: 'Sign in', uz: 'Tizimga kirish' },
  panelSubtitle: { en: 'Enter your details to access your account', uz: "Hisobingizga kirish uchun ma'lumotlaringizni kiriting" },
  emailLabel: { en: 'Email Address', uz: 'Elektron pochta' },
  emailPlaceholder: 'Elektron pochta',
  passwordLabel: { en: 'Password', uz: 'Parol' },
  passwordPlaceholder: 'Parol',
  submitLabel: { en: 'Enter', uz: 'Kirish' },
  submittingLabel: { en: 'Signing in...', uz: 'Kirilmoqda...' },
  footerNote: {
    en: 'ADO System - trusted technology, secure future.',
    uz: 'ADO System - ishonchli texnologiya, xavfsiz kelajak.',
  },
  websiteLabel: { en: 'ADO-FINANCE', uz: 'ADO-FINANCE' },
  websiteUrl: 'https://ado-finance.com',
};

export function resolveLocalizedText(text: LocalizedText, language: 'en' | 'uz') {
  return language === 'uz' ? text.uz : text.en;
}

function normalizeLocalizedText(value: unknown, fallback: LocalizedText): LocalizedText {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<LocalizedText>;
  return {
    en: typeof candidate.en === 'string' && candidate.en.trim() ? candidate.en.trim() : fallback.en,
    uz: typeof candidate.uz === 'string' && candidate.uz.trim() ? candidate.uz.trim() : fallback.uz,
  };
}

function normalizeTextField(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeWebsiteUrl(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeLoginPageContent(value: unknown): LoginPageContent {
  const candidate = (value && typeof value === 'object' ? value : {}) as Partial<LoginPageContent>;

  return {
    brandName: normalizeLocalizedText(candidate.brandName, defaultLoginPageContent.brandName),
    sectionTagline: normalizeLocalizedText(candidate.sectionTagline, defaultLoginPageContent.sectionTagline),
    heroTitle: normalizeLocalizedText(candidate.heroTitle, defaultLoginPageContent.heroTitle),
    heroAccent: normalizeLocalizedText(candidate.heroAccent, defaultLoginPageContent.heroAccent),
    heroDescription: normalizeLocalizedText(candidate.heroDescription, defaultLoginPageContent.heroDescription),
    panelTitle: normalizeLocalizedText(candidate.panelTitle, defaultLoginPageContent.panelTitle),
    panelSubtitle: normalizeLocalizedText(candidate.panelSubtitle, defaultLoginPageContent.panelSubtitle),
    emailLabel: normalizeLocalizedText(candidate.emailLabel, defaultLoginPageContent.emailLabel),
    emailPlaceholder: normalizeTextField(candidate.emailPlaceholder, defaultLoginPageContent.emailPlaceholder),
    passwordLabel: normalizeLocalizedText(candidate.passwordLabel, defaultLoginPageContent.passwordLabel),
    passwordPlaceholder: normalizeTextField(candidate.passwordPlaceholder, defaultLoginPageContent.passwordPlaceholder),
    submitLabel: normalizeLocalizedText(candidate.submitLabel, defaultLoginPageContent.submitLabel),
    submittingLabel: normalizeLocalizedText(candidate.submittingLabel, defaultLoginPageContent.submittingLabel),
    footerNote: normalizeLocalizedText(candidate.footerNote, defaultLoginPageContent.footerNote),
    websiteLabel: normalizeLocalizedText(candidate.websiteLabel, defaultLoginPageContent.websiteLabel),
    websiteUrl: normalizeWebsiteUrl(candidate.websiteUrl, defaultLoginPageContent.websiteUrl),
  };
}
