'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { VideoCandidateGallery } from '../components/video-candidate-gallery';
import {
  PRODUCTION_ASSET_AUDIT,
  PRODUCTION_PRODUCTS,
} from '../data/production-products';
import { mockReelsApi } from '../lib/mock-reels-api';
import { httpReelsApi } from '../lib/reels-api';
import {
  activeInfluencerReferenceUrls,
  DEFAULT_INFLUENCER_REFERENCE_URLS,
  validateInfluencerReferenceUrl,
} from '../lib/influencer-references';
import type {
  AppStep,
  GenerationOptions,
  GenerationProgress,
  GenerationStage,
  Product,
  ReelsApi,
  ScriptDocument,
  VideoResult,
} from '../types/reels';


const USE_MOCK_SCRIPT = process.env.NEXT_PUBLIC_USE_MOCK_SCRIPT === 'true';
const USE_MOCK_FINAL_VIDEO =
  process.env.NEXT_PUBLIC_USE_MOCK_FINAL_VIDEO === 'true';
const reelsApi: ReelsApi = {
  generateScript: USE_MOCK_SCRIPT
    ? mockReelsApi.generateScript
    : httpReelsApi.generateScript,
  generateFinalVideo: USE_MOCK_FINAL_VIDEO
    ? mockReelsApi.generateFinalVideo
    : httpReelsApi.generateFinalVideo,
  resumeGeneration: USE_MOCK_FINAL_VIDEO
    ? mockReelsApi.resumeGeneration
    : httpReelsApi.resumeGeneration,
  retryCandidate: USE_MOCK_FINAL_VIDEO
    ? mockReelsApi.retryCandidate
    : httpReelsApi.retryCandidate,
  renewVideoUrl: USE_MOCK_FINAL_VIDEO
    ? mockReelsApi.renewVideoUrl
    : httpReelsApi.renewVideoUrl,
};

const modeLabel = USE_MOCK_FINAL_VIDEO
  ? 'MOCK MODE'
  : USE_MOCK_SCRIPT
    ? 'HYBRID MODE'
    : 'BACKEND MODE';

const INITIAL_OPTIONS: GenerationOptions = {
  durationSeconds: 4,
  outputCount: 1,
  visualMode: 'generated_model',
  influencerImageUrls: [...DEFAULT_INFLUENCER_REFERENCE_URLS],
  cta: '',
  advertisingPurpose: '',
  channel: 'Instagram Reels',
  mustInclude: '',
  mustExclude: '',
  extraDetails: '',
};

const STEP_NUMBER: Record<AppStep, number> = {
  product: 1,
  input: 2,
  'script-loading': 2,
  'script-review': 3,
  'video-loading': 3,
  result: 4,
};

const STEP_LABELS = ['공구 선택', '사용자 입력', '스크립트 확인', '영상 생성 완료'];
const VIDEO_DURATION_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const duration = index + 4;
  return [String(duration), `${duration}초`] as [string, string];
});
const OUTPUT_COUNT_OPTIONS = Array.from({ length: 4 }, (_, index) => {
  const count = index + 1;
  return [String(count), `${count}개`] as [string, string];
});
const INITIAL_PRODUCT = PRODUCTION_PRODUCTS[0] ?? null;

const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  QUEUED: '생성 작업 준비 중',
  SCRIPT_GENERATION: '스크립트 생성 중',
  SCRIPT_REGENERATION: '스크립트 다시 생성 중',
  TTS_GENERATION: '음성 생성 중',
  TTS_VALIDATION: '음성 길이 확인 중',
  TTS_FALLBACK: '긴 장면 음성 안전하게 조정 중',
  VIDEO_GENERATION: '영상 생성 중',
  AUDIO_MERGE: '영상과 음성 결합 중',
  CAPTION_RENDER: 'Caption 적용 중',
  COMPLETED: '생성 완료',
  FAILED: '생성 실패',
};

