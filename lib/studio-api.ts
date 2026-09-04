import { activeInfluencerReferenceUrls } from './influencer-references';
import type {
  CandidateValidationMetadata,
  GenerationJobStatus,
  GenerationStage,
  ScriptDocument,
  VideoCandidate,
  VisualMode,
} from '@/types/reels';
import type {
  CreateDraft,
  GenerationFilters,
  GenerationListResult,
  GenerationListSummary,
  GenerationQuote,
  GenerationTemplate,
  JobTemplateSnapshot,
  QuoteLineItem,
  StartGenerationInput,
  StudioJob,
  StudioJobOptions,
  StudioProductSnapshot,
  StudioTemplateDuration,
  TemplateScene,
  TimingSceneValidation,
} from '@/types/studio';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:8000';

type JsonRecord = Record<string, unknown>;

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

export const LOCAL_TEMPLATE_FALLBACKS: GenerationTemplate[] = [
  {
    id: 'ugc_quick_4',
    version: '1',
    name: '4초 초압축',
    shortName: 'Quick Hook',
    description: '상품을 즉시 보여주고 핵심 장점과 CTA만 빠르게 전달합니다.',
    durationSeconds: 4,
    scenes: [
      scene('hook', 'Hook', 0, 1.2, '첫 화면에서 상품과 핵심 인상을 전달'),
      scene('product', 'Product', 1.2, 2.8, '핵심 특징 한 가지를 짧게 설명'),
      scene('cta', 'CTA', 2.8, 4, '다음 행동을 한 문장으로 안내'),
    ],
    supported: true,
    unavailableReason: null,
  },
  {
    id: 'ugc_quick_6',
    version: '1',
    name: '6초 빠른 소개',
    shortName: 'Compact Pitch',
    description: '짧은 Hook 뒤 제품과 사용 장면, CTA를 한 번에 구성합니다.',
    durationSeconds: 6,
    scenes: [
      scene('hook', 'Hook', 0, 1.5, '첫 장면에서 시선을 확보'),
      scene('product', 'Product', 1.5, 3.5, '제품 사용 이유를 간결하게 전달'),
      scene('lifestyle', 'Lifestyle', 3.5, 4.8, '사용 장면과 분위기를 보여줌'),
      scene('cta', 'CTA', 4.8, 6, '구매 또는 확인 행동을 유도'),
    ],
    supported: true,
    unavailableReason: null,
  },
  {
    id: 'ugc_balanced_8',
    version: '1',
    name: '8초 균형형',
    shortName: 'Product Story',
    description: 'Hook, 제품 설명, 사용 분위기와 CTA를 균형 있게 보여줍니다.',
    durationSeconds: 8,
    scenes: [
      scene('hook', 'Hook', 0, 2, '상품과 문제 상황을 즉시 제시'),
      scene('product', 'Product', 2, 4.5, '형태와 핵심 장점을 설명'),
      scene('lifestyle', 'Lifestyle', 4.5, 6.5, '사용 장면과 분위기를 보여줌'),
      scene('cta', 'CTA', 6.5, 8, '다음 행동을 명확히 안내'),
    ],
    supported: true,
    unavailableReason: null,
  },
  {
    id: 'ugc_full_15',
    version: '1',
    name: '15초 풀 스토리',
    shortName: 'Full Story',
    description: '모델과 상품 Hook부터 제품, 생활 장면, CTA까지 완결형으로 구성합니다.',
    durationSeconds: 15,
    scenes: [
      scene('hook', 'Hook', 0, 3, '모델과 상품을 함께 보여주며 주목 확보'),
      scene('product', 'Product', 3, 8, '제품 형태와 핵심 효익 설명'),
      scene('lifestyle', 'Lifestyle', 8, 12, '일상 속 사용 장면을 자연스럽게 표현'),
      scene('cta', 'CTA', 12, 15, '링크 확인 등 구체적인 행동 유도'),
    ],
    supported: true,
    unavailableReason: null,
  },
];

