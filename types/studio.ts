import type {
  GenerationJobStatus,
  GenerationStage,
  Product,
  VideoCandidate,
  VisualMode,
} from './reels';

export type StudioTemplateDuration = 4 | 6 | 8 | 15;

export interface TemplateScene {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  description: string;
}

export interface GenerationTemplate {
  id: string;
  version: string;
  name: string;
  shortName: string;
  description: string;
  durationSeconds: StudioTemplateDuration;
  scenes: TemplateScene[];
  supported: boolean;
  unavailableReason: string | null;
}

export interface QuoteLineItem {
  key: string;
  label: string;
  amountUsd: number | null;
}

export interface GenerationQuote {
  quoteId: string;
  configHash: string | null;
  currency: 'USD';
  expectedTotalUsd: number;
  maxTotalUsd: number | null;
  availableBalanceUsd: number | null;
  expiresAt: string | null;
  coverage: string | null;
  disclaimer: string | null;
  lineItems: QuoteLineItem[];
  promptVersion: PromptVersionReference | null;
}

export const PROMPT_TEMPLATE_KEYS = [
  'script_generation',
  'script_tts_repair',
  'video_base',
  'video_identity_reference',
  'video_generated_model',
  'creative_brief',
] as const;

export type PromptTemplateKey = (typeof PROMPT_TEMPLATE_KEYS)[number];

export type PromptTemplates = Record<PromptTemplateKey, string>;

export interface PromptVersionReference {
  id: string;
  version: string;
  name: string;
  contentSha256: string | null;
}

export interface PromptVersion extends PromptVersionReference {
  description: string;
  createdAt: string | null;
  activatedAt: string | null;
  isActive: boolean;
  templates: PromptTemplates;
}

export interface PromptVersionCatalog {
  activeBundleId: string | null;
  versions: PromptVersion[];
}

export interface GenerationRequestLookup {
  clientRequestId: string;
  requestState: 'IN_PROGRESS' | 'ACCEPTED' | 'REJECTED';
  jobId: string | null;
  status: GenerationJobStatus | 'REJECTED';
  stage: GenerationStage | 'REQUEST_VALIDATION' | 'REQUEST_REJECTED' | null;
  statusUrl: string | null;
  recoverable: boolean;
  retryAfterSeconds: number | null;
  error: {
    code: string;
    message: string;
    httpStatus: number;
  } | null;
}

export interface StudioProductSnapshot {
  productId: string | null;
  name: string;
  eventName: string | null;
  imageUrl: string | null;
}

export interface JobTemplateSnapshot {
  id: string | null;
  version: string | null;
  name: string;
  durationSeconds: number | null;
  scenes: TemplateScene[];
  timelineSource: 'server' | 'versioned-template' | 'unrecorded';
}

export interface StudioScriptScene {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  visual: string | null;
  voiceover: string | null;
  subtitle: string | null;
  notes: string | null;
}

export interface StudioScriptDocument {
  summary: string | null;
  scenes: StudioScriptScene[];
}

export interface StudioJobOptions {
  visualMode: VisualMode | null;
  candidateCount: number;
  channel: string | null;
  cta: string | null;
  advertisingPurpose: string | null;
  mustInclude: string | null;
  mustExclude: string | null;
  extraDetails: string | null;
}

export interface TimingSceneValidation {
  id: string;
  label: string;
  expectedStartSeconds: number | null;
  expectedEndSeconds: number | null;
  actualStartSeconds: number | null;
  actualEndSeconds: number | null;
  driftMs: number | null;
  passed: boolean | null;
}

export interface StudioJob {
  jobId: string;
  status: GenerationJobStatus;
  stage: GenerationStage | null;
  message: string | null;
  error: string | null;
  errorCode: string | null;
  retryable: boolean;
  elapsedSeconds: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  revision: string | number | null;
  product: StudioProductSnapshot;
  template: JobTemplateSnapshot;
  options: StudioJobOptions;
  candidateCount: number;
  completedCandidates: number;
  failedCandidates: number;
  estimatedCostUsd: number | null;
  estimatedMaxCostUsd: number | null;
  actualCostUsd: number | null;
  script: StudioScriptDocument | null;
  timingValidation: TimingSceneValidation[];
  assetWarning: string | null;
  promptVersion: PromptVersionReference | null;
  candidates: VideoCandidate[];
}

export interface GenerationListSummary {
  total: number;
  processing: number;
  ready: number;
  needsAttention: number;
  actualCostUsd: number | null;
}

export interface GenerationListResult {
  items: StudioJob[];
  nextCursor: string | null;
  summary: GenerationListSummary;
}

export interface GenerationFilters {
  query: string;
  status: '' | GenerationJobStatus;
  duration: '' | StudioTemplateDuration;
  cursor?: string;
}

export interface CreateDraft {
  product: Product;
  template: GenerationTemplate | null;
  visualMode: VisualMode;
  influencerImageUrls: string[];
  outputCount: number;
  cta: string;
  advertisingPurpose: string;
  channel: string;
  mustInclude: string;
  mustExclude: string;
  extraDetails: string;
  promptVersionId: string | null;
}

export interface StartGenerationInput extends CreateDraft {
  quoteId: string;
  clientRequestId: string;
}

export const TERMINAL_JOB_STATUSES = new Set<GenerationJobStatus>([
  'COMPLETED',
  'PARTIAL_COMPLETED',
  'FAILED',
]);

export function isJobActive(status: GenerationJobStatus): boolean {
  return status === 'PENDING' || status === 'PROCESSING';
}
