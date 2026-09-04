# QUEDOT Shorts Studio 프로젝트 설치 및 운영 가이드

> 대상: 프로젝트를 처음 설치하는 개발자, 로컬 운영자, 배포 준비 담당자
>
> 기능 기준: Backend `88092787479a33490c0da3c832de3df26ae7f5c3` / Frontend runtime `4576de0fd4f63add459637372c82db27d8c25b08`
>
> 현재 운영 경계: **기존 통합 workspace에서는 로컬 실행 가능 / fresh clone과 공개 Production은 별도 준비 필요**

이 문서는 두 Git 저장소를 형제 폴더로 배치하는 방법부터 Backend와 Frontend 환경변수,
의존성 설치, 통합·개별·Docker 실행, 검증, 로그, 로컬 데이터 백업과 장애 대응까지 설명한다.
화면에서 영상을 만드는 방법은 [서비스 사용 가이드](./service-user-guide.ko.md)를 함께 참고한다.

---

## 1. 먼저 확인할 현재 재현성 경계

현재 작업 폴더 `reels-george` 자체는 Git 저장소가 아니다. 그 안에 서로 독립적인
Frontend와 Backend Git 저장소가 있고, 통합 실행 도구와 테스트 데이터는 로컬 상위 폴더에 있다.

~~~mermaid
flowchart TB
    ROOT["reels-george 통합 workspace<br/>Git 저장소 아님"]
    ROOT --> FE["frontend<br/>별도 Git 저장소"]
    ROOT --> BE["backend<br/>별도 Git 저장소"]
    ROOT --> TOOLS["tools<br/>로컬 통합 실행·검증 도구"]
    ROOT --> DATA["test-data<br/>로컬 전용 fixture·evidence"]
    ROOT --> ENV[".env<br/>로컬 비밀값·Git 제외"]

    FE --> FORIGIN["github.com/qdot-ai-reels/frontend"]
    BE --> BORIGIN["github.com/qdot-ai-reels/backend"]
~~~

작성 시점에 현재 기능 branch는 두 origin에 존재하지 않는다.

| 저장소 | 현재 로컬 branch | 기능 기준 revision | 원격 동일 branch |
| --- | --- | --- | --- |
| Frontend | `feat/production-studio-ux-v2` | runtime `4576de0...`, 문서 commit은 그 이후 | 없음 |
| Backend | `feat/studio-production-workflow` | `8809278...` | 없음 |

따라서 공개 저장소 두 개를 새로 clone하는 것만으로는 현재 Studio 기능, 상위 `tools/`,
로컬 fixture를 그대로 재현할 수 없다. 현재 기능을 다른 컴퓨터에서 사용하려면 먼저 다음 중 하나가
필요하다.

1. 두 feature branch를 권한 있는 계정으로 push한 뒤 exact branch 또는 tag를 checkout한다.
2. 검증 후 `develop` 또는 release branch에 merge하고 그 revision을 사용한다.
3. 외부 공유가 허용된 코드만 Git bundle이나 내부 배포 패키지로 전달한다.
4. 상위 `tools/`는 별도 meta repository로 관리하거나 한 저장소의 versioned script로 이동한다.

이 문서가 현재 실행을 보장하는 대상은 두 기능 branch와 상위 도구가 모두 준비된 **기존 통합
workspace**뿐이다. 아래 fresh clone 절차는 폴더 배치를 설명하는 참고 자료이며, 현재 local-only
commit과 상위 도구를 자동으로 가져오지 않는다. 정확한 revision과 versioned 상위 도구가 원격으로
전달되기 전에는 fresh clone에서 Production Studio 실행을 진행하지 않는다.

---

## 2. 프로젝트 구성

~~~text
reels-george/
├── .env                              # Backend 비밀값·provider 설정, 커밋 금지
├── tools/
│   ├── start_local_stack.sh          # macOS 통합 실행
│   ├── provider_preflight.py         # 계정·모델 확인, --tts는 과금
│   ├── run_production_smoke.py       # 기본 dry-run, --submit-paid는 과금
│   ├── run_model_reference_smoke.py  # 기본 dry-run, --submit-paid는 과금
│   ├── capture_production_result.py  # 기존 terminal job 증거 수집
│   └── audit_assets.py               # 원격 이미지 기술 감사
├── test-data/                        # 비공개·로컬 전용 상품/인물/결과 데이터
├── backend/                          # FastAPI, DB, provider, FFmpeg, HyperFrames 연동
│   ├── .env.example
│   ├── .venv/
│   ├── app/
│   ├── tests/
│   ├── runtime/                      # DB·로그·영상·음성, 커밋 금지
│   └── docker-compose.yml
└── frontend/                         # Next.js Studio
    ├── .env.local                    # 공개 가능한 NEXT_PUBLIC 값만, 커밋 금지
    ├── app/
    ├── components/
    ├── docs/
    └── tests/
~~~

역할은 다음과 같다.

| 구성요소 | 기본 주소 | 역할 |
| --- | --- | --- |
| Frontend | `http://127.0.0.1:3000` | 영상 라이브러리, 생성 위저드, 작업 상세, 프롬프트 버전 UI |
| Backend | `http://127.0.0.1:8001` | REST API, job·quote·prompt version 저장, 비동기 orchestration |
| HyperFrames runner | `http://127.0.0.1:8788` | 자막 composition 검사와 최종 렌더링 |
| SQLite | `backend/runtime/quedot-production.db` | 통합 로컬 실행의 job·quote·prompt DB |
| OpenRouter | 외부 HTTPS | 스크립트, 한국어 TTS, 영상 provider gateway |

~~~mermaid
flowchart LR
    USER["운영자 브라우저"] -->|3000| FE["Next.js Frontend"]
    FE -->|REST 8001| API["FastAPI Backend"]
    API --> DB[("로컬 SQLite")]
    API -->|Script·TTS·Video| OR["OpenRouter"]
    API -->|Render request 8788| HF["HyperFrames runner"]
    HF --> FILES["runtime/final MP4"]
    API --> FILES
    FILES -->|MP4 Range·attachment| API
    API -->|재생·다운로드 응답| FE
~~~

---

## 3. Fresh clone 폴더 배치 참고 — 현재 실행 보장 아님

원하는 상위 경로에서 다음처럼 clone한다.

~~~bash
mkdir -p /원하는/경로/reels-george
cd /원하는/경로/reels-george
git clone https://github.com/qdot-ai-reels/frontend.git frontend
git clone https://github.com/qdot-ai-reels/backend.git backend

# 이후 명령에서 사용할 통합 workspace 절대 경로를 현재 shell에 등록
export QUEDOT_ROOT="/원하는/경로/reels-george"
test -d "$QUEDOT_ROOT/frontend/.git"
test -d "$QUEDOT_ROOT/backend/.git"
~~~

`QUEDOT_ROOT`는 예시 문자열이 아니라 실제 절대 경로로 바꾸고, 새 terminal을 열 때마다 다시
설정한다. 기존 통합 workspace를 쓰는 경우에도 같은 방식으로 그 workspace의 절대 경로를 지정한다.

그 다음 사용할 branch 또는 tag가 원격에 실제로 있는지 먼저 확인한다.

~~~bash
git -C "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/frontend" ls-remote --heads origin
git -C "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend" ls-remote --heads origin
git -C "$QUEDOT_ROOT/frontend" status --short --branch
git -C "$QUEDOT_ROOT/backend" status --short --branch
~~~

특정 revision을 전달받았다면 두 저장소에서 각각 검증한다.

~~~bash
git -C "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/frontend" rev-parse HEAD
git -C "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend" rev-parse HEAD
~~~

상위 `tools/start_local_stack.sh`는 어느 public clone에도 포함되지 않는다. 또한 현재 기능 branch도
원격에 없으므로 fresh clone에서는 이 문서의 통합·개별·Docker 실행을 현재 Studio 재현 절차로
간주하면 안 된다. exact revision과 versioned 도구가 전달된 이후에만 해당 revision을 확인하고
실행한다. 출처가 확인되지 않은 script나 로컬 `test-data`를 임의로 복사하지 않는다.

---

## 4. 사전 설치 요구사항

### 4.1 권장 버전

| 도구 | 권장 또는 최소 | 사용 이유 |
| --- | --- | --- |
| Git | 최신 안정 버전 | 두 저장소 clone과 revision 확인 |
| Python | **3.12 권장** | Backend Docker 기준 버전. 별도 pin이 없어 재현성 기준으로 사용 |
| Node.js | **22 권장**, Next.js 최소 20.9 | Frontend와 HyperFrames 실행 |
| npm | 선택한 Node.js에 포함된 버전 | `npm ci`, build, HyperFrames 설치 |
| FFmpeg·ffprobe | 최근 안정 버전 | 음성 결합, metadata·black-frame·오디오 검사 |
| SQLite CLI | 최근 안정 버전 | 로컬 DB backup 무결성·복구 리허설 |
| Google Chrome | macOS 기본 설치 경로 | 통합 script의 HyperFrames browser |
| zsh, curl, lsof, rsync, shasum, openssl | macOS 기본 또는 별도 설치 | 통합 script, readiness, backup·복구 리허설 |
| Docker + Compose | Docker 방식을 쓸 때만 | PostgreSQL·Backend·HyperFrames container |

