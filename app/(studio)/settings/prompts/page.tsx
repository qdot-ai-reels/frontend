import type { Metadata } from 'next';

import { PromptSettings } from '@/components/prompt-settings';

export const metadata: Metadata = {
  title: '프롬프트 버전 관리 | QUEDOT Shorts Studio',
};

export default function PromptSettingsPage() {
  return <PromptSettings />;
}
