'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  GuardedLink as Link,
  usePageNavigationGuard,
} from '@/components/navigation-guard';
import { PRODUCTION_ASSET_AUDIT } from '@/data/production-products';
import {
  CREATE_DRAFT_STORAGE_KEY,
  parseStoredCreateDraft,
  serializeCreateDraft,
} from '@/lib/create-draft-storage';
import {
  DEFAULT_INFLUENCER_REFERENCE_URLS,
  activeInfluencerReferenceUrls,
  validateInfluencerReferenceUrl,
} from '@/lib/influencer-references';
import { productCatalogApi } from '@/lib/product-catalog-api';
import { isProductAvailableForGeneration } from '@/lib/product-catalog';
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
  parsePendingSubmission,
  rejectedSubmissionDisposition,
} from '@/lib/studio-normalization';
import {
  canAttemptPromptVersionRecovery,
  getActivePromptVersionReference,
  isQuotePromptVersionCurrent,
  shouldRefreshPromptVersionAfterQuoteError,
} from '@/lib/prompt-versions';
import type {
  PendingGenerationSnapshot,
  PendingSubmission,
} from '@/lib/studio-normalization';
import type { StoredCreateDraft } from '@/lib/create-draft-storage';
import type { VisualMode } from '@/types/reels';
import type { CatalogProduct } from '@/types/product-catalog';
import type {
  CreateDraft,
  GenerationQuote,
  GenerationTemplate,
  PromptVersionReference,
  StartGenerationInput,
} from '@/types/studio';

type WizardStep = 'product' | 'template' | 'creative' | 'review';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'product', label: '상품' },
  { key: 'template', label: '영상 전략' },
  { key: 'creative', label: '크리에이티브' },
  { key: 'review', label: '비용 확인' },
];