function scene(
  id: string,
  label: string,
  startSeconds: number,
  endSeconds: number,
  description: string,
): TemplateScene {
  return { id, label, startSeconds, endSeconds, description };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asVersion(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asString(value);
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStatus(value: unknown): GenerationJobStatus {
  return typeof value === 'string' && JOB_STATUSES.has(value as GenerationJobStatus)
    ? (value as GenerationJobStatus)
    : 'PROCESSING';
}

function asStage(value: unknown): GenerationStage | null {
  return typeof value === 'string' && GENERATION_STAGES.has(value as GenerationStage)
    ? (value as GenerationStage)
    : null;
}

function asVisualMode(value: unknown): VisualMode | null {
  return value === 'product_only' || value === 'model_included' || value === 'generated_model'
    ? value
    : null;
}

function apiUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

function mediaUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    return new URL(raw, `${API_BASE_URL}/`).toString();
  } catch {
    return null;
  }
}

async function readError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = asRecord(await response.json());
    const detail = payload.detail;
    if (typeof detail === 'string') return new Error(detail);
    const detailRecord = asRecord(detail);
    const message = asString(firstDefined(detailRecord.message, payload.message, payload.error));
    if (message) return new Error(message);
  } catch {
    // Empty and non-JSON provider responses are mapped to a stable user message.
  }
  return new Error(fallback);
}

function normalizeScene(value: unknown, index: number): TemplateScene {
  const item = asRecord(value);
  const range = asRecord(firstDefined(item.time_range_sec, item.timeRange, item.range));
  const start = asNumber(
    firstDefined(item.start_seconds, item.startSeconds, item.start, range.start),
  ) ?? 0;
  const end = asNumber(
    firstDefined(item.end_seconds, item.endSeconds, item.end, range.end),
  ) ?? start;
  return {
    id: asString(firstDefined(item.id, item.key, item.scene_name, item.name)) ?? `scene-${index + 1}`,
    label:
      asString(firstDefined(item.label, item.title, item.scene_name, item.name, item.section)) ??
      `장면 ${index + 1}`,
    startSeconds: start,
    endSeconds: end,
    description: asString(firstDefined(item.description, item.intent, item.purpose, item.visual)) ?? '',
  };
}

function isTemplateDuration(value: number | null): value is StudioTemplateDuration {
  return value === 4 || value === 6 || value === 8 || value === 15;
}

function normalizeTemplate(value: unknown, index: number): GenerationTemplate | null {
  const item = asRecord(value);
  const duration = asNumber(
    firstDefined(item.duration_seconds, item.durationSeconds, item.duration),
  );
  if (!isTemplateDuration(duration)) return null;
  const fallback = LOCAL_TEMPLATE_FALLBACKS.find(
    (template) => template.durationSeconds === duration,
  );
  const rawScenes = firstDefined(item.scenes, item.timeline, item.scene_plan);
  const scenes = asArray(rawScenes).map(normalizeScene).filter((item) => item.endSeconds > item.startSeconds);
  const supported = asBoolean(firstDefined(item.supported, item.available, item.enabled));
  return {
    id: asString(firstDefined(item.template_id, item.id)) ?? fallback?.id ?? `template-${index + 1}`,
    version: asVersion(firstDefined(item.template_version, item.version)) ?? fallback?.version ?? '1',
    name: asString(firstDefined(item.name, item.title)) ?? fallback?.name ?? `${duration}초 템플릿`,
    shortName: asString(firstDefined(item.short_name, item.shortName)) ?? fallback?.shortName ?? `${duration}초`,
    description: asString(item.description) ?? fallback?.description ?? '',
    durationSeconds: duration,
    scenes: scenes.length > 0 ? scenes : fallback?.scenes ?? [],
    supported: supported ?? true,
    unavailableReason:
      asString(firstDefined(item.unavailable_reason, item.unavailableReason, item.reason)) ?? null,
  };
}

