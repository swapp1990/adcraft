import type { Job, GenerateOutput } from '../api/types';
import { useElapsed } from '../hooks/useElapsed';

const PIPELINE_STAGES = [
  { key: 'writing_script', label: 'Writing script' },
  { key: 'creating_prompts', label: 'Creating clip prompts' },
  { key: 'generating_clips', label: 'Generating clips' },
  { key: 'analyzing_clips', label: 'Analyzing clips' },
  { key: 'assembling_video', label: 'Assembling video' },
];

function getStageIndex(stage?: string): number {
  if (!stage) return 0;
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx : 0;
}

interface ProgressViewProps {
  job: Job;
}

export function ProgressView({ job }: ProgressViewProps) {
  const elapsed = useElapsed(job.started_at || job.created_at);
  const output = job.output as GenerateOutput | null;
  const currentStage = output?.stage;
  const currentStageIdx = getStageIndex(currentStage);
  const clipsTotal = output?.clips_total ?? (job.input_params as { num_clips?: number }).num_clips ?? 5;
  const clipsDone = output?.clips_done ?? 0;

  const isGeneratingClips = currentStage === 'generating_clips';

  return (
    <div className="card p-6 animate-fade-in" data-testid="progress-view">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-accent-500 rounded-full animate-pulse" />
          <h3 className="font-semibold text-slate-100">Generating your ad...</h3>
        </div>
        <div className="text-sm text-slate-400 font-mono" data-testid="elapsed-time">
          {elapsed}
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="space-y-3 mb-6">
        {PIPELINE_STAGES.map((stage, idx) => {
          const isDone = idx < currentStageIdx;
          const isCurrent = idx === currentStageIdx;

          return (
            <div key={stage.key} className="flex items-center gap-3" data-testid={`stage-${stage.key}`}>
              {/* Status icon */}
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                {isDone ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <svg className="w-5 h-5 text-accent-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-navy-500" />
                )}
              </div>

              {/* Stage label */}
              <span className={`text-sm font-medium ${
                isDone ? 'text-emerald-400' :
                isCurrent ? 'text-slate-100' :
                'text-slate-500'
              }`}>
                {stage.label}
                {isCurrent && isGeneratingClips && (
                  <span className="ml-2 text-accent-400 font-mono">
                    {clipsDone}/{clipsTotal}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Clip dots (shown during generating_clips) */}
      {isGeneratingClips && (
        <div className="flex gap-2 flex-wrap mb-4" data-testid="clip-dots">
          {Array.from({ length: clipsTotal }, (_, i) => {
            let cls = 'clip-dot clip-dot-pending';
            if (i < clipsDone) cls = 'clip-dot clip-dot-done';
            else if (i === clipsDone) cls = 'clip-dot clip-dot-generating';
            return <div key={i} className={cls} />;
          })}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 bg-navy-700 rounded-full overflow-hidden">
        <div
          className="h-full progress-shimmer rounded-full transition-all duration-700"
          style={{ width: `${Math.max(5, ((currentStageIdx) / PIPELINE_STAGES.length) * 100)}%` }}
        />
      </div>

      {/* Status text */}
      <p className="text-xs text-slate-500 mt-3">
        {job.status === 'pending'
          ? 'Job queued — starting soon...'
          : `Step ${currentStageIdx + 1} of ${PIPELINE_STAGES.length} — this may take several minutes`}
      </p>
    </div>
  );
}
