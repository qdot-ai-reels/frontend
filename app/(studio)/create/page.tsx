import { CreateWizard } from '@/components/create-wizard';

function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <CreateWizard sourceJobId={firstParam(params.from_job)} />;
}
