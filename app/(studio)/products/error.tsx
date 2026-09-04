'use client';

import { useEffect } from 'react';

import { RouteErrorState } from '@/components/route-state';

export default function ProductsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  return (
    <RouteErrorState
      title="상품 관리 화면을 불러오지 못했습니다"
      description="화면을 다시 불러온 뒤 상품 목록을 확인해 주세요."
      onRetry={unstable_retry}
    />
  );
}
