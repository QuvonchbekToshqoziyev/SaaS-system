import { expect, test, type Page } from '@playwright/test';

const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!';

async function login(page: Page, email: string) {
  await page.goto('/login/');
  await page.locator('#email-address').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('form button[type="submit"]').click();
}

test('firm admin can choose Ombor mudiri with platform login', async ({ page }) => {
  await login(page, 'qa.firmadmin@ado.test');
  await expect(page).toHaveURL(/\/firm\/?$/);
  await page.goto('/employees/');
  const roleSelect = page.getByRole('combobox').filter({ has: page.locator('option[value="OMBOR_MUDIRI"]') }).first();
  await expect(roleSelect.locator('option[value="OMBOR_MUDIRI"]')).toHaveText('Ombor mudiri');
});

test('Ombor mudiri is confined to warehouse control and operations', async ({ page }) => {
  await login(page, 'qa.ombor.mudiri@ado.test');
  await expect(page).toHaveURL(/\/inventory\/?$/);
  await expect(page.getByRole('heading', { name: 'Ombor', exact: true }).first()).toBeVisible();
  await expect(page.locator('a[href="/inventory"], a[href="/inventory/"]').first()).toBeVisible();
  await expect(page.locator('a[href^="/employees"], a[href^="/kassa"], a[href^="/transactions"], a[href^="/flights"]')).toHaveCount(0);

  const statuses = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const request = (path: string) => fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.status);
    return { inventory: await request('/inventory/bootstrap'), employees: await request('/employees'), kassa: await request('/kassa'), transactions: await request('/transactions') };
  });
  expect(statuses.inventory).toBe(200);
  expect(statuses.employees).toBe(403);
  expect(statuses.kassa).toBe(403);
  expect(statuses.transactions).toBe(403);
});
