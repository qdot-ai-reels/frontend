'use client';

import { useEffect } from 'react';

import { RouteErrorState } from '@/components/route-state';

export default function JobError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  return <RouteErrorState description="작업 상태를 다시 확인해 주세요." onRetry={unstable_retry} />;
}
