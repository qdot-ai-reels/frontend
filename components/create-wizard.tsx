'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PRODUCTION_ASSET_AUDIT,
  PRODUCTION_PRODUCTS,
} from '@/data/production-products';
import {
  DEFAULT_INFLUENCER_REFERENCE_URLS,
  activeInfluencerReferenceUrls,
  validateInfluencerReferenceUrl,
} from '@/lib/influencer-references';
import {
  LOCAL_TEMPLATE_FALLBACKS,
  StudioApiError,
  assetCaveat,
  createRequestId,
  formatUsd,
  studioApi,
} from '@/lib/studio-api';
import {
  PENDING_SUBMISSION_KEY,
  isExplicitSubmissionRejection,
  parsePendingSubmission,
} from '@/lib/studio-normalization';
import type { VisualMode } from '@/types/reels';
import type {
  CreateDraft,
  GenerationQuote,
  GenerationTemplate,
} from '@/types/studio';

type WizardStep = 'product' | 'template' | 'creative' | 'review';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'product', label: '상품' },
  { key: 'template', label: '영상 전략' },
  { key: 'creative', label: '크리에이티브' },
  { key: 'review', label: '비용 확인' },
];

function initialDraft(): CreateDraft | null {
  const product = PRODUCTION_PRODUCTS[0];
  if (!product) return null;
  return {
    product,
    template: null,
    visualMode: 'generated_model',
    influencerImageUrls: [...DEFAULT_INFLUENCER_REFERENCE_URLS].slice(0, 2),
    outputCount: 1,
    cta: '',
    advertisingPurpose: '',
    channel: 'Instagram Reels',
    mustInclude: '',
    mustExclude: '',
    extraDetails: '',
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function quoteSignature(draft: CreateDraft): string {
  return JSON.stringify({
    productId: draft.product.productId,
    template: draft.template ? [draft.template.id, draft.template.version] : null,
    visualMode: draft.visualMode,
    outputCount: draft.outputCount,
    cta: draft.cta.trim(),
    advertisingPurpose: draft.advertisingPurpose.trim(),
    channel: draft.channel,
    mustInclude: draft.mustInclude.trim(),
    mustExclude: draft.mustExclude.trim(),
    extraDetails: draft.extraDetails.trim(),
    references:
      draft.visualMode === 'model_included'
        ? activeInfluencerReferenceUrls(draft.influencerImageUrls)
        : [],
  });
}

function isQuoteExpired(quote: GenerationQuote | null): boolean {
  if (!quote?.expiresAt) return false;
  return new Date(quote.expiresAt).getTime() <= Date.now();
}

function clearPendingSubmission(): void {
  try {
    window.sessionStorage.removeItem(PENDING_SUBMISSION_KEY);
  } catch {
    // In-memory recovery state remains authoritative for this tab.
  }
}

function persistPendingSubmission(value: {
  clientRequestId: string;
  quoteId: string;
  createdAt: string;
}): boolean {
  try {
    window.sessionStorage.setItem(PENDING_SUBMISSION_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function CreateWizard({ sourceJobId }: { sourceJobId: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('product');
  const [draft, setDraft] = useState<CreateDraft | null>(() => initialDraft());
  const [templates, setTemplates] = useState<GenerationTemplate[]>(LOCAL_TEMPLATE_FALLBACKS);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateWarning, setTemplateWarning] = useState<string | null>(null);
  const [quote, setQuote] = useState<GenerationQuote | null>(null);
  const [quoteForSignature, setQuoteForSignature] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedFromJob, setCopiedFromJob] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(createRequestId);
  const [pendingRecovery, setPendingRecovery] = useState<ReturnType<
    typeof parsePendingSubmission
  > | null>(null);
  const [corruptPendingRecovery, setCorruptPendingRecovery] = useState(false);
  const [pendingReplayArmed, setPendingReplayArmed] = useState(false);
  const [providerCapability, setProviderCapability] = useState({
    loading: true,
    modelId: null as string | null,
    known: false,
    supportsIdentityReference: false,
  });
  const copiedRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(PENDING_SUBMISSION_KEY);
        const pending = parsePendingSubmission(raw);
        if (pending) {
          setClientRequestId(pending.clientRequestId);
          setPendingRecovery(pending);
        } else if (raw) {
          setCorruptPendingRecovery(true);
        }
      } catch {
        setCorruptPendingRecovery(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    studioApi
      .getVideoProviderCapability(controller.signal)
      .then((capability) => setProviderCapability({ loading: false, ...capability }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setProviderCapability({
            loading: false,
            modelId: null,
            known: false,
            supportsIdentityReference: false,
          });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    studioApi
      .getTemplates(controller.signal)
      .then((items) => {
        setTemplates(items);
        setTemplateWarning(null);
      })
      .catch((error) => {
        setTemplateWarning(
          `${messageOf(error)} 아래 구조는 미리보기이며, 서버 견적이 확인되기 전에는 생성할 수 없습니다.`,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setTemplatesLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      !sourceJobId ||
      copiedRef.current === sourceJobId ||
      templatesLoading ||
      providerCapability.loading
    ) return;
    const controller = new AbortController();
    studioApi
      .getGeneration(sourceJobId, controller.signal)
      .then((job) => {
        const product = PRODUCTION_PRODUCTS.find(
          (candidate) => candidate.productId === job.product.productId,
        );
        const template = templates.find(
          (candidate) =>
            candidate.id === job.template.id && candidate.version === job.template.version,
        );
        if (!product || !template) {
          setSubmitError(
            '이전 작업의 상품 또는 템플릿이 현재 production 목록에 없어 자동 복제하지 못했습니다.',
          );
          return;
        }
        const cannotRestoreIdentity = job.options.visualMode === 'model_included';
        setDraft((current) => current && ({
          ...current,
          product,
          template,
          visualMode: cannotRestoreIdentity
            ? providerCapability.supportsIdentityReference
              ? 'model_included'
              : 'generated_model'
            : job.options.visualMode ?? current.visualMode,
          influencerImageUrls: cannotRestoreIdentity ? [] : current.influencerImageUrls,
          outputCount: Math.max(1, Math.min(4, job.options.candidateCount || current.outputCount)),
          channel: job.options.channel ?? current.channel,
          cta: job.options.cta ?? current.cta,
          advertisingPurpose:
            job.options.advertisingPurpose ?? current.advertisingPurpose,
          mustInclude: job.options.mustInclude ?? current.mustInclude,
          mustExclude: job.options.mustExclude ?? current.mustExclude,
          extraDetails: job.options.extraDetails ?? current.extraDetails,
        }));
        setQuote(null);
        setQuoteForSignature(null);
        setClientRequestId(createRequestId());
        setCopiedFromJob(true);
        copiedRef.current = sourceJobId;
        if (cannotRestoreIdentity) {
          setSubmitError(
            providerCapability.supportsIdentityReference
              ? '보안상 이전 작업의 인물 레퍼런스 URL은 저장·복제하지 않습니다. 지정 모델 이미지를 다시 입력해 주세요.'
              : '현재 영상 provider는 지정 모델 identity reference를 지원하지 않아 해당 출연 방식은 복제하지 않았습니다.',
          );
          setStep('creative');
        } else {
          setStep('review');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          copiedRef.current = sourceJobId;
          setSubmitError(`이전 설정을 불러오지 못했습니다. ${messageOf(error)}`);
        }
      });
    return () => controller.abort();
  }, [providerCapability, sourceJobId, templates, templatesLoading]);

  const signature = useMemo(() => (draft ? quoteSignature(draft) : ''), [draft]);
  const canRequestQuote = Boolean(
    !pendingRecovery &&
      !corruptPendingRecovery &&
    draft?.template?.supported &&
      draft.cta.trim() &&
      draft.advertisingPurpose.trim() &&
      (draft.visualMode !== 'model_included' ||
        (providerCapability.supportsIdentityReference &&
          activeInfluencerReferenceUrls(draft.influencerImageUrls).length > 0)),
  );

  useEffect(() => {
    if (!draft || step !== 'review' || !canRequestQuote) return;

    const controller = new AbortController();
    let expiryTimer: number | null = null;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError(null);
      studioApi
        .createQuote(draft, controller.signal)
        .then((nextQuote) => {
          setQuote(nextQuote);
          setQuoteForSignature(signature);
          setClientRequestId(createRequestId());
          if (nextQuote.expiresAt) {
            const untilExpiry = new Date(nextQuote.expiresAt).getTime() - Date.now();
            if (untilExpiry > 0) {
              expiryTimer = window.setTimeout(
                () => setQuoteNonce((value) => value + 1),
                Math.min(untilExpiry + 250, 2_147_000_000),
              );
            }
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) setQuoteError(messageOf(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoteLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      if (expiryTimer != null) window.clearTimeout(expiryTimer);
      controller.abort();
    };
  }, [canRequestQuote, draft, quoteNonce, signature, step]);

  if (!draft) {
    return (
      <section className="route-state">
        <span className="state-symbol danger" aria-hidden="true">!</span>
        <h1>사용 가능한 상품 에셋이 없습니다</h1>
        <p>Production 검수를 통과한 상품을 등록한 뒤 다시 시도해 주세요.</p>
        <Link className="button button-secondary" href="/videos">라이브러리로 이동</Link>
      </section>
    );
  }

  const caveat = assetCaveat(draft.product.productId, draft.product.name);
  const currentIndex = STEPS.findIndex((item) => item.key === step);
  const validReferenceError =
    draft.visualMode === 'model_included'
      ? activeInfluencerReferenceUrls(draft.influencerImageUrls)
          .map(validateInfluencerReferenceUrl)
          .find(Boolean) ?? null
      : null;
  const quoteCurrent = quoteForSignature === signature && !isQuoteExpired(quote);
  const hasPendingRecovery = Boolean(pendingRecovery || corruptPendingRecovery);
  const canReplayPending = Boolean(
    pendingRecovery &&
      quoteCurrent &&
      quote?.quoteId === pendingRecovery.quoteId &&
      pendingRecovery.clientRequestId === clientRequestId,
  );
  const insufficientBalance = Boolean(
    quoteCurrent &&
      quote?.availableBalanceUsd != null &&
      quote.availableBalanceUsd < quote.maxTotalUsd,
  );

  function update<Key extends keyof CreateDraft>(key: Key, value: CreateDraft[Key]) {
    if (submittingRef.current) return;
    setDraft((current) => current && ({ ...current, [key]: value }));
    setQuote(null);
    setQuoteForSignature(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setClientRequestId(createRequestId());
    setSubmitError(null);
  }

  function move(next: WizardStep) {
    if (submittingRef.current) return;
    setStep(next);
    if (next !== 'review') setQuoteLoading(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function requestQuoteAgain() {
    if (submittingRef.current) return;
    setQuote(null);
    setQuoteForSignature(null);
    setQuoteError(null);
    setQuoteNonce((value) => value + 1);
  }

  function nextStep() {
    if (!draft || submittingRef.current) return;
    if (step === 'product') move('template');
    else if (step === 'template' && draft.template) move('creative');
    else if (step === 'creative') {
      if (!draft.cta.trim() || !draft.advertisingPurpose.trim()) {
        setSubmitError('CTA와 광고 목적을 입력해 주세요.');
        return;
      }
      if (draft.visualMode === 'model_included') {
        if (!providerCapability.supportsIdentityReference) {
          setSubmitError('현재 영상 provider에서는 지정 모델 identity reference를 사용할 수 없습니다.');
          return;
        }
        const references = activeInfluencerReferenceUrls(draft.influencerImageUrls);
        if (references.length === 0 || validReferenceError) {
          setSubmitError(validReferenceError || '모델 레퍼런스 URL을 1개 이상 입력해 주세요.');
          return;
        }
      }
      move('review');
    }
  }

  async function submitGeneration() {
    if (
      !draft ||
      !quote ||
      !quoteCurrent ||
      insufficientBalance ||
      submittingRef.current ||
      (pendingRecovery && !pendingReplayArmed) ||
      corruptPendingRecovery
    ) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const pending = {
      clientRequestId,
      quoteId: quote.quoteId,
      createdAt: new Date().toISOString(),
    };
    if (!persistPendingSubmission(pending)) {
      submittingRef.current = false;
      setSubmitting(false);
      setCorruptPendingRecovery(true);
      setSubmitError(
        '브라우저가 중복 생성 방지 기록을 저장하지 못해 유료 요청을 보내지 않았습니다. sessionStorage 허용 여부를 확인해 주세요.',
      );
      return;
    }
    try {
      const jobId = await studioApi.startGeneration({
        ...draft,
        quoteId: quote.quoteId,
        clientRequestId,
      });
      clearPendingSubmission();
      setPendingRecovery(null);
      setCorruptPendingRecovery(false);
      setPendingReplayArmed(false);
      try {
        window.sessionStorage.setItem('quedot.last-generation-job', jobId);
      } catch {
        // The durable job ID is already represented by the destination URL.
      }
      router.push(`/videos/${encodeURIComponent(jobId)}`);
    } catch (error) {
      const status = error instanceof StudioApiError ? error.status : null;
      const explicitRejection = isExplicitSubmissionRejection(status);
      const requote =
        status === 409 ||
        (error instanceof StudioApiError &&
          ['QUOTE_EXPIRED', 'QUOTE_MISMATCH', 'QUOTE_STALE', 'IDEMPOTENCY_CONFLICT'].includes(
            error.code ?? '',
          ));
      if (explicitRejection) {
        clearPendingSubmission();
        setPendingRecovery(null);
        setCorruptPendingRecovery(false);
        setPendingReplayArmed(false);
        setClientRequestId(createRequestId());
        if (requote) {
          setQuote(null);
          setQuoteForSignature(null);
          setQuoteError(null);
          setQuoteNonce((value) => value + 1);
          const code = error instanceof StudioApiError && error.code ? ` [${error.code}]` : '';
          setSubmitError(`${messageOf(error)}${code} 최신 조건으로 견적을 다시 계산합니다.`);
        } else {
          setSubmitError(messageOf(error));
        }
      } else {
        setPendingRecovery(pending);
        setPendingReplayArmed(false);
        setSubmitError(
          `${messageOf(error)} 접수 여부를 확인할 수 없어 자동 재전송을 막았습니다. 먼저 라이브러리에서 작업을 확인해 주세요.`,
        );
      }
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function prepareSameRequestRetry() {
    if (!pendingRecovery || pendingRecovery.clientRequestId !== clientRequestId) return;
    setPendingReplayArmed(true);
    setSubmitError(
      '같은 client_request_id로 한 번 더 전송할 준비가 됐습니다. 서버가 이전 요청을 접수했다면 기존 작업만 반환해야 합니다.',
    );
  }

  function startFreshAfterRecoveryCheck() {
    clearPendingSubmission();
    setPendingRecovery(null);
    setCorruptPendingRecovery(false);
    setPendingReplayArmed(false);
    setQuote(null);
    setQuoteForSignature(null);
    setClientRequestId(createRequestId());
    setSubmitError('새 요청 ID를 준비했습니다. 서버 견적을 다시 확인한 뒤 생성해 주세요.');
    setQuoteNonce((value) => value + 1);
  }

  return (
    <div className="page-stack create-page">
      <header className="page-header">
        <p className="eyebrow">CREATE VIDEO</p>
        <h1>새 영상 만들기</h1>
        <p>생성 허용 상품과 시간 전략을 선택하면 스크립트부터 영상·음성·자막까지 한 번에 생성합니다.</p>
      </header>

      {copiedFromJob && (
        <div className="notice-banner success" role="status">
          이전 작업의 설정을 불러왔습니다. 생성형 영상은 같은 설정이어도 화면이 달라질 수 있으며 비용은 새로 계산됩니다.
        </div>
      )}

      {hasPendingRecovery && (
        <div className="recovery-banner" role="alert">
          <div>
            <strong>이전 생성 요청의 접수 결과를 확인해야 합니다</strong>
            <p>
              응답이 끊긴 요청을 새 ID로 자동 전송하지 않습니다. 먼저 라이브러리에서 작업을 확인해
              주세요.
              {pendingRecovery && (
                <> 요청 ID 끝자리 <code>{pendingRecovery.clientRequestId.slice(-8)}</code></>
              )}
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button button-secondary" href="/videos">라이브러리 확인</Link>
            {canReplayPending && !pendingReplayArmed && (
              <button className="button button-secondary" type="button" onClick={prepareSameRequestRetry}>
                같은 요청 ID로 재전송 준비
              </button>
            )}
            {!canReplayPending && (
              <button className="button button-ghost" type="button" onClick={startFreshAfterRecoveryCheck}>
                확인 완료 · 새 요청 준비
              </button>
            )}
          </div>
        </div>
      )}

      {pendingReplayArmed && (
        <div className="notice-banner warning" role="status">
          수동 복구 모드입니다. 생성 버튼은 저장된 client_request_id를 그대로 재사용합니다.
        </div>
      )}

      <ol className="wizard-stepper" aria-label="영상 생성 단계">
        {STEPS.map((item, index) => (
          <li key={item.key} className={index < currentIndex ? 'done' : index === currentIndex ? 'active' : ''}>
            <button
              type="button"
              disabled={submitting || index > currentIndex}
              onClick={() => index <= currentIndex && move(item.key)}
              aria-current={index === currentIndex ? 'step' : undefined}
            >
              <span>{index < currentIndex ? '✓' : index + 1}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="create-layout">
        <section className="panel create-panel" aria-busy={submitting}>
          <fieldset className="wizard-fieldset" disabled={submitting}>
          {step === 'product' && (
            <ProductStep draft={draft} onProduct={(product) => update('product', product)} caveat={caveat} />
          )}
          {step === 'template' && (
            <TemplateStep
              templates={templates}
              selected={draft.template}
              loading={templatesLoading}
              warning={templateWarning}
              onSelect={(template) => update('template', template)}
            />
          )}
          {step === 'creative' && (
            <CreativeStep
              draft={draft}
              update={update}
              referenceError={validReferenceError}
              providerCapability={providerCapability}
            />
          )}
          {step === 'review' && (
            <ReviewStep
              draft={draft}
              quote={quoteCurrent ? quote : null}
              quoteLoading={quoteLoading}
              quoteError={quoteError}
              caveat={caveat}
              insufficientBalance={insufficientBalance}
              onRetryQuote={requestQuoteAgain}
            />
          )}

          {submitError && <div className="inline-alert" role="alert">{submitError}</div>}

          <div className="wizard-actions">
            {currentIndex > 0 ? (
              <button type="button" className="button button-secondary" onClick={() => move(STEPS[currentIndex - 1].key)}>
                이전
              </button>
            ) : submitting ? (
              <span className="button button-secondary" aria-disabled="true">취소</span>
            ) : <Link className="button button-secondary" href="/videos">취소</Link>}
            {step !== 'review' ? (
              <button
                type="button"
                className="button button-primary"
                disabled={step === 'template' && !draft.template}
                onClick={nextStep}
              >
                다음
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary button-cost"
                disabled={
                  !quoteCurrent ||
                  quoteLoading ||
                  insufficientBalance ||
                  submitting ||
                  (hasPendingRecovery && !pendingReplayArmed)
                }
                onClick={submitGeneration}
              >
                {submitting
                  ? '작업을 시작하는 중…'
                  : quoteCurrent && quote
                    ? `${formatUsd(quote.expectedTotalUsd)} 예상 · 영상 생성 시작`
                    : '견적 확인 후 생성 가능'}
              </button>
            )}
          </div>
          </fieldset>
        </section>

        <aside className="create-summary" aria-label="현재 영상 설정 요약">
          <div className="summary-product">
            <Image src={draft.product.imageUrl} alt="" width={64} height={64} unoptimized />
            <div><small>선택 상품</small><strong>{draft.product.name}</strong></div>
          </div>
          <SummaryRow label="영상 전략" value={draft.template?.name ?? '선택 전'} />
          <SummaryRow label="출연 방식" value={visualModeLabel(draft.visualMode)} />
          <SummaryRow label="후보 수" value={`${draft.outputCount}개`} />
          <SummaryRow label="화면" value="9:16 · 1080 × 1920" />
          {quoteCurrent && quote && (
            <div className="summary-cost"><span>예상 비용</span><strong>{formatUsd(quote.expectedTotalUsd)}</strong></div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ProductStep({
  draft,
  onProduct,
  caveat,
}: {
  draft: CreateDraft;
  onProduct: (product: CreateDraft['product']) => void;
  caveat: string | null;
}) {
  return (
    <div className="step-content">
      <div className="section-heading">
        <span>1</span><div><h2>광고할 상품을 선택하세요</h2><p>현재 생성에 허용된 에셋만 표시하며, 수량·작은 글자 검증 범위는 상품별로 안내합니다.</p></div>
      </div>
      <div className="product-choice-list" role="radiogroup" aria-label="Production 상품">
        {PRODUCTION_PRODUCTS.map((product) => {
          const selected = product.productId === draft.product.productId;
          return (
            <button
              key={product.productId}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`product-choice ${selected ? 'selected' : ''}`}
              onClick={() => onProduct(product)}
            >
              <Image src={product.imageUrl} alt="" width={92} height={92} unoptimized />
              <span><small>{product.curator}</small><strong>{product.name}</strong><em>{product.option}</em></span>
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <p className="audit-copy">
        기술 검수 {PRODUCTION_ASSET_AUDIT.technicallyEligibleProductCount}개 중 현재 영상 생성에 허용된 {PRODUCTION_PRODUCTS.length}개 상품입니다.
      </p>
      {caveat && <div className="asset-caveat" role="note"><strong>에셋 주의</strong><p>{caveat}</p></div>}
    </div>
  );
}

function TemplateStep({
  templates,
  selected,
  loading,
  warning,
  onSelect,
}: {
  templates: GenerationTemplate[];
  selected: GenerationTemplate | null;
  loading: boolean;
  warning: string | null;
  onSelect: (template: GenerationTemplate) => void;
}) {
  return (
    <div className="step-content">
      <div className="section-heading">
        <span>2</span><div><h2>영상 전략을 선택하세요</h2><p>시간 구간은 서버가 고정하고 음성·자막 QC까지 같은 기준으로 검증합니다.</p></div>
      </div>
      {warning && <div className="notice-banner warning" role="status">{warning}</div>}
      <div className="template-grid" role="radiogroup" aria-label="영상 전략 템플릿" aria-busy={loading}>
        {templates.map((template) => {
          const active = selected?.id === template.id && selected.version === template.version;
          return (
            <button
              key={`${template.id}:${template.version}`}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!template.supported}
              className={`template-card ${active ? 'selected' : ''}`}
              onClick={() => onSelect(template)}
            >
              <span className="template-duration">{template.durationSeconds}<small>초</small></span>
              <span className="template-copy"><strong>{template.shortName}</strong><small>{template.description}</small></span>
              <Timeline template={template} />
              <em>{template.supported ? `v${template.version}` : template.unavailableReason ?? '현재 모델 미지원'}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreativeStep({
  draft,
  update,
  referenceError,
  providerCapability,
}: {
  draft: CreateDraft;
  update: <Key extends keyof CreateDraft>(key: Key, value: CreateDraft[Key]) => void;
  referenceError: string | null;
  providerCapability: {
    loading: boolean;
    modelId: string | null;
    known: boolean;
    supportsIdentityReference: boolean;
  };
}) {
  return (
    <div className="step-content">
      <div className="section-heading">
        <span>3</span><div><h2>광고 방향을 입력하세요</h2><p>필수 정보만 정하면 나머지는 선택한 전략에 맞춰 자동 구성합니다.</p></div>
      </div>

      <fieldset className="choice-fieldset">
        <legend>영상 출연 방식</legend>
        <div className="choice-cards">
          {([
            ['generated_model', 'AI 가상 모델', '실존 인물 레퍼런스 없이 새 모델 생성'],
            ['product_only', '상품만', '검수된 상품 이미지만 사용'],
            ['model_included', '지정 모델', '공개 HTTPS 인물 이미지 1~2개 사용'],
          ] as const).map(([value, label, description]) => {
            const identityUnavailable =
              value === 'model_included' && !providerCapability.supportsIdentityReference;
            const identityReason = providerCapability.loading
              ? 'provider 지원 여부 확인 중'
              : providerCapability.known
                ? `${providerCapability.modelId} · identity reference 미지원`
                : 'provider 모델 정보 미확인 · production 안전상 비활성';
            return (
              <label
                key={value}
                className={`${draft.visualMode === value ? 'selected' : ''} ${identityUnavailable ? 'disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="visual-mode"
                  checked={draft.visualMode === value}
                  disabled={identityUnavailable}
                  onChange={() => update('visualMode', value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{identityUnavailable ? identityReason : description}</small>
                </span>
              </label>
            );
          })}
        </div>
        <p className="capability-note" role="status" aria-live="polite">
          {providerCapability.loading
            ? '현재 provider 모델의 identity reference 지원 여부를 확인 중입니다.'
            : providerCapability.known
              ? `현재 provider 모델: ${providerCapability.modelId} · identity reference ${providerCapability.supportsIdentityReference ? '지원' : '미지원'}`
              : '현재 provider 모델 정보를 확인할 수 없어 지정 모델 입력을 production 안전상 비활성화했습니다.'}
        </p>
      </fieldset>

      {draft.visualMode === 'model_included' && (
        <div className="reference-fields">
          {[0, 1].map((index) => (
            <label className="form-field" key={index}>
              <span>모델 이미지 URL {index + 1}{index === 0 ? ' · 필수' : ' · 선택'}</span>
              <input
                type="url"
                maxLength={2048}
                value={draft.influencerImageUrls[index] ?? ''}
                placeholder="https://cdn.example.com/model.jpg"
                aria-invalid={referenceError ? true : undefined}
                onChange={(event) => {
                  const urls = [...draft.influencerImageUrls];
                  urls[index] = event.target.value;
                  update('influencerImageUrls', urls.slice(0, 2));
                }}
              />
            </label>
          ))}
          {referenceError && <p className="field-error" role="alert">{referenceError}</p>}
        </div>
      )}

      <div className="form-grid">
        <label className="form-field">
          <span>CTA · 필수</span>
          <input maxLength={500} value={draft.cta} placeholder="예: 지금 링크에서 확인하세요" onChange={(event) => update('cta', event.target.value)} />
        </label>
        <label className="form-field">
          <span>광고 목적 · 필수</span>
          <input maxLength={1000} value={draft.advertisingPurpose} placeholder="예: 공동구매 전환 유도" onChange={(event) => update('advertisingPurpose', event.target.value)} />
        </label>
        <label className="form-field">
          <span>노출 채널</span>
          <select value={draft.channel} onChange={(event) => update('channel', event.target.value)}>
            <option>Instagram Reels</option><option>YouTube Shorts</option><option>TikTok</option>
          </select>
        </label>
        <label className="form-field">
          <span>영상 후보 수</span>
          <select value={draft.outputCount} onChange={(event) => update('outputCount', Number(event.target.value))}>
            {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}개</option>)}
          </select>
        </label>
      </div>

      <details className="advanced-fields">
        <summary>고급 요청사항 <small>선택</small></summary>
        <div className="form-grid">
          <label className="form-field"><span>꼭 포함</span><input maxLength={2000} value={draft.mustInclude} onChange={(event) => update('mustInclude', event.target.value)} /></label>
          <label className="form-field"><span>포함 금지</span><input maxLength={2000} value={draft.mustExclude} onChange={(event) => update('mustExclude', event.target.value)} /></label>
          <label className="form-field full"><span>기타 요청</span><textarea maxLength={4000} rows={4} value={draft.extraDetails} onChange={(event) => update('extraDetails', event.target.value)} /></label>
        </div>
      </details>
    </div>
  );
}

function ReviewStep({
  draft,
  quote,
  quoteLoading,
  quoteError,
  caveat,
  insufficientBalance,
  onRetryQuote,
}: {
  draft: CreateDraft;
  quote: GenerationQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  caveat: string | null;
  insufficientBalance: boolean;
  onRetryQuote: () => void;
}) {
  return (
    <div className="step-content">
      <div className="section-heading">
        <span>4</span><div><h2>설정과 예상 비용을 확인하세요</h2><p>버튼을 누르면 스크립트부터 최종 후보까지 비동기로 생성합니다.</p></div>
      </div>
      {draft.template && <TimelineDetail template={draft.template} />}
      {caveat && <div className="asset-caveat" role="note"><strong>상품 에셋 주의</strong><p>{caveat}</p></div>}

      <section className="quote-card" aria-labelledby="quote-title" aria-busy={quoteLoading}>
        <div className="quote-heading"><div><span>SERVER QUOTE</span><h3 id="quote-title">생성 전 예상 비용</h3></div><small>USD · 1080p</small></div>
        {quoteLoading ? (
          <><div className="skeleton quote-skeleton" /><p>현재 모델과 후보 수 기준 비용을 확인하고 있습니다.</p></>
        ) : quoteError ? (
          <div className="quote-error" role="alert"><p>{quoteError}</p><button className="button button-secondary" onClick={onRetryQuote}>다시 계산</button></div>
        ) : quote ? (
          <>
            <div className="quote-totals">
              <div><span>Provider 예상값</span><strong>{formatUsd(quote.expectedTotalUsd)}</strong></div>
              <div><span>Provider 예상 범위 상단</span><strong>{formatUsd(quote.maxTotalUsd)}</strong></div>
              {quote.availableBalanceUsd != null && <div><span>사용 가능 잔액</span><strong>{formatUsd(quote.availableBalanceUsd)}</strong></div>}
            </div>
            {quote.lineItems.length > 0 && <ul className="quote-lines">{quote.lineItems.map((item) => <li key={item.key}><span>{item.label}</span><strong>{formatUsd(item.amountUsd)}</strong></li>)}</ul>}
            {quote.coverage && <p className="quote-coverage">견적 범위: {quote.coverage === 'video_only' ? '영상 provider 비용만 포함' : quote.coverage}</p>}
            {quote.disclaimer && <p className="quote-disclaimer">{quote.disclaimer}</p>}
            {insufficientBalance && <p className="field-error" role="alert">Provider 예상 범위 상단보다 사용 가능 잔액이 적어 생성을 시작할 수 없습니다. 이 값은 결제 상한 승인이 아닙니다.</p>}
            <p className="quote-disclaimer">표시 범위는 영상 provider 추정치이며 결제 상한이나 승인 금액이 아닙니다. TTS·렌더링·저장·재시도 비용은 포함하지 않습니다.</p>
            <small>견적 ID {quote.quoteId}{quote.expiresAt ? ` · ${new Date(quote.expiresAt).toLocaleTimeString('ko-KR')}까지 유효` : ''}</small>
          </>
        ) : <p>필수 입력을 완료하면 서버 견적이 표시됩니다.</p>}
      </section>
      <div className="leave-safe-note"><span aria-hidden="true">✓</span><p><strong>생성 후 창을 닫아도 괜찮습니다.</strong> 작업은 서버에서 계속되고 영상 라이브러리에서 언제든 다시 확인할 수 있습니다.</p></div>
    </div>
  );
}

function Timeline({ template }: { template: GenerationTemplate }) {
  return (
    <span className="mini-timeline" aria-label={`${template.durationSeconds}초 장면 구성`}>
      {template.scenes.map((item, index) => (
        <i
          key={item.id}
          className={`segment-${index + 1}`}
          style={{ width: `${((item.endSeconds - item.startSeconds) / template.durationSeconds) * 100}%` }}
          title={`${item.startSeconds}–${item.endSeconds}초 ${item.label}`}
        />
      ))}
    </span>
  );
}

function TimelineDetail({ template }: { template: GenerationTemplate }) {
  return (
    <section className="timeline-detail" aria-label={`${template.name} 타임라인`}>
      <div><strong>{template.name}</strong><span>{template.durationSeconds}초 · v{template.version}</span></div>
      <ol>{template.scenes.map((scene) => <li key={scene.id}><span>{scene.startSeconds}–{scene.endSeconds}초</span><div><strong>{scene.label}</strong><small>{scene.description}</small></div></li>)}</ol>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function visualModeLabel(value: VisualMode): string {
  if (value === 'generated_model') return 'AI 가상 모델';
  if (value === 'model_included') return '지정 모델';
  return '상품만';
}
