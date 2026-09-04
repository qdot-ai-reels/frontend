export type AppStep =
  | 'product'
  | 'input'
  | 'script-loading'
  | 'script-review'
  | 'video-loading'
  | 'result';

export type VisualMode = 'product_only' | 'model_included' | 'generated_model';

export interface Product {
  eventId: string;
  eventName: string;
  curator: string;
  productId: string;
  name: string;
  option: string;
  salePrice: number;
  discountLabel: string;
  imageUrl: string;
  squareOutputStrategy?: 'reject' | 'center_crop';
  rawProduct: Record<string, unknown>;
}

export interface GenerationOptions {
  durationSeconds: number;
  outputCount: number;
  visualMode: VisualMode;
  influencerImageUrls: string[];
  cta: string;
  advertisingPurpose: string;
  channel: string;
  mustInclude: string;
  mustExclude: string;
  extraDetails: string;
  promptVersionId?: string | null;
}

export interface ScriptScene {
  scene_name: string;
  time_range_sec: {
    start: number;
    end: number;
  };
  visual: string;
  auditory: {
    subtitle: string;
    voiceover: string | null;
  };
  notes: string;
}

export interface ScriptDocument {
  meta: {
    output_format_version: string;
    framework: string;
    language: string;
  };
  summary: {
    main_target: string;
    pain_point: string;
    product_usp: string;
    key_message: string;
    tone_and_manner: string;
  };
  scenes: ScriptScene[];
  compliance_notes: {
    avoid: string[];
    focus: string[];
  };
}

export type GenerationJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIAL_COMPLETED'
  | 'FAILED';

export type GenerationStage =
  | 'QUEUED'
  | 'SCRIPT_GENERATION'
  | 'SCRIPT_REGENERATION'
  | 'TTS_GENERATION'
  | 'TTS_VALIDATION'
  | 'TTS_FALLBACK'
  | 'VIDEO_GENERATION'
  | 'AUDIO_MERGE'
  | 'CAPTION_RENDER'
  | 'COMPLETED'
  | 'FAILED';

export interface GenerationJobStartResponse {
  job_id: string;
  status: GenerationJobStatus;
  status_url: string;
  candidate_count?: number;
}

export interface ScriptJobStatusResponse extends GenerationJobStatusResponse {
  input_type?: string;
  script?: unknown;
}

export interface GenerationJobStatusResponse {
  job_id: string;
  status: GenerationJobStatus;
  stage?: GenerationStage | null;
  elapsed_seconds?: number | null;
  message?: string | null;
  error?: string | null;
  error_code?: string | null;
  retryable?: boolean | null;
  video_url?: string | null;
  download_url?: string | null;
  candidate_count?: number;
  completed_candidates?: number;
  failed_candidates?: number;
  visual_mode?: VisualMode | null;
  influencer_reference_count?: number | null;
  candidates?: GenerationCandidateStatusResponse[];
}

export interface GenerationCandidateStatusResponse {
  candidate_id: string;
  index: number;
  status: GenerationJobStatus;
  stage?: GenerationStage | null;
  provider_job_id?: string | null;
  caption_job_id?: string | null;
  attempts?: number | null;
  cost?: number | null;
  validation?: CandidateValidationMetadata | null;
  error?: string | null;
  error_code?: string | null;
  retryable?: boolean | null;
  video_url?: string | null;
  download_url?: string | null;
}

export interface CandidateValidationMetadata {
  passed?: boolean;
  valid?: boolean;
  is_valid?: boolean;
  score?: number;
  width?: number;
  height?: number;
  resolution?: string;
  duration_seconds?: number;
  fps?: number;
  bitrate_kbps?: number;
  codec?: string;
  checks?: Record<string, CandidateValidationCheck | boolean>;
  provider_checks?: Record<string, CandidateValidationCheck | boolean> | null;
  provider?: Record<string, CandidateValidationCheck | boolean> | null;
  final?: Record<string, CandidateValidationCheck | boolean> | null;
  source_normalized?: boolean;
  normalization_strategy?: 'center_crop' | null;
  source_width?: number;
  source_height?: number;
  warnings?: string[];
  errors?: string[];
  [key: string]: unknown;
}

export interface CandidateValidationCheck {
  passed?: boolean;
  expected?: unknown;
  actual?: unknown;
  expected_seconds?: number;
  actual_seconds?: number;
}

export interface VideoCandidate {
  candidateId: string;
  index: number;
  status: GenerationJobStatus;
  stage: GenerationStage | null;
  providerJobId: string | null;
  captionJobId: string | null;
  attempts: number | null;
  cost: number | null;
  validation: CandidateValidationMetadata | null;
  error: string | null;
  errorCode: string | null;
  retryable: boolean;
  videoUrl: string | null;
  downloadUrl: string | null;
}

export interface GenerationProgress {
  jobId: string;
  status: GenerationJobStatus;
  stage: GenerationStage | null;
  elapsedSeconds: number | null;
  message: string | null;
  candidateCount: number;
  completedCandidates: number;
  failedCandidates: number;
  visualMode: VisualMode | null;
  influencerReferenceCount: number | null;
  candidates: VideoCandidate[];
}

export interface VideoResult {
  jobId: string;
  status: GenerationJobStatus;
  candidateCount: number;
  completedCandidates: number;
  failedCandidates: number;
  visualMode: VisualMode | null;
  influencerReferenceCount: number | null;
  candidates: VideoCandidate[];
}

export interface ReelsApi {
  generateScript(
    product: Product,
    options: GenerationOptions,
  ): Promise<ScriptDocument>;
  generateFinalVideo(
    product: Product,
    script: ScriptDocument,
    options: GenerationOptions,
    onProgress?: (status: GenerationProgress) => void,
  ): Promise<VideoResult>;
  resumeGeneration(
    jobId: string,
    onProgress?: (status: GenerationProgress) => void,
  ): Promise<VideoResult>;
  retryCandidate(
    jobId: string,
    candidateId: string,
    onProgress?: (status: GenerationProgress) => void,
  ): Promise<VideoResult>;
  renewVideoUrl(
    jobId: string,
    candidateId: string,
    download?: boolean,
  ): Promise<string>;
}
