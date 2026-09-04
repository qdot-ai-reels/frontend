'use client';

import { useEffect } from 'react';

import { RouteErrorState } from '@/components/route-state';

export default function VideosError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  return <RouteErrorState description="잠시 후 다시 시도해 주세요." onRetry={unstable_retry} />;
}