function normalizeValidation(value: unknown): CandidateValidationMetadata | null {
  const validation = asRecord(value);
  if (Object.keys(validation).length === 0) return null;
  const checks = asRecord(
    firstDefined(validation.checks, validation.final, validation.provider_checks, validation.provider),
  );
  const normalized = { ...validation, checks } as CandidateValidationMetadata;
  const entries = Object.values(checks).map(asRecord).filter((item) => 'passed' in item);
  if (
    typeof normalized.passed !== 'boolean' &&
    typeof normalized.valid !== 'boolean' &&
    typeof normalized.is_valid !== 'boolean' &&
    entries.length > 0
  ) {
    normalized.passed = entries.every((item) => item.passed === true);
  }
  if (typeof normalized.score !== 'number' && entries.length > 0) {
    normalized.score = Math.round(
      (entries.filter((item) => item.passed === true).length / entries.length) * 100,
    );
  }
  const resolution = asString(asRecord(checks.resolution).actual);
  if (resolution) normalized.resolution ??= resolution;
  normalized.duration_seconds ??=
    asNumber(firstDefined(asRecord(checks.duration).actual_seconds, validation.duration)) ?? undefined;
  normalized.fps ??= asNumber(asRecord(checks.fps).actual) ?? undefined;
  normalized.codec ??= asString(asRecord(checks.codec).actual) ?? undefined;
  const bitrate = asNumber(asRecord(checks.bitrate).actual);
  normalized.bitrate_kbps ??= bitrate == null ? undefined : Math.round(bitrate / 1_000);
  return normalized;
}

function normalizeCandidate(
  value: unknown,
  index: number,
  fallbackStatus: GenerationJobStatus,
): VideoCandidate {
  const item = asRecord(value);
  const candidateIndex = asNumber(item.index) ?? index + 1;
  const status = asStatus(firstDefined(item.status, fallbackStatus));
  const explicitValidation = normalizeValidation(item.validation);
  const technicalScore = asNumber(firstDefined(item.technical_score, item.technicalScore));
  const durationSeconds = asNumber(firstDefined(item.duration_seconds, item.durationSeconds));
  const validation = explicitValidation ??
    (technicalScore != null || durationSeconds != null
      ? {
          score: technicalScore ?? undefined,
          duration_seconds: durationSeconds ?? undefined,
        }
      : null);
  return {
    candidateId:
      asString(firstDefined(item.candidate_id, item.candidateId, item.id)) ??
      `candidate-${String(candidateIndex).padStart(2, '0')}`,
    index: candidateIndex,
    status,
    stage: asStage(item.stage),
    providerJobId: asString(firstDefined(item.provider_job_id, item.providerJobId)),
    captionJobId: asString(firstDefined(item.caption_job_id, item.captionJobId)),
    attempts: asNumber(item.attempts),
    cost: asNumber(firstDefined(item.cost, item.cost_usd, item.actual_cost_usd)),
    validation,
    error: asString(item.error),
    errorCode: asString(firstDefined(item.error_code, item.errorCode)),
    retryable: asBoolean(item.retryable) ?? status === 'FAILED',
    videoUrl: mediaUrl(firstDefined(item.video_url, item.videoUrl)),
    downloadUrl: mediaUrl(firstDefined(item.download_url, item.downloadUrl)),
  };
}

function normalizeProduct(value: unknown, fallback: JsonRecord): StudioProductSnapshot {
  const item = asRecord(value);
  const nested = asRecord(item.product);
  const source = Object.keys(nested).length > 0 ? { ...item, ...nested } : item;
  return {
    productId: asString(firstDefined(source.product_id, source.productId, source.id, fallback.product_id)),
    name: asString(firstDefined(source.name, source.product_name, fallback.name)) ?? '상품 정보 없음',
    eventName: asString(firstDefined(source.event_name, source.eventName, fallback.event_name)),
    imageUrl: mediaUrl(
      firstDefined(source.image_url, source.imageUrl, source.thumbnail_url, fallback.image_url),
    ),
  };
}

function normalizeTemplateSnapshot(value: unknown, fallback: JsonRecord): JobTemplateSnapshot {
  const item = asRecord(value);
  const duration = asNumber(
    firstDefined(
      item.duration_seconds,
      item.durationSeconds,
      fallback.duration_seconds,
      fallback.max_duration_seconds,
    ),
  );
  const known = LOCAL_TEMPLATE_FALLBACKS.find((template) => template.durationSeconds === duration);
  const rawScenes = firstDefined(item.scenes, item.timeline, fallback.scene_plan);
  const scenes = asArray(rawScenes).map(normalizeScene).filter((scene) => scene.endSeconds > scene.startSeconds);
  return {
    id: asString(firstDefined(item.template_id, item.id, fallback.template_id)),
    version: asVersion(firstDefined(item.template_version, item.version, fallback.template_version)),
    name: asString(firstDefined(item.name, item.title)) ?? known?.name ?? (duration ? `${duration}초 템플릿` : '템플릿 정보 없음'),
    durationSeconds: duration,
    scenes: scenes.length > 0 ? scenes : known?.scenes ?? [],
  };
}

