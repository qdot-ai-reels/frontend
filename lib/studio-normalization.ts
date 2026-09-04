import type { VisualMode } from '../types/reels';
import type { StudioScriptDocument, StudioScriptScene } from '../types/studio';

type JsonRecord = Record<string, unknown>;

export const PENDING_SUBMISSION_KEY = 'quedot.pending-generation';

export interface PendingSubmission {
  clientRequestId: string;
  quoteId: string;
  createdAt: string;
  request: PendingGenerationSnapshot | null;
  requestBody: Record<string, unknown> | null;
}

export interface PendingGenerationSnapshot {
  productId: string;
  productRevision: number | null;
  templateId: string;
  templateVersion: string;
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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeScriptScene(value: unknown, index: number): StudioScriptScene | null {
  const item = asRecord(value);
  const rangeValue = firstDefined(item.time_range_sec, item.timeRange, item.range);
  const range = asRecord(rangeValue);
  const rangeArray = Array.isArray(rangeValue) ? rangeValue : [];
  const startSeconds = asNumber(
    firstDefined(
      item.start_seconds,
      item.startSeconds,
      item.start,
      range.start,
      range.start_seconds,
      rangeArray[0],
    ),
  );
  const endSeconds = asNumber(
    firstDefined(
      item.end_seconds,
      item.endSeconds,
      item.end,
      range.end,
      range.end_seconds,
      rangeArray[1],
    ),
  );
  if (startSeconds == null || endSeconds == null || endSeconds <= startSeconds) return null;

  const auditory = asRecord(item.auditory);
  return {
    id:
      asString(firstDefined(item.id, item.key, item.scene_id, item.scene_name, item.section)) ??
      `scene-${index + 1}`,
    label:
      asString(firstDefined(item.section, item.scene_name, item.label, item.title, item.name)) ??
      `장면 ${index + 1}`,
    startSeconds,
    endSeconds,
    visual: asString(firstDefined(item.visual, item.description, item.visual_direction)),
    voiceover: asString(firstDefined(auditory.voiceover, item.voiceover)),
    subtitle: asString(firstDefined(auditory.subtitle, item.subtitle)),
    notes: asString(firstDefined(item.notes, item.note, item.intent, item.purpose)),
  };
}

export function normalizeStudioScript(value: unknown): StudioScriptDocument | null {
  const item = asRecord(value);
  if (!Array.isArray(item.scenes)) return null;
  const scenes = item.scenes
    .map(normalizeScriptScene)
    .filter((scene): scene is StudioScriptScene => scene !== null);
  if (scenes.length === 0) return null;
  return {
    summary: asString(firstDefined(item.summary, item.overview, item.concept)),
    scenes,
  };
}

export function parsePendingSubmission(value: string | null): PendingSubmission | null {
  if (!value) return null;
  try {
    const item = asRecord(JSON.parse(value));
    const clientRequestId = asString(item.clientRequestId);
    const quoteId = asString(item.quoteId);
    const createdAt = asString(item.createdAt);
    if (!clientRequestId || !quoteId || !createdAt || Number.isNaN(Date.parse(createdAt))) {
      return null;
    }
    const request = parsePendingGenerationSnapshot(item.request);
    const parsedBody = asRecord(item.requestBody);
    const requestBody =
      Object.keys(parsedBody).length > 0 &&
      asString(parsedBody.client_request_id) === clientRequestId &&
      asString(parsedBody.quote_id) === quoteId
        ? parsedBody
        : null;
    return { clientRequestId, quoteId, createdAt, request, requestBody };
  } catch {
    return null;
  }
}

function parsePendingGenerationSnapshot(value: unknown): PendingGenerationSnapshot | null {
  const item = asRecord(value);
  const productId = asString(item.productId);
  const productRevision =
    typeof item.productRevision === 'number' &&
    Number.isSafeInteger(item.productRevision) &&
    item.productRevision > 0
      ? item.productRevision
      : null;
  const templateId = asString(item.templateId);
  const templateVersion = asString(item.templateVersion);
  const visualMode =
    item.visualMode === 'product_only' ||
    item.visualMode === 'model_included' ||
    item.visualMode === 'generated_model'
      ? item.visualMode
      : null;
  const outputCount = asNumber(item.outputCount);
  const cta = typeof item.cta === 'string' ? item.cta : null;
  const advertisingPurpose =
    typeof item.advertisingPurpose === 'string' ? item.advertisingPurpose : null;
  const channel = typeof item.channel === 'string' ? item.channel : null;
  const mustInclude = typeof item.mustInclude === 'string' ? item.mustInclude : null;
  const mustExclude = typeof item.mustExclude === 'string' ? item.mustExclude : null;
  const extraDetails = typeof item.extraDetails === 'string' ? item.extraDetails : null;
  const promptVersionId = asString(item.promptVersionId);
  const influencerImageUrls = Array.isArray(item.influencerImageUrls)
    ? item.influencerImageUrls.filter((entry): entry is string => typeof entry === 'string').slice(0, 2)
    : [];
  if (
    !productId ||
    !templateId ||
    !templateVersion ||
    !visualMode ||
    outputCount == null ||
    !Number.isInteger(outputCount) ||
    outputCount < 1 ||
    outputCount > 4 ||
    cta == null ||
    advertisingPurpose == null ||
    channel == null ||
    mustInclude == null ||
    mustExclude == null ||
    extraDetails == null
  ) {
    return null;
  }
  return {
    productId,
    productRevision,
    templateId,
    templateVersion,
    visualMode,
    influencerImageUrls,
    outputCount,
    cta,
    advertisingPurpose,
    channel,
    mustInclude,
    mustExclude,
    extraDetails,
    promptVersionId,
  };
}

export type RejectedSubmissionDisposition = 'requote' | 'rejected';

export function rejectedSubmissionDisposition(code: string | null): RejectedSubmissionDisposition {
  if (code === 'REQUOTE_REQUIRED' || code === 'QUOTE_NOT_FOUND') return 'requote';
  return 'rejected';
}

export function isIdentityReferenceProductionEnabled(
  modelId: string | null,
  explicitFlag: string | undefined,
): boolean {
  return Boolean(modelId) && explicitFlag === 'true';
}

export function parseApiDate(value: string | null): Date | null {
  if (!value) return null;
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveSafeMediaUrl(value: unknown, apiBaseUrl: string): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const resolved = new URL(raw, `${apiBaseUrl.replace(/\/$/, '')}/`);
    const apiOrigin = new URL(apiBaseUrl).origin;
    if (resolved.username || resolved.password) return null;
    if (resolved.protocol === 'https:') return resolved.toString();
    if (resolved.protocol === 'http:' && resolved.origin === apiOrigin) {
      return resolved.toString();
    }
    return null;
  } catch {
    return null;
  }
}
