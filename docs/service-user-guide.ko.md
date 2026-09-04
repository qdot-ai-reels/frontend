# QUEDOT Shorts Studio 서비스 사용 가이드

> 문서 대상: 영상 제작 운영자, 프롬프트 관리자, 결과 검수자, 개발·운영 담당자
>
> 기능 기준: Backend 88092787479a33490c0da3c832de3df26ae7f5c3 / Frontend 4576de0fd4f63add459637372c82db27d8c25b08
>
> 현재 판정: **로컬 단일 프로세스 Studio GO / 공개 인터넷 Production NO-GO**
>
> 중요: **영상 생성 시작은 provider 비용을 발생시킬 수 있다.** 프롬프트 조회·편집·저장·활성화와 견적 계산·발급은 영상 생성 요청을 보내지 않는다.

이 문서는 QUEDOT Shorts Studio를 처음 여는 순간부터 상품 선택, 영상 전략 선택,
견적 확인, 생성 진행 추적, 후보 검수·다운로드, 프롬프트 버전 관리와 문제 복구까지
화면에서 수행하는 모든 주요 작업을 설명한다.

---

## 1. 가장 먼저 알아야 할 것

### 1.1 서비스가 해결하는 일

Studio는 검수된 상품 에셋으로 짧은 세로형 광고 영상을 만들고 관리하는 운영 콘솔이다.

- 4초, 6초, 8초, 15초 영상 전략을 선택한다.
- AI 가상 모델 또는 상품 중심 영상을 만든다.
- 생성 전에 영상 provider 예상 비용을 확인한다.
- 스크립트, 한국어 음성, 영상 후보, 음성 결합, 자막·기술 검수를 하나의 작업으로 실행한다.
- 브라우저를 닫거나 새로고침해도 영상 라이브러리에서 기존 작업을 다시 연다.
- 광고 상품을 별도 카탈로그에 검수 대기로 등록하고, 사람의 자산 검수 후 생성 대상으로 활성화한다.
- 실제 생성 프롬프트를 코드 수정 없이 새 버전으로 저장하고 활성화한다.

### 1.2 현재 보장 범위

| 구분 | 현재 상태 | 의미 |
| --- | --- | --- |
| 로컬 Studio 화면과 API | GO | 한 컴퓨터의 실행 중인 FastAPI 프로세스와 로컬 DB·파일을 기준으로 사용 가능 |
| 브라우저 새로고침·재접속 | 지원 | 저장된 job을 라이브러리와 상세 화면에서 다시 조회 |
| 프로세스 재시작 중 작업 복구 | 미지원 | 실행 중 worker task는 durable queue가 없어 자동 재개되지 않을 수 있음 |
| 동일 설정의 동일 영상 재생성 | 보장 안 함 | 템플릿·프롬프트·입력은 고정하지만 생성형 영상 자체는 매번 달라질 수 있음 |
| 공개 인터넷·다중 사용자 서비스 | NO-GO | 인증, 권한, durable worker, object storage, 비용 원장 등이 추가로 필요 |

### 1.3 비용 관련 핵심 경고

- **비용이 발생할 수 있는 동작:** 새 영상 만들기의 마지막 단계에서 **영상 생성 시작**을 누르는 동작
- **비용이 발생하지 않는 동작:** 화면 탐색, 라이브러리 조회, 영상 재생·다운로드,
  프롬프트 조회·편집·저장·활성화, generation quote 조회
- 화면의 견적은 현재 **video_only**다.
- script 생성, 한국어 TTS, 렌더링, 저장·전송, 수동 재시도 비용은 견적에 포함되지 않는다.
- Provider 예상 범위 상단은 계정 차원의 결제 hard cap이 아니다.

---

## 2. 전체 메뉴와 사용자 여정

### 2.1 메뉴 요약

| 메뉴 | 주소 | 주요 목적 | 영상 생성 비용 |
| --- | --- | --- | --- |
| 영상 라이브러리 | /videos | 작업 검색, 상태 확인, 결과 재진입 | 없음 |
| 새 영상 만들기 | /create | 상품·전략·광고 방향·비용을 확인하고 생성 시작 | 마지막 생성 버튼에서 발생 가능 |
| 광고 상품 관리 | /products | 상품·이미지 등록, 기술 점검, 의미 검수, 활성·비활성·보관 | 없음 |
| 작업 상세 | /videos/{jobId} | 진행 단계, 후보, 비용, 스크립트 타임라인 확인 | 조회·다운로드는 없음 |
| 프롬프트 설정 | /settings/prompts | 프롬프트 편집, 새 버전 저장, 활성 버전 전환 | 없음 |
| 이전 링크 호환 | /?job={jobId} | 과거 북마크를 작업 상세로 연결 | 없음 |

### 2.2 정보 구조

~~~mermaid
flowchart LR
    U["운영자"] --> NAV["Studio 공통 메뉴"]
    NAV --> LIB["영상 라이브러리<br/>/videos"]
    NAV --> CREATE["새 영상 만들기<br/>/create"]
    NAV --> PRODUCT["광고 상품 관리<br/>/products"]
    NAV --> PROMPT["프롬프트 설정<br/>/settings/prompts"]

    LIB --> DETAIL["작업 상세<br/>/videos/{jobId}"]
    CREATE --> DETAIL
    DETAIL --> COPY["설정 참고해 새 후보 만들기"]
    COPY --> CREATE
    PRODUCT -->|"검수 후 활성 상품"| CREATE
    PROMPT --> CREATE

    LEGACY["이전 주소<br/>/?job=jobId"] --> DETAIL
~~~

### 2.3 권장 기본 여정

~~~mermaid
flowchart TD
    A["프롬프트 설정에서 활성 버전 확인"] --> P["광고 상품 등록·자산 검수·활성화"]
    P --> B["새 영상 만들기"]
    B --> C["1. 활성 상품 선택"]
    C --> D["2. 4·6·8·15초 전략 선택"]
    D --> E["3. 출연 방식과 광고 방향 입력"]
    E --> F["4. 예상 비용·타임라인·프롬프트 버전 확인"]
    F --> G{"비용과 설정 승인?"}
    G -- "아니오" --> E
    G -- "예" --> H["영상 생성 시작<br/>유료 요청 가능"]
    H --> I["작업 상세에서 진행 확인"]
    I --> J["후보 재생·기술 검수·다운로드"]
    J --> K["사람이 최종 광고 품질 승인"]
~~~

---

## 3. 로컬 서비스 실행과 종료

### 3.1 사전 조건

| 항목 | 필요한 상태 |
| --- | --- |
| 루트 환경 파일 | .env에 OPENROUTER_API_KEY가 있어야 함 |
| Backend Python | backend/.venv/bin/python이 설치되어 있어야 함 |
| Frontend 패키지 | frontend/node_modules가 준비되어 있어야 함 |
| Chrome | HyperFrames 렌더러가 사용할 Google Chrome이 설치되어 있어야 함 |
| 포트 | 3000, 8001, 8788이 비어 있어야 함 |

API key 값을 문서, 화면 캡처, 브라우저 환경 변수 또는 NEXT_PUBLIC_ 변수에 넣지 않는다.
OPENROUTER_API_KEY는 backend가 읽는 루트 .env에만 둔다.

### 3.2 시작

먼저 [프로젝트 설치 및 운영 가이드](./project-setup-and-operations-guide.ko.md)처럼
현재 shell의 `QUEDOT_ROOT`에 준비된 통합 workspace의 절대 경로를 지정하고 실행한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
./tools/start_local_stack.sh
~~~

이 스크립트는 `frontend`와 `backend` 형제 폴더를 함께 둔 현재 통합 workspace의
최상위에 있다. `frontend` 저장소만 따로 clone한 환경에는 포함되지 않고 현재 기능 branch도 아직
원격에 없다. Exact revision과 versioned 상위 도구가 전달되기 전에는 fresh clone을 현재 Studio의
실행 환경으로 사용하지 않는다.

시작 스크립트는 다음 순서로 동작한다.

1. 필수 포트와 dependency를 검사한다.
2. HyperFrames 0.8.27 로컬 runner를 8788에서 시작한다.
3. Backend API를 8001에서 시작한다.
4. Frontend를 로컬 Backend 주소로 production build한다.
5. Frontend를 3000에서 시작한다.
6. 세 서비스 readiness를 통과하면 접속 주소를 출력한다.

### 3.3 접속 주소

- Studio: http://127.0.0.1:3000/videos
- Backend health: http://127.0.0.1:8001/health
- HyperFrames health: http://127.0.0.1:8788/health

### 3.4 종료와 로그

- 시작 명령을 실행한 터미널에서 Control-C를 누르면 세 프로세스를 함께 종료한다.
- 이미 포트가 사용 중이면 새 stack을 중복 실행하지 않고 기존 프로세스를 먼저 확인한다.
- 로그 위치:
  - backend/runtime/local-stack/backend.log
  - backend/runtime/local-stack/frontend.log
  - backend/runtime/local-stack/hyperframes.log

---

## 4. 공통 화면 동작

### 4.1 Desktop과 Mobile 메뉴

- Desktop에서는 왼쪽 sidebar에 영상 라이브러리, 새 영상 만들기, 광고 상품 관리, 프롬프트 설정이 표시된다.
- Mobile에서는 같은 네 메뉴가 화면 하단 navigation으로 표시된다.
- QUEDOT Shorts Studio 브랜드 로고를 누르면 영상 라이브러리로 이동한다.
- 키보드 사용자는 첫 focus의 **본문으로 바로가기**로 공통 메뉴를 건너뛸 수 있다.
- 현재 메뉴는 색상과 aria-current로 구분된다.
- 작업 상세는 영상 라이브러리 메뉴에 포함된 화면으로 표시된다.

