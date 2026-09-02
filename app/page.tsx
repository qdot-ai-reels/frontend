'use client';

import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { PRODUCTS } from '../data/products';
import { mockReelsApi } from '../lib/mock-reels-api';
import { httpReelsApi } from '../lib/reels-api';
import type {
  AppStep,
  GenerationOptions,
  GenerationJobStatusResponse,
  GenerationStage,
  Product,
  ReelsApi,
  ScriptDocument,
  VideoResult,
} from '../types/reels';


const USE_MOCK_SCRIPT = false;
const USE_MOCK_FINAL_VIDEO = false;
const reelsApi: ReelsApi = {
  generateScript: USE_MOCK_SCRIPT
    ? mockReelsApi.generateScript
    : httpReelsApi.generateScript,
  generateFinalVideo: USE_MOCK_FINAL_VIDEO
    ? mockReelsApi.generateFinalVideo
    : httpReelsApi.generateFinalVideo,
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
  durationSeconds: 6,
  outputCount: 1,
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

const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  QUEUED: '생성 작업 준비 중',
  SCRIPT_GENERATION: '스크립트 생성 중',
  SCRIPT_REGENERATION: '스크립트 다시 생성 중',
  TTS_GENERATION: '음성 생성 중',
  TTS_VALIDATION: '음성 길이 확인 중',
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

export default function Home() {
  const [step, setStep] = useState<AppStep>('product');
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[0]);
  const [activeEventId, setActiveEventId] = useState(PRODUCTS[0].eventId);
  const [productIdInput, setProductIdInput] = useState(PRODUCTS[0].productId);
  const [options, setOptions] = useState<GenerationOptions>(INITIAL_OPTIONS);
  const [script, setScript] = useState<ScriptDocument | null>(null);
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
  const [generationProgress, setGenerationProgress] =
    useState<GenerationJobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const events = useMemo(
    () =>
      Array.from(
        new Map(
          PRODUCTS.map((product) => [
            product.eventId,
            { id: product.eventId, name: product.eventName },
          ]),
        ).values(),
      ),
    [],
  );

  const eventProducts = useMemo(
    () => PRODUCTS.filter((product) => product.eventId === activeEventId),
    [activeEventId],
  );

  const currentStep = STEP_NUMBER[step];

  function selectEvent(eventId: string) {
    const firstProduct = PRODUCTS.find((product) => product.eventId === eventId);
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
    const found = PRODUCTS.find(
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

    if (!options.cta.trim() || !options.advertisingPurpose.trim() || !options.channel) {
      setError('CTA 액션, 광고 목적, 노출 채널은 필수 입력 항목입니다.');
      return;
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
    if (!script) return;
    setError(null);
    setVideoResult(null);
    setGenerationProgress(null);
    setStep('video-loading');
    try {
      const generated = await reelsApi.generateFinalVideo(
        selectedProduct,
        script,
        options,
        setGenerationProgress,
      );
      setVideoResult(generated);
      setStep('result');
    } catch (requestError) {
      setError(errorMessage(requestError));
      setStep('script-review');
    }
  }

  async function renewUrl(download: boolean) {
    if (!videoResult?.jobId) return;
    setError(null);
    try {
      const url = await reelsApi.renewVideoUrl(videoResult.jobId, download);
      setVideoResult((current) =>
        current
          ? {
              ...current,
              videoUrl: download ? current.videoUrl : url,
              downloadUrl: download ? url : current.downloadUrl,
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
    setOptions(INITIAL_OPTIONS);
    setError(null);
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-live="polite">
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
              <div className={`step ${state}`} key={label}>
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

        {step === 'product' && (
          <section className="page-section">
            <PageHeading
              title="광고할 공동구매 상품 선택"
              description="상품 ID로 불러오거나 공동구매 목록에서 상품 한 개를 선택하세요."
            />

            <div className="product-layout">
              <div className="product-preview">
                <img src={selectedProduct.imageUrl} alt={selectedProduct.name} />
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

        {step === 'input' && (
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
                <ReadOnlyField label="해상도" value="자동" />
                <ReadOnlyField label="출력물 개수" value="1개 (MVP)" />
              </div>

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

        {step === 'script-review' && script && (
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
              이번 주 MVP에서는 단일 스크립트 확인만 제공합니다. 후보 비교·직접 수정·추가 요청은
              후속 범위입니다.
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
            title="최종 영상 생성 중..."
            description="영상과 음성을 생성하고 결과를 준비하고 있습니다."
          >
            {generationProgress && (
              <div className="generation-progress" aria-live="polite">
                <strong>
                  {generationProgress.stage
                    ? GENERATION_STAGE_LABELS[generationProgress.stage]
                    : generationProgress.status}
                </strong>
                <span>
                  경과 시간: {formatElapsedSeconds(generationProgress.elapsed_seconds)}
                </span>
                <p>{generationProgress.message ?? '작업을 처리하고 있습니다.'}</p>
              </div>
            )}
          </LoadingPage>
        )}

        {step === 'result' && videoResult && (
          <section className="page-section">
            <PageHeading
              title="영상 생성 완료"
              description={`${selectedProduct.eventName} / ${selectedProduct.name}`}
            />

            <div className="result-layout">
              <div className="video-frame">
                {videoResult.videoUrl ? (
                  <video src={videoResult.videoUrl} controls playsInline />
                ) : (
                  <div className="mock-video-placeholder">
                    <span>✓</span>
                    <strong>목 영상 생성 완료</strong>
                    <small>BACKEND MODE에서 S3 영상이 표시됩니다.</small>
                  </div>
                )}
              </div>

              <div className="result-panel">
                <span className="success-label">GENERATION COMPLETED</span>
                <h2>{selectedProduct.name}</h2>
                <dl>
                  <div>
                    <dt>상태</dt>
                    <dd>{videoResult.status}</dd>
                  </div>
                  <div>
                    <dt>결과 저장 위치</dt>
                    <dd>{videoResult.s3ObjectKey ?? '백엔드 최종 결과 파일'}</dd>
                  </div>
                </dl>

                <div className="result-buttons">
                  {videoResult.downloadUrl ? (
                    <a className="primary-button" href={videoResult.downloadUrl}>
                      영상 다운로드
                    </a>
                  ) : (
                    <button type="button" className="primary-button" disabled>
                      영상 다운로드
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!videoResult.jobId || USE_MOCK_FINAL_VIDEO}
                    onClick={() => renewUrl(false)}
                  >
                    재생 URL 갱신
                  </button>
                </div>
              </div>
            </div>

            <p className="scope-note">
              Caption 설정 UI는 이번 데모 범위에서 제외했으며, 백엔드 기본 설정으로 렌더링된
              최종 결과를 재생·다운로드합니다.
            </p>

            <FooterActions>
              <button type="button" className="primary-button" onClick={resetFlow}>
                공구 목록으로 돌아가기
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
