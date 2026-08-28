import { expect, test, type Page } from '@playwright/test';

const password = process.env.DEV_QA_PASSWORD || 'QaDev2026!Secure';
const qaLoginCode = process.env.DEV_QA_LOGIN_CODE || '481927';

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
  const loginResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/login'));
  await page.locator('form button[type="submit"]').click();
  const loginData = await (await loginResponse).json();
  expect(loginData.token).toBeUndefined();
  if (loginData.verificationRequired) {
    await page.locator('#verification-code').fill(qaLoginCode);
    await page.locator('form button[type="submit"]').click();
  }
  await expect(page).toHaveURL(new RegExp(`${home}/?$`));
  await expect(page.getByRole('heading', { name: 'ADO SYSTEM', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'ado_session');
  expect(sessionCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
  const trustedCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'ado_trusted_device');
  expect(trustedCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
}

async function selectOptions(select: ReturnType<Page['locator']>) {
  return (await select.locator('option').allTextContents()).map((value) => value.trim()).filter(Boolean);
}

function expectUnique(values: string[], label: string) {
  expect(new Set(values).size, `${label}: ${values.join(' | ')}`).toBe(values.length);
}

test('protected dashboard markup never appears before unauthenticated redirect', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__adoDashboardFlashed = false;
    const inspect = () => {
      if (document.querySelector('aside, nav a[href="/admin"]')) (window as any).__adoDashboardFlashed = true;
    };
    new MutationObserver(inspect).observe(document.documentElement, { childList: true, subtree: true });
    inspect();
  });
  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/login\/?$/);
  expect(await page.evaluate(() => (window as any).__adoDashboardFlashed)).toBe(false);
});

test('a verified device skips the code on the next password login', async ({ page }) => {
  await login(page, 'qa.manager@ado.test', '/firm');
  await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-ADO-CSRF': '1' } });
  });
  await page.goto('/login/');
  await page.locator('#email-address').fill('qa.manager@ado.test');
  await page.locator('#password').fill(password);
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/login'));
  await page.locator('form button[type="submit"]').click();
  const data = await (await responsePromise).json();
  expect(data.verificationRequired).toBeUndefined();
  await expect(page).toHaveURL(/\/firm\/?$/);
  await expect(page.locator('#verification-code')).toHaveCount(0);
});

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
      await expect(page.getByRole('heading', { name: 'ADO SYSTEM', exact: true })).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Application error');
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
}

