import type {
  CandidateValidationMetadata,
  GenerationJobStartResponse,
  GenerationJobStatus,
  GenerationJobStatusResponse,
  GenerationOptions,
  GenerationProgress,
  GenerationStage,
  Product,
  ReelsApi,
  ScriptDocument,
  ScriptJobStatusResponse,
  VideoCandidate,
  VideoResult,
  VisualMode,
} from '../types/reels';
import { activeInfluencerReferenceUrls } from './influencer-references';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:8000';

const STATUS_POLL_INTERVAL_MS = 2_000;
// Five script attempts can each spend up to one provider request timeout.
// Keep enough time for retries while the browser only polls the job status.
const SCRIPT_STATUS_POLL_TIMEOUT_MS = 10 * 60 * 1_000;
const MINIMUM_VIDEO_POLL_TIMEOUT_MS = 30 * 60 * 1_000;
const SHARED_VIDEO_STAGE_TIMEOUT_MS = 10 * 60 * 1_000;
const VIDEO_CANDIDATE_TIMEOUT_MS = 20 * 60 * 1_000;

const GENERATION_STAGE_MESSAGES: Record<string, string> = {
  SCRIPT_GENERATION: '스크립트 생성 단계',
  SCRIPT_REGENERATION: '스크립트 재생성 단계',
  TTS_GENERATION: 'TTS 생성 단계',
  TTS_VALIDATION: 'TTS 검증 단계',
  TTS_FALLBACK: '장면 음성 길이 보정 단계',
  VIDEO_GENERATION: '영상 생성 단계',
  AUDIO_MERGE: '영상과 음성 결합 단계',
  CAPTION_RENDER: 'Caption 적용 단계',
};

const JOB_STATUSES = new Set<GenerationJobStatus>([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'PARTIAL_COMPLETED',
  'FAILED',
]);

const GENERATION_STAGES = new Set<GenerationStage>([
  'QUEUED',
  'SCRIPT_GENERATION',
  'SCRIPT_REGENERATION',
  'TTS_GENERATION',
  'TTS_VALIDATION',
  'TTS_FALLBACK',
  'VIDEO_GENERATION',
  'AUDIO_MERGE',
  'CAPTION_RENDER',
  'COMPLETED',
  'FAILED',
]);

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

type JsonRecord = Record<string, unknown>;

function apiUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

function optionalApiUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? apiUrl(value) : null;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === 'string') {
      return payload.detail;
    }
    if (payload.detail && typeof payload.detail === 'object') {
      const detail = payload.detail as { message?: unknown; stage?: unknown };
      if (typeof detail.message === 'string') {
        const stageLabel =
          typeof detail.stage === 'string'
            ? GENERATION_STAGE_MESSAGES[detail.stage] || detail.stage
            : null;
        return detail.stage
          ? `${stageLabel}에서 실패했습니다. ${detail.message}`
          : detail.message;
      }
    }
    if (payload.detail) {
      return JSON.stringify(payload.detail);
    }
  } catch {
    // The provider can return an empty or non-JSON error response.
  }
  return fallback;
}