function normalizeOptions(raw: JsonRecord, payload: JsonRecord, candidateCount: number): StudioJobOptions {
  return {
    visualMode: asVisualMode(firstDefined(raw.visual_mode, payload.visual_mode)),
    candidateCount,
    channel: asString(firstDefined(raw.channel, payload.channel)),
    cta: asString(firstDefined(raw.cta, payload.cta)),
    advertisingPurpose: asString(
      firstDefined(raw.advertising_purpose, raw.advertisingPurpose, payload.advertising_purpose),
    ),
    mustInclude: asString(firstDefined(raw.must_include, payload.must_include)),
    mustExclude: asString(firstDefined(raw.must_exclude, payload.must_exclude)),
    extraDetails: asString(firstDefined(raw.extra_details, payload.extra_details)),
  };
}

function normalizeScript(value: unknown): ScriptDocument | null {
  const item = asRecord(value);
  if (!item.summary || !Array.isArray(item.scenes)) return null;
  return item as unknown as ScriptDocument;
}

function normalizeTimingValidation(value: unknown): TimingSceneValidation[] {
  const container = asRecord(value);
  const scenes = asArray(firstDefined(container.scenes, value));
  return scenes.map((raw, index) => {
    const item = asRecord(raw);
    return {
      id: asString(firstDefined(item.id, item.key, item.scene_id)) ?? `scene-${index + 1}`,
      label: asString(firstDefined(item.label, item.name, item.scene_name)) ?? `장면 ${index + 1}`,
      expectedStartSeconds: asNumber(firstDefined(item.expected_start_seconds, item.expectedStartSeconds)),
      expectedEndSeconds: asNumber(firstDefined(item.expected_end_seconds, item.expectedEndSeconds)),
      actualStartSeconds: asNumber(firstDefined(item.actual_start_seconds, item.actualStartSeconds)),
      actualEndSeconds: asNumber(firstDefined(item.actual_end_seconds, item.actualEndSeconds)),
      driftMs: asNumber(firstDefined(item.drift_ms, item.driftMs)),
      passed: asBoolean(firstDefined(item.passed, item.valid)),
    };
  });
}

