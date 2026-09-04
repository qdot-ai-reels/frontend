import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductRequest,
  isProductAvailableForGeneration,
  normalizeCatalogProduct,
  normalizeHttpsProductImageUrl,
  normalizeProductCatalog,
  validateProductInput,
} from '../lib/product-catalog.ts';
import { studioApi } from '../lib/studio-api.ts';
import { productCatalogApi } from '../lib/product-catalog-api.ts';
import type { StartGenerationInput } from '../types/studio.ts';

const input = {
  productId: 'product-1',
  eventId: 'event-1',
  eventName: '가을 공구',
  curator: '테스트 브랜드',
  name: '테스트 상품',
  option: '기본 옵션',
  salePrice: 22000,
  discountLabel: '20% 할인',
  imageUrl: 'https://cdn.example.com/product.jpg',
  detailImageUrls: [
    'https://cdn.example.com/detail-1.jpg',
    'https://cdn.example.com/detail-1.jpg',
  ],
  squareOutputStrategy: 'center_crop' as const,
  categoryGroups: ['식품', '식품'],
  sellingPoint: '확인된 판매 포인트',
  assetReviewNote: '수량 문구는 사용하지 않음',
};

test('normalizes the backend product contract and preserves catalog revision in raw context', () => {
  const product = normalizeCatalogProduct({
    product_id: 'product-1',
    event_id: 'event-1',
    event_name: '가을 공구',
    curator: '테스트 브랜드',
    name: '테스트 상품',
    option: '기본 옵션',
    sale_price: 22000,
    discount_label: '20% 할인',
    image_url: 'https://cdn.example.com/product.jpg',
    detail_image_urls: ['https://cdn.example.com/detail.jpg'],
    square_output_strategy: 'center_crop',
    is_active: true,
    archived_at: null,
    revision: 7,
    raw_product: {
      product_id: 'product-1',
      catalog_revision: 7,
      category_group: ['식품'],
      selling_point: '검증된 설명',
    },
  });

  assert.ok(product);
  assert.equal(product.revision, 7);
  assert.equal(product.rawProduct.catalog_revision, 7);
  assert.deepEqual(product.categoryGroups, ['식품']);
  assert.equal(product.sellingPoint, '검증된 설명');
  assert.equal(isProductAvailableForGeneration(product), true);
});

test('never treats an archived record as generation-active', () => {
  const product = normalizeCatalogProduct({
    product_id: 'product-1',
    name: '테스트 상품',
    image_url: 'https://cdn.example.com/product.jpg',
    is_active: true,
    archived_at: '2026-09-04T00:00:00Z',
    revision: 8,
  });

  assert.ok(product);
  assert.equal(product.isActive, false);
  assert.equal(isProductAvailableForGeneration(product), false);
});

test('fails closed unless active is the boolean true and revision is a positive integer', () => {
  const base = {
    product_id: 'product-1',
    name: '테스트 상품',
    image_url: 'https://cdn.example.com/product.jpg',
    archived_at: null,
  };
  const missingActive = normalizeCatalogProduct({ ...base, revision: 1 });
  const stringActive = normalizeCatalogProduct({ ...base, is_active: 'true', revision: 1 });
  const zeroRevision = normalizeCatalogProduct({ ...base, is_active: true, revision: 0 });
  const fractionalRevision = normalizeCatalogProduct({ ...base, is_active: true, revision: 1.5 });
  const numericStringRevision = normalizeCatalogProduct({ ...base, is_active: true, revision: '2' });
  const valid = normalizeCatalogProduct({ ...base, is_active: true, revision: 2 });

  assert.ok(missingActive && stringActive && zeroRevision && fractionalRevision && numericStringRevision && valid);
  assert.equal(missingActive.isActive, false);
  assert.equal(stringActive.isActive, false);
  assert.equal(zeroRevision.revision, null);
  assert.equal(fractionalRevision.revision, null);
  assert.equal(numericStringRevision.revision, null);
  assert.equal(isProductAvailableForGeneration(missingActive), false);
  assert.equal(isProductAvailableForGeneration(stringActive), false);
  assert.equal(isProductAvailableForGeneration(zeroRevision), false);
  assert.equal(isProductAvailableForGeneration(fractionalRevision), false);
  assert.equal(isProductAvailableForGeneration(numericStringRevision), false);
  assert.equal(isProductAvailableForGeneration(valid), true);
});

