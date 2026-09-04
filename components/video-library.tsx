'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { assetCaveat, formatDateTime, formatUsd, studioApi } from '@/lib/studio-api';
import type { GenerationJobStatus } from '@/types/reels';
import type {
  GenerationFilters,
  GenerationListResult,
  StudioJob,
  StudioTemplateDuration,
} from '@/types/studio';
import { isJobActive } from '@/types/studio';

const STATUS_LABELS: Record<GenerationJobStatus, string> = {
  PENDING: '대기 중',
  PROCESSING: '생성 중',
  COMPLETED: '사용 가능',
  PARTIAL_COMPLETED: '일부 완료',
  FAILED: '확인 필요',
};

const EMPTY_RESULT: GenerationListResult = {
  items: [],
  nextCursor: null,
  summary: { total: 0, processing: 0, ready: 0, needsAttention: 0, actualCostUsd: null },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '영상 목록을 불러오지 못했습니다.';
}

function mergeJobs(current: StudioJob[], incoming: StudioJob[]): StudioJob[] {
  const items = new Map(current.map((job) => [job.jobId, job]));
  incoming.forEach((job) => items.set(job.jobId, job));
  return Array.from(items.values()).sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
  );
}

function mergePages(pages: Map<string, GenerationListResult>): GenerationListResult {
  const values = Array.from(pages.values());
  if (values.length === 0) return EMPTY_RESULT;
  return {
    items: values.reduce<StudioJob[]>((items, page) => mergeJobs(items, page.items), []),
    nextCursor: values.at(-1)?.nextCursor ?? null,
    summary: values[0].summary,
  };
}

