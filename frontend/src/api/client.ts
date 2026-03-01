import type { Job, GenerateRequest, CritiqueRequest } from './types';

const BASE = '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  generateJob: (req: GenerateRequest): Promise<Job> =>
    request('/api/generate', { method: 'POST', body: JSON.stringify(req) }),

  critiqueJob: (req: CritiqueRequest): Promise<Job> =>
    request('/api/critique', { method: 'POST', body: JSON.stringify(req) }),

  getJob: (jobId: string): Promise<Job> =>
    request(`/api/jobs/${jobId}`),

  listJobs: (jobType?: string, limit = 20): Promise<Job[]> => {
    const params = new URLSearchParams();
    if (jobType) params.set('job_type', jobType);
    params.set('limit', String(limit));
    return request(`/api/jobs?${params}`);
  },

  health: (): Promise<{ status: string }> =>
    request('/health'),
};
