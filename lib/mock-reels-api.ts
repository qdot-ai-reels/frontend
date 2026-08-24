import type {
  GenerationOptions,
  Product,
  ReelsApi,
  ScriptDocument,
  VideoResult,
} from '../types/reels';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function buildMockScript(
  product: Product,
  options: GenerationOptions,
): ScriptDocument {
  const total = options.durationSeconds;
  const hookEnd = Math.max(1, Math.floor(total * 0.3));
  const bodyEnd = Math.max(hookEnd + 1, Math.floor(total * 0.72));

  return {
    meta: {
      output_format_version: '1.0',
      framework: 'Hook-Body-CTA',
      language: 'ko',
    },
    summary: {
      main_target: '공동구매 상품에 관심 있는 고객',
      pain_point: options.advertisingPurpose,
      product_usp: `${product.name}의 구성과 가격 혜택`,
      key_message: options.cta,
      tone_and_manner: '간결하고 신뢰감 있는 공동구매 광고',
    },
    scenes: [
      {
        scene_name: 'Hook',
        time_range_sec: { start: 0, end: hookEnd },
        visual: `${product.name}을 화면 중앙에 보여준다.`,
        auditory: {
          subtitle: '이 구성, 지금 확인하세요',
          voiceover: '이 구성, 놓치지 마세요.',
        },
        notes: '첫 장면에서 상품을 명확히 노출한다.',
      },
      {
        scene_name: 'Body',
        time_range_sec: { start: hookEnd, end: bodyEnd },
        visual: '상품 구성과 핵심 장점을 차례로 보여준다.',
        auditory: {
          subtitle: product.name,
          voiceover: `${product.name}, 필요한 구성만 알차게 담았어요.`,
        },
        notes: options.mustInclude || '상품의 핵심 장점을 전달한다.',
      },
      {
        scene_name: 'CTA',
        time_range_sec: { start: bodyEnd, end: total },
        visual: '상품 이미지와 CTA 문구를 함께 보여준다.',
        auditory: {
          subtitle: options.cta,
          voiceover: options.cta,
        },
        notes: options.mustExclude
          ? `포함 금지: ${options.mustExclude}`
          : '명확한 행동을 유도한다.',
      },
    ],
    compliance_notes: {
      avoid: options.mustExclude ? [options.mustExclude] : [],
      focus: options.mustInclude ? [options.mustInclude] : [product.name],
    },
  };
}

export const mockReelsApi: ReelsApi = {
  async generateScript(product, options) {
    await delay(650);
    return buildMockScript(product, options);
  },

  async generateFinalVideo(): Promise<VideoResult> {
    await delay(900);
    return {
      jobId: 'mock-job-001',
      status: 'completed',
      videoUrl: null,
      downloadUrl: null,
      s3ObjectKey: 'outputs/mock-job-001/final.mp4',
    };
  },

  async renewVideoUrl() {
    await delay(200);
    throw new Error('목 모드에서는 Presigned URL을 발급하지 않습니다.');
  },
};
