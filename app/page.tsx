import { redirect } from 'next/navigation';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const legacyJobId = firstParam(params.job);

  if (legacyJobId) {
    redirect(`/videos/${encodeURIComponent(legacyJobId)}`);
  }

  redirect('/videos');
}