### 4.2 작업 상태 용어

| 서버 상태 | 화면 표시 | 사용자 의미 |
| --- | --- | --- |
| PENDING | 대기 중 | 요청은 접수됐고 실행을 기다리는 상태 |
| PROCESSING | 생성 중 | 스크립트·음성·영상·렌더링 중 하나를 처리하는 상태 |
| COMPLETED | 사용 가능 | 모든 필수 처리가 끝났고 사용 가능한 후보가 있는 상태 |
| PARTIAL_COMPLETED | 일부 완료 | 일부 후보는 사용할 수 있지만 다른 후보는 실패한 상태 |
| FAILED | 확인 필요 | 작업 또는 필수 공통 단계가 완료되지 않은 상태 |

### 4.3 실시간 상태와 마지막 확인 상태

- 진행 중 작업이 있으면 목록은 약 4초, 상세는 약 3.5초 간격으로 서버 상태를 확인한다.
- 탭이 숨겨지거나 네트워크가 오프라인이면 불필요한 요청을 멈춘다.
- 다시 온라인이 되고 탭이 보이면 즉시 최신 상태를 확인한다.
- 일시적인 오류가 나도 마지막으로 성공한 데이터가 있으면 지우지 않고 **마지막 확인 상태**로 표시한다.
- Terminal 상태인 COMPLETED, PARTIAL_COMPLETED, FAILED에서는 자동 polling을 멈춘다.

### 4.4 반응형·키보드·접근성

| 화면 폭 | 주요 배치 |
| --- | --- |
| Desktop 1440px | 왼쪽 sidebar, 최대 1240px 본문, create 요약과 detail 비용 aside를 함께 표시 |
| Tablet 768~900px | Create/detail을 1열로 바꾸고 비용·설정 card를 재배치 |
| Mobile 767px 이하 | 상단 brand, 하단 safe-area navigation, 1열 form·후보, 화면 폭 CTA |

- Mobile wizard는 단계 이름을 줄이고 번호 중심으로 표시한다.
- Prompt textarea는 16px 글자 크기를 사용해 iOS focus 확대를 방지한다.
- Mobile의 wizard action과 prompt save bar는 하단 navigation 위에 고정된다.
- Native visual-mode radio는 keyboard arrow key를 사용할 수 있다.
- 상품·template custom radio card는 Tab으로 이동한 뒤 Enter 또는 Space로 선택한다.
- Prompt activation 확인이 열리면 취소 버튼에 focus가 가고 Tab/Shift-Tab 순환,
  Escape 취소와 trigger focus 복귀를 지원한다.
- Loading은 aria-busy, 오류는 role=alert, 안내는 status/live region,
  후보 완료율은 progressbar로 제공한다.
- prefers-reduced-motion 환경에서는 spinner·pulse·transition을 최소화한다.

현재 실제 브라우저 인수 기준은 Chrome이다. Navigation API가 없는 브라우저의 복잡한 Back history
이동과 background를 완전히 inert 처리하는 modal 동작은 공개 지원 전 추가 검증이 필요하다.

---

## 5. 광고 상품 관리

주소: /products

광고 상품 관리는 영상 생성에 사용할 상품과 이미지 자산의 운영 카탈로그다. 상품을 저장했다고
즉시 생성에 노출하지 않는다. **기술 검증**과 **사람의 의미 검수**를 분리하고, 명시적으로
활성화한 상품만 새 영상 만들기에서 선택할 수 있다. 상품 등록·수정·상태 변경 자체는 영상
provider 생성 요청을 보내지 않으므로 영상 생성 비용이 발생하지 않는다.

### 5.1 상품 상태

| 화면 상태 | API 상태 | 새 영상 선택 | 의미 |
| --- | --- | --- | --- |
| 검수 대기 | is_active=false, archived_at=null | 불가 | 저장 또는 수정은 끝났지만 운영자 의미 검수가 끝나지 않음 |
| 활성 | is_active=true, archived_at=null | 가능 | 기술 점검과 사람의 자산 검수 확인이 모두 기록됨 |
| 보관됨 | is_active=false, archived_at 있음 | 불가 | 목록 기록은 유지하지만 현재 사용하지 않는 상품 |

상단의 전체·활성·검수 대기·보관 카드는 현재 카탈로그 수량과 상태 필터 역할을 함께 한다.
검색에서는 상품명, 브랜드·큐레이터, 공구·이벤트명과 상품 ID를 찾을 수 있다.

### 5.2 새 상품 등록 흐름

~~~mermaid
flowchart TD
    A["광고 상품 관리에서 상품 추가"] --> B{"입력 방법"}
    B -->|"직접 입력"| C["기본 정보·이미지·광고 문맥 입력"]
    B -->|"상품 JSON 불러오기"| D["객체 한 개 붙여넣기"]
    D --> E["알려진 필드만 form에 채움"]
    E --> C
    C --> F["검수 대기로 저장"]
    F --> G["Backend URL·다운로드·파일 기술 규격 검사"]
    G -->|"실패"| H["오류 확인 후 자산 수정"]
    H --> C
    G -->|"통과"| I["is_active=false로 영속화"]
    I --> J["운영자가 대표 이미지와 광고 주장을 직접 검수"]
    J --> K["검수 근거 입력 + 확인 checkbox"]
    K --> L["활성화"]
    L --> M["새 영상 만들기 상품 목록에 표시"]
~~~

1. 공통 메뉴에서 **광고 상품 관리**를 연다.
2. 우측 상단 **상품 추가**를 누른다.
3. 필수 상품명과 공개 HTTPS 대표 이미지 URL을 입력한다.
4. 브랜드, 공구명, 옵션, 판매가, 할인, 카테고리, 판매 포인트와 상세 이미지를 가능한 범위에서 채운다.
5. **검수 대기로 저장**을 누른다. 신규 상품은 활성 요청 값을 가져오거나 붙여 넣어도 항상 비활성으로 저장된다.
6. 저장 후 열리는 활성화 확인에서 이미지를 직접 보고 검수 근거를 입력한다.
7. 세 가지 검수 항목을 확인하고 checkbox에 동의한 뒤 **검수 기록 후 활성화**를 누른다.

### 5.3 입력 필드

| 구역 | 필드 | 필수 | 운영 의미 |
| --- | --- | --- | --- |
| 기본 정보 | 상품명 | 필수 | 목록, 생성 snapshot과 결과에서 표시하는 이름 |
| 기본 정보 | 브랜드 / 큐레이터 | 권장 | 생성 문맥과 운영 검색에 사용 |
| 기본 정보 | 공구 / 이벤트명 | 권장 | 어떤 판매 이벤트용 소재인지 구분 |
| 기본 정보 | 상품 옵션 | 권장 | 색상·용량·구성 등 실제 광고 대상을 고정 |
| 기본 정보 | 판매가·할인 표시 | 선택 | 입력 시 실제 판매 조건과 일치하는지 사람이 확인 |
| 기본 정보 | 카테고리 | 권장 | 쉼표로 여러 값을 구분 |
| 기본 정보 | 상품 ID | 선택 | 비우면 서버가 생성; 저장 후 변경 불가 |
| 이미지 자산 | 대표 이미지 URL | 필수 | 인증 정보가 없는 공개 HTTPS 원본 |
| 이미지 자산 | 상세 이미지 URL | 선택 | 줄바꿈 또는 쉼표로 구분, 중복 제거, 최대 8개 |
| 이미지 자산 | 정사각 처리 | 필수 | 중앙 크롭 허용 또는 정사각 이미지 거부 |
| 광고 문맥 | 핵심 판매 포인트 | 권장 | 확인된 특징과 효익만 기록해 모델의 추측을 줄임 |
| 광고 문맥 | 자산 검수 준비 메모 | 권장 | 보이지 않는 수량·라벨·주장 등 사용 제한을 기록 |

대표 이미지는 입력 중 미리보기를 제공한다. 임의의 운영 도메인을 build 시점 allowlist에 넣지
않아도 되도록 브라우저가 직접 표시하지만, URL에는 사용자명·비밀번호를 포함할 수 없고 HTTP,
javascript, data scheme은 허용하지 않는다.

### 5.4 상품 JSON 불러오기

**상품 JSON 불러오기**는 기존 데이터 한 건을 form에 옮기는 보조 기능이다.

- 배열이나 여러 상품의 일괄 등록·일괄 활성화는 지원하지 않는다.
- `product`, `item`, `data`, `raw_product` envelope 안의 알려진 상품 필드를 읽는다.
- 화면에 표시되지 않는 임의 필드로 검수나 활성화를 우회하지 않는다.
- JSON을 불러온 직후에는 서버 요청이 발생하지 않는다.
- 반드시 이미지 미리보기와 form 값을 확인한 뒤 **검수 대기로 저장**해야 한다.

예시:

~~~json
{
  "name": "광고할 상품명",
  "curator": "브랜드명",
  "image_url": "https://cdn.example.com/product.jpg",
  "detail_image_urls": ["https://cdn.example.com/detail-1.jpg"],
  "category_group": ["식품"],
  "selling_point": "확인된 핵심 특징"
}
~~~

### 5.5 기술 검증과 의미 검수

두 검증은 서로 대체하지 않는다.

| 계층 | 담당 | 확인 내용 | 자동 보장하지 않는 것 |
| --- | --- | --- | --- |
| 기술 검증 | Backend | 공개 HTTPS, 다운로드 가능 여부, 형식·용량·해상도·종횡비와 provider readiness | 사진 속 제품의 실제 정체, 옵션, 수량, 표시·효능의 진실성 |
| 의미 검수 | 운영자 | 실제 광고 상품과 이미지 일치, 구성 수량, 라벨, 할인·효능 주장, 사용 제한 | provider가 생성할 최종 장면 품질 |
| 결과 검수 | 운영자 | 생성 후보의 제품 보존, 자막·음성, 광고 오해 가능성 | 다른 후보나 다음 생성의 동일성 |

