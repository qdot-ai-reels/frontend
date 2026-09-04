'use client';

import { useEffect } from 'react';

import { RouteErrorState } from '@/components/route-state';

export default function PromptSettingsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  return (
    <RouteErrorState
      description="프롬프트 설정 화면을 다시 불러와 주세요."
      onRetry={unstable_retry}
    />
  );
}
