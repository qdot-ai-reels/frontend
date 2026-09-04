# Production Studio UX Architecture

## 목표와 비목표

이 화면은 한 번의 긴 브라우저 세션에 의존하지 않고 영상 작업을 생성·복구·검토하는 운영 콘솔이다. 사용자는 비용의 상한을 확인한 뒤 한 번만 생성 요청을 보내고, 이후 작업은 job ID를 기준으로 언제든 다시 연다.

다음은 frontend가 보장하지 않는 항목이다.

- 생성형 모델의 픽셀 단위 동일 결과
- provider 품질과 한국어 음성의 주관적 자연스러움
- `video_only` 견적에 포함되지 않은 TTS·스토리지·전송·운영 비용
- 대표 단품 이미지에 보이지 않는 판매 수량과 패키지 작은 글자의 정확성

## 정보 구조

```text
StudioShell
├── /videos                 영상 작업 목록과 운영 요약
├── /videos/[jobId]         비동기 작업 복구·후보 리뷰
└── /create                 단계형 생성과 서버 견적
    └── ?from_job=[jobId]   기존 설정을 복사해 새 후보 생성
```

`/`은 호환 진입점이다. 이전 URL에 `job`이 있으면 `/videos/[jobId]`로, 없으면 `/videos`로 이동한다. 상세 화면은 현재 frontend allowlist가 아니라 backend의 안전한 product snapshot을 사용하므로 과거 작업을 잃지 않는다.

## 화면별 UX

### 영상 라이브러리

- 전체·진행 중·사용 가능·확인 필요·조회 작업 실제 비용을 상단에서 요약한다.
- 상품명/작업 ID 검색, 상태, 4/6/8/15초 필터를 URL query에 보존한다.
- 서버 cursor로 더 불러오며 작업 ID 기준으로 중복을 제거한다.
- 진행 중 작업이 있을 때만 4초 간격으로 갱신한다.
- 탭이 숨겨졌거나 오프라인이면 요청을 보내지 않고, 복귀 시 즉시 재개한다.
- 최초 로딩 skeleton, 필터 결과 없음, 전체 empty, 마지막 데이터 유지 오류를 구분한다.

### 생성 위저드

1. **상품**: production allowlist만 노출하고 대표 단품 에셋 경계를 함께 표시한다.
2. **영상 전략**: backend가 반환한 versioned 4/6/8/15초 radio card와 구간 비율을 표시한다. 로컬 fallback은 구조 미리보기뿐이며 서버 연결 없이는 생성할 수 없다.
3. **크리에이티브**: AI 가상 모델, 상품만, 지정 모델을 명시적으로 선택하고 CTA·광고 목적·채널·후보 수를 입력한다.
4. **비용 확인**: 서버 quote의 expected/max USD, line item, coverage, disclaimer, 만료 시각을 표시한다.

설정이 바뀌면 quote ID와 생성 가능 상태를 즉시 폐기한다. 350ms debounce 뒤 서버 견적을 다시 요청하며, 만료되면 자동 갱신한다. fresh quote와 필수 입력이 모두 있고 잔액 정보가 충분할 때만 최종 CTA를 활성화한다.

최종 CTA는 `client_request_id`를 생성 요청 동안 유지하고 같은 값을 `Idempotency-Key`에도 보낸다. 네트워크 응답이 불확실해도 사용자는 중복 생성 대신 같은 요청을 재확인한다. 202 응답의 job ID를 받으면 즉시 상세로 이동한다.

### 작업 상세와 후보 리뷰

- job ID 하나만으로 product/template/options/cost/script/candidates를 복구한다.
- 3.5초 기본 polling, 실패 시 최대 30초 지수 backoff, AbortController, visibility/online 재개를 사용한다.
- 마지막으로 성공한 응답을 유지하고 stale/offline/error를 각각 안내한다.
- 작업 단계, 후보 완료율, 오류, 예상/최대/실제 비용을 분리한다.
- script 또는 template timeline을 정확한 초 구간으로 표시하고, 서버 timing validation이 있으면 장면별 결과를 붙인다.
- 후보는 실제 video를 inline 재생하고 기술 점수·해상도·길이·fps·codec·시도·비용을 표시한다.
- 완료 후보는 선택·다운로드, retryable 실패 후보는 개별 재시도한다.
- “같은 설정으로 새 후보 만들기”는 설정 복사임을 명시하고 동일 영상 보장을 약속하지 않는다.

## 컴포넌트와 상태 경계

