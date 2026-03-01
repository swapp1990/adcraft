import { useRef } from 'react';
import type { Job, GenerateOutput } from '../api/types';

interface VideoPlayerProps {
  job: Job;
  onCritique: () => void;
  isCritiquing: boolean;
}

export function VideoPlayer({ job, onCritique, isCritiquing }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const output = job.output as GenerateOutput;

  const handleCopyUrl = () => {
    if (output.video_url) {
      navigator.clipboard.writeText(output.video_url).catch(() => {});
    }
  };

  return (
    <div className="card p-6 animate-slide-up" data-testid="video-player">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h3 className="font-semibold text-slate-100">Ad Generated</h3>
        </div>
        <button
          onClick={handleCopyUrl}
          title="Copy video URL"
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded"
          aria-label="Copy video URL"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* Video element */}
      <div className="rounded-xl overflow-hidden bg-black mb-4">
        <video
          ref={videoRef}
          data-testid="video-element"
          src={output.video_url}
          controls
          playsInline
          className="w-full max-h-[60vh] object-contain"
          poster=""
        >
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Script preview (if available) */}
      {output.script && (
        <details className="mb-4">
          <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-200 transition-colors select-none">
            View script
          </summary>
          <div className="mt-3 p-4 bg-navy-700 rounded-xl text-sm text-slate-300 leading-relaxed whitespace-pre-wrap border border-navy-500">
            {output.script}
          </div>
        </details>
      )}

      {/* Edit notes */}
      {output.edit_notes && (
        <details className="mb-4">
          <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-200 transition-colors select-none">
            Edit notes
          </summary>
          <div className="mt-3 p-4 bg-navy-700 rounded-xl text-sm text-slate-300 leading-relaxed border border-navy-500">
            {output.edit_notes}
          </div>
        </details>
      )}

      {/* Critique button */}
      <button
        data-testid="critique-btn"
        onClick={onCritique}
        disabled={isCritiquing}
        className="btn-secondary w-full flex items-center justify-center gap-2 py-3 mt-2"
      >
        {isCritiquing ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Running critique...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Critique This Ad
          </>
        )}
      </button>
    </div>
  );
}
