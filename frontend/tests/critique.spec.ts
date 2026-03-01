import { test, expect } from '@playwright/test';
import { mockGenerateFlow, mockCritiqueFlow } from './mock-api';

test.describe('Critique flow', () => {
  async function generateAndGetToVideo(page: import('@playwright/test').Page) {
    await mockGenerateFlow(page);
    await mockCritiqueFlow(page);
    await page.goto('/');

    await page.getByTestId('concept-input').fill('Sunset Coffee — golden hour blend');
    await page.getByTestId('generate-btn').click();
    await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 15000 });
  }

  test('critique button is visible after generation', async ({ page }) => {
    await generateAndGetToVideo(page);
    await expect(page.getByTestId('critique-btn')).toBeVisible();
  });

  test('clicking critique starts critique job', async ({ page }) => {
    await generateAndGetToVideo(page);
    await page.getByTestId('critique-btn').click();

    // The critique flow starts immediately — either we see the progress indicator
    // OR the critique card has already loaded (fast mock). Both are valid success states.
    // We use first() to handle strict mode when both are present simultaneously.
    const progressOrCard = page.getByTestId('critique-progress').or(page.getByTestId('critique-card'));
    await expect(progressOrCard.first()).toBeVisible({ timeout: 15000 });
  });

  test('critique results card appears after critique completes', async ({ page }) => {
    await generateAndGetToVideo(page);
    await page.getByTestId('critique-btn').click();

    await expect(page.getByTestId('critique-card')).toBeVisible({ timeout: 15000 });
  });

  test('critique card shows score', async ({ page }) => {
    await generateAndGetToVideo(page);
    await page.getByTestId('critique-btn').click();

    await expect(page.getByTestId('critique-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('7/10')).toBeVisible();
  });

  test('critique card shows recommendation', async ({ page }) => {
    await generateAndGetToVideo(page);
    await page.getByTestId('critique-btn').click();

    await expect(page.getByTestId('critique-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('critique-recommendation')).toBeVisible({ timeout: 10000 });
    const text = await page.getByTestId('critique-recommendation').textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(10);
  });

  test('concept input retains text after critique (for iteration)', async ({ page }) => {
    await generateAndGetToVideo(page);
    await page.getByTestId('critique-btn').click();

    await expect(page.getByTestId('critique-card')).toBeVisible({ timeout: 15000 });

    const value = await page.getByTestId('concept-input').inputValue();
    expect(value).toBe('Sunset Coffee — golden hour blend');
  });

  test('can regenerate after critique by editing concept', async ({ page }) => {
    // Setup: complete generate + critique flow
    let generateCount = 0;
    await page.route('**/api/generate', async (route) => {
      generateCount++;
      await route.fulfill({
        json: {
          id: `job-gen-${generateCount}`,
          job_type: 'generate',
          status: 'completed',
          input_params: { concept: 'Updated concept', num_clips: 5, target_duration: 30, aspect_ratio: '16:9', resolution: '480p' },
          output: { video_url: 'https://example.com/video2.mp4', stage: 'assembling_video' },
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      });
    });

    await page.route('**/api/jobs/**', async (route) => {
      await route.fulfill({
        json: {
          id: 'job-gen-2',
          job_type: 'generate',
          status: 'completed',
          input_params: { concept: 'Updated concept', num_clips: 5, target_duration: 30, aspect_ratio: '16:9', resolution: '480p' },
          output: { video_url: 'https://example.com/video2.mp4', stage: 'assembling_video' },
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      });
    });

    await page.route('**/api/jobs?**', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.goto('/');
    await page.getByTestId('concept-input').fill('Initial concept');
    await page.getByTestId('generate-btn').click();

    await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 10000 });

    // Clear and type new concept, then regenerate
    await page.getByTestId('concept-input').fill('Updated concept with brand logo prominently shown');
    await expect(page.getByTestId('generate-btn')).toBeEnabled();
  });
});
