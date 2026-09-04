# QUEDOT Shorts Studio Frontend

공동구매 상품에서 production 릴스 후보 1~4개를 생성하고, 후보별 상태·기술 검수 결과·비용을 비교한 뒤 하나를 선택해 다운로드하는 Next.js 16 앱입니다.

## 로컬 실행

Node.js와 backend가 준비된 상태에서:

```bash
npm ci
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. 배포 전 검증은 다음 두 명령을 사용합니다.

```bash
npm run lint
npm run build
```

## 환경 변수

필요한 값만 `.env.local`에 설정합니다. `NEXT_PUBLIC_` 값은 브라우저 번들에 포함되므로 API key 같은 비밀값을 넣으면 안 됩니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_SCRIPT=false
NEXT_PUBLIC_USE_MOCK_FINAL_VIDEO=false
```

인물 레퍼런스는 선택 사항입니다. 아래 값은 화면의 `모델 포함` 모드에 입력할 기본값만 제공합니다. 기본 모드는 `AI 가상 모델 자동 생성`이며, 실존 인물 reference 없이 텍스트 프롬프트로 새 모델을 만들고 상품 이미지만 제품 식별 reference로 전송합니다.

```dotenv
NEXT_PUBLIC_INFLUENCER_REFERENCE_URLS=https://example.com/person-front.png,https://example.com/person-side.png
```

단일 URL 호환용 `NEXT_PUBLIC_INFLUENCER_REFERENCE_URL`도 지원합니다. 화면에서 공개 HTTPS 직접 이미지 URL 1~2개를 확인·수정한 뒤 생성합니다. `localhost`, 사설망, `data:` URL과 인증 정보가 포함된 URL은 frontend에서 거부되며, 이미지 내용·크기·형식은 backend가 다시 검수합니다. 여러 인물이 합쳐진 콘택트시트와 가로형 이미지는 backend 검수에서 거부됩니다. OpenRouter key는 frontend가 아니라 backend `.env`에만 둡니다.

현재 OpenRouter Seedance는 실제 인물 또는 프라이버시 관련 레퍼런스를 provider 단계에서 거부할 수 있습니다. `모델 포함` 모드는 인물이 잘리는 결과를 막기 위해 상품별 `center_crop` 허용 여부와 관계없이 `square_output_strategy=reject`를 강제합니다. `상품만` 모드는 감사된 상품 정책을 그대로 사용합니다.

모든 영상 생성 요청은 사용자가 선택한 `visual_mode`를 명시적으로 전달합니다. `product_only`와 `generated_model` 요청은 `influencer_image_urls`를 생략하며 backend도 서버 환경 변수의 인물 레퍼런스를 적용하지 않습니다. `generated_model`은 상품 이미지를 제품 reference로 보내고 인물은 프롬프트에서 생성합니다. `model_included` 요청만 화면에서 검증한 URL을 `influencer_image_urls`로 함께 전달합니다.

모델 포함 요청의 추가 프롬프트는 제공된 동일 모델의 얼굴을 명확히 유지하고, 립싱크를 하지 않으며, 양손을 프레임 밖에 두고 상품을 가리지 않도록 요구합니다. 완료 화면은 backend의 `visual_mode`와 `influencer_reference_count`를 사용해 실제 작업의 출연 방식과 레퍼런스 수를 표시합니다. 기존 작업처럼 두 필드가 없는 응답은 현재 화면 설정으로 표시하므로 resume 호환성을 유지합니다.

`NEXT_PUBLIC_` 환경 변수는 `next build` 시점에 고정되므로 값을 바꾼 뒤에는 다시 빌드해야 합니다.

## 실제 후보 생성 흐름

1. production 에셋 allowlist의 상품을 선택합니다.
2. `AI 가상 모델 자동 생성`, `상품만`, `모델 포함` 중 하나를 명시적으로 선택합니다. 모델 포함은 공개 HTTPS 인물 이미지 URL 1~2개가 필요합니다.
3. 길이, 채널, CTA, 광고 목적과 후보 수를 지정합니다. 실제 smoke와 비용 경계를 확인한
   기본값은 4초·2개이며, 필요하면 1~4개 후보로 조정합니다.
4. 스크립트를 생성하고 확인합니다.
5. `POST /api/v1/reels/generate`에 `candidate_count`, 명시적 `visual_mode`, 출연 방식에 맞는 per-request 레퍼런스와 크롭 정책을 전달합니다.
6. 상태 URL을 polling하며 공통 단계와 후보별 단계를 표시합니다.
7. `COMPLETED`, `PARTIAL_COMPLETED`, `FAILED`를 최종 상태로 처리합니다.
8. 성공 후보를 비교·선택·다운로드하고, 재시도 가능한 실패 후보만 개별 재시도합니다.

오래 걸리는 후보 생성은 후보 수에 맞춰 polling 제한 시간이 늘어납니다. 기존 단일 영상 응답도 배포 전환 기간 동안 후보 1개로 정규화합니다.

## Production 에셋 allowlist

[data/production-products.ts](./data/production-products.ts)는 2026-09-04 에셋 감사에서 기술 조건을 통과한 22개 상품을 다시 육안·provider 검수한 뒤, 인물·손·얼굴 없이 광고 대상과 대표 단품이 일치한 사과주스 스파우트 파우치 1개만 노출합니다. 30포 판매 상품이지만 입력 이미지에는 대표 파우치 1개만 보이므로 영상에서 수량을 주장하지 않습니다. 인물·규제 표현·다른 SKU가 섞였거나 provider privacy filter가 거부한 이미지는 제외하고, 감사된 정확한 대표 이미지 한 장만 사용합니다. 오해 가능성이 있는 상세 이미지는 보내지 않습니다. 이 파일에는 다음 최소 정보만 체크인됩니다.

- 상품 ID
- 검수된 대표 이미지 URL
- 검수된 상세 레퍼런스 URL
- 감사 시각과 형식·크기·화면비 정책

production 페이지는 원본 비공개 카탈로그 JSON을 import하지 않습니다. 승인된 1개 상품의
최소 레코드만 client bundle에 포함하며, allowlist에 없는 상품은 검색과 목록에서 모두
제외되고 backend 요청에도 전달되지 않습니다. allowlist가 비면 UI가 명시적인 빈 상태를
표시합니다. 요청 시 대표 이미지는 allowlist 값으로, 상세 이미지 목록은 빈 배열로
고정하여 frontend 미리보기와 provider 입력이 일치합니다.

## 기존 작업 다시 열기

브라우저가 닫히거나 새로고침된 뒤에도 작업 ID와 strict allowlist 상품 ID를 사용해 후보 polling을 다시 시작할 수 있습니다.

```text
http://localhost:3000/?job=<job_id>&product_id=<product_id>
```

두 파라미터가 모두 있어야 하며, `product_id`가 allowlist에 없으면 backend를 호출하지 않고 오류를 표시합니다. 개발 환경의 React Strict Mode가 effect를 두 번 실행해도 같은 polling Promise를 재사용하므로 중복 조회 루프가 시작되지 않습니다. 복구 작업에는 새 스크립트 입력 상태가 없으므로 완료 후보 다운로드와 실패 후보 개별 재시도만 지원합니다.

## Mock 모드

- `NEXT_PUBLIC_USE_MOCK_SCRIPT=true`: 스크립트만 mock, 영상은 backend 사용
- `NEXT_PUBLIC_USE_MOCK_FINAL_VIDEO=true`: 영상 후보 생성도 mock

Mock 영상에는 실제 MP4 URL이 없으므로 재생·다운로드와 후보 재시도는 비활성화됩니다.
