import { test, expect } from '@playwright/test';
import { mockEmptyHistory, mockGenerateFlow } from './mock-api';

test.describe('Responsive design', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await mockEmptyHistory(page);
  });

  test('app loads at 375px without horizontal scroll', async ({ page }) => {
    await page.goto('/');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1px tolerance
  });

  test('concept form is visible at mobile width', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('concept-form')).toBeVisible();
  });

  test('generate button is visible and tappable at mobile width', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByTestId('generate-btn');
    await expect(btn).toBeVisible();

    const box = await btn.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(44); // 44px touch target
    expect(box!.width).toBeGreaterThan(0);
  });

  test('all selects are within viewport at mobile', async ({ page }) => {
    await page.goto('/');
    const selects = page.locator('select');
    const count = await selects.count();

    for (let i = 0; i < count; i++) {
      const box = await selects.nth(i).boundingBox();
      if (box) {
        expect(box.x + box.width).toBeLessThanOrEqual(375 + 2); // 2px tolerance
      }
    }
  });

  test('concept textarea font-size is 16px on mobile', async ({ page }) => {
    await page.goto('/');
    const fontSize = await page.getByTestId('concept-input').evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize)
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

  test('no horizontal scroll after generating', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Mobile coffee ad concept');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 15000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('job history sidebar stacks below content on mobile', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByTestId('job-history');
    await expect(sidebar).toBeVisible();

    const box = await sidebar.boundingBox();
    expect(box).toBeTruthy();
    // On mobile, sidebar should be full-width (not a narrow side column)
    expect(box!.width).toBeGreaterThan(300);
  });
});
