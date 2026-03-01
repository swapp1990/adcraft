import { test, expect } from '@playwright/test';
import { mockGenerateFlow, mockFailedGenerate } from './mock-api';

test.describe('Generate flow', () => {
  test('submitting form shows progress view', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Sunset Coffee — golden hour blend');
    await page.getByTestId('generate-btn').click();

    // Should see progress view or starting indicator
    await expect(
      page.getByTestId('progress-view').or(page.getByTestId('starting-indicator'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('generate button is disabled while generating', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('My coffee ad concept');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('generate-btn')).toBeDisabled();
  });

  test('video player appears after job completes', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Sunset Coffee — golden hour blend');
    await page.getByTestId('generate-btn').click();

    // Wait for video player (polling will eventually return completed job)
    await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 15000 });
  });

  test('video element has a src after generation', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Sunset Coffee');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('video-element')).toBeVisible({ timeout: 15000 });
    const src = await page.getByTestId('video-element').getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toContain('http');
  });

  test('critique button appears after generation', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Sunset Coffee');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('critique-btn')).toBeVisible({ timeout: 15000 });
  });

  test('failed job shows error card with retry button', async ({ page }) => {
    await mockFailedGenerate(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Some concept');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('error-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('retry-btn')).toBeVisible();
  });

  test('retry button resets back to form', async ({ page }) => {
    await mockFailedGenerate(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Some concept');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('error-card')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('retry-btn').click();

    // After retry, error card should disappear and generate button should be back
    // Use a generous timeout since the state transition involves async cleanup
    await expect(page.getByTestId('error-card')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('generate-btn')).toBeEnabled();
  });

  test('concept text is retained after generation', async ({ page }) => {
    await mockGenerateFlow(page);
    await page.goto('/');

    const concept = 'Sunset Coffee — golden hour blend';
    await page.getByTestId('concept-input').fill(concept);
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 15000 });

    // The concept input should still have the text for easy iteration
    const value = await page.getByTestId('concept-input').inputValue();
    expect(value).toBe(concept);
  });
});