function initialDraft(product: CatalogProduct | null): CreateDraft {
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
    promptVersionId: null,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function quoteSignature(draft: CreateDraft): string {
  return JSON.stringify({
    productId: draft.product?.productId ?? null,
    productRevision: draft.product?.revision ?? null,
    template: draft.template ? [draft.template.id, draft.template.version] : null,
    visualMode: draft.visualMode,
    outputCount: draft.outputCount,
    cta: draft.cta.trim(),
    advertisingPurpose: draft.advertisingPurpose.trim(),
    channel: draft.channel,
    mustInclude: draft.mustInclude.trim(),
    mustExclude: draft.mustExclude.trim(),
    extraDetails: draft.extraDetails.trim(),
    promptVersionId: draft.promptVersionId,
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

function persistPendingSubmission(value: PendingSubmission): boolean {
  try {
    window.sessionStorage.setItem(PENDING_SUBMISSION_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function snapshotDraft(draft: CreateDraft): PendingGenerationSnapshot {
  if (!draft.product) throw new Error('생성할 상품이 없습니다.');
  if (!draft.template) throw new Error('생성할 템플릿이 없습니다.');
  return {
    productId: draft.product.productId,
    productRevision: draft.product.revision,
    templateId: draft.template.id,
    templateVersion: draft.template.version,
    visualMode: draft.visualMode,
    influencerImageUrls:
      draft.visualMode === 'model_included'
        ? activeInfluencerReferenceUrls(draft.influencerImageUrls)
        : [],
    outputCount: draft.outputCount,
    cta: draft.cta,
    advertisingPurpose: draft.advertisingPurpose,
    channel: draft.channel,
    mustInclude: draft.mustInclude,
    mustExclude: draft.mustExclude,
    extraDetails: draft.extraDetails,
    promptVersionId: draft.promptVersionId,
  };
}

function restorePendingDraft(
  pending: PendingSubmission,
  templates: GenerationTemplate[],
  products: CatalogProduct[],
): CreateDraft | null {
  if (!pending.request) return null;
  const product = products.find(
    (candidate) =>
      candidate.productId === pending.request?.productId &&
      candidate.revision === pending.request?.productRevision &&
      isProductAvailableForGeneration(candidate),
  ) ?? null;
  const template = templates.find(
    (candidate) =>
      candidate.id === pending.request?.templateId &&
      candidate.version === pending.request?.templateVersion,
  ) ?? null;
  return {
    product,
    template,
    visualMode: pending.request.visualMode,
    influencerImageUrls: [...pending.request.influencerImageUrls],
    outputCount: pending.request.outputCount,
    cta: pending.request.cta,
    advertisingPurpose: pending.request.advertisingPurpose,
    channel: pending.request.channel,
    mustInclude: pending.request.mustInclude,
    mustExclude: pending.request.mustExclude,
    extraDetails: pending.request.extraDetails,
    promptVersionId: pending.request.promptVersionId,
  };
}

function safeRestoredStep(draft: CreateDraft, requested: WizardStep): WizardStep {
  if (!draft.product) return 'product';
  if (!draft.template && (requested === 'creative' || requested === 'review')) return 'template';
  return requested;
}

function restoreTemporaryDraft(
  stored: StoredCreateDraft,
  products: CatalogProduct[],
  templates: GenerationTemplate[],
  promptVersionId: string | null,
): CreateDraft {
  const product = stored.productId && stored.productRevision
    ? products.find(
        (candidate) =>
          candidate.productId === stored.productId &&
          candidate.revision === stored.productRevision &&
          isProductAvailableForGeneration(candidate),
      ) ?? null
    : null;
  const template = stored.templateId && stored.templateVersion
    ? templates.find(
        (candidate) =>
          candidate.id === stored.templateId &&
          candidate.version === stored.templateVersion &&
          candidate.supported,
      ) ?? null
    : null;
  return {
    product,
    template,
    visualMode: stored.visualMode,
    influencerImageUrls: [...stored.influencerImageUrls],
    outputCount: stored.outputCount,
    cta: stored.cta,
    advertisingPurpose: stored.advertisingPurpose,
    channel: stored.channel,
    mustInclude: stored.mustInclude,
    mustExclude: stored.mustExclude,
    extraDetails: stored.extraDetails,
    promptVersionId,
  };
}

type PendingLookupStatus =
  | 'idle'
  | 'checking'
  | 'in-progress'
  | 'recoverable'
  | 'paused'
  | 'not-found'
  | 'error';

export function CreateWizard({ sourceJobId }: { sourceJobId: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('product');
  const [draft, setDraft] = useState<CreateDraft>(() => initialDraft(null));
  const [draftTouched, setDraftTouched] = useState(false);
  const [draftRestoreChecked, setDraftRestoreChecked] = useState(false);
  const [draftRestoreNotice, setDraftRestoreNotice] = useState<string | null>(null);
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsNonce, setProductsNonce] = useState(0);
  const [templates, setTemplates] = useState<GenerationTemplate[]>(LOCAL_TEMPLATE_FALLBACKS);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateWarning, setTemplateWarning] = useState<string | null>(null);
  const [quote, setQuote] = useState<GenerationQuote | null>(null);
  const [quoteForSignature, setQuoteForSignature] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [activePromptVersion, setActivePromptVersion] = useState<PromptVersionReference | null>(null);
  const [promptVersionLoading, setPromptVersionLoading] = useState(true);
  const [promptVersionError, setPromptVersionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedFromJob, setCopiedFromJob] = useState(false);
  const [sourceCopyState, setSourceCopyState] = useState({
    sourceJobId,
    loading: Boolean(sourceJobId),
  });
  const [clientRequestId, setClientRequestId] = useState(createRequestId);
  const [pendingRecovery, setPendingRecovery] = useState<ReturnType<
    typeof parsePendingSubmission
  > | null>(null);
  const [corruptPendingRecovery, setCorruptPendingRecovery] = useState(false);
  const [pendingLookupStatus, setPendingLookupStatus] = useState<PendingLookupStatus>('idle');
  const [pendingLookupMessage, setPendingLookupMessage] = useState<string | null>(null);
  const [pendingLookupNonce, setPendingLookupNonce] = useState(0);
  const [providerCapability, setProviderCapability] = useState({
    loading: true,
    modelId: null as string | null,
    known: false,
    supportsIdentityReference: false,
  });
  const copiedRef = useRef<string | null>(null);
  const restoredPendingRef = useRef<string | null>(null);
  const pendingLookupFailuresRef = useRef(0);
  const submittingRef = useRef(false);
  const quoteVersionRecoveryAttemptsRef = useRef(0);
  const activePromptVersionRef = useRef<PromptVersionReference | null>(null);
  const catalogInitializedRef = useRef(false);
  const draftRef = useRef(draft);
  const stepRef = useRef(step);
  useLayoutEffect(() => {
    draftRef.current = draft;
    stepRef.current = step;
  }, [draft, step]);

  const persistLatestDraft = useCallback(() => {
    try {
      window.sessionStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        serializeCreateDraft(draftRef.current, stepRef.current),
      );
      setDraftStorageError(null);
      return true;
    } catch {
      setDraftStorageError(
        '브라우저 임시 저장을 사용할 수 없습니다. 이 페이지에서 생성을 완료해 주세요.',
      );
      return false;
    }
  }, []);

  const clearTemporaryDraft = useCallback(() => {
    try {
      window.sessionStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
    } catch {
      // A pending submission remains the durable duplicate-generation guard.
    }
  }, []);

  usePageNavigationGuard({
    hasUnsavedChanges: draftTouched,
    busy: submitting,
    confirmMessage:
      '작성 중인 영상 설정은 이 탭에 임시 저장됩니다. 현재 화면을 이동할까요?',
    beforeNavigate: draftTouched ? persistLatestDraft : undefined,
    onBusyBlocked: () => {
      setSubmitError('생성 요청 확인이 끝난 뒤 페이지를 이동해 주세요.');
    },
  });

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
    productCatalogApi
      .listProducts({}, controller.signal)
      .then((catalog) => {
        if (controller.signal.aborted) return;
        const available = catalog.items.filter(isProductAvailableForGeneration);
        setProducts(available);
        setProductsError(null);
        const selected = draftRef.current.product;
        if (selected) {
          const refreshed = available.find(
            (product) => product.productId === selected.productId,
          );
          if (refreshed?.revision === selected.revision) {
            setDraft((current) => ({ ...current, product: refreshed }));
          } else {
            setDraft((current) => ({ ...current, product: null }));
            setDraftTouched(true);
            setDraftRestoreNotice(
              '선택했던 상품이 변경되었거나 비활성화되어 상품 선택만 해제했습니다. 나머지 영상 설정은 보존했습니다.',
            );
          }
        } else if (!catalogInitializedRef.current && available[0]) {
          setDraft((current) => ({
            ...current,
            product: available[0],
            promptVersionId:
              current.promptVersionId ?? activePromptVersionRef.current?.id ?? null,
          }));
        }
        catalogInitializedRef.current = true;
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setProducts([]);
        if (draftRef.current.product) {
          setDraft((current) => ({ ...current, product: null }));
          setDraftTouched(true);
          setDraftRestoreNotice(
            '상품 카탈로그를 확인할 수 없어 상품 선택만 안전하게 해제했습니다. 나머지 입력은 보존했습니다.',
          );
        }
        setProductsError(messageOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setProductsLoading(false);
      });
    return () => controller.abort();
  }, [productsNonce]);

  useEffect(() => {
    if (!pendingRecovery) return;
    const controller = new AbortController();
    let pollTimer: number | null = null;
    const lookup = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) {
        setPendingLookupStatus('paused');
        setPendingLookupMessage(
          navigator.onLine
            ? '숨겨진 탭에서는 요청 상태 조회를 멈춥니다. 탭으로 돌아오면 즉시 재개합니다.'
            : '오프라인이라 요청 상태 조회를 멈췄습니다. 연결되면 즉시 재개합니다.',
        );
        pollTimer = window.setTimeout(
          () => setPendingLookupNonce((value) => value + 1),
          5_000,
        );
        return;
      }
      setPendingLookupStatus('checking');
      setPendingLookupMessage((current) => current ?? '서버 접수 상태를 확인하고 있습니다.');
      studioApi
        .getGenerationRequest(pendingRecovery.clientRequestId, controller.signal)
        .then((request) => {
          pendingLookupFailuresRef.current = 0;
          if (request.requestState === 'ACCEPTED' && request.jobId) {
            clearPendingSubmission();
            clearTemporaryDraft();
            setDraftTouched(false);
            setPendingRecovery(null);
            setCorruptPendingRecovery(false);
            try {
              window.sessionStorage.setItem('quedot.last-generation-job', request.jobId);
            } catch {
              // The durable job ID is also represented by the destination URL.
            }
            router.replace(`/videos/${encodeURIComponent(request.jobId)}`);
            return;
          }
          if (request.requestState === 'IN_PROGRESS') {
            if (request.recoverable) {
              setPendingLookupStatus('recoverable');
              setPendingLookupMessage(
                '이전 처리 lease가 만료됐습니다. 저장된 동일 본문·동일 요청 ID로만 안전하게 이어갈 수 있습니다.',
              );
              return;
            }
            setPendingLookupStatus('in-progress');
            setPendingLookupMessage(
              '서버가 원래 요청을 검증하고 있습니다. 새 요청은 차단한 채 같은 요청 ID를 자동 재조회합니다.',
            );
            const retrySeconds = Math.min(
              Math.max(request.retryAfterSeconds ?? 2, 2),
              15,
            );
            pollTimer = window.setTimeout(
              () => setPendingLookupNonce((value) => value + 1),
              retrySeconds * 1_000,
            );
            return;
          }

          const restored = restorePendingDraft(pendingRecovery, templates, products);
          const restoredForNewRequest = restored
            ? { ...restored, promptVersionId: activePromptVersion?.id ?? null }
            : null;
          const rejection = request.error;
          const disposition = rejectedSubmissionDisposition(rejection?.code ?? null);
          clearPendingSubmission();
          setPendingRecovery(null);
          setCorruptPendingRecovery(false);
          setPendingLookupStatus('idle');
          setPendingLookupMessage(null);
          setClientRequestId(createRequestId());
          setQuote(null);
          setQuoteForSignature(null);
          if (restoredForNewRequest) {
            setDraft(restoredForNewRequest);
            setDraftTouched(true);
          }
          if (
            disposition === 'requote' &&
            restoredForNewRequest?.product &&
            restoredForNewRequest.template
          ) {
            setStep('review');
            setQuoteNonce((value) => value + 1);
            setSubmitError(
              `${rejection?.message ?? '기존 견적을 사용할 수 없습니다.'}${rejection?.code ? ` [${rejection.code}]` : ''} 서버가 원 요청을 거절 완료해 최신 견적으로 돌아갑니다.`,
            );
          } else {
            if (restoredForNewRequest) {
              setStep(safeRestoredStep(restoredForNewRequest, 'creative'));
            }
            setSubmitError(
              `${rejection?.message ?? '서버가 원 요청을 거절했습니다.'}${rejection?.code ? ` [${rejection.code}]` : ''} 입력을 확인한 뒤 다시 시도해 주세요.`,
            );
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (
            error instanceof StudioApiError &&
            error.status === 404 &&
            error.code === 'GENERATION_REQUEST_NOT_FOUND'
          ) {
            setPendingLookupStatus('not-found');
            setPendingLookupMessage(
              '서버에 아직 작업 기록이 없습니다. 새 요청 ID를 만들지 말고 저장된 동일 요청 ID로만 안전 복구하세요.',
            );
            return;
          }
          pendingLookupFailuresRef.current += 1;
          setPendingLookupStatus('error');
          setPendingLookupMessage(
            `${messageOf(error)} 기존 요청 잠금은 유지되며 새 유료 요청은 차단됩니다.`,
          );
          const retryDelay = Math.min(
            30_000,
            4_000 * 2 ** Math.min(pendingLookupFailuresRef.current - 1, 3),
          );
          pollTimer = window.setTimeout(
            () => setPendingLookupNonce((value) => value + 1),
            retryDelay,
          );
        });
    };
    const timer = window.setTimeout(lookup, 0);
    const resume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        if (pollTimer != null) window.clearTimeout(pollTimer);
        setPendingLookupNonce((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      window.clearTimeout(timer);
      if (pollTimer != null) window.clearTimeout(pollTimer);
      controller.abort();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [activePromptVersion?.id, clearTemporaryDraft, pendingLookupNonce, pendingRecovery, products, router, templates]);

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
      .getPromptVersions(controller.signal)
      .then((catalog) => {
        const reference = getActivePromptVersionReference(catalog);
        if (!reference) throw new Error('활성화된 프롬프트 버전이 없습니다.');
        activePromptVersionRef.current = reference;
        setActivePromptVersion(reference);
        setPromptVersionError(null);
        setDraft((current) =>
          !current.promptVersionId
            ? { ...current, promptVersionId: reference.id }
            : current,
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        activePromptVersionRef.current = null;
        setActivePromptVersion(null);
        setDraft((current) => ({ ...current, promptVersionId: null }));
        setPromptVersionError(messageOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPromptVersionLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      !pendingRecovery ||
      productsLoading ||
      templatesLoading ||
      restoredPendingRef.current === pendingRecovery.clientRequestId
    ) return;
    restoredPendingRef.current = pendingRecovery.clientRequestId;
    const timer = window.setTimeout(() => {
      const restored = restorePendingDraft(pendingRecovery, templates, products);
      if (!restored) return;
      setDraft(restored);
      setStep(safeRestoredStep(restored, 'review'));
      setQuote(null);
      setQuoteForSignature(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingRecovery, products, productsLoading, templates, templatesLoading]);

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
    if (draftRestoreChecked) return;
    if (sourceJobId) {
      const timer = window.setTimeout(() => setDraftRestoreChecked(true), 0);
      return () => window.clearTimeout(timer);
    }
    if (productsLoading || templatesLoading || promptVersionLoading) return;

    const timer = window.setTimeout(() => {
      try {
        const pending = parsePendingSubmission(
          window.sessionStorage.getItem(PENDING_SUBMISSION_KEY),
        );
        if (pending) {
          setDraftRestoreChecked(true);
          return;
        }
        const raw = window.sessionStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
        const stored = parseStoredCreateDraft(raw);
        if (raw && !stored) {
          window.sessionStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
          setDraftStorageError(
            '손상된 영상 임시 저장 기록을 삭제했습니다. 현재 설정을 다시 확인해 주세요.',
          );
        } else if (stored) {
          const restored = restoreTemporaryDraft(
            stored,
            products,
            templates,
            activePromptVersion?.id ?? null,
          );
          setDraft(restored);
          setStep(safeRestoredStep(restored, stored.step));
          setDraftTouched(true);
          setDraftRestoreNotice(
            stored.productId && !restored.product
              ? '임시 저장된 입력을 복구했습니다. 상품 revision이 변경되었거나 비활성화되어 상품만 다시 선택해 주세요.'
              : '이 탭에 임시 저장된 영상 설정을 복구했습니다.',
          );
        }
      } catch {
        setDraftStorageError(
          '브라우저 임시 저장을 읽지 못했습니다. 현재 페이지에서 입력을 다시 확인해 주세요.',
        );
      } finally {
        setDraftRestoreChecked(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activePromptVersion?.id,
    draftRestoreChecked,
    products,
    productsLoading,
    promptVersionLoading,
    sourceJobId,
    templates,
    templatesLoading,
  ]);

  useEffect(() => {
    if (
      !draftRestoreChecked ||
      !draftTouched ||
      pendingRecovery ||
      corruptPendingRecovery
    ) return;
    const timer = window.setTimeout(() => {
      persistLatestDraft();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    corruptPendingRecovery,
    draft,
    draftRestoreChecked,
    draftTouched,
    pendingRecovery,
    persistLatestDraft,
    step,
  ]);

  useEffect(() => {
    if (
      !sourceJobId ||
      pendingRecovery ||
      corruptPendingRecovery ||
      copiedRef.current === sourceJobId ||
      productsLoading ||
      templatesLoading ||
      providerCapability.loading
    ) return;
    const controller = new AbortController();
    studioApi
      .getGeneration(sourceJobId, controller.signal)
      .then((job) => {
        copiedRef.current = sourceJobId;
        const product = products.find(
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
        setDraft((current) => ({
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
        setDraftTouched(true);
        setQuote(null);
        setQuoteForSignature(null);
        setClientRequestId(createRequestId());
        setCopiedFromJob(true);
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
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSourceCopyState({ sourceJobId, loading: false });
        }
      });
    return () => controller.abort();
  }, [corruptPendingRecovery, pendingRecovery, products, productsLoading, providerCapability, sourceJobId, templates, templatesLoading]);

  const signature = useMemo(() => quoteSignature(draft), [draft]);
  const hasPendingRecovery = Boolean(pendingRecovery || corruptPendingRecovery);
  const sourceCopyLoading = Boolean(
    sourceJobId &&
    (sourceCopyState.sourceJobId !== sourceJobId || sourceCopyState.loading),
  );
  const canRequestQuote = Boolean(
      !pendingRecovery &&
      !corruptPendingRecovery &&
      !promptVersionLoading &&
      draft.promptVersionId &&
      draft.product &&
      isProductAvailableForGeneration(draft.product) &&
      draft.promptVersionId === activePromptVersion?.id &&
      draft.template?.supported &&
      draft.cta.trim() &&
      draft.advertisingPurpose.trim() &&
      (draft.visualMode !== 'model_included' ||
        (providerCapability.supportsIdentityReference &&
          activeInfluencerReferenceUrls(draft.influencerImageUrls).length > 0)),
  );

  useEffect(() => {
    if (step !== 'review' || !canRequestQuote) return;

    const controller = new AbortController();
    let expiryTimer: number | null = null;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError(null);
      studioApi
        .createQuote(draft, controller.signal)
        .then(async (nextQuote) => {
          if (!nextQuote.promptVersion) {
            setQuote(null);
            setQuoteForSignature(null);
            setQuoteError(
              '견적에 프롬프트 버전 스냅샷이 없어 생성을 잠갔습니다. 서버 계약을 확인한 뒤 다시 계산해 주세요.',
            );
            return;
          }
          if (
            !isQuotePromptVersionCurrent(
              draft.promptVersionId,
              activePromptVersion?.id ?? null,
              nextQuote.promptVersion.id,
            )
          ) {
            setQuote(null);
            setQuoteForSignature(null);
            if (!canAttemptPromptVersionRecovery(quoteVersionRecoveryAttemptsRef.current)) {
              setQuoteError(
                '프롬프트 버전 경합이 반복되어 자동 견적 갱신을 멈췄습니다. 잠시 후 다시 계산해 주세요.',
              );
              return;
            }
            quoteVersionRecoveryAttemptsRef.current += 1;
            try {
              const catalog = await studioApi.getPromptVersions(controller.signal);
              if (controller.signal.aborted) return;
              const refreshed = getActivePromptVersionReference(catalog);
              if (!refreshed) throw new Error('활성화된 프롬프트 버전이 없습니다.');
              activePromptVersionRef.current = refreshed;
              setActivePromptVersion(refreshed);
              setPromptVersionError(null);
              if (refreshed.id !== draft.promptVersionId) {
                setDraft((current) => ({ ...current, promptVersionId: refreshed.id }));
                setQuoteError(
                  '견적 계산 중 활성 프롬프트가 변경되어 최신 버전으로 새 견적을 계산합니다.',
                );
                return;
              }
              setQuoteError('견적 버전이 일치하지 않아 새 견적을 한 번 더 확인합니다.');
              setQuoteNonce((value) => value + 1);
            } catch (error) {
              if (controller.signal.aborted) return;
              activePromptVersionRef.current = null;
              setActivePromptVersion(null);
              setDraft((current) => ({ ...current, promptVersionId: null }));
              setPromptVersionError(messageOf(error));
              setQuoteError('활성 프롬프트를 다시 확인하지 못해 견적과 생성을 잠갔습니다.');
            }
            return;
          }
          quoteVersionRecoveryAttemptsRef.current = 0;
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
        .catch(async (error) => {
          if (controller.signal.aborted) return;
          if (
            error instanceof StudioApiError &&
            shouldRefreshPromptVersionAfterQuoteError(error.status, error.code)
          ) {
            setQuote(null);
            setQuoteForSignature(null);
            if (!canAttemptPromptVersionRecovery(quoteVersionRecoveryAttemptsRef.current)) {
              setQuoteError(
                '활성 프롬프트 변경 충돌이 반복되어 자동 견적 갱신을 멈췄습니다. 잠시 후 다시 계산해 주세요.',
              );
              return;
            }
            quoteVersionRecoveryAttemptsRef.current += 1;
            try {
              const catalog = await studioApi.getPromptVersions(controller.signal);
              if (controller.signal.aborted) return;
              const refreshed = getActivePromptVersionReference(catalog);
              if (!refreshed) throw new Error('활성화된 프롬프트 버전이 없습니다.');
              activePromptVersionRef.current = refreshed;
              setActivePromptVersion(refreshed);
              setPromptVersionError(null);
              setDraft((current) => ({ ...current, promptVersionId: refreshed.id }));
              setQuoteError(
                '활성 프롬프트 변경을 반영해 최신 버전으로 새 견적을 계산합니다.',
              );
              if (refreshed.id === draft.promptVersionId) {
                setQuoteNonce((value) => value + 1);
              }
            } catch (refreshError) {
              if (controller.signal.aborted) return;
              activePromptVersionRef.current = null;
              setActivePromptVersion(null);
              setDraft((current) => ({ ...current, promptVersionId: null }));
              setPromptVersionError(messageOf(refreshError));
              setQuoteError('프롬프트 변경 충돌 후 활성 버전을 다시 확인하지 못했습니다.');
            }
            return;
          }
          setQuoteError(messageOf(error));
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
  }, [activePromptVersion?.id, canRequestQuote, draft, quoteNonce, signature, step]);

  if (
    (!draftRestoreChecked || productsLoading || sourceCopyLoading) &&
    !hasPendingRecovery
  ) {
    return (
      <section className="route-state" aria-busy="true">
        <span className="mini-spinner" aria-hidden="true" />
        <h1>{sourceCopyLoading ? '이전 영상 설정을 불러오는 중입니다' : '영상 설정을 준비하고 있습니다'}</h1>
        <p>활성 상품 카탈로그와 이 탭의 안전한 임시 저장 기록을 확인하고 있습니다.</p>
      </section>
    );
  }

  if (!draft.product && products.length === 0 && !hasPendingRecovery) {
    return (
      <section className="route-state">
        <span className="state-symbol danger" aria-hidden="true">!</span>
        <h1>{productsError ? '상품 카탈로그를 불러오지 못했습니다' : '활성화된 광고 상품이 없습니다'}</h1>
        <p>
          {productsError
            ? `${productsError} Backend 연결을 확인한 뒤 다시 시도해 주세요.`
            : '상품을 검수 대기로 등록하고 의미·수량·라벨을 확인한 뒤 활성화해 주세요.'}
        </p>
        {draftTouched && (
          <p>상품 외 영상 전략과 크리에이티브 입력은 이 탭에 임시 저장했습니다.</p>
        )}
        <div className="state-actions">
          {productsError && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setProductsLoading(true);
                setProductsError(null);
                setProductsNonce((value) => value + 1);
              }}
            >
              다시 불러오기
            </button>
          )}
          <Link className="button button-primary" href="/products">상품 관리 열기</Link>
        </div>
      </section>
    );
  }

  const caveat = draft.product
    ? draft.product.assetReviewNote ||
      assetCaveat(draft.product.productId, draft.product.name)
    : null;
  const currentIndex = STEPS.findIndex((item) => item.key === step);
  const validReferenceError =
    draft.visualMode === 'model_included'
      ? activeInfluencerReferenceUrls(draft.influencerImageUrls)
          .map(validateInfluencerReferenceUrl)
          .find(Boolean) ?? null
      : null;
  const quotePromptVersionCurrent = isQuotePromptVersionCurrent(
    draft.promptVersionId,
    activePromptVersion?.id ?? null,
    quote?.promptVersion?.id ?? null,
  );
  const quoteCurrent =
    quoteForSignature === signature && !isQuoteExpired(quote) && quotePromptVersionCurrent;
  const canRecoverPending = Boolean(
    pendingRecovery?.requestBody &&
      (pendingLookupStatus === 'not-found' || pendingLookupStatus === 'recoverable'),
  );
  const quoteUpperMissing = Boolean(quoteCurrent && quote?.maxTotalUsd == null);
  const insufficientBalance = Boolean(
    quoteCurrent &&
      quote?.maxTotalUsd != null &&
      quote?.availableBalanceUsd != null &&
      quote.availableBalanceUsd < quote.maxTotalUsd,
  );

  function update<Key extends keyof CreateDraft>(key: Key, value: CreateDraft[Key]) {
    if (submittingRef.current) return;
    quoteVersionRecoveryAttemptsRef.current = 0;
    setDraft((current) => ({ ...current, [key]: value }));
    setDraftTouched(true);
    setDraftRestoreNotice(null);
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
    quoteVersionRecoveryAttemptsRef.current = 0;
    setQuote(null);
    setQuoteForSignature(null);
    setQuoteError(null);
    setQuoteNonce((value) => value + 1);
  }

  function nextStep() {
    if (submittingRef.current) return;
    if (step === 'product') {
      if (!draft.product) {
        setSubmitError('광고할 활성 상품을 선택해 주세요.');
        return;
      }
      move('template');
    }
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
    const selectedProduct = draft.product;
    if (
      !selectedProduct ||
      !quote ||
      !quoteCurrent ||
      insufficientBalance ||
      quoteUpperMissing ||
      submittingRef.current ||
      pendingRecovery ||
      corruptPendingRecovery
    ) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const catalog = await studioApi.getPromptVersions();
      const latestActive = getActivePromptVersionReference(catalog);
      if (!latestActive) throw new Error('활성화된 프롬프트 버전이 없습니다.');
      activePromptVersionRef.current = latestActive;
      setActivePromptVersion(latestActive);
      setPromptVersionError(null);
      if (
        !isQuotePromptVersionCurrent(
          draft.promptVersionId,
          latestActive.id,
          quote.promptVersion?.id ?? null,
        )
      ) {
        setDraft((current) =>
          ({ ...current, promptVersionId: latestActive.id }),
        );
        setQuote(null);
        setQuoteForSignature(null);
        setQuoteError(
          '생성 직전 활성 프롬프트가 변경된 것을 확인해 최신 버전으로 새 견적을 계산합니다.',
        );
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
    } catch (error) {
      activePromptVersionRef.current = null;
      setActivePromptVersion(null);
      setDraft((current) => ({ ...current, promptVersionId: null }));
      setPromptVersionError(messageOf(error));
      setSubmitError('활성 프롬프트를 다시 확인하지 못해 유료 생성 요청을 보내지 않았습니다.');
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    try {
      const latestProducts = await productCatalogApi.listProducts();
      const latestProduct = latestProducts.items.find(
        (product) => product.productId === selectedProduct.productId,
      );
      if (
        !latestProduct ||
        !isProductAvailableForGeneration(latestProduct) ||
        latestProduct.revision !== selectedProduct.revision
      ) {
        const availableProducts = latestProducts.items.filter(isProductAvailableForGeneration);
        setProducts(availableProducts);
        setDraft((current) => ({ ...current, product: null }));
        setDraftTouched(true);
        setDraftRestoreNotice(
          latestProduct && isProductAvailableForGeneration(latestProduct)
            ? '상품 revision이 변경되어 상품 선택만 해제했습니다. 최신 상품을 직접 다시 선택하면 나머지 입력은 그대로 사용할 수 있습니다.'
            : '상품이 비활성화되거나 보관되어 상품 선택만 해제했습니다. 나머지 입력은 그대로 보존했습니다.',
        );
        setQuote(null);
        setQuoteForSignature(null);
        setSubmitError(
          latestProduct
            ? '상품 정보가 변경되어 유료 요청을 보내지 않았습니다. 최신 상품으로 새 견적을 확인해 주세요.'
            : '상품이 비활성화되거나 보관되어 유료 요청을 보내지 않았습니다. 다른 활성 상품을 선택해 주세요.',
        );
        submittingRef.current = false;
        setSubmitting(false);
        setStep('product');
        return;
      }
    } catch (error) {
      setSubmitError(
        `상품 카탈로그를 다시 확인하지 못해 유료 생성 요청을 보내지 않았습니다. ${messageOf(error)}`,
      );
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    const generationInput: StartGenerationInput = {
      ...draft,
      product: selectedProduct,
      quoteId: quote.quoteId,
      clientRequestId,
    };
    const pending = {
      clientRequestId,
      quoteId: quote.quoteId,
      createdAt: new Date().toISOString(),
      request: snapshotDraft(generationInput),
      requestBody: studioApi.prepareGenerationRequest(generationInput),
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
    clearTemporaryDraft();
    setDraftTouched(false);
    try {
      const jobId = await studioApi.startPreparedGeneration(
        pending.requestBody,
        clientRequestId,
      );
      clearPendingSubmission();
      clearTemporaryDraft();
      setDraftTouched(false);
      setPendingRecovery(null);
      setCorruptPendingRecovery(false);
      try {
        window.sessionStorage.setItem('quedot.last-generation-job', jobId);
      } catch {
        // The durable job ID is already represented by the destination URL.
      }
      router.push(`/videos/${encodeURIComponent(jobId)}`);
    } catch (error) {
      setPendingRecovery(pending);
      setPendingLookupStatus('error');
      setPendingLookupMessage(
        `${messageOf(error)} 서버 예약 상태를 확인할 때까지 기존 요청 잠금을 유지합니다.`,
      );
      setPendingLookupNonce((value) => value + 1);
      setSubmitError(
        '접수 응답을 확정하지 못했습니다. 새 요청 ID를 만들지 않고 서버 예약 상태를 조회합니다.',
      );
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function recoverSameRequest() {
    if (!pendingRecovery?.requestBody || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setPendingLookupStatus('checking');
    setPendingLookupMessage('저장된 본문과 동일한 요청 ID로 접수 결과를 복구하고 있습니다.');
    try {
      const jobId = await studioApi.startPreparedGeneration(
        pendingRecovery.requestBody,
        pendingRecovery.clientRequestId,
      );
      clearPendingSubmission();
      clearTemporaryDraft();
      setDraftTouched(false);
      setPendingRecovery(null);
      setCorruptPendingRecovery(false);
      try {
        window.sessionStorage.setItem('quedot.last-generation-job', jobId);
      } catch {
        // The destination URL carries the durable job ID.
      }
      router.push(`/videos/${encodeURIComponent(jobId)}`);
    } catch (error) {
      const code = error instanceof StudioApiError ? error.code : null;
      setPendingLookupStatus('error');
      setPendingLookupMessage(
        `${messageOf(error)}${code ? ` [${code}]` : ''} 서버 예약 상태로 최종 확인할 때까지 기존 요청 잠금을 유지합니다.`,
      );
      setPendingLookupNonce((value) => value + 1);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
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

      {draftRestoreNotice && (
        <div className="notice-banner warning" role="status" aria-live="polite">
          {draftRestoreNotice}
        </div>
      )}

      {draftStorageError && (
        <div className="notice-banner warning" role="alert">
          {draftStorageError}
        </div>
      )}

      {promptVersionError && (
        <div className="notice-banner warning" role="alert">
          활성 프롬프트를 확인하지 못해 견적과 생성을 잠갔습니다. {promptVersionError}{' '}
          <Link href="/settings/prompts">프롬프트 설정 열기</Link>
        </div>
      )}

      {hasPendingRecovery && (
        <div className="recovery-banner" role="status" aria-live="polite">
          <div>
            <strong>이전 생성 요청의 접수 결과를 확인해야 합니다</strong>
            <p>
              응답이 끊긴 요청에는 새 ID를 발급하지 않습니다. 서버 조회 또는 저장된 동일 본문·동일
              요청 ID 복구만 허용합니다.
              {pendingRecovery && (
                <> 요청 ID 끝자리 <code>{pendingRecovery.clientRequestId.slice(-8)}</code></>
              )}
            </p>
            {pendingLookupStatus === 'in-progress' && <p>원래 요청 처리가 끝날 때까지 자동으로 다시 확인합니다.</p>}
            {pendingLookupMessage && <p>{pendingLookupMessage}</p>}
            {corruptPendingRecovery && (
              <p>로컬 복구 기록이 손상되어 요청 ID를 안전하게 확인할 수 없습니다. 새 생성은 차단되며 운영자 확인이 필요합니다.</p>
            )}
            {pendingRecovery && !pendingRecovery.requestBody && (
              <p>이전 버전의 잠금 기록에는 직렬화된 원본 본문이 없어 동일 요청 재전송을 할 수 없습니다. 서버 접수 조회 또는 운영자 확인만 가능합니다.</p>
            )}
          </div>
          <div className="inline-actions">
            <Link className="button button-secondary" href="/videos">라이브러리 확인</Link>
            {pendingRecovery && (
              <button
                className="button button-secondary"
                type="button"
                disabled={
                  pendingLookupStatus === 'checking' ||
                  pendingLookupStatus === 'in-progress' ||
                  submitting
                }
                onClick={() => {
                  setPendingLookupStatus('checking');
                  setPendingLookupNonce((value) => value + 1);
                }}
              >
                접수 상태 다시 확인
              </button>
            )}
            {pendingRecovery && (
              <button
                className="button button-primary"
                type="button"
                disabled={
                  !canRecoverPending ||
                  submitting ||
                  pendingLookupStatus === 'checking' ||
                  pendingLookupStatus === 'in-progress'
                }
                onClick={recoverSameRequest}
              >
                {submitting ? '동일 요청 복구 중…' : '같은 요청 ID로 안전 복구'}
              </button>
            )}
          </div>
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
          <fieldset className="wizard-fieldset" disabled={submitting || hasPendingRecovery}>
          {step === 'product' && (
            <ProductStep
              draft={draft}
              products={products}
              onProduct={(product) => update('product', product)}
              caveat={caveat}
            />
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
              quoteUpperMissing={quoteUpperMissing}
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
                disabled={
                  (step === 'product' && !draft.product) ||
                  (step === 'template' && !draft.template)
                }
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
                  quoteUpperMissing ||
                  submitting ||
                  hasPendingRecovery
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
            {draft.product ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.product.imageUrl} alt="" width={64} height={64} referrerPolicy="no-referrer" />
                <div><small>선택 상품</small><strong>{draft.product.name}</strong></div>
              </>
            ) : (
              <div><small>선택 상품</small><strong>다시 선택해 주세요</strong></div>
            )}
          </div>
          <SummaryRow label="영상 전략" value={draft.template?.name ?? '선택 전'} />
          <SummaryRow label="출연 방식" value={visualModeLabel(draft.visualMode)} />
          <SummaryRow label="후보 수" value={`${draft.outputCount}개`} />
          <SummaryRow
            label="프롬프트"
            value={
              pendingRecovery
                ? `요청 스냅샷 · ${
                    (typeof pendingRecovery.requestBody?.prompt_version_id === 'string'
                      ? pendingRecovery.requestBody.prompt_version_id
                      : pendingRecovery.request?.promptVersionId) ?? '버전 기록 없음'
                  }`
                : quoteCurrent && quote?.promptVersion
                  ? `${quote.promptVersion.name} · v${quote.promptVersion.version}`
                  : promptVersionLoading
                    ? '견적 버전 확인 중'
                    : '견적에서 확정 대기'
            }
          />
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
  products,
  onProduct,
  caveat,
}: {
  draft: CreateDraft;
  products: CatalogProduct[];
  onProduct: (product: CatalogProduct) => void;
  caveat: string | null;
}) {
  return (
    <div className="step-content">
      <div className="section-heading">
        <span>1</span><div><h2>광고할 상품을 선택하세요</h2><p>현재 생성에 허용된 에셋만 표시하며, 수량·작은 글자 검증 범위는 상품별로 안내합니다.</p></div>
      </div>
      <div className="inline-actions">
        <Link className="button button-secondary" href="/products">+ 광고 상품 추가·관리</Link>
      </div>
      <div className="product-choice-list" role="radiogroup" aria-label="Production 상품">
        {products.length === 0 && (
          <div className="empty-state compact-empty">
            <h3>선택 가능한 활성 상품이 없습니다</h3>
            <p>상품 관리에서 자산을 검수하고 활성화한 뒤 다시 불러와 주세요.</p>
          </div>
        )}
        {products.map((product) => {
          const selected = product.productId === draft.product?.productId;
          return (
            <button
              key={product.productId}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`product-choice ${selected ? 'selected' : ''}`}
              onClick={() => onProduct(product)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt="" width={92} height={92} loading="lazy" referrerPolicy="no-referrer" />
              <span><small>{product.curator}</small><strong>{product.name}</strong><em>{product.option}</em></span>
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <p className="audit-copy">
        기존 데이터 기술 검수 {PRODUCTION_ASSET_AUDIT.technicallyEligibleProductCount}개와 별개로, 현재 카탈로그에서 기술·의미 검수를 모두 확인하고 활성화한 {products.length}개 상품입니다.
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
  quoteUpperMissing,
  onRetryQuote,
}: {
  draft: CreateDraft;
  quote: GenerationQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  caveat: string | null;
  insufficientBalance: boolean;
  quoteUpperMissing: boolean;
  onRetryQuote: () => void;
}) {
  return (
    <div className="step-content">
      <div className="section-heading">
        <span>4</span><div><h2>설정과 예상 비용을 확인하세요</h2><p>버튼을 누르면 스크립트부터 최종 후보까지 비동기로 생성합니다.</p></div>
      </div>
      {draft.template && <TimelineDetail template={draft.template} />}
      <div className="prompt-version-note" role="note">
        <div>
          <strong>적용 프롬프트</strong>
          <span>
            {quote?.promptVersion
              ? `${quote.promptVersion.name} · v${quote.promptVersion.version}`
              : '견적에서 버전 스냅샷 확정 대기'}
          </span>
        </div>
        <Link href="/settings/prompts">버전 관리</Link>
        <p>견적과 작업을 접수할 때 활성 버전을 스냅샷으로 고정하며, 이후 활성화 변경은 신규 작업부터 적용됩니다.</p>
      </div>
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
            {quote.promptVersion && (
              <p className="quote-coverage">
                견적 프롬프트: {quote.promptVersion.name} · v{quote.promptVersion.version}
              </p>
            )}
            {quoteUpperMissing && <p className="field-error" role="alert">Provider 예상 범위 상단이 없어 유료 생성을 시작할 수 없습니다. 견적을 다시 계산해 주세요.</p>}
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
