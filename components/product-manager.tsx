'use client';

/* Operator-managed remote hosts cannot be enumerated in next/image remotePatterns at build time. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  GuardedLink as Link,
  usePageNavigationGuard,
} from '@/components/navigation-guard';
import {
  ProductCatalogApiError,
  productCatalogApi,
} from '@/lib/product-catalog-api';
import {
  normalizeHttpsProductImageUrl,
  validateProductInput,
} from '@/lib/product-catalog';
import type {
  CatalogProduct,
  ProductCatalog,
  ProductUpsertInput,
} from '@/types/product-catalog';

type ProductStatusFilter = 'all' | 'active' | 'inactive' | 'archived';

interface ProductFormState {
  productId: string;
  eventId: string;
  eventName: string;
  curator: string;
  name: string;
  option: string;
  salePrice: string;
  discountLabel: string;
  imageUrl: string;
  detailImageUrls: string;
  squareOutputStrategy: 'reject' | 'center_crop';
  categoryGroups: string;
  sellingPoint: string;
  assetReviewNote: string;
}

type FormErrors = Partial<Record<keyof ProductFormState, string>>;

const EMPTY_FORM: ProductFormState = {
  productId: '',
  eventId: '',
  eventName: '',
  curator: '',
  name: '',
  option: '',
  salePrice: '0',
  discountLabel: '',
  imageUrl: '',
  detailImageUrls: '',
  squareOutputStrategy: 'center_crop',
  categoryGroups: '',
  sellingPoint: '',
  assetReviewNote: '',
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function formatDate(value: string | null): string {
  if (!value) return '기록 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '기록 없음'
    : new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function splitValues(value: string): string[] {
  return [...new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))];
}

function formFromProduct(product: CatalogProduct): ProductFormState {
  return {
    productId: product.productId,
    eventId: product.eventId,
    eventName: product.eventName,
    curator: product.curator,
    name: product.name,
    option: product.option,
    salePrice: String(product.salePrice),
    discountLabel: product.discountLabel,
    imageUrl: product.imageUrl,
    detailImageUrls: product.detailImageUrls.join('\n'),
    squareOutputStrategy: product.squareOutputStrategy ?? 'center_crop',
    categoryGroups: product.categoryGroups.join(', '),
    sellingPoint: product.sellingPoint,
    assetReviewNote: product.assetReviewNote,
  };
}

function statusOf(product: CatalogProduct): Exclude<ProductStatusFilter, 'all'> {
  if (product.archivedAt) return 'archived';
  return product.isActive ? 'active' : 'inactive';
}

function statusLabel(product: CatalogProduct): string {
  if (product.archivedAt) return '보관됨';
  return product.isActive ? '활성' : '검수 대기';
}

function inputFromForm(
  form: ProductFormState,
  rawProduct?: Record<string, unknown>,
): ProductUpsertInput {
  return {
    productId: form.productId.trim() || undefined,
    eventId: form.eventId,
    eventName: form.eventName,
    curator: form.curator,
    name: form.name,
    option: form.option,
    salePrice: Number(form.salePrice),
    discountLabel: form.discountLabel,
    imageUrl: form.imageUrl,
    detailImageUrls: splitValues(form.detailImageUrls),
    squareOutputStrategy: form.squareOutputStrategy,
    categoryGroups: splitValues(form.categoryGroups),
    sellingPoint: form.sellingPoint,
    assetReviewNote: form.assetReviewNote,
    rawProduct,
  };
}

function productCount(catalog: ProductCatalog | null, status: ProductStatusFilter): number {
  if (!catalog) return 0;
  if (status === 'all') return catalog.items.length;
  return catalog.items.filter((product) => statusOf(product) === status).length;
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstJsonValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function jsonText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonNumber(value: unknown): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : '0';
}

function jsonStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(jsonText).filter(Boolean)
    : typeof value === 'string'
      ? splitValues(value)
      : [];
}

export function ProductManager() {
  const [catalog, setCatalog] = useState<ProductCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all');
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [editorError, setEditorError] = useState<string | null>(null);
  const [conflictDraft, setConflictDraft] = useState<ProductFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [jsonImport, setJsonImport] = useState('');
  const [jsonImportMessage, setJsonImportMessage] = useState<string | null>(null);
  const [activationTarget, setActivationTarget] = useState<CatalogProduct | null>(null);
  const [activationAcknowledged, setActivationAcknowledged] = useState(false);
  const [activationNote, setActivationNote] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<CatalogProduct | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<{ productId: string; label: string } | null>(null);
  const requestRef = useRef(0);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const dialogReturnProductIdRef = useRef<string | null>(null);
  const productActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const busyActionRef = useRef(busyAction);

  const isDirty = editorMode !== null && (
    JSON.stringify(form) !== JSON.stringify(initialForm) ||
    Boolean(conflictDraft) ||
    (editorMode === 'create' && Boolean(jsonImport.trim()))
  );

  usePageNavigationGuard({
    hasUnsavedChanges: isDirty,
    busy: saving || Boolean(busyAction),
    confirmMessage: '저장하지 않은 상품 변경이 있습니다. 변경을 버리고 이동할까요?',
    onBusyBlocked: () => {
      setLoadError('상품 저장 또는 상태 변경이 끝난 뒤 페이지를 이동해 주세요.');
    },
  });

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setLoadError(null);
    try {
      const nextCatalog = await productCatalogApi.listProducts({ includeInactive: true }, signal);
      if (requestId === requestRef.current) setCatalog(nextCatalog);
    } catch (error) {
      if (signal?.aborted) return;
      if (requestId === requestRef.current) setLoadError(messageOf(error));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadCatalog(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (editorMode) nameInputRef.current?.focus();
  }, [editorMode]);

  useEffect(() => {
    busyActionRef.current = busyAction;
  }, [busyAction]);

  const restoreDialogFocus = useCallback(
    (returnProductId: string | null, fallbackTrigger: HTMLElement | null) => {
      window.setTimeout(() => {
        const productAction = returnProductId
          ? productActionRefs.current.get(returnProductId) ?? null
          : null;
        const target = [productAction, fallbackTrigger, addButtonRef.current].find(
          (candidate) =>
            candidate?.isConnected &&
            (!(candidate instanceof HTMLButtonElement) || !candidate.disabled),
        );
        target?.focus();
      }, 0);
    },
    [],
  );

  useEffect(() => {
    if (!activationTarget && !archiveTarget) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnProductId = dialogReturnProductIdRef.current;
    const fallbackTrigger = dialogTriggerRef.current;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]';
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (busyActionRef.current) return;
        event.preventDefault();
        setActivationTarget(null);
        setArchiveTarget(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreDialogFocus(returnProductId, fallbackTrigger);
      dialogReturnProductIdRef.current = null;
      dialogTriggerRef.current = null;
    };
  }, [activationTarget, archiveTarget, restoreDialogFocus]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    return (catalog?.items ?? [])
      .filter((product) => statusFilter === 'all' || statusOf(product) === statusFilter)
      .filter((product) => {
        if (!normalizedQuery) return true;
        return [product.name, product.curator, product.eventName, product.productId]
          .some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedQuery));
      })
      .sort((left, right) => {
        const statusOrder = { active: 0, inactive: 1, archived: 2 };
        const byStatus = statusOrder[statusOf(left)] - statusOrder[statusOf(right)];
        return byStatus || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
      });
  }, [catalog, query, statusFilter]);

  const previewUrl = normalizeHttpsProductImageUrl(form.imageUrl);

  const updateCatalogProduct = useCallback((product: CatalogProduct, created = false) => {
    setCatalog((current) => {
      const currentItems = current?.items ?? [];
      const exists = currentItems.some((item) => item.productId === product.productId);
      const items = exists
        ? currentItems.map((item) => item.productId === product.productId ? product : item)
        : [product, ...currentItems];
      return {
        items,
        total: (current?.total ?? 0) + (created && !exists ? 1 : 0),
        activeCount: items.filter((item) => item.isActive && !item.archivedAt).length,
      };
    });
  }, []);

  const resetEditor = useCallback(() => {
    setEditorMode(null);
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setInitialForm(EMPTY_FORM);
    setFormErrors({});
    setEditorError(null);
    setConflictDraft(null);
    setJsonImport('');
    setJsonImportMessage(null);
  }, []);

  const closeEditor = useCallback(() => {
    if (saving) return;
    if (isDirty && !window.confirm('저장하지 않은 상품 변경을 버릴까요?')) return;
    resetEditor();
  }, [isDirty, resetEditor, saving]);

  const openCreate = () => {
    if (saving || busyAction) return;
    if (isDirty && !window.confirm('저장하지 않은 변경을 버리고 새 상품을 등록할까요?')) return;
    const next = { ...EMPTY_FORM };
    setEditorMode('create');
    setEditingProduct(null);
    setForm(next);
    setInitialForm(next);
    setFormErrors({});
    setEditorError(null);
    setConflictDraft(null);
    setJsonImport('');
    setJsonImportMessage(null);
    setNotice(null);
  };

  const openEdit = (product: CatalogProduct) => {
    if (saving || busyAction) return;
    if (isDirty && !window.confirm('저장하지 않은 변경을 버리고 다른 상품을 편집할까요?')) return;
    const next = formFromProduct(product);
    setEditorMode('edit');
    setEditingProduct(product);
    setForm(next);
    setInitialForm(next);
    setFormErrors({});
    setEditorError(null);
    setConflictDraft(null);
    setJsonImport('');
    setJsonImportMessage(null);
    setNotice(null);
  };

  const changeForm = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => ({ ...current, [key]: undefined }));
    setEditorError(null);
  };

  const importProductJson = () => {
    setJsonImportMessage(null);
    try {
      const parsed: unknown = JSON.parse(jsonImport);
      const envelope = readJsonRecord(parsed);
      const source = readJsonRecord(firstJsonValue(envelope.product, envelope.item, envelope.data, parsed));
      if (Object.keys(source).length === 0) throw new Error('상품 객체 한 개를 붙여 넣어 주세요.');
      const raw = readJsonRecord(firstJsonValue(source.raw_product, source.rawProduct));
      const detailUrls = jsonStringList(
        firstJsonValue(source.detail_image_urls, source.detailImageUrls, raw.detail_image_urls),
      );
      const categories = jsonStringList(
        firstJsonValue(source.category_group, source.categoryGroups, raw.category_group),
      );
      const strategy = firstJsonValue(
        source.square_output_strategy,
        source.squareOutputStrategy,
        raw.square_output_strategy,
      );
      setForm((current) => ({
        ...current,
        productId: jsonText(firstJsonValue(source.product_id, source.productId, source.id, raw.product_id)),
        eventId: jsonText(firstJsonValue(source.event_id, source.eventId, raw.event_id)),
        eventName: jsonText(firstJsonValue(source.event_name, source.eventName, raw.event_name)),
        curator: jsonText(firstJsonValue(source.curator, source.brand, raw.curator, raw.brand)),
        name: jsonText(firstJsonValue(source.name, raw.name)),
        option: jsonText(firstJsonValue(source.option, raw.option)),
        salePrice: jsonNumber(firstJsonValue(source.sale_price, source.salePrice, raw.sale_price)),
        discountLabel: jsonText(firstJsonValue(source.discount_label, source.discountLabel, raw.discount_label)),
        imageUrl: jsonText(firstJsonValue(source.image_url, source.imageUrl, raw.image_url)),
        detailImageUrls: detailUrls.join('\n'),
        categoryGroups: categories.join(', '),
        squareOutputStrategy: strategy === 'reject' ? 'reject' : 'center_crop',
        sellingPoint: jsonText(firstJsonValue(source.selling_point, source.sellingPoint, raw.selling_point)),
        assetReviewNote: jsonText(firstJsonValue(source.asset_review_note, source.assetReviewNote, raw.asset_review_note)),
      }));
      setFormErrors({});
      setJsonImportMessage('알려진 필드만 불러왔습니다. 이미지와 광고 문맥을 검토한 뒤 저장해 주세요.');
    } catch (error) {
      setJsonImportMessage(messageOf(error));
    }
  };

  const handleConflict = async (
    error: unknown,
    options: { rebaseEditor?: boolean; staleForm?: ProductFormState } = {},
  ): Promise<boolean> => {
    if (
      !(error instanceof ProductCatalogApiError) ||
      error.status !== 409 ||
      error.code !== 'PRODUCT_REVISION_CONFLICT'
    ) return false;
    try {
      const latestCatalog = await productCatalogApi.listProducts({ includeInactive: true });
      setCatalog(latestCatalog);
      if (options.rebaseEditor && editingProduct) {
        const latestEditingProduct = latestCatalog.items.find(
          (item) => item.productId === editingProduct.productId,
        );
        if (latestEditingProduct) {
          const latestForm = formFromProduct(latestEditingProduct);
          setEditingProduct(latestEditingProduct);
          setForm(latestForm);
          setInitialForm(latestForm);
          setFormErrors({});
          setConflictDraft(options.staleForm ?? null);
          setEditorError(
            '다른 화면에서 상품이 먼저 변경되었습니다. 최신 서버 내용으로 편집 기준을 바꿨습니다. 이전 입력은 아래 버튼을 눌러야만 다시 적용됩니다.',
          );
        } else {
          setEditorError(
            '다른 화면에서 상품이 변경되었고 최신 목록에서 찾을 수 없습니다. 이전 입력을 자동으로 저장하지 않았습니다.',
          );
        }
      }
      setActivationTarget(null);
      setArchiveTarget(null);
      if (!options.rebaseEditor) {
        setLoadError(
          '다른 화면에서 상품이 먼저 변경되었습니다. 최신 목록을 반영했으니 다시 검토해 주세요.',
        );
      }
    } catch (refreshError) {
      setLoadError(`상품 변경 충돌 후 최신 목록도 불러오지 못했습니다. ${messageOf(refreshError)}`);
    }
    return true;
  };

  const saveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const input = inputFromForm(form, editingProduct?.rawProduct);
    const validation = validateProductInput(input);
    setEditorError(null);
    if (!validation.valid) {
      setFormErrors(validation.errors as FormErrors);
      setNotice(null);
      return;
    }
    if (editorMode === 'edit' && editingProduct?.revision == null) {
      setFormErrors({ productId: '상품 revision이 없어 안전하게 수정할 수 없습니다. 목록을 새로고침해 주세요.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = editorMode === 'edit' && editingProduct
        ? await productCatalogApi.updateProduct(
            editingProduct.productId,
            input,
            editingProduct.revision!,
          )
        : await productCatalogApi.createProduct(input);
      updateCatalogProduct(saved, editorMode === 'create');
      const wasCreated = editorMode === 'create';
      dialogReturnProductIdRef.current = saved.productId;
      dialogTriggerRef.current = addButtonRef.current;
      resetEditor();
      setNotice(
        wasCreated
          ? '상품을 검수 대기 상태로 저장했습니다. 의미·수량·표시 일치를 확인한 뒤 활성화해 주세요.'
          : '변경 내용을 저장했습니다. 안전을 위해 상품이 자동 비활성화되었습니다. 다시 검수 후 활성화해 주세요.',
      );
      setDialogError(null);
      setActivationTarget(saved);
      setActivationAcknowledged(false);
      setActivationNote(saved.assetReviewNote);
    } catch (error) {
      if (!(await handleConflict(error, { rebaseEditor: true, staleForm: form }))) {
        setEditorError(messageOf(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const openActivation = (product: CatalogProduct, trigger?: HTMLElement) => {
    dialogTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogReturnProductIdRef.current = product.productId;
    setActivationTarget(product);
    setActivationAcknowledged(false);
    setActivationNote(product.activationReviewNote || product.assetReviewNote);
    setDialogError(null);
    setNotice(null);
  };

  const activateProduct = async () => {
    const product = activationTarget;
    if (!product || busyAction) return;
    if (product.revision == null) {
      setDialogError('상품 revision이 없어 안전하게 활성화할 수 없습니다. 목록을 새로고침해 주세요.');
      return;
    }
    if (!activationAcknowledged || !activationNote.trim()) return;
    setBusyAction({ productId: product.productId, label: '활성화' });
    try {
      const updated = await productCatalogApi.activateProduct(product.productId, {
        assetReviewAcknowledged: true,
        reviewNote: activationNote,
        expectedRevision: product.revision,
      });
      updateCatalogProduct(updated);
      setActivationTarget(null);
      setNotice(product.archivedAt ? '보관 상품을 복구하고 활성화했습니다.' : '검수 확인을 기록하고 상품을 활성화했습니다.');
    } catch (error) {
      if (!(await handleConflict(error))) setDialogError(messageOf(error));
    } finally {
      setBusyAction(null);
    }
  };

  const deactivateProduct = async (product: CatalogProduct) => {
    if (saving || busyAction || product.revision == null) {
      if (product.revision == null) setLoadError('상품 revision이 없어 변경할 수 없습니다. 목록을 새로고침해 주세요.');
      return;
    }
    setBusyAction({ productId: product.productId, label: '비활성화' });
    setNotice(null);
    try {
      const updated = await productCatalogApi.deactivateProduct(product.productId, product.revision);
      updateCatalogProduct(updated);
      setNotice('상품을 비활성화했습니다. 새 영상 만들기 목록에서 제외됩니다.');
    } catch (error) {
      if (!(await handleConflict(error))) setLoadError(messageOf(error));
    } finally {
      setBusyAction(null);
    }
  };

  const archiveProduct = async () => {
    const product = archiveTarget;
    if (!product || saving || busyAction) return;
    if (product.revision == null) {
      setDialogError('상품 revision이 없어 안전하게 보관할 수 없습니다. 목록을 새로고침해 주세요.');
      return;
    }
    setBusyAction({ productId: product.productId, label: '보관' });
    setNotice(null);
    try {
      const updated = await productCatalogApi.archiveProduct(product.productId, product.revision);
      updateCatalogProduct(updated);
      setArchiveTarget(null);
      setNotice('상품을 보관했습니다. 기록은 유지되며 자산 재검수 후 복구할 수 있습니다.');
    } catch (error) {
      if (!(await handleConflict(error))) setDialogError(messageOf(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="page-stack product-manager-page">
      <header className="page-header-actions product-manager-header">
        <div className="page-header">
          <p className="eyebrow">PRODUCT CATALOG</p>
          <h1>광고 상품 관리</h1>
          <p>영상에 사용할 상품과 이미지 자산을 등록하고, 검수된 버전만 생성 화면에 노출합니다.</p>
        </div>
        <div className="product-header-actions">
          <Link className="button button-secondary" href="/create">새 영상 만들기</Link>
          <button
            ref={addButtonRef}
            className="button button-primary"
            type="button"
            onClick={openCreate}
            disabled={saving || Boolean(busyAction)}
          >
            상품 추가
          </button>
        </div>
      </header>

      <section className="product-policy-banner" aria-label="상품 운영 정책">
        <strong>2단계 공개 정책</strong>
        <p>저장 시 URL·파일 기술 조건을 점검하고 검수 대기로 등록합니다. 실제 상품, 구성 수량, 라벨과 광고 문구의 의미 일치는 운영자가 확인한 뒤 별도로 활성화해야 합니다.</p>
      </section>

      {notice && <div className="notice-banner success" role="status">{notice}</div>}
      {loadError && (
        <div className="inline-alert" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadCatalog()}>최신 목록 다시 불러오기</button>
        </div>
      )}

      <section className="product-summary-grid" aria-label="상품 현황">
        <button type="button" className={statusFilter === 'all' ? 'product-stat active' : 'product-stat'} onClick={() => setStatusFilter('all')}>
          <span>전체</span><strong>{productCount(catalog, 'all')}</strong>
        </button>
        <button type="button" className={statusFilter === 'active' ? 'product-stat active tone-success' : 'product-stat tone-success'} onClick={() => setStatusFilter('active')}>
          <span>활성</span><strong>{productCount(catalog, 'active')}</strong>
        </button>
        <button type="button" className={statusFilter === 'inactive' ? 'product-stat active tone-warning' : 'product-stat tone-warning'} onClick={() => setStatusFilter('inactive')}>
          <span>검수 대기</span><strong>{productCount(catalog, 'inactive')}</strong>
        </button>
        <button type="button" className={statusFilter === 'archived' ? 'product-stat active' : 'product-stat'} onClick={() => setStatusFilter('archived')}>
          <span>보관</span><strong>{productCount(catalog, 'archived')}</strong>
        </button>
      </section>

      <div className={editorMode ? 'product-manager-layout editor-open' : 'product-manager-layout'}>
        <section className="panel product-list-panel" aria-labelledby="product-list-title">
          <div className="panel-heading">
            <div>
              <h2 id="product-list-title">등록 상품</h2>
              <p>활성 상품만 새 영상 만들기에서 선택할 수 있습니다.</p>
            </div>
            <span className="quiet-badge">{visibleProducts.length}개 표시</span>
          </div>
          <div className="product-toolbar" role="search">
            <label className="search-field">
              <span className="sr-only">상품 검색</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명, 브랜드, 공구명, ID 검색" />
            </label>
            <select aria-label="상품 상태 필터" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProductStatusFilter)}>
              <option value="all">전체 상태</option>
              <option value="active">활성</option>
              <option value="inactive">검수 대기</option>
              <option value="archived">보관</option>
            </select>
          </div>

          {loading ? (
            <div className="product-list-loading" aria-busy="true" aria-label="상품 목록 불러오는 중">
              {Array.from({ length: 3 }, (_, index) => <div className="skeleton product-row-skeleton" key={index} />)}
            </div>
          ) : !catalog ? (
            <div className="empty-state compact-empty">
              <span className="state-symbol danger" aria-hidden="true">!</span>
              <h3>상품 목록을 불러오지 못했습니다</h3>
              <p>Backend 연결을 확인한 뒤 다시 시도해 주세요.</p>
              <button className="button button-secondary" type="button" onClick={() => void loadCatalog()}>다시 시도</button>
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="empty-state compact-empty">
              <span className="state-symbol" aria-hidden="true">P</span>
              <h3>{catalog.items.length === 0 ? '첫 광고 상품을 등록해 주세요' : '조건에 맞는 상품이 없습니다'}</h3>
              <p>{catalog.items.length === 0 ? '상품은 검수 대기로 저장된 뒤 명시적인 자산 검수를 거쳐 활성화됩니다.' : '검색어나 상태 필터를 바꿔 보세요.'}</p>
              {catalog.items.length === 0
                ? <button className="button button-primary" type="button" onClick={openCreate}>상품 추가</button>
                : <button className="button button-secondary" type="button" onClick={() => { setQuery(''); setStatusFilter('all'); }}>필터 초기화</button>}
            </div>
          ) : (
            <div className="product-catalog-list">
              {visibleProducts.map((product) => {
                const currentAction = busyAction?.productId === product.productId ? busyAction.label : null;
                return (
                  <article className={`product-catalog-row status-${statusOf(product)}`} key={product.productId}>
                    <div className="catalog-product-image">
                      <img src={product.imageUrl} alt={`${product.name} 대표 이미지`} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    </div>
                    <div className="catalog-product-copy">
                      <div className="catalog-product-title">
                        <span className={`product-state-badge ${statusOf(product)}`}>{statusLabel(product)}</span>
                        <h3>{product.name}</h3>
                      </div>
                      <p>{[product.curator, product.eventName, product.option].filter(Boolean).join(' · ') || '운영 문맥 미입력'}</p>
                      <div className="catalog-product-meta">
                        <span>{formatPrice(product.salePrice)}</span>
                        {product.discountLabel && <span>{product.discountLabel}</span>}
                        <span>상세 이미지 {product.detailImageUrls.length}개</span>
                        <span>rev.{product.revision ?? '?'}</span>
                      </div>
                      <small>{product.productId}</small>
                    </div>
                    <div className="catalog-product-actions">
                      <button className="button button-ghost" type="button" onClick={() => openEdit(product)} disabled={saving || Boolean(busyAction)}>편집</button>
                      {product.isActive && !product.archivedAt ? (
                        <button
                          ref={(node) => {
                            if (node) productActionRefs.current.set(product.productId, node);
                            else productActionRefs.current.delete(product.productId);
                          }}
                          className="button button-secondary"
                          type="button"
                          onClick={() => void deactivateProduct(product)}
                          disabled={saving || Boolean(busyAction)}
                        >
                          {currentAction ?? '비활성화'}
                        </button>
                      ) : (
                        <button
                          ref={(node) => {
                            if (node) productActionRefs.current.set(product.productId, node);
                            else productActionRefs.current.delete(product.productId);
                          }}
                          className="button button-primary"
                          type="button"
                          onClick={(event) => openActivation(product, event.currentTarget)}
                          disabled={saving || Boolean(busyAction)}
                        >
                          {currentAction ?? (product.archivedAt ? '복구 및 활성화' : '검수 후 활성화')}
                        </button>
                      )}
                      {!product.archivedAt && (
                        <button
                          className="product-archive-button"
                          type="button"
                          onClick={(event) => {
                            dialogTriggerRef.current = event.currentTarget;
                            dialogReturnProductIdRef.current = product.productId;
                            setDialogError(null);
                            setArchiveTarget(product);
                          }}
                          disabled={saving || Boolean(busyAction)}
                        >
                          보관
                        </button>
                      )}
                    </div>
                    <div className="catalog-product-footnote">
                      <span>최근 변경 {formatDate(product.updatedAt)}</span>
                      {product.assetVerifiedAt && <span>기술 검증 {formatDate(product.assetVerifiedAt)}</span>}
                      {(product.activationReviewNote || product.assetReviewNote) && <span>검수 메모: {product.activationReviewNote || product.assetReviewNote}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {editorMode && (
          <form className="panel product-editor" onSubmit={saveProduct} noValidate>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editorMode === 'create' ? 'NEW PRODUCT' : 'EDIT PRODUCT'}</p>
                <h2>{editorMode === 'create' ? '상품 등록' : '상품 정보 편집'}</h2>
                <p>{editorMode === 'create' ? '신규 상품은 항상 검수 대기로 저장됩니다.' : '수정하면 안전을 위해 자동 비활성화됩니다.'}</p>
              </div>
              <button className="editor-close" type="button" onClick={closeEditor} aria-label="상품 편집 닫기" disabled={saving}>×</button>
            </div>

            <fieldset className="product-editor-fieldset" disabled={saving}>
            {editorError && <div className="inline-alert product-editor-error" role="alert"><span>{editorError}</span></div>}

            {conflictDraft && (
              <div className="product-policy-banner" role="status">
                <strong>이전 입력은 자동 적용하지 않았습니다</strong>
                <p>최신 서버 revision을 기준으로 다시 시작했습니다. 이전 입력을 되돌리면 저장 전 변경사항으로 다시 표시됩니다.</p>
                <div className="inline-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setForm({
                        ...conflictDraft,
                        productId: editingProduct?.productId ?? conflictDraft.productId,
                      });
                      setConflictDraft(null);
                      setEditorError(
                        '이전 입력을 최신 서버 revision 위에 명시적으로 다시 적용했습니다. 차이를 확인한 뒤 저장해 주세요.',
                      );
                    }}
                  >
                    이전 입력 다시 적용
                  </button>
                  <button
                    className="button button-ghost"
                    type="button"
                    onClick={() => setConflictDraft(null)}
                  >
                    최신 서버 내용 유지
                  </button>
                </div>
              </div>
            )}

            {editorMode === 'create' && (
              <details className="product-json-import">
                <summary>상품 JSON 불러오기 <small>선택 사항</small></summary>
                <p>상품 객체 한 개를 붙여 넣으면 알려진 필드만 채웁니다. 저장과 활성화는 자동으로 실행되지 않습니다.</p>
                <textarea value={jsonImport} onChange={(event) => setJsonImport(event.target.value)} rows={5} placeholder={'{"name":"상품명","image_url":"https://..."}'} />
                <div className="json-import-actions">
                  <button className="button button-secondary" type="button" onClick={importProductJson} disabled={!jsonImport.trim()}>필드 불러오기</button>
                  {jsonImportMessage && <span role="status">{jsonImportMessage}</span>}
                </div>
              </details>
            )}

            <section className="product-editor-section" aria-labelledby="product-basic-title">
              <div className="product-editor-section-heading"><span>1</span><div><h3 id="product-basic-title">기본 정보</h3><p>생성 기록과 운영 목록에서 상품을 식별하는 정보입니다.</p></div></div>
              <div className="form-grid">
                <label className="form-field full">
                  <span>상품명 *</span>
                  <input ref={nameInputRef} value={form.name} onChange={(event) => changeForm('name', event.target.value)} maxLength={200} required aria-invalid={Boolean(formErrors.name)} />
                  {formErrors.name && <small className="field-error">{formErrors.name}</small>}
                </label>
                <label className="form-field">
                  <span>브랜드 / 큐레이터</span>
                  <input value={form.curator} onChange={(event) => changeForm('curator', event.target.value)} maxLength={120} placeholder="예: 비니맘마" />
                </label>
                <label className="form-field">
                  <span>공구 / 이벤트명</span>
                  <input value={form.eventName} onChange={(event) => changeForm('eventName', event.target.value)} maxLength={200} />
                </label>
                <label className="form-field">
                  <span>상품 옵션</span>
                  <input value={form.option} onChange={(event) => changeForm('option', event.target.value)} maxLength={160} placeholder="예: 기본 옵션" />
                </label>
                <label className="form-field">
                  <span>판매가</span>
                  <input type="number" min="0" step="1" inputMode="numeric" value={form.salePrice} onChange={(event) => changeForm('salePrice', event.target.value)} aria-invalid={Boolean(formErrors.salePrice)} />
                  {formErrors.salePrice && <small className="field-error">{formErrors.salePrice}</small>}
                </label>
                <label className="form-field">
                  <span>할인 표시</span>
                  <input value={form.discountLabel} onChange={(event) => changeForm('discountLabel', event.target.value)} maxLength={80} placeholder="예: 20% 할인" />
                </label>
                <label className="form-field">
                  <span>카테고리</span>
                  <input value={form.categoryGroups} onChange={(event) => changeForm('categoryGroups', event.target.value)} placeholder="쉼표로 구분" />
                </label>
                <label className="form-field">
                  <span>상품 ID</span>
                  <input value={form.productId} onChange={(event) => changeForm('productId', event.target.value)} disabled={editorMode === 'edit'} placeholder="비우면 자동 생성" />
                  {formErrors.productId && <small className="field-error">{formErrors.productId}</small>}
                </label>
                <label className="form-field">
                  <span>이벤트 ID</span>
                  <input value={form.eventId} onChange={(event) => changeForm('eventId', event.target.value)} />
                </label>
              </div>
            </section>

            <section className="product-editor-section" aria-labelledby="product-assets-title">
              <div className="product-editor-section-heading"><span>2</span><div><h3 id="product-assets-title">이미지 자산</h3><p>공개 HTTPS 원본을 사용합니다. 저장 시 다운로드 가능 여부와 기술 규격을 확인합니다.</p></div></div>
              <div className="product-primary-preview">
                {previewUrl
                  ? <img src={previewUrl} alt="입력한 대표 이미지 미리보기" referrerPolicy="no-referrer" />
                  : <div><span aria-hidden="true">IMG</span><small>유효한 HTTPS URL을 입력하면 미리보기가 표시됩니다.</small></div>}
              </div>
              <label className="form-field">
                <span>대표 이미지 URL *</span>
                <input type="url" value={form.imageUrl} onChange={(event) => changeForm('imageUrl', event.target.value)} placeholder="https://..." required aria-invalid={Boolean(formErrors.imageUrl)} />
                {formErrors.imageUrl && <small className="field-error">{formErrors.imageUrl}</small>}
              </label>
              <label className="form-field">
                <span>상세 이미지 URL <small>줄바꿈 또는 쉼표 구분 · 최대 8개</small></span>
                <textarea value={form.detailImageUrls} onChange={(event) => changeForm('detailImageUrls', event.target.value)} rows={4} placeholder={'https://...\nhttps://...'} aria-invalid={Boolean(formErrors.detailImageUrls)} />
                {formErrors.detailImageUrls && <small className="field-error">{formErrors.detailImageUrls}</small>}
              </label>
              <label className="form-field">
                <span>정사각 이미지 처리</span>
                <select value={form.squareOutputStrategy} onChange={(event) => changeForm('squareOutputStrategy', event.target.value as ProductFormState['squareOutputStrategy'])}>
                  <option value="center_crop">중앙 크롭 허용</option>
                  <option value="reject">정사각 이미지는 거부</option>
                </select>
              </label>
            </section>

            <section className="product-editor-section" aria-labelledby="product-context-title">
              <div className="product-editor-section-heading"><span>3</span><div><h3 id="product-context-title">광고 문맥과 검수 메모</h3><p>생성 모델이 추측하지 않도록 확인된 사실만 입력합니다.</p></div></div>
              <label className="form-field">
                <span>핵심 판매 포인트</span>
                <textarea value={form.sellingPoint} onChange={(event) => changeForm('sellingPoint', event.target.value)} rows={4} maxLength={1500} placeholder="소재에서 강조할 검증된 특징과 효익" />
              </label>
              <label className="form-field">
                <span>자산 검수 준비 메모</span>
                <textarea value={form.assetReviewNote} onChange={(event) => changeForm('assetReviewNote', event.target.value)} rows={3} maxLength={1000} placeholder="예: 대표 단품 이미지. 묶음 수량은 영상에서 주장하지 않음." />
              </label>
              <p className="product-semantic-warning"><strong>운영자 확인 필요</strong> 기술 검증 통과는 이미지가 실제 광고 상품·옵션·수량과 일치한다는 뜻이 아닙니다. 활성화 단계에서 직접 확인하고 검수 근거를 남겨 주세요.</p>
            </section>

            <div className="product-editor-actions">
              <button className="button button-ghost" type="button" onClick={closeEditor} disabled={saving}>취소</button>
              <button className="button button-primary" type="submit" disabled={saving}>{saving ? '기술 검증 및 저장 중…' : editorMode === 'create' ? '검수 대기로 저장' : '변경 저장 후 비활성화'}</button>
            </div>
            </fieldset>
          </form>
        )}
      </div>

      {activationTarget && (
        <div className="product-dialog-backdrop" role="presentation">
          <section ref={dialogRef} className="panel product-dialog" role="dialog" aria-modal="true" aria-labelledby="activation-dialog-title">
            <div className="product-dialog-heading">
              <div><p className="eyebrow">MANUAL ASSET REVIEW</p><h2 id="activation-dialog-title">{activationTarget.archivedAt ? '상품 복구 및 활성화' : '자산 검수 후 활성화'}</h2></div>
              <button className="editor-close" type="button" aria-label="활성화 창 닫기" onClick={() => setActivationTarget(null)} disabled={Boolean(busyAction)}>×</button>
            </div>
            <div className="activation-product-summary">
              <img src={activationTarget.imageUrl} alt={`${activationTarget.name} 검수 이미지`} referrerPolicy="no-referrer" />
              <div><strong>{activationTarget.name}</strong><span>{activationTarget.curator || '브랜드 미입력'} · rev.{activationTarget.revision ?? '?'}</span><small>{activationTarget.productId}</small></div>
            </div>
            <ul className="activation-checklist">
              <li>이미지가 실제 광고 상품과 동일한 제품·옵션인지 확인했습니다.</li>
              <li>묶음 수량, 라벨, 할인과 효능 문구가 오해를 만들지 않는지 확인했습니다.</li>
              <li>보이지 않는 정보는 영상에서 사실처럼 주장하지 않도록 메모했습니다.</li>
            </ul>
            {dialogError && <div className="inline-alert product-dialog-error" role="alert"><span>{dialogError}</span></div>}
            <label className="form-field">
              <span>검수 근거 *</span>
              <textarea value={activationNote} onChange={(event) => setActivationNote(event.target.value)} rows={4} maxLength={1000} placeholder="확인한 자산과 제한할 광고 주장을 구체적으로 기록" required />
            </label>
            <label className="activation-acknowledgement">
              <input type="checkbox" checked={activationAcknowledged} onChange={(event) => setActivationAcknowledged(event.target.checked)} />
              <span>위 이미지를 직접 확인했으며, 기술 검증과 의미 검수가 서로 다름을 이해했습니다.</span>
            </label>
            <div className="product-dialog-actions">
              <button className="button button-ghost" type="button" onClick={() => setActivationTarget(null)} disabled={Boolean(busyAction)}>나중에</button>
              <button className="button button-primary" type="button" onClick={() => void activateProduct()} disabled={Boolean(busyAction) || !activationAcknowledged || !activationNote.trim() || activationTarget.revision == null}>{busyAction?.productId === activationTarget.productId ? `${busyAction.label} 중…` : activationTarget.archivedAt ? '복구하고 활성화' : '검수 기록 후 활성화'}</button>
            </div>
          </section>
        </div>
      )}

      {archiveTarget && (
        <div className="product-dialog-backdrop" role="presentation">
          <section ref={dialogRef} className="panel product-dialog compact-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-dialog-title">
            <div className="product-dialog-heading"><div><p className="eyebrow danger-eyebrow">ARCHIVE PRODUCT</p><h2 id="archive-dialog-title">상품을 보관할까요?</h2></div></div>
            <p className="dialog-description"><strong>{archiveTarget.name}</strong>은 새 영상 만들기 목록에서 제외됩니다. 기존 영상 기록은 유지되며, 나중에 자산을 다시 검수하고 복구할 수 있습니다.</p>
            {dialogError && <div className="inline-alert product-dialog-error" role="alert"><span>{dialogError}</span></div>}
            <div className="product-dialog-actions">
              <button className="button button-ghost" type="button" onClick={() => setArchiveTarget(null)} disabled={Boolean(busyAction)}>취소</button>
              <button className="button product-danger-button" type="button" onClick={() => void archiveProduct()} disabled={Boolean(busyAction) || archiveTarget.revision == null}>{busyAction?.productId === archiveTarget.productId ? '보관 중…' : '상품 보관'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
