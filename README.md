# 스플랜더 웹 (Splendor Web)

보드게임 **스플랜더(Splendor)** 를 웹에서 플레이할 수 있게 만드는 프로젝트입니다.
룰·카드·토큰의 게임 데이터는 원작과 100% 동일하며, 혼자서도 즐길 수 있도록 난이도별 AI 상대를 제공합니다.
백엔드 없는 순수 프론트엔드(React + TypeScript + Vite)이며 GitHub Pages로 배포됩니다.

**▶ 플레이: https://khkim3115.github.io/splendor/**

> 상태: M0~M7 구현 완료(엔진·AI·UI·연출·모바일·접근성), M8(배포·상시 품질 장치) 진행 중. 로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md).

---

## 플레이 방법

1. 위 URL을 열면 **셋업 화면**이 나옵니다.
2. **인원**(2~4)을 고르고, 각 자리를 **사람 / AI 쉬움·보통·어려움** 중에서 선택합니다. 이름과 시드(선택)를 정할 수 있습니다.
3. **게임 시작**을 누르면 대국이 시작됩니다.
   - 매 턴 4대 행동 중 하나: **토큰 집기**(서로 다른 3색 / 같은 색 2개), **카드 구매**, **카드 예약**(황금 1개 획득), (합법 행동이 없을 때만) 자동 패스.
   - UI는 엔진의 `legalActions`/`isLegal`로만 버튼을 켜므로 **불법 수는 만들 수 없고**, 막힌 조작은 룰 문서 §번호와 함께 사유를 알려줍니다.
   - 토큰 10개 초과 시 **반납 모달**, 귀족 복수 충족 시 **귀족 선택 모달**이 강제로 열립니다.
4. 누군가 **15점**에 도달하면 그 라운드를 마치고 **결과 화면**에서 순위·동점 판정 근거·공동 승리를 보여줍니다.

- **핫시트(사람 여러 명)**: 사람↔사람 차례 전환 시 **기기 전달 오버레이**가 뜨고, 이때 화면은 다음 사람 시점으로 렌더되어 남의 비공개 예약 카드가 노출되지 않습니다.
- **이어하기**: 진행 중 자동 저장되어, 새로고침 후 셋업 화면의 **저장된 게임 불러오기**로 정확히 같은 상태를 복원합니다.
- **무르기(vs AI)**: 사람 1명 게임에서는 내 직전 결정 시점까지 되돌릴 수 있습니다.
- **접근성**: 보석은 색+도형 이중 부호화, aria-live 낭독, 키보드 포커스 순회를 지원하고 `prefers-reduced-motion`이면 연출을 끕니다.

---

## 빠른 시작 (개발)

**요구 사항**: Node.js LTS(20 이상 권장)와 npm. 그 외 사전 설치는 필요 없습니다.

```bash
git clone https://github.com/khkim3115/splendor.git
cd splendor
npm install          # 의존성 설치
npm test             # 전체 테스트 (엔진 룰·프로퍼티·골든 리플레이·AI)
npm run dev          # 개발 서버 (http://localhost:5173/splendor/)
npm run build        # 프로덕션 빌드 → dist/
npm run preview      # 빌드 산출물 로컬 서빙 (http://localhost:4173/splendor/)
```

### npm 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm run dev` | Vite 개발 서버 (HMR) |
| `npm run build` | `tsc -b` 타입체크 후 Vite 프로덕션 빌드 |
| `npm run preview` | 빌드된 `dist/`를 base `/splendor/`로 로컬 서빙 |
| `npm test` | Vitest 전체 실행 |
| `npm run test:coverage` | 커버리지 포함 실행 (엔진 라인 95% / 브랜치 90% 게이트) |
| `npm run test:watch` | 워치 모드 |
| `npm run test:e2e` | Playwright 스모크 (build 자동 선행) — 빌드+Worker+완주 회귀망 |
| `npm run typecheck` | `tsc -b` 타입체크만 |
| `npm run lint` | ESLint (경계 규칙 포함) |
| `npm run selfplay` | AI 자가대전 매트릭스 (아래 참고) |
| `npm run bench` | apply/MCTS 성능 벤치마크 |

---

## 주요 기능

- **원작과 100% 동일한 룰**: 개발 카드 90장, 귀족 타일 10장, 토큰 규칙, 인원수별 셋업까지 공식 룰북 기준. 룰 정확성은 조항별(§태그) 자동 테스트로 보장됩니다.
- **AI 대전**: 난이도 3단계 —
  - **쉬움**: 좁은 시야의 그리디(초보 상대 느낌)
  - **보통**: 2수 앞을 보는 가치 평가(캐주얼 플레이어 수준)
  - **어려움**: 시간 예산 기반 MCTS 탐색(실제로 강함). Web Worker에서 돌아 UI가 끊기지 않으며, Worker가 없거나 죽으면 **그리디 폴백**으로 게임이 계속됩니다.