Backend `requirements.txt`는 현재 version pin이 없고 `httpx2`와 `httpx`가 함께 선언돼 있다.
완전한 재현 가능한 공개 배포 전에는 lockfile 또는 hash가 있는 dependency pinning이 필요하다.

### 4.2 설치 여부 확인

~~~bash
git --version
python3.12 --version
node --version
npm --version
ffmpeg -version
ffprobe -version
sqlite3 --version
command -v zsh curl lsof rsync shasum openssl
~~~

macOS 통합 script는 Chrome을 다음 exact 경로에서 찾는다.

~~~bash
test -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
~~~

다른 경로나 Linux의 Chromium은 현재 상위 script가 자동 탐색하지 않는다. Linux·CI에서는
`backend/Dockerfile.hyperframes`의 Chromium·FFmpeg 환경을 사용하는 편이 안전하다.

---

## 5. Backend용 workspace `.env`

### 5.1 가장 중요한 보안 규칙

- 실제 `.env`는 Git에 commit하지 않는다.
- API key를 명령줄 인자, 캡처, 이슈, 문서, prompt, 브라우저 console에 붙이지 않는다.
- `.env`를 source하기 전 shell trace는 `set +x`로 끄고, key 값을 출력하는 진단 명령을 쓰지 않는다.
- `OPENROUTER_API_KEY`를 `NEXT_PUBLIC_*` 변수에 넣지 않는다.
- `.env` 권한은 가능하면 소유자만 읽고 쓸 수 있게 `chmod 600 .env`로 제한한다.
- 노출된 키는 파일에서 지우는 것으로 끝내지 말고 provider에서 폐기·재발급한다.
- 이 문서와 example에는 실제 값 대신 빈 값 또는 `replace_with_...` placeholder만 둔다.

### 5.2 통합 로컬 실행용 파일 만들기

현재 상위 통합 script는 **workspace 루트의 `.env`만 shell에 source**한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
cp backend/.env.example .env
chmod 600 .env
~~~

그 다음 `.env`를 로컬 editor로 열어 최소한 다음 값을 설정한다.

~~~dotenv
# 필수: 실제 값은 로컬에서만 입력
OPENROUTER_API_KEY=

# 현재 검증 기본값
OPENROUTER_SCRIPT_MODEL=openai/gpt-5.4-mini
OPENROUTER_TTS_MODEL=google/gemini-3.1-flash-tts-preview
OPENROUTER_TTS_VOICE=Aoede
OPENROUTER_VIDEO_MODEL=bytedance/seedance-2.0
OPENROUTER_VIDEO_API_URL=https://openrouter.ai/api/v1/videos
OPENROUTER_VIDEO_SUPPORTED_DURATIONS=4,5,6,7,8,9,10,11,12,13,14,15

# 현재 video_only 견적 rate card
VIDEO_RATE_PER_SECOND_USD=0.38
VIDEO_QUOTE_MIN_FACTOR=0.95
VIDEO_QUOTE_MAX_FACTOR=1.10

# 로컬 브라우저 origin만 허용
CORS_ORIGINS=http://127.0.0.1:3000,http://localhost:3000

# 운영에서는 신뢰하는 CDN host만 쉼표로 등록
ALLOWED_IMAGE_HOSTS=
~~~

값을 출력하지 않고 필수 키 존재 여부만 확인한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
(
  set +x
  set -a
  source .env
  set +a
  if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    echo "OPENROUTER_API_KEY: configured"
  else
    echo "OPENROUTER_API_KEY: missing"
  fi
)
~~~

`backend/.env`에만 용도별 키와 모델을 넣으면 상위 통합 script에서는 적용되지 않을 수 있다.
통합 script가 읽어야 하는 `OPENROUTER_*`, 모델, TTS, quote 설정은 루트 `.env`에 둔다.
Docker Compose는 별도로 root와 backend env file을 container에 주입한다.

상위 script는 `.env`를 dotenv parser가 아니라 zsh로 직접 `source`한다. 값은 shell assignment로
해석될 수 있으므로 공백이나 특수문자가 있는 값은 안전하게 따옴표로 감싸고, 명령 치환이나 출처를
모르는 shell 표현을 넣지 않는다.

### 5.3 API key 우선순위

~~~mermaid
flowchart TD
    A{"SETTINGS_ENCRYPTION_KEY와<br/>DB 저장 키가 있는가?"}
    A -- "예" --> DBKEY["용도별 DB 암호화 키"]
    A -- "아니오" --> B{"용도별 환경변수가 있는가?"}
    B -- "예" --> SPLIT["SCRIPT·TTS·VIDEO 전용 키"]
    B -- "아니오" --> C{"OPENROUTER_API_KEY가 있는가?"}
    C -- "예" --> SHARED["공용 fallback 키"]
    C -- "아니오" --> FAIL["Provider 기능 fail-closed"]
    DBKEY --> USE["신규 provider client"]
    SPLIT --> USE
    SHARED --> USE
~~~

용도별 환경변수는 다음과 같다.

| 기능 | 우선 전용 변수 | 공용 fallback |
| --- | --- | --- |
| 스크립트 | `OPENROUTER_SCRIPT_API_KEY` | `OPENROUTER_API_KEY` |
| 한국어 TTS | `OPENROUTER_TTS_API_KEY` | `OPENROUTER_API_KEY` |
| 영상 | `OPENROUTER_VIDEO_API_KEY` | `OPENROUTER_API_KEY` |

로컬에서 하나의 키를 쓸 때는 공용 변수 하나만으로 충분하다. 키별 비용·권한·회전을 분리해야 할
때만 전용 변수를 추가한다. 빈 전용 값은 공용 키로 fallback한다.

주의: provider 영상 결과를 내려받아 검증하는 단계는 DB 저장 키가 아니라 process의
`OPENROUTER_VIDEO_API_KEY` 또는 `OPENROUTER_API_KEY`를 다시 읽는다. DB 암호화 키를 설정했더라도
전체 video pipeline을 안정적으로 사용하려면 공용 또는 영상 전용 키를 루트 `.env`에 유지한다.

### 5.4 설정 암호화 키

`SETTINGS_ENCRYPTION_KEY`는 `/api/v1/settings`를 통해 provider key를 DB에 암호화 저장할 때
필요하다. 환경변수 fallback만 쓰는 로컬 Studio에는 없어도 되지만, 해당 settings API는 key가
없으면 동작하지 않는다. `/settings/prompts`의 프롬프트 버전 기능과는 별개의 설정이다.

새 Fernet key 생성:

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
~~~

출력값을 루트 `.env`의 `SETTINGS_ENCRYPTION_KEY`에 한 번 저장하고 외부 secret manager에도
안전하게 백업한다. DB에 암호화된 provider key가 있는 상태에서 이 값을 바꾸거나 잃으면 기존 값을
복호화할 수 없다.

### 5.5 Backend 환경변수 전체 표

#### Provider와 모델

| 변수 | 필수 여부 | 기본값·설명 |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | 전체 생성에는 필수 | script·TTS·video 공용 fallback |
| `OPENROUTER_SCRIPT_API_KEY` | 선택 | 스크립트 전용 키 |
| `OPENROUTER_TTS_API_KEY` | 선택 | TTS 전용 키 |
| `OPENROUTER_VIDEO_API_KEY` | 선택 | 영상 전용 키 |
| `OPENROUTER_SCRIPT_MODEL` | 선택 | `openai/gpt-5.4-mini` |
| `OPENROUTER_FALLBACK_MODEL` | 선택 | 미설정 시 script model과 동일 |
| `OPENROUTER_API_URL` | 선택 | `https://openrouter.ai/api/v1/chat/completions`. 사설 gateway가 아니면 변경하지 않음 |
| `OPENROUTER_TTS_MODEL` | 선택 | `google/gemini-3.1-flash-tts-preview` |
| `OPENROUTER_TTS_VOICE` | 선택 | `Aoede` |
| `GOOGLE_TTS_LANGUAGE_CODE` | 선택 | `ko-KR` |
| `GOOGLE_TTS_SYLLABLES_PER_SECOND` | 선택 | `4.5`, 음성 길이 예측 기준 |
| `OPENROUTER_VIDEO_MODEL` | 선택 | `bytedance/seedance-2.0` |
| `OPENROUTER_VIDEO_API_URL` | 선택 | `https://openrouter.ai/api/v1/videos` |
| `OPENROUTER_VIDEO_SUPPORTED_DURATIONS` | 선택 | 기본 `4`부터 `15`까지 쉼표 구분 정수 |

Model ID는 provider catalog에서 현재 계정이 실제로 사용할 수 있는지 확인해야 한다. 이름만 바꾸면
9:16, 1080p, exact duration 또는 identity reference 지원이 생기는 것이 아니다.

#### 견적과 비용 표시

| 변수 | 기본값 | 제약 |
| --- | --- | --- |
| `VIDEO_RATE_PER_SECOND_USD` | `0.38` | 0보다 큰 숫자 |
| `VIDEO_QUOTE_MIN_FACTOR` | `0.95` | 0보다 크고 1 이하 |
| `VIDEO_QUOTE_MAX_FACTOR` | `1.10` | 1 이상 |

