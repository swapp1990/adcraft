import { test, expect } from '@playwright/test';
import { mockEmptyHistory } from './mock-api';

test.describe('Smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockEmptyHistory(page);
  });

  test('app loads and shows the header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('AdCraft')).toBeVisible();
  });

  test('concept form renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('concept-form')).toBeVisible();
    await expect(page.getByTestId('concept-input')).toBeVisible();
  });

  test('all setting selects render', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('num-clips-select')).toBeVisible();
    await expect(page.getByTestId('duration-select')).toBeVisible();
    await expect(page.getByTestId('aspect-ratio-select')).toBeVisible();
    await expect(page.getByTestId('resolution-select')).toBeVisible();
  });

  test('generate button is disabled when concept is empty', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByTestId('generate-btn');
    await expect(btn).toBeDisabled();
  });

  test('generate button enables when concept has text', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('concept-input').fill('My great product ad');
    const btn = page.getByTestId('generate-btn');
    await expect(btn).toBeEnabled();
  });

  test('settings dropdowns accept user selection', async ({ page }) => {
    await page.goto('/');
    const durationSelect = page.getByTestId('duration-select');
    await durationSelect.selectOption('60');
    await expect(durationSelect).toHaveValue('60');
  });

  test('job history sidebar renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('job-history')).toBeVisible();
  });

  test('hero text is visible on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Create your ad in minutes')).toBeVisible();
  });

  test('inputs have font-size of 16px or larger (no iOS zoom)', async ({ page }) => {
    await page.goto('/');
    const textarea = page.getByTestId('concept-input');
    const fontSize = await textarea.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