function buildAdditionalPrompt(options: GenerationOptions): string {
  return [
    `광고 목적: ${options.advertisingPurpose}`,
    `CTA: ${options.cta}`,
    options.visualMode === 'model_included'
      ? '장면 구성: 모든 장면에서 제공된 동일 모델의 얼굴이 명확히 보이게 유지. 립싱크 금지. 양손은 프레임 밖에 두고 상품을 가리거나 겹치지 않게 배치'
      : options.visualMode === 'generated_model'
        ? '장면 구성: 실존 인물을 모사하지 않는 성인 한국인 여성 AI 가상 모델 한 명을 새로 생성. 얼굴과 상반신이 대부분의 장면에서 명확히 보이고, 상품을 자연스럽게 들어 소개. 인물·의상·손·상품 형태를 일관되게 유지. 립싱크와 화면 내 추가 문구 금지'
        : '장면 구성: 인물이나 모델 없이 상품만 사용',
    options.mustInclude && `반드시 포함: ${options.mustInclude}`,
    options.mustExclude && `포함 금지: ${options.mustExclude}`,
    options.extraDetails && `추가 요청: ${options.extraDetails}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asFiniteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function asJobStatus(value: unknown, fallback: GenerationJobStatus): GenerationJobStatus {
  return typeof value === 'string' && JOB_STATUSES.has(value as GenerationJobStatus)
    ? (value as GenerationJobStatus)
    : fallback;
}

function asGenerationStage(value: unknown): GenerationStage | null {
  return typeof value === 'string' && GENERATION_STAGES.has(value as GenerationStage)
    ? (value as GenerationStage)
    : null;
}

function asVisualMode(value: unknown): VisualMode | null {
  return value === 'product_only' ||
    value === 'model_included' ||
    value === 'generated_model'
    ? value
    : null;
}

function normalizeValidation(value: unknown): CandidateValidationMetadata | null {
  const validation = asRecord(value);
  if (Object.keys(validation).length === 0) return null;

  const finalChecks = asRecord(validation.final);
  const providerChecks = asRecord(validation.provider_checks);
  const legacyProviderChecks = asRecord(validation.provider);
  const nestedChecks = asRecord(validation.checks);
  const directChecks = Object.fromEntries(
    Object.entries(validation).filter(([, check]) => {
      const record = asRecord(check);
      return typeof record.passed === 'boolean';
    }),
  );
  const rawChecks =
    Object.keys(finalChecks).length > 0
      ? finalChecks
      : Object.keys(nestedChecks).length > 0
      ? nestedChecks
      : Object.keys(directChecks).length > 0
        ? directChecks
        : Object.keys(providerChecks).length > 0
          ? providerChecks
          : legacyProviderChecks;
  const checkEntries = Object.entries(rawChecks);
  const normalized = {
    ...validation,
    checks: rawChecks,
  } as CandidateValidationMetadata;

  if (
    typeof normalized.valid !== 'boolean' &&
    typeof normalized.passed !== 'boolean' &&
    typeof normalized.is_valid !== 'boolean' &&
    checkEntries.length > 0
  ) {
    normalized.valid = checkEntries.every(([, check]) => asRecord(check).passed === true);
  }
  if (typeof normalized.score !== 'number' && checkEntries.length > 0) {
    const passedChecks = checkEntries.filter(
      ([, check]) => asRecord(check).passed === true,
    ).length;
    normalized.score = Math.round((passedChecks / checkEntries.length) * 100);
  }

  const resolution = asRecord(rawChecks.resolution).actual;
  if (typeof resolution === 'string') {
    normalized.resolution ??= resolution;
    const match = resolution.match(/^(\d+)x(\d+)$/i);
    if (match) {
      normalized.width ??= Number(match[1]);
      normalized.height ??= Number(match[2]);
    }
  }
  const duration = asRecord(rawChecks.duration).actual_seconds;
  normalized.duration_seconds ??= asFiniteNumber(duration) ?? undefined;
  normalized.fps ??= asFiniteNumber(asRecord(rawChecks.fps).actual) ?? undefined;
  const codec = asRecord(rawChecks.codec).actual;
  normalized.codec ??= typeof codec === 'string' ? codec : undefined;
  const bitrate = asFiniteNumber(asRecord(rawChecks.bitrate).actual);
  normalized.bitrate_kbps ??= bitrate == null ? undefined : Math.round(bitrate / 1_000);
  normalized.errors ??= checkEntries
    .filter(([, check]) => asRecord(check).passed === false)
    .map(([name]) => name);

  return normalized;
}

function normalizeCandidate(
  value: unknown,
  fallbackIndex: number,
  fallbackStatus: GenerationJobStatus,
  fallbackError: string | null,
): VideoCandidate {
  const candidate = asRecord(value);
  const index = asFiniteNumber(candidate.index) ?? fallbackIndex;
  const status = asJobStatus(candidate.status, fallbackStatus);
  const candidateId =
    typeof candidate.candidate_id === 'string' && candidate.candidate_id
      ? candidate.candidate_id
      : `candidate-${String(index).padStart(2, '0')}`;

  return {
    candidateId,
    index,
    status,
    stage: asGenerationStage(candidate.stage),
    providerJobId:
      typeof candidate.provider_job_id === 'string' ? candidate.provider_job_id : null,
    captionJobId:
      typeof candidate.caption_job_id === 'string' ? candidate.caption_job_id : null,
    attempts: asFiniteNumber(candidate.attempts),
    cost: asFiniteNumber(candidate.cost),
    validation: normalizeValidation(candidate.validation),
    error: typeof candidate.error === 'string' ? candidate.error : fallbackError,
    errorCode: typeof candidate.error_code === 'string' ? candidate.error_code : null,
    retryable:
      typeof candidate.retryable === 'boolean'
        ? candidate.retryable
        : status === 'FAILED',
    videoUrl: optionalApiUrl(candidate.video_url),
    downloadUrl: optionalApiUrl(candidate.download_url),
  };
}

function normalizeProgress(
  payload: GenerationJobStatusResponse,
  fallbackJobId: string,
): GenerationProgress {
  const status = asJobStatus(payload.status, 'PROCESSING');
  const requestedCount = asFiniteNumber(payload.candidate_count);
  const candidateCount = Math.max(1, Math.min(4, requestedCount ?? payload.candidates?.length ?? 1));
  const topLevelError = typeof payload.error === 'string' ? payload.error : null;
  let candidates = Array.isArray(payload.candidates)
    ? payload.candidates.map((candidate, index) =>
        normalizeCandidate(candidate, index + 1, status, topLevelError),
      )
    : [];

  // Keep old single-output servers usable during a rolling deployment.
  if (candidates.length === 0 && (payload.video_url || payload.download_url)) {
    candidates = [
      normalizeCandidate(
        {
          candidate_id: 'candidate-01',
          index: 1,
          status,
          stage: payload.stage,
          error: payload.error,
          error_code: payload.error_code,
          retryable: payload.retryable,
          video_url: payload.video_url,
          download_url: payload.download_url,
        },
        1,
        status,
        topLevelError,
      ),
    ];
  }

  if (candidates.length === 0) {
    candidates = Array.from({ length: candidateCount }, (_, index) =>
      normalizeCandidate(
        {
          candidate_id: `candidate-${String(index + 1).padStart(2, '0')}`,
          index: index + 1,
          status,
          stage: payload.stage,
          error: payload.error,
          error_code: payload.error_code,
          retryable: payload.retryable,
        },
        index + 1,
        status,
        topLevelError,
      ),
    );
  }

  if (status === 'FAILED') {
    candidates = candidates.map((candidate) =>
      candidate.status === 'COMPLETED' || candidate.status === 'FAILED'
        ? candidate
        : {
            ...candidate,
            status: 'FAILED',
            stage: asGenerationStage(payload.stage) ?? 'FAILED',
            error: candidate.error ?? topLevelError ?? '공통 생성 단계에서 실패했습니다.',
            retryable: false,
          },
    );
  }

  const completedFromCandidates = candidates.filter(
    (candidate) => candidate.status === 'COMPLETED',
  ).length;
  const failedFromCandidates = candidates.filter(
    (candidate) => candidate.status === 'FAILED',
  ).length;
  const referenceCount = asFiniteNumber(payload.influencer_reference_count);

  return {
    jobId: payload.job_id || fallbackJobId,
    status,
    stage: asGenerationStage(payload.stage),
    elapsedSeconds: asFiniteNumber(payload.elapsed_seconds),
    message: typeof payload.message === 'string' ? payload.message : null,
    candidateCount,
    completedCandidates: Math.max(
      asFiniteNumber(payload.completed_candidates) ?? 0,
      completedFromCandidates,
    ),
    failedCandidates: Math.max(
      asFiniteNumber(payload.failed_candidates) ?? 0,
      failedFromCandidates,
    ),
    visualMode: asVisualMode(payload.visual_mode),
    influencerReferenceCount:
      referenceCount == null ? null : Math.max(0, Math.min(2, referenceCount)),
    candidates,
  };
}

function progressToResult(progress: GenerationProgress): VideoResult {
  return {
    jobId: progress.jobId,
    status: progress.status,
    candidateCount: progress.candidateCount,
    completedCandidates: progress.completedCandidates,
    failedCandidates: progress.failedCandidates,
    visualMode: progress.visualMode,
    influencerReferenceCount: progress.influencerReferenceCount,
    candidates: progress.candidates,
  };
}

function normalizeScriptDocument(payload: unknown): ScriptDocument {
  const candidate =
    payload && typeof payload === 'object' && 'script' in payload
      ? (payload as { script?: unknown }).script
      : payload;
  const document = asRecord(candidate);

  if (document.summary && Array.isArray(document.scenes)) {
    return document as unknown as ScriptDocument;
  }

  const product = asRecord(document.product);
  const customer = asRecord(document.customer);
  const ads = asRecord(document.ads);
  const meta = asRecord(document.meta);
  const etc = asRecord(document.etc);
  const scenes = Array.isArray(document.scenes) ? document.scenes : [];

  return {
    meta: {
      output_format_version: String(meta.output_format_version ?? '1.0'),
      framework: String(etc.video_ads_methodology ?? 'Hook-Body-CTA'),
      language: String(meta.language ?? 'ko'),
    },
    summary: {
      main_target: String(customer.main_target ?? ads.main_target ?? ''),
      pain_point: String(customer.pain_point ?? ''),
      product_usp: String(product.usp ?? ''),
      key_message: String(ads.cta_action ?? product.usp ?? ''),
      tone_and_manner: String(asRecord(ads.speaker).tone ?? ''),
    },
    scenes: scenes.map((sceneValue: unknown) => {
      const scene = asRecord(sceneValue);
      const auditory = asRecord(scene.auditory);
      const timeRange = asRecord(scene.time_range_sec);
      return {
        scene_name: String(scene.section ?? scene.scene_name ?? 'Scene'),
        time_range_sec: {
          start: Number(timeRange.start ?? 0),
          end: Number(timeRange.end ?? 0),
        },
        visual: String(scene.visual ?? ''),
        auditory: {
          subtitle: String(auditory.subtitle ?? ''),
          voiceover: typeof auditory.voiceover === 'string' ? auditory.voiceover : null,
        },
        notes: String(scene.notes ?? scene.intent ?? ''),
      };
    }),
    compliance_notes: {
      avoid: asStringArray(asRecord(document.compliance_notes).avoid),
      focus: asStringArray(asRecord(document.compliance_notes).focus),
    },
  };
}

async function waitForFinalVideo(
  jobId: string,
  statusUrl: string,
  onProgress?: (status: GenerationProgress) => void,
  expectedCandidateCount = 1,
): Promise<VideoResult> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(
    MINIMUM_VIDEO_POLL_TIMEOUT_MS,
    SHARED_VIDEO_STAGE_TIMEOUT_MS + VIDEO_CANDIDATE_TIMEOUT_MS * expectedCandidateCount,
  );

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(apiUrl(statusUrl), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        await readError(response, '최종 영상 생성 상태를 확인하지 못했습니다.'),
      );
    }

    const payload = (await response.json()) as GenerationJobStatusResponse;
    const progress = normalizeProgress(payload, jobId);
    onProgress?.(progress);

    const jobFinished =
      progress.status === 'COMPLETED' ||
      progress.status === 'PARTIAL_COMPLETED' ||
      progress.status === 'FAILED';

    if (jobFinished) {
      return progressToResult(progress);
    }
    if (progress.status !== 'PENDING' && progress.status !== 'PROCESSING' && !jobFinished) {
      throw new Error(`지원하지 않는 생성 상태입니다: ${String(progress.status)}`);
    }

    await delay(STATUS_POLL_INTERVAL_MS);
  }

  throw new Error('후보 영상 생성 대기 시간이 초과되었습니다. 작업 ID로 다시 확인해 주세요.');
}

async function waitForScript(
  jobId: string,
  statusUrl: string,
): Promise<ScriptDocument> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SCRIPT_STATUS_POLL_TIMEOUT_MS) {
    const response = await fetch(apiUrl(statusUrl), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(await readError(response, '스크립트 생성 상태를 확인하지 못했습니다.'));
    }

    const payload = (await response.json()) as ScriptJobStatusResponse;
    if (payload.status === 'FAILED') {
      throw new Error(payload.error || '스크립트 생성에 실패했습니다.');
    }
    if (payload.status === 'COMPLETED') {
      if (!payload.script) {
        throw new Error('완료된 스크립트가 응답에 없습니다.');
      }
      return normalizeScriptDocument(payload.script);
    }
    if (payload.status !== 'PENDING' && payload.status !== 'PROCESSING') {
      throw new Error(`지원하지 않는 스크립트 생성 상태입니다: ${String(payload.status)}`);
    }

    await delay(STATUS_POLL_INTERVAL_MS);
  }

  throw new Error(`스크립트 생성 대기 시간이 초과되었습니다. job_id=${jobId}`);
}

export const httpReelsApi: ReelsApi = {
  async generateScript(product, options) {
    const response = await fetch(`${API_BASE_URL}/api/v1/reels/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product: product.rawProduct,
        image_url: product.imageUrl,
        prompt: buildAdditionalPrompt(options),
        max_duration_seconds: options.durationSeconds,
        channel: options.channel,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, '스크립트 생성에 실패했습니다.'));
    }

    const payload = (await response.json()) as GenerationJobStartResponse;
    if (!payload.job_id || !payload.status_url) {
      throw new Error('스크립트 생성 작업 ID 또는 상태 조회 URL이 없습니다.');
    }
    return waitForScript(payload.job_id, payload.status_url);
  },

  async generateFinalVideo(product, script, options, onProgress) {
    const prompt = buildAdditionalPrompt(options);
    const influencerImageUrls =
      options.visualMode === 'model_included'
        ? activeInfluencerReferenceUrls(options.influencerImageUrls)
        : [];
    const requestBody: Record<string, unknown> = {
      product: product.rawProduct,
      script,
      image_url: product.imageUrl,
      // Always send the user's explicit mode. The backend uses this contract
      // to suppress server-level influencer defaults for product-only jobs.
      visual_mode: options.visualMode,
      prompt,
      max_duration_seconds: options.durationSeconds,
      channel: options.channel,
      target_audience: script.summary.main_target,
      candidate_count: options.outputCount,
      square_output_strategy:
        options.visualMode === 'model_included'
          ? 'reject'
          : product.squareOutputStrategy ?? 'reject',
    };
    if (influencerImageUrls.length > 0) {
      requestBody.influencer_image_urls = influencerImageUrls;
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/reels/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(await readError(response, '후보 영상 생성을 시작하지 못했습니다.'));
    }

    const payload = (await response.json()) as GenerationJobStartResponse;
    if (!payload.job_id || !payload.status_url) {
      throw new Error('생성 작업 ID 또는 상태 조회 URL이 없습니다.');
    }
    return waitForFinalVideo(
      payload.job_id,
      payload.status_url,
      onProgress,
      payload.candidate_count ?? options.outputCount,
    );
  },

  async resumeGeneration(jobId, onProgress) {
    if (!jobId.trim()) {
      throw new Error('다시 불러올 영상 작업 ID가 없습니다.');
    }
    return waitForFinalVideo(
      jobId,
      `/api/v1/reels/generate/${encodeURIComponent(jobId)}`,
      onProgress,
      4,
    );
  },

  async retryCandidate(jobId, candidateId, onProgress) {
    const response = await fetch(
      apiUrl(
        `/api/v1/reels/generate/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/retry`,
      ),
      { method: 'POST' },
    );
    if (!response.ok) {
      throw new Error(await readError(response, '후보 영상 재시도를 시작하지 못했습니다.'));
    }

    const payload = (await response.json()) as Partial<GenerationJobStartResponse>;
    return waitForFinalVideo(
      jobId,
      payload.status_url ?? `/api/v1/reels/generate/${encodeURIComponent(jobId)}`,
      onProgress,
      1,
    );
  },

  async renewVideoUrl(jobId, candidateId, download = false) {
    const suffix = download ? '?download=true' : '';
    return apiUrl(
      `/api/v1/reels/generate/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/file${suffix}`,
    );
  },
};

export type { Product, ScriptDocument, VideoResult };
