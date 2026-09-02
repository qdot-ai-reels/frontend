import rawEventData from './events.json';
import extraEventData from './extra-events.json';

import type { Product } from '../types/reels';

interface QuedotProduct extends Record<string, unknown> {
  product_id: string;
  name: string;
  image_url?: string | null;
  option1?: string | null;
  option2?: string | null;
  base_sale_price?: number | null;
  lowest_price?: number | null;
  consumer_price?: number | null;
  discount_rate_derived?: number | null;
}

interface QuedotEvent {
  event_id: string;
  event_name: string;
  curator?: {
    nickname?: string | null;
  } | null;
  products?: QuedotProduct[];
}

interface QuedotEventData {
  events?: QuedotEvent[];
}

const placeholderImage = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
      <rect width="720" height="720" fill="#e7eaf0"/>
      <rect x="210" y="130" width="300" height="460" rx="42" fill="#ffffff" opacity="0.92"/>
      <text x="360" y="365" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="700" fill="#172033">${label.slice(0, 12)}</text>
    </svg>
  `)}`;

const toNumber = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const eventData = rawEventData as QuedotEventData;
const additionalEventData = extraEventData as QuedotEventData;

const allEvents = [
  ...(eventData.events ?? []),
  ...(additionalEventData.events ?? []),
];

export const PRODUCTS: Product[] = allEvents.flatMap((event) =>
  (event.products ?? []).map((product) => {
    const discountRate = toNumber(product.discount_rate_derived);

    return {
      eventId: event.event_id,
      eventName: event.event_name,
      curator: event.curator?.nickname?.trim() || '큐닷',
      productId: product.product_id,
      name: product.name,
      option: product.option1?.trim() || product.option2?.trim() || '기본 옵션',
      salePrice: toNumber(
        product.base_sale_price ?? product.lowest_price ?? product.consumer_price,
      ),
      discountLabel: discountRate > 0 ? `${discountRate}% 할인` : '공동구매가',
      imageUrl: product.image_url?.trim() || placeholderImage(product.name),
      rawProduct: product,
    };
  }),
);
