import type {
  CatalogProduct,
  ProductCatalog,
  ProductDraftValidation,
  ProductSquareOutputStrategy,
  ProductUpsertInput,
} from '@/types/product-catalog';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized || null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function asStringArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : [];
  return [...new Set(values.map(asString).filter(Boolean))];
}

function squareStrategy(value: unknown): ProductSquareOutputStrategy {
  return value === 'reject' ? 'reject' : 'center_crop';
}

export function normalizeHttpsProductImageUrl(value: unknown): string | null {
  const candidate = asString(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeCatalogProduct(value: unknown): CatalogProduct | null {
  const item = asRecord(value);
  const raw = asRecord(firstDefined(item.raw_product, item.rawProduct));
  const productId = asString(firstDefined(item.product_id, item.productId, item.id, raw.product_id));
  const name = asString(firstDefined(item.name, raw.name));
  const imageUrl = normalizeHttpsProductImageUrl(
    firstDefined(item.image_url, item.imageUrl, raw.image_url),
  );
  if (!productId || !name || !imageUrl) return null;

  const detailImageUrls = asStringArray(
    firstDefined(item.detail_image_urls, item.detailImageUrls, raw.detail_image_urls),
  )
    .map(normalizeHttpsProductImageUrl)
    .filter((url): url is string => Boolean(url));
  const categoryGroups = asStringArray(
    firstDefined(item.category_group, item.categoryGroups, raw.category_group),
  );
  const archivedAt = asNullableString(firstDefined(item.archived_at, item.archivedAt));
  const responseActive = firstDefined(item.is_active, item.isActive);
  const isActive = archivedAt ? false : responseActive === true;
  const responseRevision = firstDefined(item.revision);
  const revision =
    typeof responseRevision === 'number' &&
    Number.isSafeInteger(responseRevision) &&
    responseRevision > 0
      ? responseRevision
      : null;
  const strategy = squareStrategy(
    firstDefined(item.square_output_strategy, item.squareOutputStrategy, raw.square_output_strategy),
  );

  return {
    eventId: asString(firstDefined(item.event_id, item.eventId, raw.event_id)),
    eventName: asString(firstDefined(item.event_name, item.eventName, raw.event_name)),
    curator: asString(firstDefined(item.curator, raw.curator, raw.brand)),
    productId,
    name,
    option: asString(firstDefined(item.option, raw.option)),
    salePrice: asNumber(firstDefined(item.sale_price, item.salePrice, raw.sale_price)),
    discountLabel: asString(
      firstDefined(item.discount_label, item.discountLabel, raw.discount_label),
    ),
    imageUrl,
    detailImageUrls,
    squareOutputStrategy: strategy,
    categoryGroups,
    sellingPoint: asString(firstDefined(item.selling_point, item.sellingPoint, raw.selling_point)),
    assetReviewNote: asString(
      firstDefined(item.asset_review_note, item.assetReviewNote, raw.asset_review_note),
    ),
    activationReviewNote: asString(
      firstDefined(item.activation_review_note, item.activationReviewNote),
    ),
    isActive,
    archivedAt,
    assetVerifiedAt: asNullableString(
      firstDefined(item.asset_verified_at, item.assetVerifiedAt),
    ),
    activatedAt: asNullableString(firstDefined(item.activated_at, item.activatedAt)),
    createdAt: asNullableString(firstDefined(item.created_at, item.createdAt)),
    updatedAt: asNullableString(firstDefined(item.updated_at, item.updatedAt)),
    revision,
    rawProduct: {
      ...raw,
      product_id: productId,
      name,
      image_url: imageUrl,
      detail_image_urls: detailImageUrls,
      category_group: categoryGroups,
      selling_point: asString(firstDefined(item.selling_point, item.sellingPoint, raw.selling_point)),
      asset_review_note: asString(
        firstDefined(item.asset_review_note, item.assetReviewNote, raw.asset_review_note),
      ),
      square_output_strategy: strategy,
    },
  };
}

export function normalizeProductCatalog(value: unknown): ProductCatalog {
  const envelope = asRecord(value);
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray(envelope.items)
      ? envelope.items
      : [];
  const items = rawItems
    .map(normalizeCatalogProduct)
    .filter((item): item is CatalogProduct => item !== null);
  const total = asNumber(envelope.total, items.length);
  const activeCount = asNumber(
    firstDefined(envelope.active_count, envelope.activeCount),
    items.filter((item) => item.isActive && !item.archivedAt).length,
  );
  return { items, total, activeCount };
}

export function validateProductInput(input: ProductUpsertInput): ProductDraftValidation {
  const errors: ProductDraftValidation['errors'] = {};
  if (!input.name.trim()) errors.name = '상품명을 입력해 주세요.';
  if (!normalizeHttpsProductImageUrl(input.imageUrl)) {
    errors.imageUrl = '인증 정보가 없는 공개 HTTPS 이미지 URL을 입력해 주세요.';
  }
  if (!Number.isFinite(input.salePrice) || input.salePrice < 0) {
    errors.salePrice = '판매가는 0 이상의 숫자여야 합니다.';
  }
  const detailImageUrls = [...new Set(input.detailImageUrls.map((url) => url.trim()).filter(Boolean))];
  if (detailImageUrls.length > 8) {
    errors.detailImageUrls = '상세 이미지는 최대 8개까지 등록할 수 있습니다.';
  } else if (detailImageUrls.some((url) => !normalizeHttpsProductImageUrl(url))) {
    errors.detailImageUrls = '상세 이미지도 모두 공개 HTTPS URL이어야 합니다.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildProductRequest(
  input: ProductUpsertInput,
  options: { includeProductId: boolean },
): Record<string, unknown> {
  const detailImageUrls = [
    ...new Set(
      input.detailImageUrls
        .map(normalizeHttpsProductImageUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ];
  const categoryGroups = [...new Set(input.categoryGroups.map((value) => value.trim()).filter(Boolean))];
  const imageUrl = normalizeHttpsProductImageUrl(input.imageUrl) ?? input.imageUrl.trim();
  const rawProduct = {
    ...(input.rawProduct ?? {}),
    ...(options.includeProductId && input.productId?.trim()
      ? { product_id: input.productId.trim() }
      : {}),
    name: input.name.trim(),
    image_url: imageUrl,
    detail_image_urls: detailImageUrls,
    category_group: categoryGroups,
    selling_point: input.sellingPoint.trim(),
    asset_review_note: input.assetReviewNote.trim(),
    square_output_strategy: input.squareOutputStrategy,
  };
  return {
    ...(options.includeProductId && input.productId?.trim()
      ? { product_id: input.productId.trim() }
      : {}),
    event_id: input.eventId.trim(),
    event_name: input.eventName.trim(),
    curator: input.curator.trim(),
    name: input.name.trim(),
    option: input.option.trim(),
    sale_price: input.salePrice,
    discount_label: input.discountLabel.trim(),
    image_url: imageUrl,
    detail_image_urls: detailImageUrls,
    square_output_strategy: input.squareOutputStrategy,
    raw_product: rawProduct,
    ...(options.includeProductId ? { is_active: false } : {}),
  };
}

export function isProductAvailableForGeneration(product: CatalogProduct): boolean {
  return (
    product.isActive === true &&
    product.archivedAt === null &&
    product.revision != null &&
    Number.isSafeInteger(product.revision) &&
    product.revision > 0
  );
}