- **로컬 핫시트 멀티**: 한 기기에서 2~4인 교대 플레이, 사람+AI 혼합 구성 가능.
- **한국어 UI**, CSS/SVG 오리지널 비주얼.

---

## 룰 [구현 결정] 요약

원작 룰북·FAQ가 침묵하여 구현자가 결정해야 하는 지점들의 기본값입니다. 전체 근거는 [docs/RULES.md](docs/RULES.md)의 `[구현 결정]` 표기 참조.

| 주제 | 결정 |
|---|---|
| **토큰 집기 축소** (§4.1) | 서로 다른 색이 3색 미만만 남았으면 `min(남은 색 수, 3)`개만 집도록 **강제**(엄격 해석). 자발적 소량 집기는 불가. |
| **선(先) 플레이어 저장** (§2) | 무작위로 선을 정하되 누가 선인지 명시적으로 상태에 보존 — 마지막 라운드 종료 판정(§8)에 필요. |
| **예약 정보 공개** (§4.3) | 보드의 공개 카드를 예약하면 정체는 공개 정보. 덱에서 비공개 예약한 카드는 예약자에게만 앞면으로 보임. |
| **턴 종료 처리 순서** (§6) | 행동 → 토큰 10개 검사·반납 → 귀족 판정(복수 충족 시 선택) → 15점 트리거 → 라운드 종료 검사로 **고정**. |
| **완전 동점** (§8) | 명성점과 구매 카드 수가 모두 같으면 **공동 승리** 처리. |
| **카드 고갈로 15점 미달** (§9-E/G) | 모든 카드 소진 + 진행 불능이면 현재 점수로 §8 순위 판정하여 종료. |
| **완전 교착 자동 패스** (§9-G) | 합법 행동이 공집합일 때만 자동 패스(턴 스킵). 그 외에는 패스 불가. |

---

## 문서

| 문서 | 내용 |
|---|---|
| [docs/RULES.md](docs/RULES.md) | 공식 룰북 기준 완전한 룰 정리 — 구현의 단일 기준. 경계 사례 A~O와 [구현 결정] 포함 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 최종 아키텍처 — 순수 함수형 룰 엔진, 타입/API 시그니처, UI 구조, 테스트 전략 |
| [docs/AI_DESIGN.md](docs/AI_DESIGN.md) | AI 설계 — 난이도 3단계, 평가함수, MCTS, Web Worker 통합, 자가대전 정책 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 마일스톤 M0~M8, 각각의 완료 기준(DoD) |
| [docs/rules-mapping.md](docs/rules-mapping.md) | **자동 생성물** — 룰 §조항 ↔ 테스트 대응표 (수동 편집 금지) |
| [data/cards.json](data/cards.json) | 검증된 카드 데이터 — 개발 카드 90장 + 귀족 10장 |

---

## 개발 가이드

### 설계 핵심 원칙

1. **룰 엔진은 순수 함수형 TypeScript 모듈** — React·DOM·시간·`Math.random`을 모르는 결정론적 전이 함수(`상태 + 액션 → { 새 상태, 이벤트[] }`). 같은 시드·액션 열이면 결과가 항상 같아 리플레이·undo·버그 재현이 공짜로 따라옵니다.
2. **룰 지식은 엔진에만** — UI는 `legalActions`/`isLegal` 결과로만 버튼을 켜고, AI는 마스킹된 `playerView`만 받습니다(덱 훔쳐보기 원천 차단).
3. **의존 방향 강제** — `ui → store → engine ← ai` 단방향. `engine/`·`ai/`에서 `react`/`ui`/`store` import는 ESLint가 빌드 실패로 막습니다. `Math.random`·`Date.now`는 저장소 전체 금지(명시적 예외 파일만 파일 단위 disable).

### 버그 수정 절차 (골든 리플레이) — **예외 없음**

버그를 발견하면 **먼저 실패하는 테스트부터** 만듭니다.

1. 버그를 재현하는 `(config, actions[])`를 골든 리플레이로 추가합니다 — `tests/replays/*.replay.json`에 `config`·`actions`·중간 체크포인트 해시·최종 `finalHash`를 기록.
2. `npm test`로 **실패를 먼저 확인**합니다(재현 성공 증명).
3. 엔진을 수정합니다.
4. 리플레이가 통과하는지 확인합니다. 엔진 결정론 덕분에 이 리플레이가 영구 회귀 방지망이 됩니다.

