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
  durationSeconds: 15,
  outputCount: 1,
  cta: '',
  advertisingPurpose: '',
  channel: 'Instagram Reels',
  scriptPrompt: '',
  videoPrompt: '',
  useDefaultScriptPrompt: true,
  useDefaultVideoPrompt: true,
};

const DEFAULT_SCRIPT_PROMPT =
  `당신은 공동구매 광고 숏폼 스크립트 작성자입니다.

아래 상품 데이터에 실제로 포함된 정보만 사용해 스크립트를 작성하세요.

### Condition
#### 1. 광고 진실성
(1) 입력된 상품 정보 안에서만 사실을 작성한다.
(2) 과대광고성 문구(효능 과장, 근거 없는 내용 등)를 포함하지 말아야 한다.
(3) 지나치게 과장하지 말아야 한다.
(4) 실제 사용자의 사용담처럼 허위 경험이 들어가면 안 된다.

#### 2. 상품 정보
(1) 비어있는 상품 정보 중 유저가 프롬프트를 통해 해당 상품정보를 입력했다면 반영하여 채워 넣는다.
(2) USP가 비어 있고 유저가 USP 정보를 제공하지 않았다면 다른 상품 정보에 근거하여 USP를 추론한다.

#### 3. 핵심 원칙
(1) 숏폼의 첫 1~3초 안에 소비자의 문제나 관심사를 제시한다.
(2) 상품이 어떤 상황에서 왜 좋은지 보여준다.
(3) 상품의 기능과 사용 장면처럼 소비자가 판단할 수 있는 정보를 포함한다.

#### 4. 영상 구현 구체성
(1) 추상적 표현 대신 카메라 용어와 조명 언어를 사용한다.
- 카메라 용어: dolly, pan, tilt, crane, push-in, rack focus, locked-off
- 조명 언어: Reduce fill, Cool down, Desaturate, Diffuse, Dim down, Reposition
(2) 등장인물이 카메라를 주시하며 말하지 않는다.
(3) 같은 인물의 얼굴, 헤어스타일, 의상을 장면마다 유지한다.
(4) 상품 이미지의 형태, 색상, 라벨, 용기가 바뀌지 않도록 한다.
(5) 영상 생성 모델이 만드는 프레임에는 상품 표기 텍스트 외의 글자를 직접 넣지 않는다.

#### 5. 영상 내 상품 텍스트 노출 최소화
- 상품 라벨의 글자와 로고를 식별 가능한 정면 클로즈업으로 보여주지 않는다.
- 상품의 형태, 색상, 용기 구조는 유지하되 라벨은 비가독 상태로 표현한다.
- 상품 라벨은 화면 밖으로 일부 잘리거나 손·소품·그림자에 의해 부분적으로 가린다.
- 영상 프레임 안에는 자막, 가격, 할인율, CTA 문구를 직접 삽입하지 않는다.

#### 6. HyperFrames 캡션
- auditory.subtitle은 영상 생성 모델이 그리는 글자가 아니라 영상 생성 후 HyperFrames가 추가하는 텍스트 애니메이션용 캡션이다.
- auditory.subtitle은 voiceover와 구분하여 작성하고 캡션으로 표시할 짧은 문구를 넣는다.
- auditory.subtitle을 null이나 빈 문자열로 반환하지 않는다.
- visual 설명에는 자막·가격·할인율·CTA 문구를 넣지 않고 auditory.subtitle로만 전달한다.

#### 7. 음성 대사 길이
- 영상 스크립트 내 음성 대사는 1초에 4.5음절이 넘지 않도록 한다.
- 각 장면의 허용 음절 수는 장면 시간(초) × 4.5를 계산한 뒤 소수점 이하는 버린다.
- 허용 음절 수를 단 1개라도 초과하는 voiceover는 작성하지 않는다.
- 대사를 작성한 뒤 각 장면의 voiceover 음절 수를 직접 확인하고 제한을 초과하면 더 짧게 다시 작성한다.
- 장면 시간이 짧은 경우 한두 단어 수준으로 간결하게 작성한다.

### Methodology
#### 필수 방법론
- scenes의 가장 마지막 Section에 시청자가 취할 수 있는 구체적인 CTA를 추가한다.

#### 선택 방법론
- Hook-Body-CTA
- PAS
- AIDA
- BAB(Before-After-Bridge)
- 4Ps(Promise-Picture-Proof-Push)
- Anti-Slop Prompt For Video: 현실성을 위해 불완전성을 더한다.
  - Product: signs of use
  - Camera: slight handheld motion
  - People: imperfect skin texture, subtle blemishes, wrinkled fabric, natural and subtle asymmetry

### 자동 삽입 항목
- CTA Action: 요청 시 입력값
- Video duration: 요청 시 선택값
- Upload Channel: 요청 시 채널값
- 상품 정보: 선택한 공구 데이터
- 출력 형식: 기존 Structured Output JSON, 하나 이상의 scenes 포함`;
const DEFAULT_VIDEO_PROMPT =
  `### Condition
1. Video Rules
- No dialogue or direct-to-camera speech.
- Keep the same person's appearance and clothing consistent across shots.
- Preserve the provided product's shape, color, package structure, and label placement.

2. Reference (person) image
- Use the provided person image as the character reference. The person in the image was generated using AI.
- Front-facing appearance is not required.

3. Anti-Slop Prompt For Video
Camera
- slight handheld motion

People
- imperfect skin texture
- subtle blemishes
- subtle clothing wrinkles
- natural and subtle asymmetry

4. Text & Label Policy
- No added subtitles, captions, price, discount, or CTA text.
- Do not intentionally show product text in a readable close-up.
- Preserve the original product label and graphics.
- Do not generate or modify package text or logos.

### 자동 삽입 항목
- 스크립트 scenes의 visual 지시
- 선택한 상품 이미지 및 AI 인플루언서 이미지
- 인플루언서가 제공된 경우 인플루언서는 화면에 명확히 보여야 하며 손·손가락·화면 밖 행동만으로 대체하지 않음`;