| 계층 | 책임 | 상태 원천 |
| --- | --- | --- |
| Server route | URL parsing, route loading/error/not-found boundary | Next.js params/searchParams |
| `StudioShell`/`StudioNav` | 지속 navigation, desktop sidebar/mobile bottom nav | pathname |
| `studio-api` | snake/camel/legacy 응답 방어적 정규화, URL 및 비용 포맷 | backend JSON |
| `VideoLibrary` | 필터, cursor merge, 활성 작업 refresh | list endpoint + URL query |
| `CreateWizard` | draft, quote freshness, request id, submit state | user input + template/quote endpoints |
| `JobDetailClient` | polling lifecycle, stale recovery, selection/retry | job detail endpoint |
| `VideoCandidateGallery` | candidate playback, QC metadata, download/retry controls | normalized candidates |

목록과 상세는 backend 영속 상태가 source of truth다. sessionStorage에는 진행 요청 힌트만 저장하며 복구의 필수 조건으로 사용하지 않는다.

## 반응형·접근성 기준

- 1440px: 232px sidebar, 최대 1240px content, 목록 메타와 상세 aside를 동시에 표시한다.
- 768px: sidebar를 유지하되 content/요약/폼 밀도를 줄인다.
- 390px/360px: 상단 brand와 safe-area bottom navigation, 한 열 위저드·후보, 화면 폭 CTA를 사용한다.
- 모든 버튼/링크/입력은 키보드 focus ring과 의미 있는 label을 가진다.
- wizard와 생성 stage는 `aria-current`, 후보 완료율은 `progressbar`, 네트워크 상태는 `aria-live`로 노출한다.
- 로딩은 `aria-busy`, 오류는 `role=alert`, 상품 경계는 `role=note`를 사용한다.
- `prefers-reduced-motion`에서는 pulse, spinner, shimmer, scroll transition을 사실상 제거한다.
- 영상은 자동 재생하지 않고 `controls`, `playsInline`, `preload=metadata`를 사용한다.

## 인수 매트릭스

| 요구사항 | 구현 | 확인 방법 |
| --- | --- | --- |
| 영상 관리 목록 | `/videos`, 영속 list API, cursor, 요약 카드 | 새로고침 후 동일 작업 노출 |
| 검색·상태·길이 필터 | URL query + 방어적 client filter | 필터 후 URL/empty state 확인 |
| 생성 전 비용 | fresh server quote expected/max | 설정 변경 시 CTA 즉시 비활성화 |
| 4/6/8/15초 선택 | server versioned template radio/timeline | 네 길이와 version 표시 |
| 15초 구간 | 0–3 Hook, 3–8 소개, 8–12 분위기, 12–15 CTA | 15초 card/review/detail 확인 |
| one-click 생성 | template/quote/request ID 기반 POST | script 사전 생성 없이 202 상세 이동 |
| 중복 제출 방지 | submit lock + stable request/idempotency key | 네트워크 오류 후 동일 ID 재시도 |
| 비동기 완료 | job detail polling, terminal stop | 창 재접속 후 job ID 복구 |
| 오프라인/숨김 탭 | polling pause, reconnect resume | DevTools offline/visibility 전환 |
| 후보 리뷰 | playback/QC/select/download/retry | 완료·실패 후보 action 확인 |
| 과거 job 호환 | `/` legacy redirect, detail job-only | `/?job=...&product_id=...` 이동 확인 |
| 에셋 의미 경계 | create/review/detail caveat | 30포 상품에서 단품/작은 글자 경고 확인 |
| 오류·빈·로딩 | route + in-view 상태 구분 | API 404/500/empty 시나리오 |
| 360/390/768/1440 | CSS breakpoints/safe area | 네 viewport에서 overflow/CTA 확인 |
| 접근성/모션 | labels, live/progress, reduced motion | keyboard 및 OS reduced-motion 확인 |

## 배포 전 필수 검증

```bash
npm run lint
npx tsc --noEmit
npm run build
```

추가 수동 검증은 backend를 무료/fixture provider로 실행해 list/template/quote/detail을 확인한다. 실제 생성과 후보 retry는 유료 provider 요청이므로 명시적으로 승인된 smoke에서만 실행한다.

## Deferred public infrastructure

다음은 이번 local application 범위를 넘어 production 배포 전에 별도 인프라 작업이 필요하다.

- 사용자 인증, workspace/role 권한, job 소유권 검증
- quote와 실제 청구 원장의 결제 단위 reconciliation, 예산 한도와 잔액 예약
- SSE/WebSocket 또는 notification으로 polling 부하 축소
- object storage CDN의 만료 URL 갱신, 다운로드 Content-Disposition, 장기 보존 정책
- provider webhook 서명 검증, dead-letter queue, 재처리 운영 도구
- 개인정보·모델 초상권 동의 원장과 reference 삭제 정책
- audit log, observability, SLO/alert, 다국어 오류 code 매핑
- 주관적 creative/한국어 음성 QA를 포함한 human approval gate
- Playwright viewport/accessibility regression과 fixture API contract test를 CI에 추가