상품 카탈로그를 저장하거나 이미지 URL을 수정할 때에는 대표 이미지와 모든 상세 이미지가 각각
15 MiB 이하의 실제 JPEG/JPG, PNG 또는 WebP 파일이어야 한다. 가로·세로는 모두 512px 이상,
긴 변과 짧은 변의 비율은 4:1 이하여야 한다. 상세 이미지 하나라도 이 기준을 통과하지 못하면
조용히 제외하지 않고 상품 저장 전체를 거부한다. 아래 7.5절의 100/240px 기준은 생성 실행 시
입력을 다시 확인하는 기준이며 카탈로그 등록 허용 기준이 아니다.

활성화 창에는 대표 이미지, 상품 ID와 revision이 표시된다. **검수 근거**는 비워 둘 수 없고,
확인 checkbox를 선택해야 활성화 API가 호출된다. 기술 검증이 성공했다는 사실만 복사해 넣지 말고,
실제로 확인한 옵션·수량·사용 금지 주장을 적는다.

### 5.6 수정·비활성화·보관·복구

- **편집:** 저장된 상품의 모든 운영 필드를 수정한다. 어떤 수정이든 기존 활성 검수를 무효화하고
  상품을 자동 비활성화한다. 수정 후 새 revision의 자산을 다시 보고 활성화한다.
- **비활성화:** 상품 기록은 유지하되 즉시 새 영상 선택 목록에서 제외한다.
- **보관:** soft archive다. DB 기록과 기존 job snapshot은 삭제하지 않는다.
- **복구 및 활성화:** 보관 상품도 같은 의미 검수 dialog를 다시 통과하면 archived_at을 지우고 활성화한다.

활성 상품을 수정하거나 보관하는 동안 이미 접수된 job의 상품 snapshot은 바뀌지 않는다. 반대로
아직 생성 요청을 보내지 않은 Create 화면은 최신 활성 카탈로그를 다시 확인해야 한다.

### 5.7 동시 편집과 revision 보호

~~~mermaid
sequenceDiagram
    participant A as 운영자 A
    participant B as 운영자 B
    participant API as Product API
    participant DB as Catalog DB

    A->>API: GET products
    B->>API: GET products
    API-->>A: product revision 3
    API-->>B: product revision 3
    A->>API: PUT expected_revision=3
    API->>DB: revision 4, 자동 비활성화
    API-->>A: revision 4
    B->>API: activate expected_revision=3
    API-->>B: 409 PRODUCT_REVISION_CONFLICT
    B->>API: GET products
    API-->>B: 최신 revision 4
~~~

편집, 활성화, 비활성화, 보관은 화면이 읽은 `expected_revision`을 함께 보낸다. 다른 탭이나
운영자가 먼저 변경해 revision이 달라지면 서버는 덮어쓰지 않고 409를 반환한다. 단, 이미 보관된
상품에 같은 보관 요청을 다시 보내는 경우에는 멱등 재시도로 처리해 stale revision이어도 현재 보관
상태를 200으로 반환한다. 그 밖의 충돌에서는 화면이 최신 목록을 다시 불러오며, 기존 입력이 최신
상품에도 맞는지 확인한 뒤 다시 저장해야 한다.

---

## 6. 영상 라이브러리

주소: /videos

영상 라이브러리는 생성된 job을 다시 찾는 기본 시작 화면이다. 브라우저를 닫은 뒤에도
서버 DB에 저장된 작업을 이 화면에서 다시 조회한다.

### 6.1 상단 요약 카드

| 카드 | 의미 |
| --- | --- |
| 조회 결과 | 현재까지 화면에 불러온 작업 수 |
| 진행 중 | PENDING 또는 PROCESSING 작업 수 |
| 사용 가능 | COMPLETED 작업 수 |
| 확인 필요 | FAILED와 PARTIAL_COMPLETED 작업 수 |
| 표시 작업 실제 비용 | 표시된 모든 작업에 실제 비용 기록이 있을 때만 합산, 하나라도 없으면 미확정 |

요약은 전체 서비스의 영구 통계가 아니라 **현재 불러온 결과 범위**에 대한 요약이다.

### 6.2 검색과 필터

| 필터 | 값 | 적용 범위 |
| --- | --- | --- |
| 검색 | 상품명 또는 작업 ID | 현재까지 불러온 cursor 페이지 |
| 상태 | 모든 상태, 대기 중, 생성 중, 사용 가능, 일부 완료, 확인 필요 | 서버 조회 |
| 길이 | 모든 길이, 4초, 6초, 8초, 15초 | 현재까지 불러온 cursor 페이지 |

- 필터는 URL query에 보존된다.
- 검색과 길이 필터는 서버 전체 검색이 아니라 현재 불러온 페이지에 적용된다.
- **더 보기**를 누르면 불러온 범위와 검색 범위가 함께 늘어난다.
- 서버 page 기본 크기는 24개이며 API 계약상 한 번에 최대 100개까지 요청할 수 있다.
- **필터 초기화**는 query, status, duration을 모두 제거한다.

예시:

~~~text
/videos?status=COMPLETED&duration=15
/videos?query=사과주스
~~~

### 6.3 작업 행에서 확인하는 정보

- 상품 이미지와 상품명
- 작업 상태 badge
- 선택한 영상 템플릿
- 사용 가능한 후보 수 / 요청 후보 수
- 대표 단품 에셋·수량 미검증 경고
- job ID
- 실제 기록 비용 또는 예상 비용
- 생성 시각
- 진행 중 메시지
- 재생 가능한 후보가 있는지 나타내는 표시

작업 행을 누르면 /videos/{jobId} 상세 화면으로 이동한다.

### 6.4 목록 상태별 행동

| 화면 상태 | 표시 내용 | 사용자 행동 |
| --- | --- | --- |
| 최초 로딩 | Skeleton 목록 | 잠시 기다림 |
| 작업 없음 | 아직 만든 영상이 없습니다 | 첫 영상 만들기 선택 |
| 필터 결과 없음 | 조건에 맞는 영상이 없습니다 | 필터 초기화 또는 검색 변경 |
| 오프라인, 기존 목록 없음 | 오프라인 안내 | 연결 복구 대기 |
| 오프라인, 기존 목록 있음 | 마지막 확인 목록 유지 | 실시간 상태가 아님을 인지 |
| API 오류 | 오류와 다시 시도 | 다시 시도, 기존 목록은 유지 |
| 다음 페이지 있음 | 더 보기 | 추가 cursor 페이지 조회 |

---

## 7. 새 영상 만들기

주소: /create

### 7.1 생성 전에 확인할 것

1. 현재 프롬프트 활성 버전이 의도한 release인지 확인한다.
2. 상품 이미지가 실제 판매 구성을 정확히 보여주는지 확인한다.
3. 생성 길이와 후보 수에 따른 비용을 확인한다.
4. CTA와 광고 목적에 검증되지 않은 효능·할인·수량 주장이 없는지 확인한다.
5. 마지막 생성 버튼은 실제 provider 비용을 발생시킬 수 있음을 확인한다.

### 7.2 생성 전체 호출 흐름

~~~mermaid
sequenceDiagram
    actor Operator as 운영자
    participant FE as Studio Frontend
    participant API as Backend API
    participant DB as Local DB
    participant Worker as Background Task
    participant AI as Script·TTS·Video Provider
    participant Render as HyperFrames

    FE->>API: 활성 프롬프트 버전 조회
    API-->>FE: active ID·version·SHA
    FE->>API: 4·6·8·15초 템플릿 조회
    API-->>FE: versioned scene plan
    Operator->>FE: 상품·전략·광고 방향 입력
    FE->>API: Generation quote 요청
    API->>DB: 15분 immutable quote 저장
    API-->>FE: video_only 예상값·상단·만료·프롬프트 snapshot
    Note over FE,API: 여기까지 영상 생성 요청 없음
    Operator->>FE: 영상 생성 시작 승인
    FE->>API: quote + client_request_id + Idempotency-Key
    API->>DB: request 예약과 job 저장
    API-->>FE: HTTP 202 + job ID
    API-)Worker: 비동기 작업 시작
    Worker->>AI: 스크립트와 한국어 음성 생성
    Worker->>AI: 영상 후보 생성
    AI-->>Worker: 영상·음성 artifact
    Worker->>Worker: ffmpeg 음성 결합·기술 확인
    Worker->>Render: Caption 렌더링 요청
    Render-->>Worker: 자막 적용 후보
    Worker->>Worker: 최종 기술 QC
    Worker->>DB: 단계·후보·비용·artifact 기록
    FE->>API: job 상태 polling
    API-->>FE: 현재 단계와 후보
~~~

현재 Worker는 durable queue가 아니라 FastAPI BackgroundTasks 경계다.
프로세스가 살아 있는 동안의 로컬 사용에는 적합하지만, 처리 중 프로세스 재시작 복구를 보장하지 않는다.

### 7.3 Step 1 — 상품

화면에는 광고 상품 관리에서 **활성화한 최신 상품 revision**만 표시된다.

- 상품 카드에서 이미지, 큐레이터, 상품명, 옵션을 확인한다.
- 선택된 카드는 radio 상태로 표시된다.
- 검수 대기·비활성·보관 상품은 생성 대상으로 표시하지 않는다.
- 상품마다 **에셋 주의** 내용을 반드시 읽는다.
- 필요한 상품이 없으면 광고 상품 관리로 이동해 등록·기술 검증·의미 검수·활성화를 완료한다.

