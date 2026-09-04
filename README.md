# QUEDOT Shorts Studio Frontend

검수된 상품 에셋으로 production 숏폼 작업을 만들고, 진행 상태와 후보별 기술 검수·비용을 관리하는 Next.js 16 앱입니다.

프로젝트 설치, `.env` 구성, 실행·검증·로그·장애 대응은
[프로젝트 설치 및 운영 가이드](./docs/project-setup-and-operations-guide.ko.md)를 참고하세요.
메뉴별 화면 사용법, 프롬프트 버전 운영, 비용·오류 복구와 Production 검수 절차는
[상세 서비스 사용 가이드](./docs/service-user-guide.ko.md)를 참고하세요.

## 화면 구조

- `/videos`: 서버 작업 목록, 서버 상태 필터, 현재까지 불러온 페이지 대상 검색·길이 필터, 진행 작업 자동 갱신
- `/videos/[jobId]`: 작업 단계, 저장된 실제 스크립트 타임라인, 비용, 후보 재생·다운로드
- `/create`: 상품 → 4/6/8/15초 전략 → 크리에이티브 → 서버 견적 순서의 생성 위저드
- `/settings/prompts`: 실제 스크립트·영상 프롬프트의 불변 버전 저장, 토큰 검증, 활성 버전 전환
- `/?job=<jobId>&product_id=<legacyProductId>`: 기존 북마크 호환을 위해 job 상세로 이동합니다. 상세 조회에는 현재 상품 allowlist가 필요하지 않습니다.

생성은 별도 스크립트 확인 화면 없이 선택한 exact `template_id + version`으로 시작합니다. `client_request_id`와 `Idempotency-Key`를 함께 보내며, 전송 직전 원본 요청 스냅샷을 같은 탭의 `sessionStorage`에 임시 기록합니다. 응답이 불확실하거나 페이지가 다시 열리면 `client_request_id` 조회로 기존 job을 먼저 복구하고, 조회되지 않은 경우에도 새 ID는 발급하지 않습니다. 사용자가 복구 버튼을 누른 경우에만 저장된 동일 본문·동일 ID를 재전송하므로 서버가 접수한 유료 작업은 최대 하나입니다. job ID를 받으면 임시 스냅샷을 즉시 지우고 상세 화면으로 이동하며, 브라우저를 닫아도 서버 작업은 계속됩니다.

## 로컬 실행

Node.js와 backend가 준비된 상태에서:

```bash
npm ci
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. 배포 전 검증:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## 환경 변수

`.env.local`에는 backend 주소와 공개 가능한 화면 기본값만 둡니다. 먼저
`cp .env.example .env.local`로 안전한 예제를 복사할 수 있습니다. `NEXT_PUBLIC_` 값은 브라우저
번들에 포함되므로 API key 같은 비밀값을 넣으면 안 됩니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
NEXT_PUBLIC_VIDEO_MODEL_ID=bytedance/seedance-2.0
# Audited deployments only. The current Seedance route must remain false.
NEXT_PUBLIC_IDENTITY_REFERENCE_PRODUCTION_ENABLED=false
```

지정 모델 모드는 모델 이름만 보고 자동 활성화하지 않습니다. 실제·합성 portrait가 현재 Seedance privacy gate에서 거부된 증거가 있으므로 기본값은 비활성이며, 동의된 에셋과 provider canary를 별도로 통과한 배포에서만 `NEXT_PUBLIC_IDENTITY_REFERENCE_PRODUCTION_ENABLED=true`로 명시할 수 있습니다. Backend의 `OPENROUTER_VIDEO_MODEL`을 바꾼 배포는 같은 값으로 `NEXT_PUBLIC_VIDEO_MODEL_ID`도 설정하고 다시 빌드해야 합니다. 활성화된 경우에도 레퍼런스는 공개 HTTPS 직접 이미지 URL 1~2개만 허용하며 localhost, 사설망, `data:` URL과 인증 정보가 포함된 URL은 frontend에서 거부합니다. Backend는 URL 안전성, 파일 크기·형식·해상도와 reference 종횡비를 검사하며 이미지 의미·동의·사용 권리는 사람이 별도로 검수합니다. OpenRouter key는 Backend process가 읽는 비공개 `.env`에만 둡니다.

`NEXT_PUBLIC_` 환경 변수는 `next build` 시점에 고정되므로 값을 바꾼 뒤에는 다시 빌드해야 합니다.

## 생성과 견적 계약

