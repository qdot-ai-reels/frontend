'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { assetCaveat, formatDateTime, formatUsd, studioApi } from '@/lib/studio-api';
import type { GenerationJobStatus, GenerationStage } from '@/types/reels';
import type { StudioJob, TemplateScene } from '@/types/studio';
import { isJobActive } from '@/types/studio';

import { VideoCandidateGallery } from './video-candidate-gallery';

const STATUS_LABELS: Record<GenerationJobStatus, string> = {
  PENDING: '대기 중',
  PROCESSING: '생성 중',
  COMPLETED: '사용 가능',
  PARTIAL_COMPLETED: '일부 완료',
  FAILED: '확인 필요',
};

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: 'QUEUED', label: '작업 접수' },
  { key: 'SCRIPT_GENERATION', label: '스크립트' },
  { key: 'TTS_GENERATION', label: '한국어 음성' },
  { key: 'VIDEO_GENERATION', label: '영상 후보' },
  { key: 'AUDIO_MERGE', label: '음성 결합' },
  { key: 'CAPTION_RENDER', label: '자막·검수' },
  { key: 'COMPLETED', label: '완료' },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '영상 작업을 불러오지 못했습니다.';
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  return typeof error.status === 'number' ? error.status : null;
}

function visualModeLabel(value: StudioJob['options']['visualMode']): string {
  if (value === 'generated_model') return 'AI 가상 모델';
  if (value === 'model_included') return '지정 모델';
  if (value === 'product_only') return '상품만';
  return '기록 없음';
}

function stagePosition(stage: GenerationStage | null, status: GenerationJobStatus): number {
  if (status === 'FAILED') return Math.max(0, STAGES.findIndex((item) => item.key === stage));
  if (status === 'COMPLETED' || status === 'PARTIAL_COMPLETED') return STAGES.length - 1;
  if (stage === 'SCRIPT_REGENERATION') return 1;
  if (stage === 'TTS_VALIDATION' || stage === 'TTS_FALLBACK') return 2;
  const index = STAGES.findIndex((item) => item.key === stage);
  return index < 0 ? 0 : index;
}

function mergeDetail(previous: StudioJob | null, next: StudioJob): StudioJob {
  if (!previous) return next;
  return {
    ...next,
    product:
      next.product.name === '상품 정보 없음' && previous.product.name !== '상품 정보 없음'
        ? previous.product
        : next.product,
    template:
      next.template.name === '템플릿 정보 없음' && previous.template.name !== '템플릿 정보 없음'
        ? previous.template
        : next.template,
    candidates: next.candidates.length > 0 ? next.candidates : previous.candidates,
    script: next.script ?? previous.script,
    assetWarning: next.assetWarning ?? previous.assetWarning,
  };
}