Backend는 생성 요청의 `product_id`와 `product_catalog_revision`을 활성 카탈로그와 다시 대조한다.
상품이 비활성화됐거나 수정되어 revision이 바뀌었으면 오래 열린 Create 화면의 snapshot을 그대로
접수하지 않고 최신 상품을 다시 선택하도록 안내한다. 이 검사는 stale·변조 요청을 막지만 이미지가
광고 주장 전체를 입증하는지는 보장하지 않으므로 등록 때 남긴 자산 검수 메모를 함께 따른다.

### 7.4 Step 2 — 영상 전략

전략은 길이 숫자만 저장하는 것이 아니라 장면 순서와 구간을 포함하는 versioned template이다.
API가 알려 주는 `default_template_id`는 15초 풀 스토리다. 다만 현재 Create 화면은 처음 열 때
아무 전략도 자동 선택하지 않으므로, 15초가 선택됐다고 가정하지 말고 화면에서 원하는 카드를
직접 선택한 뒤 선택 표시를 확인한다.

| 전략 ID | 화면 이름 | 고정 장면 구성 | 권장 용도 |
| --- | --- | --- | --- |
| ugc_quick_4 v1 | 4초 초압축 | 0–1.2 Hook / 1.2–2.8 Product / 2.8–4 CTA | 가장 저렴한 기술·스타일 smoke |
| ugc_quick_6 v1 | 6초 빠른 소개 | 0–1.5 Hook / 1.5–3.5 Product / 3.5–4.8 Lifestyle / 4.8–6 CTA | 짧은 전환 광고 |
| ugc_balanced_8 v1 | 8초 균형형 | 0–2 Hook / 2–4.5 Product / 4.5–6.5 Lifestyle / 6.5–8 CTA | 상품과 사용 분위기 균형 |
| ugc_full_15 v1 | 15초 풀 스토리 | 0–3 Hook / 3–8 Product / 8–12 Lifestyle / 12–15 CTA | 설명과 분위기가 모두 필요한 본편 |

- 장면별 한국어 발화 최대 음절은 4초가 5/7/5, 6초가 6/9/5/5,
  8초가 9/11/9/6, 15초가 13/22/18/13이다.
- 현재 provider가 길이, 9:16, 1080p를 정확히 지원하지 않으면 해당 조합을 차단한다.
- 15초 요청을 임의로 8초 등 더 짧은 값으로 낮추지 않는다.
- API가 실패했을 때 보이는 fallback template은 구조 설명용이다.
- Fresh server quote가 없으면 fallback만으로 생성 버튼은 활성화되지 않는다.

### 7.5 Step 3 — 크리에이티브

#### 출연 방식

| 출연 방식 | 동작 | 현재 권장 |
| --- | --- | --- |
| AI 가상 모델 | 실존 인물 reference 없이 prompt로 성인 가상 모델 생성 | 일반 UGC형 광고 기본값 |
| 상품만 | 검수된 상품 이미지만 사용 | 제품 보존을 우선하는 안전한 smoke |
| 지정 모델 | 공개 HTTPS 인물 이미지 1~2개 사용 | 현재 Seedance 경로에서는 비활성 |

지정 모델은 모델 이름만 보고 자동 활성화하지 않는다. Provider capability와 배포 feature flag를
모두 통과해야 한다. Backend는 URL 안전성, 파일 크기, 형식, 해상도와 reference 종횡비를
확인한다. 이미지 내용, 한 사람만 포함됐는지, 인물 동의·사용 권리와 상품 의미는 자동 판별하지
않으므로 사람의 사전 검수와 provider 결과 검수가 별도로 필요하다.

#### 이미지와 인물 reference 허용 기준

| 항목 | Backend 검증 기준 |
| --- | --- |
| URL | 공개 IP로 해석되는 HTTPS 주소만 허용. 사용자명·비밀번호, localhost, 사설·link-local·reserved 주소와 안전하지 않은 redirect는 거부 |
| 운영 host 제한 | `ALLOWED_IMAGE_HOSTS`가 설정된 경우 등록된 CDN host 또는 허용 wildcard만 사용 |
| 파일 크기 | 이미지 한 장당 최대 15 MiB(15×1024×1024 bytes) |
| 파일 형식 | JPEG/JPG, PNG, WebP. BMP는 지원하지 않음 |
| 생성 요청의 상품·필수 이미지 크기 | 가로·세로 각각 최소 100px. 카탈로그 등록에는 5.5절의 더 엄격한 512px·4:1 기준 적용 |
| 생성 요청의 상품 상세 이미지 크기 | 가로·세로 각각 최소 240px. 생성 시 선택 reference이므로 부적합하면 제외될 수 있지만, 카탈로그 저장 시에는 모든 상세 이미지가 512px·4:1 기준을 통과해야 함 |
| 지정 모델 reference | 중복을 제거한 뒤 최대 2장, 가로·세로 각각 최소 256px |
| 지정 모델 구도 | 운영 기준은 한 사람만 보이는 세로형 또는 정사각형. Backend는 의미를 판별하지 않으며 `가로/세로 > 1.1`인 가로형 contact sheet를 자동 거부 |

확장자나 URL 문자열만 통과시키는 방식이 아니다. Backend가 이미지를 최대 15 MiB 범위에서
안전하게 내려받아 실제 codec과 크기를 확인하므로, 로그인·cookie·특수 header가 필요한 링크나
HTML 공유 페이지 주소는 직접 이미지 URL로 사용할 수 없다.
기술 검사를 통과한 이미지라도 민감하거나 동의가 불명확한 인물 내용은 provider가 뒤늦게 거절할 수 있다.

#### 입력 필드

| 필드 | 필수 | 제한 | 설명 |
| --- | --- | --- | --- |
| CTA | 필수 | 500자 | 시청자가 마지막에 취할 행동 |
| 광고 목적 | 필수 | 1,000자 | 인지도, 상세 페이지 유입, 공동구매 전환 등 |
| 노출 채널 | 선택 | 고정 선택지 | Instagram Reels, YouTube Shorts, TikTok |
| 영상 후보 수 | 선택 | 1~4개 | 비용은 길이 × 후보 수에 비례 |
| 꼭 포함 | 선택 | 2,000자 | 반드시 표현해야 할 검증된 요소 |
| 포함 금지 | 선택 | 2,000자 | 과장, 수량, 효능, 특정 연출 등 금지 조건 |
| 기타 요청 | 선택 | 4,000자 | 분위기, 카메라, 배경 등 추가 방향 |
| 모델 이미지 URL 1 | 지정 모델일 때 필수 | 2,048자 | 공개 HTTPS 직접 이미지 |
| 모델 이미지 URL 2 | 지정 모델일 때 선택 | 2,048자 | 보조 각도 reference |

#### 사과주스 입력 예시

| 필드 | 예시 |
| --- | --- |
| CTA | 제품 상세는 지금 링크에서 확인하세요 |
| 광고 목적 | 바쁜 일상에서 간편하게 즐기는 사과주스의 인지도와 상세 페이지 유입 |
| 꼭 포함 | 분홍색 사과주스 파우치 한 개, 밝고 자연스러운 주방 분위기 |
| 포함 금지 | 30포 수량 주장, 박스 구성, 할인율, 건강 효능, 읽을 수 없는 라벨 생성 |
| 기타 요청 | 자연광, 과도한 카메라 흔들림 금지, 상품 전면이 가려지지 않게 구성 |

### 7.6 Step 4 — 비용 확인

검토 화면에서 다음을 한 번에 확인한다.

- 선택 템플릿과 장면별 시간
- 견적에 고정된 프롬프트 이름·버전
- 상품 에셋 주의사항
- Provider 예상값
- Provider 예상 범위 상단
- 응답에 있을 경우 사용 가능 잔액
- 비용 line item
- coverage와 제외 비용
- quote ID와 만료 시각
- 오른쪽 요약의 상품, 전략, 출연 방식, 후보 수, 화면 규격, 예상 비용

기본 rate 설정은 영상 1초·후보 1개당 0.38 USD이며 환경 설정으로 바뀔 수 있다.

~~~text
예상값 = 영상 길이 × 후보 수 × 현재 rate
기본 하단 = 예상값 × 0.95
기본 상단 = 예상값 × 1.10
Quote 유효 시간 = 15분
~~~

예를 들어 기본 rate에서 15초 후보 1개는 예상값 5.70 USD다.
이 숫자는 provider rate 기반 추정치이며 최종 production 총원가나 결제 hard cap이 아니다.

후보 1개에 대한 기본 rate 예시는 다음과 같다.

| 길이 | 예상 하단 | 예상값 | 예상 상단 |
| ---: | ---: | ---: | ---: |
| 4초 | 1.444 USD | 1.520 USD | 1.672 USD |
| 6초 | 2.166 USD | 2.280 USD | 2.508 USD |
| 8초 | 2.888 USD | 3.040 USD | 3.344 USD |
| 15초 | 5.415 USD | 5.700 USD | 6.270 USD |

후보 수가 2~4개면 각 금액도 후보 수에 비례한다. 항상 화면의 최신 server quote를 최종 기준으로 사용한다.

### 7.7 생성 버튼이 활성화되는 조건

다음 조건이 모두 충족되어야 한다.

- 활성 프롬프트 버전을 정상 조회함
- CTA와 광고 목적을 입력함
- 지원되는 template과 정확한 version을 선택함
- 현재 모든 입력과 일치하는 fresh quote가 있음
- Quote가 만료되지 않음
- Quote에 provider 예상 범위 상단이 있음
- 잔액 정보가 있을 경우 예상 범위 상단보다 부족하지 않음
- 제출 중인 요청 또는 미확정 이전 요청이 없음

상품, template, 출연 방식, 후보 수, CTA, 광고 목적, 채널, 고급 요청, reference,
활성 prompt version 중 하나라도 바뀌면 기존 quote는 stale이 되고 새로 계산한다.