const STEP_NUMBER: Record<AppStep, number> = {
  product: 1,
  input: 2,
  'script-loading': 2,
  'script-review': 3,
  'video-loading': 3,
  result: 4,
};

const STEP_LABELS = ['공구 선택', '사용자 입력', '스크립트 확인', '영상 생성 완료'];

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

function estimatedVoiceoverSyllables(voiceover: string) {
  return Array.from(voiceover.replace(/[\s.,!?·…。、！？]/g, '')).length;
}

function updateSceneField(
  document: ScriptDocument,
  index: number,
  field: 'visual' | 'voiceover',
  value: string,
): ScriptDocument {
  return {
    ...document,
    scenes: document.scenes.map((scene, sceneIndex) =>
      sceneIndex === index
        ? field === 'visual'
          ? { ...scene, visual: value }
          : { ...scene, auditory: { ...scene.auditory, voiceover: value } }
        : scene,
    ),
  };
}

export default function Home() {
  const [step, setStep] = useState<AppStep>('product');
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[0]);
  const [activeEventId, setActiveEventId] = useState(PRODUCTS[0].eventId);
  const [productIdInput, setProductIdInput] = useState(PRODUCTS[0].productId);
  const [options, setOptions] = useState<GenerationOptions>(INITIAL_OPTIONS);
  const [script, setScript] = useState<ScriptDocument | null>(null);
  const [scriptWasEdited, setScriptWasEdited] = useState(false);
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

    if (!options.useDefaultScriptPrompt && !options.scriptPrompt?.trim()) {
      setError('기본 스크립트 프롬프트를 사용하지 않으면 새 프롬프트를 입력해주세요.');
      return;
    }

    setStep('script-loading');
    try {
      const generated = await reelsApi.generateScript(selectedProduct, options);
      setScript(generated);
      setScriptWasEdited(false);
      setStep('script-review');
    } catch (requestError) {
      setError(errorMessage(requestError));
      setStep('input');
    }
  }

  async function generateFinalVideo() {
    if (!script) return;
    if (!options.useDefaultVideoPrompt && !options.videoPrompt.trim()) {
      setError('기본 영상 프롬프트를 사용하지 않으면 새 프롬프트를 입력해주세요.');
      return;
    }
    const invalidScene = script.scenes.find((scene) => {
      const duration = scene.time_range_sec.end - scene.time_range_sec.start;
      const voiceover = scene.auditory.voiceover?.trim() ?? '';
      return voiceover && estimatedVoiceoverSyllables(voiceover) > Math.ceil(duration * 4.5);
    });
    if (invalidScene) {
      const sceneIndex = script.scenes.indexOf(invalidScene) + 1;
      setError(`${sceneIndex}번째 장면의 대사가 장면 시간보다 깁니다. 대사를 줄인 후 다시 시도해주세요.`);
      return;
    }
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
        !scriptWasEdited,
        options.videoPrompt,
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
    setScriptWasEdited(false);
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
              <div className="prompt-editor">
                <div className="prompt-choice-row">
                  <label className="prompt-toggle">
                    <input
                      type="checkbox"
                      checked={options.useDefaultScriptPrompt}
                      onChange={() => updateOption('useDefaultScriptPrompt', true)}
                    />
                    기본 스크립트 프롬프트 사용
                  </label>
                  <label className="prompt-toggle">
                    <input
                      type="checkbox"
                      checked={!options.useDefaultScriptPrompt}
                      onChange={() => updateOption('useDefaultScriptPrompt', false)}
                    />
                    새 스크립트 프롬프트 사용
                  </label>
                </div>
                {options.useDefaultScriptPrompt ? (
                  <label className="prompt-field">
                    <span>기본 스크립트 프롬프트 (읽기 전용)</span>
                    <textarea value={DEFAULT_SCRIPT_PROMPT} readOnly />
                  </label>
                ) : (
                  <TextField
                    label="사용자 지정 스크립트 프롬프트"
                    value={options.scriptPrompt}
                    placeholder="사용할 스크립트 프롬프트를 직접 입력하세요."
                    onChange={(value) => updateOption('scriptPrompt', value)}
                  />
                )}
              </div>

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

            <div className="prompt-editor">
              <div className="prompt-choice-row">
                <label className="prompt-toggle">
                  <input
                    type="checkbox"
                    checked={options.useDefaultVideoPrompt}
                    onChange={() => updateOption('useDefaultVideoPrompt', true)}
                  />
                  기본 영상 생성 프롬프트 사용
                </label>
                <label className="prompt-toggle">
                  <input
                    type="checkbox"
                    checked={!options.useDefaultVideoPrompt}
                    onChange={() => updateOption('useDefaultVideoPrompt', false)}
                  />
                  새 영상 생성 프롬프트 사용
                </label>
              </div>
                {options.useDefaultVideoPrompt ? (
                <label className="prompt-field">
                  <span>기본 영상 생성 프롬프트 (읽기 전용)</span>
                  <textarea value={DEFAULT_VIDEO_PROMPT} readOnly />
                </label>
                ) : (
                  <TextField
                    label="사용자 지정 영상 생성 프롬프트"
                  value={options.videoPrompt}
                  placeholder="사용할 영상 생성 프롬프트를 직접 입력하세요."
                  onChange={(value) => updateOption('videoPrompt', value)}
                />
              )}
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
                    <label>
                      음성 대사
                      <textarea
                        value={scene.auditory.voiceover ?? ''}
                        placeholder="내레이션 없음"
                        onChange={(event) => {
                          setScript(updateSceneField(script, index, 'voiceover', event.target.value));
                          setScriptWasEdited(true);
                        }}
                      />
                    </label>
                    <label>
                      화면 연출
                      <textarea
                        value={scene.visual}
                        onChange={(event) => {
                          setScript(updateSceneField(script, index, 'visual', event.target.value));
                          setScriptWasEdited(true);
                        }}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>

            <p className="scope-note">
              음성 대사와 화면 연출을 수정할 수 있습니다. 장면 시간은 현재 고정되어 있습니다.
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