function formatPrice(price: number) {
  return new Intl.NumberFormat('ko-KR').format(price);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

function formatElapsedSeconds(seconds: number | null | undefined) {
  if (seconds == null) return '계산 중';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}분 ${remainingSeconds}초`;
}

function defaultCandidateId(result: VideoResult): string | null {
  const completed = result.candidates
    .filter((candidate) => candidate.status === 'COMPLETED' && candidate.videoUrl)
    .sort((left, right) => {
      const leftPassed = left.validation?.passed ?? left.validation?.valid ?? false;
      const rightPassed = right.validation?.passed ?? right.validation?.valid ?? false;
      if (leftPassed !== rightPassed) return rightPassed ? 1 : -1;
      const leftScore = left.validation?.score ?? -1;
      const rightScore = right.validation?.score ?? -1;
      return rightScore - leftScore || left.index - right.index;
    });
  return completed[0]?.candidateId ?? null;
}

export default function Home() {
  const [step, setStep] = useState<AppStep>('product');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(INITIAL_PRODUCT);
  const [activeEventId, setActiveEventId] = useState(INITIAL_PRODUCT?.eventId ?? '');
  const [productIdInput, setProductIdInput] = useState(INITIAL_PRODUCT?.productId ?? '');
  const [options, setOptions] = useState<GenerationOptions>(INITIAL_OPTIONS);
  const [script, setScript] = useState<ScriptDocument | null>(null);
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [retryingCandidateId, setRetryingCandidateId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resumeActiveRef = useRef(false);
  const resumePromiseRef = useRef<{
    key: string;
    promise: Promise<VideoResult>;
  } | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const jobId = searchParams.get('job')?.trim() ?? '';
    const productId = searchParams.get('product_id')?.trim() ?? '';
    if (!jobId && !productId) return;
    if (!jobId || !productId) {
      window.queueMicrotask(() => {
        setError('기존 작업을 불러오려면 job과 product_id가 모두 필요합니다.');
      });
      return;
    }

    const product = PRODUCTION_PRODUCTS.find(
      (candidate) => candidate.productId === productId,
    );
    if (!product) {
      window.queueMicrotask(() => {
        setError('해당 상품은 현재 strict production 에셋 allowlist에 없습니다.');
      });
      return;
    }

    const resumeKey = `${jobId}:${productId}`;
    resumeActiveRef.current = true;
    window.queueMicrotask(() => {
      if (!resumeActiveRef.current) return;
      setSelectedProduct(product);
      setActiveEventId(product.eventId);
      setProductIdInput(product.productId);
      setError(null);
      setVideoResult(null);
      setGenerationProgress(null);
      setSelectedCandidateId(null);
      setIsResuming(true);
      setStep('video-loading');
    });

    // React Strict Mode replays effects in development. Store the one polling
    // promise so the replay attaches to the existing backend request.
    if (resumePromiseRef.current?.key !== resumeKey) {
      const promise = reelsApi.resumeGeneration(jobId, (progress) => {
        if (!resumeActiveRef.current) return;
        setGenerationProgress(progress);
        setOptions((current) => ({
          ...current,
          outputCount: progress.candidateCount,
        }));
      });
      resumePromiseRef.current = { key: resumeKey, promise };
      promise
        .then((result) => {
          if (!resumeActiveRef.current) return;
          setVideoResult(result);
          setSelectedCandidateId(defaultCandidateId(result));
          setGenerationProgress(null);
          setIsResuming(false);
          setStep('result');
        })
        .catch((resumeError: unknown) => {
          if (!resumeActiveRef.current) return;
          setError(errorMessage(resumeError));
          setGenerationProgress(null);
          setIsResuming(false);
          setStep('product');
        });
    }

    return () => {
      resumeActiveRef.current = false;
    };
  }, []);

  const events = useMemo(
    () =>
      Array.from(
        new Map(
          PRODUCTION_PRODUCTS.map((product) => [
            product.eventId,
            { id: product.eventId, name: product.eventName },
          ]),
        ).values(),
      ),
    [],
  );

  const eventProducts = useMemo(
    () => PRODUCTION_PRODUCTS.filter((product) => product.eventId === activeEventId),
    [activeEventId],
  );

  const currentStep = STEP_NUMBER[step];
  const selectedCandidate =
    videoResult?.candidates.find(
      (candidate) => candidate.candidateId === selectedCandidateId,
    ) ?? null;

  function selectEvent(eventId: string) {
    const firstProduct = PRODUCTION_PRODUCTS.find((product) => product.eventId === eventId);
    if (!firstProduct) return;
    setActiveEventId(eventId);
    setSelectedProduct(firstProduct);
    setProductIdInput(firstProduct.productId);
    setError(null);
  }

  function selectProduct(product: Product) {
    setSelectedProduct(product);
    setProductIdInput(product.productId);
    setError(null);
  }

  function findProductById() {
    const normalizedId = productIdInput.trim().toLowerCase();
    const found = PRODUCTION_PRODUCTS.find(
      (product) => product.productId.toLowerCase() === normalizedId,
    );
    if (!found) {
      setError('일치하는 상품 ID를 찾지 못했습니다.');
      return;
    }
    setActiveEventId(found.eventId);
    setSelectedProduct(found);
    setError(null);
  }

  function updateOption<Key extends keyof GenerationOptions>(
    key: Key,
    value: GenerationOptions[Key],
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function generateScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedProduct) {
      setError('Production 검수를 통과한 상품 에셋이 없습니다.');
      return;
    }
    if (!options.cta.trim() || !options.advertisingPurpose.trim() || !options.channel) {
      setError('CTA 액션, 광고 목적, 노출 채널은 필수 입력 항목입니다.');
      return;
    }
    const referenceUrls = activeInfluencerReferenceUrls(options.influencerImageUrls);
    if (options.visualMode === 'model_included') {
      if (referenceUrls.length === 0) {
        setError('모델 포함 모드는 공개 HTTPS 인물 이미지 URL이 1개 이상 필요합니다.');
        return;
      }
      const invalidReferenceIndex = referenceUrls.findIndex(
        (url) => validateInfluencerReferenceUrl(url) !== null,
      );
      if (invalidReferenceIndex >= 0) {
        setError(
          `모델 레퍼런스 ${invalidReferenceIndex + 1}: ${validateInfluencerReferenceUrl(referenceUrls[invalidReferenceIndex])}`,
        );
        return;
      }
    }

    setStep('script-loading');
    try {
      const generated = await reelsApi.generateScript(selectedProduct, options);
      setScript(generated);
      setStep('script-review');
    } catch (requestError) {
      setError(errorMessage(requestError));
      setStep('input');
    }
  }

  async function generateFinalVideo() {
    if (!script || !selectedProduct) return;
    setError(null);
    setVideoResult(null);
    setGenerationProgress(null);
    setSelectedCandidateId(null);
    setStep('video-loading');
    try {
      const generated = await reelsApi.generateFinalVideo(
        selectedProduct,
        script,
        options,
        setGenerationProgress,
      );
      setVideoResult(generated);
      setSelectedCandidateId(defaultCandidateId(generated));
      setStep('result');
    } catch (requestError) {
      setError(errorMessage(requestError));
      setStep('script-review');
    }
  }

  async function retryCandidate(candidateId: string) {
    if (!videoResult) return;
    const previousResult = videoResult;
    setError(null);
    setGenerationProgress(null);
    setRetryingCandidateId(candidateId);
    setVideoResult({
      ...videoResult,
      status: 'PROCESSING',
      failedCandidates: Math.max(0, videoResult.failedCandidates - 1),
      candidates: videoResult.candidates.map((candidate) =>
        candidate.candidateId === candidateId
          ? {
              ...candidate,
              status: 'PENDING',
              stage: 'QUEUED',
              error: null,
              errorCode: null,
            }
          : candidate,
      ),
    });
    try {
      const generated = await reelsApi.retryCandidate(
        videoResult.jobId,
        candidateId,
        (progress) => {
          setGenerationProgress(progress);
          setVideoResult({
            jobId: progress.jobId,
            status: progress.status,
            candidateCount: progress.candidateCount,
            completedCandidates: progress.completedCandidates,
            failedCandidates: progress.failedCandidates,
            visualMode: progress.visualMode,
            influencerReferenceCount: progress.influencerReferenceCount,
            candidates: progress.candidates,
          });
        },
      );
      setVideoResult(generated);
      setSelectedCandidateId((current) => current ?? defaultCandidateId(generated));
    } catch (requestError) {
      setVideoResult(previousResult);
      setError(errorMessage(requestError));
    } finally {
      setRetryingCandidateId(null);
      setGenerationProgress(null);
    }
  }

  async function renewSelectedUrl() {
    if (!videoResult || !selectedCandidate) return;
    setError(null);
    try {
      const [videoUrl, downloadUrl] = await Promise.all([
        reelsApi.renewVideoUrl(
          videoResult.jobId,
          selectedCandidate.candidateId,
          false,
        ),
        reelsApi.renewVideoUrl(
          videoResult.jobId,
          selectedCandidate.candidateId,
          true,
        ),
      ]);
      setVideoResult((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((candidate) =>
                candidate.candidateId === selectedCandidate.candidateId
                  ? { ...candidate, videoUrl, downloadUrl }
                  : candidate,
              ),
            }
          : current,
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  function resetFlow() {
    setStep('product');
    setScript(null);
    setVideoResult(null);
    setGenerationProgress(null);
    setSelectedCandidateId(null);
    setRetryingCandidateId(null);
    setIsResuming(false);
    setOptions(INITIAL_OPTIONS);
    setError(null);
    window.history.replaceState({}, '', window.location.pathname);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">QUEDOT SHORTS STUDIO</p>
            <h1>AI 릴스 영상 만들기</h1>
          </div>
          <span className={`mode-badge ${USE_MOCK_FINAL_VIDEO ? 'mock' : 'live'}`}>
            {modeLabel}
          </span>
        </header>

        <nav className="stepper" aria-label="영상 생성 단계">
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            const state = number < currentStep ? 'done' : number === currentStep ? 'active' : '';
            return (
              <div
                className={`step ${state}`}
                key={label}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span>{number < currentStep ? '✓' : number}</span>
                <small>{label}</small>
              </div>
            );
          })}
        </nav>

        {error && (
          <div className="error-banner" role="alert">
            <strong>작업을 완료하지 못했습니다.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="오류 닫기">
              ×
            </button>
          </div>
        )}

        {step === 'product' && !selectedProduct && (
          <section className="empty-state page-section" role="status">
            <span aria-hidden="true">!</span>
            <h2>사용 가능한 상품 에셋이 없습니다</h2>
            <p>
              Production 에셋 검수를 통과한 상품만 노출합니다. 에셋 감사 결과를 갱신한 뒤
              다시 빌드해 주세요.
            </p>
            <small>마지막 감사: {PRODUCTION_ASSET_AUDIT.auditedAt}</small>
          </section>
        )}

        {step === 'product' && selectedProduct && (
          <section className="page-section">
            <PageHeading
              title="광고할 공동구매 상품 선택"
              description={`기술 검수 ${PRODUCTION_ASSET_AUDIT.technicallyEligibleProductCount}개 중 상품 정합성까지 확인된 ${PRODUCTION_PRODUCTS.length}개만 표시합니다.`}
            />

            <div className="product-layout">
              <div className="product-preview">
                <Image
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  width={520}
                  height={520}
                  sizes="(max-width: 760px) 120px, 320px"
                  unoptimized
                />
                <div>
                  <span>{selectedProduct.curator}</span>
                  <strong>{selectedProduct.name}</strong>
                  <small>{selectedProduct.option}</small>
                </div>
              </div>

              <div className="product-controls">
                <div className="lookup-row">
                  <label htmlFor="product-id">상품 ID</label>
                  <div>
                    <input
                      id="product-id"
                      value={productIdInput}
                      onChange={(event) => setProductIdInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') findProductById();
                      }}
                    />
                    <button type="button" className="secondary-button" onClick={findProductById}>
                      불러오기
                    </button>
                  </div>
                </div>

                <label className="field-label" htmlFor="event-select">
                  공동구매
                </label>
                <select
                  id="event-select"
                  value={activeEventId}
                  onChange={(event) => selectEvent(event.target.value)}
                >
                  {events.map((event) => (
                    <option value={event.id} key={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>

                <div className="product-list" role="radiogroup" aria-label="공동구매 상품 목록">
                  {eventProducts.map((product) => {
                    const selected = product.productId === selectedProduct.productId;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`product-row ${selected ? 'selected' : ''}`}
                        key={product.productId}
                        onClick={() => selectProduct(product)}
                      >
                        <span className="radio-mark" />
                        <span className="product-copy">
                          <small>{product.productId}</small>
                          <strong>{product.name}</strong>
                          <span>
                            {formatPrice(product.salePrice)}원 · {product.discountLabel}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <FooterActions>
              <button type="button" className="primary-button" onClick={() => setStep('input')}>
                {selectedProduct.name} 영상 제작하기
              </button>
            </FooterActions>
          </section>
        )}

        {step === 'input' && selectedProduct && (
          <section className="page-section">
            <PageHeading
              title="사용자 입력"
              description={`${selectedProduct.eventName} / ${selectedProduct.name}`}
              onCancel={() => setStep('product')}
            />

            <form onSubmit={generateScript}>
              <div className="settings-strip">
                <SelectField
                  label="영상 길이"
                  value={String(options.durationSeconds)}
                  onChange={(value) => updateOption('durationSeconds', Number(value))}
                  options={VIDEO_DURATION_OPTIONS}
                />
                <ReadOnlyField label="화면 비율" value="9:16" />
                <ReadOnlyField label="목표 해상도" value="1080 × 1920" />
                <SelectField
                  label="영상 후보 수"
                  value={String(options.outputCount)}
                  onChange={(value) => updateOption('outputCount', Number(value))}
                  options={OUTPUT_COUNT_OPTIONS}
                />
              </div>

              <fieldset className="visual-mode-panel">
                <legend>영상 출연 방식</legend>
                <div className="visual-mode-options" role="radiogroup" aria-label="영상 출연 방식">
                  <label className={options.visualMode === 'product_only' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="visual-mode"
                      value="product_only"
                      checked={options.visualMode === 'product_only'}
                      onChange={() => updateOption('visualMode', 'product_only')}
                    />
                    <span>
                      <strong>상품만</strong>
                      <small>검수된 상품 이미지만 사용</small>
                    </span>
                  </label>
                  <label className={options.visualMode === 'model_included' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="visual-mode"
                      value="model_included"
                      checked={options.visualMode === 'model_included'}
                      onChange={() => updateOption('visualMode', 'model_included')}
                    />
                    <span>
                      <strong>모델 포함</strong>
                      <small>지정한 인물 레퍼런스 1~2개 사용</small>
                    </span>
                  </label>
                  <label className={options.visualMode === 'generated_model' ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="visual-mode"
                      value="generated_model"
                      checked={options.visualMode === 'generated_model'}
                      onChange={() => updateOption('visualMode', 'generated_model')}
                    />
                    <span>
                      <strong>AI 가상 모델 자동 생성</strong>
                      <small>실존 인물 레퍼런스 없이 모델을 생성</small>
                    </span>
                  </label>
                </div>

                {options.visualMode === 'generated_model' && (
                  <p className="reference-default-note">
                    상품 이미지는 제품 식별용으로만 보내고, 인물은 프롬프트에서 완전히 새로
                    생성합니다. OpenRouter의 인물 이미지 privacy 차단을 우회하지 않고
                    모델이 보이는 UGC 영상을 만듭니다.
                  </p>
                )}

                {options.visualMode === 'model_included' && (
                  <div className="reference-editor">
                    <div className="reference-heading">
                      <div>
                        <strong>모델 레퍼런스</strong>
                        <small>공개된 HTTPS 직접 이미지 URL만 입력하세요.</small>
                      </div>
                      <span>{activeInfluencerReferenceUrls(options.influencerImageUrls).length}/2개</span>
                    </div>
                    {[0, 1].map((index) => {
                      const value = options.influencerImageUrls[index] ?? '';
                      const validationError = validateInfluencerReferenceUrl(value);
                      return (
                        <label className="reference-field" key={index}>
                          <span>인물 이미지 URL {index + 1}{index === 0 ? ' (필수)' : ' (선택)'}</span>
                          <input
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            required={index === 0}
                            value={value}
                            placeholder="https://cdn.example.com/person.jpg"
                            aria-invalid={validationError ? true : undefined}
                            aria-describedby={validationError ? `reference-error-${index}` : undefined}
                            onChange={(event) => {
                              const nextUrls = [...options.influencerImageUrls];
                              nextUrls[index] = event.target.value;
                              updateOption('influencerImageUrls', nextUrls.slice(0, 2));
                            }}
                          />
                          {validationError && (
                            <small className="field-error" id={`reference-error-${index}`}>
                              {validationError}
                            </small>
                          )}
                        </label>
                      );
                    })}
                    <p className="provider-warning" role="note">
                      현재 OpenRouter Seedance는 실제 인물·프라이버시 이미지 요청을 거부할 수
                      있습니다. 모델 포함 모드에서는 잘못된 인물 크롭을 막기 위해 정사각형
                      출력의 중앙 크롭 보정을 사용하지 않고 실패 처리합니다.
                    </p>
                  </div>
                )}

                {options.visualMode === 'product_only' && DEFAULT_INFLUENCER_REFERENCE_URLS.length > 0 && (
                  <p className="reference-default-note">
                    환경 변수에 모델 레퍼런스 {DEFAULT_INFLUENCER_REFERENCE_URLS.length}개가
                    준비되어 있지만, 상품만 모드에서는 전송하지 않습니다.
                  </p>
                )}
              </fieldset>

              <div className="form-grid">
                <TextField
                  label="CTA 액션 / 영상 마지막 문구"
                  value={options.cta}
                  placeholder="예: 지금 프로필 링크에서 확인하세요"
                  required
                  onChange={(value) => updateOption('cta', value)}
                />
                <TextField
                  label="광고 목적"
                  value={options.advertisingPurpose}
                  placeholder="예: 신제품 공동구매 전환 유도"
                  required
                  onChange={(value) => updateOption('advertisingPurpose', value)}
                />
                <SelectField
                  label="노출 채널"
                  value={options.channel}
                  required
                  onChange={(value) => updateOption('channel', value)}
                  options={[
                    ['Instagram Reels', 'Instagram Reels'],
                    ['YouTube Shorts', 'YouTube Shorts'],
                    ['TikTok', 'TikTok'],
                  ]}
                />
              </div>

              <details className="optional-details" open>
                <summary>
                  <span>추가 세부사항</span>
                  <small>선택 입력</small>
                </summary>
                <div className="optional-grid">
                  <TextField
                    label="꼭 포함되어야 하는 것"
                    value={options.mustInclude}
                    placeholder="예: 구성 수량과 할인 혜택"
                    onChange={(value) => updateOption('mustInclude', value)}
                  />
                  <TextField
                    label="절대 포함되면 안 되는 것"
                    value={options.mustExclude}
                    placeholder="예: 확인되지 않은 효능 표현"
                    onChange={(value) => updateOption('mustExclude', value)}
                  />
                  <TextField
                    label="기타 요청사항"
                    value={options.extraDetails}
                    placeholder="예: 밝고 빠른 분위기로 구성"
                    onChange={(value) => updateOption('extraDetails', value)}
                  />
                </div>
              </details>

              <FooterActions>
                <button type="button" className="secondary-button" onClick={() => setStep('product')}>
                  이전
                </button>
                <button type="submit" className="primary-button">
                  스크립트 생성하기
                </button>
              </FooterActions>
            </form>
          </section>
        )}

        {step === 'script-loading' && (
          <LoadingPage
            title="스크립트 생성 중..."
            description="상품 정보와 입력 내용을 분석하고 있습니다."
          />
        )}

        {step === 'script-review' && script && selectedProduct && (
          <section className="page-section">
            <PageHeading
              title="스크립트 확인"
              description={`${selectedProduct.eventName} / ${selectedProduct.name}`}
              onCancel={() => setStep('product')}
            />

            <div className="script-summary">
              <div>
                <span>핵심 메시지</span>
                <strong>{script.summary.key_message}</strong>
              </div>
              <div>
                <span>톤앤매너</span>
                <strong>{script.summary.tone_and_manner}</strong>
              </div>
            </div>

            <div className="scene-list">
              {script.scenes.map((scene, index) => (
                <article className="scene-card" key={`${scene.scene_name}-${index}`}>
                  <div className="scene-index">
                    <span>{scene.scene_name}</span>
                    <small>
                      {scene.time_range_sec.start}–{scene.time_range_sec.end}초
                    </small>
                  </div>
                  <div className="scene-content">
                    <p>{scene.auditory.voiceover || '내레이션 없음'}</p>
                    <small>화면: {scene.visual}</small>
                  </div>
                </article>
              ))}
            </div>

            <p className="scope-note">
              동일한 스크립트로 {options.outputCount}개의 독립 후보를 만들고 각각 품질 검수를
              진행합니다. {options.visualMode === 'model_included'
                ? `모델 레퍼런스 ${activeInfluencerReferenceUrls(options.influencerImageUrls).length}개를 요청마다 전송하며, 정사각형 결과는 크롭하지 않고 실패 처리합니다.`
                : options.visualMode === 'generated_model'
                  ? '실존 인물 레퍼런스 없이 AI 가상 모델을 생성하고, 상품 이미지는 제품 식별 reference로 사용합니다.'
                  : '상품만 사용하며, 감사된 상품 정책에 따라 필요한 경우 중앙 크롭 정규화를 적용합니다.'}{' '}
              생성 비용은 후보 수에 비례합니다.
            </p>

            <FooterActions>
              <button type="button" className="secondary-button" onClick={() => setStep('input')}>
                입력 수정
              </button>
              <button type="button" className="primary-button" onClick={generateFinalVideo}>
                이 스크립트로 영상 생성하기
              </button>
            </FooterActions>
          </section>
        )}

        {step === 'video-loading' && (
          <LoadingPage
            title={
              isResuming
                ? '기존 영상 작업 불러오는 중...'
                : `${options.outputCount}개 영상 후보 생성 중...`
            }
            description={
              isResuming
                ? '저장된 작업 상태를 확인하고 완료된 후보를 복구하고 있습니다.'
                : '각 후보를 독립적으로 생성하고 음성·자막·품질 검수를 적용하고 있습니다.'
            }
          >
            {generationProgress && (
              <div className="generation-progress" aria-live="polite">
                <div className="progress-heading">
                  <strong>
                    {generationProgress.stage
                      ? GENERATION_STAGE_LABELS[generationProgress.stage]
                      : generationProgress.status}
                  </strong>
                  <span>
                    {generationProgress.completedCandidates}/{generationProgress.candidateCount} 완료
                  </span>
                </div>
                <span>경과 시간: {formatElapsedSeconds(generationProgress.elapsedSeconds)}</span>
                <p>{generationProgress.message ?? '작업을 처리하고 있습니다.'}</p>
                <div className="candidate-progress-list">
                  {generationProgress.candidates.map((candidate) => (
                    <div key={candidate.candidateId}>
                      <span>후보 {candidate.index}</span>
                      <strong>
                        {candidate.stage
                          ? GENERATION_STAGE_LABELS[candidate.stage]
                          : candidate.status}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </LoadingPage>
        )}

        {step === 'result' && videoResult && selectedProduct && (
          <section className="page-section">
            <PageHeading
              title={
                videoResult.completedCandidates > 0
                  ? '영상 후보가 준비되었습니다'
                  : '사용 가능한 후보가 없습니다'
              }
              description={`${selectedProduct.eventName} / ${selectedProduct.name} · 작업 ${videoResult.jobId}`}
            />

            <p className="result-mode-badge">
              출연 방식:{' '}
              {(videoResult.visualMode ?? options.visualMode) === 'model_included'
                ? `모델 포함 · 레퍼런스 ${videoResult.influencerReferenceCount ?? activeInfluencerReferenceUrls(options.influencerImageUrls).length}개`
                : (videoResult.visualMode ?? options.visualMode) === 'generated_model'
                  ? 'AI 가상 모델 자동 생성 · 인물 레퍼런스 없음'
                  : '상품만'}
            </p>

            <div className="result-summary" aria-live="polite">
              <div>
                <span>생성 후보</span>
                <strong>{videoResult.candidateCount}개</strong>
              </div>
              <div className="summary-success">
                <span>사용 가능</span>
                <strong>{videoResult.completedCandidates}개</strong>
              </div>
              <div className={videoResult.failedCandidates > 0 ? 'summary-failed' : ''}>
                <span>실패</span>
                <strong>{videoResult.failedCandidates}개</strong>
              </div>
            </div>

            {retryingCandidateId && (
              <div className="retry-progress" role="status">
                <span className="mini-spinner" aria-hidden="true" />
                <div>
                  <strong>실패한 후보를 다시 생성하고 있습니다.</strong>
                  <small>
                    {generationProgress?.message ?? '영상 생성과 품질 검수를 진행 중입니다.'}
                  </small>
                </div>
              </div>
            )}

            <VideoCandidateGallery
              candidates={videoResult.candidates}
              selectedCandidateId={selectedCandidateId}
              retryingCandidateId={retryingCandidateId}
              onSelect={setSelectedCandidateId}
              onRetry={retryCandidate}
            />

            <section className="delivery-panel" aria-label="선택한 최종 영상">
              {selectedCandidate ? (
                <>
                  <div>
                    <span className="success-label">DELIVERY READY</span>
                    <h2>후보 {selectedCandidate.index} 선택됨</h2>
                    <p>
                      선택한 영상을 확인한 뒤 다운로드하세요. 다운로드 응답에는 파일명이
                      포함됩니다.
                    </p>
                  </div>
                  <div className="delivery-actions">
                    {selectedCandidate.downloadUrl ? (
                      <a className="primary-button" href={selectedCandidate.downloadUrl}>
                        선택한 영상 다운로드
                      </a>
                    ) : (
                      <button type="button" className="primary-button" disabled>
                        다운로드 준비 중
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={USE_MOCK_FINAL_VIDEO}
                      onClick={renewSelectedUrl}
                    >
                      재생·다운로드 URL 갱신
                    </button>
                  </div>
                </>
              ) : (
                <div>
                  <h2>다운로드할 후보를 선택하세요</h2>
                  <p>
                    사용 가능한 영상이 있으면 후보 카드에서 선택할 수 있습니다. 실패한 후보는
                    해당 카드에서 개별 재시도하세요.
                  </p>
                </div>
              )}
            </section>

            <FooterActions>
              <button type="button" className="secondary-button" onClick={resetFlow}>
                공구 목록으로 돌아가기
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={retryingCandidateId !== null || !script}
                onClick={generateFinalVideo}
              >
                {script ? '같은 설정으로 후보 다시 만들기' : '후보 재시도만 가능'}
              </button>
            </FooterActions>
          </section>
        )}
      </section>
    </main>
  );
}

function PageHeading({
  title,
  description,
  onCancel,
}: {
  title: string;
  description: string;
  onCancel?: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {onCancel && (
        <button type="button" className="text-button" onClick={onCancel}>
          취소하기
        </button>
      )}
    </div>
  );
}

function FooterActions({ children }: { children: ReactNode }) {
  return <div className="footer-actions">{children}</div>;
}

function TextField({
  label,
  value,
  placeholder,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>
        {label} {required && <em>필수</em>}
      </span>
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field compact">
      <span>
        {label} {required && <em>필수</em>}
      </span>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="form-field compact">
      <span>{label}</span>
      <input value={value} readOnly aria-readonly="true" />
    </label>
  );
}

function LoadingPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="loading-page">
      <div className="spinner" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      <small>작업 중에는 창을 닫거나 생성 버튼을 다시 누르지 마세요.</small>
    </section>
  );
}