### 7.8 영상 생성 시작 이후

1. Frontend가 생성 직전에 exact request body를 sessionStorage에 임시 저장한다.
2. 동일 client_request_id를 body와 Idempotency-Key에 함께 넣는다.
3. Backend가 request reservation과 job을 저장한다.
4. HTTP 202와 job ID를 받으면 임시 요청 기록을 제거한다.
5. Frontend가 작업 상세로 이동한다.
6. Backend가 script → TTS → video → audio merge → caption/QC를 비동기로 진행한다.

한국어 TTS는 scene마다 서로 다른 목소리를 따로 합치는 대신 전체 voiceover를 한 문장 흐름으로
합성해 발화 일관성을 유지한다. Scene 정보는 길이 보정과 caption cue에 계속 사용된다.

버튼을 여러 번 누르거나 네트워크가 재전송하더라도 동일 ID와 동일 body는 같은 job을 반환한다.
동일 ID에 다른 body를 붙이면 충돌로 거부한다.

### 7.9 응답이 끊긴 요청 복구

브라우저가 job ID를 받기 전에 응답이 끊겼다고 해서 새 생성 요청을 만들면 안 된다.

~~~mermaid
flowchart TD
    A["이전 요청 snapshot 발견"] --> B["client_request_id로 서버 상태 조회"]
    B --> C{"request_state"}
    C -- "ACCEPTED" --> D["기존 job 상세로 이동"]
    C -- "IN_PROGRESS" --> E{"recoverable"}
    E -- "false" --> J["retry_after_seconds 뒤 동일 ID 재조회"]
    J --> B
    E -- "true" --> F["사용자가 안전 복구 선택"]
    F --> G["저장된 동일 body·동일 ID만 재전송"]
    C -- "REJECTED" --> K{"error.code"}
    K -- "REQUOTE_REQUIRED 또는 QUOTE_NOT_FOUND" --> H["새 요청 ID와 fresh quote로 복귀"]
    K -- "그 밖의 거절" --> L["입력 수정·새 요청 ID·fresh quote로 다시 시작"]
    B -- "404 NOT_FOUND" --> F
    B -- "네트워크 오류 또는 불명확" --> I["요청 잠금 유지·자동 재확인"]
    I --> B
~~~

화면의 복구 banner에서 사용할 수 있는 행동:

- **라이브러리 확인:** 이미 접수된 작업이 보이는지 확인
- **접수 상태 다시 확인:** 기존 request ID의 서버 reservation 재조회
- **같은 요청 ID로 안전 복구:** 서버가 recoverable로 판정했고 exact body가 남아 있을 때만 실행

한 번의 404나 일시적 네트워크 오류만으로 새 request ID를 만들지 않는다.

반대로 서버가 `request_state=REJECTED`를 확정하면 그 거절은 기존 `client_request_id`에
영구 기록된다. `REQUOTE_REQUIRED`, `QUOTE_NOT_FOUND`, `REQUEST_VALIDATION_FAILED`를 고친 뒤에는
**fresh quote와 새 client_request_id**로 새 요청을 시작한다. 거절된 ID에 같은 body를 다시 보내면
같은 거절이 replay되고, 수정한 body를 붙이면 409 idempotency conflict가 날 수 있다.

`IDEMPOTENCY_KEY_MISMATCH`나 request reservation을 만들기 전에 발생한 schema 422처럼 서버가
요청을 예약하지 못한 오류는 header/body를 바로잡은 뒤 동일 ID를 다시 쓸 수 있다. 확정된 거절인지
불명확하면 새 유료 요청을 만들지 말고 접수 상태를 먼저 조회한다.

### 7.10 이전 작업 설정 복사

작업 상세의 **설정 참고해 새 후보 만들기**를 누르면 /create?from_job={jobId}로 이동한다.

- 상품, template, 출연 방식, 후보 수, CTA, 광고 목적, 채널과 고급 요청을 가능한 범위에서 복사한다.
- 보안상 지정 모델 reference URL은 복사하지 않는다.
- 새 작업이므로 fresh quote를 다시 확인한다.
- 같은 설정이어도 동일한 영상이 생성된다고 보장하지 않는다.

---

## 8. 작업 상세

주소: /videos/{jobId}

### 8.1 화면 구성

| 영역 | 확인 내용 |
| --- | --- |
| 상단 상품 정보 | 상품, status, template, 출연 방식, 후보 수, job ID |
| 생성 진행 | 현재 stage, 전체 단계, 사용 가능한 후보 수와 완료율 |
| 영상 후보 | 재생, 기술 metadata, 비용, 선택, 다운로드 |
| 스크립트 타임라인 | 장면 시간, 화면, 보이스오버, 자막, 메모, timing 결과 |
| 비용 | 예상값, provider 예상 상단, 실제 기록 |
| 생성 설정 | template/version, 출연 방식, 채널, CTA, 광고 목적, prompt version/hash, 생성 시각 |

### 8.2 생성 단계

~~~mermaid
stateDiagram-v2
    [*] --> Queued
    state "작업 접수" as Queued
    state "스크립트 생성·조정" as Script
    state "한국어 음성 생성·검수·길이 조정" as TTS
    state "영상 후보 생성" as Video
    state "음성 결합" as Merge
    state "자막 렌더링·검수" as Caption
    state "후보 terminal 결과 집계" as Aggregate
    state "사용 가능" as Completed
    state "일부 완료" as Partial
    state "확인 필요" as Failed

    Queued --> Script
    Script --> TTS
    TTS --> Video
    Video --> Merge: 해당 후보 성공
    Video --> Aggregate: 해당 후보 실패
    Merge --> Caption: 해당 후보 성공
    Merge --> Aggregate: 해당 후보 실패
    Caption --> Aggregate: 해당 후보 성공 또는 실패
    Aggregate --> Completed: 모든 후보 성공
    Aggregate --> Partial: 성공·실패 후보 혼재
    Aggregate --> Failed: 성공 후보 없음
    Script --> Failed
    TTS --> Failed
    Completed --> [*]
    Partial --> [*]
    Failed --> [*]
~~~

세부 서버 stage는 다음 화면 단계로 묶인다.

| 서버 stage | 화면 단계 | 대표 안내 |
| --- | --- | --- |
| QUEUED | 작업 접수 | 생성 작업을 준비하고 있습니다 |
| SCRIPT_GENERATION | 스크립트 | 스크립트를 생성하고 있습니다 |
| SCRIPT_REGENERATION | 스크립트 | 음성 길이에 맞게 스크립트를 다시 생성하고 있습니다 |
| TTS_GENERATION | 한국어 음성 | 음성을 생성하고 있습니다 |
| TTS_VALIDATION | 한국어 음성 | 장면별 음성 길이를 확인하고 있습니다 |
| TTS_FALLBACK | 한국어 음성 | 길이가 초과된 장면의 음성만 안전하게 조정하고 있습니다 |
| VIDEO_GENERATION | 영상 후보 | 영상 생성 서버에서 영상을 만들고 있습니다 |
| AUDIO_MERGE | 음성 결합 | 영상과 음성을 결합하고 있습니다 |
| CAPTION_RENDER | 자막·검수 | Caption을 적용하고 있습니다 |
| COMPLETED | 완료 | 최종 영상 생성이 완료되었습니다 |

TTS 길이가 scene budget을 넘으면 `script_tts_repair`가 스크립트 모델에 한 번 재작성을 지시한다.
그래도 초과하면 deterministic 축약 또는 무음 fallback을 적용하는 TTS fallback 단계로 이동할 수
있다. Provider video polling 상한은 현재 약 18분이며 timeout을 성공으로 간주하지 않는다.

### 8.3 상단 버튼

- **상태 새로고침:** 자동 polling을 기다리지 않고 즉시 최신 상태를 조회
- **설정 참고해 새 후보 만들기:** 현재 설정을 새 create draft로 복사
- Breadcrumb의 **영상 라이브러리:** 목록으로 돌아가기

### 8.4 후보 카드

후보별로 다음 정보를 표시할 수 있다.

- Inline video 재생
- 후보 번호와 현재 상태
- 기술 검수 통과 또는 확인 필요
- 기술 점수
- 해상도
- duration
- fps
- codec
- bitrate
- 중앙 크롭 정규화 여부
- 생성 시도 횟수
- 후보 비용
- 공개 가능한 오류 메시지

완료 후보라도 재생용 `videoUrl`이 있어야 **이 후보 선택**을 사용할 수 있다. 다운로드는
`downloadUrl` 또는 `videoUrl`이 있어야 가능하며, URL이 없는 COMPLETED 후보는
**파일 확인 필요**로 표시된다.

현재 **후보 선택은 화면 세션의 비교 표시**이며 server-side 최종 승인값으로 영구 저장하지 않는다.
새로고침하면 첫 번째 완료 후보가 다시 기본 선택될 수 있으므로 실제 사용 후보는 다운로드 파일과
별도 운영 기록으로 확정한다.

파일 API는 완료 전 요청을 409로 거부하고, 없는 job·candidate 또는 허용된 final output 경계 밖의
파일은 404로 처리한다. 완료 파일은 HTTP Range 재생을 지원하며 download=true 요청은 attachment
filename을 사용한다.

### 8.5 후보 재시도

후보별 paid retry는 현재 Studio UI에서 노출하거나 호출하지 않는다. Backend route는 parent job이
terminal 상태이고, 후보가 FAILED이면서 `retryable=true`이고, 저장된 payload와 narration 파일이
모두 있을 때에만 202로 조건부 접수한다. 이 호출은 새 provider 비용을 발생시킬 수 있으므로
운영자가 API를 직접 호출해서 UI를 우회하면 안 된다. 조건을 만족하지 않으면 409로 차단된다.

