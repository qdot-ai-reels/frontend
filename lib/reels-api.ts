import type {
  GenerationOptions,
  Product,
  ReelsApi,
  ScriptDocument,
  VideoResult,
} from '../types/reels';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:8000';

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

    const payload = (await response.json()) as
      | ScriptDocument
      | { script: ScriptDocument };
    return 'script' in payload ? payload.script : payload;
  },

  async generateFinalVideo(product, script) {
    // 현재 develop 계약은 TTS 결합 전 /video입니다. 개발자 1의 최종 생성
    // 엔드포인트가 확정되면 이 함수의 URL과 요청 본문만 교체하면 됩니다.
    const response = await fetch(`${API_BASE_URL}/api/v1/reels/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script,
        image_url: product.imageUrl,
        aspect_ratio: '9:16',
        generate_audio: false,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response, '영상 생성에 실패했습니다.'));
    }

    const payload = (await response.json()) as {
      job_id?: string;
      status?: string;
      video_url?: string;
      download_url?: string;
      s3_object_key?: string;
    };

    return {
      jobId: payload.job_id ?? null,
      status: payload.status ?? 'completed',
      videoUrl: payload.video_url ?? null,
      downloadUrl: payload.download_url ?? null,
      s3ObjectKey: payload.s3_object_key ?? null,
    };
  },

  async renewVideoUrl(jobId, download = false) {
    const params = new URLSearchParams({ download: String(download) });
    const response = await fetch(
      `${API_BASE_URL}/api/v1/reels/video/${encodeURIComponent(jobId)}/url?${params}`,
    );
    if (!response.ok) {
      throw new Error(await readError(response, '영상 URL 재발급에 실패했습니다.'));
    }
    const payload = (await response.json()) as { url?: string };
    if (!payload.url) {
      throw new Error('재발급된 영상 URL이 없습니다.');
    }
    return payload.url;
  },
};

export type { Product, ScriptDocument, VideoResult };
