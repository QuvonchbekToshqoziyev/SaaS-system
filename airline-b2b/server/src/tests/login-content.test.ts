import { describe, expect, it } from 'vitest';
import { defaultLoginPageContent, normalizeLoginPageContent, resolveLocalizedText } from '../lib/login-content';

describe('login page content helpers', () => {
  it('normalizes editable login content and trims saved text', () => {
    const content = normalizeLoginPageContent({
      brandName: { en: '  Custom Brand  ', uz: 'Maxsus Brend' },
      heroTitle: { en: '', uz: '  Yangi sarlavha  ' },
      emailPlaceholder: '  client@example.com  ',
      passwordPlaceholder: '',
    });

    expect(content.brandName.en).toBe('Custom Brand');
    expect(content.brandName.uz).toBe('Maxsus Brend');
    expect(content.heroTitle.en).toBe(defaultLoginPageContent.heroTitle.en);
    expect(content.heroTitle.uz).toBe('Yangi sarlavha');
    expect(content.emailPlaceholder).toBe('client@example.com');
    expect(content.passwordPlaceholder).toBe(defaultLoginPageContent.passwordPlaceholder);
  });

  it('resolves localized content for the active language', () => {
    expect(resolveLocalizedText({ en: 'Sign In', uz: 'Kirish' }, 'en')).toBe('Sign In');
    expect(resolveLocalizedText({ en: 'Sign In', uz: 'Kirish' }, 'uz')).toBe('Kirish');
  });
});
