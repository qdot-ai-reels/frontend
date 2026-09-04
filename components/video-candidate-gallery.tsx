import type {
  CandidateValidationMetadata,
  GenerationStage,
  VideoCandidate,
} from '../types/reels';

const STAGE_LABELS: Record<GenerationStage, string> = {
  QUEUED: '대기 중',
  SCRIPT_GENERATION: '스크립트 생성 중',
  SCRIPT_REGENERATION: '스크립트 조정 중',
  TTS_GENERATION: '음성 생성 중',
  TTS_VALIDATION: '음성 검수 중',
  TTS_FALLBACK: '음성 길이 조정 중',
  VIDEO_GENERATION: '영상 생성 중',
  AUDIO_MERGE: '오디오 결합 중',
  CAPTION_RENDER: '자막 렌더링 중',
  COMPLETED: '완료',
  FAILED: '실패',
};

function candidateStatusLabel(candidate: VideoCandidate): string {
  if (candidate.status === 'COMPLETED') {
    return candidate.videoUrl ? '사용 가능' : '파일 확인 필요';
  }
  if (candidate.status === 'FAILED') return '생성 실패';
  if (candidate.stage) return STAGE_LABELS[candidate.stage];
  return candidate.status === 'PENDING' ? '대기 중' : '생성 중';
}

function validationPassed(validation: CandidateValidationMetadata | null): boolean | null {
  if (!validation) return null;
  if (typeof validation.passed === 'boolean') return validation.passed;
  if (typeof validation.valid === 'boolean') return validation.valid;
  if (typeof validation.is_valid === 'boolean') return validation.is_valid;
  return null;
}

function validationResolution(validation: CandidateValidationMetadata | null): string | null {
  if (!validation) return null;
  if (validation.resolution) return validation.resolution;
  if (validation.width && validation.height) {
    return `${validation.width}×${validation.height}`;
  }
  return null;
}

function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 3,
  }).format(cost);
}

export function VideoCandidateGallery({
  candidates,
  selectedCandidateId,
  retryingCandidateId,
  onSelect,
  onRetry,
}: {
  candidates: VideoCandidate[];
  selectedCandidateId: string | null;
  retryingCandidateId: string | null;
  onSelect: (candidateId: string) => void;
  onRetry: (candidateId: string) => void;
}) {
  return (
    <div className="candidate-gallery" aria-label="생성된 영상 후보">
      {candidates.map((candidate) => {
        const selected = candidate.candidateId === selectedCandidateId;
        const passed = validationPassed(candidate.validation);
        const resolution = validationResolution(candidate.validation);
        const retrying = candidate.candidateId === retryingCandidateId;
        const retryInProgress = retryingCandidateId !== null;
        const score = candidate.validation?.score;
        const hasQualityMetadata =
          typeof score === 'number' ||
          Boolean(resolution) ||
          candidate.validation?.duration_seconds != null ||
          candidate.validation?.fps != null ||
          Boolean(candidate.validation?.codec) ||
          candidate.validation?.bitrate_kbps != null ||
          candidate.attempts != null ||
          candidate.cost != null;

        return (
          <article
            className={`candidate-card ${selected ? 'selected' : ''}`}
            key={candidate.candidateId}
          >
            <div className="candidate-preview">
              {candidate.videoUrl ? (
                <video
                  src={candidate.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`후보 ${candidate.index} 영상 미리보기`}
                >
                  브라우저가 영상 재생을 지원하지 않습니다.
                </video>
              ) : (
                <div className="candidate-placeholder">
                  {candidate.status === 'FAILED' ? (
                    <span aria-hidden="true">!</span>
                  ) : candidate.status === 'COMPLETED' ? (
                    <span className="placeholder-complete" aria-hidden="true">✓</span>
                  ) : (
                    <span className="mini-spinner" aria-hidden="true" />
                  )}
                  <small>{candidateStatusLabel(candidate)}</small>
                </div>
              )}
              <span className={`candidate-status status-${candidate.status.toLowerCase()}`}>
                {candidateStatusLabel(candidate)}
              </span>
            </div>

            <div className="candidate-body">
              <div className="candidate-title-row">
                <h3>후보 {candidate.index}</h3>
                {passed !== null && (
                  <span className={`validation-badge ${passed ? 'passed' : 'failed'}`}>
                    검수 {passed ? '통과' : '확인 필요'}
                  </span>
                )}
              </div>

              <div className="quality-metadata" aria-label={`후보 ${candidate.index} 품질 정보`}>
                {typeof score === 'number' && (
                  <span>기술 검수 {Math.round(score)}점</span>
                )}
                {resolution && <span>{resolution}</span>}
                {candidate.validation?.duration_seconds != null && (
                  <span>{candidate.validation.duration_seconds}초</span>
                )}
                {candidate.validation?.fps != null && <span>{candidate.validation.fps}fps</span>}
                {candidate.validation?.codec && <span>{candidate.validation.codec}</span>}
                {candidate.validation?.bitrate_kbps != null && (
                  <span>{candidate.validation.bitrate_kbps}kbps</span>
                )}
                {candidate.validation?.source_normalized === true && (
                  <span>중앙 크롭 정규화</span>
                )}
                {candidate.attempts != null && <span>{candidate.attempts}회 시도</span>}
                {candidate.cost != null && <span>{formatCost(candidate.cost)}</span>}
                {!hasQualityMetadata && <span>품질 정보 준비 중</span>}
              </div>

              {candidate.error && (
                <p className="candidate-error" role="alert">
                  {candidate.error}
                </p>
              )}

              <div className="candidate-actions">
                {candidate.status === 'COMPLETED' && candidate.videoUrl && (
                  <button
                    type="button"
                    className={selected ? 'primary-button' : 'secondary-button'}
                    aria-pressed={selected}
                    onClick={() => onSelect(candidate.candidateId)}
                  >
                    {selected ? '선택됨' : '이 후보 선택'}
                  </button>
                )}
                {candidate.status === 'COMPLETED' && (candidate.downloadUrl || candidate.videoUrl) && (
                  <a
                    className="text-link"
                    href={candidate.downloadUrl ?? candidate.videoUrl ?? undefined}
                    download
                    aria-label={`후보 ${candidate.index} 다운로드`}
                  >
                    다운로드
                  </a>
                )}
                {candidate.status === 'FAILED' && candidate.retryable && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={retryInProgress}
                    onClick={() => onRetry(candidate.candidateId)}
                  >
                    {retrying ? '재시도 중…' : '이 후보 재시도'}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