이 값은 Studio의 `video_only` 예상 견적을 계산한다. Provider 계정의 실제 결제 hard cap이나
script·TTS·render·storage 총원가가 아니다.

#### 이미지와 접근 제어

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `CORS_ORIGINS` | `http://localhost:3000` | 쉼표 구분. `*` 항목은 코드에서 제외됨 |
| `ALLOWED_IMAGE_HOSTS` | 빈 값 | 설정 시 exact host 또는 `*.trusted.example` 형식만 허용 |
| `INFLUENCER_REFERENCE_URLS` | 빈 값 | 쉼표 구분 인물 fallback. 동의·검수된 배포가 아니면 비워 둠 |

Backend는 원격 이미지의 공개 HTTPS, SSRF, 크기, codec, 해상도와 reference 종횡비를 검사한다.
인물 동의, 사용 권리, 상품 의미를 자동 판별하지는 않는다.

#### DB, 파일과 암호화

| 변수 | 기본값·현재 통합 실행 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | direct Backend 기본 `sqlite:///./quedot.local.db` | 통합 script는 `backend/runtime/quedot-production.db`로 강제 override |
| `SETTINGS_ENCRYPTION_KEY` | 빈 값 | DB provider 설정 API를 사용할 때 필요한 Fernet key |
| `VIDEO_OUTPUT_DIR` | `runtime/videos` | 저수준 video API 결과 |
| `COMBINED_VIDEO_OUTPUT_DIR` | `runtime/combined` | 음성 결합 결과 |
| `FINAL_OUTPUT_DIR` | `runtime/final` | 후보별 최종 MP4와 file API 허용 root |
| `AWS_REGION` | `ap-northeast-2` | S3 helper 설정 |
| `S3_BUCKET_NAME` | 빈 값 | 현재 로컬 final pipeline에는 연결되지 않은 S3 helper용 |
| `AWS_ACCESS_KEY_ID` | 빈 값 | S3 helper용 secret |
| `AWS_SECRET_ACCESS_KEY` | 빈 값 | S3 helper용 secret |

현재 Studio 결과는 로컬 DB와 `backend/runtime/`에 저장된다. S3 변수를 채우는 것만으로 final
artifact가 자동으로 object storage에 올라가지는 않는다.
Backend는 process 시작 시 알려진 table을 생성·보정하며 현재 별도 migration CLI는 없다.
공개 배포에서는 자동 보정에 의존하지 말고 versioned migration과 rollback 절차를 먼저 마련한다.

#### HyperFrames와 renderer

| 변수 | runner 기본값 | 통합 script 값 |
| --- | --- | --- |
| `HYPERFRAMES_RUNNER_URL` | Backend 기준 `http://hyperframes:8787` | `http://127.0.0.1:8788` |
| `HYPERFRAMES_RUNNER_PORT` | `8787` | `8788` |
| `HYPERFRAMES_WORKSPACE` | runner `/workspace`, Backend `/var/lib/quedot/hyperframes` | `backend/runtime/hyperframes`로 통일 |
| `HYPERFRAMES_RENDER_QUALITY` | `high` | `high` |
| `HYPERFRAMES_VIDEO_BITRATE` | `10M` | `10M` |

통합 script는 Chrome과 HyperFrames CLI를 위해 다음 값도 직접 관리한다.

- `HYPERFRAMES_BROWSER_PATH`
- `PUPPETEER_EXECUTABLE_PATH`
- `PRODUCER_HEADLESS_SHELL_PATH`
- `HYPERFRAMES_NO_UPDATE_CHECK=1`
- `HYPERFRAMES_NO_TELEMETRY=1`

### 5.6 환경변수가 아닌 DB·코드 설정

다음 값은 `.env`가 아니라 `/api/v1/settings`와 DB의 global settings에 저장된다.

| 설정 | 기본값 | 현재 적용 범위 |
| --- | --- | --- |
| 영상 최소·최대 해상도 | `1080p` / `1080p` | provider 요청 해상도 선택 |
| 영상 최대 길이 | 15초 | model capability·요청 검증 |
| Script retry | 4 | script 생성 retry 정책 |
| Video retry | 2 | direct `/api/v1/reels/video`에만 적용. Studio `/generate` 후보는 0회 |
| Media combine retry | 3 | 현재 DB 저장·API 노출만 되고 runtime 소비자에는 미연결 |
| 원본 영상 audio mute | true | 현재 DB 저장·API 노출만 되고 runtime 결합 동작에는 미연결 |

미연결 설정 두 개는 값을 바꿔도 실제 결합 재시도나 원본 오디오 처리 방식이 바뀌지 않는다.
운영 제어로 노출하기 전에 runtime 연결과 회귀 테스트를 추가해야 한다.

Prompt bundle의 저장·활성화는 다시 별도의 prompt-version tables를 사용한다. 자동 기술 QC 기준인
1080×1920~2160×3840, 24fps 이상, H.264/HEVC, 2.5Mbps 이상, black frame 3% 이하와 길이
오차 ±0.25초도 현재 환경변수가 아니라 코드 정책이다.

### 5.7 Docker Compose 전용 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `POSTGRES_USER` | `postgres` | DB 사용자 |
| `POSTGRES_PASSWORD` | `postgres1234` fallback | 실제 운영에서는 강한 secret 사용 |
| `POSTGRES_DB` | `app_db` | DB 이름 |
| `POSTGRES_HOST_PORT` | `55432` | host loopback PostgreSQL port |
| `BACKEND_HOST_PORT` | `8000` | host loopback FastAPI port |

`POSTGRES_HOST`, `POSTGRES_PORT`는 example에 있지만 현재 Compose service 정의가 직접 사용하지
않는다. Container의 Backend `DATABASE_URL`과 `HYPERFRAMES_RUNNER_URL`은 Compose가 service
network에 맞게 override한다.

---

## 6. Frontend `.env.local`

Frontend 저장소에서 example을 복사한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/frontend"
cp .env.example .env.local
~~~

기본 내용:

~~~dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
NEXT_PUBLIC_VIDEO_MODEL_ID=bytedance/seedance-2.0
NEXT_PUBLIC_IDENTITY_REFERENCE_PRODUCTION_ENABLED=false
~~~

