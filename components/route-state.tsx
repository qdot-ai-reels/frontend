import Link from 'next/link';

export function RouteSkeleton({ detail = false }: { detail?: boolean }) {
  return (
    <div className="page-stack" aria-label="화면 불러오는 중" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className={detail ? 'detail-grid' : 'library-grid'}>
        {Array.from({ length: detail ? 2 : 4 }, (_, index) => (
          <div className="skeleton skeleton-card" key={index} />
        ))}
      </div>
      <span className="sr-only">화면을 불러오고 있습니다.</span>
    </div>
  );
}

export function RouteErrorState({
  title = '화면을 불러오지 못했습니다',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <section className="route-state" role="alert">
      <span className="state-symbol danger" aria-hidden="true">!</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="inline-actions">
        {onRetry && <button className="button button-primary" onClick={onRetry}>다시 시도</button>}
        <Link className="button button-secondary" href="/videos">영상 라이브러리</Link>
      </div>
    </section>
  );
}
