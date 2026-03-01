import type { Job, GenerateInput } from '../api/types';

interface JobHistoryProps {
  jobs: Job[];
  activeJobId?: string | null;
  onSelectJob: (job: Job) => void;
  onDeleteJob?: (jobId: string) => void;
  isLoading: boolean;
}

function statusBadge(status: Job['status']) {
  const cfg: Record<string, { cls: string; label: string }> = {
    pending:     { cls: 'bg-slate-600 text-slate-300',  label: 'Pending' },
    in_progress: { cls: 'bg-amber-500/20 text-amber-400', label: 'Running' },
    completed:   { cls: 'bg-emerald-500/20 text-emerald-400', label: 'Done' },
    failed:      { cls: 'bg-red-500/20 text-red-400',   label: 'Failed' },
    cancelled:   { cls: 'bg-slate-500/20 text-slate-400', label: 'Stopped' },
  };
  const { cls, label } = cfg[status] ?? cfg.pending;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function typeBadge(type: Job['job_type']) {
  return type === 'generate'
    ? <span className="text-xs text-accent-400 font-medium">Generate</span>
    : <span className="text-xs text-amber-400 font-medium">Critique</span>;
}

function conceptSnippet(job: Job): string {
  const params = job.input_params as GenerateInput & { concept?: string; video_url?: string };
  const text = params.concept || params.video_url || '';
  return text.length > 60 ? text.slice(0, 60) + '...' : text;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function JobHistory({ jobs, activeJobId, onSelectJob, onDeleteJob, isLoading }: JobHistoryProps) {
  return (
    <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0" data-testid="job-history">
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Recent Jobs
        </h2>

        {isLoading && jobs.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-navy-700 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && jobs.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-6">
            No jobs yet. Generate your first ad!
          </p>
        )}

        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <div
                role="button"
                tabIndex={0}
                data-testid={`history-job-${job.id}`}
                onClick={() => onSelectJob(job)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectJob(job); }}
                className={`w-full text-left p-3 rounded-xl transition-all duration-150 border cursor-pointer ${
                  activeJobId === job.id
                    ? 'bg-accent-500/10 border-accent-500/40'
                    : 'bg-navy-700/50 border-transparent hover:bg-navy-700 hover:border-navy-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  {typeBadge(job.job_type)}
                  {statusBadge(job.status)}
                </div>
                <p className="text-xs text-slate-300 truncate leading-relaxed">
                  {conceptSnippet(job)}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">
                    {timeAgo(job.created_at)}
                  </p>
                  {onDeleteJob && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteJob(job.id); }}
                      className="text-xs text-slate-600 hover:text-red-400 transition-colors p-1 -mr-1"
                      data-testid={`delete-job-${job.id}`}
                      title="Delete job"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
