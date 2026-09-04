import type { StudioScriptDocument, StudioScriptScene } from '../types/studio';

type JsonRecord = Record<string, unknown>;

export const PENDING_SUBMISSION_KEY = 'quedot.pending-generation';

export interface PendingSubmission {
  clientRequestId: string;
  quoteId: string;
  createdAt: string;
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
    return { clientRequestId, quoteId, createdAt };
  } catch {
    return null;
  }
}

export function isExplicitSubmissionRejection(status: number | null): boolean {
  return status != null && status >= 400 && status < 500 && status !== 408;
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
