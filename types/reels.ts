export type AppStep =
  | 'product'
  | 'input'
  | 'script-loading'
  | 'script-review'
  | 'video-loading'
  | 'result';

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
  rawProduct: Record<string, unknown>;
}

export interface GenerationOptions {
  durationSeconds: number;
  outputCount: number;
  cta: string;
  advertisingPurpose: string;
  channel: string;
  mustInclude: string;
  mustExclude: string;
  extraDetails: string;
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
  | 'FAILED';

export type GenerationStage =
  | 'QUEUED'
  | 'SCRIPT_GENERATION'
  | 'SCRIPT_REGENERATION'
  | 'TTS_GENERATION'
  | 'TTS_VALIDATION'
  | 'VIDEO_GENERATION'
  | 'AUDIO_MERGE'
  | 'CAPTION_RENDER'
  | 'COMPLETED'
  | 'FAILED';

export interface GenerationJobStartResponse {
  job_id: string;
  status: GenerationJobStatus;
  status_url: string;
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
}

export interface VideoResult {
  jobId: string | null;
  status: GenerationJobStatus;
  videoUrl: string | null;
  downloadUrl: string | null;
  s3ObjectKey: string | null;
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
    onProgress?: (status: GenerationJobStatusResponse) => void,
  ): Promise<VideoResult>;
  renewVideoUrl(jobId: string, download?: boolean): Promise<string>;
}
