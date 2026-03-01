import type { Job, GenerateInput } from '../api/types';

interface JobHistoryProps {
  jobs: Job[];
  activeJobId?: string | null;
  onSelectJob: (job: Job) => void;
  isLoading: boolean;
}

function statusBadge(status: Job['status']) {
  const cfg = {
    pending:     { cls: 'bg-slate-600 text-slate-300',  label: 'Pending' },
    in_progress: { cls: 'bg-amber-500/20 text-amber-400', label: 'Running' },
    completed:   { cls: 'bg-emerald-500/20 text-emerald-400', label: 'Done' },
    failed:      { cls: 'bg-red-500/20 text-red-400',   label: 'Failed' },
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

export function JobHistory({ jobs, activeJobId, onSelectJob, isLoading }: JobHistoryProps) {
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
              <button
                data-testid={`history-job-${job.id}`}
                onClick={() => onSelectJob(job)}
                className={`w-full text-left p-3 rounded-xl transition-all duration-150 border ${
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
                <p className="text-xs text-slate-500 mt-1">
                  {timeAgo(job.created_at)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
