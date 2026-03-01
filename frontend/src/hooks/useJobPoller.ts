import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Job } from '../api/types';

interface UseJobPollerOptions {
  jobId: string | null;
  intervalMs?: number;
  onComplete?: (job: Job) => void;
  onFail?: (job: Job) => void;
}

export function useJobPoller({
  jobId,
  intervalMs = 3000,
  onComplete,
  onFail,
}: UseJobPollerOptions) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use refs so callbacks always reference the latest version without triggering re-subscriptions
  const onCompleteRef = useRef(onComplete);
  const onFailRef = useRef(onFail);
  onCompleteRef.current = onComplete;
  onFailRef.current = onFail;

  const errorCountRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setError(null);
      return;
    }

    errorCountRef.current = 0;
    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const j = await api.getJob(jobId);
        if (stopped) return; // Job ID changed while request was in flight

        errorCountRef.current = 0;
        setJob(j);
        setError(null);

        if (j.status === 'completed') {
          stopped = true;
          if (intervalId) clearInterval(intervalId);
          onCompleteRef.current?.(j);
        } else if (j.status === 'failed') {
          stopped = true;
          if (intervalId) clearInterval(intervalId);
          onFailRef.current?.(j);
        }
      } catch (err) {
        if (stopped) return;
        errorCountRef.current++;
        const msg = err instanceof Error ? err.message : 'Polling error';
        setError(msg);

        if (errorCountRef.current >= 5) {
          stopped = true;
          if (intervalId) clearInterval(intervalId);
        }
      }
    };

    poll();
    intervalId = setInterval(poll, intervalMs);

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, intervalMs]);

  return { job, error };
}
