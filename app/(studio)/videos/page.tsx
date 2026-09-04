import { VideoLibrary } from '@/components/video-library';
import type { GenerationFilters, StudioTemplateDuration } from '@/types/studio';
import type { GenerationJobStatus } from '@/types/reels';

const FILTER_STATUSES = new Set<GenerationJobStatus>([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'PARTIAL_COMPLETED',
  'FAILED',
]);

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = firstParam(params.status).toUpperCase();
  const rawDuration = Number(firstParam(params.duration));
  const initialFilters: GenerationFilters = {
    query: firstParam(params.query),
    status: FILTER_STATUSES.has(rawStatus as GenerationJobStatus)
      ? (rawStatus as GenerationJobStatus)
      : '',
    duration: ([4, 6, 8, 15] as number[]).includes(rawDuration)
      ? (rawDuration as StudioTemplateDuration)
      : '',
  };

  return <VideoLibrary initialFilters={initialFilters} />;
}
