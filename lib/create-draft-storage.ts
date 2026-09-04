import type { VisualMode } from '../types/reels.ts';
import type { CreateDraft } from '../types/studio.ts';

export const CREATE_DRAFT_STORAGE_KEY = 'quedot.create-draft.v1';

export type StoredCreateWizardStep = 'product' | 'template' | 'creative' | 'review';

export interface StoredCreateDraft {
  schemaVersion: 1;
  savedAt: string;
  step: StoredCreateWizardStep;
  productId: string | null;
  productRevision: number | null;
  templateId: string | null;
  templateVersion: string | null;
  visualMode: VisualMode;
  influencerImageUrls: string[];
  outputCount: number;
  cta: string;
  advertisingPurpose: string;
  channel: string;
  mustInclude: string;
  mustExclude: string;
  extraDetails: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.length <= maximum ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function visualMode(value: unknown): VisualMode | null {
  return value === 'product_only' || value === 'model_included' || value === 'generated_model'
    ? value
    : null;
}

function wizardStep(value: unknown): StoredCreateWizardStep | null {
  return value === 'product' || value === 'template' || value === 'creative' || value === 'review'
    ? value
    : null;
}

export function serializeCreateDraft(
  draft: CreateDraft,
  step: StoredCreateWizardStep,
  savedAt = new Date().toISOString(),
): string {
  const stored: StoredCreateDraft = {
    schemaVersion: 1,
    savedAt,
    step,
    productId: draft.product?.productId ?? null,
    productRevision: draft.product?.revision ?? null,
    templateId: draft.template?.id ?? null,
    templateVersion: draft.template?.version ?? null,
    visualMode: draft.visualMode,
    influencerImageUrls: draft.influencerImageUrls.slice(0, 2),
    outputCount: draft.outputCount,
    cta: draft.cta,
    advertisingPurpose: draft.advertisingPurpose,
    channel: draft.channel,
    mustInclude: draft.mustInclude,
    mustExclude: draft.mustExclude,
    extraDetails: draft.extraDetails,
  };
  return JSON.stringify(stored);
}

export function parseStoredCreateDraft(value: string | null): StoredCreateDraft | null {
  if (!value) return null;
  try {
    const item = asRecord(JSON.parse(value));
    const step = wizardStep(item.step);
    const mode = visualMode(item.visualMode);
    const savedAt = nullableString(item.savedAt);
    const productId = nullableString(item.productId);
    const productRevision = positiveInteger(item.productRevision);
    const templateId = nullableString(item.templateId);
    const templateVersion = nullableString(item.templateVersion);
    const outputCount = positiveInteger(item.outputCount);
    const cta = boundedString(item.cta, 500);
    const advertisingPurpose = boundedString(item.advertisingPurpose, 1_000);
    const channel = boundedString(item.channel, 200);
    const mustInclude = boundedString(item.mustInclude, 2_000);
    const mustExclude = boundedString(item.mustExclude, 2_000);
    const extraDetails = boundedString(item.extraDetails, 4_000);
    const influencerImageUrls = Array.isArray(item.influencerImageUrls)
      ? item.influencerImageUrls
          .filter((entry): entry is string => typeof entry === 'string' && entry.length <= 2_048)
          .slice(0, 2)
      : null;

    if (
      item.schemaVersion !== 1 ||
      !step ||
      !mode ||
      !savedAt ||
      Number.isNaN(Date.parse(savedAt)) ||
      outputCount == null ||
      outputCount > 4 ||
      cta == null ||
      advertisingPurpose == null ||
      channel == null ||
      mustInclude == null ||
      mustExclude == null ||
      extraDetails == null ||
      influencerImageUrls == null ||
      Boolean(productId) !== Boolean(productRevision) ||
      Boolean(templateId) !== Boolean(templateVersion)
    ) {
      return null;
    }

    return {
      schemaVersion: 1,
      savedAt,
      step,
      productId,
      productRevision,
      templateId,
      templateVersion,
      visualMode: mode,
      influencerImageUrls,
      outputCount,
      cta,
      advertisingPurpose,
      channel,
      mustInclude,
      mustExclude,
      extraDetails,
    };
  } catch {
    return null;
  }
}
