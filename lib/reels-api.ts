import type {
  GenerationJobStartResponse,
  GenerationJobStatusResponse,
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
const STATUS_POLL_TIMEOUT_MS = 20 * 60 * 1_000;
const AI_INFLUENCER_IMAGE_URL =
  'https://lh3.googleusercontent.com/d/1enbiDWV-2TBqDlXNjCOL0WzgPrfR9UGv';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function apiUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === 'string') {
      return payload.detail;
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

function normalizeScriptDocument(payload: unknown): ScriptDocument {
  const candidate =
    payload && typeof payload === 'object' && 'script' in payload
      ? (payload as { script?: unknown }).script
      : payload;
  const document = candidate as Record<string, any>;

  if (document?.summary && Array.isArray(document.scenes)) {
    return document as ScriptDocument;
  }

  const product = document?.product ?? {};
  const customer = document?.customer ?? {};
  const ads = document?.ads ?? {};
  const video = document?.video ?? {};
  const scenes = Array.isArray(document?.scenes) ? document.scenes : [];

  return {
    meta: {
      output_format_version: String(document?.meta?.output_format_version ?? '1.0'),
      framework: String(document?.etc?.video_ads_methodology ?? 'Hook-Body-CTA'),
      language: String(document?.meta?.language ?? 'ko'),
    },
    summary: {
      main_target: String(customer.main_target ?? ads.main_target ?? ''),
      pain_point: String(customer.pain_point ?? ''),
      product_usp: String(product.usp ?? ''),
      key_message: String(ads.cta_action ?? product.usp ?? ''),
      tone_and_manner: String(ads.speaker?.tone ?? ''),
    },
    scenes: scenes.map((scene: Record<string, any>) => ({
      scene_name: String(scene.section ?? scene.scene_name ?? 'Scene'),
      time_range_sec: {
        start: Number(scene.time_range_sec?.start ?? 0),
        end: Number(scene.time_range_sec?.end ?? 0),
      },
      visual: String(scene.visual ?? ''),
      auditory: {
        subtitle: String(scene.auditory?.subtitle ?? ''),
        voiceover: scene.auditory?.voiceover ?? null,
      },
      notes: String(scene.notes ?? scene.intent ?? ''),
    })),
    compliance_notes: {
      avoid: Array.isArray(document?.compliance_notes?.avoid)
        ? document.compliance_notes.avoid
        : [],
      focus: Array.isArray(document?.compliance_notes?.focus)
        ? document.compliance_notes.focus
        : [],
    },
  };
}

async function waitForFinalVideo(
  jobId: string,
  statusUrl: string,
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
    if (payload.status === 'FAILED') {
      throw new Error(payload.error || '최종 영상 생성에 실패했습니다.');
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

    return normalizeScriptDocument(await response.json());
  },

  async generateFinalVideo(product, script) {
    const response = await fetch(`${API_BASE_URL}/api/v1/reels/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script,
        image_url: product.imageUrl,
        influencer_image_url: AI_INFLUENCER_IMAGE_URL,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, '최종 영상 생성을 시작하지 못했습니다.'));
    }

    const payload = (await response.json()) as GenerationJobStartResponse;
    if (!payload.job_id || !payload.status_url) {
      throw new Error('생성 작업 ID 또는 상태 조회 URL이 없습니다.');
    }
    return waitForFinalVideo(payload.job_id, payload.status_url);
  },

  async renewVideoUrl(jobId, download = false) {
    const suffix = download ? '?download=true' : '';
    return apiUrl(
      `/api/v1/reels/generate/${encodeURIComponent(jobId)}/file${suffix}`,
    );
  },
};

export type { Product, ScriptDocument, VideoResult };
