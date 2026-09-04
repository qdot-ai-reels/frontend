import {
  PROMPT_TEMPLATE_KEYS,
  type PromptTemplateKey,
  type PromptTemplates,
  type PromptVersion,
  type PromptVersionCatalog,
  type PromptVersionReference,
} from '../types/studio.ts';

type JsonRecord = Record<string, unknown>;

export interface PromptTemplateDefinition {
  key: PromptTemplateKey;
  label: string;
  description: string;
  requiredTokens: readonly string[];
  allowedTokens: readonly string[];
}

export const MAX_PROMPT_TEMPLATE_BYTES = 64 * 1024;
export const MAX_PROMPT_BUNDLE_BYTES = 256 * 1024;

export const PROMPT_TEMPLATE_DEFINITIONS: readonly PromptTemplateDefinition[] = [
  {
    key: 'script_generation',
    label: '스크립트 생성',
    description: '상품·광고 전략·장면 타이밍을 구조화된 스크립트로 변환합니다.',
    requiredTokens: ['product_context', 'creative_brief', 'template_scene_plan'],
    allowedTokens: [
      'product_context',
      'creative_brief',
      'template_scene_plan',
      'channel',
      'target_audience',
      'duration_seconds',
      'resolution',
      'aspect_ratio',
      'visual_mode',
      'retry_instruction',
    ],
  },
  {
    key: 'script_tts_repair',
    label: '음성 길이 보정',
    description: 'TTS 길이 검증이 실패했을 때 같은 스크립트를 안전하게 줄입니다.',
    requiredTokens: ['retry_error'],
    allowedTokens: [
      'retry_error',
      'duration_seconds',
      'channel',
      'target_audience',
      'visual_mode',
    ],
  },
  {
    key: 'video_base',
    label: '영상 생성 공통',
    description: '모든 영상 후보에 적용하는 카메라·상품 보존·텍스트 정책입니다.',
    requiredTokens: ['script_visual_table'],
    allowedTokens: [
      'script_visual_table',
      'duration_seconds',
      'resolution',
      'aspect_ratio',
      'visual_mode',
    ],
  },
  {
    key: 'video_identity_reference',
    label: '지정 모델 보강',
    description: '동의된 인물 레퍼런스를 사용하는 배포에서만 추가되는 조건입니다.',
    requiredTokens: [],
    allowedTokens: ['duration_seconds', 'resolution', 'aspect_ratio', 'visual_mode'],
  },
  {
    key: 'video_generated_model',
    label: 'AI 가상 모델 보강',
    description: '실존 인물을 모사하지 않는 가상 모델 장면에 추가되는 조건입니다.',
    requiredTokens: [],
    allowedTokens: ['duration_seconds', 'resolution', 'aspect_ratio', 'visual_mode'],
  },
  {
    key: 'creative_brief',
    label: '크리에이티브 브리프',
    description: '사용자가 선택한 광고 목적과 제약을 실제 생성 문맥으로 구성합니다.',
    requiredTokens: ['advertising_purpose', 'cta', 'visual_mode'],
    allowedTokens: [
      'advertising_purpose',
      'cta',
      'visual_mode',
      'must_include',
      'must_exclude',
      'extra_details',
      'channel',
      'target_audience',
      'duration_seconds',
    ],
  },
] as const;

