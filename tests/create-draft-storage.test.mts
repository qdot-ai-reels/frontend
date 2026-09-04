import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStoredCreateDraft,
  serializeCreateDraft,
} from '../lib/create-draft-storage.ts';
import { normalizeCatalogProduct } from '../lib/product-catalog.ts';
import type { CreateDraft } from '../types/studio.ts';

function testDraft(): CreateDraft {
  const product = normalizeCatalogProduct({
    product_id: 'product-1',
    name: '테스트 상품',
    image_url: 'https://cdn.example.com/product.jpg',
    is_active: true,
    archived_at: null,
    revision: 7,
    raw_product: { product_id: 'product-1', catalog_revision: 7 },
  });
  assert.ok(product);
  return {
    product,
    template: {
      id: 'ugc_full_15',
      version: '3',
      name: '15초 풀 구성',
      shortName: 'Full',
      description: '',
      durationSeconds: 15,
      scenes: [],
      supported: true,
      unavailableReason: null,
    },
    visualMode: 'model_included',
    influencerImageUrls: [
      'https://cdn.example.com/model-1.jpg',
      'https://cdn.example.com/model-2.jpg',
    ],
    outputCount: 3,
    cta: '지금 확인하세요',
    advertisingPurpose: '공동구매 전환',
    channel: 'Instagram Reels',
    mustInclude: '제품 실물',
    mustExclude: '검증되지 않은 효능',
    extraDetails: '밝은 주방 분위기',
    promptVersionId: 'prompt-current',
  };
}

test('round-trips creative inputs while storing only catalog/template identities', () => {
  const savedAt = '2026-09-04T03:00:00.000Z';
  const serialized = serializeCreateDraft(testDraft(), 'creative', savedAt);
  const stored = parseStoredCreateDraft(serialized);

  assert.deepEqual(stored, {
    schemaVersion: 1,
    savedAt,
    step: 'creative',
    productId: 'product-1',
    productRevision: 7,
    templateId: 'ugc_full_15',
    templateVersion: '3',
    visualMode: 'model_included',
    influencerImageUrls: [
      'https://cdn.example.com/model-1.jpg',
      'https://cdn.example.com/model-2.jpg',
    ],
    outputCount: 3,
    cta: '지금 확인하세요',
    advertisingPurpose: '공동구매 전환',
    channel: 'Instagram Reels',
    mustInclude: '제품 실물',
    mustExclude: '검증되지 않은 효능',
    extraDetails: '밝은 주방 분위기',
  });
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(raw.product, undefined);
  assert.equal(raw.rawProduct, undefined);
  assert.equal(raw.promptVersionId, undefined);
});

test('rejects malformed identity pairs and non-positive catalog revisions', () => {
  const valid = JSON.parse(
    serializeCreateDraft(testDraft(), 'review', '2026-09-04T03:00:00.000Z'),
  ) as Record<string, unknown>;

  assert.equal(
    parseStoredCreateDraft(JSON.stringify({ ...valid, productRevision: 0 })),
    null,
  );
  assert.equal(
    parseStoredCreateDraft(JSON.stringify({ ...valid, productRevision: '7' })),
    null,
  );
  assert.equal(
    parseStoredCreateDraft(JSON.stringify({ ...valid, productId: null })),
    null,
  );
  assert.equal(
    parseStoredCreateDraft(JSON.stringify({ ...valid, templateVersion: null })),
    null,
  );
});

test('allows a product-free recovery draft so creative inputs survive stale catalog data', () => {
  const draft = { ...testDraft(), product: null };
  const stored = parseStoredCreateDraft(
    serializeCreateDraft(draft, 'product', '2026-09-04T03:00:00.000Z'),
  );

  assert.ok(stored);
  assert.equal(stored.productId, null);
  assert.equal(stored.productRevision, null);
  assert.equal(stored.cta, '지금 확인하세요');
  assert.equal(stored.advertisingPurpose, '공동구매 전환');
  assert.equal(stored.extraDetails, '밝은 주방 분위기');
});
