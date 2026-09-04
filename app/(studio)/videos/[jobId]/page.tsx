import { JobDetailClient } from '@/components/job-detail-client';

export default async function VideoJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <JobDetailClient jobId={jobId} />;
}
