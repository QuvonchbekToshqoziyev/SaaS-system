import { describe, expect, it } from 'vitest';
import { defaultLoginPageContent, normalizeLoginPageContent, resolveLocalizedText } from '../lib/login-content';

describe('login page content helpers', () => {
  it('normalizes editable login content and trims saved text', () => {
    const content = normalizeLoginPageContent({
      brandName: { en: '  Custom Brand  ', uz: 'Maxsus Brend' },
      heroTitle: { en: '', uz: '  Yangi sarlavha  ' },
      emailPlaceholder: '  client@example.com  ',
      passwordPlaceholder: '',
      websiteLabel: { en: '  Main website  ', uz: '  Asosiy sayt  ' },
      websiteUrl: '  https://example.com/landing  ',
    });

    expect(content.brandName.en).toBe('Custom Brand');
    expect(content.brandName.uz).toBe('Maxsus Brend');
    expect(content.heroTitle.en).toBe(defaultLoginPageContent.heroTitle.en);
    expect(content.heroTitle.uz).toBe('Yangi sarlavha');
    expect(content.emailPlaceholder).toBe('client@example.com');
    expect(content.passwordPlaceholder).toBe(defaultLoginPageContent.passwordPlaceholder);
    expect(content.websiteLabel).toEqual({ en: 'Main website', uz: 'Asosiy sayt' });
    expect(content.websiteUrl).toBe('https://example.com/landing');
  });

  it('rejects unsafe website links', () => {
    const content = normalizeLoginPageContent({ websiteUrl: 'javascript:alert(1)' });

    expect(content.websiteUrl).toBe(defaultLoginPageContent.websiteUrl);
  });

  it('resolves localized content for the active language', () => {
    expect(resolveLocalizedText({ en: 'Sign In', uz: 'Kirish' }, 'en')).toBe('Sign In');
    expect(resolveLocalizedText({ en: 'Sign In', uz: 'Kirish' }, 'uz')).toBe('Kirish');
  });
});
