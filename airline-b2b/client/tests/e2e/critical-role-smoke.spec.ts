import { expect, test, type Page } from '@playwright/test';

const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!';

const actors = [
  { name: 'superadmin', email: 'qa.superadmin@ado.test', home: '/admin', visibleNav: ['/admins', '/audit-log', '/monitoring', '/airlines', '/firms', '/flights', '/tours', '/services', '/transactions', '/kassa', '/employees', '/chat', '/reports', '/settings'], hiddenNav: [] },
  { name: 'admin', email: 'qa.admin@ado.test', home: '/admin', visibleNav: ['/firms', '/flights', '/tours', '/services', '/transactions', '/kassa', '/employees', '/chat', '/reports', '/settings'], hiddenNav: ['/admins', '/audit-log', '/monitoring', '/airlines'] },
  { name: 'firmadmin', email: 'qa.firmadmin@ado.test', home: '/firm', visibleNav: ['/firms', '/flights', '/tours', '/services', '/transactions', '/kassa', '/employees', '/chat', '/reports', '/settings'], hiddenNav: ['/admins', '/audit-log', '/monitoring', '/airlines'] },
  { name: 'manager', email: 'qa.manager@ado.test', home: '/firm', visibleNav: ['/flights', '/tours', '/services', '/transactions', '/kassa', '/chat', '/reports', '/settings'], hiddenNav: ['/firms', '/employees', '/admins', '/audit-log', '/monitoring', '/airlines'] },
  { name: 'kassir', email: 'qa.kassir1@ado.test', home: '/kassa', visibleNav: ['/kassa', '/chat', '/settings'], hiddenNav: ['/firm', '/firms', '/flights', '/tours', '/services', '/transactions', '/employees', '/reports', '/admins', '/audit-log', '/monitoring', '/airlines'] },
] as const;

async function login(page: Page, email: string, home: string) {
  await page.goto('/login/');
  await page.locator('#email-address').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${home}/?$`));
  await expect(page.getByText('ADO Financial', { exact: true })).toBeVisible();
}

for (const actor of actors) {
  test(`${actor.name} critical navigation and pages load without browser or API 5xx errors`, async ({ page }) => {
    const failures: string[] = [];
    let currentSurface = 'login';
    page.on('pageerror', (error) => failures.push(`${currentSurface}: pageerror ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) failures.push(`${currentSurface}: ${response.status()} ${response.url()}`);
    });

    await login(page, actor.email, actor.home);

    const navLink = (href: string) => page.locator(`a[href="${href}"], a[href="${href}/"]`);
    for (const href of actor.visibleNav) await expect(navLink(href).first()).toBeAttached();
    for (const href of actor.hiddenNav) await expect(navLink(href)).toHaveCount(0);

    for (const href of [actor.home, ...actor.visibleNav]) {
      currentSurface = href;
      await page.goto(`${href}/`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('ADO Financial', { exact: true })).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Application error');
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
}