export function VideoLibrary({ initialFilters }: { initialFilters: GenerationFilters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [result, setResult] = useState<GenerationListResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const latestRequest = useRef(0);
  const pagesRef = useRef<Map<string, GenerationListResult>>(new Map());
  const loadMoreController = useRef<AbortController | null>(null);
  const canonicalizedUrl = useRef(false);

  const updateUrl = useCallback(
    (next: GenerationFilters) => {
      const params = new URLSearchParams();
      if (next.query) params.set('query', next.query);
      if (next.status) params.set('status', next.status);
      if (next.duration) params.set('duration', String(next.duration));
      router.replace(params.size > 0 ? `/videos?${params.toString()}` : '/videos', {
        scroll: false,
      });
    },
    [router],
  );

  const setFilter = useCallback(
    <Key extends keyof GenerationFilters>(key: Key, value: GenerationFilters[Key]) => {
      const next = { ...filters, [key]: value, cursor: undefined };
      setFilters(next);
      updateUrl(next);
    },
    [filters, updateUrl],
  );

  useEffect(() => {
    if (canonicalizedUrl.current) return;
    canonicalizedUrl.current = true;
    updateUrl(initialFilters);
  }, [initialFilters, updateUrl]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const requestId = ++latestRequest.current;
    pagesRef.current = new Map();
    loadMoreController.current?.abort();

    async function load() {
      if (document.visibilityState === 'hidden' || !navigator.onLine) {
        const isOffline = !navigator.onLine;
        setOffline(isOffline);
        if (isOffline) setLoading(false);
        timer = window.setTimeout(load, 5_000);
        return;
      }
      setOffline(false);
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await studioApi.getGenerations(filters, controller.signal);
        if (disposed || requestId !== latestRequest.current) return;
        pagesRef.current.set('root', next);
        setResult(mergePages(pagesRef.current));
        setError(null);
        setLoading(false);
        if (next.items.some((job) => isJobActive(job.status))) {
          timer = window.setTimeout(load, 4_000);
        }
      } catch (requestError) {
        if (disposed || controller.signal.aborted) return;
        setError(errorMessage(requestError));
        setLoading(false);
        timer = window.setTimeout(load, 10_000);
      }
    }

    const debounce = filters.query ? 300 : 0;
    timer = window.setTimeout(() => {
      setResult(EMPTY_RESULT);
      setLoading(true);
      setLoadingMore(false);
      void load();
    }, debounce);
    const resume = () => {
      setOffline(!navigator.onLine);
      if (document.visibilityState === 'visible' && navigator.onLine) {
        if (timer != null) window.clearTimeout(timer);
        void load();
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    return () => {
      disposed = true;
      controller?.abort();
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
    };
  }, [filters, refreshKey]);

  async function loadMore() {
    if (!result.nextCursor || loadingMore) return;
    const cursor = result.nextCursor;
    const requestId = latestRequest.current;
    loadMoreController.current?.abort();
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await studioApi.getGenerations(
        { ...filters, cursor },
        controller.signal,
      );
      if (requestId !== latestRequest.current || controller.signal.aborted) return;
      pagesRef.current.set(cursor, next);
      setResult(mergePages(pagesRef.current));
    } catch (requestError) {
      if (!controller.signal.aborted) setError(errorMessage(requestError));
    } finally {
      if (loadMoreController.current === controller) {
        loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  }

  const filtered = Boolean(filters.query || filters.status || filters.duration);
  const activeJobs = useMemo(
    () => result.items.filter((job) => isJobActive(job.status)).length,
    [result.items],
  );
  const visibleSummary = useMemo(
    () => ({
      total: result.items.length,
      processing: result.items.filter((job) => isJobActive(job.status)).length,
      ready: result.items.filter((job) => job.status === 'COMPLETED').length,
      needsAttention: result.items.filter(
        (job) => job.status === 'FAILED' || job.status === 'PARTIAL_COMPLETED',
      ).length,
      actualCostUsd:
        result.items.length > 0 && result.items.every((job) => job.actualCostUsd != null)
          ? result.items.reduce((sum, job) => sum + (job.actualCostUsd ?? 0), 0)
          : null,
    }),
    [result.items],
  );

  return (
    <div className="page-stack">
      <header className="page-header page-header-actions">
        <div>
          <p className="eyebrow">VIDEO LIBRARY</p>
          <h1>생성 영상 관리</h1>
          <p>진행 중인 작업과 완료된 후보를 한곳에서 확인하고 다시 사용할 수 있습니다.</p>
        </div>
        <Link className="button button-primary" href="/create">새 영상 만들기</Link>
      </header>

      <section className="summary-grid" aria-label="영상 작업 요약">
        <SummaryCard label="조회 결과" value={`${visibleSummary.total}개`} />
        <SummaryCard label="진행 중" value={`${visibleSummary.processing}개`} accent={activeJobs > 0} />
        <SummaryCard label="사용 가능" value={`${visibleSummary.ready}개`} tone="success" />
        <SummaryCard label="확인 필요" value={`${visibleSummary.needsAttention}개`} tone="danger" />
        <SummaryCard label="표시 작업 실제 비용" value={formatUsd(visibleSummary.actualCostUsd)} />
      </section>

      <section className="panel library-panel" aria-labelledby="library-title">
        <div className="panel-heading">
          <div>
            <h2 id="library-title">영상 작업</h2>
            <p>작업을 열면 최신 진행 상태와 후보별 검수 결과가 자동으로 갱신됩니다.</p>
          </div>
          {activeJobs > 0 && <span className="live-badge"><i aria-hidden="true" /> {activeJobs}개 진행 중</span>}
        </div>

        <div className="library-filters" role="search">
          <label className="search-field">
            <span className="sr-only">상품명 또는 작업 ID 검색</span>
            <input
              type="search"
              value={filters.query}
              placeholder="상품명 또는 작업 ID 검색"
              onChange={(event) => setFilter('query', event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">상태 필터</span>
            <select
              value={filters.status}
              onChange={(event) => setFilter('status', event.target.value as GenerationFilters['status'])}
            >
              <option value="">모든 상태</option>
              <option value="PENDING">대기 중</option>
              <option value="PROCESSING">생성 중</option>
              <option value="COMPLETED">사용 가능</option>
              <option value="PARTIAL_COMPLETED">일부 완료</option>
              <option value="FAILED">확인 필요</option>
            </select>
          </label>
          <label>
            <span className="sr-only">길이 필터</span>
            <select
              value={filters.duration}
              onChange={(event) =>
                setFilter(
                  'duration',
                  event.target.value
                    ? (Number(event.target.value) as StudioTemplateDuration)
                    : '',
                )
              }
            >
              <option value="">모든 길이</option>
              {[4, 6, 8, 15].map((duration) => <option key={duration} value={duration}>{duration}초</option>)}
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                const empty: GenerationFilters = { query: '', status: '', duration: '' };
                setFilters(empty);
                updateUrl(empty);
              }}
            >
              필터 초기화
            </button>
          )}
        </div>

        {(filters.query || filters.duration) && (
          <p className="filter-scope-note" role="note">
            상품명·작업 ID 검색과 길이 필터는 서버 전체가 아니라 현재까지 불러온 페이지에만 적용됩니다.
            더 보기를 누르면 검색 범위가 함께 늘어납니다.
          </p>
        )}

        {error && (
          <div className="inline-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>다시 시도</button>
          </div>
        )}

        {offline && result.items.length === 0 ? (
          <div className="route-state">
            <span className="state-symbol" aria-hidden="true">↯</span>
            <h3>오프라인이라 목록을 불러올 수 없습니다</h3>
            <p>연결되면 자동으로 다시 시도합니다. 생성 작업은 서버에서 계속됩니다.</p>
          </div>
        ) : loading ? (
          <div className="job-list" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => <div className="skeleton job-row-skeleton" key={index} />)}
          </div>
        ) : result.items.length === 0 ? (
          <div className="empty-state">
            <span className="state-symbol" aria-hidden="true">{filtered ? '⌕' : '▦'}</span>
            <h3>{filtered ? '조건에 맞는 영상이 없습니다' : '아직 만든 영상이 없습니다'}</h3>
            <p>{filtered ? '검색어 또는 필터를 바꿔 보세요.' : '검수된 상품과 템플릿으로 첫 영상을 만들어 보세요.'}</p>
            {filtered ? (
              <button
                className="button button-secondary"
                onClick={() => {
                  const empty: GenerationFilters = { query: '', status: '', duration: '' };
                  setFilters(empty);
                  updateUrl(empty);
                }}
              >필터 초기화</button>
            ) : <Link className="button button-primary" href="/create">첫 영상 만들기</Link>}
          </div>
        ) : (
          <div className="job-list">
            {result.items.map((job) => <JobRow job={job} key={job.jobId} />)}
          </div>
        )}

        {result.nextCursor && (
          <div className="load-more-wrap">
            <button className="button button-secondary" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? '불러오는 중…' : '더 보기'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <div className={`summary-card ${accent ? 'accent' : ''} tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JobRow({ job }: { job: StudioJob }) {
  const candidate = job.candidates.find((item) => item.status === 'COMPLETED');
  const warning = job.assetWarning ?? assetCaveat(job.product.productId, job.product.name);
  return (
    <article className="job-row">
      <Link className="job-row-main" href={`/videos/${encodeURIComponent(job.jobId)}`}>
        <div className="job-thumbnail">
          {job.product.imageUrl ? (
            <Image
              src={job.product.imageUrl}
              alt=""
              width={72}
              height={104}
              sizes="72px"
              unoptimized
            />
          ) : <span aria-hidden="true">▶</span>}
          {candidate?.videoUrl && <i title="재생 가능한 후보 있음" aria-label="재생 가능한 후보 있음" />}
        </div>
        <div className="job-copy">
          <div className="job-title-row">
            <h3>{job.product.name}</h3>
            <span className={`status-pill status-${job.status.toLowerCase()}`}>{STATUS_LABELS[job.status]}</span>
          </div>
          <p>{job.template.name} · 후보 {job.completedCandidates}/{job.candidateCount} 사용 가능</p>
          {warning && <span className="asset-pill">대표 단품 에셋 · 수량 미검증</span>}
          <small>작업 {job.jobId}</small>
        </div>
        <div className="job-meta">
          <strong>{formatUsd(job.actualCostUsd ?? job.estimatedCostUsd)}</strong>
          <small>{job.actualCostUsd != null ? '실제 기록' : job.estimatedCostUsd != null ? '예상값' : '비용 미기록'}</small>
          <span>{formatDateTime(job.createdAt)}</span>
          {isJobActive(job.status) && <small>{job.message ?? '작업을 처리하고 있습니다.'}</small>}
        </div>
        <span className="row-arrow" aria-hidden="true">›</span>
      </Link>
    </article>
  );
}
