import type { Product } from './reels';

export type ProductSquareOutputStrategy = 'reject' | 'center_crop';

export interface CatalogProduct extends Product {
  detailImageUrls: string[];
  categoryGroups: string[];
  sellingPoint: string;
  assetReviewNote: string;
  activationReviewNote: string;
  isActive: boolean;
  archivedAt: string | null;
  assetVerifiedAt: string | null;
  activatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  revision: number | null;
}

export interface ProductCatalog {
  items: CatalogProduct[];
  total: number;
  activeCount: number;
}

export interface ProductUpsertInput {
  productId?: string;
  eventId: string;
  eventName: string;
  curator: string;
  name: string;
  option: string;
  salePrice: number;
  discountLabel: string;
  imageUrl: string;
  detailImageUrls: string[];
  squareOutputStrategy: ProductSquareOutputStrategy;
  categoryGroups: string[];
  sellingPoint: string;
  assetReviewNote: string;
  rawProduct?: Record<string, unknown>;
}

export interface ProductActivationInput {
  assetReviewAcknowledged: true;
  reviewNote: string;
  expectedRevision: number;
}

export interface ProductDraftValidation {
  valid: boolean;
  errors: Partial<Record<keyof ProductUpsertInput, string>>;
}
