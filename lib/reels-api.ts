import type {
  GenerationJobStartResponse,
  GenerationJobStatusResponse,
  ScriptJobStatusResponse,
  GenerationOptions,
  Product,
  ReelsApi,
  ScriptDocument,
  VideoResult,
} from '../types/reels';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:8000';

const STATUS_POLL_INTERVAL_MS = 2_000;
// Five script attempts can each spend up to one provider request timeout.
// Keep enough time for retries while the browser only polls the job status.
const SCRIPT_STATUS_POLL_TIMEOUT_MS = 10 * 60 * 1_000;
const STATUS_POLL_TIMEOUT_MS = 30 * 60 * 1_000;
const AI_INFLUENCER_IMAGE_URL =
  'https://lh3.googleusercontent.com/d/1enbiDWV-2TBqDlXNjCOL0WzgPrfR9UGv';

const GENERATION_STAGE_MESSAGES: Record<string, string> = {
  SCRIPT_GENERATION: '스크립트 생성 단계',
  SCRIPT_REGENERATION: '스크립트 재생성 단계',
  TTS_GENERATION: 'TTS 생성 단계',
  TTS_VALIDATION: 'TTS 검증 단계',
  VIDEO_GENERATION: '영상 생성 단계',
  AUDIO_MERGE: '영상과 음성 결합 단계',
  CAPTION_RENDER: 'Caption 적용 단계',
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function apiUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
    };
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
    options.mustInclude && `반드시 포함: ${options.mustInclude}`,
    options.mustExclude && `포함 금지: ${options.mustExclude}`,
    options.extraDetails && `추가 요청: ${options.extraDetails}`,
  ]
    .filter(Boolean)
    .join('\n');
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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
  onProgress?: (status: GenerationJobStatusResponse) => void,
): Promise<VideoResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STATUS_POLL_TIMEOUT_MS) {
    const response = await fetch(apiUrl(statusUrl), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        await readError(response, '최종 영상 생성 상태를 확인하지 못했습니다.'),
      );
    }

    const payload = (await response.json()) as GenerationJobStatusResponse;
    onProgress?.(payload);
    if (payload.status === 'FAILED') {
      const stage = payload.stage
        ? GENERATION_STAGE_MESSAGES[payload.stage] || payload.stage
        : '알 수 없는 단계';
      throw new Error(
        `${stage}에서 실패했습니다. ${payload.error || '상세 원인이 없습니다.'}`,
      );
    }
    if (payload.status === 'COMPLETED') {
      if (!payload.video_url || !payload.download_url) {
        throw new Error('완료된 영상의 재생 또는 다운로드 URL이 없습니다.');
      }
      return {
        jobId,
        status: payload.status,
        videoUrl: apiUrl(payload.video_url),
        downloadUrl: apiUrl(payload.download_url),
        s3ObjectKey: null,
      };
    }
    if (payload.status !== 'PENDING' && payload.status !== 'PROCESSING') {
      throw new Error(`지원하지 않는 생성 상태입니다: ${String(payload.status)}`);
    }

    await delay(STATUS_POLL_INTERVAL_MS);
  }

  throw new Error('최종 영상 생성 대기 시간이 초과되었습니다.');
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
    const response = await fetch(`${API_BASE_URL}/api/v1/reels/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product: product.rawProduct,
        script,
        image_url: product.imageUrl,
        influencer_image_url: AI_INFLUENCER_IMAGE_URL,
        max_duration_seconds: options.durationSeconds,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, '최종 영상 생성을 시작하지 못했습니다.'));
    }

    const payload = (await response.json()) as GenerationJobStartResponse;
    if (!payload.job_id || !payload.status_url) {
      throw new Error('생성 작업 ID 또는 상태 조회 URL이 없습니다.');
    }
    return waitForFinalVideo(payload.job_id, payload.status_url, onProgress);
  },

  async renewVideoUrl(jobId, download = false) {
    const suffix = download ? '?download=true' : '';
    return apiUrl(
      `/api/v1/reels/generate/${encodeURIComponent(jobId)}/file${suffix}`,
    );
  },
};

export type { Product, ScriptDocument, VideoResult };