test('superadmin sees complete firm-scoped expense choices without duplicates', async ({ page }) => {
  await login(page, 'qa.superadmin@ado.test', '/admin');

  await test.step('Settings shows a complete unique list for each selected firm', async () => {
    await page.goto('/settings/');
    const currentListHeading = page.getByRole('heading', { name: 'Hozirgi xarajat turlari' });
    if (!await currentListHeading.isVisible()) {
      await page.getByRole('button', { name: /Moliyaviy sozlamalar/ }).click();
    }
    await expect(currentListHeading).toBeVisible();

    const firmSelect = page.getByRole('combobox', { name: 'Firma', exact: true }).first();
    await expect.poll(() => firmSelect.locator('option').count()).toBeGreaterThanOrEqual(2);
    const firmValues = (await firmSelect.locator('option').evaluateAll((options) => options.slice(0, 2).map((option) => (option as HTMLOptionElement).value))).filter(Boolean);
    expect(firmValues.length).toBeGreaterThanOrEqual(2);

    const categoryTable = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Kod', exact: true }) }).first();
    for (const firmValue of firmValues) {
      await firmSelect.selectOption(firmValue);
      await expect.poll(() => categoryTable.locator('tbody tr td:nth-child(3) input').count()).toBeGreaterThanOrEqual(20);
      const names = await categoryTable.locator('tbody tr td:nth-child(3) input').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim()));
      expectUnique(names, `settings categories for firm ${firmValue}`);
    }
  });

  await test.step('Kassa reproduces company-expense and salary user paths', async () => {
    await page.goto('/kassa/');
    const form = page.locator('#cash-movement form');
    const field = (label: string) => form.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::select[1]');
    const typeSelect = field('Turi');
    const firmSelect = field('Firma');
    const directionSelect = field('Chiqim yo‘nalishi');
    const categorySelect = field('Xarajat kategoriyasi');

    await typeSelect.selectOption('OUT');
    await expect(categorySelect.locator('option')).toHaveCount(1);

    await expect.poll(() => firmSelect.locator('option').count()).toBeGreaterThanOrEqual(3);
    const firms = await firmSelect.locator('option').evaluateAll((options) => options.slice(1, 3).map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent?.trim() || '' })).filter((option) => option.value));
    expect(firms.length).toBeGreaterThanOrEqual(2);
    for (const firm of firms) {
      await firmSelect.selectOption(firm.value);
      await directionSelect.selectOption('COMPANY_EXPENSE');
      await expect.poll(async () => (await selectOptions(categorySelect)).length).toBeGreaterThanOrEqual(21);
      const categories = (await selectOptions(categorySelect)).slice(1);
      expectUnique(categories, `kassa categories for ${firm.label}`);
    }

    const categorySearch = form.getByPlaceholder('Kategoriya qidirish…');
    await categorySearch.fill('ISH HAQI');
    await expect(categorySelect.locator('option', { hasText: 'Ish haqi' })).toHaveCount(1);
    await categorySearch.clear();

    const salaryFirm = await firmSelect.locator('option').evaluateAll((options) => options.map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent?.trim() || '' })).find((option) => option.label === 'QA DEV Tashkent Tours'));
    expect(salaryFirm, 'QA salary fixture firm must be selectable').toBeTruthy();
    await firmSelect.selectOption(salaryFirm!.value);
    await directionSelect.selectOption('EMPLOYEE_PAYMENT');
    const employeeSelect = field('Xodim');
    await expect.poll(async () => (await selectOptions(employeeSelect)).some((employee) => employee.includes('Kassa xodimi'))).toBe(true);
    expectUnique((await selectOptions(employeeSelect)).slice(1), `salary employees for ${salaryFirm!.label}`);
  });
});

test('firm admin sees complete warehouse keeper workflow and firm contractors', async ({ page }) => {
  await login(page, 'qa.firmadmin@ado.test', '/firm');
  await page.goto('/inventory/');
  await expect(page.getByRole('heading', { name: 'Ombor', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Kirim', exact: true }).click();
  for (const label of ['Mahsulot nomi', 'Soni', '1 dona narxi', 'Jami summasi']) {
    await expect(page.locator('label, div').filter({ hasText: new RegExp(`^${label}`) }).first()).toBeVisible();
  }
  const contractorSelect = page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'Pudratchi / yetkazib beruvchi' }) });
  await expect.poll(() => contractorSelect.locator('optgroup[label="Firmalar bo‘limidan"] option').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Sozlamalar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mahsulot kategoriyalari', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Kategoriya nomi')).toBeVisible();
  await expect(page.getByRole('button', { name: /ni tahrirlash/ }).first()).toBeVisible();

  const marker = Date.now().toString(36).toUpperCase();
  const unitCode = `QA_${marker.slice(-6)}`;
  const unitName = `QA birlik ${marker}`;
  const unitForm = page.getByRole('form', { name: 'O‘lchov birligi qo‘shish' });
  let unitId = '';
  try {
    await unitForm.getByLabel('Birlik kodi').fill(unitCode);
    await unitForm.getByLabel('Birlik nomi').fill(unitName);
    const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/inventory/units'), { timeout: 30_000 });
    await unitForm.getByRole('button', { name: 'Qo‘shish' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    unitId = String((await response.json()).id || '');
    expect(unitId).toBeTruthy();
    await expect(page.getByText(unitName, { exact: true })).toBeVisible();
  } finally {
    if (unitId) await page.request.delete(`/api/inventory/units/${unitId}`, { headers: { 'X-ADO-CSRF': '1' }, data: {} });
  }

  await page.getByRole('button', { name: 'Hisobotlar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Omborchi hisoboti', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Kim kiritdi', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Moliyaviy ta’sir', exact: true })).toBeVisible();
});