export interface PromptTemplateValidation {
  valid: boolean;
  tokens: string[];
  errors: string[];
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
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : asString(value);
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function emptyPromptTemplates(): PromptTemplates {
  return Object.fromEntries(PROMPT_TEMPLATE_KEYS.map((key) => [key, ''])) as PromptTemplates;
}

function normalizeTemplates(value: unknown): PromptTemplates {
  const raw = asRecord(value);
  const templates = emptyPromptTemplates();
  for (const key of PROMPT_TEMPLATE_KEYS) {
    const candidate = firstDefined(raw[key], asRecord(raw.prompts)[key]);
    templates[key] = typeof candidate === 'string' ? candidate : '';
  }
  return templates;
}

export function normalizePromptVersion(value: unknown): PromptVersion | null {
  const raw = asRecord(value);
  const id = asString(firstDefined(raw.id, raw.prompt_version_id, raw.bundle_id));
  const version = asVersion(firstDefined(raw.version, raw.version_number));
  if (!id || !version) return null;
  return {
    id,
    version,
    name: asString(firstDefined(raw.name, raw.title)) ?? `프롬프트 v${version}`,
    description: asString(firstDefined(raw.description, raw.change_note, raw.note)) ?? '',
    contentSha256: asString(firstDefined(raw.content_sha256, raw.contentHash, raw.sha256)),
    createdAt: asString(firstDefined(raw.created_at, raw.createdAt)),
    activatedAt: asString(firstDefined(raw.activated_at, raw.activatedAt)),
    isActive: asBoolean(firstDefined(raw.is_active, raw.active)) ?? false,
    templates: normalizeTemplates(firstDefined(raw.templates, raw.prompts)),
  };
}

export function normalizeCreatedPromptVersionResponse(value: unknown): PromptVersion | null {
  const direct = normalizePromptVersion(value);
  if (direct) return direct;

  const raw = asRecord(value);
  for (const key of ['version', 'item', 'data'] as const) {
    const candidate = raw[key];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const normalized = normalizePromptVersion(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function normalizePromptVersionReference(value: unknown): PromptVersionReference | null {
  const raw = asRecord(value);
  const nested = asRecord(
    firstDefined(raw.prompt_version, raw.prompt_snapshot, raw.prompt_bundle, value),
  );
  const id = asString(
    firstDefined(nested.id, nested.prompt_version_id, nested.bundle_id, raw.prompt_version_id),
  );
  const version = asVersion(
    firstDefined(nested.version, nested.version_number, raw.prompt_version_number),
  );
  if (!id || !version) return null;
  return {
    id,
    version,
    name: asString(firstDefined(nested.name, nested.title)) ?? `프롬프트 v${version}`,
    contentSha256: asString(
      firstDefined(nested.content_sha256, nested.contentHash, nested.sha256),
    ),
  };
}

export function normalizePromptVersionCatalog(value: unknown): PromptVersionCatalog {
  const root = asRecord(value);
  const nested = asRecord(firstDefined(root.data, root.result));
  const raw =
    Array.isArray(value) || Array.isArray(root.versions) || Array.isArray(root.items)
      ? root
      : Object.keys(nested).length > 0
        ? nested
        : root;
  const values = Array.isArray(value)
    ? value
    : asArray(firstDefined(raw.versions, raw.items, raw.data));
  const activeBundleId = asString(
    firstDefined(raw.active_bundle_id, raw.activeBundleId, raw.active_prompt_version_id),
  );
  const versions = values
    .map(normalizePromptVersion)
    .filter((item): item is PromptVersion => item !== null)
    .map((item) => ({
      ...item,
      isActive: activeBundleId ? item.id === activeBundleId : item.isActive,
    }));
  const inferredActive = versions.find((item) => item.isActive)?.id ?? null;
  return { activeBundleId: activeBundleId ?? inferredActive, versions };
}

export function isQuotePromptVersionCurrent(
  draftPromptVersionId: string | null,
  activePromptVersionId: string | null,
  quotePromptVersionId: string | null,
): boolean {
  return Boolean(
    draftPromptVersionId &&
      activePromptVersionId &&
      quotePromptVersionId &&
      draftPromptVersionId === activePromptVersionId &&
      activePromptVersionId === quotePromptVersionId,
  );
}

export function shouldRefreshPromptVersionAfterQuoteError(
  status: number,
  code: string | null,
): boolean {
  return status === 409 && code === 'PROMPT_VERSION_CHANGED';
}

export function canAttemptPromptVersionRecovery(attemptCount: number): boolean {
  return Number.isInteger(attemptCount) && attemptCount >= 0 && attemptCount < 1;
}

export function getActivePromptVersionReference(
  catalog: PromptVersionCatalog,
): PromptVersionReference | null {
  const active = catalog.versions.find(
    (version) => version.id === catalog.activeBundleId || version.isActive,
  );
  return active
    ? {
        id: active.id,
        version: active.version,
        name: active.name,
        contentSha256: active.contentSha256,
      }
    : null;
}

export function extractPromptTokens(content: string): string[] {
  const tokens = new Set<string>();
  for (const match of content.matchAll(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g)) {
    tokens.add(match[1]);
  }
  return [...tokens].sort();
}

export function utf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

export function validatePromptTemplate(
  definition: PromptTemplateDefinition,
  content: string,
): PromptTemplateValidation {
  const errors: string[] = [];
  const tokens = extractPromptTokens(content);
  if (!content.trim()) errors.push('프롬프트 내용이 비어 있습니다.');
  if (utf8ByteLength(content) > MAX_PROMPT_TEMPLATE_BYTES) {
    errors.push('프롬프트는 UTF-8 64KiB 이하여야 합니다.');
  }
  const openCount = content.match(/{{/g)?.length ?? 0;
  const closeCount = content.match(/}}/g)?.length ?? 0;
  const recognizedCount = [...content.matchAll(/{{\s*[A-Za-z][A-Za-z0-9_]*\s*}}/g)].length;
  if (openCount !== closeCount || openCount !== recognizedCount) {
    errors.push('토큰은 {{token_name}} 형식으로 완결해 주세요.');
  }
  const allowed = new Set(definition.allowedTokens);
  const unknown = tokens.filter((token) => !allowed.has(token));
  if (unknown.length > 0) errors.push(`허용되지 않은 토큰: ${unknown.join(', ')}`);
  const missing = definition.requiredTokens.filter((token) => !tokens.includes(token));
  if (missing.length > 0) errors.push(`필수 토큰 누락: ${missing.join(', ')}`);
  return { valid: errors.length === 0, tokens, errors };
}

export function validatePromptTemplates(templates: PromptTemplates): {
  valid: boolean;
  byKey: Record<PromptTemplateKey, PromptTemplateValidation>;
  totalBytes: number;
  errors: string[];
} {
  const entries = PROMPT_TEMPLATE_DEFINITIONS.map((definition) => [
    definition.key,
    validatePromptTemplate(definition, templates[definition.key]),
  ]);
  const byKey = Object.fromEntries(entries) as Record<
    PromptTemplateKey,
    PromptTemplateValidation
  >;
  const totalBytes = PROMPT_TEMPLATE_KEYS.reduce(
    (total, key) => total + utf8ByteLength(templates[key]),
    0,
  );
  const errors =
    totalBytes > MAX_PROMPT_BUNDLE_BYTES
      ? ['전체 프롬프트 번들은 UTF-8 256KiB 이하여야 합니다.']
      : [];
  return {
    valid: Object.values(byKey).every((result) => result.valid) && errors.length === 0,
    byKey,
    totalBytes,
    errors,
  };
}
