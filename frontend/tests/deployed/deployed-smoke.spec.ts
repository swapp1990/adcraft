import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://adcraft.swapp1990.org';

test.describe('Deployed smoke tests', () => {
  test('site loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Filter out known benign errors (e.g. video load failures in test env)
    const relevantErrors = errors.filter(
      (e) =>
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource') &&
        !e.includes('favicon')
    );
    expect(relevantErrors).toHaveLength(0);
  });

  test('page title is correct', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/AdCraft/);
  });

  test('header and brand name are visible', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByText('AdCraft')).toBeVisible();
  });

  test('concept form renders on deployed site', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByTestId('concept-form')).toBeVisible({ timeout: 15000 });
  });

  test('concept input accepts text', async ({ page }) => {
    await page.goto(BASE);
    const input = page.getByTestId('concept-input');
    await input.fill('Test concept for smoke test');
    await expect(input).toHaveValue('Test concept for smoke test');
  });

  test('settings dropdowns are functional', async ({ page }) => {
    await page.goto(BASE);
    const durationSelect = page.getByTestId('duration-select');
    await expect(durationSelect).toBeVisible();
    await durationSelect.selectOption('60');
    await expect(durationSelect).toHaveValue('60');
  });

  test('generate button is present', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByTestId('generate-btn')).toBeVisible();
  });
});