1. `GET /api/v1/reels/prompt-versions`로 현재 활성 프롬프트 bundle을 확인합니다. 활성 버전을 확인하지 못하면 견적과 생성을 fail-closed로 잠급니다.
2. `GET /api/v1/reels/generation-templates`로 서버가 지원하는 4/6/8/15초 템플릿과 정확한 장면 구간을 읽습니다.
3. 필수 입력 완료 후 `POST /api/v1/reels/generation-quotes`로 현재 모델·1080p·후보 수·활성 `prompt_version_id` 기준 provider 예상 범위를 받습니다. 범위 상단은 결제 승인이나 강제 상한이 아닙니다.
4. 설정이 하나라도 바뀌거나 견적이 만료되면 기존 quote는 즉시 무효화합니다.
5. fresh quote가 있을 때만 `POST /api/v1/reels/generate`를 한 번 호출합니다. frontend는 프롬프트 문자열을 만들지 않고 `prompt_version_id`, 구조화된 `creative_brief`, `template_id`, `template_version`, `quote_id`, 안정적인 `client_request_id`를 보냅니다.
6. 응답이 끊긴 pending 요청은 `GET /api/v1/reels/generation-requests/{clientRequestId}`로 조회합니다. 한 번의 404로 잠금을 풀지 않으며, 명시적 복구 때만 동일 본문·동일 ID POST를 재사용합니다. `REQUOTE_REQUIRED` 또는 `QUOTE_NOT_FOUND`는 기존 job이 없음을 idempotency 검사 뒤 확인한 응답이므로 그때만 fresh quote로 돌아갑니다.
7. `GET /api/v1/reels/generate/{jobId}`를 visibility·online 상태와 지수 backoff를 반영해 polling합니다.
8. `COMPLETED`, `PARTIAL_COMPLETED`, `FAILED`에서 자동 polling을 멈춥니다.
9. 후보 retry는 추가 비용 견적·멱등 계약이 없어 Studio UI에서 호출하지 않습니다. 실패 시 이전 설정을 참고해 새 작업을 만들고 fresh quote를 확인합니다.

## 프롬프트 버전 계약

`/settings/prompts`는 `script_generation`, `script_tts_repair`, `video_base`, `video_identity_reference`, `video_generated_model`, `creative_brief` 여섯 템플릿을 하나의 불변 bundle로 관리합니다. `{{token_name}}`은 frontend와 backend에서 모두 allowlist와 필수 목록을 검증합니다. 새 버전 저장은 현재 활성 버전을 바꾸지 않으며 별도의 명시적 활성화가 필요합니다. 활성화는 이후 접수되는 신규 견적과 작업에만 적용되고 기존 job은 저장된 prompt version snapshot을 유지합니다.

프롬프트 설정 화면은 provider 호출이나 유료 테스트를 제공하지 않습니다. 브라우저는 prompt 내용을 HTML로 렌더링하지 않고 textarea의 일반 텍스트로만 다룹니다.

화면에 내장된 canonical fallback 템플릿은 API 장애 시 선택 구조를 설명하기 위한 offline display 전용입니다. 작업 상세에서는 저장된 스크립트 장면을 우선 표시하고, 스크립트가 없을 때 exact template ID·version이 일치하는 구조만 참고용으로 표시합니다. 길이만 같은 fallback을 서버 확정 내용으로 표시하지 않습니다. fallback을 보고 있어도 fresh server quote를 받기 전에는 최종 생성 CTA가 활성화되지 않으며, frontend가 임의 비용이나 유효한 quote를 만들지 않습니다.

견적은 backend가 반환한 값만 표시합니다. 현재 `coverage=video_only`인 경우 영상 provider 예상치만 포함되며, TTS·렌더링·스토리지·전송·재시도·운영비를 총 production 원가로 오인하지 않도록 구분합니다.

## Production 에셋 경계

[data/production-products.ts](./data/production-products.ts)는 원본 비공개 카탈로그 대신 승인된 최소 레코드만 client bundle에 포함합니다. 현재 30포 사과주스 판매 상품의 대표 에셋은 파우치 1개 이미지이고 `semanticallyExactProductCount=0`입니다. 따라서 생성·상세 화면 모두 아래 제한을 명시합니다.

- 판매 수량 30포를 영상 속 패키지 수로 주장하지 않습니다.
- 패키지의 작은 글자와 세부 표기는 시각적으로 검증됐다고 표시하지 않습니다.
- 이 제한은 로컬 데모 생성을 막지 않지만, 다운로드 전 리뷰에서 계속 보입니다.

기술 검수 통과는 광고 의미 정확성이나 한국어 음성 자연스러움을 보장하지 않습니다. 후보별 기술 메타데이터와 실제 재생 검토를 함께 사용해야 합니다.

상세 UX 및 인수 기준은 [docs/studio-ux-architecture.md](./docs/studio-ux-architecture.md)를 참고하세요.
