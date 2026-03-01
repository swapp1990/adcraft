import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://adcraft.swapp1990.org';

test.describe('Deployed health checks', () => {
  test('GET /health returns 200 with healthy status', async ({ request }) => {
    const response = await request.get(`${BASE}/health`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('GET /api/jobs returns 200', async ({ request }) => {
    const response = await request.get(`${BASE}/api/jobs`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/jobs with job_type filter returns 200', async ({ request }) => {
    const response = await request.get(`${BASE}/api/jobs?job_type=generate&limit=5`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/jobs/nonexistent returns 404', async ({ request }) => {
    const response = await request.get(`${BASE}/api/jobs/000000000000000000000000`);
    expect(response.status()).toBe(404);
  });
});