| 변수 | 기본값 | 주의점 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8001` | 브라우저에서 접근 가능한 Backend 주소, 끝 `/`는 제거됨 |
| `NEXT_PUBLIC_VIDEO_MODEL_ID` | `bytedance/seedance-2.0` | Backend `OPENROUTER_VIDEO_MODEL`과 일치해야 함 |
| `NEXT_PUBLIC_IDENTITY_REFERENCE_PRODUCTION_ENABLED` | false | 문자열 `true`일 때만 활성. 현재 Seedance 배포는 false 유지 |
| `NEXT_PUBLIC_INFLUENCER_REFERENCE_URLS` | 빈 값 | 선택적 공개 HTTPS URL 최대 2개, 쉼표 구분 |
| `NEXT_PUBLIC_INFLUENCER_REFERENCE_URL` | 빈 값 | 구형 단수 fallback, 새 설정에서는 복수형 사용 |

모든 `NEXT_PUBLIC_*` 값은 브라우저 JavaScript bundle에 포함된다. API key, signed URL,
비공개 인물 reference와 내부 host를 넣지 않는다. 값은 production `next build` 시 고정되므로
바꾼 뒤 `npm run start`만 재시작하지 말고 다시 build한다.

통합 script는 API 주소와 identity flag를 각각 8001과 false로 고정해 build한다. 기본이 아닌 영상
모델을 사용할 때는 `.env.local`의 model ID도 Backend와 맞춘 뒤 새 build에서 실제 반영됐는지
확인한다.

---

## 7. 의존성 설치

### 7.1 Backend

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m pip check
~~~

### 7.2 Frontend

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
npm --prefix frontend ci
~~~

`npm install` 대신 lockfile을 그대로 따르는 `npm ci`를 사용한다. 현재 package에는 `engines`,
`.nvmrc`, `packageManager` pin이 없으므로 팀 배포 전 Node 22 정책을 별도로 고정하는 것이 좋다.

### 7.3 HyperFrames

기존 통합 script는 처음 실행할 때 다음 ignored 경로에 HyperFrames `0.8.27`을 설치한다.

~~~text
backend/runtime/local-stack/hyperframes-cli/
~~~

최초 실행에는 npm registry 네트워크가 필요하다. 자동 update check와 telemetry는 실행 중
비활성화된다.

---

## 8. 실행 방법

### 8.1 기존 workspace 통합 실행 — 권장

이 방법은 상위 `tools/start_local_stack.sh`가 있는 현재 macOS workspace에서 사용한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
chmod +x tools/start_local_stack.sh
./tools/start_local_stack.sh
~~~

실행 순서:

1. 3000, 8001, 8788 port가 비었는지 확인한다.
2. 루트 `.env`와 `OPENROUTER_API_KEY` 존재 여부를 확인한다.
3. Backend venv, Frontend node_modules, macOS Chrome을 확인한다.
4. 필요한 경우 HyperFrames 0.8.27을 설치한다.
5. HyperFrames runner와 Backend를 시작하고 health를 기다린다.
6. Frontend를 Backend 8001 기준으로 production build한다.
7. Frontend를 3000에서 시작하고 readiness를 통과하면 주소를 출력한다.

~~~mermaid
sequenceDiagram
    actor Dev as 개발자
    participant Script as start_local_stack.sh
    participant HF as HyperFrames 8788
    participant API as Backend 8001
    participant FE as Frontend 3000

    Dev->>Script: 통합 실행
    Script->>Script: env·dependency·port preflight
    Script->>HF: runner 시작
    Script->>API: uvicorn 시작
    Script->>HF: /health 확인
    Script->>API: /health 확인
    Script->>FE: production build와 start
    Script->>FE: readiness 확인
    FE-->>Dev: Studio 사용 가능
~~~

시작한 terminal에서 Control-C를 누르면 세 child process를 함께 종료한다.

### 8.2 Frontend 개발 모드

Backend가 8001에서 이미 실행 중이고 `frontend/.env.local`을 작성한 상태에서:

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/frontend"
npm run dev
~~~

개발 모드는 source 변경을 빠르게 반영한다. 실제 production bundle 검증은 별도로
`npm run build`와 `npm run start`를 사용한다.

### 8.3 Backend 개별 개발 모드

루트 `.env`의 모든 항목을 shell environment로 올린 뒤 실행해야 용도별 key와 모델도 적용된다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
mkdir -p runtime
set +x
set -a
source ../.env
set +a
export DATABASE_URL="sqlite:///$PWD/runtime/quedot-production.db"
export CORS_ORIGINS="http://127.0.0.1:3000,http://localhost:3000"
export HYPERFRAMES_RUNNER_URL="http://127.0.0.1:8788"
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
~~~

HyperFrames가 별도로 실행되지 않으면 script/TTS/video 이후 caption 단계에서 실패한다. Runner를
개별 실행할 때는 상위 script와 같은 workspace, browser, port 설정을 사용한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
mkdir -p runtime/local-stack runtime/hyperframes
npm install --prefix runtime/local-stack/hyperframes-cli --no-save --no-audit --no-fund hyperframes@0.8.27
export PATH="$PWD/runtime/local-stack/hyperframes-cli/node_modules/.bin:$PATH"
export HYPERFRAMES_RUNNER_PORT=8788
export HYPERFRAMES_WORKSPACE="$PWD/runtime/hyperframes"
export HYPERFRAMES_RENDER_QUALITY=high
export HYPERFRAMES_VIDEO_BITRATE=10M
export HYPERFRAMES_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export PUPPETEER_EXECUTABLE_PATH="$HYPERFRAMES_BROWSER_PATH"
export PRODUCER_HEADLESS_SHELL_PATH="$HYPERFRAMES_BROWSER_PATH"
export HYPERFRAMES_NO_UPDATE_CHECK=1
export HYPERFRAMES_NO_TELEMETRY=1
node hyperframes_runner.mjs
~~~

### 8.4 Backend Docker Compose

Docker 방식은 PostgreSQL, Backend와 HyperFrames를 container로 실행한다. Frontend는 포함하지
않으므로 host에서 별도로 실행한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
docker compose --env-file ../.env -p quedot-reels up -d --build
docker compose --env-file ../.env -p quedot-reels ps
curl -fsS http://127.0.0.1:8000/health
~~~

Docker Backend를 사용할 때 Frontend `.env.local`을 다음처럼 바꾸고 다시 build하거나 dev server를
재시작한다.

~~~dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
~~~

정상 종료:

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
docker compose --env-file ../.env -p quedot-reels down
~~~

일반 종료에서는 volume 삭제 option을 사용하지 않는다. PostgreSQL volume 삭제는 복구할 수 있는
backup을 확인한 뒤 명시적인 초기화 작업으로만 수행한다.

---

## 9. 최초 실행 확인

### 9.1 Health와 화면

#### 통합 script 또는 개별 local process

~~~bash
curl -fsS http://127.0.0.1:8788/health
curl -fsS http://127.0.0.1:8001/health
curl -fsS http://127.0.0.1:3000/ >/dev/null
~~~

브라우저에서 확인한다.

- 영상 라이브러리: `http://127.0.0.1:3000/videos`
- 새 영상 만들기: `http://127.0.0.1:3000/create`
- 프롬프트 버전: `http://127.0.0.1:3000/settings/prompts`
- Backend Swagger: `http://127.0.0.1:8001/docs`

#### Docker Backend와 host Frontend

Docker Compose의 HyperFrames 8787은 container network에만 expose되고 host에는 publish되지 않는다.
Host에서는 Backend 8000과 별도로 실행한 Frontend 3000을 확인하고, 내부 runner 상태는 Compose
health로 확인한다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
docker compose --env-file ../.env -p quedot-reels ps
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:3000/ >/dev/null
~~~

- Docker Backend Swagger: `http://127.0.0.1:8000/docs`
- Frontend `.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`

첫 확인에서는 유료 생성 버튼을 누르지 않고 다음만 점검할 수 있다.

1. 라이브러리 페이지가 오류 없이 열린다.
2. Create 화면에서 상품과 4·6·8·15초 template을 읽는다.
3. Prompt settings에서 active version을 조회한다.
4. 입력 후 견적을 발급해 provider 예상 범위를 확인한다.
5. 기존 completed job이 있으면 재생과 다운로드 endpoint를 확인한다.

견적 발급은 영상 provider 생성 요청이 아니지만 외부 catalog/credit 조회가 포함될 수 있다.
마지막 **영상 생성 시작**은 실제 비용을 발생시킬 수 있다.

### 9.2 Provider preflight

다음 명령은 OpenRouter 계정, 영상 모델 capability와 TTS catalog를 확인하지만 음성을 생성하지 않는다.
계정 잔액이 stdout과 local JSON에 기록되므로 결과를 외부 공유하지 않는다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
backend/.venv/bin/python tools/provider_preflight.py
~~~

현재 이 도구는 `.env`의 model override를 읽어 검사하지 않고 Seedance 2.0과 Gemini TTS model ID를
내부 상수로 확인한다. 따라서 green 결과는 그 두 기준 모델의 증거일 뿐,
`OPENROUTER_VIDEO_MODEL`이나 `OPENROUTER_TTS_MODEL`로 바꾼 모델의 사용 가능성 증거가 아니다.
Override한 모델은 provider catalog 응답과 실제 최소 canary를 별도로 검증한다.

`--tts`를 붙이면 실제 소액 TTS 요청이 발생한다. 비용 승인 없이 사용하지 않는다.

---

## 10. 비용 발생 여부가 다른 명령

| 동작 | 외부 네트워크 | Provider 과금 가능성 | 결과 |
| --- | --- | --- | --- |
| Backend unit test | 없음 또는 mock | 없음 | 코드 검증 |
| Frontend lint·typecheck·contract test·build | package 설치 후 로컬 | 없음 | 코드·bundle 검증 |
| `/health` 조회 | 로컬 | 없음 | process 상태 |
| `provider_preflight.py` | 있음 | 기본 실행은 생성 과금 없음 | credit·catalog local report |
| `provider_preflight.py --tts` | 있음 | **있음** | 실제 한국어 음성 생성 |
| `run_production_smoke.py` 기본 | credit 조회와 local API | 영상 생성 없음 | dry-run report |
| `run_production_smoke.py --submit-paid` | 있음 | **있음** | 실제 script/video job |
| `run_model_reference_smoke.py --submit-paid` | 있음 | **있음** | 실제 reference 영상 job |
| Studio의 영상 생성 시작 | 있음 | **있음** | 비동기 생성 job |
| Candidate retry API | 있음 | 조건 충족 시 **있음** | 실패 후보 재생성 |
| Direct `POST /api/v1/reels/video` | 있음 | **요청 1회에 기본 최대 3회 생성 가능** | 검증 실패 시 기본 2회 자동 재시도 |
| `capture_production_result.py` | credit와 기존 local job 조회 | 새 생성 없음 | 기존 terminal job 증거 |

Dry-run도 account credit 값을 읽어 local `test-data/generated`에 남길 수 있다. 그 폴더 전체를
외부에 올리지 않는다.

Studio가 쓰는 `POST /api/v1/reels/generate`는 후보별 자동 유료 재시도를 0으로 고정하고, 실패 후보는
명시적인 retry API로만 다시 요청한다. 반면 direct `/video` route는 DB 설정이 없을 때
`video_generation_retries=2`를 적용하므로 최초 요청까지 합쳐 최대 3개의 provider 생성 비용이 생길
수 있다. 운영 UI 밖에서 direct route를 호출할 때는 이 차이를 비용 승인에 포함한다.

---

## 11. 코드 검증

### 11.1 Backend

다음 회귀 테스트는 provider 호출을 mock하며 유료 생성을 수행하지 않는다.

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app tests
.venv/bin/python -m pip check
git diff --check
~~~

### 11.2 Frontend

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/frontend"
npm run test:contracts
npm run lint
npx --no-install tsc --noEmit
npm run build
git diff --check
~~~