export function JobDetailClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<StudioJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [retryingCandidateId, setRetryingCandidateId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const jobRef = useRef<StudioJob | null>(null);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let failures = 0;

    const schedule = (delay: number) => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(load, delay);
    };

    async function load() {
      if (disposed) return;
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      if (isOffline || document.visibilityState === 'hidden') {
        setStale(Boolean(jobRef.current));
        schedule(5_000);
        return;
      }

      controller?.abort();
      controller = new AbortController();
      try {
        const next = await studioApi.getGeneration(jobId, controller.signal);
        if (disposed) return;
        failures = 0;
        setJob((current) => {
          const merged = mergeDetail(current, next);
          jobRef.current = merged;
          return merged;
        });
        setSelectedCandidateId((current) => {
          if (current && next.candidates.some((candidate) => candidate.candidateId === current)) {
            return current;
          }
          return next.candidates.find((candidate) => candidate.status === 'COMPLETED')?.candidateId ?? null;
        });
        setError(null);
        setNotFound(false);
        setStale(false);
        setLoading(false);
        if (isJobActive(next.status)) schedule(3_500);
      } catch (requestError) {
        if (disposed || controller.signal.aborted) return;
        setLoading(false);
        if (errorStatus(requestError) === 404) {
          setNotFound(true);
          return;
        }
        failures += 1;
        setError(errorMessage(requestError));
        setStale(Boolean(jobRef.current));
        schedule(Math.min(30_000, 4_000 * 2 ** Math.min(failures - 1, 3)));
      }
    }

    const resume = () => {
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      if (!isOffline && document.visibilityState === 'visible') {
        failures = 0;
        void load();
      }
    };

    void load();
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
  }, [jobId, refreshKey]);

  async function retryCandidate(candidateId: string) {
    if (retryingCandidateId) return;
    setRetryingCandidateId(candidateId);
    setRetryError(null);
    try {
      await studioApi.retryCandidate(jobId, candidateId);
      refresh();
    } catch (requestError) {
      setRetryError(errorMessage(requestError));
    } finally {
      setRetryingCandidateId(null);
    }
  }

  const active = job ? isJobActive(job.status) : false;
  const completedPercent = job
    ? Math.round((job.completedCandidates / Math.max(1, job.candidateCount)) * 100)
    : 0;
  const warning = job
    ? job.assetWarning ?? assetCaveat(job.product.productId, job.product.name)
    : null;

  if (loading && !job) return <DetailSkeleton />;

  if (notFound && !job) {
    return (
      <section className="route-state">
        <span className="state-symbol danger" aria-hidden="true">?</span>
        <h1>영상 작업을 찾을 수 없습니다</h1>
        <p>삭제되었거나 잘못된 작업 ID일 수 있습니다. 라이브러리에서 작업을 다시 선택해 주세요.</p>
        <Link className="button button-primary" href="/videos">영상 라이브러리</Link>
      </section>
    );
  }

  if (!job) {
    return (
      <section className="route-state">
        <span className="state-symbol danger" aria-hidden="true">!</span>
        <h1>작업을 불러오지 못했습니다</h1>
        <p>{error}</p>
        <div className="state-actions">
          <button className="button button-primary" type="button" onClick={refresh}>다시 시도</button>
          <Link className="button button-secondary" href="/videos">라이브러리</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <nav className="breadcrumb" aria-label="현재 위치">
        <Link href="/videos">영상 라이브러리</Link><span aria-hidden="true">/</span><span>작업 상세</span>
      </nav>

      <header className="detail-hero">
        <div className="detail-product">
          <div className="detail-product-image">
            {job.product.imageUrl ? (
              <Image src={job.product.imageUrl} alt="" width={76} height={76} sizes="76px" unoptimized />
            ) : <span aria-hidden="true">▶</span>}
          </div>
          <div>
            <div className="detail-title-row">
              <h1>{job.product.name}</h1>
              <span className={`status-pill status-${job.status.toLowerCase()}`}>{STATUS_LABELS[job.status]}</span>
            </div>
            <p>{job.template.name} · {visualModeLabel(job.options.visualMode)} · 후보 {job.candidateCount}개</p>
            <small>작업 ID {job.jobId}</small>
          </div>
        </div>
        <div className="detail-actions">
          <button className="button button-secondary" type="button" onClick={refresh}>상태 새로고침</button>
          <Link className="button button-primary" href={`/create?from_job=${encodeURIComponent(job.jobId)}`}>
            같은 설정으로 새 후보 만들기
          </Link>
        </div>
      </header>

      <div className="live-region" aria-live="polite">
        {offline ? '오프라인입니다. 연결되면 자동으로 최신 상태를 확인합니다.' :
          stale ? '마지막으로 확인한 상태를 표시하고 있습니다.' :
            active ? `${job.message ?? '작업을 처리하고 있습니다.'} 화면을 닫아도 생성은 계속됩니다.` :
              `마지막 업데이트 ${formatDateTime(job.updatedAt)}`}
      </div>

      {error && job && (
        <div className="inline-alert" role="alert"><span>{error} 저장된 마지막 상태를 표시합니다.</span><button type="button" onClick={refresh}>다시 연결</button></div>
      )}
      {retryError && (
        <div className="inline-alert" role="alert"><span>{retryError}</span><button type="button" onClick={() => setRetryError(null)}>닫기</button></div>
      )}
      {warning && <div className="asset-caveat" role="note"><strong>상품 에셋 주의</strong><p>{warning}</p></div>}

      <div className="detail-grid">
        <main className="detail-main">
          <section className="panel progress-panel" aria-labelledby="progress-title">
            <div className="panel-heading">
              <div><h2 id="progress-title">생성 진행</h2><p>단계와 후보별 완료 수를 서버 상태 기준으로 표시합니다.</p></div>
              <span className={active ? 'live-badge' : 'quiet-badge'}>{active && <i aria-hidden="true" />}{STATUS_LABELS[job.status]}</span>
            </div>
            <StageProgress job={job} />
            <div className="candidate-progress-copy">
              <span>사용 가능한 후보 <strong>{job.completedCandidates}/{job.candidateCount}</strong></span>
              <span>{completedPercent}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-label="후보 생성 완료율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completedPercent}>
              <i style={{ width: `${completedPercent}%` }} />
            </div>
            {job.status === 'FAILED' && <p className="job-error" role="alert">{job.error ?? '작업이 완료되지 않았습니다.'}</p>}
          </section>

          <section className="panel" aria-labelledby="candidates-title">
            <div className="panel-heading">
              <div><h2 id="candidates-title">영상 후보</h2><p>기술 검수와 재생을 확인한 뒤 사용할 후보를 내려받으세요.</p></div>
            </div>
            {job.candidates.length > 0 ? (
              <VideoCandidateGallery
                candidates={job.candidates}
                selectedCandidateId={selectedCandidateId}
                retryingCandidateId={retryingCandidateId}
                onSelect={setSelectedCandidateId}
                onRetry={(candidateId) => void retryCandidate(candidateId)}
              />
            ) : (
              <CandidateWaiting count={job.candidateCount} active={active} />
            )}
            <p className="candidate-footnote">“같은 설정”은 템플릿과 입력값을 복사합니다. 생성형 영상은 매번 새 후보가 만들어지며 동일한 픽셀 결과를 보장하지 않습니다.</p>
          </section>

          <ScriptTimeline job={job} />
        </main>

        <aside className="detail-aside">
          <section className="panel sticky-card" aria-labelledby="cost-title">
            <div className="panel-heading compact"><div><h2 id="cost-title">비용</h2><p>USD · 영상 provider 기준</p></div></div>
            <dl className="detail-list">
              <div><dt>예상 비용</dt><dd>{formatUsd(job.estimatedCostUsd)}</dd></div>
              <div><dt>최대 승인</dt><dd>{formatUsd(job.maxAuthorizedCostUsd)}</dd></div>
              <div className="strong"><dt>실제 기록</dt><dd>{formatUsd(job.actualCostUsd)}</dd></div>
            </dl>
            <p className="muted-note">견적에는 음성·후처리 등 별도 인프라 비용이 포함되지 않을 수 있습니다.</p>
          </section>

          <section className="panel" aria-labelledby="settings-title">
            <div className="panel-heading compact"><div><h2 id="settings-title">생성 설정</h2></div></div>
            <dl className="detail-list">
              <div><dt>템플릿</dt><dd>{job.template.durationSeconds ? `${job.template.durationSeconds}초` : '기록 없음'}{job.template.version ? ` · v${job.template.version}` : ''}</dd></div>
              <div><dt>출연 방식</dt><dd>{visualModeLabel(job.options.visualMode)}</dd></div>
              <div><dt>채널</dt><dd>{job.options.channel ?? '기록 없음'}</dd></div>
              <div><dt>CTA</dt><dd>{job.options.cta ?? '기록 없음'}</dd></div>
              <div><dt>광고 목적</dt><dd>{job.options.advertisingPurpose ?? '기록 없음'}</dd></div>
              <div><dt>생성 시각</dt><dd>{formatDateTime(job.createdAt)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StageProgress({ job }: { job: StudioJob }) {
  const current = stagePosition(job.stage, job.status);
  return (
    <ol className="stage-progress" aria-label="영상 생성 단계">
      {STAGES.map((stage, index) => {
        const failed = job.status === 'FAILED' && index === current;
        const state = failed ? 'failed' : index < current || job.status === 'COMPLETED' ? 'done' : index === current ? 'current' : 'upcoming';
        return (
          <li className={state} key={stage.key} aria-current={state === 'current' ? 'step' : undefined}>
            <span aria-hidden="true">{failed ? '!' : state === 'done' ? '✓' : index + 1}</span>
            <small>{stage.label}</small>
          </li>
        );
      })}
    </ol>
  );
}

function CandidateWaiting({ count, active }: { count: number; active: boolean }) {
  return (
    <div className="candidate-gallery waiting" aria-busy={active}>
      {Array.from({ length: count }, (_, index) => (
        <div className="candidate-card" key={index}>
          <div className="candidate-placeholder"><span className={active ? 'mini-spinner' : ''} aria-hidden="true">{active ? '' : '—'}</span><small>{active ? '후보를 준비하고 있습니다' : '생성된 파일 없음'}</small></div>
          <div className="candidate-body"><h3>후보 {index + 1}</h3><p className="muted-note">서버 상태가 바뀌면 자동으로 표시됩니다.</p></div>
        </div>
      ))}
    </div>
  );
}

function ScriptTimeline({ job }: { job: StudioJob }) {
  const scenes: TemplateScene[] = useMemo(() => {
    if (job.script?.scenes?.length) {
      return job.script.scenes.map((scene, index) => ({
        id: scene.scene_name || `script-${index + 1}`,
        label: scene.scene_name || `장면 ${index + 1}`,
        startSeconds: scene.time_range_sec.start,
        endSeconds: scene.time_range_sec.end,
        description: scene.auditory?.voiceover || scene.auditory?.subtitle || scene.visual,
      }));
    }
    return job.template.scenes;
  }, [job.script, job.template.scenes]);

  if (scenes.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="timeline-title">
      <div className="panel-heading"><div><h2 id="timeline-title">스크립트 타임라인</h2><p>서버가 확정한 장면 구간과 음성 내용을 확인합니다.</p></div></div>
      <ol className="script-timeline">
        {scenes.map((scene, index) => {
          const validation = job.timingValidation.find((item) => item.id === scene.id) ?? job.timingValidation[index];
          return (
            <li key={`${scene.id}-${index}`}>
              <span className="timeline-time">{scene.startSeconds}–{scene.endSeconds}초</span>
              <div><strong>{scene.label}</strong><p>{scene.description || '상세 스크립트를 준비하고 있습니다.'}</p></div>
              {validation?.passed != null && <span className={`validation-badge ${validation.passed ? 'passed' : 'failed'}`}>타이밍 {validation.passed ? '통과' : '확인'}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="영상 작업을 불러오는 중">
      <div className="skeleton skeleton-title" />
      <div className="detail-grid">
        <div className="detail-main"><div className="skeleton detail-skeleton" /><div className="skeleton candidate-skeleton" /></div>
        <div className="skeleton aside-skeleton" />
      </div>
    </div>
  );
}