export function normalizeJob(value: unknown): StudioJob {
  const raw = asRecord(value);
  const payload = asRecord(firstDefined(raw.request, raw.options, raw.payload));
  const status = asStatus(raw.status);
  const rawCandidates = asArray(raw.candidates);
  const candidateSummary = asRecord(raw.candidates);
  const requestedCount = asNumber(
    firstDefined(raw.candidate_count, payload.candidate_count, candidateSummary.total),
  );
  const candidateCount = Math.max(
    1,
    Math.min(4, requestedCount ?? (rawCandidates.length || 1)),
  );
  const candidates = rawCandidates.map((candidate, index) => normalizeCandidate(candidate, index, status));
  const primaryCandidate = asRecord(raw.primary_candidate);
  if (Object.keys(primaryCandidate).length > 0) {
    const normalizedPrimary = normalizeCandidate(primaryCandidate, 0, 'COMPLETED');
    if (!candidates.some((candidate) => candidate.candidateId === normalizedPrimary.candidateId)) {
      candidates.push(normalizedPrimary);
    }
  }
  const completed = candidates.filter((candidate) => candidate.status === 'COMPLETED').length;
  const failed = candidates.filter((candidate) => candidate.status === 'FAILED').length;
  const productFallback = asRecord(payload.product);
  const templateFallback = { ...payload, duration_seconds: raw.duration_seconds };
  const quote = asRecord(raw.quote);
  const cost = {
    ...asRecord(raw.cost),
    ...asRecord(raw.cost_summary),
  };
  const error = asRecord(raw.error);
  const assetFidelity = asRecord(raw.asset_fidelity);
  return {
    jobId: asString(firstDefined(raw.job_id, raw.jobId, raw.id)) ?? '',
    status,
    stage: asStage(raw.stage),
    message: asString(raw.message),
    error: asString(firstDefined(error.message, raw.error, raw.error_message)),
    errorCode: asString(firstDefined(error.code, raw.error_code, raw.errorCode)),
    retryable: asBoolean(firstDefined(error.retryable, raw.retryable)) ?? status === 'FAILED',
    elapsedSeconds: asNumber(firstDefined(raw.elapsed_seconds, raw.elapsedSeconds)),
    createdAt: asString(firstDefined(raw.created_at, raw.createdAt)),
    updatedAt: asString(firstDefined(raw.updated_at, raw.updatedAt)),
    revision: (firstDefined(raw.revision, raw.version, raw.updated_at) as string | number | null) ?? null,
    product: normalizeProduct(firstDefined(raw.product_summary, raw.product), productFallback),
    template: normalizeTemplateSnapshot(firstDefined(raw.template, raw.generation_template), templateFallback),
    options: normalizeOptions(raw, payload, candidateCount),
    candidateCount,
    completedCandidates: Math.max(
      asNumber(firstDefined(raw.completed_candidates, candidateSummary.completed)) ?? 0,
      completed,
    ),
    failedCandidates: Math.max(
      asNumber(firstDefined(raw.failed_candidates, candidateSummary.failed)) ?? 0,
      failed,
    ),
    estimatedCostUsd: asNumber(
      firstDefined(
        raw.estimated_cost_usd,
        raw.expected_cost_usd,
        quote.expected_total_usd,
        cost.estimated_expected,
      ),
    ),
    maxAuthorizedCostUsd: asNumber(
      firstDefined(
        raw.max_authorized_cost_usd,
        raw.max_cost_usd,
        quote.max_total_usd,
        cost.estimated_max,
      ),
    ),
    actualCostUsd: asNumber(
      firstDefined(raw.actual_cost_usd, cost.actual, raw.total_cost, typeof raw.cost === 'number' ? raw.cost : null),
    ),
    script: normalizeScript(raw.script),
    timingValidation: normalizeTimingValidation(
      firstDefined(raw.timing_validation, raw.audio_timing_validation),
    ),
    assetWarning:
      asString(assetFidelity.warning) ??
      (asBoolean(assetFidelity.package_text_verified) === false
        ? '패키지 수량과 작은 글자는 시각적으로 검증되지 않았습니다.'
        : null),
    candidates,
  };
}

function normalizeSummary(raw: JsonRecord, items: StudioJob[]): GenerationListSummary {
  const summary = asRecord(firstDefined(raw.summary, raw.counts));
  return {
    total: asNumber(firstDefined(summary.total, raw.total)) ?? items.length,
    processing:
      asNumber(firstDefined(summary.processing, summary.active)) ??
      items.filter((item) => item.status === 'PENDING' || item.status === 'PROCESSING').length,
    ready:
      asNumber(firstDefined(summary.ready, summary.completed)) ??
      items.filter((item) => item.status === 'COMPLETED').length,
    needsAttention:
      asNumber(firstDefined(summary.needs_attention, summary.failed, summary.needsAttention)) ??
      items.filter((item) => item.status === 'FAILED' || item.status === 'PARTIAL_COMPLETED').length,
    actualCostUsd:
      asNumber(firstDefined(summary.actual_cost_usd, summary.cost_usd, summary.total_cost)) ??
      items.reduce((total, item) => total + (item.actualCostUsd ?? 0), 0),
  };
}

export function normalizeGenerationList(value: unknown): GenerationListResult {
  const raw = asRecord(value);
  const list = Array.isArray(value)
    ? value
    : asArray(firstDefined(raw.items, raw.generations, raw.jobs, raw.data));
  const items = list.map(normalizeJob).filter((job) => job.jobId);
  return {
    items,
    nextCursor: asString(firstDefined(raw.next_cursor, raw.nextCursor, raw.cursor)),
    summary: normalizeSummary(raw, items),
  };
}