현재 `npm test`와 `npm run typecheck` script는 없다. Contract test는
`npm run test:contracts`, 타입 검사는 local TypeScript를 쓰는 위 명령을 사용한다.

### 11.3 검증 순서

~~~mermaid
flowchart LR
    ENV["환경변수 이름·비밀 분리"] --> UNIT["Backend regression"]
    UNIT --> FE["Frontend contract·lint·typecheck"]
    FE --> BUILD["Production build"]
    BUILD --> HEALTH["세 process health"]
    HEALTH --> BROWSER["무료 browser smoke"]
    BROWSER --> APPROVE{"유료 canary 승인?"}
    APPROVE -- "아니오" --> STOP["여기서 종료"]
    APPROVE -- "예" --> PAID["최소 길이·후보 1개 canary"]
    PAID --> HUMAN["기술 QC와 사람 검수"]
~~~

Local test 통과, health 200과 유효한 MP4는 공개 Production 승인과 다르다.

---

## 12. 로그와 runtime 파일

통합 script 로그:

~~~text
backend/runtime/local-stack/backend.log
backend/runtime/local-stack/frontend.log
backend/runtime/local-stack/hyperframes.log
~~~

확인 예시:

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}"
tail -n 200 backend/runtime/local-stack/backend.log
tail -n 200 backend/runtime/local-stack/frontend.log
tail -n 200 backend/runtime/local-stack/hyperframes.log
~~~

주요 local runtime:

| 경로 | 내용 | Git |
| --- | --- | --- |
| `backend/runtime/quedot-production.db` | 통합 실행 SQLite | 제외 |
| `backend/runtime/tts/` | narration과 중간 음성 | 제외 |
| `backend/runtime/videos/` | 원본 영상 다운로드 | 제외 |
| `backend/runtime/combined/` | 음성 결합 MP4 | 제외 |
| `backend/runtime/hyperframes/` | composition 입력·렌더 결과 | 제외 |
| `backend/runtime/final/` | 후보별 최종 MP4 | 제외 |
| `test-data/generated/` | 감사·smoke evidence | 제외 또는 로컬 전용 정책 |

로그를 공유하기 전에 API key, Authorization header, signed URL, 인물 reference URL, private request
payload와 account balance가 없는지 확인한다.

Docker 로그:

~~~bash
cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}/backend"
docker compose --env-file ../.env -p quedot-reels logs --tail 200 web hyperframes db
~~~

---

## 13. 종료, 백업과 복구

### 13.1 안전한 종료

- 통합 실행 terminal: Control-C
- Frontend·Backend 개별 개발 terminal: 각각 Control-C
- Docker: `docker compose ... down`
- 종료 전에 PROCESSING job이 없는지 `/videos`에서 확인한다.

현재 worker는 FastAPI process 내부 BackgroundTasks다. 브라우저 종료는 job을 중단하지 않지만
Backend process 종료·재시작은 실행 중 Python task의 자동 재개를 보장하지 않는다.

### 13.2 로컬 SQLite와 artifact 백업

Backend를 정상 종료하고 PROCESSING job이 없음을 확인한 뒤 DB와 artifact를 같은 시점의 한 묶음으로
보존한다. Backup 목적지는 workspace 밖에 미리 만든 암호화된 volume 또는 접근 통제된 저장소를 지정한다.
루트 `.env`는 아래 묶음에 복사하지 말고 별도 secret manager에서 version과 복구 권한을 관리한다.
특히 `SETTINGS_ENCRYPTION_KEY`는 이 DB와 같은 version을 복구할 수 있어야 한다.
아래 기본 runbook은 `runtime/videos`, `runtime/combined`, `runtime/final` 저장 경로만 지원하며,
custom output 경로가 설정돼 있으면 누락을 피하기 위해 즉시 중단한다.

~~~bash
# 반드시 reels-george 밖의 실제 절대 경로로 바꾼다.
export QUEDOT_BACKUP_ROOT="/절대/경로/quedot-backups"
# Secret manager version 또는 승인된 환경설정 snapshot ID를 기록한다.
export QUEDOT_ENV_CONFIG_VERSION="<config-version>"

(
  set -Eeuo pipefail
  umask 077

  workspace_real="$(cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}" && pwd -P)"
  test -n "${QUEDOT_ENV_CONFIG_VERSION:?QUEDOT_ENV_CONFIG_VERSION을 설정하세요}"
  test "$QUEDOT_ENV_CONFIG_VERSION" != "<config-version>"
  test -d "${QUEDOT_BACKUP_ROOT:?QUEDOT_BACKUP_ROOT를 설정하세요}"
  backup_root_real="$(cd "$QUEDOT_BACKUP_ROOT" && pwd -P)"
  test "$backup_root_real" != "/"
  case "$backup_root_real/" in
    "$workspace_real/"*) echo "backup은 실제 workspace 밖에 두세요" >&2; exit 1 ;;
  esac

  cd "$workspace_real"
  test -f backend/runtime/quedot-production.db
  test -d tools
  test -f .env
  if ! (
    set +x
    set -a
    source .env
    set +a
    test "${VIDEO_OUTPUT_DIR:-runtime/videos}" = runtime/videos &&
    test "${COMBINED_VIDEO_OUTPUT_DIR:-runtime/combined}" = runtime/combined &&
    test "${FINAL_OUTPUT_DIR:-runtime/final}" = runtime/final
  ); then
    echo "custom output 경로는 별도 감사된 backup profile이 필요합니다." >&2
    exit 1
  fi
  frontend_head="$(git -C frontend rev-parse --verify HEAD)"
  backend_head="$(git -C backend rev-parse --verify HEAD)"
  frontend_status="$(git -C frontend status --porcelain --untracked-files=all)"
  backend_status="$(git -C backend status --porcelain --untracked-files=all)"
  if [[ -n "$frontend_status" || -n "$backend_status" ]]; then
    echo "Frontend 또는 Backend가 dirty입니다. 먼저 승인된 commit으로 고정하세요." >&2
    exit 1
  fi

  backup_sources=(tools)
  for artifact_dir in final tts videos combined hyperframes provider-recovery; do
    [[ ! -d "backend/runtime/$artifact_dir" ]] || \
      backup_sources+=("backend/runtime/$artifact_dir")
  done
  if find "${backup_sources[@]}" -type l -print -quit | grep -q .; then
    echo "symlink가 있는 source는 별도 검수 없이 backup하지 않습니다." >&2
    exit 1
  fi

  backup_dir="$(mktemp -d "$backup_root_real/quedot-sqlite-$(date +%Y%m%d-%H%M%S).XXXXXX")"
  mkdir -p "$backup_dir/runtime" "$backup_dir/workspace-tools"
  cp backend/runtime/quedot-production.db "$backup_dir/runtime/"
  rsync -rltp tools/ "$backup_dir/workspace-tools/"
  : > "$backup_dir/included-artifacts.txt"

  for artifact_dir in final tts videos combined hyperframes provider-recovery; do
    if [[ -d "backend/runtime/$artifact_dir" ]]; then
      printf '%s\n' "$artifact_dir" >> "$backup_dir/included-artifacts.txt"
      mkdir -p "$backup_dir/runtime/$artifact_dir"
      rsync -rltp "backend/runtime/$artifact_dir/" "$backup_dir/runtime/$artifact_dir/"
    fi
  done

  {
    echo "frontend=$frontend_head"
    echo "backend=$backend_head"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "database=sqlite"
    echo "environment_config_version=$QUEDOT_ENV_CONFIG_VERSION"
  } > "$backup_dir/revisions.txt"

  cd "$backup_dir"
  find . -type f ! -name SHA256SUMS.txt -exec shasum -a 256 {} \; \
    | LC_ALL=C sort > SHA256SUMS.txt
  shasum -a 256 -c SHA256SUMS.txt
  chmod -R go-rwx .
  if find . \( \
    -perm -0040 -o -perm -0020 -o -perm -0010 -o \
    -perm -0004 -o -perm -0002 -o -perm -0001 \
  \) -print -quit | grep -q .; then
    echo "backup 권한이 소유자 전용이 아닙니다." >&2
    exit 1
  fi
  test -x workspace-tools/start_local_stack.sh
  sqlite3 runtime/quedot-production.db 'PRAGMA integrity_check;' | grep -qx ok
  printf 'backup=%s\n' "$backup_dir"
)
~~~

DB만 복사하고 final MP4를 빼거나, 파일만 복사하고 DB를 빼면 Library와 file endpoint가 서로 맞지
않을 수 있다. `runtime/local-stack/`의 설치 dependency와 log는 재생성 가능하므로 기본 묶음에서
제외한다. 상위 `tools/`는 아직 Git으로 versioning되지 않으므로 복구 묶음에 checksum과 함께
포함한다. 개인정보나 외부 reference가 든 artifact의 보존 기간과 접근 권한도 함께 적용한다.

명령은 복사·manifest·무결성·권한 검사 중 하나라도 실패하면 성공 경로를 출력하지 않는다. 출력된
고유 경로를 다음 검사에 지정한다. 기대 결과는 모든 항목 `OK`와 SQLite `ok`다.

