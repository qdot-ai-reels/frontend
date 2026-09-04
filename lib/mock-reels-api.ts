import type {
  GenerationProgress,
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
  const hookEnd = Math.max(1, Math.floor(total / 3));
  const bodyEnd = Math.max(hookEnd + 1, Math.floor((total * 2) / 3));

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
          voiceover: '주목.',
        },
        notes: '첫 장면에서 상품을 명확히 노출한다.',
      },
      {
        scene_name: 'Body',
        time_range_sec: { start: hookEnd, end: bodyEnd },
        visual: '상품 구성과 핵심 장점을 차례로 보여준다.',
        auditory: {
          subtitle: product.name,
          voiceover: '구성.',
        },
        notes: options.mustInclude || '상품의 핵심 장점을 전달한다.',
      },
      {
        scene_name: 'CTA',
        time_range_sec: { start: bodyEnd, end: total },
        visual: '상품 이미지와 CTA 문구를 함께 보여준다.',
        auditory: {
          subtitle: options.cta,
          voiceover: '확인.',
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

  async generateFinalVideo(_product, _script, options, onProgress): Promise<VideoResult> {
    const candidates = Array.from({ length: options.outputCount }, (_, index) => ({
      candidateId: `candidate-${String(index + 1).padStart(2, '0')}`,
      index: index + 1,
      status: 'COMPLETED' as const,
      stage: 'COMPLETED' as const,
      providerJobId: `mock-provider-${index + 1}`,
      captionJobId: `mock-caption-${index + 1}`,
      attempts: 1,
      cost: 0,
      validation: { valid: true, width: 1080, height: 1920 },
      error: null,
      errorCode: null,
      retryable: false,
      videoUrl: null,
      downloadUrl: null,
    }));
    const progress: GenerationProgress = {
      jobId: 'mock-job-001',
      status: 'PROCESSING',
      stage: 'VIDEO_GENERATION',
      elapsedSeconds: 1,
      message: '목 후보 영상을 준비하고 있습니다.',
      candidateCount: options.outputCount,
      completedCandidates: 0,
      failedCandidates: 0,
      visualMode: options.visualMode,
      influencerReferenceCount:
        options.visualMode === 'model_included'
          ? options.influencerImageUrls.filter((url) => url.trim()).slice(0, 2).length
          : 0,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        status: 'PROCESSING' as const,
        stage: 'VIDEO_GENERATION' as const,
      })),
    };
    onProgress?.(progress);
    await delay(900);
    return {
      jobId: 'mock-job-001',
      status: 'COMPLETED',
      candidateCount: options.outputCount,
      completedCandidates: options.outputCount,
      failedCandidates: 0,
      visualMode: options.visualMode,
      influencerReferenceCount:
        options.visualMode === 'model_included'
          ? options.influencerImageUrls.filter((url) => url.trim()).slice(0, 2).length
          : 0,
      candidates,
    };
  },

  async retryCandidate() {
    await delay(200);
    throw new Error('목 모드에서는 후보를 재시도하지 않습니다.');
  },

  async resumeGeneration() {
    await delay(200);
    throw new Error('목 모드에서는 기존 backend 작업을 다시 불러오지 않습니다.');
  },

  async renewVideoUrl() {
    await delay(200);
    throw new Error('목 모드에서는 Presigned URL을 발급하지 않습니다.');
  },
};