function normalizeLineItem(value: unknown, index: number): QuoteLineItem {
  const item = asRecord(value);
  return {
    key: asString(firstDefined(item.key, item.id, item.type)) ?? `line-${index + 1}`,
    label: asString(firstDefined(item.label, item.name, item.description, item.kind)) ?? `비용 ${index + 1}`,
    amountUsd: asNumber(
      firstDefined(item.amount_usd, item.amount, item.cost_usd, item.cost, item.subtotal_expected),
    ),
  };
}

function normalizeQuote(value: unknown): GenerationQuote {
  const raw = asRecord(value);
  const total = asRecord(raw.total);
  const expected = asNumber(
    firstDefined(
      raw.expected_total_usd,
      raw.expected_cost_usd,
      raw.estimated_cost_usd,
      raw.total_usd,
      total.expected,
    ),
  );
  if (!asString(firstDefined(raw.quote_id, raw.id)) || expected == null) {
    throw new Error('서버가 유효한 비용 견적을 반환하지 않았습니다.');
  }
  return {
    quoteId: asString(firstDefined(raw.quote_id, raw.id))!,
    configHash: asString(firstDefined(raw.config_hash, raw.configHash)),
    currency: 'USD',
    expectedTotalUsd: expected,
    maxTotalUsd:
      asNumber(
        firstDefined(raw.max_total_usd, raw.max_authorized_cost_usd, raw.maximum_cost_usd, total.max),
      ) ??
      expected,
    availableBalanceUsd: asNumber(firstDefined(raw.available_balance_usd, raw.balance_usd)),
    expiresAt: asString(firstDefined(raw.expires_at, raw.expiresAt)),
    coverage: asString(raw.coverage),
    disclaimer: asString(raw.disclaimer),
    lineItems: asArray(firstDefined(raw.line_items, raw.breakdown, raw.items)).map(normalizeLineItem),
  };
}