~~~bash
export QUEDOT_BACKUP_DIR="/직전/명령이/출력한/backup-경로"
backup_real="$(cd "${QUEDOT_BACKUP_DIR:?QUEDOT_BACKUP_DIR를 설정하세요}" && pwd -P)"
(cd "$backup_real" && shasum -a 256 -c SHA256SUMS.txt)
sqlite3 "$backup_real/runtime/quedot-production.db" 'PRAGMA integrity_check;'
~~~

주기적으로 live 경로와 분리된 임시 폴더에서 복구 리허설도 수행한다. 이 단계는 현재 runtime을
덮어쓰지 않는다.

~~~bash
(
  set -Eeuo pipefail
  umask 077
  backup_real="$(cd "${QUEDOT_BACKUP_DIR:?QUEDOT_BACKUP_DIR를 설정하세요}" && pwd -P)"
  restore_test="$(mktemp -d "${TMPDIR:-/tmp}/quedot-sqlite-restore.XXXXXX")"
  rsync -rltp "$backup_real/" "$restore_test/"
  chmod -R go-rwx "$restore_test"
  (cd "$restore_test" && shasum -a 256 -c SHA256SUMS.txt)
  sqlite3 "$restore_test/runtime/quedot-production.db" 'PRAGMA integrity_check;' | grep -qx ok
  printf 'restore rehearsal=%s\n' "$restore_test"
)
~~~

실제 복구는 유지보수 시간에 모든 process를 중지한 뒤 수행한다. 먼저 manifest와 DB를 다시
검증하고, 기존 `backend/runtime`은 삭제하지 말고 별도 격리 경로로 이동한다. 그 다음 같은 backup의
DB와 artifact를 함께 복원하고 `workspace-tools/`도 상위 `tools/`로 복원한다. `rsync -rltp`와
소유자 전용 mode를 유지해 `start_local_stack.sh`의 실행 bit까지 보존한다. 해당 backup의 두 Git
revision과 환경설정 version으로 서비스를 시작하고 health, Library row 수, 대표 MP4
재생·다운로드를 확인한 뒤에만 트래픽을 연다. 리허설 임시 폴더와 격리본의 삭제는 보존 정책과
복구 승인 후 별도 작업으로 처리한다.

### 13.3 Docker PostgreSQL backup

Docker Compose 방식은 SQLite 파일 대신 PostgreSQL volume을 쓰지만 영상 artifact는 host의
`backend/runtime/` bind mount에 남는다. 먼저 새 접수를 막고 `/videos`에서 PROCESSING job이 0임을
확인하며 다른 DB writer가 없는 유지보수 창을 연다. 그 다음 web·renderer writer를 중지하고 DB와
artifact를 하나의 고유 snapshot으로 만든다. 실패 시 trap이 서비스를 다시 시작하지만 해당 backup은
성공 경로로 출력되지 않는다.

~~~bash
export QUEDOT_BACKUP_ROOT="/절대/경로/quedot-backups"
export QUEDOT_ENV_CONFIG_VERSION="<config-version>"

(
  set -Eeuo pipefail
  umask 077

  workspace_real="$(cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}" && pwd -P)"
  test -n "${QUEDOT_ENV_CONFIG_VERSION:?QUEDOT_ENV_CONFIG_VERSION을 설정하세요}"
  test "$QUEDOT_ENV_CONFIG_VERSION" != "<config-version>"
  test -d "${QUEDOT_BACKUP_ROOT:?QUEDOT_BACKUP_ROOT를 설정하세요}"
  backup_root_real="$(cd "$QUEDOT_BACKUP_ROOT" && pwd -P)"
  test "$backup_root_real" != "/"
  case "$backup_root_real/" in
    "$workspace_real/"*) echo "backup은 실제 workspace 밖에 두세요" >&2; exit 1 ;;
  esac

  frontend_head="$(git -C "$workspace_real/frontend" rev-parse --verify HEAD)"
  backend_head="$(git -C "$workspace_real/backend" rev-parse --verify HEAD)"
  frontend_status="$(git -C "$workspace_real/frontend" status --porcelain --untracked-files=all)"
  backend_status="$(git -C "$workspace_real/backend" status --porcelain --untracked-files=all)"
  if [[ -n "$frontend_status" || -n "$backend_status" ]]; then
    echo "Frontend 또는 Backend가 dirty입니다. 먼저 승인된 commit으로 고정하세요." >&2
    exit 1
  fi

  cd "$workspace_real/backend"
  test -d ../tools
  if find ../tools -type l -print -quit | grep -q .; then
    echo "tools 안의 symlink를 별도 검수해야 합니다." >&2
    exit 1
  fi
  compose_cmd=(docker compose --env-file ../.env -p quedot-reels)
  if ! "${compose_cmd[@]}" run --rm --no-deps --entrypoint sh web -c '
    test "${VIDEO_OUTPUT_DIR:-runtime/videos}" = runtime/videos &&
    test "${COMBINED_VIDEO_OUTPUT_DIR:-runtime/combined}" = runtime/combined &&
    test "${FINAL_OUTPUT_DIR:-runtime/final}" = runtime/final
  '; then
    echo "custom output 경로는 별도 감사된 backup profile이 필요합니다." >&2
    exit 1
  fi
  restart_writers() {
    original_status=$?
    trap - EXIT
    if ! "${compose_cmd[@]}" up -d web hyperframes; then
      echo "CRITICAL: backup 실패 후 web·hyperframes 자동 재시작도 실패했습니다." >&2
      echo "수동 확인: docker compose --env-file ../.env -p quedot-reels ps" >&2
    fi
    exit "$original_status"
  }
  trap restart_writers EXIT
  "${compose_cmd[@]}" stop web hyperframes

  backup_dir="$(mktemp -d "$backup_root_real/quedot-postgres-$(date +%Y%m%d-%H%M%S).XXXXXX")"
  mkdir -p "$backup_dir/runtime" "$backup_dir/workspace-tools"
  "${compose_cmd[@]}" exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/postgres.dump"
  test -s "$backup_dir/postgres.dump"
  "${compose_cmd[@]}" exec -T db pg_restore --list \
    < "$backup_dir/postgres.dump" >/dev/null

  rsync -rltp ../tools/ "$backup_dir/workspace-tools/"
  : > "$backup_dir/included-artifacts.txt"
  for artifact_dir in final tts videos combined hyperframes provider-recovery; do
    if [[ -d "runtime/$artifact_dir" ]]; then
      if find "runtime/$artifact_dir" -type l -print -quit | grep -q .; then
        echo "$artifact_dir 안의 symlink를 별도 검수해야 합니다." >&2
        exit 1
      fi
      printf '%s\n' "$artifact_dir" >> "$backup_dir/included-artifacts.txt"
      mkdir -p "$backup_dir/runtime/$artifact_dir"
      rsync -rltp "runtime/$artifact_dir/" "$backup_dir/runtime/$artifact_dir/"
    fi
  done

  {
    echo "frontend=$frontend_head"
    echo "backend=$backend_head"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "database=postgresql"
    echo "environment_config_version=$QUEDOT_ENV_CONFIG_VERSION"
  } > "$backup_dir/revisions.txt"

  (
    cd "$backup_dir"
    find . -type f ! -name SHA256SUMS.txt -exec shasum -a 256 {} \; \
      | LC_ALL=C sort > SHA256SUMS.txt
    shasum -a 256 -c SHA256SUMS.txt
    chmod -R go-rwx .
    if find . \( \
      -perm -0040 -o -perm -0020 -o -perm -0010 -o \
      -perm -0004 -o -perm -0002 -o -perm -0001 \
    \) -print -quit | grep -q .; then
      echo "backup 권한이 소유자 전용이 아닙니다." >&2
      exit 1
    fi
    test -x workspace-tools/start_local_stack.sh
  )

  "${compose_cmd[@]}" up -d web hyperframes
  backend_binding="$("${compose_cmd[@]}" port web 8000 | tail -n 1)"
  for attempt in {1..30}; do
    if curl -fsS "http://$backend_binding/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -fsS "http://$backend_binding/health" >/dev/null
  trap - EXIT
  printf 'backup=%s\n' "$backup_dir"
)
~~~

출력된 경로를 `QUEDOT_BACKUP_DIR`로 지정한 뒤 live DB와 network를 공유하지 않는 일회용 PostgreSQL
16 container와 임시 artifact 폴더에 복구한다. 이 명령은 현재 Compose DB나 runtime을 덮어쓰지 않는다.

~~~bash
export QUEDOT_BACKUP_DIR="/직전/명령이/출력한/backup-경로"

