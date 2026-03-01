import { useState, useCallback, useEffect } from 'react';
import { api } from './api/client';
import type { Job, GenerateRequest, GenerateOutput } from './api/types';
import { useJobPoller } from './hooks/useJobPoller';
import { ConceptForm } from './components/ConceptForm';
import { ProgressView } from './components/ProgressView';
import { VideoPlayer } from './components/VideoPlayer';
import { CritiqueCard } from './components/CritiqueCard';
import { ErrorCard } from './components/ErrorCard';
import { JobHistory } from './components/JobHistory';

// ── App state machine ──────────────────────────────────────────────
type AppMode = 'idle' | 'generating' | 'complete' | 'failed' | 'critiquing' | 'critique-done';

export default function App() {
  const [mode, setMode] = useState<AppMode>('idle');
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [critiqueJobId, setCritiqueJobId] = useState<string | null>(null);
  const [activeGenerateJob, setActiveGenerateJob] = useState<Job | null>(null);
  const [activeCritiqueJob, setActiveCritiqueJob] = useState<Job | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [historyJobs, setHistoryJobs] = useState<Job[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedHistoryJob, setSelectedHistoryJob] = useState<Job | null>(null);
  const [lastConcept, setLastConcept] = useState('');

  // Load job history on mount and after completions
  const loadHistory = useCallback(async () => {
    try {
      const jobs = await api.listJobs(undefined, 20);
      setHistoryJobs(jobs);
    } catch {
      // Non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Poll generate job
  const { job: polledGenerateJob } = useJobPoller({
    jobId: generateJobId,
    intervalMs: 3000,
    onComplete: (job) => {
      setActiveGenerateJob(job);
      setMode('complete');
      loadHistory();
    },
    onFail: (job) => {
      setActiveGenerateJob(job);
      setErrorMsg(job.error || 'Generation failed');
      setMode('failed');
      loadHistory();
    },
  });

  // Keep activeGenerateJob in sync while polling
  useEffect(() => {
    if (polledGenerateJob && mode === 'generating') {
      setActiveGenerateJob(polledGenerateJob);
    }
  }, [polledGenerateJob, mode]);

  // Poll critique job
  const { job: polledCritiqueJob } = useJobPoller({
    jobId: critiqueJobId,
    intervalMs: 3000,
    onComplete: (job) => {
      setActiveCritiqueJob(job);
      setMode('critique-done');
      loadHistory();
    },
    onFail: (job) => {
      setActiveCritiqueJob(job);
      setErrorMsg(job.error || 'Critique failed');
      loadHistory();
    },
  });

  useEffect(() => {
    if (polledCritiqueJob && mode === 'critiquing') {
      setActiveCritiqueJob(polledCritiqueJob);
    }
  }, [polledCritiqueJob, mode]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleGenerate = useCallback(async (req: GenerateRequest) => {
    setMode('generating');
    setLastConcept(req.concept);
    setActiveGenerateJob(null);
    setActiveCritiqueJob(null);
    setCritiqueJobId(null);
    setErrorMsg('');
    setSelectedHistoryJob(null);

    try {
      const job = await api.generateJob(req);
      setGenerateJobId(job.id);
      setActiveGenerateJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start generation';
      setErrorMsg(msg);
      setMode('failed');
    }
  }, []);

  const handleCritique = useCallback(async () => {
    const job = activeGenerateJob;
    if (!job) return;
    const output = job.output as GenerateOutput;
    if (!output?.video_url) return;

    setMode('critiquing');
    setActiveCritiqueJob(null);
    setCritiqueJobId(null);

    try {
      const critiqueJob = await api.critiqueJob({
        video_url: output.video_url,
        concept: lastConcept,
      });
      setCritiqueJobId(critiqueJob.id);
      setActiveCritiqueJob(critiqueJob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start critique';
      setErrorMsg(msg);
      setMode('complete'); // revert to showing video player
    }
  }, [activeGenerateJob, lastConcept]);

  const handleRetry = useCallback(() => {
    setMode('idle');
    setGenerateJobId(null);
    setCritiqueJobId(null);
    setActiveGenerateJob(null);
    setActiveCritiqueJob(null);
    setErrorMsg('');
    setSelectedHistoryJob(null);
  }, []);

  const handleSelectHistoryJob = useCallback((job: Job) => {
    setSelectedHistoryJob(job);
    setGenerateJobId(null);
    setCritiqueJobId(null);
    setActiveGenerateJob(null);
    setActiveCritiqueJob(null);
    setErrorMsg('');
    setMode('idle');
  }, []);

  // ── Rendering helpers ─────────────────────────────────────────────

  const isSubmitting = mode === 'generating' || mode === 'critiquing';
  const isCritiquing = mode === 'critiquing';

  return (
    <div className="min-h-screen bg-navy-900">
      {/* Header */}
      <header className="border-b border-navy-700 bg-navy-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-accent-500 to-accent-400 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-100">AdCraft</span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:block">AI-powered ad video generator</span>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Left column — form + results */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Hero text */}
            {mode === 'idle' && !selectedHistoryJob && (
              <div className="animate-fade-in">
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-2">
                  Create your ad in minutes
                </h1>
                <p className="text-slate-400">
                  Describe your product concept and let AI generate a complete video ad.
                </p>
              </div>
            )}

            {/* Concept form */}
            <div className="card p-6">
              <ConceptForm
                onSubmit={handleGenerate}
                isSubmitting={isSubmitting}
                initialConcept={lastConcept}
                submitLabel={
                  mode === 'complete' || mode === 'critique-done' || mode === 'critiquing'
                    ? 'Regenerate Ad'
                    : 'Generate Ad'
                }
              />
            </div>

            {/* Progress view (while generating) */}
            {mode === 'generating' && activeGenerateJob && (
              <ProgressView job={activeGenerateJob} />
            )}

            {/* Waiting to get job ID */}
            {mode === 'generating' && !activeGenerateJob && (
              <div className="card p-6 animate-fade-in" data-testid="starting-indicator">
                <div className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-accent-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-slate-400">Starting job...</span>
                </div>
              </div>
            )}

            {/* Failed state */}
            {mode === 'failed' && (
              <ErrorCard message={errorMsg} onRetry={handleRetry} />
            )}

            {/* Video player — show when complete/critiquing/critique-done */}
            {(mode === 'complete' || mode === 'critiquing' || mode === 'critique-done') &&
              activeGenerateJob && (
                <VideoPlayer
                  job={activeGenerateJob}
                  onCritique={handleCritique}
                  isCritiquing={isCritiquing}
                />
              )}

            {/* Critique in progress */}
            {mode === 'critiquing' && (
              <div className="card p-6 animate-fade-in" data-testid="critique-progress">
                <div className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-accent-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-slate-400">AI is analyzing your ad... (~25 seconds)</span>
                </div>
              </div>
            )}

            {/* Critique results */}
            {mode === 'critique-done' && activeCritiqueJob && (
              <CritiqueCard job={activeCritiqueJob} />
            )}

            {/* History viewer */}
            {selectedHistoryJob && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-200">Job Details</h2>
                  <button
                    onClick={handleRetry}
                    className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    data-testid="clear-history-btn"
                  >
                    Clear
                  </button>
                </div>

                {selectedHistoryJob.status === 'completed' && selectedHistoryJob.job_type === 'generate' && (
                  <VideoPlayer
                    job={selectedHistoryJob}
                    onCritique={() => {
                      const concept = (selectedHistoryJob.input_params as { concept?: string }).concept || '';
                      setActiveGenerateJob(selectedHistoryJob);
                      setSelectedHistoryJob(null);
                      setLastConcept(concept);
                      setMode('complete');
                    }}
                    isCritiquing={false}
                  />
                )}

                {selectedHistoryJob.status === 'completed' && selectedHistoryJob.job_type === 'critique' && (
                  <CritiqueCard job={selectedHistoryJob} />
                )}

                {selectedHistoryJob.status === 'failed' && (
                  <ErrorCard
                    message={selectedHistoryJob.error || 'Job failed'}
                    onRetry={handleRetry}
                  />
                )}

                {(selectedHistoryJob.status === 'pending' || selectedHistoryJob.status === 'in_progress') && (
                  <ProgressView job={selectedHistoryJob} />
                )}
              </div>
            )}
          </div>

          {/* Right column — job history sidebar */}
          <JobHistory
            jobs={historyJobs}
            activeJobId={
              selectedHistoryJob?.id ??
              (mode !== 'idle' ? activeGenerateJob?.id : undefined) ??
              activeCritiqueJob?.id
            }
            onSelectJob={handleSelectHistoryJob}
            isLoading={historyLoading}
          />
        </div>
      </main>
    </div>
  );
}