function buildPrompt(draft: CreateDraft): string {
  return [
    `광고 목적: ${draft.advertisingPurpose}`,
    `CTA: ${draft.cta}`,
    draft.visualMode === 'model_included'
      ? '장면 구성: 제공된 동일 모델의 얼굴과 의상을 유지하고 상품을 가리지 않게 소개. 립싱크 금지'
      : draft.visualMode === 'generated_model'
        ? '장면 구성: 실존 인물을 모사하지 않는 성인 한국인 AI 가상 모델 한 명과 상품을 일관되게 유지. 립싱크 금지'
        : '장면 구성: 인물이나 모델 없이 상품만 사용',
    draft.mustInclude && `반드시 포함: ${draft.mustInclude}`,
    draft.mustExclude && `포함 금지: ${draft.mustExclude}`,
    draft.extraDetails && `추가 요청: ${draft.extraDetails}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const studioApi = {
  async getTemplates(signal?: AbortSignal): Promise<GenerationTemplate[]> {
    const response = await fetch(apiUrl('/api/v1/reels/generation-templates'), {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw await readError(response, '영상 전략 템플릿을 불러오지 못했습니다.');
    const payload = await response.json();
    const raw = asRecord(payload);
    const values = Array.isArray(payload)
      ? payload
      : asArray(firstDefined(raw.templates, raw.items, raw.data));
    const templates = values
      .map(normalizeTemplate)
      .filter((item): item is GenerationTemplate => item !== null)
      .sort((left, right) => left.durationSeconds - right.durationSeconds);
    if (templates.length === 0) throw new Error('사용 가능한 영상 전략 템플릿이 없습니다.');
    return templates;
  },

  async createQuote(draft: CreateDraft, signal?: AbortSignal): Promise<GenerationQuote> {
    if (!draft.template) throw new Error('비용 계산에 사용할 템플릿을 선택해 주세요.');
    const response = await fetch(apiUrl('/api/v1/reels/generation-quotes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        template_id: draft.template.id,
        template_version: draft.template.version,
        candidate_count: draft.outputCount,
        visual_mode: draft.visualMode,
        resolution: '1080p',
      }),
    });
    if (!response.ok) throw await readError(response, '생성 전 비용을 계산하지 못했습니다.');
    return normalizeQuote(await response.json());
  },

  async getGenerations(
    filters: GenerationFilters,
    signal?: AbortSignal,
  ): Promise<GenerationListResult> {
    const params = new URLSearchParams();
    if (filters.query) params.set('query', filters.query);
    if (filters.status) params.set('status', filters.status);
    if (filters.duration) params.set('duration', String(filters.duration));
    if (filters.cursor) params.set('cursor', filters.cursor);
    params.set('limit', '24');
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    const response = await fetch(apiUrl(`/api/v1/reels/generations${suffix}`), {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw await readError(response, '영상 라이브러리를 불러오지 못했습니다.');
    const result = normalizeGenerationList(await response.json());
    const query = filters.query.trim().toLocaleLowerCase('ko-KR');
    const items = result.items.filter((job) => {
      const matchesQuery =
        !query ||
        job.product.name.toLocaleLowerCase('ko-KR').includes(query) ||
        job.jobId.toLocaleLowerCase('ko-KR').includes(query);
      const matchesDuration =
        !filters.duration || job.template.durationSeconds === filters.duration;
      return matchesQuery && matchesDuration;
    });
    return { ...result, items };
  },

  async getGeneration(jobId: string, signal?: AbortSignal): Promise<StudioJob> {
    const response = await fetch(
      apiUrl(`/api/v1/reels/generate/${encodeURIComponent(jobId)}`),
      { cache: 'no-store', signal },
    );
    if (!response.ok) {
      const error = await readError(response, '영상 작업을 불러오지 못했습니다.');
      Object.assign(error, { status: response.status });
      throw error;
    }
    return normalizeJob(await response.json());
  },

  async startGeneration(input: StartGenerationInput, signal?: AbortSignal): Promise<string> {
    if (!input.template) throw new Error('생성할 템플릿이 없습니다.');
    const references =
      input.visualMode === 'model_included'
        ? activeInfluencerReferenceUrls(input.influencerImageUrls)
        : [];
    const body: Record<string, unknown> = {
      product: input.product.rawProduct,
      image_url: input.product.imageUrl,
      visual_mode: input.visualMode,
      prompt: buildPrompt(input),
      max_duration_seconds: input.template.durationSeconds,
      channel: input.channel,
      candidate_count: input.outputCount,
      square_output_strategy:
        input.visualMode === 'model_included'
          ? 'reject'
          : input.product.squareOutputStrategy ?? 'reject',
      template_id: input.template.id,
      template_version: input.template.version,
      quote_id: input.quoteId,
      client_request_id: input.clientRequestId,
      cta: input.cta,
      advertising_purpose: input.advertisingPurpose,
      must_include: input.mustInclude || null,
      must_exclude: input.mustExclude || null,
      extra_details: input.extraDetails || null,
      resolution: '1080p',
    };
    if (references.length > 0) body.influencer_image_urls = references;

    const response = await fetch(apiUrl('/api/v1/reels/generate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.clientRequestId,
      },
      signal,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await readError(response, '영상 생성 작업을 시작하지 못했습니다.');
    const payload = asRecord(await response.json());
    const jobId = asString(firstDefined(payload.job_id, payload.jobId, payload.id));
    if (!jobId) throw new Error('서버가 생성 작업 ID를 반환하지 않았습니다.');
    return jobId;
  },

  async retryCandidate(jobId: string, candidateId: string): Promise<void> {
    const response = await fetch(
      apiUrl(
        `/api/v1/reels/generate/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}/retry`,
      ),
      { method: 'POST' },
    );
    if (!response.ok) throw await readError(response, '실패 후보 재시도를 시작하지 못했습니다.');
  },
};

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatUsd(value: number | null): string {
  if (value == null) return '확인 중';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function assetCaveat(productId: string | null, name: string): string | null {
  if (
    productId === 'c82e2ff2-77a5-4ce8-86f1-09716d197724' ||
    name.includes('사과주스')
  ) {
    return '대표 파우치 1개 이미지를 사용합니다. 30포 수량, 패키지의 작은 글자와 세부 표기는 시각적으로 검증되지 않았으므로 영상에서 수량을 주장하지 않습니다.';
  }
  return null;
}