test('firm admin can create, open and add a card to a first kassa', async ({ page }) => {
  await login(page, 'qa.firmadmin@ado.test', '/firm');
  await page.goto('/kassa/');

  const marker = Date.now().toString(36).toUpperCase();
  const deskName = `QA Birinchi kassa ${marker}`;
  const deskCode = `QK-${marker.slice(-6)}`;
  const cardOwner = `QA Karta ${marker}`;
  const businessDate = new Date().toISOString().slice(0, 10);
  const headers: Record<string, string> = { 'X-ADO-CSRF': '1' };
  let deskId = '';
  let cardId = '';
  let opened = false;

  try {
    const deskForm = page.getByRole('form', { name: 'Kassa yaratish' });
    await expect(deskForm.getByLabel('Kassa nomi')).toHaveValue('Asosiy kassa');
    await expect(deskForm.getByLabel('Kassa kodi')).toHaveValue('K-01');
    await expect(deskForm.getByRole('button', { name: 'Kassa qo‘shish' })).toBeEnabled();

    await deskForm.getByLabel('Kassa nomi').fill(deskName);
    await deskForm.getByLabel('Kassa kodi').fill(deskCode);
    const deskResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/kassa/desks'), { timeout: 30_000 });
    await deskForm.getByRole('button', { name: 'Kassa qo‘shish' }).click();
    const deskResponse = await deskResponsePromise;
    expect(deskResponse.status()).toBe(201);
    deskId = String((await deskResponse.json()).id || '');
    expect(deskId).toBeTruthy();

    const deskSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Barcha kassalar' }) }).first();
    await expect.poll(() => deskSelect.locator(`option[value="${deskId}"]`).count()).toBe(1);
    await deskSelect.selectOption(deskId);

    const openForm = page.getByRole('form', { name: 'Kassani ochish' });
    await expect(openForm).toBeVisible();
    const openResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/kassa/open'), { timeout: 30_000 });
    await openForm.getByRole('button', { name: 'Kassani ochish' }).click();
    await page.getByRole('button', { name: 'Amalni tasdiqlash' }).click();
    expect((await openResponsePromise).status()).toBe(201);
    opened = true;

    const cardForm = page.getByRole('form', { name: 'Karta qo‘shish' });
    await cardForm.getByLabel('Karta egasi').fill(cardOwner);
    await cardForm.getByLabel('Karta raqami').fill('8600123412345678');
    const addCardButton = cardForm.getByRole('button', { name: /Karta qo.shish/ });
    await expect(addCardButton).toBeEnabled();
    const cardResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/kassa/cards'), { timeout: 30_000 });
    await addCardButton.click();
    const cardResponse = await cardResponsePromise;
    expect(cardResponse.status()).toBe(201);
    cardId = String((await cardResponse.json()).id || '');
    expect(cardId).toBeTruthy();
    await expect(page.getByRole('cell', { name: cardOwner, exact: true })).toBeVisible();
  } finally {
    if (opened && deskId) await page.request.post('/api/kassa/close', { headers, data: { businessDate, kassaDeskId: deskId, notes: 'QA first-kassa cleanup' } });
    if (cardId) await page.request.delete(`/api/kassa/cards/${cardId}`, { headers, data: { reason: 'QA first-kassa cleanup' } });
    if (deskId) await page.request.patch(`/api/kassa/desks/${deskId}`, { headers, data: { status: 'INACTIVE' } });
  }
});
