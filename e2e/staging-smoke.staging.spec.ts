import { expect, test, type Page } from '@playwright/test';

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for staging E2E`);
  }

  return value;
}

async function signIn(page: Page) {
  const email = getRequiredEnv('STAGING_E2E_USER_EMAIL');
  const password = getRequiredEnv('STAGING_E2E_USER_PASSWORD');
  const syncResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return url.pathname.endsWith('/api/v1/auth/sync')
      && response.request().method() === 'POST'
      && response.ok();
  });

  await page.getByLabel('電子信箱').fill(email);
  await page.getByLabel('密碼').fill(password);
  await page.getByRole('button', { name: '登入' }).click();
  await syncResponse;
}

test('staging smoke verifies auth, property dashboard, and room inventory', async ({ page }) => {
  getRequiredEnv('STAGING_E2E_BASE_URL');

  await page.goto('/properties');
  await expect(page).toHaveURL(/\/login\?returnTo=/);

  await signIn(page);

  await expect(page.getByRole('heading', { name: '物業管理' })).toBeVisible();
  await expect(page.getByText('STDS 管理後台').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '我的帳號' })).toBeVisible();

  await page.getByRole('link', { name: '進入工作台' }).first().click();
  await expect(page).toHaveURL(/\/properties\/[^/?#]+$/);
  await expect(page.getByText('工作入口')).toBeVisible();
  await expect(page.getByText('物業基本資料')).toBeVisible();

  await page.getByRole('link', { name: /房間管理/ }).first().click();
  await expect(page).toHaveURL(/\/properties\/[^/?#]+\/rooms(?:[?#].*)?$/);
  await expect(page.getByRole('heading', { name: '房間清冊' })).toBeVisible();
  await expect(page.getByLabel('房況')).toBeVisible();
});