- Provider timeout이나 unavailable 상태는 기존 provider operation reconciliation이 먼저 필요하다.
- Script/TTS 같은 공통 단계 실패는 candidate-only retry로 해결할 수 없다.
- 추가 유료 요청에는 새 quote와 idempotency·attempt ledger가 필요하다.
- 현재는 **설정 참고해 새 후보 만들기**로 이동하여 새 견적을 승인한다.

### 8.6 스크립트 타임라인의 출처

화면 상단 설명으로 timeline provenance를 구분한다.

| 표시 설명 | 의미 |
| --- | --- |
| 서버 작업에 저장된 실제 스크립트 장면 | 실제 생성에 사용된 scene, voiceover, subtitle |
| 서버 작업에 저장된 템플릿 장면 | Template 기록은 있지만 실제 script 세부가 없는 이전 작업 |
| 저장된 ID·version과 일치하는 현재 구조 | 참고용 versioned template이며 실제 script로 확정하면 안 됨 |
| 타임라인 미기록 | Script와 신뢰 가능한 template provenance가 모두 없음 |

Legacy 작업에서 단순히 길이가 같다는 이유로 현재 template 내용을 실제 생성 script처럼 표시하지 않는다.

### 8.7 오류·오프라인 동작

- 최초 조회가 오프라인이면 연결 복구를 기다린다.
- 기존 job을 본 적이 있으면 오류가 나도 마지막 성공 상태를 유지한다.
- 404는 즉시 삭제로 단정하지 않고 최대 3회 확인한 뒤 찾을 수 없음 화면을 표시한다.
- 일반 오류는 지수 backoff로 최대 약 30초 간격까지 재시도한다.
- **다시 연결** 또는 **다시 시도**로 즉시 재조회할 수 있다.

---

## 9. 프롬프트 설정

주소: /settings/prompts

이 메뉴는 실제 provider 작업에 사용하는 model-facing 지시문을 코드 배포 없이 관리한다.
버전은 **전체 여섯 프롬프트를 묶은 하나의 bundle**이다.

### 9.1 여섯 프롬프트

| Key | 화면 이름 | 역할 | 필수 token |
| --- | --- | --- | --- |
| script_generation | 스크립트 생성 | 상품·광고 전략·scene plan을 구조화 script로 변환 | product_context, creative_brief, template_scene_plan |
| script_tts_repair | 음성 길이 보정 | TTS 길이 검증 실패 시 스크립트 모델에 1회 재작성을 지시 | retry_error |
| video_base | 영상 생성 공통 | 모든 후보의 카메라·상품 보존·텍스트 정책 | script_visual_table |
| video_identity_reference | 지정 모델 보강 | 동의된 인물 reference 배포에서만 추가되는 조건 | 없음 |
| video_generated_model | AI 가상 모델 보강 | 실존 인물을 모사하지 않는 가상 모델 조건 | 없음 |
| creative_brief | 크리에이티브 브리프 | 사용자 입력을 실제 생성 문맥으로 구성 | advertising_purpose, cta, visual_mode |

각 편집기에서 **허용 토큰 보기**를 열어 해당 template에서 사용할 수 있는 token을 확인한다.
다른 template의 token을 임의로 가져오면 저장이 차단된다.

### 9.2 화면 구조

| 영역 | 기능 |
| --- | --- |
| 저장된 버전 | 최신순 history, 이름, 버전, 생성 시각, 변경 메모, 활성 badge |
| Current Release | 활성화 이후 발급되는 신규 quote와 그 quote로 시작하는 job에 적용될 버전·SHA-256 |
| 활성화 준비 | 선택한 저장 버전을 활성화 확인 단계로 이동 |
| 새 버전 정보 | 새 버전 이름과 변경 메모 |
| 여섯 편집기 | 본문, 원본·활성 대비 변경 badge, 글자·byte·token 검증 |
| 하단 저장 bar | 전체 validation 결과와 새 버전 저장 |

**선택한 버전**과 **활성 버전**은 다를 수 있다. History에서 과거 버전을 열어 내용을 검토해도
활성화 버튼을 확정하기 전까지 실제 신규 생성에는 영향을 주지 않는다.

### 9.3 새 버전 저장 절차

1. 왼쪽 **저장된 버전**에서 원본으로 사용할 버전을 선택한다.
2. **버전 이름**을 입력한다.
3. **변경 메모**에 무엇을 왜 바꿨는지 기록한다.
4. 여섯 템플릿 중 하나 이상을 편집한다.
5. 각 편집기의 필수 token, 허용 token, 크기 오류를 확인한다.
6. 하단이 **토큰 검증 완료**인지 확인한다.
7. **새 버전으로 저장**을 누른다.
8. 저장 완료 notice와 새 version number를 확인한다.

저장은 기존 Published 버전을 수정하지 않는다. 기존 버전을 삭제하거나 덮어쓰는 API도 없다.
현재 UI는 prompt 본문이 하나 이상 실제로 변경되어야 저장 버튼이 활성화된다.
버전 이름이나 변경 메모만 바꾼 metadata-only 버전은 만들 수 없다.

### 9.4 활성화 절차

1. 저장된 version history에서 적용할 버전을 선택한다.
2. 편집 중인 미저장 변경이 없는지 확인한다.
3. **이 버전 활성화 준비**를 누른다.
4. 확인 영역에서 적용 범위를 읽는다.
5. **신규 작업에 활성화**를 누른다.
6. Current Release와 활성 badge가 선택 버전으로 바뀌었는지 확인한다.
7. /create의 새 quote가 같은 prompt 이름·version을 표시하는지 확인한다.

저장만으로는 active가 바뀌지 않는다. 활성화는 그 이후 발급되는 신규 quote와 그 quote로 시작하는
job에 적용된다. 기존 quote record와 이미 접수·진행 중인 job의 immutable snapshot은 바뀌지 않는다.
다만 현재 Frontend는 active version 변경을 감지하면 Create 화면의 이전 quote를 제출에 사용하지 않고
새 활성 버전으로 재견적한다. 기존 job의 TTS repair snapshot도 계속 원래 버전을 사용한다.

### 9.5 Prompt version과 job snapshot

~~~mermaid
flowchart LR
    V1["Production v1<br/>현재 활성"] --> EDIT["본문 편집<br/>token 실시간 검증"]
    EDIT --> SAVE["새 immutable v2 저장"]
    SAVE --> V2["v2 저장됨<br/>아직 비활성"]
    V2 --> ACT["명시적 활성화 확인"]
    ACT --> POINTER["Active pointer = v2"]

    V1 --> OLDQ["기존 quote와 job<br/>v1 snapshot"]
    OLDQ --> OLDJOB["진행·재조회·TTS 보정<br/>계속 v1 사용"]

    POINTER --> NEWQ["새 quote<br/>v2 ID·version·SHA 고정"]
    NEWQ --> NEWJOB["새 job<br/>여섯 본문 exact snapshot 저장"]
~~~

### 9.6 과거 버전으로 되돌리기

Rollback도 버전 내용을 수정하는 것이 아니라 active pointer를 되돌리는 방식이다.

1. 저장된 버전에서 이전 안정 버전을 선택한다.
2. **이 버전 활성화 준비**를 누른다.
3. **신규 작업에 활성화**를 확정한다.
4. 새 /create quote에서 이전 버전이 고정됐는지 확인한다.

이미 생성한 v2 job이 v1로 바뀌지는 않는다. 각 job의 상세 화면에 저장된 prompt version과 hash가
감사 기준이다.

### 9.7 Token과 크기 검증

| 검증 | 규칙 |
| --- | --- |
| 필수 token | 해당 template의 필수 token을 모두 포함 |
| 허용 token | 정의되지 않은 token 사용 금지 |
| 괄호 | 깨진 중괄호 또는 미완성 token 금지 |
| 빈 본문 | 허용하지 않음 |
| Template 크기 | UTF-8 기준 64 KiB 이하 |
| Bundle 크기 | 여섯 template 합계 256 KiB 이하 |

Token은 {{token_name}} 형식이다. Token 이름을 번역하거나 임의로 바꾸지 않는다.
사용자 CTA·광고 목적 등은 구조화 데이터로 한 번만 삽입되며, 사용자 입력 안의 token 모양 문장은
새 template 문법으로 다시 평가하지 않는다.

### 9.8 미저장 변경 보호

- 편집 내용, 버전 이름, 변경 메모가 달라지면 미저장 상태로 취급한다.
- 다른 버전 선택, server reload, 메뉴 이동, 브라우저 Back 전에 확인한다.
- 이동을 취소하면 같은 tab의 sessionStorage draft를 유지한다.
- 새로고침 뒤 draft가 있으면 이어서 편집할지 묻는다.
- 이동을 승인하거나 저장이 완료되면 임시 draft를 제거한다.
- 저장 또는 활성화 중에는 버전 전환과 페이지 이동을 잠근다.

Session draft는 장기 저장소가 아니다. Browser storage 삭제, private mode 제한, 다른 기기·다른
브라우저에서는 복구되지 않을 수 있으므로 중요한 변경은 반드시 새 immutable version으로 저장한다.

### 9.9 프롬프트 변경 운영 규칙

권장 version 이름:

~~~text
한국어 자연 발화 v3
제품 라벨 보존 강화 v4
15초 CTA 압축 실험 v5
~~~

권장 변경 메모:

~~~text
짧은 조사 반복을 줄이고 한 문장 호흡으로 낭독되도록 script 지시를 조정
상품 전면을 손으로 가리는 장면을 금지하고 작은 글자 생성 금지 조건을 강화
~~~

좋은 변경 원칙:

- 한 버전에 하나의 주요 가설만 담는다.
- 필수 token을 삭제하지 않는다.
- 상품 사실성·수량 금지 같은 server validator를 prompt로 완화하려고 하지 않는다.
- 저장 후 즉시 활성화하기 전에 변경 내용을 다시 읽는다.
- Production 사용 전 4초 후보 1개의 제한된 canary로 확인한다.
- 문제가 있으면 기존 안정 버전을 다시 활성화한다.

### 9.10 동시 편집과 오류

- 두 운영자가 동시에 같은 next version number를 저장하면 한 요청은
  PROMPT_VERSION_CONFLICT 409로 거부될 수 있다.
- 이 경우 server catalog를 다시 불러오고 최신 version을 원본으로 변경을 다시 적용한다.
- 저장·활성화 API는 provider를 호출하지 않는다.
- Prompt settings 응답은 Cache-Control: no-store다.
- 현재 공개 관리자 인증이 없으므로 이 route와 API를 인터넷에 노출하면 안 된다.

---

## 10. Production 품질 검수

기술 검수 통과는 곧바로 광고 사용 승인을 뜻하지 않는다.

### 10.1 검수 계층

~~~mermaid
flowchart TD
    A["파일 생성 완료"] --> B["기술 검수"]
    B --> C{"해상도·길이·fps·codec 통과?"}
    C -- "아니오" --> R["사용 금지·원인 기록"]
    C -- "예" --> D["상품 의미 검수"]
    D --> E{"상품 형태·수량·라벨 주장 안전?"}
    E -- "아니오" --> R
    E -- "예" --> F["인물·크리에이티브 검수"]
    F --> G{"얼굴·손·동작·구도 자연스러움?"}
    G -- "아니오" --> R
    G -- "예" --> H["한국어 음성·자막 검수"]
    H --> I{"발음·호흡·CTA·자막 timing 승인?"}
    I -- "아니오" --> R
    I -- "예" --> J["최종 사용 승인"]
~~~

### 10.2 후보별 필수 체크리스트

| 영역 | 확인할 내용 |
| --- | --- |
| 파일 | 9:16, 목표 해상도, 정확한 길이, 권장 목표 30fps, 재생 가능. 자동 QC 하한은 24fps |
| 검은 화면·깜빡임 | 시작·중간·끝 black frame, 과도한 flicker 없음 |
| 상품 | 형태, 색상, 파우치 입구, 로고 위치가 장면마다 크게 변하지 않음 |
| 작은 글자 | 읽을 수 없는 문구를 사실처럼 사용하지 않음 |
| 수량 | 대표 단품 이미지로 30포 구성을 주장하지 않음 |
| 인물 | 얼굴·손가락·치아·관절·시선이 자연스러움 |
| 상호작용 | 손과 상품이 겹치거나 사라지지 않음 |
| 카메라 | 목적 없는 흔들림, 급격한 zoom, 동일 motion 반복이 없음 |
| 한국어 음성 | 발음, 조사, 호흡, 속도와 감정이 자연스러움 |
| 자막 | 음성과 내용이 일치하고 화면 밖으로 나가지 않음 |
| CTA | 마지막 구간에서 누락되지 않고 검증된 행동만 요청 |
| 법적·광고 표현 | 할인, 효능, 인증, 수량 등 근거 없는 표현 없음 |

현재 backend의 자동 기술 QC 기준은 다음과 같다.

| 기술 항목 | 기준 |
| --- | --- |
| 화면비 | 9:16 |
| 해상도 | 최소 1080×1920, 최대 2160×3840 |
| 길이 | 선택 template 대비 ±0.25초 |
| Frame rate | 24fps 이상 |
| Codec | H.264 또는 HEVC |
| Bitrate | 2.5Mbps 이상 |
| Black frame | 전체 frame의 3% 이하 |

이 기준을 모두 통과해도 상품 의미, 인물 자연스러움, 한국어 발음과 광고 문구는 사람이 별도로 승인한다.

### 10.3 권장 생성 순서

1. Prompt version과 에셋을 먼저 검수한다.
2. 상품만 또는 AI 가상 모델, 4초, 후보 1개로 가장 작은 canary를 만든다.
3. 얼굴·손·상품 형태·한국어 음성 방향을 확인한다.
4. 통과하면 15초 후보 1개로 전체 장면 연결과 CTA를 검수한다.
5. 방향이 승인된 뒤에만 후보 수를 2~4개로 늘린다.
6. 후보별 사용 가능률과 승인된 후보당 비용을 기록한다.

---

## 11. Provider 선택 가이드

| 목표 | 현재 권장 경로 | 이유 |
| --- | --- | --- |
| 상품 중심 영상 | OpenRouter/Seedance product_only | 현재 기술적으로 검증된 상품 reference 경로 |
| 일반 AI UGC 모델 | OpenRouter/Seedance generated_model | 실존 인물 reference 없이 가상 모델 생성 가능 |
| 특정 인물 identity | 현재 production 금지 | 실제·합성 portrait reference가 privacy filter에서 거부된 증거 |
| Spokesperson 일관성·립싱크 | 동의된 에셋으로 Higgsfield 별도 canary | Provider 전환 전 실제 usable rate와 비용 비교 필요 |

Provider를 바꾸는 것만으로 다음 문제는 해결되지 않는다.

- 상품 라벨·패키지 사실성
- 한국어 음성 자연스러움과 word-level alignment
- 얼굴·손·동작 검수
- 후보 선별과 human approval
- 전체 비용 원장과 hard cap
- Durable worker와 artifact 저장

### 11.1 현재 제공하지 않는 기능

다음 기능은 화면에 없거나 production 계약이 완성되지 않아 사용할 수 없다.

- 작업 삭제, archive, cancel
- 작업 또는 후보 publish·외부 공유
- 후보 최종 승인값의 server-side 영구 저장
- 실패 후보의 원클릭 유료 retry
- 여러 작업 일괄 선택·다운로드
- Prompt version 수정·삭제
- Prompt 초안의 다른 기기·다른 browser 동기화
- 공개 다중 사용자 권한과 workspace별 분리

---

## 12. 오류 상황별 대응

| 증상 또는 코드 | 의미 | 권장 행동 |
| --- | --- | --- |
| 활성 프롬프트 확인 실패 | 사용할 prompt snapshot을 고정할 수 없음 | 프롬프트 설정을 열고 active version과 API 상태 확인 |
| ACTIVE_PROMPT_VERSION_MISSING, 503 | 서버에 active prompt pointer가 없음 | 저장된 version 하나를 운영자가 명시적으로 활성화 |
| VIDEO_CATALOG_UNAVAILABLE, 502 | Provider capability catalog 조회 실패 | 생성하지 말고 잠시 후 다시 계산 |
| VIDEO_MODEL_UNSUPPORTED, 422 | 선택 길이·1080p·9:16 조합 미지원 | 지원되는 template/model 설정 확인 |
| PROMPT_VERSION_CHANGED, 409 | 견적 계산 중 active prompt가 변경됨 | Frontend 자동 갱신 후 새 quote 확인 |
| REQUOTE_REQUIRED | Quote가 오래됐거나 prompt snapshot이 부족하며 요청 거절이 기록됨 | 새 ID와 fresh quote로 다시 승인 |
| QUOTE_NOT_FOUND, 404 | Quote가 없으며 요청 거절이 기록됨 | 기존 job reservation 확인 후 새 ID와 fresh quote |
| Quote 만료 | 15분 유효 시간이 지남 | 새 견적 계산 |
| 잔액 부족 표시 | 예상 상단보다 조회된 잔액이 적음 | 생성 중단, 계정·예산 확인 |
| IDEMPOTENCY_KEY_MISMATCH, 422 | Header와 body request ID가 다름 | 새 ID를 만들지 말고 client 구현 확인 |
| 동일 ID 다른 body, 409 | 같은 요청 ID가 다른 설정으로 재사용됨 | 기존 reservation 확인, 임의 재전송 금지 |
| PROMPT_VERSION_CONFLICT, 409 | 동시 prompt 저장 충돌 | Catalog reload 후 최신 버전에 변경 재적용 |
| PROMPT_VERSION_NOT_FOUND, 404 | 선택한 activation 대상이 없음 | Version history를 다시 불러와 재선택 |
| Prompt validation, 422 | 필수·허용 token, 괄호, 크기 오류 | 편집기 오류 목록 수정 |
| REQUEST_VALIDATION_FAILED, 422 | 이미지·모드·timeline·입력 구조 오류이며 요청 거절이 기록됨 | 입력 수정 후 새 ID와 fresh quote |
| GENERATION_REQUEST_NOT_FOUND, 404 | Request reservation을 찾지 못함 | 불확실 제출이면 원 ID·원 body로만 복구 |
| 목록이 마지막 확인 상태 | 네트워크·API 오류로 최신 아님 | 다시 시도 또는 연결 복구 대기 |
| 작업을 찾을 수 없음 | 3회 조회 후에도 job 404 | Job ID 확인, 라이브러리에서 재선택 |
| 후보 영상 재생 실패 | 파일 URL·Range·artifact 문제 가능 | 새로고침, Backend file endpoint와 로그 확인 |
| 후보 실패·retry 차단 | 안전한 유료 resume 계약 없음 | 설정 참고 새 작업에서 fresh quote 승인 |

---

## 13. 자주 묻는 질문

### 저장한 프롬프트가 바로 영상 생성에 적용되나요?

아니다. 저장은 inactive immutable version을 만드는 동작이다. 별도로 활성화해야 신규 quote와
신규 job에 적용된다.

### 활성 버전을 바꾸면 진행 중 영상도 바뀌나요?

아니다. 진행 중 job은 접수 시점에 저장한 exact prompt snapshot을 계속 사용한다.

### 같은 설정으로 다시 만들면 같은 영상이 나오나요?