test('filters malformed records instead of exposing unsafe image schemes', () => {
  const catalog = normalizeProductCatalog({
    total: 2,
    active_count: 1,
    items: [
      {
        product_id: 'safe',
        name: '안전 상품',
        image_url: 'https://cdn.example.com/safe.jpg',
        revision: 1,
      },
      {
        product_id: 'unsafe',
        name: '위험 상품',
        image_url: 'javascript:alert(1)',
        revision: 1,
      },
    ],
  });

  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.items[0].productId, 'safe');
  assert.equal(catalog.total, 2);
  assert.equal(normalizeHttpsProductImageUrl('http://cdn.example.com/a.jpg'), null);
  assert.equal(normalizeHttpsProductImageUrl('https://user:secret@cdn.example.com/a.jpg'), null);
});

test('builds an inactive create request and cannot activate through update payloads', () => {
  const createBody = buildProductRequest(input, { includeProductId: true });
  const updateBody = buildProductRequest(
    { ...input, rawProduct: { catalog_revision: 3, source: 'fixture' } },
    { includeProductId: false },
  );

  assert.equal(createBody.product_id, 'product-1');
  assert.equal(createBody.is_active, false);
  assert.equal(updateBody.product_id, undefined);
  assert.equal(updateBody.is_active, undefined);
  assert.deepEqual(updateBody.detail_image_urls, ['https://cdn.example.com/detail-1.jpg']);
  assert.equal((updateBody.raw_product as Record<string, unknown>).catalog_revision, 3);
  assert.equal((updateBody.raw_product as Record<string, unknown>).source, 'fixture');
});

test('validates production HTTPS assets and the eight-detail-image limit', () => {
  assert.equal(validateProductInput(input).valid, true);
  assert.equal(validateProductInput({ ...input, name: '' }).errors.name, '상품명을 입력해 주세요.');
  assert.ok(validateProductInput({ ...input, imageUrl: 'http://cdn.example.com/a.jpg' }).errors.imageUrl);
  assert.ok(
    validateProductInput({
      ...input,
      detailImageUrls: Array.from(
        { length: 9 },
        (_, index) => `https://cdn.example.com/${index}.jpg`,
      ),
    }).errors.detailImageUrls,
  );
});

test('emits the authoritative product revision and fails closed when it is missing', () => {
  const product = normalizeCatalogProduct({
    product_id: 'product-1',
    name: '테스트 상품',
    image_url: 'https://cdn.example.com/product.jpg',
    is_active: true,
    revision: 9,
    raw_product: { product_id: 'product-1', catalog_revision: 9 },
  });
  assert.ok(product);
  const generationInput: StartGenerationInput = {
    product,
    template: {
      id: 'ugc_quick_4',
      version: '1',
      name: '4초 초압축',
      shortName: 'Quick Hook',
      description: '',
      durationSeconds: 4,
      scenes: [],
      supported: true,
      unavailableReason: null,
    },
    visualMode: 'product_only',
    influencerImageUrls: [],
    outputCount: 1,
    cta: '지금 확인하세요',
    advertisingPurpose: '전환',
    channel: 'Instagram Reels',
    mustInclude: '',
    mustExclude: '',
    extraDetails: '',
    promptVersionId: 'prompt-1',
    quoteId: 'quote-1',
    clientRequestId: 'request-1',
  };

  const body = studioApi.prepareGenerationRequest(generationInput);
  assert.equal(body.product_catalog_revision, 9);
  assert.equal((body.product as Record<string, unknown>).catalog_revision, 9);
  assert.throws(
    () => studioApi.prepareGenerationRequest({
      ...generationInput,
      product: { ...product, revision: null },
    }),
    /catalog revision/,
  );
  assert.throws(
    () => studioApi.prepareGenerationRequest({
      ...generationInput,
      product: { ...product, isActive: false },
    }),
    /활성 상품/,
  );
});

test('sends revision-guarded product state mutations with the exact backend contract', async (context) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (inputValue, init) => {
    calls.push({ url: String(inputValue), init });
    return new Response(JSON.stringify({
      product_id: 'product-1',
      name: '테스트 상품',
      image_url: 'https://cdn.example.com/product.jpg',
      is_active: true,
      revision: 11,
      raw_product: { product_id: 'product-1', catalog_revision: 11 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await productCatalogApi.activateProduct('product-1', {
    expectedRevision: 10,
    assetReviewAcknowledged: true,
    reviewNote: '실제 단품 이미지와 옵션을 확인함',
  });
  await productCatalogApi.deactivateProduct('product-1', 11);
  await productCatalogApi.archiveProduct('product-1', 12);

  assert.match(calls[0].url, /\/products\/product-1\/activate$/);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    asset_review_acknowledged: true,
    review_note: '실제 단품 이미지와 옵션을 확인함',
    expected_revision: 10,
  });
  assert.match(calls[1].url, /\/products\/product-1\/deactivate$/);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { expected_revision: 11 });
  assert.match(calls[2].url, /\/products\/product-1\?expected_revision=12$/);
  assert.equal(calls[2].init?.method, 'DELETE');
});
