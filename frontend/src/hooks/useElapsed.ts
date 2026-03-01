import { useEffect, useState } from 'react';

export function useElapsed(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('0s');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('0s');
      return;
    }

    const start = new Date(startedAt).getTime();

    const update = () => {
      const secs = Math.floor((Date.now() - start) / 1000);
      if (secs < 60) {
        setElapsed(`${secs}s`);
      } else {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        setElapsed(`${m}m ${s}s`);
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
