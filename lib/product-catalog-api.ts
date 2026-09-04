import {
  buildProductRequest,
  normalizeCatalogProduct,
  normalizeProductCatalog,
  validateProductInput,
} from './product-catalog.ts';
import type {
  CatalogProduct,
  ProductActivationInput,
  ProductCatalog,
  ProductUpsertInput,
} from '@/types/product-catalog';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:8001';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function apiUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

export class ProductCatalogApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
  ) {
    super(message);
    this.name = 'ProductCatalogApiError';
    this.status = status;
    this.code = code;
  }
}

async function readError(response: Response, fallback: string): Promise<ProductCatalogApiError> {
  let message = fallback;
  let code: string | null = null;
  try {
    const payload = asRecord(await response.json());
    const detail = payload.detail;
    if (typeof detail === 'string' && detail.trim()) {
      message = detail.trim();
    } else {
      const detailRecord = asRecord(detail);
      const rawMessage = detailRecord.message ?? payload.message ?? payload.error;
      if (typeof rawMessage === 'string' && rawMessage.trim()) message = rawMessage.trim();
      const rawCode = detailRecord.code ?? payload.code ?? payload.error_code;
      if (typeof rawCode === 'string' && rawCode.trim()) code = rawCode.trim();
    }
  } catch {
    // Keep the stable Korean fallback for empty or non-JSON responses.
  }
  return new ProductCatalogApiError(message, response.status, code);
}

async function readProduct(response: Response): Promise<CatalogProduct> {
  const payload: unknown = await response.json();
  const envelope = asRecord(payload);
  const product = normalizeCatalogProduct(
    envelope.product ?? envelope.item ?? envelope.data ?? payload,
  );
  if (!product) throw new Error('서버가 저장된 상품 정보를 올바르게 반환하지 않았습니다.');
  return product;
}

function validateBeforeSave(input: ProductUpsertInput): void {
  const validation = validateProductInput(input);
  if (!validation.valid) {
    throw new Error(Object.values(validation.errors)[0] ?? '상품 정보를 확인해 주세요.');
  }
}

export const productCatalogApi = {
  async listProducts(
    options: { includeInactive?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<ProductCatalog> {
    const params = new URLSearchParams();
    if (options.includeInactive) params.set('include_inactive', 'true');
    const suffix = params.size ? `?${params.toString()}` : '';
    const response = await fetch(apiUrl(`/api/v1/reels/products${suffix}`), {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw await readError(response, '상품 목록을 불러오지 못했습니다.');
    return normalizeProductCatalog(await response.json());
  },

  async createProduct(
    input: ProductUpsertInput,
    signal?: AbortSignal,
  ): Promise<CatalogProduct> {
    validateBeforeSave(input);
    const response = await fetch(apiUrl('/api/v1/reels/products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(buildProductRequest(input, { includeProductId: true })),
    });
    if (!response.ok) throw await readError(response, '상품을 저장하지 못했습니다.');
    return readProduct(response);
  },

  async updateProduct(
    productId: string,
    input: ProductUpsertInput,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<CatalogProduct> {
    validateBeforeSave(input);
    const response = await fetch(
      apiUrl(`/api/v1/reels/products/${encodeURIComponent(productId)}`),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          ...buildProductRequest(input, { includeProductId: false }),
          expected_revision: expectedRevision,
        }),
      },
    );
    if (!response.ok) throw await readError(response, '상품 변경을 저장하지 못했습니다.');
    return readProduct(response);
  },

  async activateProduct(
    productId: string,
    input: ProductActivationInput,
    signal?: AbortSignal,
  ): Promise<CatalogProduct> {
    const response = await fetch(
      apiUrl(`/api/v1/reels/products/${encodeURIComponent(productId)}/activate`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          asset_review_acknowledged: input.assetReviewAcknowledged,
          review_note: input.reviewNote.trim(),
          expected_revision: input.expectedRevision,
        }),
      },
    );
    if (!response.ok) throw await readError(response, '상품을 활성화하지 못했습니다.');
    return readProduct(response);
  },

  async deactivateProduct(
    productId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<CatalogProduct> {
    const response = await fetch(
      apiUrl(`/api/v1/reels/products/${encodeURIComponent(productId)}/deactivate`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ expected_revision: expectedRevision }),
      },
    );
    if (!response.ok) throw await readError(response, '상품을 비활성화하지 못했습니다.');
    return readProduct(response);
  },

  async archiveProduct(
    productId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<CatalogProduct> {
    const response = await fetch(
      apiUrl(
        `/api/v1/reels/products/${encodeURIComponent(productId)}?expected_revision=${encodeURIComponent(String(expectedRevision))}`,
      ),
      { method: 'DELETE', signal },
    );
    if (!response.ok) throw await readError(response, '상품을 보관하지 못했습니다.');
    return readProduct(response);
  },
};