> 룰 해석 자체를 바꿀 때는 `rulesVersion`을 올리고 해당 §태그 테스트를 갱신하며, 세이브 호환성 안내 문자열을 확인합니다(ARCHITECTURE §4.1).

### §태그 테스트와 rules-mapping 게이트

룰 관련 테스트 타이틀에는 `§4.2` 같은 **§태그**를 넣습니다. 예: `it('§9-C: 3개 남은 더미에서 같은 색 2개 집기는 거부된다', ...)`.
§태그 테스트를 추가/수정하면 반드시 매핑 문서를 재생성하여 함께 커밋합니다(CI가 stale을 검출):

```bash
node scripts/gen-rules-mapping.mjs   # docs/rules-mapping.md 재생성
git add docs/rules-mapping.md
```

### AI 자가대전 (난이도 서열 검증)

엔진·AI가 순수 모듈이라 브라우저 없이 Node에서 그대로 구동됩니다. 기준: 인접 난이도 간 상위 승률 65~80%.

```bash
npm run selfplay -- --pair hard:normal --games 200 --hard-budget 150
npm run selfplay -- --pair normal:easy --games 200
npm run selfplay -- --smoke 50                 # 3~4인 혼합 스모크
npm run selfplay -- --matrix --games 200       # 인접쌍 전체
```

`--hard-budget`는 어려움 AI의 착수 예산(ms). 서열 검증엔 150ms로 충분하고, 정밀 측정은 `--hard-budget 1000`.

---

## 배포와 CI

| 워크플로 | 트리거 | 게이트 여부 | 역할 |
|---|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | PR·main push | **병합 게이트** | typecheck / lint / 전체 테스트 + 엔진 커버리지 / rules-mapping stale / build |
| [`deploy.yml`](.github/workflows/deploy.yml) | main push | 비차단 | GitHub Pages 배포(공식 Pages 액션, base `/splendor/`) |
| [`e2e.yml`](.github/workflows/e2e.yml) | PR·main push | 비차단 | Playwright 스모크 — 빌드+Worker(base 경로)+전원 AI 완주 회귀망 |
| [`ai-arena.yml`](.github/workflows/ai-arena.yml) | 주 1회(월 18:00 UTC)·수동 | 비차단 | 자가대전 매트릭스로 난이도 서열 감시, 결과를 아티팩트로 업로드 |

- **GitHub Pages 설정**: 최초 1회 저장소 **Settings → Pages → Source = "GitHub Actions"** 를 수동으로 켜야 배포가 성공합니다. 기본 `GITHUB_TOKEN`으로는 Pages 자동 활성화(`administration:write` 필요)가 불가능하므로 이 한 번의 설정은 사람이 해야 하며, 이후 main push는 자동 배포됩니다.
- **Web Worker + base 경로**: Vite가 `new Worker(new URL('./worker.ts', import.meta.url))`를 빌드 시 `/splendor/assets/worker-*.js` 절대경로로 baked-in 하므로 프로젝트 사이트 경로에서 정상 로드됩니다. 로드 실패 시 어려움 AI는 그리디로 폴백합니다(게임은 계속). 런타임 진단은 브라우저 콘솔에서 `window.__splendorAi`로 확인할 수 있습니다(`lastAlgo`, `fallbacks`).

---

## 카드 데이터 검증

`data/cards.json`은 서로 다른 출처 집합(공식 룰북·BGG 자료 / 오픈소스 구현체들의 데이터 파일)에서 **독립적으로 두 번 수집한 결과가 완전히 일치**함을 확인한 데이터입니다. 추가로 다음 구조 불변식을 전부 통과했습니다:

- 총 90장 = 1티어 40장 / 2티어 30장 / 3티어 20장, 보너스 색별 8/6/4장
- 카드 중복 없음, 티어별 점수 총합 5 / 55 / 80
- 귀족 10장 전원 3점, 요구 조건은 두 색 4+4 또는 세 색 3+3+3 패턴

---

## 저작권 안내

이 프로젝트는 팬 구현(fan implementation)이며 Space Cowboys / Marc André와 무관합니다.
원작의 일러스트·그래픽 자산은 일절 사용하지 않고, 모든 비주얼은 CSS/SVG 기반 오리지널 디자인입니다.
카드의 기능 데이터(비용/점수/보너스)만 게임 규칙으로서 동일하게 구현합니다.
