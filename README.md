# QUEDOT Shorts Studio Frontend

검수된 상품 에셋으로 production 숏폼 작업을 만들고, 진행 상태와 후보별 기술 검수·비용을 관리하는 Next.js 16 앱입니다.

## 화면 구조

- `/videos`: 서버에 저장된 전체 생성 작업, 검색·상태·길이 필터, 진행 작업 자동 갱신
- `/videos/[jobId]`: 작업 단계, 스크립트 타임라인, 비용, 후보 재생·다운로드·개별 재시도
- `/create`: 상품 → 4/6/8/15초 전략 → 크리에이티브 → 서버 견적 순서의 생성 위저드
- `/?job=<jobId>&product_id=<legacyProductId>`: 기존 북마크 호환을 위해 job 상세로 이동합니다. 상세 조회에는 현재 상품 allowlist가 필요하지 않습니다.

생성은 별도 스크립트 확인 화면 없이 선택한 versioned template으로 시작합니다. `client_request_id`와 `Idempotency-Key`를 함께 보내므로 네트워크 실패 후 같은 버튼을 다시 눌러도 동일 요청 ID가 유지됩니다. 접수 직후 상세 화면으로 이동하며, 브라우저를 닫아도 서버 작업은 계속됩니다.

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

`.env.local`에는 backend 주소와 공개 가능한 화면 기본값만 둡니다. `NEXT_PUBLIC_` 값은 브라우저 번들에 포함되므로 API key 같은 비밀값을 넣으면 안 됩니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_INFLUENCER_REFERENCE_URLS=https://example.com/person-front.png,https://example.com/person-side.png
```

단일 URL 호환용 `NEXT_PUBLIC_INFLUENCER_REFERENCE_URL`도 지원합니다. 지정 모델 모드의 레퍼런스는 공개 HTTPS 직접 이미지 URL 1~2개만 허용하며 localhost, 사설망, `data:` URL과 인증 정보가 포함된 URL은 frontend에서 거부합니다. 실제 이미지 내용·크기·형식은 backend가 다시 검수합니다. OpenRouter key는 backend `.env`에만 둡니다.

`NEXT_PUBLIC_` 환경 변수는 `next build` 시점에 고정되므로 값을 바꾼 뒤에는 다시 빌드해야 합니다.

## 생성과 견적 계약

1. `GET /api/v1/reels/generation-templates`로 서버가 지원하는 4/6/8/15초 템플릿과 정확한 장면 구간을 읽습니다.
2. 필수 입력 완료 후 `POST /api/v1/reels/generation-quotes`로 현재 모델·1080p·후보 수 기준 expected/max USD를 받습니다.
3. 설정이 하나라도 바뀌거나 견적이 만료되면 기존 quote는 즉시 무효화합니다.
4. fresh quote가 있을 때만 `POST /api/v1/reels/generate`를 한 번 호출합니다. frontend는 사전 생성한 script 대신 `template_id`, `template_version`, `quote_id`, 안정적인 `client_request_id`를 보냅니다.
5. `GET /api/v1/reels/generate/{jobId}`를 visibility·online 상태와 지수 backoff를 반영해 polling합니다.
6. `COMPLETED`, `PARTIAL_COMPLETED`, `FAILED`에서 자동 polling을 멈춥니다.
7. 실패 후보만 candidate retry API로 다시 요청하며, retry 자체는 사용자의 명시적 클릭에서만 실행됩니다.

화면에 내장된 canonical fallback 템플릿은 API 장애 시 선택 구조를 설명하기 위한 offline display 전용입니다. fallback을 보고 있어도 fresh server quote를 받기 전에는 최종 생성 CTA가 활성화되지 않으며, frontend가 임의 비용이나 유효한 quote를 만들지 않습니다.

견적은 backend가 반환한 값만 표시합니다. 현재 `coverage=video_only`인 경우 provider 영상 비용만 포함된다는 문구를 그대로 노출하며, TTS·스토리지·전송·운영비를 총 production 원가로 오인하지 않도록 구분합니다.

## Production 에셋 경계

[data/production-products.ts](./data/production-products.ts)는 원본 비공개 카탈로그 대신 승인된 최소 레코드만 client bundle에 포함합니다. 현재 30포 사과주스 판매 상품의 대표 에셋은 파우치 1개 이미지이고 `semanticallyExactProductCount=0`입니다. 따라서 생성·상세 화면 모두 아래 제한을 명시합니다.

- 판매 수량 30포를 영상 속 패키지 수로 주장하지 않습니다.
- 패키지의 작은 글자와 세부 표기는 시각적으로 검증됐다고 표시하지 않습니다.
- 이 제한은 로컬 데모 생성을 막지 않지만, 다운로드 전 리뷰에서 계속 보입니다.

기술 검수 통과는 광고 의미 정확성이나 한국어 음성 자연스러움을 보장하지 않습니다. 후보별 기술 메타데이터와 실제 재생 검토를 함께 사용해야 합니다.

상세 UX 및 인수 기준은 [docs/studio-ux-architecture.md](./docs/studio-ux-architecture.md)를 참고하세요.
