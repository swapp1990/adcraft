import React, { useState } from 'react';
import type { GenerateRequest } from '../api/types';

interface ConceptFormProps {
  onSubmit: (req: GenerateRequest) => void;
  isSubmitting: boolean;
  initialConcept?: string;
  submitLabel?: string;
}

const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
const RESOLUTIONS = ['480p', '720p', '1080p'];

const MAX_CONCEPT_LENGTH = 500;

export function ConceptForm({
  onSubmit,
  isSubmitting,
  initialConcept = '',
  submitLabel = 'Generate Ad',
}: ConceptFormProps) {
  const [concept, setConcept] = useState(initialConcept);
  const [numClips, setNumClips] = useState(5);
  const [duration, setDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('480p');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim() || isSubmitting) return;
    onSubmit({
      concept: concept.trim(),
      num_clips: numClips,
      target_duration: duration,
      aspect_ratio: aspectRatio,
      resolution,
    });
  };

  const remaining = MAX_CONCEPT_LENGTH - concept.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="concept-form">
      {/* Concept textarea */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="concept">
          Ad Concept
        </label>
        <textarea
          id="concept"
          data-testid="concept-input"
          className="input-field resize-none h-28"
          placeholder="Describe your ad concept... e.g. 'Ember Roast — premium dark roast coffee for adventurers'"
          value={concept}
          onChange={(e) => setConcept(e.target.value.slice(0, MAX_CONCEPT_LENGTH))}
          disabled={isSubmitting}
          required
        />
        <div className={`text-xs mt-1 text-right ${remaining < 50 ? 'text-amber-400' : 'text-slate-500'}`}>
          {remaining} characters remaining
        </div>
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Number of clips */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="num-clips">
            Clips
          </label>
          <select
            id="num-clips"
            data-testid="num-clips-select"
            className="input-field"
            value={numClips}
            onChange={(e) => setNumClips(Number(e.target.value))}
            disabled={isSubmitting}
          >
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="duration">
            Duration
          </label>
          <select
            id="duration"
            data-testid="duration-select"
            className="input-field"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={isSubmitting}
          >
            {[15, 30, 45, 60].map((d) => (
              <option key={d} value={d}>{d}s</option>
            ))}
          </select>
        </div>

        {/* Aspect ratio */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="aspect-ratio">
            Aspect Ratio
          </label>
          <select
            id="aspect-ratio"
            data-testid="aspect-ratio-select"
            className="input-field"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            disabled={isSubmitting}
          >
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Resolution */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="resolution">
            Resolution
          </label>
          <select
            id="resolution"
            data-testid="resolution-select"
            className="input-field"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={isSubmitting}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit button */}
      <button
        type="submit"
        data-testid="generate-btn"
        className="btn-primary w-full text-lg py-4 flex items-center justify-center gap-2"
        disabled={!concept.trim() || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {submitLabel}
          </>
        )}
      </button>
    </form>
  );
}
