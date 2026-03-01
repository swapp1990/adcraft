import type { Page, Route } from '@playwright/test';

// ── Canonical mock data ──────────────────────────────────────────────

export const MOCK_GENERATE_JOB_PENDING = {
  id: 'job-gen-001',
  job_type: 'generate',
  status: 'pending',
  input_params: {
    concept: 'Sunset Coffee — golden hour blend',
    num_clips: 3,
    target_duration: 15,
    aspect_ratio: '16:9',
    resolution: '480p',
  },
  output: null,
  error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
};

export const MOCK_GENERATE_JOB_IN_PROGRESS = {
  ...MOCK_GENERATE_JOB_PENDING,
  status: 'in_progress',
  started_at: new Date().toISOString(),
  output: { stage: 'writing_script' },
};

export const MOCK_GENERATE_JOB_COMPLETE = {
  ...MOCK_GENERATE_JOB_PENDING,
  status: 'completed',
  started_at: new Date(Date.now() - 60000).toISOString(),
  completed_at: new Date().toISOString(),
  output: {
    video_url: 'https://example.com/test-video.mp4',
    script: 'A cup of Sunset Coffee glows in golden light...',
    clip_urls: ['https://example.com/clip1.mp4', 'https://example.com/clip2.mp4'],
    edit_notes: 'Smooth transitions between clips.',
    stage: 'assembling_video',
  },
};

export const MOCK_GENERATE_JOB_FAILED = {
  ...MOCK_GENERATE_JOB_PENDING,
  id: 'job-gen-fail',
  status: 'failed',
  error: 'API quota exceeded',
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
};

export const MOCK_CRITIQUE_JOB_PENDING = {
  id: 'job-crit-001',
  job_type: 'critique',
  status: 'pending',
  input_params: {
    video_url: 'https://example.com/test-video.mp4',
    concept: 'Sunset Coffee — golden hour blend',
  },
  output: null,
  error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
};

export const MOCK_CRITIQUE_JOB_COMPLETE = {
  ...MOCK_CRITIQUE_JOB_PENDING,
  status: 'completed',
  started_at: new Date(Date.now() - 25000).toISOString(),
  completed_at: new Date().toISOString(),
  output: {
    score: 7,
    critique: 'No brand logo visible in the first 3 seconds.',
    top_weakness: 'No brand logo visible in the first 3 seconds.',
    strengths: [
      'Beautiful golden-hour cinematography',
      'Clear product focus throughout',
      'Strong emotional hook at the opening',
    ],
    recommendation: 'Add a brand logo overlay in the first 3 seconds and include a clear call-to-action at the end.',
  },
};

export const MOCK_JOB_LIST = [MOCK_GENERATE_JOB_COMPLETE, MOCK_CRITIQUE_JOB_COMPLETE];

// ── Route interceptors ───────────────────────────────────────────────

/**
 * Mock a successful generate flow:
 * POST /api/generate → pending job
 * GET /api/jobs/job-gen-001 → first call: in_progress, second+: completed
 */
export async function mockGenerateFlow(page: Page) {
  let pollCount = 0;

  await page.route('**/api/generate', async (route: Route) => {
    await route.fulfill({ json: MOCK_GENERATE_JOB_PENDING });
  });

  await page.route('**/api/jobs/job-gen-001', async (route: Route) => {
    pollCount++;
    const job = pollCount <= 1 ? MOCK_GENERATE_JOB_IN_PROGRESS : MOCK_GENERATE_JOB_COMPLETE;
    await route.fulfill({ json: job });
  });

  await page.route('**/api/jobs?**', async (route: Route) => {
    await route.fulfill({ json: MOCK_JOB_LIST });
  });
}

/**
 * Mock a critique flow (assumes generate already done):
 * POST /api/critique → pending
 * GET /api/jobs/job-crit-001 → completed
 */
export async function mockCritiqueFlow(page: Page) {
  await page.route('**/api/critique', async (route: Route) => {
    await route.fulfill({ json: MOCK_CRITIQUE_JOB_PENDING });
  });

  await page.route('**/api/jobs/job-crit-001', async (route: Route) => {
    await route.fulfill({ json: MOCK_CRITIQUE_JOB_COMPLETE });
  });
}

/**
 * Mock empty job history (no prior jobs)
 */
export async function mockEmptyHistory(page: Page) {
  await page.route('**/api/jobs?**', async (route: Route) => {
    await route.fulfill({ json: [] });
  });
}

/**
 * Mock job history with some jobs
 */
export async function mockJobHistory(page: Page) {
  await page.route('**/api/jobs?**', async (route: Route) => {
    await route.fulfill({ json: MOCK_JOB_LIST });
  });
}

/**
 * Mock a failed generate job
 */
export async function mockFailedGenerate(page: Page) {
  await page.route('**/api/generate', async (route: Route) => {
    await route.fulfill({ json: MOCK_GENERATE_JOB_FAILED });
  });

  await page.route('**/api/jobs/job-gen-fail', async (route: Route) => {
    await route.fulfill({ json: MOCK_GENERATE_JOB_FAILED });
  });

  await page.route('**/api/jobs?**', async (route: Route) => {
    await route.fulfill({ json: [] });
  });
}