(
  set -Eeuo pipefail
  umask 077
  backup_real="$(cd "${QUEDOT_BACKUP_DIR:?QUEDOT_BACKUP_DIR를 설정하세요}" && pwd -P)"
  restore_test="$(mktemp -d "${TMPDIR:-/tmp}/quedot-postgres-restore.XXXXXX")"
  rsync -rltp "$backup_real/" "$restore_test/"
  chmod -R go-rwx "$restore_test"
  (cd "$restore_test" && shasum -a 256 -c SHA256SUMS.txt)

  restore_container="quedot-restore-$(date +%Y%m%d%H%M%S)-$$"
  restore_password="$(openssl rand -hex 24)"
  remove_restore_container() {
    docker rm -f "$restore_container" >/dev/null 2>&1 || true
  }
  trap remove_restore_container EXIT
  docker run --detach --rm --network none --name "$restore_container" \
    -e POSTGRES_PASSWORD="$restore_password" \
    -e POSTGRES_DB=quedot_restore \
    postgres:16-alpine >/dev/null

  for attempt in {1..30}; do
    if docker exec "$restore_container" pg_isready -U postgres -d quedot_restore >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker exec "$restore_container" pg_isready -U postgres -d quedot_restore >/dev/null
  docker exec -i "$restore_container" pg_restore \
    --no-owner --no-privileges -U postgres -d quedot_restore \
    < "$restore_test/postgres.dump"
  table_count="$(docker exec "$restore_container" psql -U postgres -d quedot_restore -Atc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
  test "$table_count" -gt 0

  linked_artifacts=0
  completed_job_count="$(
    docker exec "$restore_container" psql -U postgres -d quedot_restore -Atc \
      "SELECT count(*) FROM generation_jobs
       WHERE status IN ('COMPLETED', 'PARTIAL_COMPLETED');"
  )"
  stored_output_paths="$(
    docker exec "$restore_container" psql -U postgres -d quedot_restore -Atc \
      "SELECT output_path FROM generation_jobs
       WHERE status IN ('COMPLETED', 'PARTIAL_COMPLETED') AND output_path IS NOT NULL
       ORDER BY created_at DESC LIMIT 3;"
  )"
  while IFS= read -r stored_output_path; do
    [[ -n "$stored_output_path" ]] || continue
    case "$stored_output_path" in
      runtime/final/*) restored_output="$restore_test/$stored_output_path" ;;
      /app/runtime/final/*) restored_output="$restore_test/${stored_output_path#/app/}" ;;
      *) echo "지원하지 않는 output_path: $stored_output_path" >&2; exit 1 ;;
    esac
    restored_final_root="$(cd "$restore_test/runtime/final" && pwd -P)"
    restored_parent="$(cd "$(dirname "$restored_output")" && pwd -P)"
    case "$restored_parent/" in
      "$restored_final_root/"*) ;;
      *) echo "final root 밖의 output_path: $stored_output_path" >&2; exit 1 ;;
    esac
    restored_output="$restored_parent/$(basename "$restored_output")"
    test -f "$restored_output"
    ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
      -of default=noprint_wrappers=1:nokey=1 "$restored_output" | grep -q .
    linked_artifacts=$((linked_artifacts + 1))
  done <<< "$stored_output_paths"
  if [[ "$completed_job_count" -gt 0 ]]; then
    test "$linked_artifacts" -gt 0
  fi
  printf 'restore rehearsal=%s, public tables=%s, completed jobs=%s, linked MP4=%s\n' \
    "$restore_test" "$table_count" "$completed_job_count" "$linked_artifacts"
  docker stop "$restore_container" >/dev/null
  trap - EXIT
)
~~~

#### 승인된 실제 Docker 복구

다음 절차는 live DB와 runtime을 바꾸므로 장애 복구 승인, 새 접수 차단, PROCESSING job 0 확인,
해당 환경설정 version 복구를 모두 마친 뒤에만 사용한다. 현재 상태는 먼저 고유 rollback 묶음에
보존한다. 중간 실패 시 writer를 다시 열지 않으며 출력된 rollback 경로에서 수동 복구한다.

~~~bash
export QUEDOT_BACKUP_DIR="/검증을/통과한/postgres-backup-경로"
export QUEDOT_ENV_CONFIG_VERSION="<backup과-동일한-config-version>"
export QUEDOT_RESTORE_APPROVED="<승인-후-yes로-변경>"

(
  set -Eeuo pipefail
  umask 077
  test "${QUEDOT_RESTORE_APPROVED:-no}" = yes

  workspace_real="$(cd "${QUEDOT_ROOT:?QUEDOT_ROOT를 먼저 설정하세요}" && pwd -P)"
  backup_real="$(cd "${QUEDOT_BACKUP_DIR:?QUEDOT_BACKUP_DIR를 설정하세요}" && pwd -P)"
  case "$backup_real/" in
    "$workspace_real/"*) echo "복구 backup은 workspace 밖에 있어야 합니다." >&2; exit 1 ;;
  esac
  (cd "$backup_real" && shasum -a 256 -c SHA256SUMS.txt)
  test -f "$backup_real/postgres.dump"
  test -d "$backup_real/runtime"
  test -x "$backup_real/workspace-tools/start_local_stack.sh"

  expected_frontend="$(sed -n 's/^frontend=//p' "$backup_real/revisions.txt")"
  expected_backend="$(sed -n 's/^backend=//p' "$backup_real/revisions.txt")"
  expected_config="$(sed -n 's/^environment_config_version=//p' "$backup_real/revisions.txt")"
  current_frontend="$(git -C "$workspace_real/frontend" rev-parse --verify HEAD)"
  current_backend="$(git -C "$workspace_real/backend" rev-parse --verify HEAD)"
  frontend_status="$(git -C "$workspace_real/frontend" status --porcelain --untracked-files=all)"
  backend_status="$(git -C "$workspace_real/backend" status --porcelain --untracked-files=all)"
  test "$current_frontend" = "$expected_frontend"
  test "$current_backend" = "$expected_backend"
  test "${QUEDOT_ENV_CONFIG_VERSION:?환경설정 version이 필요합니다}" = "$expected_config"
  test -z "$frontend_status"
  test -z "$backend_status"

  cd "$workspace_real/backend"
  compose_cmd=(docker compose --env-file ../.env -p quedot-reels)
  if ! "${compose_cmd[@]}" run --rm --no-deps --entrypoint sh web -c '
    test "${VIDEO_OUTPUT_DIR:-runtime/videos}" = runtime/videos &&
    test "${COMBINED_VIDEO_OUTPUT_DIR:-runtime/combined}" = runtime/combined &&
    test "${FINAL_OUTPUT_DIR:-runtime/final}" = runtime/final
  '; then
    echo "custom output 경로는 이 restore runbook으로 복구하지 않습니다." >&2
    exit 1
  fi
  rollback_dir="not-created"
  restore_failed() {
    original_status=$?
    trap - EXIT
    "${compose_cmd[@]}" stop web hyperframes >/dev/null 2>&1 || \
      echo "CRITICAL: 실패 후 writer 정지도 확인이 필요합니다." >&2
    echo "CRITICAL: 복구가 완료되지 않았습니다. writer를 열지 마세요." >&2
    echo "rollback=$rollback_dir" >&2
    exit "$original_status"
  }
  trap restore_failed EXIT
  "${compose_cmd[@]}" stop web hyperframes

  rollback_parent="$(dirname "$backup_real")"
  rollback_dir="$(mktemp -d "$rollback_parent/quedot-before-restore-$(date +%Y%m%d-%H%M%S).XXXXXX")"
  mkdir -p "$rollback_dir/runtime"
  "${compose_cmd[@]}" exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    > "$rollback_dir/postgres-before-restore.dump"
  test -s "$rollback_dir/postgres-before-restore.dump"
  "${compose_cmd[@]}" exec -T db pg_restore --list \
    < "$rollback_dir/postgres-before-restore.dump" >/dev/null

  for artifact_dir in final tts videos combined hyperframes provider-recovery; do
    if [[ -d "runtime/$artifact_dir" ]]; then
      mv "runtime/$artifact_dir" "$rollback_dir/runtime/$artifact_dir"
    fi
  done
  mv ../tools "$rollback_dir/workspace-tools"
  {
    echo "frontend=$current_frontend"
    echo "backend=$current_backend"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "environment_config_version=$QUEDOT_ENV_CONFIG_VERSION"
  } > "$rollback_dir/revisions.txt"
  (
    cd "$rollback_dir"
    find . -type f ! -name SHA256SUMS.txt -exec shasum -a 256 {} \; \
      | LC_ALL=C sort > SHA256SUMS.txt
    chmod -R go-rwx .
    shasum -a 256 -c SHA256SUMS.txt
  )

  mkdir -p runtime ../tools
  rsync -rltp "$backup_real/runtime/" runtime/
  rsync -rltp "$backup_real/workspace-tools/" ../tools/
  test -x ../tools/start_local_stack.sh
  "${compose_cmd[@]}" exec -T db sh -c \
    'pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < "$backup_real/postgres.dump"

  "${compose_cmd[@]}" up -d web hyperframes
  backend_binding="$("${compose_cmd[@]}" port web 8000 | tail -n 1)"
  for attempt in {1..30}; do
    if curl -fsS "http://$backend_binding/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -fsS "http://$backend_binding/health" >/dev/null
  completed_job_count="$("${compose_cmd[@]}" exec -T db sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' sh \
    "SELECT count(*) FROM generation_jobs
     WHERE status IN ('COMPLETED', 'PARTIAL_COMPLETED');")"
  representative_job="$("${compose_cmd[@]}" exec -T db sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' sh \
    "SELECT job_id FROM generation_jobs
     WHERE status IN ('COMPLETED', 'PARTIAL_COMPLETED') AND output_path IS NOT NULL
     ORDER BY created_at DESC LIMIT 1;")"
  if [[ "$completed_job_count" -gt 0 ]]; then
    test -n "$representative_job"
  fi
  if [[ -n "$representative_job" ]]; then
    curl -fsS "http://$backend_binding/api/v1/reels/generate/$representative_job" >/dev/null
    curl -fsS --range 0-1023 \
      "http://$backend_binding/api/v1/reels/generate/$representative_job/file" >/dev/null
  fi

  trap - EXIT
  printf 'restore completed; rollback=%s\n' "$rollback_dir"
)
~~~

복구 후 Library row와 대표 영상을 사람이 다시 검수하기 전에는 새 접수를 열지 않는다. Rollback
묶음은 별도 승인 전까지 삭제하지 않는다. 완료 작업이 전혀 없는 초기 DB만 `linked MP4=0`과
대표 file smoke 생략을 허용한다. 완료 또는 부분 완료 작업이 하나라도 있으면 DB의 final path와
복원 MP4, 실제 file endpoint가 모두 성공해야 한다. `docker compose down -v`는 volume을 삭제하므로
검증된 backup과 명시적 초기화 승인 없는 정상 운영에서는 사용하지 않는다.

### 13.4 `.env` 변경 후 재시작 범위

| 변경 | 필요한 작업 |
| --- | --- |
| Backend key·model·TTS·quote·CORS | Backend 재시작. 통합 방식이면 stack 전체 재시작 |
| `NEXT_PUBLIC_*` 개발 모드 | Next dev server 재시작 |
| `NEXT_PUBLIC_*` production | 새 `npm run build` 후 start |
| Prompt 본문·활성 버전 | UI에서 저장·활성화, process 재시작 불필요 |
| `SETTINGS_ENCRYPTION_KEY` | 기존 DB 암호화 값과 반드시 같은 key 유지 |

---

## 14. 비공개 test-data 사용 규칙

`test-data/`에는 사용자 제공 상품 JSON, 외부 이미지 URL, 인물 reference, 계정·provider 검사 결과,
생성 영상과 검수 evidence가 있다.

- Git commit, 공개 bucket 업로드, 공개 링크 생성 금지
- 원본의 외부 공유·재배포 조건 확인
- 인물 reference는 명시적 사용 동의와 provider consent 절차가 없으면 유료 생성 금지
- 외부 hotlink는 영구 입력 자산으로 신뢰하지 않음
- 실제 Production은 권한 있는 object storage로 수집하고 checksum·retention을 관리
- 새로운 개발자에게는 private fixture 대신 별도 synthetic fixture 제공

`tools/audit_assets.py`는 원격 이미지 선두 byte를 내려받아 기술 상태를 확인한다. 제3자 host에
네트워크 요청을 보내므로 데이터 소유권과 접근 정책을 확인한 환경에서만 실행한다.

---

## 15. 자주 발생하는 설치·실행 오류

| 증상 | 가능한 원인 | 확인·조치 |
| --- | --- | --- |
| `Missing .../.env` | 루트 `.env` 없음 | `backend/.env.example`을 루트 `.env`로 복사 후 로컬 값 입력 |
| `OPENROUTER_API_KEY is empty` | 공용 key가 비었음 | 값 존재만 확인하고 실제 key는 출력하지 않음 |
| `Missing backend/.venv` | Python 환경 미설치 | 7.1 명령으로 venv와 requirements 설치 |
| `Missing frontend/node_modules` | npm dependency 미설치 | `npm --prefix frontend ci` |
| Chrome required | 고정 macOS 경로에 Chrome 없음 | Chrome 설치 또는 Docker HyperFrames 사용 |
| Port already in use | 3000·8001·8788 기존 process | `lsof -nP -iTCP:PORT -sTCP:LISTEN`으로 소유 process 확인 |
| Frontend에서 API 연결 실패 | Backend 미실행·주소 불일치 | health, `NEXT_PUBLIC_API_BASE_URL`, 8000/8001 구분 확인 |
| Browser CORS 오류 | `localhost`와 `127.0.0.1` origin 불일치 | 실제 Frontend origin을 `CORS_ORIGINS`에 정확히 추가 후 Backend 재시작 |
| env 변경이 반영되지 않음 | process 또는 production bundle이 이전 값 사용 | Backend 재시작, Frontend production rebuild |
| 지정 모델이 비활성 | flag false 또는 capability 미검증 | 현재는 false 유지. 이름만 보고 true로 바꾸지 않음 |
| 영상 모델을 찾지 못함 | key·계정 catalog·model ID 불일치 | provider preflight와 Backend/Frontend model ID 확인 |
| Image validation 실패 | HTTPS, 공개 IP, host allowlist, 크기·format 문제 | 직접 이미지 URL과 `ALLOWED_IMAGE_HOSTS` 확인 |
| Caption 단계 실패 | HyperFrames health·workspace·Chrome 문제 | 8788 health와 `hyperframes.log` 확인 |
| Prompt settings API 500 | 암호화 provider settings API와 혼동 또는 Fernet key 문제 | `/settings/prompts`와 `/api/v1/settings`를 구분하고 encryption key 확인 |
| 기존 DB key 복호화 실패 | `SETTINGS_ENCRYPTION_KEY` 변경 | 원래 key 복구. 새 key로는 기존 암호문을 읽을 수 없음 |
| PROCESSING에서 멈춤 | Backend가 재시작됐거나 provider operation 복구 경계 부족 | 중복 생성하지 말고 job·provider 상태와 로그 확인 |

서비스 내부 오류 코드와 idempotency 복구는
[서비스 사용 가이드의 오류 대응](./service-user-guide.ko.md#11-오류-상황별-대응)을 따른다.

---

## 16. 공개 Production 배포 전에 필요한 것

현재 구성을 인터넷에 그대로 노출하지 않는다. 최소한 다음이 완료되어야 한다.

- 두 저장소와 상위 orchestration 도구의 versioned release·재현 가능한 dependency lock
- 사용자 인증, tenant/owner별 job·file scope
- Prompt 관리자 RBAC, CSRF, rate limit, actor audit
- 사용자별 동시 job 제한과 abuse control
- Durable queue, transactional outbox, worker lease·heartbeat·dead-letter
- Provider operation locator 저장, timeout·cancel·실제 청구 reconciliation
- Object storage, signed URL, checksum, retention·삭제 정책
- Versioned DB migration과 backup·restore rehearsal
- Script·TTS·video·render·storage 전체 spend ledger와 hard cap
- API key, signed URL, 인물 reference, private payload 로그 redaction
- 한국어 word-level alignment, 상품·얼굴·손·광고 문구 human approval
- Production health, metric, alert, rollback과 최소 canary 증거

모든 gate가 통과하기 전 판정은 **Public Production NO-GO**다.

---

## 17. 복사해서 쓰는 로컬 설치 체크리스트

### 설치

- [ ] Frontend와 Backend가 형제 폴더인지 확인했다.
- [ ] 사용할 exact branch·revision이 실제로 존재하고 checkout됐는지 확인했다.
- [ ] `QUEDOT_ROOT`를 준비된 통합 workspace의 실제 절대 경로로 설정했다.
- [ ] Python 3.12 venv와 requirements를 설치했다.
- [ ] Node 22와 `npm ci`로 Frontend를 설치했다.
- [ ] FFmpeg·ffprobe·Chrome 또는 Docker HyperFrames가 준비됐다.
- [ ] 상위 통합 script가 현재 환경에 실제로 존재하는지 확인했다.

### 환경변수

- [ ] 루트 `.env`를 만들고 권한을 제한했다.
- [ ] OpenRouter key를 출력하지 않고 configured 여부만 확인했다.
- [ ] Backend model ID와 Frontend public model ID를 일치시켰다.
- [ ] Frontend `.env.local`에 비밀값이 없음을 확인했다.
- [ ] CORS origin과 Backend port가 실제 접속 주소와 일치한다.
- [ ] Identity reference flag는 검증되지 않은 배포에서 false다.

### 실행과 검증

- [ ] HyperFrames, Backend, Frontend health를 확인했다.
- [ ] Backend regression과 Frontend contract·lint·typecheck·build를 통과했다.
- [ ] `/videos`, `/create`, `/settings/prompts`를 무료 동작으로 확인했다.
- [ ] 유료 option이 붙는 명령과 버튼을 구분했다.
- [ ] 유료 canary 전 비용 상단과 사람 검수 담당자를 승인했다.
- [ ] 종료 전 PROCESSING job과 백업 대상을 확인했다.
- [ ] 외부 backup 경로, 환경설정 version, checksum과 소유자 전용 권한을 확인했다.
- [ ] SQLite 또는 격리 PostgreSQL 복구 리허설을 통과했다.

---

## 18. 관련 문서

- [서비스 메뉴·기능별 사용 가이드](./service-user-guide.ko.md)
- [Frontend README](../README.md)
- [Studio UX 아키텍처](./studio-ux-architecture.md)
- 로컬 sibling Backend의 `README.md`
- 로컬 sibling Backend의 `docs/studio-workflow-contract.md`
