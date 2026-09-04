import type { Product } from '../types/reels';

export const PRODUCTION_ASSET_AUDIT = {
  auditedAt: '2026-09-04T04:31:25.855458+00:00',
  policy: {
    providerReadyFormats: ['jpeg', 'png', 'webp'],
    minimumEdgePx: 512,
    maximumAspectRatio: 4,
    maximumProviderBytes: 15_728_640,
    requiresHttps: true,
    animatedImages: 'normalize-to-one-still-frame',
    semanticRequirement:
      'primary image must show the exact advertised base product without misleading variants',
    representativeUnitPolicy:
      'a single exact unit is allowed only when the generated video suppresses pack-count claims',
  },
  auditedProductCount: 154,
  technicallyEligibleProductCount: 22,
  semanticAuditedAt: '2026-09-04',
  semanticallyExactProductCount: 0,
  representativeUnitEligibleProductCount: 1,
} as const;

export interface ProductionProductAssets {
  primaryUrl: string;
  detailUrls: readonly string[];
}

// Strict semantic and provider allowlist. Technically valid products are
// excluded when the reference is ambiguous, regulated, or provider-blocked.
export const PRODUCTION_PRODUCT_ASSETS = new Map<string, ProductionProductAssets>([
  [
    'c82e2ff2-77a5-4ce8-86f1-09716d197724',
    {
      primaryUrl:
        'https://shop-phinf.pstatic.net/20250212_206/1739326199167opdwT_JPEG/578477270082277_556925135.jpg?type=o1000',
      detailUrls: [],
    },
  ],
]);

const APPLE_JUICE_ID = 'c82e2ff2-77a5-4ce8-86f1-09716d197724';
const appleJuiceAssets = PRODUCTION_PRODUCT_ASSETS.get(APPLE_JUICE_ID);

// Keep this client-bound module independent from events.json/extra-events.json.
// Importing those files from the `use client` page would put the full internal
// catalog in the browser module graph even though the UI ultimately filters it.
export const PRODUCTION_PRODUCTS: Product[] = appleJuiceAssets
  ? [
      {
        eventId: 'ed53a658-2577-4c66-a190-77d1e007f96c',
        eventName: '비니맘마 X 착즙하는남자',
        curator: '비니맘마',
        productId: APPLE_JUICE_ID,
        name: '착남 사과주스(스파우트) 30포',
        option: '기본 옵션',
        salePrice: 22_000,
        discountLabel: '60% 할인',
        imageUrl: appleJuiceAssets.primaryUrl,
        squareOutputStrategy: 'center_crop',
        rawProduct: {
          product_id: APPLE_JUICE_ID,
          name: '착남 사과주스(스파우트) 30포',
          image_url: appleJuiceAssets.primaryUrl,
          detail_image_urls: [],
          category_group: ['유아 식품'],
          selling_point:
            '사과주스를 담은 스파우트 파우치 대표 단품 이미지',
        },
      },
    ]
  : [];
