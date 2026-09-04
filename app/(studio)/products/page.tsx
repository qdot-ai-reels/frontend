import type { Metadata } from 'next';

import { ProductManager } from '@/components/product-manager';

export const metadata: Metadata = {
  title: '광고 상품 관리 | QUEDOT Shorts Studio',
};

export default function ProductsPage() {
  return <ProductManager />;
}
