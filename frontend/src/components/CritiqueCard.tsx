import type { Job, CritiqueOutput } from '../api/types';

interface CritiqueCardProps {
  job: Job;
}

function ScoreMeter({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color =
    score >= 7 ? 'bg-emerald-400' :
    score >= 4 ? 'bg-amber-400' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 h-3 bg-navy-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-2xl font-bold font-mono ${
        score >= 7 ? 'text-emerald-400' :
        score >= 4 ? 'text-amber-400' :
        'text-red-400'
      }`}>
        {score}/10
      </span>
    </div>
  );
}

export function CritiqueCard({ job }: CritiqueCardProps) {
  const output = job.output as CritiqueOutput;

  return (
    <div className="card p-6 animate-slide-up" data-testid="critique-card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 className="font-semibold text-slate-100">AI Critique</h3>
      </div>

      {/* Score */}
      <div className="mb-5">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Score</div>
        <ScoreMeter score={output.score} />
      </div>

      {/* Top weakness */}
      {(output.top_weakness || output.critique) && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="text-xs text-red-400 uppercase tracking-wider mb-1">Top Weakness</div>
          <p className="text-sm text-slate-200">{output.top_weakness || output.critique}</p>
        </div>
      )}

      {/* Strengths */}
      {output.strengths && output.strengths.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Strengths</div>
          <ul className="space-y-2">
            {output.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <svg className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation */}
      {output.recommendation && (
        <div className="p-4 bg-accent-500/10 border border-accent-500/20 rounded-xl">
          <div className="text-xs text-accent-400 uppercase tracking-wider mb-1">Recommendation</div>
          <p className="text-sm text-slate-200" data-testid="critique-recommendation">
            {output.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
