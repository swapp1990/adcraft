export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type JobType = 'generate' | 'critique';

export interface GenerateInput {
  concept: string;
  num_clips: number;
  target_duration: number;
  aspect_ratio: string;
  resolution: string;
}

export interface CritiqueInput {
  video_url: string;
  concept: string;
}

export interface GenerateOutput {
  video_url: string;
  script?: string;
  clip_urls?: string[];
  edit_notes?: string;
  metadata?: Record<string, unknown>;
  stage?: string;
  clips_done?: number;
  clips_total?: number;
}

export interface CritiqueOutput {
  critique: string;
  score: number;
  strengths: string[];
  recommendation: string;
  top_weakness?: string;
}

export interface Job {
  id: string;
  job_type: JobType;
  status: JobStatus;
  input_params: GenerateInput | CritiqueInput;
  output: GenerateOutput | CritiqueOutput | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface GenerateRequest {
  concept: string;
  num_clips: number;
  target_duration: number;
  aspect_ratio: string;
  resolution: string;
}

export interface CritiqueRequest {
  video_url: string;
  concept: string;
}