아니다. 설정과 provenance는 재현되지만 생성형 provider의 픽셀 결과는 매번 달라질 수 있다.

### 15초 견적에 음성·자막 비용도 포함되나요?

아니다. 현재 화면의 coverage는 video_only이며 script, TTS, render, storage, retry 비용은 제외된다.

### 브라우저를 닫아도 생성되나요?

FastAPI 프로세스가 계속 살아 있다면 background task는 계속 실행되고 나중에 library에서 다시 연다.
프로세스 자체가 재시작되면 진행 중 task 자동 복구는 아직 보장하지 않는다.

### 실패 후보만 다시 실행할 수 있나요?

현재 UI에서는 유료 candidate retry를 차단한다. 기존 설정을 참고해 새 job과 fresh quote를 만든다.

### 지정 모델을 왜 선택할 수 없나요?

현재 연결된 Seedance 모델 경로에서 identity reference가 privacy filter로 거부됐고,
production capability가 검증되지 않았기 때문이다.

### 프롬프트 편집 화면에서 테스트 영상을 바로 만들 수 있나요?

없다. 실수로 비용을 발생시키지 않도록 settings는 저장과 활성화만 제공한다.
실제 생성은 /create에서 quote를 확인한 뒤 수행한다.

### 후보 선택은 저장되나요?

현재 후보 선택은 상세 화면의 비교 상태다. 최종 승인 후보를 영구 저장하는 별도 승인 workflow는
아직 없으므로 다운로드 파일과 운영 기록으로 확정해야 한다.

### 상품을 저장하면 바로 새 영상 만들기에 나오나요?

아니다. 신규 등록과 수정은 항상 **검수 대기** 상태가 된다. 대표 이미지와 상품·옵션·수량·주장을
사람이 확인하고 검수 근거와 checkbox를 제출해 활성화한 최신 revision만 생성 화면에 표시된다.

### 상품을 수정했는데 목록에서 사라진 이유는 무엇인가요?

활성 상품도 내용을 수정하면 기존 검수 확인을 재사용하지 않고 자동 비활성화한다. 광고 상품 관리의
검수 대기 필터에서 수정본을 연 뒤 다시 의미 검수를 완료하고 활성화한다.

---

## 14. 화면과 API 대응표

| 화면 기능 | API | 쓰기 여부 | 영상 provider 생성 |
| --- | --- | --- | --- |
| 상품 목록 | GET /api/v1/reels/products?include_inactive=true | 읽기 | 없음 |
| 상품 검수 대기 등록 | POST /api/v1/reels/products | DB 쓰기·자산 기술 검사 | 영상 생성 없음 |
| 상품 수정 | PUT /api/v1/reels/products/{productId} | DB 쓰기·revision 증가·자동 비활성화 | 영상 생성 없음 |
| 상품 의미 검수·활성화 | POST /api/v1/reels/products/{productId}/activate | DB 쓰기·검수 근거 저장 | 없음 |
| 상품 비활성화 | POST /api/v1/reels/products/{productId}/deactivate | DB 쓰기 | 없음 |
| 상품 보관 | DELETE /api/v1/reels/products/{productId} | Soft archive | 없음 |
| Prompt history 조회 | GET /api/v1/reels/prompt-versions | 읽기 | 없음 |
| Prompt 새 버전 저장 | POST /api/v1/reels/prompt-versions | DB 쓰기 | 없음 |
| Prompt 활성화 | POST /api/v1/reels/prompt-versions/{id}/activate | DB 쓰기 | 없음 |
| Template 조회 | GET /api/v1/reels/generation-templates | 읽기 | 없음 |
| 비용 견적 | POST /api/v1/reels/generation-quotes | Quote 저장 | 없음 |
| 영상 생성 시작 | POST /api/v1/reels/generate | Job·reservation 저장 | **있음** |
| 불확실 요청 복구 | GET /api/v1/reels/generation-requests/{clientRequestId} | 읽기 | 없음 |
| 라이브러리 | GET /api/v1/reels/generations | 읽기 | 없음 |
| 작업 상세 | GET /api/v1/reels/generate/{jobId} | 읽기 | 없음 |
| 영상 재생·다운로드 | GET /api/v1/reels/generate/{jobId}/candidates/{candidateId}/file | 읽기 | 없음 |
| Candidate retry API | POST /api/v1/reels/generate/{jobId}/candidates/{candidateId}/retry | 조건부 쓰기 | 비용 발생 가능, 현재 UI 차단·직접 호출 금지 |

---

## 15. 공개 Production 전 필수 조건

~~~mermaid
flowchart TB
    LOCAL["현재 로컬 Studio GO"]
    LOCAL --> SECURITY["인증·Owner scope·Prompt 및 상품 mutation RBAC·CSRF<br/>사용자별 동시 job·rate limit·abuse control<br/>Actor audit·민감 로그 redaction"]
    LOCAL --> QUEUE["Durable queue·Transactional outbox·Worker lease<br/>heartbeat·dead-letter·restart checkpoint recovery"]
    LOCAL --> PROVIDER["Provider operation locator 영속화<br/>timeout·cancellation·실제 청구 reconciliation"]
    LOCAL --> STORE["Object storage·Signed URL<br/>Checksum·Retention"]
    LOCAL --> COST["전체 비용 ledger·예산 예약<br/>Hard cap·실청구 reconcile"]
    LOCAL --> DB["Versioned migration<br/>Normalized candidate·attempt tables"]
    LOCAL --> QA["한국어 forced alignment<br/>Human creative approval"]
    LOCAL --> OBS["Stage·Provider·비용 metric과 alert"]

    SECURITY --> GATE{"모든 gate 통과?"}
    QUEUE --> GATE
    PROVIDER --> GATE
    STORE --> GATE
    COST --> GATE
    DB --> GATE
    QA --> GATE
    OBS --> GATE
    GATE -- "예" --> PROD["Public Production GO"]
    GATE -- "아니오" --> NOGO["Public Production NO-GO 유지"]
~~~

현재 Backend API 자체에는 운영자 인증이 없다. 위 조건이 없는 현재 설정 API와 상품 등록·수정·
활성화·비활성화·보관 mutation API를 공개 인터넷에 노출하면 안 된다. 화면에서 메뉴나 버튼을
숨기는 것은 권한 통제가 아니므로 공개 전 서버 또는 인증 reverse proxy에서 상품 운영자 RBAC를
강제해야 한다.
민감 로그 redaction에는 API key뿐 아니라 signed URL, 인물 reference URL과 private request payload가
로그·오류 응답·관측 도구에 남지 않는지 확인하는 절차가 포함된다.
로컬 health, 테스트 통과, 유효한 MP4는 공개 production 운영 증거를 대신하지 않는다.

---

## 16. 운영자 최종 체크리스트

### 생성 전

- [ ] 활성 prompt version 이름과 version을 확인했다.
- [ ] 광고 상품 관리에서 최신 상품 revision이 활성 상태인지 확인했다.
- [ ] 대표·상세 이미지가 실제 상품·옵션과 일치하고 사용 권리가 있는지 확인했다.
- [ ] 상품 에셋의 의미·수량·작은 글자 한계를 검수 근거에 기록했다.
- [ ] 목표 길이와 scene plan을 확인했다.
- [ ] CTA와 광고 목적에 검증되지 않은 주장이 없다.
- [ ] 출연 방식이 provider capability와 맞는다.
- [ ] 후보 수와 video_only 예상값·상단을 확인했다.
- [ ] 이번 생성 비용을 승인했다.

### 생성 중

- [ ] 같은 요청을 새 ID로 다시 누르지 않았다.
- [ ] 응답이 불확실하면 request 상태 조회와 안전 복구를 사용했다.
- [ ] PROCESSING job은 상세 또는 library에서 확인했다.
- [ ] 마지막 확인 상태를 실시간 상태로 오인하지 않았다.

### 생성 후

- [ ] 목표 duration, 해상도, fps, codec을 확인했다.
- [ ] 얼굴·손·상품 형태·라벨·깜빡임을 실제 재생으로 확인했다.
- [ ] 한국어 음성과 자막 timing을 사람이 들으며 확인했다.
- [ ] CTA, 수량, 할인, 효능 등 광고 문구를 검수했다.
- [ ] 사용할 후보 파일과 job ID, prompt version/hash를 기록했다.
- [ ] 기술 통과와 최종 광고 사용 승인을 구분했다.

### Prompt 변경 후

- [ ] 버전 이름과 변경 이유를 명확하게 기록했다.
- [ ] 필수 token과 bundle 크기 validation을 통과했다.
- [ ] 저장과 활성화를 구분했다.
- [ ] /create의 새 quote에서 실제 적용 버전을 확인했다.
- [ ] 기존 job의 prompt snapshot이 바뀌지 않았음을 확인했다.
- [ ] 제한된 canary와 human review를 거쳤다.

### 상품 변경 후

- [ ] 수정본이 자동 비활성화됐음을 확인했다.
- [ ] 기술 검증 통과와 실제 상품 의미 검수를 구분했다.
- [ ] 검수 근거를 비워 두지 않고 직접 확인한 사실과 사용 제한을 기록했다.
- [ ] 최신 revision을 다시 활성화한 뒤 /create에서 해당 상품을 새로 선택했다.
- [ ] 보관은 기존 영상 기록을 삭제하지 않는 soft archive임을 확인했다.

---

## 17. 관련 문서

- [프로젝트 설치·환경변수·실행·운영 가이드](./project-setup-and-operations-guide.ko.md)
- [Frontend 개요와 실행 계약](../README.md)
- [UX 아키텍처와 인수 기준](./studio-ux-architecture.md)
- Backend API의 상세 계약은 backend 저장소의 docs/studio-workflow-contract.md를 참고한다.
